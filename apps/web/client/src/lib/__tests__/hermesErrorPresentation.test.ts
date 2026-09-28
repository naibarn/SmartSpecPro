import { describe, expect, it } from "vitest";
import {
  extractHermesErrorCode,
  formatHermesErrorForToast,
  presentHermesError,
} from "../hermesErrorPresentation";
import {
  HERMES_MEDIA_ERROR_CODES,
  formatHermesErrorMessage,
} from "@shared/hermesMedia";

describe("extractHermesErrorCode", () => {
  it("parses a TRPCClientError-shaped message with the pinned prefix", () => {
    const error = { message: formatHermesErrorMessage("HERMES_RATE_LIMITED") };
    expect(extractHermesErrorCode(error)).toBe("HERMES_RATE_LIMITED");
  });

  it("parses a message that includes a trailing detail", () => {
    const error = { message: formatHermesErrorMessage("HERMES_TIMEOUT", "worker did not respond") };
    expect(extractHermesErrorCode(error)).toBe("HERMES_TIMEOUT");
  });

  it("reads a plain task-projection errorCode field", () => {
    expect(extractHermesErrorCode({ errorCode: "HERMES_JOB_CANCELLED" })).toBe(
      "HERMES_JOB_CANCELLED",
    );
  });

  it("accepts a bare code string", () => {
    expect(extractHermesErrorCode("HERMES_CONNECTION_REQUIRED")).toBe(
      "HERMES_CONNECTION_REQUIRED",
    );
  });

  it("returns null for unknown/absent errors", () => {
    expect(extractHermesErrorCode(undefined)).toBeNull();
    expect(extractHermesErrorCode(null)).toBeNull();
    expect(extractHermesErrorCode({})).toBeNull();
    expect(extractHermesErrorCode({ message: "Something else failed" })).toBeNull();
    expect(extractHermesErrorCode("NOT_A_CODE")).toBeNull();
    expect(extractHermesErrorCode({ errorCode: "NOT_A_CODE" })).toBeNull();
  });
});

describe("presentHermesError", () => {
  const representativeCodes = [
    "HERMES_RATE_LIMITED",
    "HERMES_QUEUE_FULL",
    "HERMES_CONNECTION_REQUIRED",
    "HERMES_ENTITLEMENT_RESTRICTED",
    "HERMES_JOB_CANCELLED",
  ] as const;

  it.each(representativeCodes)("returns th/en copy + retryable for %s", (code) => {
    const result = presentHermesError({ message: formatHermesErrorMessage(code) });
    expect(result).not.toBeNull();
    expect(result?.code).toBe(code);
    expect(result?.th.length).toBeGreaterThan(0);
    expect(result?.en.length).toBeGreaterThan(0);
    expect(typeof result?.retryable).toBe("boolean");
  });

  it("marks HERMES_RATE_LIMITED as retryable and passes through retryAfterSeconds", () => {
    const result = presentHermesError({
      message: formatHermesErrorMessage("HERMES_RATE_LIMITED"),
      retryAfterSeconds: 30,
    });
    expect(result?.retryable).toBe(true);
    expect(result?.retryAfterSeconds).toBe(30);
  });

  it("omits retryAfterSeconds when the error carries none", () => {
    const result = presentHermesError({ message: formatHermesErrorMessage("HERMES_RATE_LIMITED") });
    expect(result).not.toHaveProperty("retryAfterSeconds");
  });

  it("marks a non-retryable code (HERMES_ENTITLEMENT_RESTRICTED) as not retryable", () => {
    const result = presentHermesError({
      message: formatHermesErrorMessage("HERMES_ENTITLEMENT_RESTRICTED"),
    });
    expect(result?.retryable).toBe(false);
  });

  it("returns null when no code can be extracted", () => {
    expect(presentHermesError({ message: "plain failure" })).toBeNull();
  });

  it("loops over every HERMES_MEDIA_ERROR_CODES entry and never returns empty copy", () => {
    for (const code of HERMES_MEDIA_ERROR_CODES) {
      const result = presentHermesError({ message: formatHermesErrorMessage(code) });
      expect(result).not.toBeNull();
      expect(result?.th).toBeTruthy();
      expect(result?.en).toBeTruthy();
    }
  });

  it("reads a section-06 MediaTask projection's errorCode field", () => {
    const task = { errorMessage: "สร้างวิดีโอไม่สำเร็จ", errorCode: "HERMES_TIMEOUT" };
    const result = presentHermesError(task);
    expect(result?.code).toBe("HERMES_TIMEOUT");
    expect(result?.retryable).toBe(true);
  });
});

describe("formatHermesErrorForToast", () => {
  it("returns the bare copy for a non-retryable code (no suffix at all)", () => {
    const presentation = presentHermesError({
      message: formatHermesErrorMessage("HERMES_ENTITLEMENT_RESTRICTED"),
    })!;
    expect(formatHermesErrorForToast(presentation, "th")).toBe(presentation.th);
    expect(formatHermesErrorForToast(presentation, "en")).toBe(presentation.en);
  });

  it("appends a plain retry suffix for a retryable code with no retryAfterSeconds", () => {
    const presentation = presentHermesError({
      message: formatHermesErrorMessage("HERMES_TIMEOUT"),
    })!;
    expect(formatHermesErrorForToast(presentation, "th")).toBe(
      `${presentation.th} (ลองใหม่ได้)`,
    );
    expect(formatHermesErrorForToast(presentation, "en")).toBe(
      `${presentation.en} (retryable)`,
    );
  });

  it("appends the retryAfterSeconds-aware suffix when present", () => {
    const presentation = presentHermesError({
      message: formatHermesErrorMessage("HERMES_RATE_LIMITED"),
      retryAfterSeconds: 30,
    })!;
    expect(formatHermesErrorForToast(presentation, "th")).toBe(
      `${presentation.th} (ลองใหม่ได้ในอีก 30 วินาที)`,
    );
    expect(formatHermesErrorForToast(presentation, "en")).toBe(
      `${presentation.en} (retry in 30s)`,
    );
  });
});
