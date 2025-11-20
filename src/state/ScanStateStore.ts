import { readFileSync, writeFileSync, existsSync, rmSync } from "fs";

export interface BranchState {
  lastProcessedSha?: string;
  updatedAt: string;
  incomplete: boolean;
}

export interface ScanState {
  branches: Record<string, BranchState>;
}

const emptyState = (): ScanState => ({ branches: {} });

export default class ScanStateStore {
  constructor(private readonly filePath: string) {}

  load(): ScanState {
    if (!existsSync(this.filePath)) return emptyState();
    return JSON.parse(readFileSync(this.filePath, "utf8")) as ScanState;
  }

  save(state: ScanState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  getBranchState(branch: string): BranchState | undefined {
    const state = this.load();
    return state.branches[branch];
  }

  saveBranchState(branch: string, branchState: BranchState): void {
    const state = this.load();
    state.branches[branch] = branchState;
    this.save(state);
  }

  clearBranchState(branch: string): void {
    const state = this.load();
    if (state.branches[branch]) {
      delete state.branches[branch];
      if (Object.keys(state.branches).length === 0) {
        this.clearAll();
      } else {
        this.save(state);
      }
    }
  }

  clearAll(): void {
    if (existsSync(this.filePath)) {
      rmSync(this.filePath, { force: true });
    }
  }
}

