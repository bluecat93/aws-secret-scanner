import { readFileSync, writeFileSync, existsSync, rmSync } from "fs";

export interface ScanState {
  lastProcessedSha?: string;
  updatedAt: string;
  incomplete: boolean;
}

export default class ScanStateStore {
  constructor(private readonly filePath: string) {}

  load(): ScanState | undefined {
    if (!existsSync(this.filePath)) return undefined;
    return JSON.parse(readFileSync(this.filePath, "utf8"));
  }

  save(state: ScanState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      rmSync(this.filePath, { force: true });
    }
  }
}

