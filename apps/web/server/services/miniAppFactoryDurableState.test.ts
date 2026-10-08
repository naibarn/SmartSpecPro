import { describe, expect, it } from "vitest";
import {
  advanceMiniAppFactoryDurableState,
  createMiniAppFactoryDurableState,
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
      sourceSha: "a".repeat(40),
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
