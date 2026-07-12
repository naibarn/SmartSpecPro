/**
 * `videoProjectAssetResolver.ts` coverage (Feature 133, section-07 §2.3).
 * TRPC-style mocked `db` — asserts storage-proxy URL resolution, owner
 * isolation, and the compiled-config `buildAssetManifest` walk.
 */
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
  mergeAssetManifests,
  isAllowedInternalAssetUrl,
  assertSceneLayerAssetUrlsAllowed,
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
