import { describe, expect, it } from "vitest";
import { TRPCClientError } from "@trpc/client";
import {
  buildPollUnresolvedOutcomeMessage,
  buildPortraitCandidateTimeoutPatch,
  buildPortraitCandidateUnresolvedOutcomePatch,
  classifyMediaPollError,
  VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import { RETRYABLE_QUERY_MAX_ATTEMPTS } from "@/lib/requestResilience";

/**
 * Coverage for `planning/fix-character-image-false-failure/plan.md`, section
 * "A. Client" (Set B fix): a transient status-read error (provider 429, 5xx,
 * network blip, client-side timeout/abort) must NEVER permanently mark a
 * character-image / portrait-candidate generation as "failed" — the image
 * can still complete server-side even though we could not observe it. Only
 * a genuine server-reported `status === "failed"` may render as failed.
 *
 * `pollPortraitCandidateTask`/`pollCharacterImageTask` themselves are async
 * closures over component state (mutations, setState) and are not exported
 * — mounting this ~7000-line panel to exercise them directly is impractical
 * (see `VerticalDramaCharacterStockPanel.characterCrud.test.ts`'s doc
 * comment for the established precedent). As with every other fix in this
 * file, the actual decision logic is pulled out into small exported pure
 * functions and tested directly here; the poll loops just wire these to
 * `updatePortraitCandidateUi`/`toast` (visually verified against the diff
 * described in the accompanying report).
 */

/** Builds a `TRPCClientError`-shaped value the same way the real tRPC
 *  client would deliver one to a `.mutateAsync`/`.fetch` caller — `.data`
 *  set post-construction (bypassing the `readonly` modifier, exactly like
 *  the real client library does internally via `TRPCClientError.from`),
 *  optionally with `.cause` set to an underlying transport error. */
function fakeTrpcClientError(
  message: string,
  data?: { code?: string; httpStatus?: number },
  cause?: unknown
): TRPCClientError<any> {
  const err = new TRPCClientError(
    message,
    cause ? { cause: cause as Error } : undefined
  );
  if (data) {
    (err as unknown as { data: unknown }).data = data;
  }
  return err;
}

describe("classifyMediaPollError (Set B fix — TRANSIENT vs TERMINAL poll errors)", () => {
  it("(d) labels a structured 429 (TOO_MANY_REQUESTS) TRPCClientError as transient", () => {
    const error = fakeTrpcClientError("Too many requests", {
      code: "TOO_MANY_REQUESTS",
      httpStatus: 429,
    });
    expect(classifyMediaPollError(error)).toBe("transient");
  });

  it("(d) labels a structured 408 httpStatus as transient", () => {
    const error = fakeTrpcClientError("Request timeout", {
      code: "TIMEOUT",
      httpStatus: 408,
    });
    expect(classifyMediaPollError(error)).toBe("transient");
  });

  it("(d) labels a structured 5xx (INTERNAL_SERVER_ERROR) TRPCClientError as transient", () => {
    const error = fakeTrpcClientError("Internal error", {
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
    });
    expect(classifyMediaPollError(error)).toBe("transient");
  });

  it("(d) labels a raw network-connection failure (TypeError) as transient", () => {
    expect(classifyMediaPollError(new TypeError("Failed to fetch"))).toBe(
      "transient"
    );
  });

  it("(d) labels a TRPCClientError wrapping a network TypeError in `.cause` as transient (real client shape for a pure transport failure)", () => {
    const cause = new TypeError("NetworkError when attempting to fetch resource.");
    const error = fakeTrpcClientError("NetworkError when attempting to fetch resource.", undefined, cause);
    expect(classifyMediaPollError(error)).toBe("transient");
  });

  it("(d) labels a client-side request abort (DOMException AbortError) as transient", () => {
    const abort = new DOMException("The operation was aborted.", "AbortError");
    expect(classifyMediaPollError(abort)).toBe("transient");
  });

  it(
    "reproduces the real `settlePortraitCandidate` shape (production evidence, " +
      "2026-07-31): tRPC auto-wraps the uncaught `Error(\"Get task failed: 429\")` " +
      "as INTERNAL_SERVER_ERROR/500, message text preserved — still transient",
    () => {
      const error = fakeTrpcClientError("Get task failed: 429", {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      });
      expect(classifyMediaPollError(error)).toBe("transient");
    }
  );

  it(
    "reproduces the real `media.getTask` shape: the router re-wraps ANY " +
      "thrown error as NOT_FOUND/404, so ONLY the message text (not the " +
      "structured code/httpStatus) carries the real 429 signal — this is " +
      "the load-bearing fallback case, not merely defensive",
    () => {
      const error = fakeTrpcClientError("Get task failed: 429", {
        code: "NOT_FOUND",
        httpStatus: 404,
      });
      expect(classifyMediaPollError(error)).toBe("transient");
    }
  );

  it("(d) labels an explicit, non-retryable application error (structural, not a read failure) as terminal", () => {
    const error = fakeTrpcClientError(
      "Task provenance does not match this portrait candidate.",
      { code: "BAD_REQUEST", httpStatus: 400 }
    );
    expect(classifyMediaPollError(error)).toBe("terminal");
  });

  it("(d) labels a genuine NOT_FOUND with no transient signal in the message as terminal", () => {
    const error = fakeTrpcClientError("Task abc123 not found", {
      code: "NOT_FOUND",
      httpStatus: 404,
    });
    expect(classifyMediaPollError(error)).toBe("terminal");
  });

  it("treats an explicit server-reported `status: \"failed\"` result as an entirely separate, terminal-by-definition path — never routed through this classifier at all", () => {
    // `settlePortraitCandidate`/`media.getTask` communicate a genuine
    // provider failure as a normal RETURNED value (`{ status: "failed" }`),
    // never as a thrown error — so `classifyMediaPollError` (which only
    // ever receives THROWN values from the catch block) structurally can
    // never see this case, which is exactly the point: only that direct
    // `result.status === "failed"` equality check (unchanged by this fix)
    // may ever render a candidate as failed.
    const explicitServerFailure = { status: "failed" as const };
    expect(explicitServerFailure.status).toBe("failed");
    expect(() => classifyMediaPollError(explicitServerFailure)).not.toThrow();
    // A plain object like this carries none of the recognized transient
    // shapes, so if it were ever (incorrectly) passed through the
    // classifier, it still would not silently look "transient" and mask a
    // real bug — it falls out the other side as "terminal".
    expect(classifyMediaPollError(explicitServerFailure)).toBe("terminal");
  });
});

describe("VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS (guards the retry loop)", () => {
  it("reuses the shared query-retry budget rather than a new bespoke magic number", () => {
    expect(VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS).toBe(
      RETRYABLE_QUERY_MAX_ATTEMPTS
    );
    expect(VD_MEDIA_POLL_MAX_CONSECUTIVE_TRANSIENT_ERRORS).toBeGreaterThan(1);
  });
});

describe("buildPortraitCandidateUnresolvedOutcomePatch (Set B fix — (a)/(c) never 'failed' on an unreadable status)", () => {
  it("(a)/(c) lands on the non-terminal `queued` status, never `failed`, with bilingual 'outcome not confirmed' copy", () => {
    const th = buildPortraitCandidateUnresolvedOutcomePatch("th");
    expect(th.status).toBe("queued");
    expect(th.status).not.toBe("failed");
    expect(th.errorMessage).toBe("ยังไม่ทราบผล — ระบบเก็บงานไว้ให้ตรวจสอบภายหลัง");

    const en = buildPortraitCandidateUnresolvedOutcomePatch("en");
    expect(en.status).toBe("queued");
    expect(en.errorMessage).toBe(
      "Outcome not yet confirmed — the task remains saved for later review."
    );
  });

  it("shares its copy with `buildPollUnresolvedOutcomeMessage` (single translation source, reused by both poll loops)", () => {
    expect(buildPortraitCandidateUnresolvedOutcomePatch("th").errorMessage).toBe(
      buildPollUnresolvedOutcomeMessage("th")
    );
    expect(buildPortraitCandidateUnresolvedOutcomePatch("en").errorMessage).toBe(
      buildPollUnresolvedOutcomeMessage("en")
    );
  });

  it("(b) stays distinct from the genuine-timeout `failed` patch — no regression to the pre-existing, unrelated 'every read succeeded, still slow' path", () => {
    const unresolved = buildPortraitCandidateUnresolvedOutcomePatch("en");
    const genuineTimeout = buildPortraitCandidateTimeoutPatch("en");
    expect(unresolved.status).not.toBe(genuineTimeout.status);
    expect(genuineTimeout.status).toBe("failed");
    expect(unresolved.errorMessage).not.toBe(genuineTimeout.errorMessage);
  });
});
