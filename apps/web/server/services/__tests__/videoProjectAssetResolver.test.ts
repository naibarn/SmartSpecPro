/**
 * `videoProjectAssetResolver.ts` coverage (Feature 133, section-07 §2.3).
 * TRPC-style mocked `db` — asserts storage-proxy URL resolution, owner
 * isolation, and the compiled-config `buildAssetManifest` walk.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({ mockDb: { select: vi.fn() } }));
vi.mock("../../db", () => ({ db: mockDb }));

const { mockStorageResolveUrl } = vi.hoisted(() => ({ mockStorageResolveUrl: vi.fn() }));
vi.mock("../../storage", () => ({ storageResolveUrl: mockStorageResolveUrl }));

vi.mock("../appRuntimeConfig", () => ({
  getCachedInternalNodeUrl: () => "http://localhost:3000",
}));

import {
  resolveProjectAssets,
  buildAssetManifest,
  buildFontManifestSources,
  mergeAssetManifests,
  isAllowedInternalAssetUrl,
  assertSceneLayerAssetUrlsAllowed,
  assertDocumentLayerIdsUnique,
  fallbackAssetSourceHash,
  toBrowserAssetUrl,
} from "../videoProjectAssetResolver";
import { VideoProjectCompileError } from "../videoProjectCompiler";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";
import type { RemotionTemplateConfig } from "../../../shared/remotion/layerTemplateSchemas";

function selectChain(rows: unknown[]) {
  return { from: () => ({ where: () => Promise.resolve(rows) }) };
}

function baseDocument(overrides: Partial<VideoProjectDocument> = {}): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [
      {
        sceneId: "scene-1",
        startMs: 0,
        endMs: 5000,
        narration: null,
        narrationAudioAssetId: 5,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ],
    audioTracks: [{ kind: "narration", assetRefs: [6], gainDb: 0 }],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  } as VideoProjectDocument;
}

const AUTH = { tenantId: "tenant-1", userId: 42 };

beforeEach(() => {
  vi.clearAllMocks();
  // `computeContentSha256` fetches any asset lacking a stored checksum
  // (e.g. every `libraryItems` row) — stub `fetch` to fail closed so those
  // cases deterministically resolve to `sha256: undefined` in these tests,
  // matching "sha256 undefined where unknown" (section-07 §2.3).
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false } as Response)),
  );
});

describe("resolveProjectAssets", () => {
  it("resolves mediaAssets/libraryItems ids to storage-proxy URLs (batched, one select per table)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ id: 5, storageKey: "media/5.mp4", checksumSha256: "abc123def456" }]))
      .mockReturnValueOnce(selectChain([{ id: 6, sourceUrl: "/uploads/library/6.mp3" }]));
    mockStorageResolveUrl.mockResolvedValueOnce("/api/storage/files/media%2F5.mp4");

    const resolver = await resolveProjectAssets(baseDocument(), AUTH);

    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(resolver.url(5)).toBe("http://localhost:3000/api/storage/files/media%2F5.mp4");
    expect(resolver.url(6)).toBe("http://localhost:3000/uploads/library/6.mp3");
    expect(resolver.sha256(5)).toBe("abc123def456");
    expect(resolver.sha256(6)).toBeUndefined();
  });

  it("makes zero db.select calls when the document references no asset ids", async () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    const resolver = await resolveProjectAssets(document, AUTH);

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(() => resolver.url(1)).toThrow(VideoProjectCompileError);
  });

  it("refuses a foreign-tenant asset — throws VI_ASSET_UNRESOLVED listing the offending ids", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([])) // mediaAssets: id 5 not owned by this tenant/user
      .mockReturnValueOnce(selectChain([])); // libraryItems: id 6 not owned either

    await expect(resolveProjectAssets(baseDocument(), AUTH)).rejects.toMatchObject({
      code: "VI_ASSET_UNRESOLVED",
      message: expect.stringContaining("5"),
    });
  });

  it("rejects a libraryItems sourceUrl that is not a storage-proxy path (§17.3 SSRF allowlist)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ id: 6, sourceUrl: "https://evil.example.com/x.mp3" }]));

    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [{ kind: "narration", assetRefs: [6], gainDb: 0 }],
    });

    await expect(resolveProjectAssets(document, AUTH)).rejects.toMatchObject({
      code: "VI_ASSET_UNRESOLVED",
    });
  });

  /* ------------------------------------------------------------------------ */
  /* F133-01 CRITICAL — SSRF via unvalidated scene.layers[].src (fix proof)   */
  /* ------------------------------------------------------------------------ */

  function videoLayer(src: string) {
    return {
      id: "layer-1",
      type: "video" as const,
      startFrame: 0,
      durationFrames: 60,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src,
      trimStartSec: 0,
      volume: 1,
      muted: false,
    };
  }

  it("rejects a scene.layers[] video src pointing at a cloud-metadata IP (SSRF checkpoint 2 — VI_ASSET_UNRESOLVED)", async () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("http://169.254.169.254/latest/meta-data/iam/security-credentials/")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    await expect(resolveProjectAssets(document, AUTH)).rejects.toMatchObject({
      code: "VI_ASSET_UNRESOLVED",
      message: expect.stringContaining("169.254.169.254"),
    });
    // Rejected before any DB lookup is even attempted.
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("rejects a scene.layers[] video src on an arbitrary external host", async () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("https://evil.example.com/payload.mp4")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    await expect(resolveProjectAssets(document, AUTH)).rejects.toMatchObject({
      code: "VI_ASSET_UNRESOLVED",
    });
  });

  it("accepts a scene.layers[] video src that resolves to the internal storage-proxy origin", async () => {
    // §4.7(c)/RK7: the hand-authored layer's `src` has no asset id, so this
    // exercises the NEW storageKey-reverse-lookup path, not the id-based one
    // above — one `db.select` for the reverse storageKey lookup.
    mockDb.select.mockReturnValueOnce(
      selectChain([{ storageKey: "media/5.mp4", checksumSha256: "stored-real-hash-99" }]),
    );

    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("http://localhost:3000/api/storage/files/media%2F5.mp4")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    const resolver = await resolveProjectAssets(document, AUTH);
    expect(resolver).toBeDefined();
    expect(resolver.sha256ByUrl("http://localhost:3000/api/storage/files/media%2F5.mp4")).toBe(
      "stored-real-hash-99",
    );
  });

  it("§4.7(c)/RK7: a hand-authored layer src carries a REAL content hash in sha256ByUrl, not the URL-string fallback", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ storageKey: "media/7.mp4", checksumSha256: "content-hash-abc" }]),
    );

    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("http://localhost:3000/api/storage/files/media%2F7.mp4")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    const resolver = await resolveProjectAssets(document, AUTH);
    const url = "http://localhost:3000/api/storage/files/media%2F7.mp4";
    const actualHash = resolver.sha256ByUrl(url);

    expect(actualHash).toBe("content-hash-abc");
    expect(actualHash).not.toBe(fallbackAssetSourceHash(url));
  });

  it("falls back to a content fetch when no stored checksum row matches the layer src, and content-hashes the real bytes", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // no matching mediaAssets row
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const bytes = Buffer.from("real bytes");
        const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(arrayBuffer),
        } as unknown as Response);
      }),
    );

    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("http://localhost:3000/uploads/unknown.mp4")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    const resolver = await resolveProjectAssets(document, AUTH);
    const url = "http://localhost:3000/uploads/unknown.mp4";
    expect(resolver.sha256ByUrl(url)).toBe(createHash("sha256").update("real bytes").digest("hex"));
    expect(resolver.sha256ByUrl(url)).not.toBe(fallbackAssetSourceHash(url));
  });

  it("fails closed with VI_ASSET_UNRESOLVED when a hand-authored layer's content hash cannot be determined (no stored row, fetch fails)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // no matching mediaAssets row
    // Global `fetch` stub from `beforeEach` already resolves `{ ok: false }`.

    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [videoLayer("http://localhost:3000/uploads/unreachable.mp4")],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
      audioTracks: [],
    });

    await expect(resolveProjectAssets(document, AUTH)).rejects.toMatchObject({
      code: "VI_ASSET_UNRESOLVED",
      message: expect.stringContaining("unreachable.mp4"),
    });
  });
});

describe("toBrowserAssetUrl", () => {
  it("removes the internal origin while preserving the storage path", () => {
    expect(toBrowserAssetUrl("http://localhost:3000/api/storage/files/media/5.mp4"))
      .toBe("/api/storage/files/media/5.mp4");
  });

  it("preserves an intentionally external provider URL", () => {
    expect(toBrowserAssetUrl("https://cdn.example.com/media/5.mp4"))
      .toBe("https://cdn.example.com/media/5.mp4");
  });
});

describe("isAllowedInternalAssetUrl (§17.3 SSRF host allowlist)", () => {
  it("accepts the internal origin + storage-proxy path prefixes", () => {
    expect(isAllowedInternalAssetUrl("http://localhost:3000/api/storage/files/x.mp4")).toBe(true);
    expect(isAllowedInternalAssetUrl("http://localhost:3000/uploads/x.mp3")).toBe(true);
  });

  it("rejects file:// URLs", () => {
    expect(isAllowedInternalAssetUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects a cloud metadata endpoint even though it looks like a raw internal IP", () => {
    expect(isAllowedInternalAssetUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("rejects an arbitrary external host", () => {
    expect(isAllowedInternalAssetUrl("https://evil.example.com/x.mp4")).toBe(false);
  });

  it("rejects the correct internal origin with a non-storage-proxy path", () => {
    expect(isAllowedInternalAssetUrl("http://localhost:3000/admin/secret")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedInternalAssetUrl("not a url")).toBe(false);
  });
});

describe("assertSceneLayerAssetUrlsAllowed (F133-01 checkpoint helper)", () => {
  function docWithLayerSrc(src: string) {
    return baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [
            {
              id: "img-1",
              type: "image" as const,
              startFrame: 0,
              durationFrames: 60,
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotationDeg: 0,
              opacity: 1,
              zIndex: 0,
              src,
              fit: "cover" as const,
            },
          ],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
    });
  }

  it("throws with the given code for a disallowed src", () => {
    expect(() =>
      assertSceneLayerAssetUrlsAllowed(docWithLayerSrc("file:///etc/passwd"), "VI_DOCUMENT_INVALID"),
    ).toThrowError(expect.objectContaining({ code: "VI_DOCUMENT_INVALID" }));
  });

  it("does not throw for an allowed src", () => {
    expect(() =>
      assertSceneLayerAssetUrlsAllowed(
        docWithLayerSrc("http://localhost:3000/uploads/ok.png"),
        "VI_DOCUMENT_INVALID",
      ),
    ).not.toThrow();
  });
});

describe("assertDocumentLayerIdsUnique (Feature 143 §4.12 server-half id policy)", () => {
  function baseLayer(overrides: Record<string, unknown> = {}) {
    return {
      id: "layer-1",
      type: "image" as const,
      startFrame: 0,
      durationFrames: 60,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 0,
      src: "http://localhost:3000/uploads/ok.png",
      fit: "cover" as const,
      ...overrides,
    };
  }

  function baseScene(sceneId: string, layers: unknown[]) {
    return {
      sceneId,
      startMs: 0,
      endMs: 5000,
      narration: null,
      narrationAudioAssetId: null,
      visual: { kind: "layers" as const },
      layers,
      motion: { intensity: "medium" as const, camera: "static" },
      captionCues: [],
    };
  }

  it("does not throw when every layer id is unique within one scene", () => {
    const doc = baseDocument({
      scenes: [baseScene("scene-1", [baseLayer({ id: "a" }), baseLayer({ id: "b" })])],
    });
    expect(() => assertDocumentLayerIdsUnique(doc, "VI_DUPLICATE_LAYER_ID")).not.toThrow();
  });

  it("throws with the given code when two layers share an id within one scene", () => {
    const doc = baseDocument({
      scenes: [baseScene("scene-1", [baseLayer({ id: "dup" }), baseLayer({ id: "dup" })])],
    });
    expect(() => assertDocumentLayerIdsUnique(doc, "VI_DUPLICATE_LAYER_ID")).toThrowError(
      expect.objectContaining({ code: "VI_DUPLICATE_LAYER_ID" }),
    );
  });

  it("throws when the same layer id is reused ACROSS two different scenes (the documented failure mode)", () => {
    const doc = baseDocument({
      scenes: [
        baseScene("scene-1", [baseLayer({ id: "logo" })]),
        baseScene("scene-2", [baseLayer({ id: "logo" })]),
      ],
    });
    expect(() => assertDocumentLayerIdsUnique(doc, "VI_DUPLICATE_LAYER_ID")).toThrowError(
      expect.objectContaining({ code: "VI_DUPLICATE_LAYER_ID" }),
    );
  });
});

describe("buildAssetManifest", () => {
  function fakeResolverWithHashes(map: Record<string, string | undefined>) {
    return {
      url: vi.fn(),
      sha256: vi.fn(),
      sha256ByUrl: vi.fn((url: string) => map[url]),
    };
  }

  it("walks compiled layer src (video/image/audio) and skips text/svg — dedupes by url", () => {
    const config: RemotionTemplateConfig = {
      id: "cfg",
      name: "cfg",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 100,
      layers: [
        {
          id: "v1",
          type: "video",
          startFrame: 0,
          durationFrames: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src: "https://cdn.example.com/clip.mp4",
          trimStartSec: 0,
          volume: 1,
          muted: false,
        },
        // Duplicate src — must be deduped.
        {
          id: "v2",
          type: "video",
          startFrame: 10,
          durationFrames: 50,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 1,
          src: "https://cdn.example.com/clip.mp4",
          trimStartSec: 0,
          volume: 1,
          muted: false,
        },
        {
          id: "a1",
          type: "audio",
          startFrame: 0,
          durationFrames: 100,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 0,
          src: "https://cdn.example.com/audio.mp3",
          trimStartSec: 0,
          volume: 1,
          loop: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
        {
          id: "t1",
          type: "text",
          startFrame: 0,
          durationFrames: 100,
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          rotationDeg: 0,
          opacity: 1,
          zIndex: 900,
          content: "hello",
          fontFamily: "Inter",
          fontSizePx: 44,
          color: "#ffffff",
          textAlign: "center",
          fontWeight: "normal",
        },
      ],
    } as RemotionTemplateConfig;

    const resolver = fakeResolverWithHashes({
      "https://cdn.example.com/clip.mp4": "known-hash-1234",
      "https://cdn.example.com/audio.mp3": undefined,
    });

    const manifest = buildAssetManifest(config, resolver);

    expect(manifest.sources).toEqual([
      { role: "video", url: "https://cdn.example.com/clip.mp4", sha256: "known-hash-1234" },
      { role: "audio", url: "https://cdn.example.com/audio.mp3", sha256: undefined },
    ]);
  });

  it("mergeAssetManifests dedupes sources across multiple manifests by url", () => {
    const merged = mergeAssetManifests([
      { sources: [{ role: "video", url: "https://a", sha256: "h1" }] },
      { sources: [{ role: "video", url: "https://a", sha256: "h1" }, { role: "audio", url: "https://b", sha256: undefined }] },
    ]);
    expect(merged.sources).toHaveLength(2);
  });
});

describe("buildFontManifestSources (Feature 143 §4.10 / RK12)", () => {
  function textLayer(fontFamily: string) {
    return {
      id: "text-1",
      type: "text" as const,
      startFrame: 0,
      durationFrames: 60,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      rotationDeg: 0,
      opacity: 1,
      zIndex: 900,
      content: "สวัสดี",
      fontFamily,
      fontSizePx: 48,
      color: "#ffffff",
      textAlign: "center" as const,
      fontWeight: "normal" as const,
    };
  }

  function configWithLayers(layers: unknown[]): RemotionTemplateConfig {
    return {
      id: "cfg",
      name: "cfg",
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 100,
      layers,
    } as RemotionTemplateConfig;
  }

  const FAKE_CSS2 = [
    "/* thai */",
    "@font-face {",
    "  font-family: 'Sarabun';",
    "  font-style: normal;",
    "  font-weight: 400;",
    "  src: url(https://fonts.gstatic.com/s/sarabun/v17/fake-thai.woff2) format('woff2');",
    "}",
  ].join("\n");

  it("emits one role:font source per DISTINCT allowlisted family used by text layers, with a real content hash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("fonts.googleapis.com")) {
          return Promise.resolve({ ok: true, text: () => Promise.resolve(FAKE_CSS2) } as unknown as Response);
        }
        if (url.includes("fonts.gstatic.com")) {
          const bytes = Buffer.from("fake font bytes");
          const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(arrayBuffer) } as unknown as Response);
        }
        return Promise.resolve({ ok: false } as Response);
      }),
    );

    const config = configWithLayers([textLayer("Sarabun"), textLayer("Sarabun"), textLayer("Prompt")]);
    // "Prompt" resolves through the same fake CSS2/gstatic stub — real
    // per-family fetch calls aren't asserted here (network shape), just
    // that a role:"font" source with a REAL content hash is produced.

    const sources = await buildFontManifestSources(config);

    expect(sources).toHaveLength(2); // one per DISTINCT family, not per layer
    for (const source of sources) {
      expect(source.role).toBe("font");
      expect(source.sha256).toBe(createHash("sha256").update("fake font bytes").digest("hex"));
      expect(source.sha256).not.toBe(fallbackAssetSourceHash(source.url));
    }
  });

  it("skips a fontFamily that is not on the allowlist (no manifest entry, no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const config = configWithLayers([textLayer("Comic Sans MS")]);
    const sources = await buildFontManifestSources(config);

    expect(sources).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("soft-degrades to no manifest entry (never throws) when the Google Fonts fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false } as Response)));

    const config = configWithLayers([textLayer("Sarabun")]);
    const sources = await buildFontManifestSources(config);

    expect(sources).toEqual([]);
  });

  it("returns no sources when no text layer is present", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const config = configWithLayers([]);
    const sources = await buildFontManifestSources(config);

    expect(sources).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
