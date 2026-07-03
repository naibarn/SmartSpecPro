/**
 * Vertical Drama Series — Artifact ledger constants + stable hashing (spec §7.3).
 *
 * Each episode run produces a durable, inspectable artifact ledger. Artifact
 * hashes must remain stable for identical JSON payloads. This module provides a
 * deterministic canonical stringify + a dependency-free synchronous SHA-256 so
 * it is safe to import from both server and client (no `node:crypto`).
 */

import type { VerticalDramaArtifactStage } from "./contracts";

/** Ordered artifact ledger filenames per episode run (spec §7.3). */
export const VERTICAL_DRAMA_ARTIFACT_LEDGER = [
  "input.normalized.json",
  "01_drama_script.json",
  "02_character_visual_bible.json",
  "03_character_assets_manifest.json",
  "04_storyboard_shotgrid.json",
  "05_start_frame_render_plan.json",
  "05a_contact_sheet_batch_plan.json",
  "05b_contact_sheet_assets_manifest.json",
  "05c_candidate_frame_selection.json",
  "06_start_frame_manifest.json",
  "07_video_motion_prompt_pack.json",
  "08_video_clip_manifest.json",
  "09_assembly_manifest.json",
  "10_qc_report.json",
  "readable_summary.md",
  "run_log.jsonl",
] as const;

export type VerticalDramaArtifactFilename = (typeof VERTICAL_DRAMA_ARTIFACT_LEDGER)[number];

/** Maps a run-artifact stage enum to its canonical ledger filename (spec §7.3). */
export const VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE: Record<
  VerticalDramaArtifactStage,
  VerticalDramaArtifactFilename
> = {
  input_normalized: "input.normalized.json",
  drama_script: "01_drama_script.json",
  character_visual_bible: "02_character_visual_bible.json",
  character_assets_manifest: "03_character_assets_manifest.json",
  storyboard_shotgrid: "04_storyboard_shotgrid.json",
  start_frame_render_plan: "05_start_frame_render_plan.json",
  contact_sheet_batch_plan: "05a_contact_sheet_batch_plan.json",
  contact_sheet_assets_manifest: "05b_contact_sheet_assets_manifest.json",
  candidate_frame_selection: "05c_candidate_frame_selection.json",
  start_frame_manifest: "06_start_frame_manifest.json",
  video_motion_prompt_pack: "07_video_motion_prompt_pack.json",
  video_clip_manifest: "08_video_clip_manifest.json",
  assembly_manifest: "09_assembly_manifest.json",
  qc_report: "10_qc_report.json",
  readable_summary: "readable_summary.md",
  run_log: "run_log.jsonl",
};

/**
 * Deterministic JSON stringify with object keys sorted recursively, so two
 * structurally-identical payloads serialize identically regardless of key order.
 */
export function canonicalJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const encode = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node as object)) {
      throw new Error("canonicalJsonStringify: circular reference");
    }
    seen.add(node as object);
    if (Array.isArray(node)) {
      const arr = node.map(encode);
      seen.delete(node as object);
      return arr;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(node as Record<string, unknown>).sort()) {
      const v = (node as Record<string, unknown>)[key];
      if (v === undefined) continue; // JSON drops undefined
      sorted[key] = encode(v);
    }
    seen.delete(node as object);
    return sorted;
  };
  return JSON.stringify(encode(value));
}

/* --------------------------- pure-TS SHA-256 ------------------------------ */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Synchronous SHA-256 over a UTF-8 string, returning a 64-char lowercase hex digest. */
export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const l = bytes.length;
  const bitLen = l * 8;
  // Padding: append 0x80, then zeros, then 64-bit big-endian length.
  const withPadLen = (((l + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(withPadLen);
  padded.set(bytes);
  padded[l] = 0x80;
  // 64-bit length (we only fill the low 32 bits — sufficient for our payloads).
  const dv = new DataView(padded.buffer);
  dv.setUint32(withPadLen - 4, bitLen >>> 0, false);
  dv.setUint32(withPadLen - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < withPadLen; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, "0")).join("");
}

function utf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
  // Fallback manual UTF-8 encoder.
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/**
 * Stable SHA-256 checksum of an artifact JSON payload. Structurally-identical
 * payloads (any key order) produce the same 64-char hex checksum (spec §7.3).
 */
export function artifactChecksumSha256(payload: unknown): string {
  return sha256Hex(canonicalJsonStringify(payload));
}
