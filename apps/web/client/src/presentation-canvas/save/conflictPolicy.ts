export type SaveMode = "manual" | "autosave";
export type ConflictBlockReason = "cooldown" | "stale_blocked";
export type ConflictPolicyPhase = "normal" | "cooldown" | "stale_blocked";

export interface ConflictPolicyState {
  phase: ConflictPolicyPhase;
  conflictCount: number;
  cooldownUntilMs: number | null;
}

export const DEFAULT_CONFLICT_COOLDOWN_MS = 4_000;

export function createConflictPolicyState(): ConflictPolicyState {
  return {
    phase: "normal",
    conflictCount: 0,
    cooldownUntilMs: null,
  };
}

export function registerConflict(
  state: ConflictPolicyState,
  nowMs: number,
  cooldownMs: number = DEFAULT_CONFLICT_COOLDOWN_MS,
): ConflictPolicyState {
  const nextCount = state.conflictCount + 1;
  if (nextCount >= 2) {
    return {
      phase: "stale_blocked",
      conflictCount: nextCount,
      cooldownUntilMs: null,
    };
  }

  return {
    phase: "cooldown",
    conflictCount: nextCount,
    cooldownUntilMs: nowMs + cooldownMs,
  };
}

export function registerSaveSuccess(): ConflictPolicyState {
  return createConflictPolicyState();
}

export function releaseStaleBlock(): ConflictPolicyState {
  return createConflictPolicyState();
}

export function normalizeConflictPolicy(
  state: ConflictPolicyState,
  nowMs: number,
): ConflictPolicyState {
  if (
    state.phase === "cooldown"
    && state.cooldownUntilMs !== null
    && nowMs >= state.cooldownUntilMs
  ) {
    return {
      ...state,
      phase: "normal",
      cooldownUntilMs: null,
    };
  }

  return state;
}

export function shouldBlockSaveAttempt(
  state: ConflictPolicyState,
  saveMode: SaveMode,
  nowMs: number,
): ConflictBlockReason | null {
  const normalized = normalizeConflictPolicy(state, nowMs);
  if (saveMode === "autosave" && normalized.phase === "stale_blocked") {
    return "stale_blocked";
  }

  if (saveMode === "autosave" && normalized.phase === "cooldown") {
    return "cooldown";
  }

  return null;
}
