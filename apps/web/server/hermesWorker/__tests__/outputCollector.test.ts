/**
 * Feature 135 — Hermes Grok media worker (section 07): `outputCollector.ts`
 * unit tests. Real filesystem via `mkdtemp` roots — no network/DB.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectOutputs, HermesOutputError } from "../outputCollector";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const BAD_MAGIC = Buffer.from("not a real image at all");

async function mkTempWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-oc-"));
  const outputDir = path.join(root, "output");
  const tmpDir = path.join(root, "tmp");
  const cacheDir = path.join(root, "cache", "images");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });
  return { root, outputDir, tmpDir, cacheDir };
}

describe("collectOutputs", () => {
  let ws: Awaited<ReturnType<typeof mkTempWorkspace>>;

  beforeEach(async () => {
    ws = await mkTempWorkspace();
  });
  afterEach(async () => {
    await fs.rm(ws.root, { recursive: true, force: true });
  });

  const window = { startedAt: new Date(Date.now() - 60_000), endedAt: new Date(Date.now() + 60_000) };

  it("trusts a valid SMARTSPECPRO_RESULT block over files already in ./output", async () => {
    await fs.writeFile(path.join(ws.outputDir, "existing.png"), PNG_MAGIC);
    await fs.writeFile(path.join(ws.outputDir, "marker-file.png"), PNG_MAGIC);
    const stdout = `some log line\nSMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["marker-file.png"]} SMARTSPECPRO_RESULT_END\n`;

    const result = await collectOutputs({
      invocation: { stdout },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("result_marker");
    expect(path.basename(result[0].path)).toBe("marker-file.png");
  });

  it("regression (2026-08-02): downloads an https entry in the marker's files array (the xAI tools return hosted URLs and the agent cannot save files locally)", async () => {
    const fetchedUrls: string[] = [];
    const fetchImpl = (async (url: string) => {
      fetchedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => PNG_MAGIC.buffer.slice(PNG_MAGIC.byteOffset, PNG_MAGIC.byteOffset + PNG_MAGIC.byteLength),
      };
    }) as unknown as typeof fetch;
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["https://files-cdn.x.ai/abc/file_123.png"]} SMARTSPECPRO_RESULT_END\n`;

    const result = await collectOutputs({
      invocation: { stdout },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
      fetchImpl,
    });

    expect(fetchedUrls).toEqual(["https://files-cdn.x.ai/abc/file_123.png"]);
    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("result_marker");
    expect(result[0].path.startsWith(ws.tmpDir)).toBe(true);
  });

  it("falls back to a workspace scan when no marker block is present", async () => {
    await fs.writeFile(path.join(ws.outputDir, "generated.png"), PNG_MAGIC);

    const result = await collectOutputs({
      invocation: { stdout: "no marker here" },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("workspace_scan");
  });

  it("falls back to MEDIA tag parsing (download-first) when workspace output is empty", async () => {
    const fetchImpl = (async (_url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => PNG_MAGIC.buffer.slice(PNG_MAGIC.byteOffset, PNG_MAGIC.byteOffset + PNG_MAGIC.byteLength),
    })) as unknown as typeof fetch;

    const result = await collectOutputs({
      invocation: { stdout: 'MEDIA_TAGS:["https://cdn.example.com/out.png"]' },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
      fetchImpl,
    });

    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("media_tag");
    expect(result[0].path.startsWith(ws.tmpDir)).toBe(true);
  });

  it("falls back to a cache scan bounded by the job time window", async () => {
    const inWindowFile = path.join(ws.cacheDir, "in-window.png");
    const outOfWindowFile = path.join(ws.cacheDir, "stale.png");
    await fs.writeFile(inWindowFile, PNG_MAGIC);
    await fs.writeFile(outOfWindowFile, PNG_MAGIC);

    const staleTime = new Date(Date.now() - 10 * 60_000);
    await fs.utimes(outOfWindowFile, staleTime, staleTime);

    const result = await collectOutputs({
      invocation: { stdout: "no marker, no media tags" },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
    });

    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("cache_scan");
    expect(path.basename(result[0].path)).toBe("in-window.png");
  });

  it("rejects a marker-declared path that escapes the workspace via ../", async () => {
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["../../etc/passwd"]} SMARTSPECPRO_RESULT_END`;
    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toThrow(HermesOutputError);
  });

  it("rejects a marker-declared absolute path outside the allowed roots", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-oc-outside-"));
    const outsideFile = path.join(outsideDir, "secret.png");
    await fs.writeFile(outsideFile, PNG_MAGIC);
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["${outsideFile}"]} SMARTSPECPRO_RESULT_END`;

    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toThrow(HermesOutputError);

    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("rejects a symlink inside the workspace that resolves outside all allowed roots", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-oc-outside-"));
    const outsideFile = path.join(outsideDir, "secret.png");
    await fs.writeFile(outsideFile, PNG_MAGIC);
    const linkPath = path.join(ws.outputDir, "escape-link.png");
    await fs.symlink(outsideFile, linkPath);

    await expect(
      collectOutputs({
        invocation: { stdout: "no marker" },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toThrow(HermesOutputError);

    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("rejects a candidate path resolving under a forbidden (connection profile) root", async () => {
    const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-oc-profile-"));
    const insideProfile = path.join(profileRoot, "leaked.png");
    await fs.writeFile(insideProfile, PNG_MAGIC);
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["${insideProfile}"]} SMARTSPECPRO_RESULT_END`;

    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        forbiddenRoots: [profileRoot],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toThrow(HermesOutputError);

    await fs.rm(profileRoot, { recursive: true, force: true });
  });

  it("regression (FIX 2): a cache-only output under the job's OWN connection profile is collected, while the same file under a DIFFERENT connection's profile is still rejected", async () => {
    const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-oc-profileroot-"));
    const ownCacheDir = path.join(profileRoot, "tenant_1", "conn_own", "home", "cache", "images");
    const otherCacheDir = path.join(profileRoot, "tenant_1", "conn_other", "home", "cache", "images");
    await fs.mkdir(ownCacheDir, { recursive: true });
    await fs.mkdir(otherCacheDir, { recursive: true });

    // Cache-only signal: no marker, no MEDIA tag, no ./output file — the
    // ONLY candidate lives in the job's own cache dir (nested under the
    // shared profileRoot, which is ALSO passed as `forbiddenRoots`).
    const ownFile = path.join(ownCacheDir, "generated.png");
    await fs.writeFile(ownFile, PNG_MAGIC);

    const result = await collectOutputs({
      invocation: { stdout: "no marker, no media tags here" },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ownCacheDir],
      forbiddenRoots: [profileRoot],
      jobWindow: window,
      expected: { kind: "image", count: 1 },
    });
    expect(result).toHaveLength(1);
    expect(result[0].signal).toBe("cache_scan");
    expect(result[0].path).toBe(ownFile);

    // The exact same file CONTENT sitting under a DIFFERENT connection's
    // profile dir (not one of THIS job's cacheDirs) must still be rejected
    // even though it also resolves under the same shared profileRoot.
    const otherFile = path.join(otherCacheDir, "leaked.png");
    await fs.writeFile(otherFile, PNG_MAGIC);
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["${otherFile}"]} SMARTSPECPRO_RESULT_END`;
    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ownCacheDir],
        forbiddenRoots: [profileRoot],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toMatchObject({ code: "HERMES_OUTPUT_INVALID" });

    await fs.rm(profileRoot, { recursive: true, force: true });
  });

  it("rejects a corrupt image (magic-byte mismatch) as HERMES_OUTPUT_INVALID", async () => {
    await fs.writeFile(path.join(ws.outputDir, "corrupt.png"), BAD_MAGIC);

    await expect(
      collectOutputs({
        invocation: { stdout: "no marker" },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toMatchObject({ code: "HERMES_OUTPUT_INVALID" });
  });

  it("rejects a truncated video via a stubbed ffprobe failure as HERMES_OUTPUT_INVALID", async () => {
    await fs.writeFile(path.join(ws.outputDir, "clip.mp4"), Buffer.from("not really an mp4"));

    await expect(
      collectOutputs({
        invocation: { stdout: "no marker" },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "video", count: 1 },
        ffprobeImpl: async () => ({ ok: false }),
      }),
    ).rejects.toMatchObject({ code: "HERMES_OUTPUT_INVALID" });
  });

  it("accepts a valid video when ffprobe reports a video stream (audio optional)", async () => {
    await fs.writeFile(path.join(ws.outputDir, "clip.mp4"), Buffer.from("fake mp4 bytes"));

    const result = await collectOutputs({
      invocation: { stdout: "no marker" },
      workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
      cacheDirs: [ws.cacheDir],
      jobWindow: window,
      expected: { kind: "video", count: 1 },
      ffprobeImpl: async () => ({ ok: true, hasVideoStream: true, hasAudioStream: false, durationSec: 4.2 }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].contentType).toBe("video/mp4");
  });

  it("rejects a malicious filename (control character) found during a workspace scan", async () => {
    await fs.writeFile(path.join(ws.outputDir, "bad\x01name.png"), PNG_MAGIC);

    await expect(
      collectOutputs({
        invocation: { stdout: "no marker" },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toMatchObject({ code: "HERMES_OUTPUT_INVALID" });
  });

  it("rejects a Windows reserved device name found during a workspace scan", async () => {
    await fs.writeFile(path.join(ws.outputDir, "con.png"), PNG_MAGIC);

    await expect(
      collectOutputs({
        invocation: { stdout: "no marker" },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toMatchObject({ code: "HERMES_OUTPUT_INVALID" });
  });

  it("throws HERMES_RESULT_INVALID when the marker JSON itself is malformed", async () => {
    const stdout = `SMARTSPECPRO_RESULT_BEGIN {not json} SMARTSPECPRO_RESULT_END`;
    await expect(
      collectOutputs({
        invocation: { stdout },
        workspace: { outputDir: ws.outputDir, tmpDir: ws.tmpDir },
        cacheDirs: [ws.cacheDir],
        jobWindow: window,
        expected: { kind: "image", count: 1 },
      }),
    ).rejects.toMatchObject({ code: "HERMES_RESULT_INVALID" });
  });
});
