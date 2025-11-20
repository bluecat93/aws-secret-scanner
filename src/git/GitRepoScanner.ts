import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit, { SimpleGit } from "simple-git";
import { RepoConfig, ScanConfig, githubAuth } from "../config.js";
import ScanStateStore from "../state/ScanStateStore.js";
import { LeakFinding, findLeaks } from "../leakMatchers.js";

interface ScanResult {
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
    private readonly stateStore: ScanStateStore
  ) {}

  async scan(): Promise<ScanResult> {
    const state = this.stateStore.load();
    const resumeSha =
      !this.scanConfig.forceFullScan && state?.incomplete
        ? state.lastProcessedSha
        : undefined;

    if (this.scanConfig.forceFullScan && state?.incomplete) {
      this.stateStore.clear();
    }

    await this.prepareRepo();
    let completed = false;

    try {
      const log = await this.git.log({ "--date-order": null });

      const findings: LeakFinding[] = [];
      let processed = 0;
      const max = this.repoConfig.maxCommitsPerRun ?? log.total;
      let reachedPrevious = false;
      let lastSha: string | undefined = resumeSha;

      for (const commit of log.all) {
        if (processed >= max) break;
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
          commit.date
        );
        findings.push(...matches);
        processed++;
        lastSha = commit.hash;
        this.stateStore.save({
          lastProcessedSha: commit.hash,
          updatedAt: new Date().toISOString(),
          incomplete: true
        });
      }

      completed = true;
      return {
        findings,
        processedCommits: processed,
        lastSha: reachedPrevious ? resumeSha : lastSha
      };
    } finally {
      if (completed) {
        this.stateStore.clear();
      }
      if (this.repoConfig.removeCloneOnExit) {
        this.cleanup();
      }
    }
  }

  private async prepareRepo(): Promise<void> {
    this.workDir = mkdtempSync(join(tmpdir(), "repo-"));
    const cloneUrl = this.buildCloneUrl();
    this.git = simpleGit({ baseDir: this.workDir });
    await this.git.clone(cloneUrl, ".");
    await this.git.checkout(this.repoConfig.defaultBranch);
    await this.git.fetch();
  }

  private buildCloneUrl(): string {
    const { repoUrl } = this.repoConfig;
    if (!githubAuth.username || !githubAuth.token) {
      return repoUrl;
    }
    const [protocol, rest] = repoUrl.split("://");
    return `${protocol}://${encodeURIComponent(
      githubAuth.username
    )}:${githubAuth.token}@${rest}`;
  }

  private cleanup(): void {
    if (this.workDir) {
      rmSync(this.workDir, { recursive: true, force: true });
    }
  }
}

