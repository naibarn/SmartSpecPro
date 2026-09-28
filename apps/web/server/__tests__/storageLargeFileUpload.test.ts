import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { runtimeConfig, mockSend } = vi.hoisted(() => ({
  runtimeConfig: vi.fn(),
  mockSend: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((params) => params),
  GetObjectCommand: vi.fn().mockImplementation((params) => params),
  HeadObjectCommand: vi.fn().mockImplementation((params) => params),
  DeleteObjectCommand: vi.fn().mockImplementation((params) => params),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" },
}));

vi.mock("../services/appRuntimeConfig", () => ({
  getCachedAppRuntimeConfig: runtimeConfig,
}));

vi.mock("../../drizzle/schema", () => ({
  storageSettings: { isActive: "isActive" },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

describe("large runtime archive storage uploads", () => {
  let tempDir: string;
  let sourcePath: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "smartspec-runtime-upload-"));
    sourcePath = path.join(tempDir, "runtime.zip");
    fs.writeFileSync(sourcePath, Buffer.from("runtime-archive-bytes"));
    runtimeConfig.mockReturnValue({
      forgeApiUrl: "https://forge.example.test/",
      forgeApiKey: "forge-test-key",
    });
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("streams a Forge upload instead of buffering the whole archive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://forge.example.test/file" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { invalidateStorageCache, storagePutFromPath } = await import("../storage");
    invalidateStorageCache();
    const result = await storagePutFromPath(
      "worker-runtime-releases/hyperframes-wsl2/2026.09.07.1/stable/runtime.zip",
      sourcePath,
      "application/zip",
    );

    expect(result.key).toContain("worker-runtime-releases/");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers["Content-Length"]).toMatch(/^\d+$/);
    expect(init.body).toEqual(expect.objectContaining({ pipe: expect.any(Function) }));
    expect(Buffer.isBuffer(init.body)).toBe(false);

    const chunks: Buffer[] = [];
    for await (const chunk of init.body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const payload = Buffer.concat(chunks);
    expect(payload.toString("utf8")).toContain("name=\"file\"; filename=\"runtime.zip\"");
    expect(payload.includes(Buffer.from("runtime-archive-bytes"))).toBe(true);
    expect(Number(headers["Content-Length"])).toBe(payload.byteLength);
  });
});
