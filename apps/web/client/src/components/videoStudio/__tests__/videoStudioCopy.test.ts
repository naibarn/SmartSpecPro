/**
 * Feature 142, section-07 — `videoStudioCopy` + `renderableJobError`
 * coverage. `renderableJobError`'s allowlist assertions REPLACE
 * `NotWiredJobCard.test.tsx`'s security coverage: a raw job/mutation error
 * string is rendered verbatim only when it is one of our own greppable
 * `VI_*` codes (FE03). This file is written BEFORE `NotWiredJobCard.tsx` and
 * its test are deleted, so the property is never left uncovered.
 */
import { describe, expect, it } from "vitest";

import { describeViError, renderableJobError, VI_ERROR_COPY, videoStudioCopy } from "../videoStudioCopy";

describe("renderableJobError (FE03 allowlist, carried over from NotWiredJobCard)", () => {
  it("returns a VI_-prefixed error verbatim", () => {
    expect(renderableJobError("en", "VI_CLAIM_VIOLATION: 2 prohibited claims")).toBe(
      "VI_CLAIM_VIOLATION: 2 prohibited claims",
    );
  });

  it("returns the generic message for an arbitrary non-VI_ error (no verbatim echo)", () => {
    expect(renderableJobError("en", "TypeError: cannot read properties of undefined")).toBe(
      videoStudioCopy.jobErrorGeneric.en,
    );
    expect(renderableJobError("th", "internal worker crash at line 42")).toBe(
      videoStudioCopy.jobErrorGeneric.th,
    );
  });

  it("returns the generic message for an HTML-looking payload", () => {
    expect(renderableJobError("en", "<script>alert(1)</script>")).toBe(
      videoStudioCopy.jobErrorGeneric.en,
    );
  });

  it("returns null for null/empty input", () => {
    expect(renderableJobError("en", null)).toBeNull();
    expect(renderableJobError("en", undefined)).toBeNull();
    expect(renderableJobError("en", "")).toBeNull();
  });
});

describe("videoStudioCopy", () => {
  it("no longer exports notWiredTitle / notWiredBody", () => {
    expect((videoStudioCopy as Record<string, unknown>).notWiredTitle).toBeUndefined();
    expect((videoStudioCopy as Record<string, unknown>).notWiredBody).toBeUndefined();
  });

  it("every new key has BOTH a th and an en string", () => {
    for (const [key, value] of Object.entries(videoStudioCopy)) {
      expect(value, `key "${key}" is missing th/en`).toEqual(
        expect.objectContaining({ th: expect.any(String), en: expect.any(String) }),
      );
    }
  });
});

/**
 * `describeViError` + `VI_ERROR_COPY` coverage (this task). Every `VI_*`
 * code greppable under `apps/web/server/` as of this writing is asserted
 * present — re-grep and extend this list before adding a new server-side
 * `VI_` throw site so this table (and this test) never silently drift out
 * of date.
 */
const ALL_SERVER_VI_CODES = [
  "VI_DOCUMENT_INVALID",
  "VI_BRAND_LOCK_VIOLATION",
  "VI_NO_RECOMMENDED_MODEL",
  "VI_STRUCTURED_STAGE_REQUIREMENTS",
  "VI_INSUFFICIENT_CREDITS",
  "VI_QUEUE_UNAVAILABLE",
  "VI_REPAIR_STALE_REVIEW",
  "VI_REPAIR_NO_INSTRUCTIONS",
  "VI_NARRATION_SCRIPT_INVALID",
  "VI_REVISION_CONFLICT",
  "VI_SEGMENTED_RENDER_NOT_SUPPORTED",
  "VI_MISSING_SOURCE_REFS",
  "VI_CLAIM_VIOLATION",
  "VI_ASSET_UNRESOLVED",
  "VI_TEMPLATE_UNKNOWN",
  "VI_PLAN_TEMPLATE_UNKNOWN",
  "VI_PLAN_LAYER_BUDGET_EXCEEDED",
  "VI_PLAN_TIMELINE_INVALID",
  "VI_PLAN_PARAMS_INVALID",
  "VI_REVIEW_OUTPUT_INVALID",
  "VI_REPAIR_OUTPUT_INVALID",
];

describe("VI_ERROR_COPY", () => {
  it("covers every known server VI_* code, each with th and en text", () => {
    for (const code of ALL_SERVER_VI_CODES) {
      expect(VI_ERROR_COPY, `missing VI_ERROR_COPY entry for ${code}`).toHaveProperty(code);
      expect(VI_ERROR_COPY[code]).toEqual(
        expect.objectContaining({ th: expect.any(String), en: expect.any(String) }),
      );
    }
  });
});

describe("describeViError", () => {
  it("maps a known VI_* code to its specific Thai/English message", () => {
    expect(describeViError("th", "VI_INSUFFICIENT_CREDITS: not enough credits")).toBe(
      videoStudioCopy.insufficientCredits.th,
    );
    expect(describeViError("en", "VI_QUEUE_UNAVAILABLE: redis down")).toBe(
      VI_ERROR_COPY.VI_QUEUE_UNAVAILABLE.en,
    );
  });

  it("NEVER appends the raw error after the mapped copy (VI_DOCUMENT_INVALID's raw Zod dump is fully replaced)", () => {
    const raw =
      'VI_DOCUMENT_INVALID: Invalid VideoProjectDocument: [{"code":"invalid_type","path":["scenes"]}]';
    const described = describeViError("th", raw);
    expect(described).toBe(videoStudioCopy.documentInvalid.th);
    expect(described).not.toMatch(/invalid_type/);
  });

  it("falls back to the generic message for a VI_-prefixed code that isn't in the map", () => {
    expect(describeViError("en", "VI_SOME_FUTURE_CODE_NOT_YET_MAPPED: detail")).toBe(
      videoStudioCopy.jobErrorGeneric.en,
    );
  });

  it("falls back to the generic message for a non-VI_ error (never echoes it verbatim)", () => {
    const described = describeViError("en", "TypeError: something exploded deep in the stack");
    expect(described).toBe(videoStudioCopy.jobErrorGeneric.en);
    expect(described).not.toMatch(/something exploded/);
  });

  it("returns null for null/empty input", () => {
    expect(describeViError("en", null)).toBeNull();
    expect(describeViError("en", undefined)).toBeNull();
    expect(describeViError("en", "")).toBeNull();
  });
});
