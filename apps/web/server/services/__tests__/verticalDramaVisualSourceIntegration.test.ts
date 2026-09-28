import { describe, expect, it } from "vitest";
import { createVisualSourceSnapshot, validateSnapshotForRun } from "../verticalDramaVisualSourceSnapshotService";
import { applyNewsCorrection, assessNewsClaimFreshness, evaluateNewsReadiness } from "../verticalDramaNewsReportService";
import { projectBrollTimeline, validateBrollBinding } from "../verticalDramaBrollService";
import { type NewsClaim } from "@shared/verticalDramaSeries/newsReport";

const baseClaim: NewsClaim = {
  claimId: "nan-families",
  text: "มากกว่า 20,000 ครอบครัวได้รับผลกระทบ",
  claimType: "number",
  geography: "น่าน",
  validFrom: null,
  validUntil: null,
  asOf: "2026-08-23T00:00:00.000Z",
  evidenceRefs: [{ evidenceId: "source-1", url: "https://example.com/report", title: "Report", publisher: "Example", publishedAt: "2026-08-23T00:00:00.000Z", accessedAt: "2026-08-23T01:00:00.000Z", supportedScope: ["nan-families"], status: "supporting", archiveLabel: false, correctionOf: null }],
  visualSlotIds: ["flood-footage"],
  attribution: "หน่วยงานที่เกี่ยวข้อง",
  status: "verified",
  freshness: "current",
  correctionRevision: 0,
  correctionNote: null,
};

describe("Feature 160 integration contracts", () => {
  it("freezes a stable snapshot and rejects a changed fence", () => {
    const snapshot = createVisualSourceSnapshot({ snapshotId: "snap-1", revision: 1, packId: 1, profileId: "documentary", profileVersion: 1, slots: [], segments: [], coverage: [] });
    expect(validateSnapshotForRun(snapshot, { revision: 1, fingerprint: snapshot.fingerprint })).toEqual({ ok: true });
    expect(validateSnapshotForRun(snapshot, { revision: 2, fingerprint: snapshot.fingerprint }).code).toBe("STALE_SOURCE_SNAPSHOT");
  });

  it("marks current claims stale and correction revisions unverified", () => {
    const stale = assessNewsClaimFreshness({ claim: baseClaim, now: new Date("2026-08-25T00:00:00.000Z"), maxAgeHours: 24 });
    expect(stale.status).toBe("stale");
    const corrected = applyNewsCorrection({ claim: baseClaim, nextEvidence: baseClaim.evidenceRefs, note: "ตัวเลขได้รับการแก้ไข" });
    expect(corrected.claim.status).toBe("needs_verification");
    expect(corrected.revision.revision).toBe(1);
  });

  it("requires visual coverage before news readiness", () => {
    expect(evaluateNewsReadiness([baseClaim]).ready).toBe(true);
    expect(evaluateNewsReadiness([{ ...baseClaim, visualSlotIds: [] }]).ready).toBe(false);
  });

  it("keeps footage B-roll separate and preserves exact duration/order", () => {
    const segment = { segmentId: "flood-1", sourceAssetId: 1, revision: 2, mediaType: "video" as const, inSeconds: 3, outSeconds: 8, displayDurationSeconds: null, label: "flood", description: null, evidenceScope: ["nan-families"], captureAt: null, locationLabel: "Nan", sourceLabel: "user footage", audioPolicy: "keep" as const, status: "ready" as const };
    const binding = { bindingId: "b1", episodeId: 1, shotNumber: 1, usage: { usageId: "u1", slotId: "flood-footage", semanticRole: "b_roll_footage" as const, mediaType: "video" as const, sourceAssetId: 1, mediaAssetId: 1, segmentId: "flood-1", segmentRevision: 2, inSeconds: 3, outSeconds: 8, displayDurationSeconds: null, audioPolicy: "keep" as const, labelMode: "source" as const, snapshotRevision: 1, snapshotFingerprint: "a".repeat(64) }, order: 0, fitMode: "cover" as const, active: true, status: "draft" as const };
    const valid = validateBrollBinding(binding, { snapshotRevision: 1, snapshotFingerprint: "a".repeat(64), segment });
    expect(projectBrollTimeline([valid]).totalDurationSeconds).toBe(5);
  });
});
