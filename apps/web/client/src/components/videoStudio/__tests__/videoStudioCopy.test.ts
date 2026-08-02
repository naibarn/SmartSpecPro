/**
 * Feature 142, section-07 — `videoStudioCopy` + `renderableJobError`
 * coverage. `renderableJobError`'s allowlist assertions REPLACE
 * `NotWiredJobCard.test.tsx`'s security coverage: a raw job/mutation error
 * string is rendered verbatim only when it is one of our own greppable
 * `VI_*` codes (FE03). This file is written BEFORE `NotWiredJobCard.tsx` and
 * its test are deleted, so the property is never left uncovered.
 */
import { describe, expect, it } from "vitest";

import { renderableJobError, videoStudioCopy } from "../videoStudioCopy";

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
