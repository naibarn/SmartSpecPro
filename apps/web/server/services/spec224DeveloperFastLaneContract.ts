export const DEVELOPER_FAST_LANE_JOB = "developer.fast_lane";
export const DEVELOPER_FAST_LANE_CONTRACT = "developer-fast-lane-v1";

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
