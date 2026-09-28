import { describe, expect, it } from "vitest";

import { isMarketplaceAutoReviewMetadataLeaseStale } from "../marketplaceAutoReviewService";

/**
 * Field incident 2026-07-30 — run `mar_341efe636f0e6d11fc938a37dd4b19a1`,
 * shot 2 video. Observed timeline:
 *
 *   08:39:35.666  sweep claims the advance lease (TTL 10 min)
 *   08:39:36.193  advance finishes; lease ROW marked `released`
 *   08:39:37.251  the staged video dispatch persists `metadataJson` from a
 *                 snapshot read at 08:39:35 — re-publishing the already
 *                 released lease with `expiresAt` 08:49:35
 *   08:40 … 08:49 every sweep fails the claim `or(...)` on that resurrected
 *                 lease and returns `claimed: false`, which the caller
 *                 treats as a silent no-op
 *   08:50:35      lease finally expires; the run advances and immediately
 *                 discovers the provider had failed 11 minutes earlier
 *
 * User-visible symptom: pressing "สร้างวิดีโอช็อตที่ 2" really does submit
 * the job, then nothing changes for ten minutes with no error shown.
 *
 * The durable lease row cannot be clobbered by a bulk metadata write, so it
 * is the authority on whether the previous holder is still running.
 */
describe("isMarketplaceAutoReviewMetadataLeaseStale", () => {
  it("treats a released durable lease as stale so the next sweep can claim", () => {
    expect(
      isMarketplaceAutoReviewMetadataLeaseStale({
        durableLeaseStatus: "released",
      })
    ).toBe(true);
  });

  it("treats a missing durable row as stale — nothing proves a holder is running", () => {
    expect(
      isMarketplaceAutoReviewMetadataLeaseStale({ durableLeaseStatus: null })
    ).toBe(true);
  });

  it("does NOT widen the claim while the durable lease is still claimed", () => {
    expect(
      isMarketplaceAutoReviewMetadataLeaseStale({
        durableLeaseStatus: "claimed",
      })
    ).toBe(false);
  });

  it("leaves any other durable status to the normal expiresAt/ownerToken clauses", () => {
    for (const status of ["expired", "lost", ""]) {
      expect(
        isMarketplaceAutoReviewMetadataLeaseStale({
          durableLeaseStatus: status,
        })
      ).toBe(false);
    }
  });
});
