import { describe, expect, it } from "vitest";

import { clampCreditTraceId } from "../creditService";

/**
 * Field incident 2026-07-30 — run `mar_341efe636f0e6d11fc938a37dd4b19a1`.
 * All 9 shot videos were finished and `final_assembly` was approved, but the
 * Remotion final render never reached the worker queue: the credit
 * reservation INSERT died with
 *
 *   PostgresError 22001: value too long for type character varying(32)
 *
 * because `staged-final-render:<runId>:r<rev>` is 58 characters and
 * `credit_transactions.traceId` is `varchar(32)`. The caller caught it,
 * logged a warning, and silently fell back to the legacy renderer — so from
 * the UI the run simply stopped with no render and no error.
 */
describe("clampCreditTraceId", () => {
  it("passes a trace id that already fits through unchanged", () => {
    expect(clampCreditTraceId("staged-video-poll:42")).toBe(
      "staged-video-poll:42"
    );
  });

  it("keeps an exactly-32-character trace id unchanged", () => {
    const exact = "a".repeat(32);
    expect(clampCreditTraceId(exact)).toBe(exact);
  });

  it("clamps the real overflowing trace id to 32 characters", () => {
    const result = clampCreditTraceId(
      "staged-final-render:mar_341efe636f0e6d11fc938a37dd4b19a1:r4"
    );
    expect(result).not.toBeNull();
    expect(result!.length).toBe(32);
    expect(result!.startsWith("staged-final-render:")).toBe(true);
  });

  it("keeps distinct long trace ids distinct — prefix truncation alone would collide", () => {
    const a = clampCreditTraceId(
      "staged-final-render:mar_341efe636f0e6d11fc938a37dd4b19a1:r4"
    );
    const b = clampCreditTraceId(
      "staged-final-render:mar_99999999999999999999999999999999:r4"
    );
    const sameRunDifferentRevision = clampCreditTraceId(
      "staged-final-render:mar_341efe636f0e6d11fc938a37dd4b19a1:r5"
    );
    expect(a).not.toBe(b);
    expect(a).not.toBe(sameRunDifferentRevision);
  });

  it("is deterministic for the same input", () => {
    const input = "staged-final-render:mar_341efe636f0e6d11fc938a37dd4b19a1:r4";
    expect(clampCreditTraceId(input)).toBe(clampCreditTraceId(input));
  });

  it("normalises empty / blank / nullish input to null", () => {
    expect(clampCreditTraceId(null)).toBeNull();
    expect(clampCreditTraceId(undefined)).toBeNull();
    expect(clampCreditTraceId("")).toBeNull();
    expect(clampCreditTraceId("   ")).toBeNull();
  });
});
