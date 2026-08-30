import { describe, expect, it, vi } from "vitest";
import { getSeriesProfile } from "@shared/verticalDramaSeries/seriesProfile";
import { createVisualSourceSnapshot } from "../verticalDramaVisualSourceSnapshotService";
import {
  captureProductionContextSnapshot,
  validateProductionContextAdmission,
} from "../verticalDramaProductionContext";

const owner = { tenantId: "tenant-1", userId: 7 };
const visualSnapshot = createVisualSourceSnapshot({
  snapshotId: "visual-1", revision: 1, packId: 1, profileId: "drama_romance", profileVersion: 1, slots: [], segments: [], coverage: [],
});

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadSeriesOwner: vi.fn().mockResolvedValue(owner),
    loadProfile: vi.fn().mockResolvedValue(getSeriesProfile("drama_romance")),
    loadSourcePack: vi.fn().mockResolvedValue(null),
    loadVisualSnapshot: vi.fn().mockResolvedValue(visualSnapshot),
    loadClaimLedger: vi.fn().mockResolvedValue(null),
    loadCoveragePlan: vi.fn().mockResolvedValue(null),
    loadReferences: vi.fn().mockResolvedValue({ storyControlRefs: ["story-1"], characterRefs: [], sceneRefs: [], shotRefs: [], claimRefs: [], coverageRefs: [], slotRefs: [], assetRefs: [], segmentRefs: [], mediaBindingRefs: [] }),
    ...overrides,
  };
}

describe("vertical drama production-context capture", () => {
  it("composes injected authoritative facts and records optional fiction as explicit null", async () => {
    const result = await captureProductionContextSnapshot({ owner, seriesId: 101, snapshotId: "ctx-1", revision: 1 }, dependencies());
    expect(result).toMatchObject({ ok: true, snapshot: { seriesId: 101, sourcePackDecision: "explicit_none", sourcePack: null, visualSource: { snapshotId: "visual-1" } } });
  });

  it("fails tenant ownership before invoking downstream loaders", async () => {
    const deps = dependencies({ loadSeriesOwner: vi.fn().mockResolvedValue({ tenantId: "other", userId: 7 }) });
    const result = await captureProductionContextSnapshot({ owner, seriesId: 101, snapshotId: "ctx-1", revision: 1 }, deps as any);
    expect(result).toMatchObject({ ok: false, finding: { code: "VD_ASSURANCE_TENANT_MISMATCH" } });
    expect(deps.loadProfile).not.toHaveBeenCalled();
  });

  it("blocks provider admission when a current context is only draft-ready", async () => {
    const captured = await captureProductionContextSnapshot({ owner, seriesId: 101, snapshotId: "ctx-1", revision: 1 }, dependencies());
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    expect(validateProductionContextAdmission({ owner, snapshot: captured.snapshot, contextRef: captured.snapshot, sourceRef: null, requiredReadiness: "provider_ready" })).toMatchObject({ code: "VD_ASSURANCE_SOURCE_NOT_READY" });
  });
});
