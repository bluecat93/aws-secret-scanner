/**
 * Static repo-level options. These can be overridden at runtime via env vars or API payloads.
 */
export interface RepoConfig {
  repoUrl: string; // HTTPS clone URL
  defaultBranch: string; // Preferred branch to check out first
  branches: string[]; // Optional list of branches to scan (empty => auto-detect all)
  repoName: string;
  removeCloneOnExit: boolean;
  maxCommitsPerRun?: number;
}

export interface ScanConfig {
  stateFile: string;
  leakPatterns: RegExp[];
  outputFile: string;
  forceFullScan: boolean;
}

// Allow overriding the initial branch via env; default to GitHub's modern naming.
const defaultBranch = process.env.TARGET_BRANCH ?? "main";
const branchList =
  process.env.TARGET_BRANCHES?.split(",")
    .map((branch) => branch.trim())
    .filter(Boolean) ?? [];

const repoConfig: RepoConfig = {
  repoUrl: process.env.TARGET_REPO ?? "https://github.com/owner/project.git",
  defaultBranch,
  branches: branchList,
  repoName: "project",
  removeCloneOnExit: true,
  maxCommitsPerRun: 250
};

const scanConfig: ScanConfig = {
  stateFile: process.env.SCAN_STATE_FILE ?? ".scanner-state.json",
  outputFile: process.env.SCAN_OUTPUT_FILE ?? "scan-findings.json",
  forceFullScan: process.env.SCAN_FORCE_FULL === "true",
  leakPatterns: [
    /AKIA[0-9A-Z]{16}/g,
    /ASIA[0-9A-Z]{16}/g,
    /(aws_secret_access_key|aws_secret_key)\s*[:=]\s*['"]?([A-Za-z0-9\/+=]{40})/gi,
    /("accessKeyId"|\'accessKeyId\')\s*:\s*['"]AKIA[0-9A-Z]{16}['"]/g,
    /("secretAccessKey"|\'secretAccessKey\')\s*:\s*['"][A-Za-z0-9\/+=]{40}['"]/g
  ]
};

export const githubAuth = {
  username: process.env.GITHUB_USERNAME,
  token: process.env.GITHUB_PAT
};

export default { repoConfig, scanConfig, githubAuth };

