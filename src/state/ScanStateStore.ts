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

  /**
   * Loads the entire checkpoint file (or initializes an empty structure).
   */
  load(): ScanState {
    if (!existsSync(this.filePath)) return emptyState();
    return JSON.parse(readFileSync(this.filePath, "utf8")) as ScanState;
  }

  save(state: ScanState): void {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  /**
   * Retrieves the persisted state for a specific branch.
   */
  getBranchState(branch: string): BranchState | undefined {
    const state = this.load();
    return state.branches[branch];
  }

  /**
   * Persists the latest state for a branch immediately (no batching).
   */
  saveBranchState(branch: string, branchState: BranchState): void {
    const state = this.load();
    state.branches[branch] = branchState;
    this.save(state);
  }

  /**
   * Removes a branch entry when that branch finished scanning successfully.
   */
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

  /**
   * Wipes the entire checkpoint file.
   */
  clearAll(): void {
    if (existsSync(this.filePath)) {
      rmSync(this.filePath, { force: true });
    }
  }
}

