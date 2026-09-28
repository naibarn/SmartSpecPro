/**
 * Feature 142, section-07 — pure `qaPanelState.ts` coverage. No React, no
 * jsdom, no trpc: this file proves the state-machine, staleness, claim-block
 * and repair-cost-class rules in isolation before any component wires them.
 */
import { describe, expect, it } from "vitest";

import {
  deriveClaimBlock,
  deriveQaReviewView,
  groupIssuesBySeverity,
  isZeroCostRepairStage,
  LLM_REPAIR_STAGES,
  ZERO_COST_REPAIR_STAGES,
  type VideoProjectReview,
} from "../qaPanelState";
import type { QaLedgerEntry } from "@shared/videoIntelligence/qaLedger";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

function makeEntry(overrides: Partial<QaLedgerEntry> = {}): QaLedgerEntry {
  return {
    at: "2026-01-01T00:00:00.000Z",
    round: 1,
    revision: 3,
    review: { score: 7, scorecard: { overall: 7 }, issues: [] },
    creditsUsed: 5,
    modelId: "openrouter/some-model",
    traceId: "trace-1",
    ...overrides,
  };
}

const BASE_DOCUMENT: VideoProjectDocument = {
  schemaVersion: 1,
  format: { width: 1080, height: 1920, fps: 30, durationMs: 8000 },
  content: { language: "th", platformPreset: "tiktok_9_16" },
  brandKitId: null,
  scenes: [
    {
      sceneId: "scene-1",
      startMs: 0,
      endMs: 8000,
      narration: null,
      narrationAudioAssetId: null,
      visual: { kind: "layers" },
      layers: [],
      motion: { intensity: "medium", camera: "static" },
      captionCues: [],
    },
  ],
  audioTracks: [],
  captions: { presetId: "classic_box", burnIn: false, language: "th" },
  claims: [],
  qa: { targetScore: 8, maxLoops: 2 },
};

describe("deriveQaReviewView", () => {
  it("returns 'empty' when the ledger has no entries and there is no job", () => {
    const view = deriveQaReviewView({
      qaLedger: null,
      projectRevision: 1,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.status).toBe("empty");
    expect(view.latest).toBeNull();
  });

  it("returns 'running' while the job is queued or running", () => {
    for (const status of ["queued", "running"] as const) {
      const view = deriveQaReviewView({
        qaLedger: null,
        projectRevision: 1,
        hasUnsavedChanges: false,
        jobStatus: { status, error: null, progress: null },
      });
      expect(view.status).toBe("running");
    }
  });

  it("returns 'error' with the job error when the job failed", () => {
    const view = deriveQaReviewView({
      qaLedger: null,
      projectRevision: 1,
      hasUnsavedChanges: false,
      jobStatus: { status: "failed", error: "VI_NO_RECOMMENDED_MODEL: nope", progress: null },
    });
    expect(view.status).toBe("error");
    expect(view.errorMessage).toBe("VI_NO_RECOMMENDED_MODEL: nope");
  });

  it("returns 'success' with the newest ledger entry as `latest`", () => {
    const entry1 = makeEntry({ round: 1, at: "t1" });
    const entry2 = makeEntry({ round: 2, at: "t2" });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry1, entry2], totalCount: 2 },
      projectRevision: 3,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.status).toBe("success");
    expect(view.latest).toEqual(entry2);
  });

  it("exposes the previous entry so the UI can show a before/after score delta", () => {
    const entry1 = makeEntry({ round: 1, at: "t1", review: { score: 5, scorecard: {}, issues: [] } });
    const entry2 = makeEntry({ round: 2, at: "t2", review: { score: 8, scorecard: {}, issues: [] } });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry1, entry2], totalCount: 2 },
      projectRevision: 3,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.previous).toEqual(entry1);
    expect(view.latest?.review.score).toBe(8);
  });

  it("marks stale with reason 'revision_changed' when latest.revision !== projectRevision", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 4,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.isStale).toBe(true);
    expect(view.staleReason).toBe("revision_changed");
  });

  it("marks stale with reason 'unsaved_changes' when hasUnsavedChanges is true", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 3,
      hasUnsavedChanges: true,
      jobStatus: null,
    });
    expect(view.isStale).toBe(true);
    expect(view.staleReason).toBe("unsaved_changes");
  });

  it("prefers 'revision_changed' when both conditions hold", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 4,
      hasUnsavedChanges: true,
      jobStatus: null,
    });
    expect(view.staleReason).toBe("revision_changed");
  });

  it("is NOT stale when revisions match and there are no unsaved changes", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 3,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.isStale).toBe(false);
    expect(view.staleReason).toBeNull();
  });

  it("still returns `latest` when stale — a stale review is marked, never hidden", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 99,
      hasUnsavedChanges: false,
      jobStatus: null,
    });
    expect(view.isStale).toBe(true);
    expect(view.latest).toEqual(entry);
  });

  it("reports actualCreditsUsed from a succeeded job result", () => {
    const entry = makeEntry({ revision: 3 });
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 3,
      hasUnsavedChanges: false,
      jobStatus: { status: "succeeded", error: null, result: { creditsUsed: 12 } },
    });
    expect(view.actualCreditsUsed).toBe(12);
  });

  it("sets failedButPossiblyBilled on a failed job — failure is not implied to be free", () => {
    const view = deriveQaReviewView({
      qaLedger: null,
      projectRevision: 1,
      hasUnsavedChanges: false,
      jobStatus: { status: "failed", error: "boom", result: null },
    });
    expect(view.failedButPossiblyBilled).toBe(true);
  });

  it("treats a null / array / malformed qaLedger as empty instead of throwing", () => {
    for (const malformed of [null, [], "garbage", 42, undefined]) {
      expect(() =>
        deriveQaReviewView({
          qaLedger: malformed,
          projectRevision: 1,
          hasUnsavedChanges: false,
          jobStatus: null,
        }),
      ).not.toThrow();
    }
  });

  it("treats a malformed job result as absent instead of throwing", () => {
    const entry = makeEntry({ revision: 1 });
    expect(() =>
      deriveQaReviewView({
        qaLedger: { entries: [entry], totalCount: 1 },
        projectRevision: 1,
        hasUnsavedChanges: false,
        jobStatus: { status: "succeeded", error: null, result: "not-an-object" },
      }),
    ).not.toThrow();
    const view = deriveQaReviewView({
      qaLedger: { entries: [entry], totalCount: 1 },
      projectRevision: 1,
      hasUnsavedChanges: false,
      jobStatus: { status: "succeeded", error: null, result: "not-an-object" },
    });
    expect(view.actualCreditsUsed).toBeNull();
  });
});

describe("groupIssuesBySeverity", () => {
  it("orders high, then medium, then low", () => {
    const review: VideoProjectReview = {
      score: 5,
      scorecard: {},
      issues: [
        { dimension: "d1", severity: "low", message: "low issue" },
        { dimension: "d2", severity: "high", message: "high issue" },
        { dimension: "d3", severity: "medium", message: "medium issue" },
      ],
    };
    const groups = groupIssuesBySeverity(review);
    expect(groups.map(g => g.severity)).toEqual(["high", "medium", "low"]);
  });

  it("keeps an unrecognised severity in an 'unknown' group instead of dropping the issue", () => {
    const review = {
      score: 5,
      scorecard: {},
      issues: [{ dimension: "d1", severity: "critical" as never, message: "weird" }],
    } as VideoProjectReview;
    const groups = groupIssuesBySeverity(review);
    const unknownGroup = groups.find(g => g.severity === "unknown");
    expect(unknownGroup?.issues).toHaveLength(1);
    expect(unknownGroup?.issues[0].message).toBe("weird");
  });
});

describe("deriveClaimBlock", () => {
  const documentWithProhibited: VideoProjectDocument = {
    ...BASE_DOCUMENT,
    claims: [
      { claim: "cures everything", source: "manual", status: "prohibited" },
      { claim: "fine claim", source: "manual", status: "approved" },
    ],
  };

  it("uses the job result's blocksFinalRender when a job result is present (source 'job')", () => {
    const result = deriveClaimBlock({
      document: BASE_DOCUMENT,
      jobResult: { blocksFinalRender: true },
    });
    expect(result).toEqual({ blocked: true, source: "job", offendingClaimCount: 0 });
  });

  it("falls back to document claims with status prohibited/unsupported (source 'document')", () => {
    const result = deriveClaimBlock({ document: documentWithProhibited, jobResult: undefined });
    expect(result.blocked).toBe(true);
    expect(result.source).toBe("document");
  });

  it("counts the offending claims so the banner can be specific", () => {
    const result = deriveClaimBlock({ document: documentWithProhibited, jobResult: undefined });
    expect(result.offendingClaimCount).toBe(1);
  });
});

describe("repair cost classes", () => {
  it("captions/scenes/motion are zero-cost; content/narration/claims are not", () => {
    for (const stage of ZERO_COST_REPAIR_STAGES) {
      expect(isZeroCostRepairStage(stage)).toBe(true);
    }
    for (const stage of LLM_REPAIR_STAGES) {
      expect(isZeroCostRepairStage(stage)).toBe(false);
    }
  });
});
