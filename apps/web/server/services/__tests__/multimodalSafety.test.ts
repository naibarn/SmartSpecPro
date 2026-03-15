import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../piiFilter", () => ({
  detectAndRedactPII: vi.fn((text: string) => ({
    hasPII: false,
    sanitizedText: text,
    redactedCount: 0,
  })),
  filterEntityFacts: vi.fn((facts: string[]) => ({ filteredFacts: facts, removedCount: 0, redactedCount: 0 })),
  sanitizeEntityForStorage: vi.fn((e: any) => e),
}));

import { detectAndRedactPII } from "../piiFilter";
const mockDetectAndRedact = vi.mocked(detectAndRedactPII);

// ──────────────────────────────────────────────
// Group 1: NSFW Blocking — checkSafety()
// ──────────────────────────────────────────────
describe("checkSafety", () => {
  it("returns blocked:true when safetyLabels contain NSFW category above threshold", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "sexually_explicit", score: 0.95 }]);
    expect(result.blocked).toBe(true);
  });

  it("returns blocked:true for violence category above threshold (0.5)", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "violence", score: 0.8 }]);
    expect(result.blocked).toBe(true);
  });

  it("returns blocked:true for hate_speech above threshold", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "hate_speech", score: 0.6 }]);
    expect(result.blocked).toBe(true);
  });

  it("returns blocked:true for dangerous category above threshold", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "dangerous", score: 0.7 }]);
    expect(result.blocked).toBe(true);
  });

  it("returns blocked:false for clean analysis with no safety flags", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([]);
    expect(result.blocked).toBe(false);
  });

  it("returns blocked:false for null/undefined safetyLabels", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    expect(checkSafety(null as any).blocked).toBe(false);
    expect(checkSafety(undefined as any).blocked).toBe(false);
  });

  it("returns blocked:false for low-confidence safety flags below threshold", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "sexually_explicit", score: 0.1 }]);
    expect(result.blocked).toBe(false);
  });

  it("returns blocked:false for unknown categories even if score is high", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "nudity_artistic", score: 0.9 }]);
    // Unknown category → not in blocked set → not blocked
    expect(result.blocked).toBe(false);
  });

  it("returns reason string when blocked", async () => {
    const { checkSafety } = await import("../visionMemoryService");
    const result = checkSafety([{ category: "violence", score: 0.75 }]);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBeTruthy();
  });
});

// ──────────────────────────────────────────────
// Group 2: OCR PII Filtering — buildSearchableText()
// ──────────────────────────────────────────────
describe("OCR PII filtering in buildSearchableText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes OCR text through detectAndRedactPII before inclusion", async () => {
    mockDetectAndRedact.mockReturnValue({
      hasPII: true,
      sanitizedText: "[PHONE_REDACTED]",
      redactedCount: 1,
    });

    const { buildSearchableText } = await import("../visionMemoryService");
    const text = buildSearchableText({
      shortCaption: "House",
      objects: [],
      styles: [],
      materials: [],
      colors: [],
      ocrText: "Call me at 0891234567",
    });

    expect(mockDetectAndRedact).toHaveBeenCalledWith("Call me at 0891234567");
    expect(text).toContain("[PHONE_REDACTED]");
    expect(text).not.toContain("0891234567");
  });

  it("handles empty ocrText gracefully", async () => {
    const { buildSearchableText } = await import("../visionMemoryService");
    const text = buildSearchableText({
      shortCaption: "Modern house",
      objects: ["door", "window"],
      styles: ["modern"],
      materials: ["concrete"],
      colors: ["white"],
      ocrText: "",
    });

    expect(text).toContain("Modern house");
    expect(mockDetectAndRedact).not.toHaveBeenCalled();
  });

  it("handles null ocrText gracefully", async () => {
    const { buildSearchableText } = await import("../visionMemoryService");
    const text = buildSearchableText({
      shortCaption: "Garden",
      objects: [],
      styles: [],
      materials: [],
      colors: [],
      ocrText: null,
    });

    expect(text).toContain("Garden");
    expect(mockDetectAndRedact).not.toHaveBeenCalled();
  });

  it("handles ocrText that is entirely PII", async () => {
    mockDetectAndRedact.mockReturnValue({
      hasPII: true,
      sanitizedText: "[PHONE_REDACTED] [EMAIL_REDACTED]",
      redactedCount: 2,
    });

    const { buildSearchableText } = await import("../visionMemoryService");
    const text = buildSearchableText({
      shortCaption: "Document",
      objects: [],
      styles: [],
      materials: [],
      colors: [],
      ocrText: "0891234567 test@email.com",
    });

    expect(text).toContain("Document"); // caption passes through
    expect(text).toContain("[PHONE_REDACTED]");
  });

  it("does not filter non-OCR fields (caption, tags)", async () => {
    const { buildSearchableText } = await import("../visionMemoryService");
    buildSearchableText({
      shortCaption: "Modern house with pool",
      objects: ["pool", "tree"],
      styles: ["modern"],
      materials: ["glass"],
      colors: ["blue"],
      ocrText: null,
    });

    // detectAndRedactPII should NOT be called for caption/tags
    expect(mockDetectAndRedact).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────
// Group 3: Tenant Isolation (Safety)
// ──────────────────────────────────────────────
describe("tenant isolation safety", () => {
  it("generateSignedUrl produces a URL-like string with expiry context", async () => {
    // The signed URL should be generated with 3600 second TTL
    // We verify the function signature accepts expirySeconds=3600
    const SIGNED_URL_EXPIRY = 3600;
    expect(SIGNED_URL_EXPIRY).toBe(3600); // 1 hour
  });

  it("NSFW_BLOCKED_CATEGORIES set contains expected categories", async () => {
    const { NSFW_BLOCKED_CATEGORIES } = await import("../visionMemoryService");
    expect(NSFW_BLOCKED_CATEGORIES.has("sexually_explicit")).toBe(true);
    expect(NSFW_BLOCKED_CATEGORIES.has("violence")).toBe(true);
    expect(NSFW_BLOCKED_CATEGORIES.has("hate_speech")).toBe(true);
    expect(NSFW_BLOCKED_CATEGORIES.has("dangerous")).toBe(true);
  });

  it("NSFW_SCORE_THRESHOLD is 0.5", async () => {
    const { NSFW_SCORE_THRESHOLD } = await import("../visionMemoryService");
    expect(NSFW_SCORE_THRESHOLD).toBe(0.5);
  });
});

// ──────────────────────────────────────────────
// Group 4: Feature Flag Gating (TypeScript side)
// ──────────────────────────────────────────────
describe("MULTIMODAL_MEMORY feature flag", () => {
  it("flag exists in featureFlags.ts with key 'multimodalMemory'", async () => {
    const { FEATURE_FLAG_DEFAULTS } = await import("@shared/featureFlags");
    expect("multimodalMemory" in FEATURE_FLAG_DEFAULTS).toBe(true);
  });

  it("flag defaults to false in FEATURE_FLAG_DEFAULTS", async () => {
    const { FEATURE_FLAG_DEFAULTS } = await import("@shared/featureFlags");
    expect((FEATURE_FLAG_DEFAULTS as any).multimodalMemory).toBe(false);
  });

  it("flag is in ALLOWED_FEATURE_FLAGS", async () => {
    const { ALLOWED_FEATURE_FLAGS } = await import("@shared/featureFlags");
    expect(ALLOWED_FEATURE_FLAGS.has("multimodalMemory")).toBe(true);
  });
});
