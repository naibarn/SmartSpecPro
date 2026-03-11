import { beforeEach, describe, expect, it, vi } from "vitest";

import { agencyRunArtifacts } from "../../drizzle/schema";
import { AGENCY_PREVIEW_RETENTION_DAYS, expireRunPreviewArtifacts } from "./agencyPreviewLifecycleService";

describe("agencyPreviewLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks stale previews as expired while leaving the run audit record intact", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "artifact-1" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as any;
    const now = new Date("2026-03-11T00:00:00.000Z");

    const count = await expireRunPreviewArtifacts({
      runId: "run-1",
      tenantId: "tenant-1",
      now,
      dbClient: db,
    });

    expect(update).toHaveBeenCalledWith(agencyRunArtifacts);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        state: "expired_preview",
        expiredAt: now,
      }),
    );
    expect(count).toBe(1);
    expect(AGENCY_PREVIEW_RETENTION_DAYS).toBe(7);
  });
});
