import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCClientError } from "@trpc/client";

import { buildUnexpectedHtmlResponseMessage } from "@/lib/apiResponseDiagnostics";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";
import { handleError } from "@/lib/systemErrorMonitor";

/** Same construction style as requestResilience.test.ts's helper: a real
 * TRPCClientError carrying the `data` shape `classifyError` reads. */
function makeTrpcClientError(data: { code: string; httpStatus?: number }) {
  return TRPCClientError.from({
    error: {
      code: -32603,
      message: `mock ${data.code}`,
      data,
    },
  });
}

describe("systemErrorMonitor handleError toast class selection", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it("selects the soft reconnecting toast for a gateway-502 lost-upstream message", () => {
    const message = buildUnexpectedHtmlResponseMessage({
      requestUrl: "/trpc/mcpConnections.listConnections",
      status: 502,
      statusText: "Bad Gateway",
      contentType: "text/html",
      bodySnippet: "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>",
    });

    handleError(new Error(message), "mcpConnections.listConnections");

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    const [title, options] = vi.mocked(toast.info).mock.calls[0];
    expect(title).toBe("กำลังเชื่อมต่อใหม่...");
    expect(options?.description).toContain("ลองเชื่อมต่อ");
    expect(options?.description).not.toContain("ระบบขัดข้องชั่วคราว");
  });

  it("selects the soft reconnecting toast for a tenant bootstrap 503", () => {
    handleError(
      Object.assign(new Error("tenant/current 503"), { status: 503 }),
      "tenant.current",
    );

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("selects the generic system-error toast for a plain 500 TRPCClientError", () => {
    const error = makeTrpcClientError({
      code: "INTERNAL_SERVER_ERROR",
      httpStatus: 500,
    });

    handleError(error, "someRouter.someProcedure");

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.error).mock.calls[0];
    expect(title).toBe("ระบบขัดข้องชั่วคราว");
    expect(options?.description).toContain("เกิดข้อผิดพลาดฝั่งระบบ");
  });

  it("does not open a system-error report for a provider status-poll 429 wrapped as 500", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32603,
        message: "Get task failed: 429",
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
        },
      },
    });

    handleError(error, "verticalDramaCharacters.settlePortraitCandidate");

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("does not open a system-error report for a temporary provider 503", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32603,
        message: "Provider status temporarily unavailable (503)",
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
        },
      },
    });

    handleError(error, "verticalDramaCharacters.settlePortraitCandidate");

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("does not open a system-error report for a temporary safety-review outage", () => {
    const error = TRPCClientError.from({
      error: {
        code: -32603,
        message: "Prompt safety review is temporarily unavailable. The request was not submitted; please try again shortly.",
        data: {
          code: "SERVICE_UNAVAILABLE",
          httpStatus: 503,
        },
      },
    });

    handleError(error, "media.generateImageAsync");

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("shows storage guidance without recording a report action", () => {
    handleError(
      new Error(
        "storage_capacity_exhausted [mount=/tmp; kind=bytes; availableBytes=0]",
      ),
      "verticalDramaEpisodes.assembleEpisodeVideo",
    );

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.error).mock.calls[0];
    expect(title).toContain("พื้นที่จัดเก็บ");
    expect(title).toContain("/tmp");
    expect(options?.action).toBeUndefined();
  });
});
