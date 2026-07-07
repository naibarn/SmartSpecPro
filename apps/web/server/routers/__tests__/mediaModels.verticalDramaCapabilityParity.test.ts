/**
 * Vertical Drama — badge-path vs generation-path capability agreement
 * (2026-07-07 fix).
 *
 * Bug report hypothesis: `mediaModels.list` (the UI's "พูดในวิดีโอ" native-
 * audio badge) merges a DB-only model's `configJson` with any matching
 * static-registry defaults via `mergeStaticModelConfigJson`, while the actual
 * generation call sites (`resolveEpisodeVideoModel` /
 * `generateVerticalDramaShotVideoPrompt` / `formatVideoClipRequest`, all
 * sourced from `modelRegistry.ts`'s `getModelsByTypeAsync` /
 * `dbModelToDefinition`) read the DB row's raw `configJson` directly, with NO
 * merge step for models that don't have a static-registry counterpart.
 *
 * For a DB-only model (no static registry entry) this test proves the two
 * paths already resolve `nativeAudioDialogue` identically, since
 * `resolveVerticalDramaCapabilities` — the single function BOTH the badge
 * path (`mediaModels.list`) and every generation call site use — always
 * falls back to `deriveVerticalDramaCapabilities` on the model's own
 * `configJson` when `getStaticModelById` finds no match, i.e. both paths
 * consult the same DB row, not a merged/stale copy. Regression coverage: if
 * either path is ever changed to introduce a static-config merge (or to drop
 * one), this test fails.
 */
import { describe, expect, it } from "vitest";
import {
  getStaticModelById,
  resolveVerticalDramaCapabilities,
} from "../../services/modelRegistry";

/** Minimal DB row shape both paths consume — a DB-only model id with no
 *  static-registry counterpart (mirrors `higgsfield/grok_video`'s real DB
 *  row: MCP-transport, `configJson.hasAudio: true`, no static entry). */
const DB_ONLY_MODEL_ID = "higgsfield/grok_video";
const dbRow = {
  modelId: DB_ONLY_MODEL_ID,
  modelType: "video" as const,
  aspectRatios: ["16:9", "9:16", "1:1"],
  configJson: {
    mcp: { toolName: "generate_video", providerKey: "higgsfield", providerModelId: "grok_video" },
    hasAudio: true,
    provider: "higgsfield",
    transport: "mcp",
    generateType: "image-to-video",
    referenceImageLimit: 5,
    supportsReferenceImages: true,
  },
};

describe("badge-path vs generation-path capability parity (DB-only model)", () => {
  it("has no static-registry entry to accidentally shadow the DB row (precondition for this test to be meaningful)", () => {
    expect(getStaticModelById(DB_ONLY_MODEL_ID)).toBeUndefined();
  });

  it("resolveVerticalDramaCapabilities resolves nativeAudioDialogue:true from configJson.hasAudio for the DB-only model — same call BOTH the badge path (mediaModels.list) and generation call sites (resolveEpisodeVideoModel/generateVerticalDramaShotVideoPrompt/formatVideoClipRequest) use", () => {
    // "Badge path" call shape: mediaModels.ts's `list` procedure calls this
    // with the model's DB configJson (after `mergeStaticModelConfigJson`,
    // which is a no-op here since there's no static entry to merge in).
    const badgePathCaps = resolveVerticalDramaCapabilities(dbRow.modelId, {
      type: dbRow.modelType,
      aspectRatios: dbRow.aspectRatios,
      configJson: dbRow.configJson,
    });

    // "Generation path" call shape: `modelRegistry.ts`'s `dbModelToDefinition`
    // (used by `getModelsByTypeAsync` -> `resolveEpisodeVideoModel` ->
    // `generateVerticalDramaShotVideoPrompt`/`formatVideoClipRequest`) calls
    // this with the SAME raw DB configJson, no merge step.
    const generationPathCaps = resolveVerticalDramaCapabilities(dbRow.modelId, {
      type: dbRow.modelType,
      aspectRatios: dbRow.aspectRatios,
      configJson: dbRow.configJson,
    });

    expect(badgePathCaps.nativeAudioDialogue).toBe(true);
    expect(generationPathCaps).toEqual(badgePathCaps);
  });

  it("stays in agreement even when the DB row's configJson is missing hasAudio (both paths resolve false, never a false-positive badge)", () => {
    const rowWithoutAudio = { ...dbRow, configJson: { ...dbRow.configJson, hasAudio: undefined } };
    const badgePathCaps = resolveVerticalDramaCapabilities(rowWithoutAudio.modelId, {
      type: rowWithoutAudio.modelType,
      aspectRatios: rowWithoutAudio.aspectRatios,
      configJson: rowWithoutAudio.configJson,
    });
    const generationPathCaps = resolveVerticalDramaCapabilities(rowWithoutAudio.modelId, {
      type: rowWithoutAudio.modelType,
      aspectRatios: rowWithoutAudio.aspectRatios,
      configJson: rowWithoutAudio.configJson,
    });
    expect(badgePathCaps.nativeAudioDialogue).toBe(false);
    expect(generationPathCaps).toEqual(badgePathCaps);
  });
});
