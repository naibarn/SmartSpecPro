import { describe, expect, it } from "vitest";
import {
  advanceMiniAppFactoryDurableState,
  createMiniAppFactoryDurableState,
  failMiniAppFactoryDurableState,
  parseMiniAppFactoryDurableState,
} from "./miniAppFactoryDurableState";

describe("Mini App Factory durable state projection", () => {
  it("persists stable program and app identity with stage, artifact, and next-stage state", () => {
    const initial = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_research_notes",
      sourceSha: "a".repeat(40),
    });
    const afterSpec = advanceMiniAppFactoryDurableState(initial, {
      stageId: "SPEC",
      artifacts: ["factory-evidence:spec"],
      nextEligibleStages: ["SCAFFOLD"],
    });
    const restored = parseMiniAppFactoryDurableState(JSON.parse(JSON.stringify(afterSpec)));
    expect(restored).toMatchObject({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_research_notes",
      currentStage: "SPEC",
      completedStages: ["SPEC"],
      artifacts: ["factory-evidence:spec"],
      sourceSha: null,
      nextEligibleStages: ["SCAFFOLD"],
    });
  });

  it("captures package, migration, and deployment progression from completed stages", () => {
    let state = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_research_notes",
      sourceSha: "b".repeat(40),
    });
    state = advanceMiniAppFactoryDurableState(state, {
      stageId: "package",
      artifacts: ["package-digest:spaas-package-v1:sha256:" + "c".repeat(64)],
      nextEligibleStages: ["deploy"],
    });
    state = advanceMiniAppFactoryDurableState(state, { stageId: "deploy", artifacts: [], nextEligibleStages: ["migrate"] });
    state = advanceMiniAppFactoryDurableState(state, { stageId: "migrate", artifacts: [], nextEligibleStages: [] });
    expect(state.packageDigest).toBe("spaas-package-v1:sha256:" + "c".repeat(64));
    expect(state.deploymentState).toBe("DEPLOYED");
    expect(state.migrationState).toBe("APPLIED");
  });

  it("keeps the core runtime revision out of the personal app source identity", () => {
    const personal = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_personal_expenses",
      sourceSha: "9".repeat(40),
      profile: "PERSONAL_MINIAPP",
    });
    expect(personal.sourceSha).toBeNull();
    const withSource = advanceMiniAppFactoryDurableState(personal, {
      stageId: "ui_implementation",
      artifacts: [`app-source-digest:${"8".repeat(64)}`],
      nextEligibleStages: ["package"],
    });
    expect(withSource.appSourceDigest).toBe("8".repeat(64));
  });

  it("records trial readiness separately from release and platform certification", () => {
    const initial = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_personal_expenses",
      sourceSha: "e".repeat(40),
    });
    const ready = advanceMiniAppFactoryDurableState(initial, {
      stageId: "trial_ready",
      artifacts: ["journey:primary-flow-pass", "known-issues:secondary-deferred"],
      nextEligibleStages: [],
      deliveryMilestone: "USER_TRIAL_READY",
    });
    expect(ready.profile).toBe("PERSONAL_MINIAPP");
    expect(ready.deliveryMilestone).toBe("USER_TRIAL_READY");
    expect(ready.deliveryMilestone).not.toBe("RELEASE_VERIFIED");
    expect(ready.deliveryMilestone).not.toBe("PLATFORM_CERTIFIED");
  });

  it("exposes preview and verification milestones before browser evidence", () => {
    const initial = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_personal_expenses",
      sourceSha: "f".repeat(40),
    });
    const preview = advanceMiniAppFactoryDurableState(initial, { stageId: "deploy", artifacts: ["preview"], nextEligibleStages: ["smoke"] });
    expect(preview.deliveryMilestone).toBe("PREVIEW_AVAILABLE");
    const awaitingBrowserProof = advanceMiniAppFactoryDurableState(preview, { stageId: "smoke", artifacts: ["owner-access"], nextEligibleStages: [] });
    expect(awaitingBrowserProof.deliveryMilestone).toBe("VERIFICATION_PENDING");
    expect(awaitingBrowserProof.deliveryMilestone).not.toBe("USER_TRIAL_READY");
  });

  it("records an early build failure without changing the app identity", () => {
    const initial = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_personal_expenses",
      sourceSha: "1".repeat(40),
    });
    expect(failMiniAppFactoryDurableState(initial, "GATEWAY_TIMEOUT")).toMatchObject({
      miniAppId: "app_personal_expenses",
      deliveryMilestone: "BUILD_FAILED",
      blockerState: { status: "NONE", code: "GATEWAY_TIMEOUT" },
    });
  });

  it("rejects malformed or source-unbound state", () => {
    const valid = createMiniAppFactoryDurableState({
      programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
      miniAppId: "app_research_notes",
      sourceSha: "d".repeat(40),
    });
    expect(() => parseMiniAppFactoryDurableState({ ...valid, sourceSha: "unknown" })).toThrow("FACTORY_DURABLE_STATE_INVALID");
    expect(() => createMiniAppFactoryDurableState({ programId: "program", miniAppId: "app_invalid", sourceSha: "bad" })).toThrow("FACTORY_SOURCE_SHA_INVALID");
  });
});
