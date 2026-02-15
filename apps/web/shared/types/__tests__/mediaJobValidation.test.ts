import { describe, it, expect } from "vitest";
import {
  validateWebJobSpec,
  isInternalUri,
  validateCodecAllowlist,
  validateResolutionLimits,
  validateBitrateLimits,
  sanitizeUri,
} from "../mediaJobValidation";
import type { MediaJobSpec } from "../mediaJob";

function makeSpec(overrides: Partial<MediaJobSpec> = {}): MediaJobSpec {
  return {
    specVersion: "0.1",
    jobId: "test-job-1",
    jobType: "probe",
    inputs: { assets: [{ assetId: "a1", kind: "video", uri: "https://cdn.example.com/clip.mp4" }] },
    output: { mode: "file", target: "/tmp/out.mp4" },
    ...overrides,
  };
}

// ========================================
// isInternalUri
// ========================================

describe("isInternalUri", () => {
  it("detects IPv4 loopback (127.x.x.x)", () => {
    expect(isInternalUri("http://127.0.0.1/")).toBe(true);
    expect(isInternalUri("http://127.255.255.255/")).toBe(true);
  });

  it("detects IPv6 loopback (::1)", () => {
    expect(isInternalUri("http://[::1]/")).toBe(true);
  });

  it("detects link-local (169.254.x.x)", () => {
    expect(isInternalUri("http://169.254.1.1/")).toBe(true);
    expect(isInternalUri("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  it("detects private 10.x.x.x", () => {
    expect(isInternalUri("http://10.0.0.1/metadata")).toBe(true);
  });

  it("detects private 172.16-31.x.x", () => {
    expect(isInternalUri("http://172.16.0.1/admin")).toBe(true);
    expect(isInternalUri("http://172.31.255.255/")).toBe(true);
  });

  it("detects private 192.168.x.x", () => {
    expect(isInternalUri("http://192.168.1.1/config")).toBe(true);
  });

  it("detects localhost hostname", () => {
    expect(isInternalUri("http://localhost:8080/secret")).toBe(true);
  });

  it("detects 0.0.0.0", () => {
    expect(isInternalUri("http://0.0.0.0/")).toBe(true);
  });

  it("returns false for public IPs", () => {
    expect(isInternalUri("http://8.8.8.8/")).toBe(false);
    expect(isInternalUri("https://1.1.1.1/dns-query")).toBe(false);
  });

  it("returns false for valid domain names", () => {
    expect(isInternalUri("https://cdn.example.com/file.mp4")).toBe(false);
    expect(isInternalUri("https://storage.googleapis.com/bucket/file")).toBe(false);
  });
});

// ========================================
// sanitizeUri
// ========================================

describe("sanitizeUri", () => {
  it("rejects file:// URIs on web_backend", () => {
    expect(() => sanitizeUri("file:///etc/passwd", "web_backend")).toThrow(/file:\/\//i);
  });

  it("allows file:// URIs on desktop_sidecar", () => {
    expect(() => sanitizeUri("file:///Users/me/video.mp4", "desktop_sidecar")).not.toThrow();
  });

  it("rejects internal URIs on web_backend", () => {
    expect(() => sanitizeUri("http://localhost:8080/secret", "web_backend")).toThrow(/internal|localhost|private/i);
  });

  it("allows valid https:// URIs on web_backend", () => {
    expect(sanitizeUri("https://storage.example.com/media/clip.mp4", "web_backend"))
      .toBe("https://storage.example.com/media/clip.mp4");
  });

  it("rejects URIs with shell metacharacters", () => {
    expect(() => sanitizeUri("https://example.com/file;rm", "web_backend")).toThrow(/metacharacter/i);
    expect(() => sanitizeUri("https://example.com/file|cat", "desktop_sidecar")).toThrow(/metacharacter/i);
  });
});

// ========================================
// validateWebJobSpec — SSRF prevention
// ========================================

describe("validateWebJobSpec (SSRF prevention)", () => {
  it("rejects localhost URI on web_backend", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "http://localhost:8080/secret" }] },
      engine: { strategy: "web_backend" },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /internal|localhost|private/i.test(e))).toBe(true);
  });

  it("rejects internal IP URIs (10.x)", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "http://10.0.0.1/metadata" }] },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
  });

  it("rejects cloud metadata endpoint (169.254.169.254)", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "http://169.254.169.254/latest/meta-data/" }] },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
  });

  it("rejects file:// URIs on web_backend", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "file:///etc/passwd" }] },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
  });

  it("allows file:// URIs on desktop_sidecar", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "file:///Users/me/video.mp4" }] },
    });
    const result = validateWebJobSpec(spec, "desktop_sidecar");
    expect(result.valid).toBe(true);
  });

  it("allows valid https:// URIs on web_backend", () => {
    const spec = makeSpec({
      inputs: { assets: [{ assetId: "a1", kind: "video", uri: "https://storage.example.com/media/clip.mp4" }] },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(true);
  });
});

// ========================================
// validateWebJobSpec — path traversal
// ========================================

describe("validateWebJobSpec (path traversal)", () => {
  it("rejects paths with traversal (..)", () => {
    const spec = makeSpec({
      output: { mode: "file", target: "../../../etc/shadow" },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /traversal/i.test(e))).toBe(true);
  });

  it("rejects URL-encoded traversal (%2e%2e)", () => {
    const spec = makeSpec({
      output: { mode: "file", target: "%2e%2e/%2e%2e/etc/passwd" },
    });
    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /traversal/i.test(e))).toBe(true);
  });
});

describe("validateWebJobSpec (text color sanitization)", () => {
  it("rejects invalid text color values in project clips", () => {
    const spec = makeSpec({
      jobType: "render_mp4_h264",
      inputs: {
        assets: [{ assetId: "a1", kind: "video", uri: "https://cdn.example.com/clip.mp4" }],
        project: {
          projectId: "proj-text-color",
          fps: 30,
          width: 1920,
          height: 1080,
          tracks: [
            {
              trackId: "t1",
              type: "subtitle",
              clips: [
                {
                  clipId: "txt-1",
                  assetId: "a1",
                  startMs: 0,
                  outMs: 1000,
                  textConfig: {
                    text: "hello",
                    fontFamily: "Noto Sans",
                    fontSize: 40,
                    fontWeight: 700,
                    fontStyle: "normal",
                    color: "red:fontsize=500",
                    backgroundColor: "transparent",
                    textAlign: "center",
                    effect: "none",
                  },
                },
              ],
            },
          ],
        },
      } as MediaJobSpec["inputs"],
    });

    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /textConfig\.color/i.test(e))).toBe(true);
  });

  it("accepts valid #RRGGBB text color fields", () => {
    const spec = makeSpec({
      jobType: "render_mp4_h264",
      inputs: {
        assets: [{ assetId: "a1", kind: "video", uri: "https://cdn.example.com/clip.mp4" }],
        project: {
          projectId: "proj-valid-color",
          fps: 30,
          width: 1920,
          height: 1080,
          tracks: [
            {
              trackId: "t1",
              type: "subtitle",
              clips: [
                {
                  clipId: "txt-1",
                  assetId: "a1",
                  startMs: 0,
                  outMs: 1000,
                  textConfig: {
                    text: "hello",
                    fontFamily: "Noto Sans",
                    fontSize: 40,
                    fontWeight: 700,
                    fontStyle: "normal",
                    color: "#FFFFFF",
                    backgroundColor: "#000000",
                    textAlign: "center",
                    effect: "none",
                    effectColor: "#111111",
                  },
                },
              ],
            },
          ],
        },
      } as MediaJobSpec["inputs"],
    });

    const result = validateWebJobSpec(spec, "web_backend");
    expect(result.valid).toBe(true);
  });
});

// ========================================
// validateCodecAllowlist
// ========================================

describe("validateCodecAllowlist", () => {
  it("rejects unknown codecs", () => {
    expect(validateCodecAllowlist("custom_evil_codec")).toBe(false);
    expect(validateCodecAllowlist("rm -rf /")).toBe(false);
  });

  it("accepts known safe codecs", () => {
    expect(validateCodecAllowlist("libx264")).toBe(true);
    expect(validateCodecAllowlist("libx265")).toBe(true);
    expect(validateCodecAllowlist("aac")).toBe(true);
    expect(validateCodecAllowlist("libmp3lame")).toBe(true);
    expect(validateCodecAllowlist("copy")).toBe(true);
    expect(validateCodecAllowlist("h264_nvenc")).toBe(true);
  });
});

// ========================================
// validateBitrateLimits
// ========================================

describe("validateBitrateLimits", () => {
  it("enforces video bitrate limit", () => {
    const result = validateBitrateLimits({ videoBitrateKbps: 100000 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /video.*bitrate/i.test(e))).toBe(true);
  });

  it("enforces audio bitrate limit", () => {
    const result = validateBitrateLimits({ audioBitrateKbps: 1000 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /audio.*bitrate/i.test(e))).toBe(true);
  });

  it("accepts bitrates within limits", () => {
    const result = validateBitrateLimits({ videoBitrateKbps: 5000, audioBitrateKbps: 128 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ========================================
// validateResolutionLimits
// ========================================

describe("validateResolutionLimits", () => {
  it("enforces max resolution (rejects 8K)", () => {
    const result = validateResolutionLimits(7680, 4320);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /resolution/i.test(e))).toBe(true);
  });

  it("accepts resolutions within limits (1080p)", () => {
    const result = validateResolutionLimits(1920, 1080);
    expect(result.valid).toBe(true);
  });

  it("accepts 4K resolution", () => {
    const result = validateResolutionLimits(3840, 2160);
    expect(result.valid).toBe(true);
  });

  it("rejects degenerate dimensions", () => {
    const result = validateResolutionLimits(1, 8294400);
    expect(result.valid).toBe(false);
  });
});
