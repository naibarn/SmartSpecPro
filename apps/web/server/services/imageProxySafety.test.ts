import { describe, expect, it } from "vitest";

import {
  ImageProxySafetyError,
  proxyImageFromUrl,
} from "./imageProxySafety";

function makeResponse(body: string | Uint8Array, init?: ResponseInit): Response {
  return new Response(body, init);
}

describe("proxyImageFromUrl", () => {
  it("rejects private/local target URLs", async () => {
    await expect(proxyImageFromUrl("https://localhost/image.png")).rejects.toMatchObject({
      status: 400,
      code: "blocked_url",
    });
  });

  it("rejects redirect destination to private/local target", async () => {
    const fetchImpl = async (_url: string): Promise<Response> => {
      return makeResponse("", {
        status: 302,
        headers: {
          location: "https://10.1.2.3/secret.png",
        },
      });
    };

    await expect(
      proxyImageFromUrl("https://cdn.example.com/start.png", { fetchImpl, maxRedirects: 2 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "blocked_url",
    });
  });

  it("returns timeout-safe failure when upstream fetch times out", async () => {
    const fetchImpl = async (_url: string, init?: RequestInit): Promise<Response> => {
      if (init?.signal?.aborted) {
        const err: any = new Error("aborted");
        err.name = "AbortError";
        throw err;
      }
      const err: any = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };

    await expect(
      proxyImageFromUrl("https://cdn.example.com/image.png", { fetchImpl, timeoutMs: 50 }),
    ).rejects.toMatchObject({
      status: 504,
      code: "upstream_timeout",
    });
  });

  it("rejects oversized payload", async () => {
    const payload = new Uint8Array(32).fill(1);
    const fetchImpl = async (_url: string): Promise<Response> => {
      return makeResponse(payload, {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });
    };

    await expect(
      proxyImageFromUrl("https://cdn.example.com/image.png", { fetchImpl, maxBytes: 16 }),
    ).rejects.toMatchObject({
      status: 413,
      code: "upstream_too_large",
    });
  });

  it("rejects non-image content type", async () => {
    const fetchImpl = async (_url: string): Promise<Response> => {
      return makeResponse("hello", {
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      });
    };

    await expect(
      proxyImageFromUrl("https://cdn.example.com/file.txt", { fetchImpl }),
    ).rejects.toMatchObject({
      status: 415,
      code: "upstream_not_image",
    });
  });

  it("succeeds for valid public image URL", async () => {
    const fetchImpl = async (_url: string): Promise<Response> => {
      return makeResponse(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      });
    };

    const result = await proxyImageFromUrl("https://cdn.example.com/image.png", { fetchImpl });

    expect(result.contentType).toBe("image/png");
    expect(result.finalUrl).toBe("https://cdn.example.com/image.png");
    expect(result.bytes.byteLength).toBe(4);
  });

  it("maps unknown fetch failure to stable safe error", async () => {
    const fetchImpl = async () => {
      throw new Error("socket hang up");
    };

    await expect(
      proxyImageFromUrl("https://cdn.example.com/image.png", { fetchImpl }),
    ).rejects.toMatchObject({
      status: 502,
      code: "upstream_fetch_failed",
    });
  });

  it("throws typed safety error", async () => {
    try {
      await proxyImageFromUrl("", { fetchImpl: fetch as any });
    } catch (error) {
      expect(error).toBeInstanceOf(ImageProxySafetyError);
      return;
    }

    throw new Error("Expected proxyImageFromUrl to throw");
  });
});
