export interface LeakFinding {
  commitSha: string;
  committer: string;
  committedDate: string;
  filePath: string;
  leakType: string;
  leakValue: string;
  linePreview: string;
}

export function findLeaks(
  diffText: string,
  patterns: RegExp[],
  commitSha: string,
  committer: string,
  committedDate: string
): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const diffBlocks = diffText.split(/^diff --git/m).filter(Boolean);

  for (const block of diffBlocks) {
    const fileMatch = block.match(/\+\+\+ b\/(.+)\n/);
    const filePath = fileMatch ? fileMatch[1] : "unknown";
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(block)) !== null) {
        findings.push({
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

function extractLine(block: string, index: number): string {
  const start = block.lastIndexOf("\n", index) + 1;
  const end = block.indexOf("\n", index);
  return block.slice(start, end === -1 ? undefined : end).trim();
}

