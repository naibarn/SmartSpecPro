import { describe, expect, it, vi, beforeEach } from "vitest";

import { UploadPostClient, UploadPostClientError } from "../uploadPostClient";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("uploadPostClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps upstream errors to sanitized UploadPostClientError messages", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Sensitive upstream stack trace" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const client = new UploadPostClient({ baseUrl: "https://upload-post.test", timeoutMs: 1000 });
    await expect(client.validateConnection("secret-api-key")).rejects.toMatchObject({
      name: "UploadPostClientError",
      message: "Sensitive upstream stack trace",
      status: 400,
    });
  });

  it("throws a timeout error when fetch aborts", async () => {
    mockFetch.mockImplementation((_url, init: any) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }));

    const client = new UploadPostClient({ baseUrl: "https://upload-post.test", timeoutMs: 1 });
    await expect(client.validateConnection("secret-api-key")).rejects.toMatchObject({
      name: "UploadPostClientError",
      message: "Upload-Post request timed out",
    });
  });
});
