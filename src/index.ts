import chalk from "chalk";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import config, { githubAuth } from "./config.js";
import GitRepoScanner from "./git/GitRepoScanner.js";
import ScanStateStore from "./state/ScanStateStore.js";

async function main() {
  if (
    config.scanConfig.forceFullScan &&
    existsSync(config.scanConfig.stateFile)
  ) {
    unlinkSync(config.scanConfig.stateFile);
  }
  const stateStore = new ScanStateStore(config.scanConfig.stateFile);
  const scanner = new GitRepoScanner(
    config.repoConfig,
    config.scanConfig,
    stateStore,
    githubAuth
  );

  console.log(chalk.blue("Launching secret scan..."));
  const result = await scanner.scan();

  if (result.findings.length === 0) {
    console.log(chalk.green("No leaks detected in scanned commits."));
  } else {
    console.log(
      chalk.yellow(`Detected ${result.findings.length} potential leaks:`)
    );
    for (const finding of result.findings) {
      console.log(
        `${chalk.cyan(finding.commitSha.slice(0, 8))} ${finding.committer} ${finding.filePath}\n  ${chalk.red(
          finding.leakType
        )}: ${finding.leakValue}\n  snippet: ${finding.linePreview}\n`
      );
    }
  }

  console.log(chalk.gray(`Processed ${result.processedCommits} commits.`));
  for (const [branch, placeholder] of Object.entries(
    result.branchPlaceholders
  )) {
    console.log(
      chalk.gray(`  ${branch}: last placeholder ${placeholder ?? "none"}`)
    );
  }

  const output = {
    repo: config.repoConfig.repoUrl,
    processedCommits: result.processedCommits,
    branchPlaceholders: result.branchPlaceholders,
    findings: result.findings
  };
  writeFileSync(config.scanConfig.outputFile, JSON.stringify(output, null, 2));
  console.log(
    chalk.gray(`Results written to ${config.scanConfig.outputFile}`)
  );
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exit(1);
});

