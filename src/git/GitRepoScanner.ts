import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { RepoConfig, ScanConfig, githubAuth } from "../config.js";
import ScanStateStore from "../state/ScanStateStore.js";
import { LeakFinding, findLeaks } from "../leakMatchers.js";

interface AggregateScanResult {
  findings: LeakFinding[];
  processedCommits: number;
  branchPlaceholders: Record<string, string | undefined>;
}

interface BranchScanResult {
  branch: string;
  findings: LeakFinding[];
  processedCommits: number;
  lastSha?: string;
}

export default class GitRepoScanner {
  private git!: SimpleGit;
  private workDir!: string;

  constructor(
    private readonly repoConfig: RepoConfig,
    private readonly scanConfig: ScanConfig,
    private readonly stateStore: ScanStateStore,
    private readonly auth = githubAuth
  ) {}

  async scan(): Promise<AggregateScanResult> {
    console.log("Initializing scan...");
    await this.prepareRepo();

    const aggregateFindings: LeakFinding[] = [];
    const branchPlaceholders: Record<string, string | undefined> = {};
    let totalProcessed = 0;
    const branches = await this.getBranchesToScan();

    try {
      if (branches.length === 0) {
        console.log("No branches found to scan.");
      }
      for (const branch of branches) {
        console.log(`\nScanning branch ${branch}...`);
        await this.checkoutBranch(branch);
        const result = await this.scanBranch(branch);
        aggregateFindings.push(...result.findings);
        totalProcessed += result.processedCommits;
        branchPlaceholders[branch] = result.lastSha;
      }
      console.log("Scan completed successfully.");
      return {
        findings: aggregateFindings,
        processedCommits: totalProcessed,
        branchPlaceholders
      };
    } finally {
      if (this.repoConfig.removeCloneOnExit) {
        this.cleanup();
      }
    }
  }

  private async getBranchesToScan(): Promise<string[]> {
    if (this.repoConfig.branches.length > 0) {
      return this.repoConfig.branches;
    }
    const remotes = await this.git.branch(["-r"]);
    const branches = remotes.all
      .map((name) => name.trim())
      .filter(
        (name) =>
          name.startsWith("origin/") &&
          !name.includes("->") &&
          !name.endsWith("/HEAD")
      )
      .map((name) => name.replace("origin/", ""));
    const unique = Array.from(new Set(branches));
    return unique.length > 0 ? unique : [this.repoConfig.defaultBranch];
  }

  private async hasRemoteBranch(branch: string): Promise<boolean> {
    const remotes = await this.git.branch(["-r"]);
    return remotes.all
      .map((name) => name.trim())
      .some((name) => name === `origin/${branch}`);
  }

  private async scanBranch(branch: string): Promise<BranchScanResult> {
    const branchState = this.stateStore.getBranchState(branch);
    const resumeSha =
      !this.scanConfig.forceFullScan && branchState?.incomplete
        ? branchState.lastProcessedSha
        : undefined;

    if (this.scanConfig.forceFullScan && branchState?.incomplete) {
      this.stateStore.clearBranchState(branch);
    }

    const log = await this.git.log({ "--date-order": null });
    console.log(`Loaded ${log.total} commits from ${branch}`);

    const findings: LeakFinding[] = [];
    let processed = 0;
    const max = this.repoConfig.maxCommitsPerRun ?? log.total;
    let reachedPrevious = false;
    let lastSha: string | undefined = resumeSha;
    let completedBranch = true;

    for (const commit of log.all) {
      if (processed >= max) {
        completedBranch = false;
        break;
      }
      if (resumeSha && commit.hash === resumeSha) {
        reachedPrevious = true;
        break;
      }
      const diff = await this.git.raw([
        "show",
        commit.hash,
        "--unified=0",
        "--patch"
      ]);
      const matches = findLeaks(
        diff,
        this.scanConfig.leakPatterns,
        commit.hash,
        `${commit.author_name} <${commit.author_email}>`,
        commit.date,
        branch
      );
      findings.push(...matches);
      processed++;
      lastSha = commit.hash;
      this.stateStore.saveBranchState(branch, {
        lastProcessedSha: commit.hash,
        updatedAt: new Date().toISOString(),
        incomplete: true
      });
    }

    if (completedBranch) {
      this.stateStore.clearBranchState(branch);
    }

    return {
      branch,
      findings,
      processedCommits: processed,
      lastSha: reachedPrevious ? resumeSha : lastSha
    };
  }

  private async checkoutBranch(branch: string): Promise<void> {
    try {
      await this.git.checkout(branch);
    } catch (error) {
      const remoteExists = await this.hasRemoteBranch(branch);
      if (remoteExists) {
        await this.git.checkout(["-B", branch, `origin/${branch}`]);
        return;
      }
      const err = new Error(
        `Branch "${branch}" does not exist in ${this.repoConfig.repoUrl}`
      ) as Error & { status?: number };
      err.status = 404;
      throw err;
    }
  }

  private async prepareRepo(): Promise<void> {
    this.workDir = mkdtempSync(join(tmpdir(), "repo-"));
    const cloneUrl = this.buildCloneUrl();
    this.git = simpleGit({ baseDir: this.workDir });
    console.log(`Cloning ${this.repoConfig.repoUrl} into ${this.workDir}`);
    await this.git.clone(cloneUrl, ".");
    await this.ensureDefaultBranchCheckedOut();
    await this.git.fetch();
    console.log("Clone completed, starting branch scans...");
  }

  private async ensureDefaultBranchCheckedOut(): Promise<void> {
    const preferred = this.repoConfig.defaultBranch;
    if (preferred) {
      try {
        await this.git.checkout(preferred);
        return;
      } catch (error) {
        console.warn(
          `Default branch "${preferred}" missing, trying remote HEAD fallback...`
        );
      }
    }

    const headBranch = await this.detectRemoteHeadBranch();
    if (headBranch) {
      console.log(`Remote HEAD points to ${headBranch}, checking it out.`);
      await this.git.checkout(headBranch);
      this.repoConfig.defaultBranch = headBranch;
      return;
    }

    const branches = await this.getBranchesToScan();
    if (branches.length > 0) {
      console.log(
        `Falling back to first available remote branch "${branches[0]}".`
      );
      await this.git.checkout(branches[0]);
      this.repoConfig.defaultBranch = branches[0];
      return;
    }

    throw new Error(
      `Unable to determine a valid branch for ${this.repoConfig.repoUrl}`
    );
  }

  private async detectRemoteHeadBranch(): Promise<string | undefined> {
    try {
      const head = await this.git.raw([
        "symbolic-ref",
        "refs/remotes/origin/HEAD"
      ]);
      const match = head.trim().match(/refs\/remotes\/origin\/(.+)$/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  private buildCloneUrl(): string {
    const { repoUrl } = this.repoConfig;
    if (!this.auth?.username || !this.auth?.token) {
      return repoUrl;
    }
    const [protocol, rest] = repoUrl.split("://");
    return `${protocol}://${encodeURIComponent(
      this.auth.username
    )}:${this.auth.token}@${rest}`;
  }

  private cleanup(): void {
    if (this.workDir) {
      rmSync(this.workDir, { recursive: true, force: true });
    }
  }
}

