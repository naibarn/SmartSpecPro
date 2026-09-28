/**
 * Pure per-stage status derivation for `StageRail` (this task). Zero React,
 * zero trpc — mirrors the `qaPanelState.ts` precedent (pure sibling of a
 * stateful component, its own test file, defensive on `unknown`-shaped
 * inputs).
 *
 * By explicit constraint, this ONLY reads data already available to
 * `VideoStudioWorkspacePage`: the in-memory `VideoProjectDocument`, the
 * project's `qaLedger` (jsonb), and the project's active generation job
 * (`videoProjects.getActiveGenerationJob` — the same query
 * `useGenerationJobPoll` uses internally). No new server fields or queries.
 *
 * IMPORTANT limitation (documented, not a bug): `getActiveGenerationJob`
 * only ever returns a `queued`/`running` job — the server clears the
 * "active" pointer as soon as a job reaches `succeeded`/`failed` (see
 * `videoIntelligenceJobs.ts`'s `getActiveGenerationJob`), so a terminal
 * failure can never be observed through this endpoint. The "error" state
 * below is therefore derived from the DOCUMENT's own claim data (the same
 * advisory check `qaPanelState.ts`'s `deriveClaimBlock` uses), not from a
 * failed job — the only signal actually available here.
 */
import { readQaLedger } from "@shared/videoIntelligence/qaLedger";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";
import type { VideoStudioStage } from "./StageRail";

export type StageRailStatus =
  | "empty"
  | "drafted"
  | "running"
  | "error"
  | "done";

/** Structural mirror of the fields of `VideoIntelligenceJobRecord` this
 *  module reads — kept minimal and `unknown`-tolerant at the boundary so
 *  this file never imports from `server/`. */
export type ActiveGenerationJobKind =
  | "scene_plan"
  | "narration"
  | "quality_review"
  | "quality_repair"
  | "auto_draft"
  | "content_draft"
  | "motion";

function normalizeActiveJobKind(
  activeJob: unknown
): ActiveGenerationJobKind | null {
  if (!activeJob || typeof activeJob !== "object") return null;
  const kind = (activeJob as Record<string, unknown>).kind;
  return kind === "scene_plan" ||
    kind === "narration" ||
    kind === "quality_review" ||
    kind === "quality_repair" ||
    kind === "auto_draft" ||
    kind === "content_draft" ||
    kind === "motion"
    ? kind
    : null;
}

type SceneCounts = {
  total: number;
  narrationCount: number;
  audioCount: number;
  cueCount: number;
  templateCount: number;
};

function countScenes(document: VideoProjectDocument): SceneCounts {
  const scenes = document.scenes ?? [];
  return {
    total: scenes.length,
    narrationCount: scenes.filter(
      s => typeof s.narration === "string" && s.narration.trim().length > 0
    ).length,
    audioCount: scenes.filter(s => s.narrationAudioAssetId != null).length,
    cueCount: scenes.filter(s => (s.captionCues?.length ?? 0) > 0).length,
    templateCount: scenes.filter(s => s.visual?.kind === "template").length,
  };
}

/** Same advisory check as `qaPanelState.ts`'s `deriveClaimBlock` document-only
 *  branch — labelled "from the document" everywhere it's shown, never
 *  presented as the server's verdict. */
function hasBlockingClaims(document: VideoProjectDocument): boolean {
  return (document.claims ?? []).some(
    claim => claim.status === "prohibited" || claim.status === "unsupported"
  );
}

function fromCounts(have: number, total: number): StageRailStatus {
  if (total === 0 || have === 0) return "empty";
  if (have >= total) return "done";
  return "drafted";
}

/**
 * PURE. `qaLedger` / `activeJob` are `unknown`-shaped at runtime (jsonb /
 * Redis round-trips) — normalises defensively, never throws.
 */
export function deriveStageRailState(args: {
  document: VideoProjectDocument | null;
  qaLedger: unknown;
  activeJob: unknown;
}): Record<VideoStudioStage, StageRailStatus> {
  const { document } = args;
  const activeKind = normalizeActiveJobKind(args.activeJob);

  if (!document) {
    return {
      brief: "empty",
      scenes: "empty",
      narration: "empty",
      motion: "empty",
      broll: "empty",
      captions: "empty",
      // Feature 143 §2.1 D1 — the compose stage's dot must NEVER render
      // `empty`: the AI-first path legitimately ends with zero
      // hand-authored layers, and an "empty" dot would read as "you forgot
      // something". "drafted" is the neutral floor here.
      compose: "drafted",
      qa: "empty",
      render: "empty",
    };
  }

  const counts = countScenes(document);
  const blocked = hasBlockingClaims(document);
  const ledgerHasEntries = readQaLedger(args.qaLedger).entries.length > 0;

  const scenesBase = fromCounts(counts.narrationCount, counts.total);
  const narrationBase = fromCounts(counts.audioCount, counts.total);
  const motionBase = fromCounts(counts.templateCount, counts.total);
  const brollCount = (document.scenes ?? []).filter(scene =>
    (scene.layers ?? []).some(
      layer => layer.type === "image" || layer.type === "video"
    )
  ).length;
  const brollBase = fromCounts(brollCount, counts.total);
  const captionsBase = fromCounts(counts.cueCount, counts.total);

  const readyToRender =
    counts.total > 0 &&
    counts.narrationCount === counts.total &&
    counts.audioCount === counts.total &&
    counts.cueCount === counts.total;

  // Feature 143 §2.1 D1 / §4.9.2 — "running" while a stage that rewrites
  // scene timing (and therefore silently re-homes every hand-authored
  // layer riding on that scene) is in flight; otherwise "done" once any
  // hand-authored layer exists, else "drafted" — NEVER "empty" (see the
  // `!document` branch above for why).
  const hasHandAuthoredLayers = (document.scenes ?? []).some(
    s => (s.layers?.length ?? 0) > 0
  );
  const composeAffectingJob =
    activeKind === "scene_plan" ||
    activeKind === "auto_draft" ||
    activeKind === "quality_repair";

  return {
    brief: "done",
    // Auto-draft chains scene_plan -> narration-script -> TTS -> captions in
    // ONE job (`videoIntelligenceJobs.ts` header), so it's shown as
    // "running" on every stage it can touch.
    scenes:
      activeKind === "scene_plan" ||
      activeKind === "auto_draft" ||
      activeKind === "content_draft"
        ? "running"
        : scenesBase,
    narration:
      activeKind === "narration" ||
      activeKind === "auto_draft" ||
      activeKind === "content_draft"
        ? "running"
        : narrationBase,
    motion:
      activeKind === "scene_plan" ||
      activeKind === "auto_draft" ||
      activeKind === "content_draft" ||
      activeKind === "motion"
        ? "running"
        : motionBase,
    broll: brollBase,
    captions:
      activeKind === "narration" ||
      activeKind === "auto_draft" ||
      activeKind === "content_draft"
        ? "running"
        : captionsBase,
    compose: composeAffectingJob
      ? "running"
      : hasHandAuthoredLayers
        ? "done"
        : "drafted",
    qa:
      activeKind === "quality_review" || activeKind === "quality_repair"
        ? "running"
        : blocked
          ? "error"
          : ledgerHasEntries
            ? "done"
            : "empty",
    render: blocked ? "error" : readyToRender ? "drafted" : "empty",
  };
}
