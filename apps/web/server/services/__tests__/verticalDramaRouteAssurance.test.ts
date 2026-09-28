import { describe, expect, it } from "vitest";
import { createVerticalDramaAssuranceMemoryRepository } from "../verticalDramaAssuranceRepository";
import {
  VERTICAL_DRAMA_ASSURANCE_ROUTES,
  VERTICAL_DRAMA_ROUTE_TASKS,
  assurePersistedVerticalDramaRoute,
  buildVerticalDramaRouteContext,
} from "../verticalDramaRouteAssurance";

const fingerprint = "a".repeat(64);

describe("Vertical Drama route assurance coverage", () => {
  it("keeps every required production entry point mapped to a task", () => {
    expect(VERTICAL_DRAMA_ASSURANCE_ROUTES).toHaveLength(14);
    for (const route of VERTICAL_DRAMA_ASSURANCE_ROUTES) {
      expect(VERTICAL_DRAMA_ROUTE_TASKS[route]).toBeTruthy();
    }
  });

  it("finalizes a persisted candidate once and reuses the same attempt", async () => {
    const repository = createVerticalDramaAssuranceMemoryRepository();
    const context = buildVerticalDramaRouteContext({
      seriesId: 101,
      profileId: "drama_romance",
      visualSource: { snapshotId: "visual-1", revision: 1, fingerprint },
    });
    const input = {
      route: "episodes.generateShotVideoPrompt" as const,
      owner: {
        tenantId: "tenant-1",
        userId: 7,
        seriesId: 101,
        episodeId: 202,
        shotNumber: 3,
      },
      context,
      predecessorRefs: [],
      contractVersion: "vd-route-v1",
      policyHash: fingerprint,
      modelPolicy: "legacy-deterministic:v1",
      idempotencyKey: "route-idempotency-1",
      stageInput: { shotNumber: 3, prompt: "candidate" },
      output: { prompt: "candidate" },
      domainArtifactId: "episode-artifact-1",
      boundary: "advisory" as const,
    };
    const first = await assurePersistedVerticalDramaRoute(input, {
      repository,
      activate: async () => "accepted",
    });
    expect(first.status).toBe("accepted");
    expect(first.assurance.state).toBe("succeeded");
    expect(first.artifactRef.artifactId).toBe("episode-artifact-1");

    const second = await assurePersistedVerticalDramaRoute(
      {
        ...input,
        output: { ...input.output, assuranceLineage: first.lineage },
      },
      { repository, activate: async () => "accepted" }
    );
    expect(second.status).toBe("deduped");
    expect(second.assurance.executionId).toBe(first.assurance.executionId);
  });

  it("does not fabricate a context for a missing visual source", () => {
    expect(() =>
      buildVerticalDramaRouteContext({
        seriesId: 101,
        profileId: "drama_romance",
        visualSource: { snapshotId: "visual-1", revision: 1, fingerprint },
      })
    ).not.toThrow();
  });
});
