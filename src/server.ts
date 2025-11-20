import express from "express";
import chalk from "chalk";
import config, { githubAuth } from "./config.js";
import GitRepoScanner from "./git/GitRepoScanner.js";
import ScanStateStore from "./state/ScanStateStore.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT ?? 3000);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/scan", async (req, res, next) => {
  try {
    const repoConfig = buildRepoConfig(req.body);
    const scanConfig = buildScanConfig(req.body);
    const authConfig = buildAuthConfig(req.body);
    const stateStore = new ScanStateStore(scanConfig.stateFile);
    const scanner = new GitRepoScanner(
      repoConfig,
      scanConfig,
      stateStore,
      authConfig
    );

    console.log(
      chalk.blue(
        `API scan requested for ${repoConfig.repoUrl} on branches: ${repoConfig.branches.join(
          ", "
        )}`
      )
    );

    const result = await scanner.scan();

    res.json({
      repo: repoConfig.repoUrl,
      branches: repoConfig.branches,
      processedCommits: result.processedCommits,
      branchPlaceholders: result.branchPlaceholders,
      findings: result.findings
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("API error:", err);
    res.status(err.status ?? 500).json({
      error: err.message ?? "Unexpected error",
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
);

app.listen(PORT, () => {
  console.log(chalk.green(`Secret scanner API is listening on port ${PORT}`));
});

function buildRepoConfig(body: any) {
  const branchesInput = body?.branches;
  let branches: string[] = [];
  if (Array.isArray(branchesInput)) {
    branches = branchesInput.map((b) => String(b).trim()).filter(Boolean);
  } else if (typeof branchesInput === "string") {
    branches = branchesInput
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return {
    ...config.repoConfig,
    repoUrl: body?.repoUrl ?? config.repoConfig.repoUrl,
    defaultBranch: body?.defaultBranch ?? config.repoConfig.defaultBranch,
    branches,
    repoName: body?.repoName ?? config.repoConfig.repoName,
    removeCloneOnExit:
      body?.removeCloneOnExit ?? config.repoConfig.removeCloneOnExit,
    maxCommitsPerRun:
      body?.maxCommitsPerRun ?? config.repoConfig.maxCommitsPerRun
  };
}

function buildScanConfig(body: any) {
  return {
    ...config.scanConfig,
    stateFile: body?.stateFile ?? config.scanConfig.stateFile,
    outputFile: body?.outputFile ?? config.scanConfig.outputFile,
    forceFullScan:
      body?.forceFullScan ?? config.scanConfig.forceFullScan
  };
}

function buildAuthConfig(body: any) {
  return {
    username: body?.githubUsername ?? githubAuth.username,
    token: body?.githubToken ?? githubAuth.token
  };
}

