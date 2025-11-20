# Secret Leak Scanner

Backend-only tool that clones a GitHub repository, scans commit diffs newest → oldest for AWS access secrets, and reports any findings both in the console and in `scan-findings.json`.

## Requirements

- Node.js 18+
- Git installed and on `PATH`
- (Optional) GitHub Personal Access Token if scanning private repositories

## Setup

```bash
cd C:\Code\entro-interview
npm install
```

## Environment Variables

Set these in the shell before running:

| Variable | Required | Description |
| --- | --- | --- |
| `TARGET_REPO` | ✅ | HTTPS URL of the repo to scan (e.g. `https://github.com/owner/project.git`) |
| `TARGET_BRANCH` | optional | Default branch to clone first (defaults to `main`) |
| `TARGET_BRANCHES` | optional | Comma-separated list of branches to scan (defaults to **all remote branches**) |
| `GITHUB_USERNAME` | if private | Username that owns the PAT |
| `GITHUB_PAT` | if private | PAT with `repo` scope (classic) or read access on the repo (fine-grained) |
| `SCAN_OUTPUT_FILE` | optional | Path/name for the JSON results (default `scan-findings.json`) |
| `SCAN_STATE_FILE` | optional | Path to checkpoint file (default `.scanner-state.json`) |
| `SCAN_FORCE_FULL` | optional | Set to `true` to delete the checkpoint before scanning |

PowerShell example for a single session:

```powershell
$env:TARGET_REPO = "https://github.com/owner/project.git"
$env:GITHUB_USERNAME = "yourUser"      # only if repo is private
$env:GITHUB_PAT = "ghp_xxx"            # only if repo is private
```

## Running the scan

```powershell
npm run scan
```

What happens:

1. Loads `.scanner-state.json` (or the file set in `SCAN_STATE_FILE`) only if the previous scan for a branch was interrupted. If `SCAN_FORCE_FULL=true`, any leftover checkpoint is discarded and the entire history for all branches is re-scanned.
2. Clones the repo into a temporary directory (auto-deleted after completion).
3. Iterates over each branch listed in `TARGET_BRANCHES` (or all remote branches when unset), checking out the branch and scanning its commits newest → oldest for AWS secrets.
4. Prints findings to the console and saves the full report to `scan-findings.json`.

Sample output:

```
Detected 1 potential leaks:
3578fee4 bluecat93 <user@example.com> spotifaux-backend/entro_test_file.txt
  /AKIA[0-9A-Z]{16}/g: AKIA1234567890TEST12
  snippet: +  accessKeyId: "AKIA1234567890TEST12"

Processed 8 commits. Last placeholder: d826eeed99780d272a258aab81e4676e57687e7a
Results written to scan-findings.json
```

## Interpreting results

- `scan-findings.json` contains structured data (`repo`, `processedCommits`, `branchPlaceholders`, `findings[]`).
- Each finding lists `commitSha`, `committer`, `filePath`, regex pattern, matched value, and a diff line preview.
- All commits containing the sensitive string appear, even if later commits remove it (because the scanner inspects the entire history).
- During a scan, the tool constantly updates the checkpoint with the most recently processed commit *per branch*. If a branch finishes successfully, its checkpoint is deleted so the next run starts from the beginning; if it crashes or is interrupted, that branch’s checkpoint remains so the next run resumes from the saved placeholder.

## Cleaning up

- Temporary clone directories are deleted automatically.
- The checkpoint file is deleted before every run; remove or override `SCAN_STATE_FILE` if you want resumable scans instead.

