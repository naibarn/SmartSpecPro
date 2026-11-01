import { describe, expect, it } from "vitest";
import { buildModularSaasMissionControlReadModel } from "./modularSaasMissionControlReadModel";

describe("buildModularSaasMissionControlReadModel", () => {
  it("keeps current source, stale ingestion, partial package readiness, and exact run evidence distinct", () => {
    const model = buildModularSaasMissionControlReadModel({
      project: {
        projectId: "smartaihub-modular-saas-r14",
        descriptorDigest: "a".repeat(64),
        specs: [
          { id: "312-core", title: "Core", digest: "b".repeat(64), dependencies: [], requirements: [{ id: "R1", text: "One", finalState: "PASS" }], nextAction: "Continue Core", lifecycleState: "CONTINUATION_REQUIRED" },
          { id: "313-auth", title: "Auth", digest: "c".repeat(64), dependencies: ["312-core"], requirements: [{ id: "R2", text: "Two", finalState: "OPEN" }], nextAction: "Implement auth", lifecycleState: "ACTIVE" },
        ],
        initialPackages: [
          { id: "core-docs", specRefs: [{ specId: "312-core", requirementIds: ["R1"] }] },
          { id: "auth", specRefs: [{ specId: "313-auth", requirementIds: ["R2"] }] },
        ],
      },
      compilation: { requirements: [{ canonicalSpecId: "312-core", lifecycleStatus: "READY" }, { canonicalSpecId: "313-auth", lifecycleStatus: "BLOCKED" }], workPackages: [{ externalId: "core-docs", readiness: "READY", blockers: [] }, { externalId: "auth", readiness: "BLOCKED", blockers: ["missing verification"] }] },
      ingestions: [{ workspaceId: "ws-1", revision: 4, digest: "d".repeat(64), descriptorDigest: "e".repeat(64), sourceRevision: "f".repeat(40) }],
      runs: [{ runId: "run-4", workspaceId: "ws-1", specSetRevision: 4, state: "IMPLEMENT", workPackageExternalId: "core-docs" }],
    });

    expect(model.sourceStatus).toBe("CURRENT");
    expect(model.ingestionStatus).toBe("STALE");
    expect(model.specs[1]).toMatchObject({ id: "313-auth", dependencyIds: ["312-core"], openRequirements: 1, lifecycleState: "ACTIVE" });
    expect(model.packages.map(item => item.readiness)).toEqual(["READY", "BLOCKED"]);
    expect(model.linkedRuns).toEqual([{ runId: "run-4", workspaceId: "ws-1", specSetRevision: 4, state: "IMPLEMENT", workPackageExternalId: "core-docs", evidenceScope: "SPEC224_RUN", sourceAlignment: "STALE" }]);
    expect(model).not.toHaveProperty("deploymentStatus", "DEPLOYED");
  });

  it("reports missing ingestion and never invents run or deployment evidence", () => {
    const model = buildModularSaasMissionControlReadModel({
      project: { projectId: "p", descriptorDigest: "a".repeat(64), specs: [], initialPackages: [] },
      compilation: { requirements: [], workPackages: [] },
      ingestions: [],
      runs: [],
    });
    expect(model.ingestionStatus).toBe("NOT_INGESTED");
    expect(model.linkedRuns).toEqual([]);
    expect(model.deployment).toEqual({ status: "UNKNOWN", target: null });
  });
});
