import { beforeEach, describe, expect, it } from "vitest";
import {
  freezeAutoTeamExecutionModeSnapshot,
  isAutoTeamReadOnlyMode,
  resolveAutoTeamExecutionMode,
  shouldEnforceAutoTeamCompletionEvidence,
  shouldEnforceAutoTeamMediaJobs,
  shouldEnforceAutoTeamRouteGate,
  shouldRunAutoTeamRetentionCleanup,
  type AutoTeamRolloutFlags,
} from "../autoTeamFeatureFlags";

const FLAG_KEYS = [
  "AUTO_TEAM_CANONICAL_EXECUTION",
  "AUTO_TEAM_CANONICAL_SHADOW_MODE",
  "AUTO_TEAM_MEDIA_JOB_ENFORCEMENT",
  "AUTO_TEAM_COMPLETION_EVIDENCE_GATE",
  "AUTO_TEAM_ROLLBACK_READONLY_MODE",
  "AUTO_TEAM_RETENTION_CLEANUP",
] as const;

function setFlags(flags: Partial<Record<(typeof FLAG_KEYS)[number], string>>) {
  for (const key of FLAG_KEYS) {
    if (flags[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = flags[key]!;
    }
  }
}

beforeEach(() => {
  setFlags({});
});

describe("autoTeamFeatureFlags", () => {
  it("defaults to legacy unverified execution when rollout flags are disabled", async () => {
    const snapshot = await freezeAutoTeamExecutionModeSnapshot();

    expect(snapshot.executionMode).toBe("legacy_unverified");
    expect(snapshot.flags).toEqual({
      canonicalExecution: false,
      canonicalShadowMode: false,
      mediaJobEnforcement: false,
      completionEvidenceGate: false,
      rollbackReadonlyMode: false,
      retentionCleanup: false,
    });
    expect(resolveAutoTeamExecutionMode(snapshot.flags)).toBe("legacy_unverified");
    expect(shouldEnforceAutoTeamRouteGate(snapshot.flags)).toBe(false);
    expect(shouldEnforceAutoTeamMediaJobs(snapshot.flags)).toBe(false);
    expect(shouldEnforceAutoTeamCompletionEvidence(snapshot.flags)).toBe(false);
    expect(shouldRunAutoTeamRetentionCleanup(snapshot.flags)).toBe(false);
    expect(isAutoTeamReadOnlyMode(snapshot.flags)).toBe(false);
    expect(new Date(snapshot.frozenAt).toISOString()).toBe(snapshot.frozenAt);
  });

  it("freezes shadow, enforced, and rollback modes explicitly", async () => {
    setFlags({
      AUTO_TEAM_CANONICAL_EXECUTION: "true",
      AUTO_TEAM_CANONICAL_SHADOW_MODE: "true",
      AUTO_TEAM_MEDIA_JOB_ENFORCEMENT: "true",
      AUTO_TEAM_COMPLETION_EVIDENCE_GATE: "true",
      AUTO_TEAM_ROLLBACK_READONLY_MODE: "true",
      AUTO_TEAM_RETENTION_CLEANUP: "true",
    });

    const snapshot = await freezeAutoTeamExecutionModeSnapshot();

    expect(snapshot.executionMode).toBe("rollback_readonly");
    expect(resolveAutoTeamExecutionMode(snapshot.flags)).toBe("rollback_readonly");
    expect(shouldEnforceAutoTeamRouteGate(snapshot.flags)).toBe(false);
    expect(shouldEnforceAutoTeamMediaJobs(snapshot.flags)).toBe(false);
    expect(shouldEnforceAutoTeamCompletionEvidence(snapshot.flags)).toBe(false);
    expect(shouldRunAutoTeamRetentionCleanup(snapshot.flags)).toBe(true);
    expect(isAutoTeamReadOnlyMode(snapshot.flags)).toBe(true);

    const enforcedFlags: AutoTeamRolloutFlags = {
      canonicalExecution: true,
      canonicalShadowMode: false,
      mediaJobEnforcement: true,
      completionEvidenceGate: true,
      rollbackReadonlyMode: false,
      retentionCleanup: false,
    };
    expect(resolveAutoTeamExecutionMode(enforcedFlags)).toBe("enforced");

    const shadowFlags: AutoTeamRolloutFlags = {
      ...enforcedFlags,
      canonicalShadowMode: true,
      rollbackReadonlyMode: false,
    };
    expect(resolveAutoTeamExecutionMode(shadowFlags)).toBe("shadow");
  });
});
