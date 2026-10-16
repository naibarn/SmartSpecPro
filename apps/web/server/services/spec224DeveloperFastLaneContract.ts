export const DEVELOPER_FAST_LANE_JOB = "developer.fast_lane";
export const DEVELOPER_FAST_LANE_CONTRACT = "developer-fast-lane-v1";
/** Absolute job lifecycle bound; model and workspace authorization remain separate. */
export const DEVELOPER_FAST_LANE_DEADLINE_MS = 7 * 24 * 60 * 60 * 1_000;

export type DeveloperFastLaneRequest = {
  developerLogin: string;
  sourceRevision: string;
  task: string;
  allowedFiles: string[];
  writableFiles: string[];
  patchableFiles?: string[];
  tests: { runner: "pytest" | "vitest"; cwd: string; paths: string[]; databaseMode?: "none" | "isolated_local" };
  acceptanceCriteria: string[];
  budget?: { implementationMaxTurns: number; planMaxTurns: number; reviewMaxTurns: number; maxAttempts?: number };
  browserUat?: Record<string, unknown>;
  implementationGuidance?: string;
  scopeTtlSeconds?: number;
};
