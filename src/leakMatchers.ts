/**
 * Rich metadata returned for every detected leak.
 */
export interface LeakFinding {
  branch: string;
  commitSha: string;
  committer: string;
  committedDate: string;
  filePath: string;
  leakType: string;
  leakValue: string;
  linePreview: string;
}

/**
 * Finds all matches of the configured regex patterns inside a commit diff.
 */
export function findLeaks(
  diffText: string,
  patterns: RegExp[],
  commitSha: string,
  committer: string,
  committedDate: string,
  branch: string
): LeakFinding[] {
  const findings: LeakFinding[] = [];
  // Split by file diff to keep matches localized.
  const diffBlocks = diffText.split(/^diff --git/m).filter(Boolean);

  for (const block of diffBlocks) {
    const fileMatch = block.match(/\+\+\+ b\/(.+)\n/);
    const filePath = fileMatch ? fileMatch[1] : "unknown";
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(block)) !== null) {
        findings.push({
          branch,
          commitSha,
          committer,
          committedDate,
          filePath,
          leakType: pattern.toString(),
          leakValue: match[0],
          linePreview: extractLine(block, match.index)
        });
      }
    }
  }
  return findings;
}

/**
 * Returns the exact diff line containing a match for better UX.
 */
function extractLine(block: string, index: number): string {
  const start = block.lastIndexOf("\n", index) + 1;
  const end = block.indexOf("\n", index);
  return block.slice(start, end === -1 ? undefined : end).trim();
}

