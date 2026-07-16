import { describe, expect, it } from "vitest";

import {
  HERMES_MEDIA_ERROR_CODES,
  effectiveHermesCapability,
  formatHermesErrorMessage,
  hermesErrorCopy,
  hermesMediaJobContractSchema,
  maskTokenLike,
  parseHermesErrorMessage,
  type HermesConnectionCapabilityManifest,
} from "../hermesMedia";

function buildReference(overrides: Partial<{
  assetId: string;
  index: number;
  role: string;
  label: string;
  sha256: string;
}> = {}) {
  return {
    assetId: "asset-1",
    index: 1,
    role: "subject",
    label: "primary",
    sha256: "a".repeat(64),
    ...overrides,
  };
}

function buildContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    contractVersion: 1,
    operation: "image.edit",
    connectionId: "conn-1",
    prompt: "a cinematic portrait",
    settings: { model: "grok-imagine-image" },
    references: [
      buildReference({ index: 1, label: "primary" }),
      buildReference({ index: 2, label: "secondary" }),
      buildReference({ index: 3, label: "tertiary" }),
    ],
    traceId: "trace-1",
    ...overrides,
  };
}

describe("hermesMediaJobContractSchema", () => {
  it("accepts a valid image.edit contract with 3 continuous, uniquely labeled references", () => {
    const result = hermesMediaJobContractSchema.safeParse(buildContract());
    expect(result.success).toBe(true);
  });

  it("rejects an image.edit contract with 4 references (operation-static max 3)", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        references: [
          buildReference({ index: 1, label: "a" }),
          buildReference({ index: 2, label: "b" }),
          buildReference({ index: 3, label: "c" }),
          buildReference({ index: 4, label: "d" }),
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects video.image_to_video with 0 references (exactly 1 required)", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        operation: "video.image_to_video",
        settings: { model: "grok-imagine-video" },
        references: [],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects video.image_to_video with 2 references (exactly 1 required)", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        operation: "video.image_to_video",
        settings: { model: "grok-imagine-video" },
        references: [
          buildReference({ index: 1, label: "a" }),
          buildReference({ index: 2, label: "b" }),
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects references with non-continuous indices (e.g. 1, 3)", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        references: [
          buildReference({ index: 1, label: "a" }),
          buildReference({ index: 3, label: "b" }),
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects two references with duplicate labels", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        references: [
          buildReference({ index: 1, label: "same" }),
          buildReference({ index: 2, label: "same" }),
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a reference containing an extra downloadUrl key (URL ban, .strict())", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({
        references: [
          { ...buildReference({ index: 1, label: "a" }), downloadUrl: "https://example.com/a.png" },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown operation string", () => {
    const result = hermesMediaJobContractSchema.safeParse(
      buildContract({ operation: "image.upscale" }),
    );
    expect(result.success).toBe(false);
  });
});

describe("hermesErrorCopy", () => {
  it("has non-empty th/en copy and a boolean retryable flag for every one of the 22 codes", () => {
    expect(HERMES_MEDIA_ERROR_CODES.length).toBe(22);
    for (const code of HERMES_MEDIA_ERROR_CODES) {
      const copy = hermesErrorCopy(code);
      expect(copy.th.length).toBeGreaterThan(0);
      expect(copy.en.length).toBeGreaterThan(0);
      expect(typeof copy.retryable).toBe("boolean");
    }
  });

  it("matches spec §13.7 retryability for spot-checked codes", () => {
    expect(hermesErrorCopy("HERMES_RATE_LIMITED").retryable).toBe(true);
    expect(hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").retryable).toBe(false);
    expect(hermesErrorCopy("HERMES_JOB_CANCELLED").retryable).toBe(false);
  });

  it("uses the exact spec §12.3 Thai copy for HERMES_ENTITLEMENT_RESTRICTED", () => {
    expect(hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th).toBe(
      "เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API กรุณาตรวจสอบระดับสมาชิก",
    );
  });

  it("round-trips every error code through format/parse", () => {
    for (const code of HERMES_MEDIA_ERROR_CODES) {
      const formatted = formatHermesErrorMessage(code, "detail");
      expect(parseHermesErrorMessage(formatted)).toBe(code);
      expect(formatted.startsWith("[HERMES_")).toBe(true);
      expect(formatted).toContain(hermesErrorCopy(code).en);
    }
  });

  it("returns null for a plain, non-prefixed message", () => {
    expect(parseHermesErrorMessage("Something went wrong")).toBeNull();
  });
});

describe("effectiveHermesCapability", () => {
  const baseManifest: HermesConnectionCapabilityManifest = {
    hermesVersion: "1.0.0",
    probedAt: new Date().toISOString(),
    operations: {},
    models: { image: [], video: [] },
  };

  it("takes the min(maxReferences) of the model row and the manifest (row lower)", () => {
    const manifest: HermesConnectionCapabilityManifest = {
      ...baseManifest,
      operations: { "image.edit": { enabled: true, maxReferences: 7 } },
    };
    const result = effectiveHermesCapability({ enabled: true, maxReferences: 1 }, manifest, "image.edit");
    expect(result.maxReferences).toBe(1);
  });

  it("takes the min(maxReferences) of the model row and the manifest (manifest lower)", () => {
    const manifest: HermesConnectionCapabilityManifest = {
      ...baseManifest,
      operations: { "image.edit": { enabled: true, maxReferences: 1 } },
    };
    const result = effectiveHermesCapability({ enabled: true, maxReferences: 7 }, manifest, "image.edit");
    expect(result.maxReferences).toBe(1);
  });

  it("disables the operation when the model row disables it, even if the manifest allows it", () => {
    const manifest: HermesConnectionCapabilityManifest = {
      ...baseManifest,
      operations: { "image.edit": { enabled: true } },
    };
    const result = effectiveHermesCapability({ enabled: false }, manifest, "image.edit");
    expect(result.enabled).toBe(false);
  });

  it("disables the operation when the manifest disables it and surfaces the manifest reason", () => {
    const manifest: HermesConnectionCapabilityManifest = {
      ...baseManifest,
      operations: { "image.edit": { enabled: false, reason: "not entitled for this connection" } },
    };
    const result = effectiveHermesCapability({ enabled: true }, manifest, "image.edit");
    expect(result.enabled).toBe(false);
    expect(result.reason).toBe("not entitled for this connection");
  });

  it("a model-row value never widens a lower manifest value", () => {
    const manifest: HermesConnectionCapabilityManifest = {
      ...baseManifest,
      operations: { "image.edit": { enabled: true, maxReferences: 1 } },
    };
    const result = effectiveHermesCapability({ enabled: true, maxReferences: 7 }, manifest, "image.edit");
    expect(result.maxReferences).toBe(1);
  });

  it("falls back to the model row default when the manifest has no opinion on a field", () => {
    const result = effectiveHermesCapability(
      { enabled: true, maxReferences: 3, maxOutputs: 2 },
      null,
      "image.edit",
    );
    expect(result.enabled).toBe(true);
    expect(result.maxReferences).toBe(3);
    expect(result.maxOutputs).toBe(2);
  });
});

describe("maskTokenLike", () => {
  it("reveals only the first 4 characters plus a fixed ellipsis mask for values 8+ chars long", () => {
    expect(maskTokenLike("sk-abc123456789")).toBe("sk-a…");
  });

  it("reveals only the first 4 characters for a value that is exactly 8 characters long", () => {
    const value = "12345678";
    expect(value.length).toBe(8);
    const masked = maskTokenLike(value);
    expect(masked).toBe("1234…");
    expect(masked.replace("…", "")).toBe(value.slice(0, 4));
  });

  it("fully masks a value shorter than 8 characters (never partially reveals it)", () => {
    const value = "1234567";
    expect(value.length).toBe(7);
    const masked = maskTokenLike(value);
    expect(masked).toBe("***");
    expect(masked).not.toContain(value);
  });

  it("fully masks an empty string safely", () => {
    expect(maskTokenLike("")).toBe("***");
  });

  it("fully masks null/undefined safely", () => {
    expect(maskTokenLike(null)).toBe("***");
    expect(maskTokenLike(undefined)).toBe("***");
  });
});
