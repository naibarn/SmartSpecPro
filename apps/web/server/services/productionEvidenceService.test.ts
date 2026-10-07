import { describe, expect, it, vi } from "vitest";

import { getProductionEvidence } from "./productionEvidenceService";

const identity = { tenantId: "tenant-a", projectId: "project-a", environment: "staging", provider: "cloudflare" };

describe("Mission Control production evidence normalization", () => {
  it("returns explicit unknown evidence when artifact and multi-instance authorities are unavailable", async () => {
    const query = { from: () => query, where: async () => [] };
    const db = { select: () => query } as never;
    const migrationSource = { observe: vi.fn(async () => ({ status: "OBSERVED", source: "drizzle", observedAt: "2026-10-07T00:00:00.000Z", value: { currentState: "APPLIED" } })) } as never;
    const workerEvidence = vi.fn(async () => ({ status: "NOT_CONFIGURED", observedAt: "2026-10-07T00:00:00.000Z", source: "worker", value: null }));
    const containerEvidence = vi.fn(async () => ({ status: "NOT_CONFIGURED", observedAt: "2026-10-07T00:00:00.000Z", source: "container", value: null }));
    const runtimeEvidence = vi.fn(() => ({ status: "OBSERVED", observedAt: "2026-10-07T00:00:00.000Z", value: { health: "HEALTHY" } }));
    const evidence = await getProductionEvidence({ db, identity, dependencies: { migrationSource, workerEvidence, containerEvidence, runtimeEvidence } });
    expect(evidence).toMatchObject({ schemaVersion: "production-evidence.v1", deploymentTarget: { status: "NOT_CONFIGURED" },
      credential: { status: "NOT_CONFIGURED" }, artifacts: { status: "UNKNOWN_EVIDENCE", value: null },
      migration: { status: "OBSERVED" }, worker: { status: "NOT_CONFIGURED" }, container: { status: "NOT_CONFIGURED" },
      runtime: { status: "OBSERVED" }, instanceConvergence: { status: "UNKNOWN_EVIDENCE", value: null }, externalRuntimeVerification: "NOT_VERIFIED" });
    expect(migrationSource.observe).toHaveBeenCalledOnce();
    expect(workerEvidence).toHaveBeenCalledOnce();
    expect(containerEvidence).toHaveBeenCalledOnce();
  });
});
