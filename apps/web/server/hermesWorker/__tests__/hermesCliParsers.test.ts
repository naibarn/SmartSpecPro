import { describe, expect, it } from "vitest";

import {
  buildCapabilityManifest,
  classifyHermesFailureOutput,
  parseHermesAuthStatusOutput,
  parseHermesDeviceCodeOutput,
  parseHermesToolsOutput,
} from "../hermesCliParsers";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const now = () => NOW;

describe("parseHermesDeviceCodeOutput", () => {
  it("extracts verificationUrl + userCode from URL and code on the same line", () => {
    const result = parseHermesDeviceCodeOutput(
      "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
      { now },
    );
    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
    expect(result.userCode).toBe("ABCD-EFGH");
  });

  it("regression (Hermes 0.18.x real output): extracts the userCode EMBEDDED in the URL's user_code query param when no separate code line exists", () => {
    // Exact shape observed in production on 2026-08-02 (worker_job_events
    // hermes_device_code raw payload) — the URL-stripping pass removed the
    // whole URL before the code scan, so this parsed to { raw } and the UI
    // surfaced HERMES_PROCESS_FAILED instead of the code.
    const result = parseHermesDeviceCodeOutput(
      ["To continue:", "1. Open: https://accounts.x.ai/oauth2/device?user_code=RSF3-GNZF"].join("\n"),
      { now },
    );
    expect(result.verificationUrl).toBe("https://accounts.x.ai/oauth2/device?user_code=RSF3-GNZF");
    expect(result.userCode).toBe("RSF3-GNZF");
    expect(result.raw).toBeUndefined();
  });

  it("still prefers a separate explicit code line over a URL-embedded user_code param", () => {
    const result = parseHermesDeviceCodeOutput(
      [
        "Open: https://accounts.x.ai/oauth2/device?user_code=AAAA-BBBB",
        "Then enter code: CCCC-DDDD",
      ].join("\n"),
      { now },
    );
    expect(result.userCode).toBe("CCCC-DDDD");
  });

  it("extracts verificationUrl + userCode when they are on separate lines", () => {
    const result = parseHermesDeviceCodeOutput(
      ["Please open: https://accounts.x.ai/device", "Then enter code: ABCD-EFGH"].join("\n"),
      { now },
    );
    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
    expect(result.userCode).toBe("ABCD-EFGH");
  });

  it("extracts from decorated (box-drawing, padded/indented) output", () => {
    const decorated = [
      "╔══════════════════════════════════════════╗",
      "║ Visit https://accounts.x.ai/device        ║",
      "║ and enter code: ABCD-EFGH                 ║",
      "╚══════════════════════════════════════════╝",
    ].join("\n");
    const result = parseHermesDeviceCodeOutput(decorated, { now });
    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
    expect(result.userCode).toBe("ABCD-EFGH");
  });

  it("populates expiresAt when an expiry line is present", () => {
    const result = parseHermesDeviceCodeOutput(
      [
        "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
        "This code expires in 15 minutes.",
      ].join("\n"),
      { now },
    );
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
  });

  it("leaves expiresAt undefined when no expiry line is present", () => {
    const result = parseHermesDeviceCodeOutput(
      "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
      { now },
    );
    expect(result.expiresAt).toBeUndefined();
  });

  it("falls back to { raw } for unparseable output (no URL, no code) and never throws", () => {
    const result = parseHermesDeviceCodeOutput(
      "Waiting for device authorization... please check your terminal.",
      { now },
    );
    expect(result.raw).toContain("Waiting for device authorization");
    expect(result.verificationUrl).toBeUndefined();
    expect(result.userCode).toBeUndefined();
  });

  it("never returns a half-parsed code without its URL also present — falls back to raw instead", () => {
    const result = parseHermesDeviceCodeOutput("Enter code: ABCD-EFGH", { now });
    expect(result.userCode).toBeUndefined();
    expect(result.verificationUrl).toBeUndefined();
    expect(result.raw).toContain("ABCD-EFGH");
  });

  it("never returns a URL without a code also present — falls back to raw instead", () => {
    const result = parseHermesDeviceCodeOutput("Visit https://accounts.x.ai/device", { now });
    expect(result.verificationUrl).toBeUndefined();
    expect(result.raw).toContain("https://accounts.x.ai/device");
  });

  it("returns {} for a completely empty buffer", () => {
    expect(parseHermesDeviceCodeOutput("", { now })).toEqual({});
  });

  it("prefers an xAI host when multiple URLs are present", () => {
    const result = parseHermesDeviceCodeOutput(
      "See docs at https://example.com/help or visit https://accounts.x.ai/device and enter ABCD-EFGH",
      { now },
    );
    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
  });
});

describe("parseHermesAuthStatusOutput", () => {
  it("returns authorized: true with accountHint for an authenticated status", () => {
    const result = parseHermesAuthStatusOutput("Status: authenticated\nAccount: grok-fan@example.com");
    expect(result.authorized).toBe(true);
    expect(result.accountHint).toBe("grok-fan@example.com");
  });

  it("returns authorized: false for a not-authenticated status", () => {
    expect(parseHermesAuthStatusOutput("Status: not authenticated").authorized).toBe(false);
  });

  it("returns authorized: false for garbage input", () => {
    expect(parseHermesAuthStatusOutput("asdlkfjasldkfj 1234 !!!").authorized).toBe(false);
  });
});

describe("parseHermesToolsOutput + buildCapabilityManifest", () => {
  it("enables only the operations whose tool identifier appears in the output", () => {
    const ops = parseHermesToolsOutput("Available tools:\n- image.generate\n- image.edit");
    expect(ops.sort()).toEqual(["image.edit", "image.generate"]);
  });

  it("regression (Hermes 0.18.x real `tools list` output): recognizes image_gen/video_gen toolset ids, IGNORING the ✗ disabled state", () => {
    // Exact production shape observed 2026-08-02. `video_gen` is ✗ disabled
    // by Hermes default in a fresh managed profile, but media jobs always
    // force `--toolsets video_gen` at invocation and config.yaml pins
    // provider: xai — the toolset existing means the operation is runnable.
    const realOutput = [
      "  ✓ enabled  vision  👁️  Vision / Image Analysis",
      "  ✗ disabled  video  🎬 Video Analysis",
      "  ✓ enabled  image_gen  🎨 Image Generation",
      "  ✗ disabled  video_gen  🎬 Video Generation",
    ].join("\n");
    const ops = parseHermesToolsOutput(realOutput);
    expect(ops).toContain("image.generate");
    expect(ops).toContain("video.generate");
    expect(ops).toContain("video.image_to_video");
  });

  it("regression: `status --all`-style output with NO media-tools section parses to zero operations (why the probe had to move to `tools list`)", () => {
    const statusAllOutput = [
      "◆ Environment",
      "  Provider:     xAI Grok OAuth (SuperGrok / Premium+)",
      "◆ Auth Providers",
      "  xAI OAuth     ✓ logged in",
    ].join("\n");
    expect(parseHermesToolsOutput(statusAllOutput)).toEqual([]);
  });

  it("gates video.* enabled:false with a reason when only image tools appear (post-auth)", () => {
    const manifest = buildCapabilityManifest({
      hermesVersion: "1.2.3",
      toolsOutput: "Available tools:\n- image.generate\n- image.edit",
      authStatus: { authorized: true, accountHint: "grok-fan" },
      probedAt: NOW.toISOString(),
    });
    expect(manifest.hermesVersion).toBe("1.2.3");
    expect(manifest.probedAt).toBe(NOW.toISOString());
    expect(manifest.operations["image.generate"]?.enabled).toBe(true);
    expect(manifest.operations["image.edit"]?.enabled).toBe(true);
    expect(manifest.operations["video.generate"]?.enabled).toBe(false);
    expect(manifest.operations["video.generate"]?.reason).toBeTruthy();
    expect(manifest.operations["video.image_to_video"]?.enabled).toBe(false);
    expect(manifest.operations["video.reference_to_video"]?.enabled).toBe(false);
    expect(manifest.models).toEqual({ image: [], video: [] });
  });
});

describe("classifyHermesFailureOutput", () => {
  it("maps a 403-ish xAI error body to entitlement_restricted", () => {
    expect(classifyHermesFailureOutput("xAI API returned 403 Forbidden: entitlement required")).toBe(
      "entitlement_restricted",
    );
  });

  it("maps auth-invalid/revoked output to reauth_required", () => {
    expect(classifyHermesFailureOutput("Error: invalid_grant, session revoked")).toBe("reauth_required");
  });

  it("maps a denial phrase to oauth_denied", () => {
    expect(classifyHermesFailureOutput("Authorization denied by user.")).toBe("oauth_denied");
  });

  it("maps an expiry/timeout phrase to oauth_session_expired", () => {
    expect(classifyHermesFailureOutput("The device code has expired.")).toBe("oauth_session_expired");
    expect(classifyHermesFailureOutput("Operation timed out after 900s.")).toBe("oauth_session_expired");
  });

  it("maps anything else to a generic process failure", () => {
    expect(classifyHermesFailureOutput("hermes: unexpected internal error")).toBe("process_failed");
  });
});
