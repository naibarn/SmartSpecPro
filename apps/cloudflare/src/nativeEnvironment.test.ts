import { describe, expect, it, vi } from "vitest";
import { createNativeVectorIndexBinding, normalizeNativeEnvironment } from "./nativeEnvironment";
describe("real provider binding shapes", () => {
  it("calls the real Vectorize signature with the exact tenant filter and metadata", async () => {
    const raw = { upsert: vi.fn(), query: vi.fn(), getByIds: vi.fn(), deleteByIds: vi.fn() };
    const index = createNativeVectorIndexBinding(raw);
    await index.query({ vector: [0,1], topK: 5, filter: { tenantId: "tenant-a" } });
    expect(raw.query).toHaveBeenCalledWith([0,1],{ topK: 5, filter: { tenantId: "tenant-a" }, returnMetadata: "all" });
    await index.getByIds(["id-1"]);expect(raw.getByIds).toHaveBeenCalledWith(["id-1"]);
  });
  it("normalizes native namespace APIs only when the approved image configuration is present", () => {
    const raw = { idFromName: vi.fn(), get: vi.fn() };
    const env = { JOB_CONTAINERS: raw } as never;
    expect(normalizeNativeEnvironment(env).JOB_CONTAINERS).toBe(raw);
    expect(normalizeNativeEnvironment({ JOB_CONTAINERS: raw, CLOUDFLARE_RUNNER_IMAGE_REF: "latest" } as never).JOB_CONTAINERS).toBe(raw);
    expect(normalizeNativeEnvironment({ JOB_CONTAINERS: raw, CLOUDFLARE_RUNNER_IMAGE_REF: `registry.example.com/runner@sha256:${"a".repeat(64)}` } as never).JOB_CONTAINERS?.start).toBeTypeOf("function");
    expect(raw.get).not.toHaveBeenCalled();
  });
});
