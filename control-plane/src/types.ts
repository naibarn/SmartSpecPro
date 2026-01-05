export type TaskStatus = "planned" | "doing" | "done" | "blocked";

export type GateCheckName = "tasks" | "tests" | "coverage" | "security";

export type GateCheckResult = {
  name: GateCheckName;
  ok: boolean;
  details: Record<string, unknown>;
};

export type GateEvaluation = {
  sessionId: string;
  ok: boolean;
  checks: GateCheckResult[];
  evaluatedAt: string; // ISO 8601
};
