import { describe, expect, it, vi } from "vitest";

vi.mock("../mcpDownloadBrokerService", () => ({
  createProviderManagedStorageDownloadRef: vi.fn(async (storageKey: string) => ({
    downloadRef: `download-ref-for-${storageKey}`,
    expiresInSeconds: 1800,
    fileName: storageKey.split("/").pop() || "reference.png",
    contentType: "image/png",
  })),
}));

import {
  buildPythonBackendExtraParamsForTest,
  buildMediaRequestAuditPayload,
  buildManagedStorageDownloadUrl,
  resolveExternalMediaMessageUrls,
  resolveExternalMediaReferenceUrls,
  normalizeMediaPrompt,
  resolveReferenceImageUrlsForModelForTest,
} from "../mediaGenerationService";

describe("buildManagedStorageDownloadUrl", () => {
  it("keeps the provider-visible file extension while preserving the signed ref", () => {
    expect(buildManagedStorageDownloadUrl(
      "https://smartaihub.app",
      "signed.ref.token",
      "output-123.png",
    )).toBe(
      "https://smartaihub.app/api/mcp/downloads/signed.ref.token/output-123.png",
    );
  });

  it("encodes filenames without dropping their extension", () => {
    expect(buildManagedStorageDownloadUrl(
      "https://smartaihub.app/",
      "signed.ref.token",
      "reference image.webp",
    )).toBe(
      "https://smartaihub.app/api/mcp/downloads/signed.ref.token/reference%20image.webp",
    );
  });
});

describe("resolveExternalMediaReferenceUrls", () => {
  it("leaves already-public provider URLs unchanged", async () => {
    await expect(
      resolveExternalMediaReferenceUrls(["https://cdn.example.com/reference.png"]),
    ).resolves.toEqual(["https://cdn.example.com/reference.png"]);
  });

  it("rejects a managed storage reference without tenant-scoped identity", async () => {
    await expect(
      resolveExternalMediaReferenceUrls(
        ["/api/storage/files/tenant-a/reference.png"],
        undefined,
        "https://smartaihub.app",
      ),
    ).rejects.toThrow("tenant-scoped access");
  });

  it("brokers managed storage references with tenant-scoped identity", async () => {
    await expect(
      resolveExternalMediaReferenceUrls(
        ["/api/storage/files/tenant-a/reference.png"],
        { userId: 24, tenantId: "tenant-a" },
        "https://smartaihub.app",
      ),
    ).resolves.toEqual([
      "https://smartaihub.app/api/mcp/downloads/download-ref-for-tenant-a%2Freference.png/reference.png",
    ]);
  });

  it("brokers an absolute protected storage URL before external provider access", async () => {
    await expect(
      resolveExternalMediaReferenceUrls(
        ["https://smartaihub.app/api/storage/files/tenant-a/reference.png"],
        { userId: 24, tenantId: "tenant-a" },
        "https://smartaihub.app",
      ),
    ).resolves.toEqual([
      "https://smartaihub.app/api/mcp/downloads/download-ref-for-tenant-a%2Freference.png/reference.png",
    ]);
  });
});

describe("resolveExternalMediaMessageUrls", () => {
  it("preserves public image and file message URLs while retaining metadata", async () => {
    const messages = await resolveExternalMediaMessageUrls([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe these files",
          },
          {
            type: "image_url",
            image_url: {
              url: "https://cdn.example.com/reference.png",
              detail: "high",
            },
          },
          {
            type: "file_url",
            file_url: {
              url: "https://cdn.example.com/reference.pdf",
              name: "reference.pdf",
            },
          },
        ],
      },
    ]);

    expect(messages[0]?.content).toEqual([
      {
        type: "text",
        text: "Describe these files",
      },
      {
        type: "image_url",
        image_url: {
          url: "https://cdn.example.com/reference.png",
          detail: "high",
        },
      },
      {
        type: "file_url",
        file_url: {
          url: "https://cdn.example.com/reference.pdf",
          name: "reference.pdf",
        },
      },
    ]);
  });

  it("converts managed image message URLs to signed broker URLs", async () => {
    const messages = await resolveExternalMediaMessageUrls(
      [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: "https://smartaihub.app/api/storage/files/chat/uploads/tenant-a/42/reference.png",
                detail: "high",
              },
            },
          ],
        },
      ],
      { userId: 42, tenantId: "tenant-a" },
      "https://smartaihub.app",
    );

    expect(messages[0]?.content).toEqual([
      {
        type: "image_url",
        image_url: {
          url: "https://smartaihub.app/api/mcp/downloads/download-ref-for-chat%2Fuploads%2Ftenant-a%2F42%2Freference.png/reference.png",
          detail: "high",
        },
      },
    ]);
  });
});

describe("normalizeMediaPrompt", () => {
  it("keeps plain text prompts (trimmed)", () => {
    expect(normalizeMediaPrompt("  cinematic shot of sunrise  ")).toBe("cinematic shot of sunrise");
  });

  it("unwraps fenced json blocks into plain json text", () => {
    const fenced = "```json\n{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}");
  });

  it("unwraps generic fenced blocks", () => {
    const fenced = "```\nA vivid watercolor landscape with soft light\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("A vivid watercolor landscape with soft light");
  });

  it("normalizes json label prefix to plain json text", () => {
    const malformed = "json\n{\n  \"prompt\": \"hello image\"\n}";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("removes orphaned markdown fence lines from malformed output", () => {
    const malformed = "```json\n{\n  \"prompt\": \"hello image\"\n}\n";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeMediaPrompt(null)).toBe("");
    expect(normalizeMediaPrompt(undefined)).toBe("");
  });
});

describe("buildPythonBackendExtraParams", () => {
  it("normalizes existing duplicated ratio aliases to the top-level value", () => {
    expect(buildPythonBackendExtraParamsForTest({
      aspect_ratio: "16:9",
      aspectRatio: "16:9",
      nsfw_checker: false,
    }, undefined, "9:16")).toEqual({
      aspect_ratio: "9:16",
      aspectRatio: "9:16",
      nsfw_checker: false,
    });
  });

  it("does not invent a ratio alias when the model has none", () => {
    expect(buildPythonBackendExtraParamsForTest({ nsfw_checker: false }, undefined, "9:16"))
      .toEqual({ nsfw_checker: false });
  });

  it("keeps persisted provenance but removes provider-internal manifest/debug metadata before backend submit", () => {
    expect(
      buildPythonBackendExtraParamsForTest(
        {
          quality: "high",
          reference_image_manifest: [
            {
              placeholder: "@Image1",
              role: "product",
              url: "/api/storage/files/very-long-product-url.jpg",
            },
          ],
          reference_image_role_order: ["@Image1=product"],
          reference_image_role_counts: { product: 1, total: 1 },
          __reference_image_manifest: [
            { url: "/api/storage/files/duplicate.jpg" },
          ],
          __origin_surface: "marketplace_auto_review",
          __marketplace_product_id: "mp_123",
          __auto_review_run_id: "auto_run_82",
          __prompt_safety: {
            checked: true,
            mode: "standard",
            skillId: "image-prompt-safety-rewriter",
            skillVersion: "1.0.0",
          },
          __debug_prompt_dump: "do not persist",
          marketplaceContext: { productName: "internal only" },
        },
        "https://tenant.example.com"
      )
    ).toEqual({
      quality: "high",
      __origin_surface: "marketplace_auto_review",
      __marketplace_product_id: "mp_123",
      __auto_review_run_id: "auto_run_82",
      __prompt_safety: {
        checked: true,
        mode: "standard",
        skillId: "image-prompt-safety-rewriter",
        skillVersion: "1.0.0",
      },
    });
  });

  it("keeps cover credit reservation metadata in the task", () => {
    expect(
      buildPythonBackendExtraParamsForTest({
        __reserved_credits: 12,
        __credit_source_type: "media_image",
        __credit_reservation_key: "cover-attempt-1",
        __vd_purpose: "episode_cover",
        __prompt_safety: {
          checked: true,
          mode: "vertical_drama_cover",
          skillId: "vertical-drama-episode-cover-safety-rewriter",
          safePromptHash: "hash",
        },
      }),
    ).toEqual({
      __reserved_credits: 12,
      __credit_source_type: "media_image",
      __credit_reservation_key: "cover-attempt-1",
      __vd_purpose: "episode_cover",
      __prompt_safety: {
        checked: true,
        mode: "vertical_drama_cover",
        skillId: "vertical-drama-episode-cover-safety-rewriter",
        safePromptHash: "hash",
      },
    });
  });
});

describe("buildMediaRequestAuditPayload", () => {
  it("emits bounded target telemetry without prompt, negative, or reference content", () => {
    const payload = buildMediaRequestAuditPayload({
      request: {
        prompt: "natural human portrait with visible pores",
        model: "gpt-image-2",
        negativePrompt: "plastic skin",
        referenceImageUrls: ["https://example.com/face.png"],
        characterPromptContext: {
          marker: "vertical_drama_character_v1",
          contractVersion: "vd_character_natural_human_v1",
          target: true,
          family: "gpt_image_2",
          maxPromptChars: 20_000,
          promptProfile: "rich",
          semanticRetryCount: 1,
        },
      },
      requestType: "generateImageAsync",
      mediaType: "image",
      provider: "kie.ai",
      model: "gpt-image-2",
      endpoint: "/api/v1/media/async/image",
      payload: {
        prompt: "natural human portrait with visible pores",
        negative_prompt: "plastic skin",
        reference_image_urls: ["https://example.com/face.png"],
      },
    });

    expect(payload).toEqual({
      source: "media_generation_service",
      stage: null,
      endpoint: "/api/v1/media/async/image",
      provider: "kie.ai",
      model: "gpt-image-2",
      model_id: "gpt-image-2",
      request_type: "generateImageAsync",
      family: "gpt_image_2",
      prompt_profile: "rich",
      max_prompt_chars: 20_000,
      prompt_length: 41,
      semantic_retry_count: 1,
      negative_prompt_submitted: false,
      contract_version: "vd_character_natural_human_v1",
      reference_image_count: 1,
    });
    expect(payload).not.toHaveProperty("prompt");
    expect(payload).not.toHaveProperty("negative_prompt");
    expect(payload).not.toHaveProperty("reference_image_urls");
  });
});

describe("resolveReferenceImageUrlsForModel webp vs jpg rules", () => {
  it("preserves the complete validated order for profile-backed video bundles", () => {
    const input = Array.from({ length: 8 }, (_, index) =>
      `https://smartaihub.app/api/storage/files/ref-${index}.png`,
    );
    expect(
      resolveReferenceImageUrlsForModelForTest(
        "future-profile-video",
        input,
        "https://smartaihub.app",
        true,
      ),
    ).toEqual(input);
  });

  it("converts .webp reference image URLs to .jpg for gpt-image models", () => {
    const input = [
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_01.webp",
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_02.webp?v=1",
    ];
    const resolved = resolveReferenceImageUrlsForModelForTest(
      "gpt-image-2-image-to-image",
      input,
      "https://smartaihub.app"
    );
    expect(resolved).toEqual([
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_01.jpg",
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_02.jpg?v=1",
    ]);
  });

  it("preserves .webp reference image URLs as .webp for google-banana models (banana-2, banana-lite, banana-pro)", () => {
    const input = [
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_01.webp",
    ];
    const resolvedBanana2 = resolveReferenceImageUrlsForModelForTest(
      "google-banana-2",
      input,
      "https://smartaihub.app"
    );
    expect(resolvedBanana2).toEqual([
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_01.webp",
    ]);

    const resolvedBananaLite = resolveReferenceImageUrlsForModelForTest(
      "nano-banana-2-lite",
      input,
      "https://smartaihub.app"
    );
    expect(resolvedBananaLite).toEqual([
      "https://smartaihub.app/api/storage/files/marketplace-captures/cap-1/images/asset_01.webp",
    ]);
  });
});
