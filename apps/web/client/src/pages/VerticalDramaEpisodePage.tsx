/**
 * VerticalDramaEpisodePage (spec feature 131, section 03 · §8.1, §8.4).
 *
 * Episode workspace shell. Serves two routes:
 *   - /drama-series/:seriesId/episodes/:episodeId         (workspace)
 *   - /drama-series/:seriesId/episodes/:episodeId/runs/:runId
 *       (read-only past-run artifact ledger — a directly linkable deep link)
 *
 * Both render a reversible `AppPage` breadcrumb trail (Series › Episode, plus
 * › Storyboard Review at run depth). The workspace route mounts the real
 * `VerticalDramaEpisodeWorkspace`, wired to the `verticalDramaEpisodes` tRPC
 * router (runs, memory, approval checkpoints, stage runs, repair). The repair
 * dialog and the start-frame contact-sheet picker are mounted at their proper
 * entry points. The primary stage CTA and the dialogue/audio panel's generate
 * action stay dry-run-safe (no paid generation); the storyboard panel's
 * "Generate real storyboard" action is the one exception — it runs
 * `storyboard_shotgrid` in `full` mode behind an explicit credit-spend
 * confirmation (see `VerticalDramaStoryboardPanel`).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { FileClock } from "lucide-react";
import { toast } from "sonner";

import { AppPage } from "@/components/AppPage";
import { WebAssetResolver } from "@/services/webAssetResolver";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizableCollapsiblePanel } from "@/components/ui/resizable-collapsible-panel";
import { trpc } from "@/lib/trpc";
import {
  replaceVerticalDramaStartFrame,
  type VerticalDramaStartFrameDropInput,
} from "@/lib/verticalDramaStartFrameDrop";
import type { VerticalDramaCrumb } from "@/components/verticalDramaSeries/VerticalDramaBreadcrumb";
import { VerticalDramaShell } from "@/components/verticalDramaSeries/VerticalDramaShell";
import {
  pickCopy,
  useVerticalDramaLang,
  verticalDramaCopy,
  verticalDramaRoutes,
  type VerticalDramaLang,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import {
  VerticalDramaEpisodeWorkspace,
  type VerticalDramaStageState,
  type VerticalDramaAdBannerPlanView,
  type VerticalDramaFinalRenderOptionsView,
  type VerticalDramaFinalRenderResultView,
  type VerticalDramaTextOverlayPlanView,
} from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";
import {
  VerticalDramaRepairDialog,
  type VerticalDramaRepairJobStatus,
  type VerticalDramaRepairTarget,
} from "@/components/verticalDramaSeries/VerticalDramaRepairDialog";
import {
  VideoPromptAiEditDialog,
  type VideoPromptAiEditJobStatus,
} from "@/components/verticalDramaSeries/VideoPromptAiEditDialog";
import {
  ImagePromptAiEditDialog,
  type ImagePromptAiEditJobStatus,
} from "@/components/verticalDramaSeries/ImagePromptAiEditDialog";
import type { VerticalDramaRunRow } from "@/components/verticalDramaSeries/VerticalDramaRunsList";
import type {
  RunResult,
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaThaiAccent,
} from "@shared/verticalDramaSeries";
import type {
  VerticalDramaDialogueAudioPlan,
  VerticalDramaSeparateTtsPlanItem,
} from "@shared/verticalDramaSeries/audio";
import type {
  VerticalDramaAudioLineStatus,
  VerticalDramaDialogueAudioBatchData,
  VerticalDramaDialogueAudioLineBatchView,
} from "@/components/verticalDramaSeries/VerticalDramaDialogueAudioPanel";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import type {
  VerticalDramaAssetUrlMap,
  VerticalDramaAvailableProductImageView,
  VerticalDramaCapableModel,
  VerticalDramaCharacterPortraitMap,
  VerticalDramaClipDialogueLineView,
  VerticalDramaEpisodeLocationView,
  VerticalDramaMotionPromptPackView,
  VerticalDramaQualityLoopStateView,
  VerticalDramaQualityPolicyView,
  VerticalDramaSceneVisualStatePatch,
  VerticalDramaShotReferenceView,
  VerticalDramaStartFramePlanView,
  VerticalDramaStoryboardView,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";
import type {
  VerticalDramaTieInReportView,
  VerticalDramaSeasonTieInPlacementView,
} from "@/components/verticalDramaSeries/VerticalDramaTieInReportCard";
import {
  vdAdBannerExclusionReasonLabel,
  vdCopy,
  vdCopyWithParams,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import { SeriesLookLockStatusChip } from "@/components/verticalDramaSeries/SeriesLookLockStatusChip";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import { formatHermesErrorForToast, presentHermesError } from "@/lib/hermesErrorPresentation";
import {
  isCharacterLockPolicyFailureMessage,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
} from "@shared/verticalDramaSeries/characterLock";
import type { VerticalDramaProductionWizardState } from "@shared/verticalDramaSeries/productionWizard";
import {
  buildSceneShotGroups,
  planSceneOrderedBatch,
} from "@shared/verticalDramaSeries/sceneContinuity";

// Persistent right-side reference panel (image swap) — collapsed/width state
// persisted the same way `StoryboardReviewPage.tsx`'s own right panel does,
// so behavior across the two pages feels identical.
const EPISODE_RIGHT_PANEL_WIDTH_KEY =
  "smartspec_vd_episode_right_panel_width_v1";
const EPISODE_RIGHT_PANEL_COLLAPSED_KEY =
  "smartspec_vd_episode_right_panel_collapsed_v1";
const EPISODE_RIGHT_PANEL_DEFAULT_WIDTH = 380;
const EPISODE_RIGHT_PANEL_MIN_WIDTH = 300;
const EPISODE_RIGHT_PANEL_MAX_WIDTH = 720;

function readStoredEpisodePanelWidth(): number {
  const value = Number(safeStorageGet(EPISODE_RIGHT_PANEL_WIDTH_KEY));
  if (!Number.isFinite(value)) return EPISODE_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(
    EPISODE_RIGHT_PANEL_MAX_WIDTH,
    Math.max(EPISODE_RIGHT_PANEL_MIN_WIDTH, Math.round(value))
  );
}

function readStoredEpisodePanelCollapsed(): boolean {
  return safeStorageGet(EPISODE_RIGHT_PANEL_COLLAPSED_KEY) === "true";
}

/**
 * Pure decision logic for the "resume on load" orphaned-angle-grid-task fix
 * (2026-07-06) — exported/unit-testable separately from the effect that
 * calls it. Given one `startFramePlan` frame's `angleGrid` (and the set of
 * shot numbers already resumed/in-flight this session), decides whether
 * `pollAngleVariationsTask` should be (re)started for this shot.
 *
 * A frame should resume when it has a `pendingTaskId` left over from a
 * submit that was never observed to complete (page reload/navigation/crash
 * before the live poll saw `status === "completed"`), it has no `imageUrl`
 * yet (not already resolved), and this session hasn't already resumed or
 * isn't currently polling it.
 */
export function shouldResumeAngleGridPoll(
  angleGrid: { pendingTaskId?: string; imageUrl?: string } | undefined,
  shotNumber: number,
  alreadyResumedShots: ReadonlySet<number>,
  currentlyPollingShots: ReadonlySet<number>
): boolean {
  if (!angleGrid?.pendingTaskId) return false;
  if (angleGrid.imageUrl) return false;
  if (alreadyResumedShots.has(shotNumber)) return false;
  if (currentlyPollingShots.has(shotNumber)) return false;
  return true;
}

/**
 * Pure decision logic for the "resume on load" orphaned-video-clip-task fix
 * (2026-07-06) — exported/unit-testable, same shape/convention as
 * `shouldResumeAngleGridPoll` above. Given one `motionPromptPack` clip's
 * `videoTask` (and the set of clip numbers already resumed/in-flight this
 * session), decides whether `pollVideoClipTask` should be (re)started for
 * this clip.
 *
 * A clip should resume when it has a `pendingTaskId` left over from a submit
 * that was never observed to complete (page reload/navigation before the
 * live poll saw `status === "completed"`), it has no `videoUrl` yet (not
 * already resolved), and this session hasn't already resumed or isn't
 * currently polling it.
 */
export function shouldResumeVideoClipPoll(
  videoTask: { pendingTaskId?: string; videoUrl?: string } | undefined,
  clipNumber: number,
  alreadyResumedClips: ReadonlySet<number>,
  currentlyPollingClips: ReadonlySet<number>
): boolean {
  if (!videoTask?.pendingTaskId) return false;
  if (videoTask.videoUrl?.trim()) return false;
  if (alreadyResumedClips.has(clipNumber)) return false;
  if (currentlyPollingClips.has(clipNumber)) return false;
  return true;
}

/** Minimal clip shape `persistVideoTask` needs — a subset of
 *  `VerticalDramaMotionPromptPack["clips"][number]`. */
export interface MinimalVideoTaskClip {
  clipNumber: number;
  sourceShotNumbers: number[];
  prompt: string;
  durationSeconds: number;
  videoTask?: unknown;
  [key: string]: unknown;
}

/**
 * Pure "apply a videoTask patch onto motionPromptPack.clips[]" logic
 * (2026-07-07 upload-video-per-shot fix) — exported/unit-testable, same
 * convention as `shouldResumeVideoClipPoll` above.
 *
 * Bug this fixes: the "อัปโหลดวิดีโอ" upload button used to render ONLY when
 * a `motionPromptPack` clip already existed whose `sourceShotNumbers`
 * included the current shot — so shot 2+ (any shot before a video prompt had
 * ever been generated for it) silently had no upload option at all. The
 * button now renders on every shot; when no matching clip exists yet, this
 * function creates a minimal
 * `{clipNumber: shotNumber, sourceShotNumbers: [shotNumber], prompt: "", durationSeconds}`
 * entry instead of silently dropping the upload — the same
 * "create-a-minimal-clip" convention `generateShotVideoPrompt` (router) uses
 * for its own "no matching clip yet" branch.
 *
 * `videoTask: null` (clear) is a no-op when there is no existing matching
 * clip — nothing to clear.
 */
export function buildUpdatedClipsForVideoTask(
  existingClips: readonly MinimalVideoTaskClip[],
  clipNumber: number,
  videoTask:
    | { pendingTaskId: string }
    | {
        videoUrl: string;
        mediaTaskId?: string;
        source?: "generated" | "upload";
      }
    | null,
  sourceShotNumber: number | undefined,
  durationSecondsForNewClip: number
): MinimalVideoTaskClip[] {
  const existingIndex = existingClips.findIndex(
    c => c.clipNumber === clipNumber
  );
  if (existingIndex !== -1) {
    return existingClips.map((clip, i) => {
      if (i !== existingIndex) return clip;
      if (videoTask) return { ...clip, videoTask };
      const { videoTask: _drop, ...rest } = clip;
      return rest as MinimalVideoTaskClip;
    });
  }
  if (!videoTask || sourceShotNumber == null) return existingClips.slice();
  return [
    ...existingClips,
    {
      clipNumber,
      sourceShotNumbers: [sourceShotNumber],
      prompt: "",
      durationSeconds: durationSecondsForNewClip,
      videoTask,
    },
  ];
}

/**
 * Pure decision logic behind the "resume on load" orphaned-dialogue-audio-
 * task fix (W12-B voice chain wave) — exported/unit-testable, byte-for-byte
 * the same shape as `shouldResumeVideoClipPoll` above, just keyed by
 * `lineId` (a string) instead of `clipNumber` (a number). A dialogue line
 * should resume polling when it has a `pendingTaskId` left over from a
 * submit this session never observed complete, has no `audioUrl` yet, and
 * this session hasn't already resumed or isn't currently polling it.
 */
export function shouldResumeAudioLinePoll(
  audioTask: { pendingTaskId?: string; audioUrl?: string } | undefined,
  lineId: string,
  alreadyResumedLines: ReadonlySet<string>,
  currentlyPollingLines: ReadonlySet<string>
): boolean {
  if (!audioTask?.pendingTaskId) return false;
  if (audioTask.audioUrl) return false;
  if (alreadyResumedLines.has(lineId)) return false;
  if (currentlyPollingLines.has(lineId)) return false;
  return true;
}

/** Minimal separate-TTS plan item shape `buildUpdatedItemsForAudioTask`
 *  needs — a subset of `VerticalDramaSeparateTtsPlanItem`. */
export interface MinimalAudioTaskItem {
  lineId: string;
  audioTask?: unknown;
  [key: string]: unknown;
}

/**
 * Pure "apply an audioTask patch onto separateTtsPlan.items[]" logic (W12-B
 * voice chain wave) — exported/unit-testable, mirrors
 * `buildUpdatedClipsForVideoTask` above. Unlike that function, there is no
 * "create a minimal item" branch: every `lineId` this page ever polls/
 * persists against was already submitted by
 * `generateEpisodeDialogueAudio` (server-side), which only ever patches
 * EXISTING `separateTtsPlan.items[]` entries — there is no client-side
 * "upload"-style path that can reference a not-yet-existing line. A
 * `lineId` with no matching item is a no-op (returns the input unchanged).
 */
export function buildUpdatedItemsForAudioTask(
  existingItems: readonly MinimalAudioTaskItem[],
  lineId: string,
  audioTask:
    | { pendingTaskId: string }
    | { audioUrl: string; mediaTaskId?: string }
    | null
): MinimalAudioTaskItem[] {
  return existingItems.map(item => {
    if (item.lineId !== lineId) return item;
    if (audioTask) return { ...item, audioTask };
    const { audioTask: _drop, ...rest } = item;
    return rest as MinimalAudioTaskItem;
  });
}

/**
 * Resolve one dialogue line's display status (W12-B voice chain wave) —
 * exported/unit-testable pure merge of the persisted plan item (`blocked`,
 * `audioTask`) with this session's local "just failed" tracking. A failed
 * poll clears the persisted `audioTask` entirely (mirroring
 * `pollVideoClipTask`'s own failure handling — see `persistAudioTask`'s doc
 * comment), so "failed" is NOT derivable from the plan alone; it is only
 * known for the duration of this browser session via `failedLineIds`. Order
 * matters: `ready` and `blocked` are authoritative server state and always
 * win; `generating` (a live `pendingTaskId`) always wins over a STALE
 * `failedLineIds` entry (e.g. the line was just resubmitted).
 */
export function resolveDialogueAudioLineStatus(
  item: Pick<VerticalDramaSeparateTtsPlanItem, "blocked" | "audioTask">,
  lineId: string,
  failedLineIds: ReadonlySet<string>
): VerticalDramaAudioLineStatus {
  if (item.audioTask?.audioUrl) return "ready";
  if (item.blocked) return "blocked";
  if (item.audioTask?.pendingTaskId) return "generating";
  if (failedLineIds.has(lineId)) return "failed";
  return "queued";
}

/**
 * debt-item-1 (2026-07-08) — prefer the server-resolved
 * `getEpisodeDetail.flags.voiceChain` (same tenant flag,
 * `resolveVerticalDramaVoiceChainFlag` server-side) once it has loaded; falls
 * back to the direct `useTenantFeatureFlag` read for the render(s) before
 * `episodeDetailQuery` resolves (`serverFlag === undefined`), so nothing
 * regresses while the query is still loading. Pure/exported for direct unit
 * testing, same convention as `resolveDialogueAudioLineStatus` above.
 */
export function resolveVoiceChainFlagEnabled(
  serverFlag: boolean | undefined,
  tenantFlagFallback: boolean
): boolean {
  return serverFlag ?? tenantFlagFallback;
}

/**
 * Ad Banner Overlay (F131W, task #30-A2) — prefers the server-resolved
 * `getEpisodeDetail.flags.adBannerOverlay` (same tenant flag,
 * `resolveVerticalDramaAdBannerOverlayFlag` server-side) once it has loaded;
 * falls back to the direct `useTenantFeatureFlag` read for the render(s)
 * before `episodeDetailQuery` resolves. Same shape as
 * `resolveVoiceChainFlagEnabled` above (kept as its own named export rather
 * than reused — the two flags are independent features).
 */
export function resolveAdBannerOverlayFlagEnabled(
  serverFlag: boolean | undefined,
  tenantFlagFallback: boolean
): boolean {
  return serverFlag ?? tenantFlagFallback;
}

/**
 * Text Overlay Suite (F131AB, task #34) — prefers the server-resolved
 * `getEpisodeDetail.flags.textOverlaySuite` (same tenant flag,
 * `resolveVerticalDramaTextOverlaySuiteFlag` server-side) once it has
 * loaded; falls back to the direct `useTenantFeatureFlag` read for the
 * render(s) before `episodeDetailQuery` resolves. Same shape as
 * `resolveAdBannerOverlayFlagEnabled` above (kept as its own named export —
 * the two flags are independent features).
 */
export function resolveTextOverlaySuiteFlagEnabled(
  serverFlag: boolean | undefined,
  tenantFlagFallback: boolean
): boolean {
  return serverFlag ?? tenantFlagFallback;
}

/** Lines eligible for a first submit right now — mirrors the server's own
 *  `selectPendingDialogueAudioLines` filter (`server/routers/verticalDramaEpisodes.ts`)
 *  so the pre-click button/summary state agrees with what the next
 *  `generateEpisodeDialogueAudio` call will actually submit. Duplicated
 *  (not imported) because that filter lives in a server-only router file —
 *  see this function's call site for the "never import server code into the
 *  client bundle" rationale. */
export function countPendingDialogueAudioLines(
  plan:
    | Pick<VerticalDramaDialogueAudioPlan, "separateTtsPlan">
    | null
    | undefined
): number {
  const items = plan?.separateTtsPlan?.items ?? [];
  return items.filter(
    item =>
      !item.blocked &&
      !item.audioTask?.pendingTaskId &&
      !item.audioTask?.audioUrl
  ).length;
}

/**
 * Pure decision logic behind `runQualityImproveLoopMutation`'s success toast
 * (Wave-5A, 2026-07-07 production-grade upgrade quality-loop v2) —
 * exported/unit-testable separately from the mutation callback that calls
 * it, same convention as `shouldResumeAngleGridPoll` above. Takes an
 * already-normalized `{warning, loopState}` shape (decoupled from the tRPC
 * response's union typing — the caller narrows `"loopState" in result`
 * first) plus the active locale's already-resolved copy strings, and
 * decides which toast tone + message to show:
 *
 *  1. An explicit server `warning` always wins (best-effort re-review
 *     failed, but the repairs themselves still succeeded).
 *  2. Loop escalation (`escalated_max_rounds` / `escalated_regression`) —
 *     the loop ran but never reached policy floor / a round regressed.
 *  3. A plain before/after overall-score summary for the loop's last round.
 *  4. `fallbackMessage` when no round ever ran at all (e.g. the initial
 *     review already met every policy floor, so the loop did zero rounds).
 */
export function describeQualityImproveLoopOutcome(
  result: {
    warning?: string | null;
    loopState?: {
      status: string;
      rounds: { overallBefore: number; overallAfter: number }[];
    } | null;
  },
  copy: {
    qualityLoopEscalatedMaxRoundsTemplate: string;
    qualityLoopEscalatedRegression: string;
    qualityLoopRoundBeforeAfterTemplate: string;
  },
  fallbackMessage: string
): { tone: "warning" | "success"; message: string } {
  if (result.warning) {
    return { tone: "warning", message: result.warning };
  }
  const loopState = result.loopState ?? null;
  if (loopState?.status === "escalated_max_rounds") {
    return {
      tone: "warning",
      message: vdCopyWithParams(copy.qualityLoopEscalatedMaxRoundsTemplate, {
        n: loopState.rounds.length,
      }),
    };
  }
  if (loopState?.status === "escalated_regression") {
    return { tone: "warning", message: copy.qualityLoopEscalatedRegression };
  }
  const lastRound = loopState?.rounds[loopState.rounds.length - 1];
  if (lastRound) {
    return {
      tone: "success",
      message: vdCopyWithParams(copy.qualityLoopRoundBeforeAfterTemplate, {
        before: lastRound.overallBefore,
        after: lastRound.overallAfter,
      }),
    };
  }
  return { tone: "success", message: fallbackMessage };
}

/** Per-series last-picked image/video model (Phase 1.3) — used only as the
 *  DEFAULT for a new episode's model selection; an episode with its own
 *  `startFramePlan.selectedImageModelId` / `motionPromptPack.selectedVideoModelId`
 *  always wins over this. Keyed by series id so different series can default
 *  to different models. */
function vdModelStorageKey(seriesId: string, kind: "image" | "video"): string {
  return `smartspec_vd_series_${seriesId}_${kind}_model`;
}

/** Best-effort localStorage access. Reads/writes here are only a CONVENIENCE
 *  cache (remembered per-series model/resolution/MCP-connection defaults) —
 *  never the source of truth (that's the episode row on the server). They
 *  MUST NOT throw: `localStorage.setItem` raises `QuotaExceededError` when the
 *  origin's storage is full (common for heavy users with many
 *  `smartspec_vd_series_*` keys) and `getItem`/`setItem` raise `SecurityError`
 *  in sandboxed/blocked-storage contexts. An unguarded throw here used to
 *  abort the whole model-select click handler BEFORE it fired the
 *  `setEpisodeModelSelection` mutation — so the dialog never closed and the
 *  model was never saved (the "shows models but can't select" report). Swallow
 *  the error and let the real (server-persisted) action proceed. */
function safeStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota exceeded / storage blocked — cache is best-effort, ignore */
  }
}

function safeStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage blocked — best-effort, ignore */
  }
}

function readStoredSeriesModelDefault(
  seriesId: string,
  kind: "image" | "video"
): string {
  if (!seriesId) return "";
  return safeStorageGet(vdModelStorageKey(seriesId, kind)) || "";
}

function storeSeriesModelDefault(
  seriesId: string,
  kind: "image" | "video",
  modelId: string
): void {
  if (!seriesId) return;
  safeStorageSet(vdModelStorageKey(seriesId, kind), modelId);
}

/** Per-series, per-model last-picked resolution/size (storyboard-complete
 *  plan Phase 6.2) — keyed by BOTH series and model id so switching models
 *  never applies a stale resolution value the new model doesn't even offer
 *  (the panel only renders the dropdown when the model's own
 *  `resolutionOptions` contains the persisted value; an unmatched value
 *  simply falls back to "" — the model's default — via `selectedImageModel`/
 *  `selectedVideoModel` lookups in the panel itself). */
function vdResolutionStorageKey(
  seriesId: string,
  kind: "image" | "video",
  modelId: string
): string {
  return `smartspec_vd_series_${seriesId}_${kind}_resolution_${modelId}`;
}

function readStoredResolution(
  seriesId: string,
  kind: "image" | "video",
  modelId: string
): string {
  if (!seriesId || !modelId) return "";
  return safeStorageGet(vdResolutionStorageKey(seriesId, kind, modelId)) || "";
}

function storeResolution(
  seriesId: string,
  kind: "image" | "video",
  modelId: string,
  resolution: string
): void {
  if (!seriesId || !modelId) return;
  if (resolution) {
    safeStorageSet(
      vdResolutionStorageKey(seriesId, kind, modelId),
      resolution
    );
  } else {
    safeStorageRemove(
      vdResolutionStorageKey(seriesId, kind, modelId)
    );
  }
}

/** Last-picked MCP connection id (Higgsfield/Magnific etc. — creditCost 0
 *  MCP-transport models). A single global key (not per-series) — this is
 *  the same intent as Media Studio's own in-memory MCP connection choice,
 *  just persisted, so whichever connection the user last picked (in Media
 *  Studio or here) carries over automatically instead of resetting every
 *  time the episode workspace reloads. */
const MCP_CONNECTION_ID_STORAGE_KEY = "smartspec_mcp_connection_id";

function readStoredMcpConnectionId(): string | null {
  return safeStorageGet(MCP_CONNECTION_ID_STORAGE_KEY) || null;
}

function storeMcpConnectionId(connectionId: string | null): void {
  if (connectionId) {
    safeStorageSet(MCP_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    safeStorageRemove(MCP_CONNECTION_ID_STORAGE_KEY);
  }
}

/** Feature 135 (Hermes/Grok media worker) — shared Hermes-connection
 *  localStorage key, same cross-surface carry-over convention as
 *  `MCP_CONNECTION_ID_STORAGE_KEY` above (shared with
 *  `VerticalDramaCharacterStockPanel.tsx`/`VerticalDramaLocationStockPanel.tsx`). */
export const HERMES_CONNECTION_ID_STORAGE_KEY = "smartspec_hermes_connection_id";

export function readStoredHermesConnectionId(): string | null {
  return safeStorageGet(HERMES_CONNECTION_ID_STORAGE_KEY) || null;
}

export function storeHermesConnectionId(connectionId: string | null): void {
  if (connectionId) {
    safeStorageSet(HERMES_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    safeStorageRemove(HERMES_CONNECTION_ID_STORAGE_KEY);
  }
}

/**
 * Pure guard for the "hydrate the remembered per-series model into a
 * brand-new episode" auto-hydration effect (Feature 135, section-10 §4.5).
 * Extracted so the decision is directly unit-testable without mounting the
 * whole page — see
 * `__tests__/VerticalDramaEpisodePage.hermesModelHydration.test.ts`.
 *
 * Semantics: non-hermes models — unchanged behavior (hydrate whenever the
 * row exists and is enabled, exactly like before this feature existed).
 * Hermes models — hydrate ONLY when the row is enabled AND
 * `hasAuthorizedHermesConnection` is true for the relevant asset type;
 * otherwise leave the selection empty (no fallback to any other model, the
 * caller's own gating then keeps generate disabled until the user connects
 * an account or picks a different model).
 */
export function shouldHydrateRememberedVdModel(params: {
  rememberedModelId: string;
  modelRow: { isEnabled: boolean; configJson: unknown } | null;
  hasAuthorizedHermesConnection: boolean;
}): boolean {
  if (!params.rememberedModelId) return false;
  if (!params.modelRow) return false; // stale/unknown id — leave empty
  if (!params.modelRow.isEnabled) return false;
  const transport = resolveMediaModelTransportConfig({
    configJson: params.modelRow.configJson,
  }).transport;
  if (transport !== "hermes_worker") return true;
  return params.hasAuthorizedHermesConnection;
}

/**
 * Feature 135 (Hermes/Grok media worker), section-10 review fix — shared
 * task-projection failure toast builder for every image/video generation
 * poll loop in this file (`pollStartFrameTask`, angle-variation polling,
 * `pollVideoClipTask`, `pollRepairImageTask`, reference-frame polling).
 * Reads `task.errorCode` (section-06's addition to `MediaTask`) via
 * `presentHermesError` first; every non-hermes/legacy task falls through to
 * the exact pre-existing bilingual "<fallback>: <errorMessage>" format
 * (regression: unchanged). Pure/exported so it's independently testable
 * without mounting the page or a poll loop.
 */
export function buildVdGenerateFailureToastMessage(
  task: { errorMessage?: string; errorCode?: string } | null | undefined,
  lang: "th" | "en",
  fallback: { th: string; en: string }
): string {
  const presentation = presentHermesError(task ?? null);
  if (presentation) return formatHermesErrorForToast(presentation, lang);
  const errorMessage = task?.errorMessage;
  return lang === "th"
    ? `${fallback.th}${errorMessage ? `: ${errorMessage}` : ""}`
    : `${fallback.en}${errorMessage ? `: ${errorMessage}` : ""}`;
}

/** Scrolls the episode-level image/video model picker into view — shared by
 *  `requireModelSelectedOrToast`'s toast action AND every generate
 *  mutation's `onError` below (server now fails closed with `BAD_REQUEST`
 *  when the per-episode model selection is missing/invalid, instead of the
 *  old silent `DEFAULT_MODELS` fallback). Same `data-testid` the picker
 *  itself already renders in `VerticalDramaStoryboardPanel`. */
function scrollToVdModelPicker(kind: "image" | "video"): void {
  const el = document.querySelector(
    `[data-testid="vd-storyboard-select-${kind}-model"]`
  );
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function VerticalDramaEpisodePage() {
  const lang = useVerticalDramaLang();

  const [isRunRoute, runParams] = useRoute(
    "/drama-series/:seriesId/episodes/:episodeId/runs/:runId"
  );
  const [, episodeParams] = useRoute(
    "/drama-series/:seriesId/episodes/:episodeId"
  );

  const seriesId = runParams?.seriesId ?? episodeParams?.seriesId ?? "";
  const episodeId = runParams?.episodeId ?? episodeParams?.episodeId ?? "";
  const runId = runParams?.runId ?? "";

  const crumbs: VerticalDramaCrumb[] = [
    {
      label: pickCopy(lang, verticalDramaCopy.menuTitle),
      href: verticalDramaRoutes.seriesList(),
    },
    {
      label: pickCopy(lang, verticalDramaCopy.seriesCrumb),
      // Return to the Episodes tab the user came from (episodes are only ever
      // opened from that tab), not the series page's default Overview tab. The
      // series detail page resolves this via `?tab=` (resolveInitialSeriesTab),
      // the same deep-link pattern already used for `?tab=characters` elsewhere.
      href: `${verticalDramaRoutes.seriesDetail(seriesId)}?tab=episodes`,
    },
    isRunRoute
      ? {
          label: pickCopy(lang, verticalDramaCopy.episodeCrumb),
          href: verticalDramaRoutes.episode(seriesId, episodeId),
        }
      : { label: pickCopy(lang, verticalDramaCopy.episodeCrumb) },
  ];
  if (isRunRoute) {
    crumbs.push({
      label: pickCopy(lang, verticalDramaCopy.storyboardReviewCrumb),
    });
  }

  // The route param is the episode's DB id (globally sequential across all
  // series) — never show it as the episode number. Resolve the real
  // episodeNumber from the owning series' episode list (same query key the
  // inner workspace uses, so TanStack dedupes the fetch).
  const headerSeriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId) && !isRunRoute, staleTime: 30_000 }
  );
  const headerEpisodeNumber = (headerSeriesQuery.data?.episodes ?? []).find(
    (e: { id: string | number; episodeNumber: number }) =>
      String(e.id) === String(episodeId)
  )?.episodeNumber;

  const pageTitle = isRunRoute
    ? pickCopy(lang, verticalDramaCopy.runDetailTitle)
    : `${pickCopy(lang, verticalDramaCopy.episodeCrumb)} ${headerEpisodeNumber ?? "…"}`;

  return (
    <VerticalDramaShell currentSeriesId={seriesId}>
      <AppPage
        title={pageTitle}
        breadcrumbs={crumbs}
        actions={
          isRunRoute ? (
            <Badge variant="outline">
              {pickCopy(lang, verticalDramaCopy.readOnly)}
            </Badge>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {isRunRoute ? (
            <RunDetailLedger lang={lang} runId={runId} />
          ) : (
            <EpisodeWorkspaceShell
              lang={lang}
              seriesId={seriesId}
              episodeId={episodeId}
            />
          )}
        </div>
      </AppPage>
    </VerticalDramaShell>
  );
}

/**
 * Episode workspace container. Loads the episode + its runs, memory events, and
 * pending approval checkpoints from the `verticalDramaEpisodes` tRPC router and
 * mounts the presentational `VerticalDramaEpisodeWorkspace`, plus the repair
 * dialog (opened from the approval bar / failed stages) and the start-frame
 * contact-sheet picker (opened when a start-frame stage is drilled into).
 */
function EpisodeWorkspaceShell({
  lang,
  seriesId,
  episodeId,
}: {
  lang: VerticalDramaLang;
  seriesId: string;
  episodeId: string;
}) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const enabled = Boolean(seriesId && episodeId);
  const seriesLookLockEnabled = useTenantFeatureFlag("verticalDramaSeriesLookLock");
  const presetMixV2Enabled = useTenantFeatureFlag("verticalDramaSeriesPresetMixV2");

  const seriesQuery = trpc.verticalDramaSeries.get.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId), staleTime: 30_000 }
  );
  const runsQuery = trpc.verticalDramaEpisodes.listEpisodeRuns.useQuery(
    { seriesId, episodeId },
    { enabled }
  );
  const checkpointsQuery = trpc.verticalDramaEpisodes.listCheckpoints.useQuery(
    { seriesId, episodeId, state: "pending" },
    { enabled }
  );

  // Memory timeline filters (kind + episode number).
  const [memoryKind, setMemoryKind] = useState<VerticalDramaMemoryKind | "all">(
    "all"
  );
  const [memoryEpisode, setMemoryEpisode] = useState<number | null>(null);
  const memoryQuery = trpc.verticalDramaEpisodes.listMemoryEvents.useQuery(
    {
      seriesId,
      kind: memoryKind === "all" ? undefined : memoryKind,
      episodeNumber: memoryEpisode ?? undefined,
    },
    { enabled: Boolean(seriesId) }
  );

  // Repair dialog state (entry from the approval bar / failed stages / picker).
  const [repairStage, setRepairStage] =
    useState<VerticalDramaPipelineStage | null>(null);
  const [repairTarget, setRepairTarget] = useState<
    VerticalDramaRepairTarget | undefined
  >(undefined);
  const [repairJobStatus, setRepairJobStatus] =
    useState<VerticalDramaRepairJobStatus>("idle");
  const [repairResultArtifactId, setRepairResultArtifactId] = useState<
    string | undefined
  >(undefined);
  const [repairError, setRepairError] = useState<string | undefined>(undefined);
  // Prefill text for the repair dialog's instruction textarea — set when
  // opening "Edit video prompt" from the storyboard panel so the user edits
  // the existing prompt instead of writing one from scratch.
  const [repairTemplate, setRepairTemplate] = useState<string | undefined>(
    undefined
  );

  // Video prompt AI-edit dialog — separate from the generic RepairDialog;
  // opened when the user clicks "ให้ AI ปรับ" on a video prompt box and
  // routes straight into `generateShotVideoPromptMutation` with an
  // instruction + optional reference image URLs.
  const [videoPromptAiEditTarget, setVideoPromptAiEditTarget] = useState<{
    shotNumber: number;
    clipNumber: number;
    subShotNumber: number | undefined;
    shotLabel?: string;
    shotImageUrl?: string;
  } | null>(null);
  const [videoPromptAiEditJobStatus, setVideoPromptAiEditJobStatus] =
    useState<VideoPromptAiEditJobStatus>("idle");
  const [videoPromptAiEditError, setVideoPromptAiEditError] = useState<
    string | undefined
  >(undefined);

  // Start-frame image prompt AI-edit dialog — separate from the generic
  // RepairDialog and VideoPromptAiEditDialog; routes into
  // `generateShotStartFramePromptMutation` with instruction + optional start frame.
  const [imagePromptAiEditTarget, setImagePromptAiEditTarget] = useState<{
    shotNumber: number;
    currentPrompt: string;
    shotImageUrl?: string;
  } | null>(null);
  const [imagePromptAiEditJobStatus, setImagePromptAiEditJobStatus] =
    useState<ImagePromptAiEditJobStatus>("idle");
  const [imagePromptAiEditError, setImagePromptAiEditError] = useState<
    string | undefined
  >(undefined);

  // Image swap target (Media History/Library picker), independent of the
  // LLM-driven repair flow above — a direct, no-cost asset pick. Either a
  // specific shot's start frame, or a specific character's global portrait
  // (triggered from a shot's character-reference chip) — same picker UI,
  // different finalize target.
  const [imageSwapTarget, setImageSwapTarget] = useState<
    | { type: "startFrame"; shotNumber: number }
    | { type: "characterPortrait"; characterId: string }
    | null
  >(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(
    readStoredEpisodePanelCollapsed
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(
    readStoredEpisodePanelWidth
  );
  useEffect(() => {
    safeStorageSet(EPISODE_RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);
  useEffect(() => {
    safeStorageSet(
      EPISODE_RIGHT_PANEL_COLLAPSED_KEY,
      String(isRightPanelCollapsed)
    );
  }, [isRightPanelCollapsed]);

  // Stage-detail drill-down surface (which stage's run history is focused).
  const [stageDetailStage, setStageDetailStage] =
    useState<VerticalDramaPipelineStage | null>(null);

  // Retcon decision-in-flight (keyed by proposal event id).
  const [decidingRetconId, setDecidingRetconId] = useState<string | null>(null);

  const invalidateRuns = () => {
    void utils.verticalDramaEpisodes.listEpisodeRuns.invalidate();
    void utils.verticalDramaEpisodes.listCheckpoints.invalidate();
    // Also refetch episode detail (dialogueAudioPlan/storyboard columns) —
    // a successful stage run (e.g. a real storyboard_shotgrid generation)
    // updates these columns and the panels reading them need fresh data.
    void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
  };

  // Bug #127 (`planning/vd-storyboard-runstage-async-job/plan.md`) —
  // `storyboard_shotgrid`'s REAL (non dry_run/plan_only) `runStage`/
  // `regenerateStage` mutations now return almost immediately with
  // `result.status: "queued"` instead of awaiting the whole ~16k-token LLM
  // generation inline (that used to routinely outlive Cloudflare's ~100s
  // edge-proxy read timeout). The actual generation now runs in a BullMQ
  // background worker and updates the matching `vertical_drama_episode_runs`
  // row. This block polls that row (via `listEpisodeRuns`, the SAME manual
  // bounded-loop idiom `pollVideoClipTask` below already uses — deliberately
  // NOT `useQuery`'s `refetchInterval`, to stay consistent with this file's
  // existing polling convention) until the run reaches a terminal status.
  //
  // `pollingStoryboardShotgrid` drives the storyboard panel's "generating"
  // spinner across the WHOLE background job, not just the now-near-instant
  // mutation round trip (see the `storyboardPanel` prop below).
  const [pollingStoryboardShotgrid, setPollingStoryboardShotgrid] =
    useState(false);
  // Only one storyboard_shotgrid run can be in flight per episode at a time
  // (server-side idempotency via `idempotencyKey`/`alreadySubmitted`), so a
  // single shared in-flight PROMISE (not just a boolean guard, unlike
  // `videoClipPollInFlightRef` below) is keyed by episode rather than by
  // run id. Sharing the promise — rather than making a second caller a
  // no-op — matters here because THREE call sites can all end up wanting to
  // await the same real outcome (the shared `runStageMutation.onSuccess`
  // below, `handleGenerateEpisodeStoryboard`'s chain, and the storyboard
  // panel's own button all route through the same mutation): every caller
  // just joins whichever poll loop is already running instead of starting a
  // duplicate one or being left with no result to await.
  const storyboardShotgridPollPromiseRef = useRef<Promise<
    "succeeded" | "failed" | "timeout"
  > | null>(null);
  const STORYBOARD_SHOTGRID_POLL_INTERVAL_MS = 2500;
  // Same 30-minute budget as `VIDEO_CLIP_POLL_MAX_ATTEMPTS` below — an LLM
  // planning call plus queue wait time can legitimately take a while.
  const STORYBOARD_SHOTGRID_POLL_MAX_ATTEMPTS = 720;

  /** Shows the SAME terminal toast copy `runStageMutation`'s shared
   *  `onSuccess` below already uses for every other stage, then invalidates
   *  the run/checkpoint/episode-detail queries so the storyboard panel picks
   *  up the real persisted result. Called exactly once per resolved run,
   *  from whichever of the three storyboard_shotgrid call sites' poll
   *  actually observes the terminal status.
   *
   *  Note: unlike `runStageMutation.onSuccess`'s inline `errors[0]?.message`
   *  detail on failure, `listEpisodeRuns` (what the poll reads) does not
   *  expose the run's `errors` column — only `status`/`nextAction`/
   *  `artifactIds` etc. (see that procedure in
   *  `verticalDramaEpisodes.ts`). The failure toast here is therefore
   *  message-less; the user can still open the run detail / use Repair for
   *  specifics. */
  function announceStoryboardShotgridTerminal(outcome: {
    status: "succeeded" | "failed";
    nextAction: RunResult["next_action"];
  }) {
    invalidateRuns();
    if (outcome.status === "failed") {
      toast.error(
        lang === "th"
          ? `ขั้นตอนล้มเหลว — ลองใหม่หรือกด "ซ่อม"`
          : `Stage failed — try again or use Repair.`
      );
    } else if (outcome.nextAction === "approve") {
      toast.success(
        lang === "th"
          ? "สร้างเนื้อหาสำเร็จ รอการอนุมัติ"
          : "Content generated — awaiting approval."
      );
    } else {
      toast.success(
        lang === "th"
          ? "ขั้นตอนสำเร็จ ไปขั้นตอนถัดไป"
          : "Stage complete — advancing."
      );
    }
  }

  /**
   * Stages whose REAL run comes back `"queued"` and must therefore be polled
   * instead of toasted as complete. Mirrors the server's
   * `VERTICAL_DRAMA_ASYNC_STAGES`
   * (`server/services/verticalDramaEpisodePipeline.ts`) — kept in sync
   * manually because that module is server-only. Adding a stage there without
   * adding it here would make the UI announce "stage complete" the instant the
   * job was enqueued, before anything had actually run.
   */
  const VD_ASYNC_POLLED_STAGES: ReadonlySet<string> = new Set([
    "storyboard_shotgrid",
    "plan_episode_script",
  ]);

  /** The actual bounded poll loop. Returns (and shares, via
   *  `storyboardShotgridPollPromiseRef`) ONE promise per in-flight run so
   *  concurrent callers all await the same result instead of racing —
   *  announces the terminal toast/invalidate itself, exactly once, from
   *  inside the loop body (not from each caller), so multiple awaiters never
   *  double-toast. */
  function pollStoryboardShotgridRun(
    runId: number
  ): Promise<"succeeded" | "failed" | "timeout"> {
    if (storyboardShotgridPollPromiseRef.current) {
      return storyboardShotgridPollPromiseRef.current;
    }
    const pollPromise = (async (): Promise<
      "succeeded" | "failed" | "timeout"
    > => {
      setPollingStoryboardShotgrid(true);
      try {
        for (
          let attempt = 0;
          attempt < STORYBOARD_SHOTGRID_POLL_MAX_ATTEMPTS;
          attempt++
        ) {
          const { runs } =
            await utils.verticalDramaEpisodes.listEpisodeRuns.fetch({
              seriesId,
              episodeId,
            });
          const row = runs.find(r => String(r.runId) === String(runId));
          if (row?.status === "succeeded" || row?.status === "failed") {
            announceStoryboardShotgridTerminal({
              status: row.status,
              nextAction: row.nextAction as RunResult["next_action"],
            });
            return row.status;
          }
          await new Promise(resolve =>
            setTimeout(resolve, STORYBOARD_SHOTGRID_POLL_INTERVAL_MS)
          );
        }
        // Non-fatal — the job is very likely still running server-side
        // (same soft-info posture `VerticalDramaDeepStoryDraftsPanel.tsx`
        // uses for its own exhausted-poll-budget case); a later refresh (or
        // this page's own `runsQuery` background refetch) will show the
        // real result once it lands.
        toast.info(
          pickCopy(lang, verticalDramaCopy.storyJobStillRunningBackground)
        );
        return "timeout";
      } finally {
        setPollingStoryboardShotgrid(false);
        storyboardShotgridPollPromiseRef.current = null;
      }
    })();
    storyboardShotgridPollPromiseRef.current = pollPromise;
    return pollPromise;
  }

  /** Entry point for all three call sites: given a `storyboard_shotgrid`
   *  `runStage`/`regenerateStage` mutation's already-resolved output, waits
   *  for the real terminal status if it's still `"queued"`/`"running"`
   *  (Bug #127's async path) and returns it. Defensively handles the case
   *  where `result.status` is somehow already terminal (e.g. some future
   *  code path resolves synchronously again) without polling at all. */
  async function submitAndPollStoryboardShotgrid(outcome: {
    runId: number;
    result: RunResult;
  }): Promise<"succeeded" | "failed" | "timeout"> {
    if (
      outcome.result.status === "succeeded" ||
      outcome.result.status === "failed"
    ) {
      announceStoryboardShotgridTerminal({
        status: outcome.result.status,
        nextAction: outcome.result.next_action,
      });
      return outcome.result.status;
    }
    return pollStoryboardShotgridRun(outcome.runId);
  }

  const runStageMutation = trpc.verticalDramaEpisodes.runStage.useMutation({
    onSuccess: (data, variables) => {
      // Bug #127 — real-mode storyboard_shotgrid comes back almost
      // instantly with `status: "queued"` while the actual generation runs
      // in a background job. Every OTHER stage (and storyboard_shotgrid's
      // own dry_run/plan_only previews) still resolves with a terminal
      // status here exactly as before — this is the ONLY combination that
      // needs to poll instead of toasting "stage complete" immediately,
      // which would otherwise be actively misleading (nothing has finished
      // yet). Fire-and-forget: the poll announces its own toast/invalidate
      // once the real result is known; `handleGenerateEpisodeStoryboard`
      // and the storyboard panel's own button both join this SAME poll
      // (see `submitAndPollStoryboardShotgrid`'s doc comment) rather than
      // starting a second one.
      if (
        VD_ASYNC_POLLED_STAGES.has(variables?.stage ?? "") &&
        data.result.status === "queued"
      ) {
        void submitAndPollStoryboardShotgrid(data);
        return;
      }
      invalidateRuns();
      // Explicit status feedback — previously silent on success, which read
      // as "nothing happened" even when a real LLM generation succeeded or
      // failed with a repairable schema error.
      if (data.result.status === "failed") {
        const message = data.result.errors[0]?.message;
        toast.error(
          lang === "th"
            ? `ขั้นตอนล้มเหลว${message ? `: ${message}` : ""} — ลองใหม่หรือกด "ซ่อม"`
            : `Stage failed${message ? `: ${message}` : ""} — try again or use Repair.`
        );
      } else if (data.result.next_action === "approve") {
        toast.success(
          lang === "th"
            ? "สร้างเนื้อหาสำเร็จ รอการอนุมัติ"
            : "Content generated — awaiting approval."
        );
      } else {
        toast.success(
          lang === "th"
            ? "ขั้นตอนสำเร็จ ไปขั้นตอนถัดไป"
            : "Stage complete — advancing."
        );
      }
    },
    onError: err => toast.error(err.message),
  });
  const regenerateStageMutation =
    trpc.verticalDramaEpisodes.regenerateStage.useMutation({
      onSuccess: (data, variables) => {
        // Bug #127 (regenerate path) — same async change as `runStage`
        // applies to `regenerateStage`: for `storyboard_shotgrid` the old
        // output is deleted and the mutation resolves almost instantly with
        // `status: "queued"` while the real generation runs in a background
        // job. Join the SAME shared poll `runStageMutation.onSuccess` above
        // starts/joins (`submitAndPollStoryboardShotgrid`) instead of
        // toasting "regenerated" now — the delete-old-runs side effect has
        // already happened server-side, so refresh the runs list via
        // `invalidateRuns()`, but let the poll announce the real terminal
        // toast once the background job actually finishes. Reuses the
        // generic "Stage complete"/"Stage failed" copy from
        // `announceStoryboardShotgridTerminal` rather than this mutation's
        // own "regenerated" copy — deliberate, to keep this fix minimal
        // (the poll is shared across all three storyboard_shotgrid call
        // sites and has no way to know which one triggered it).
        if (
          VD_ASYNC_POLLED_STAGES.has(variables?.stage ?? "") &&
          data.result.status === "queued"
        ) {
          invalidateRuns();
          void submitAndPollStoryboardShotgrid(data);
          return;
        }
        invalidateRuns();
        if (data.result.status === "failed") {
          const message = data.result.errors[0]?.message;
          toast.error(
            lang === "th"
              ? `สร้างใหม่ล้มเหลว${message ? `: ${message}` : ""}`
              : `Regeneration failed${message ? `: ${message}` : ""}.`
          );
        } else {
          toast.success(
            lang === "th"
              ? "ลบชุดเดิมและสร้างใหม่แล้ว"
              : "Old output deleted — regenerated."
          );
        }
      },
      onError: err => toast.error(err.message),
    });
  const approveMutation =
    trpc.verticalDramaEpisodes.approveCheckpoint.useMutation({
      onSuccess: (_data, variables) => {
        invalidateRuns();
        void utils.verticalDramaEpisodes.listMemoryEvents.invalidate();
        void utils.verticalDramaSeries.get.invalidate();
        toast.success(
          variables.decision === "reject"
            ? lang === "th"
              ? "ปฏิเสธแล้ว"
              : "Rejected."
            : lang === "th"
              ? "อนุมัติแล้ว — ไปขั้นตอนถัดไป"
              : "Approved — advancing to the next stage."
        );
      },
      onError: err => toast.error(err.message),
    });
  // One-click "generate this episode" orchestration (redesign, 2026-07-05):
  // chains the mechanical setup stages through to the storyboard, auto-
  // approving each mechanical checkpoint immediately so the user lands
  // directly on the 9-shot storyboard instead of clicking through 5
  // individual stage+approve steps. Each stage is its own bounded request
  // (not one long chained backend call) so a slow LLM call on one stage
  // can't time out the whole thing, and the UI can show live per-stage
  // progress text.
  const [generatingEpisodeStage, setGeneratingEpisodeStage] =
    useState<VerticalDramaPipelineStage | null>(null);
  const [generateEpisodeFailure, setGenerateEpisodeFailure] = useState<{
    stage: VerticalDramaPipelineStage;
    message: string;
  } | null>(null);

  async function handleGenerateEpisodeStoryboard() {
    setGenerateEpisodeFailure(null);
    const stages: VerticalDramaPipelineStage[] = [
      "normalize_series_input",
      "plan_episode_script",
      "update_character_visual_bible",
      "generate_or_import_character_refs",
      "storyboard_shotgrid",
    ];
    for (const stage of stages) {
      // Safe to click on a partially-progressed episode (e.g. the script was
      // already generated individually before this button existed) — skip
      // any stage already succeeded instead of blindly regenerating (and
      // re-charging credits for) stages that don't need it.
      if (stageStates[stage]?.status === "succeeded") continue;
      setGeneratingEpisodeStage(stage);
      try {
        const outcome = await runStageMutation.mutateAsync({
          seriesId,
          episodeId,
          stage,
          mode: "full",
        });
        if (outcome.result.status === "failed") {
          setGenerateEpisodeFailure({
            stage,
            message:
              outcome.result.errors[0]?.message ??
              (lang === "th" ? "เกิดข้อผิดพลาด" : "Unknown error"),
          });
          setGeneratingEpisodeStage(null);
          return;
        }
        // Bug #127 — `storyboard_shotgrid` (the last stage in this chain)
        // now comes back `status: "queued"` in real mode; the shared
        // `runStageMutation.onSuccess` above already started (or joined)
        // the background poll for the SAME mutation call — await that same
        // shared result here before letting this loop reach its "episode
        // generated" success toast below, instead of declaring victory
        // while the storyboard generation is still actually running.
        if (VD_ASYNC_POLLED_STAGES.has(stage) && outcome.result.status === "queued") {
          const finalStatus = await submitAndPollStoryboardShotgrid(outcome);
          if (finalStatus !== "succeeded") {
            setGenerateEpisodeFailure({
              stage,
              message:
                finalStatus === "timeout"
                  ? lang === "th"
                    ? "การสร้างสตอรีบอร์ดใช้เวลานานกว่าปกติ ระบบยังทำงานอยู่เบื้องหลัง — กลับมาตรวจสอบภายหลัง"
                    : "Storyboard generation is taking longer than usual and is still running in the background — check back shortly."
                  : lang === "th"
                    ? "สร้างสตอรีบอร์ดล้มเหลว — ลองใหม่หรือกด \"ซ่อม\""
                    : "Storyboard generation failed — try again or use Repair.",
            });
            setGeneratingEpisodeStage(null);
            return;
          }
        }
        if (
          outcome.result.status === "approval_required" &&
          outcome.checkpointId != null
        ) {
          await approveMutation.mutateAsync({
            seriesId,
            episodeId,
            checkpointId: String(outcome.checkpointId),
            decision: "approve",
          });
        }
      } catch (err) {
        setGenerateEpisodeFailure({
          stage,
          message:
            err instanceof Error
              ? err.message
              : lang === "th"
                ? "เกิดข้อผิดพลาด"
                : "Unknown error",
        });
        setGeneratingEpisodeStage(null);
        return;
      }
    }
    setGeneratingEpisodeStage(null);
    toast.success(
      lang === "th"
        ? "สร้างตอนสำเร็จ — พร้อมทำสตอรีบอร์ดแล้ว"
        : "Episode generated — storyboard is ready."
    );
  }

  const createEpisodeMutation =
    trpc.verticalDramaEpisodes.createEpisode.useMutation({
      onSuccess: () => {
        void utils.verticalDramaSeries.get.invalidate();
        invalidateRuns();
      },
    });
  const repairMutation =
    trpc.verticalDramaEpisodes.repairStageOutput.useMutation({
      onSuccess: data => {
        setRepairJobStatus("succeeded");
        setRepairResultArtifactId(data?.result?.artifactIds?.[0]);
        invalidateRuns();
      },
      onError: err => {
        setRepairJobStatus("failed");
        setRepairError(err.message);
      },
    });
  // planning/`polished-toasting-gadget.md` Fix A — dedicated mutation for
  // the "ให้ AI ปรับ" (AI-adjust) button next to a shot's start-frame
  // prompt. Bypasses `repairMutation`/`repairStageOutput` entirely (that
  // dispatcher has no real regeneration branch for `start_frame_render_plan`
  // — see the plan doc); the server persists the new prompt straight onto
  // `startFramePlan.frames[]`, so this only needs to drive the SAME repair-
  // dialog status state `repairMutation`'s own onSuccess/onError set above,
  // so the shared `<VerticalDramaRepairDialog>` instance's job-status UI
  // works identically for this stage. No `resultArtifactId` to set — this
  // procedure returns a prompt, not an artifact-ledger entry, so it stays
  // whatever the onSubmit preamble already cleared it to.
  const generateShotStartFramePromptMutation =
    trpc.verticalDramaEpisodes.generateShotStartFramePrompt.useMutation({
      onSuccess: () => {
        setRepairJobStatus("succeeded");
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => {
        setRepairJobStatus("failed");
        setRepairError(err.message);
      },
    });
  const approveRetconMutation =
    trpc.verticalDramaEpisodes.approveRetconProposal.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.listMemoryEvents.invalidate(),
    });
  const rejectRetconMutation =
    trpc.verticalDramaEpisodes.rejectRetconProposal.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.listMemoryEvents.invalidate(),
    });
  const setApprovedStartFrameAssetMutation =
    trpc.verticalDramaEpisodes.setApprovedStartFrameAsset.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "เปลี่ยนภาพเฟรมเริ่มต้นแล้ว"
            : "Start frame image updated."
        );
        setImageSwapTarget(null);
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });
  // Reuses the character system's own `linkAsset` — swapping a character's
  // reference image from here updates that character everywhere (the same
  // global portrait the character tab manages), not a per-shot override.
  const linkCharacterPortraitMutation =
    trpc.verticalDramaCharacters.linkAsset.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "เปลี่ยนภาพอ้างอิงตัวละครแล้ว"
            : "Character reference image updated."
        );
        setImageSwapTarget(null);
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });
  // Start-frame image generation is async (shows in Media History like every
  // other real generation) — submit returns a taskId, then poll `media.getTask`
  // until it completes, then finalize via the same already-tested
  // resolve-then-link flow the Library/History picker uses (this is exactly
  // what makes the resulting asset show up correctly everywhere, credits
  // included, instead of a one-off synchronous shortcut).
  // A Set, not a single number — "generate all shot images" (bulk redesign,
  // 2026-07-05) submits every shot concurrently, so more than one shot can be
  // polling at once; each shot's own poll loop only ever adds/removes its
  // own shot number, independent of the others.
  const [pollingStartFrameShots, setPollingStartFrameShots] = useState<
    Set<number>
  >(new Set());
  const awaitStartFramePollKeysRef = useRef<Set<string>>(new Set());
  const resolveMediaAssetForImportMutation =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();

  /**
   * Image providers, particularly MCP-backed ones, can take substantially
   * longer than the former five-minute browser window. Keep the async task
   * attached to this page for up to 30 minutes so completion is still
   * finalized into the episode's approved start-frame slot.
   */
  const VD_START_FRAME_POLL_INTERVAL_MS = 2500;
  const VD_START_FRAME_POLL_TIMEOUT_MS = 30 * 60 * 1000;
  const VD_START_FRAME_POLL_MAX_ATTEMPTS = Math.ceil(
    VD_START_FRAME_POLL_TIMEOUT_MS / VD_START_FRAME_POLL_INTERVAL_MS
  );

  async function pollStartFrameTask(
    taskId: string,
    shotNumber: number,
    softenLevel = 0
  ) {
    setPollingStartFrameShots(prev => new Set(prev).add(shotNumber));
    try {
      // Bounded poll (30 min max at 2.5s intervals) — long-running image
      // providers must still have their completed result finalized into the
      // episode card instead of being left only in Media History.
      for (
        let attempt = 0;
        attempt < VD_START_FRAME_POLL_MAX_ATTEMPTS;
        attempt++
      ) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th"
                ? "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                : "Generation completed but no result URL."
            );
            return;
          }
          try {
            const resolved =
              await resolveMediaAssetForImportMutation.mutateAsync({
                seriesId,
                source: "url",
                url: resultUrl,
                mimeType: "image/png",
              });
            await setApprovedStartFrameAssetMutation.mutateAsync({
              seriesId,
              episodeId,
              shotNumber,
              mediaAssetId: resolved.mediaAssetId,
            });
          } catch (err) {
            toast.error(
              lang === "th"
                ? `สร้างภาพเสร็จแล้ว แต่ซิงก์เข้า shot ไม่สำเร็จ${err instanceof Error ? `: ${err.message}` : ""} ตรวจสอบ Media History แล้วลองใหม่`
                : `Image generation finished, but syncing it to the shot failed${err instanceof Error ? `: ${err.message}` : ""}. Check Media History and retry.`
            );
            return;
          }
          toast.success(
            lang === "th"
              ? "สร้างภาพเฟรมเริ่มต้นสำเร็จ"
              : "Start frame image generated."
          );
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
          return;
        }
        if (status === "failed") {
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          const errorMessage = failedTask?.errorMessage;
          // Character-lock auto-soften (2026-07-06 prompt-safety upgrade) —
          // on a policy/content/safety-category provider failure, resubmit
          // the SAME mutation with `softenLevel + 1` (fresh idempotency key)
          // instead of surfacing a generic failure toast, up to the max
          // soften level. Never switches models — only softens prompt text.
          if (
            isCharacterLockPolicyFailureMessage(errorMessage) &&
            softenLevel < VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL
          ) {
            const nextLevel = softenLevel + 1;
            toast.info(
              lang === "th"
                ? `ปรับ prompt ให้อ่อนลงอัตโนมัติเนื่องจากติดนโยบาย model (ครั้งที่ ${nextLevel})`
                : `Automatically softening the prompt due to a model policy rejection (attempt ${nextLevel})`
            );
            generateStartFrameImageMutation.mutate({
              seriesId,
              episodeId,
              shotNumber,
              softenLevel: nextLevel,
              idempotencyKey: crypto.randomUUID(),
            });
            return;
          }
          toast.error(
            buildVdGenerateFailureToastMessage(failedTask, lang, {
              th: "สร้างภาพล้มเหลว",
              en: "Generation failed",
            })
          );
          return;
        }
        await new Promise(resolve =>
          setTimeout(resolve, VD_START_FRAME_POLL_INTERVAL_MS)
        );
      }
      toast.error(
        lang === "th"
          ? "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
          : "Generation is taking too long — check back later."
      );
    } finally {
      setPollingStartFrameShots(prev => {
        const next = new Set(prev);
        next.delete(shotNumber);
        return next;
      });
    }
  }

  const generateStartFrameImageMutation =
    trpc.verticalDramaEpisodes.generateStartFrameImage.useMutation({
      onSuccess: (data, variables) => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        if (
          typeof variables.idempotencyKey === "string" &&
          awaitStartFramePollKeysRef.current.delete(variables.idempotencyKey)
        ) {
          return;
        }
        void pollStartFrameTask(
          data.taskId,
          variables.shotNumber,
          variables.softenLevel ?? 0
        );
      },
      // Release the immediate click-lock (added synchronously by the button
      // handlers before `.mutate()`, so the button disables the instant it's
      // clicked instead of only once polling starts) when the request itself
      // fails — otherwise a shot that never reaches `pollStartFrameTask`'s
      // own `finally` cleanup would stay disabled forever.
      onError: (err, variables) => {
        if (typeof variables.idempotencyKey === "string") {
          awaitStartFramePollKeysRef.current.delete(variables.idempotencyKey);
        }
        // Stale reference-mapping guard (character set changed after the prompt
        // was authored) — give the user a one-click "regenerate prompt" action
        // instead of just a wall of text. Detected by the stable phrase the
        // server embeds in every stale-mapping message.
        const isStaleMapping =
          err.data?.code === "PRECONDITION_FAILED" &&
          typeof err.message === "string" &&
          err.message.includes("ไม่ตรงกับตัวละครในช็อต");
        if (isStaleMapping) {
          toast.error(err.message, {
            duration: 14000,
            action: {
              label: lang === "th" ? "สร้าง prompt ใหม่" : "Regenerate prompt",
              onClick: () =>
                void handleGeneratePromptAndImage(variables.shotNumber, "single"),
            },
          });
        } else {
          // Feature 135 section-10 review fix: a `[HERMES_X] ...` prefixed
          // message (pinned server wire convention) renders via
          // `presentHermesError` instead of leaking the raw bracketed
          // English string; every other message is unaffected.
          const hermesPresentation = presentHermesError(err);
          toast.error(
            hermesPresentation ? formatHermesErrorForToast(hermesPresentation, lang) : err.message
          );
          // The server now fails closed (BAD_REQUEST) when this episode has
          // no explicit image model selection — surface the picker so the
          // user can fix it in one click instead of re-reading the toast.
          if (err.data?.code === "BAD_REQUEST") scrollToVdModelPicker("image");
        }
        setPollingStartFrameShots(prev => {
          const next = new Set(prev);
          next.delete(variables.shotNumber);
          return next;
        });
      },
    });


  // Multi-angle (3x3 grid) generation — submit + poll like start-frame
  // images, but the result is a single grid URL the panel splits
  // client-side into 9 candidates for the user to pick from (not
  // auto-finalized), so no `setApprovedStartFrameAsset` call here.
  const [pollingAngleVariationsShot, setPollingAngleVariationsShot] = useState<
    number | null
  >(null);
  const [angleVariationGridUrlByShot, setAngleVariationGridUrlByShot] =
    useState<Record<number, string>>({});
  const angleVariationUploadMutation = trpc.ai.upload.useMutation();
  const startFrameDropUploadMutation = trpc.ai.upload.useMutation();

  /** Shot numbers with an angle-variations task currently being polled (live
   *  submit OR resumed-on-load) — guards against double-polling the same
   *  shot from both paths (2026-07-06 orphaned-task fix), same ref-guard
   *  convention as `splitInFlightShotsRef` in the storyboard panel. */
  const angleVariationsPollInFlightRef = useRef<Set<number>>(new Set());

  /** Phase 5d (`planning/vd-start-frame-reference-mapping/plan.md`, client
   *  half) — persists the completed grid IMAGE ITSELF (not a picked tile) as
   *  a durable `startFramePlan.frames[shot].angleGridAssetIds` entry, so a
   *  later session can reopen this exact grid via "กริดที่สร้างไว้" even
   *  after all 9 tiles have been dismissed/consumed. No `onError` here — see
   *  `persistAngleGridAsMediaAsset`'s own doc comment (fire-and-forget). */
  const recordShotAngleGridAssetMutation =
    trpc.verticalDramaEpisodes.recordShotAngleGridAsset.useMutation();

  /** Best-effort persistence of a completed/reopened grid image as a durable
   *  media asset (Phase 5d). Deliberately never throws/toasts — a failure
   *  here only means this grid won't show up in "กริดที่สร้างไว้" later, not
   *  that anything the user is actively doing (the existing pick-a-cell
   *  flow, driven entirely by `angleVariationGridUrlByShot`/`persistAngleGrid`
   *  above) is affected. `resolveMediaAssetForImport` dedupes by URL
   *  checksum server-side, so calling this twice for the same grid URL (live
   *  completion + a later resume-on-load, or reopening an already-stored
   *  grid) is idempotent — same `mediaAssetId` both times, and
   *  `recordShotAngleGridAsset` itself dedupes+promotes-to-most-recent. */
  async function persistAngleGridAsMediaAsset(
    shotNumber: number,
    gridUrl: string
  ) {
    try {
      const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
        seriesId,
        source: "url",
        url: gridUrl,
        mimeType: "image/jpeg",
      });
      const result = await recordShotAngleGridAssetMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId: resolved.mediaAssetId,
      });
      // Patch the cache directly (no full refetch needed) so the
      // "กริดที่สร้างไว้" thumbnails appear immediately.
      utils.verticalDramaEpisodes.getEpisodeDetail.setData(
        { seriesId, episodeId },
        prev =>
          prev
            ? {
                ...prev,
                angleGridAssetsByShotNumber: {
                  ...(prev.angleGridAssetsByShotNumber ?? {}),
                  [shotNumber]: result.angleGridAssets,
                },
              }
            : prev
      );
    } catch (err) {
      console.warn(
        "[VerticalDramaEpisodePage] failed to persist angle-grid media asset",
        err
      );
    }
  }

  /** Shared completion handler for BOTH the live submit-then-poll path and
   *  the resume-on-load path (2026-07-06 fix) — both must converge on the
   *  identical persisted `angleGrid` shape ({ imageUrl, mediaTaskId,
   *  dismissedIndexes }, `pendingTaskId` dropped) so the storyboard panel's
   *  split/picker effects can't tell which path produced it. */
  function resolveCompletedAngleVariationsTask(
    shotNumber: number,
    resultUrl: string,
    taskId: string,
    dismissedIndexes: number[]
  ) {
    setAngleVariationGridUrlByShot(prev => ({
      ...prev,
      [shotNumber]: resultUrl,
    }));
    persistedAngleGridUrlByShotRef.current[shotNumber] = resultUrl;
    persistAngleGrid(shotNumber, {
      imageUrl: resultUrl,
      mediaTaskId: taskId,
      dismissedIndexes,
    });
    // Phase 5d — best-effort, never blocks/toasts (see doc comment above).
    void persistAngleGridAsMediaAsset(shotNumber, resultUrl);
  }

  /** "กริดที่สร้างไว้" thumbnail click (Phase 5d) — loads a previously-stored
   *  grid back into the SAME `angleVariationGridUrlByShot`/picker flow a
   *  freshly-completed grid uses. The pre-existing persist effect (below,
   *  keyed off `persistedAngleGridUrlByShotRef`) picks this up and calls
   *  `persistAngleGrid` for us — no need to duplicate that here. Does NOT
   *  re-call `persistAngleGridAsMediaAsset`: this grid is already recorded
   *  (that's how it got into `angleGridAssetsByShotNumber` in the first
   *  place). */
  function handleOpenStoredAngleGrid(shotNumber: number, url: string) {
    setAngleVariationGridUrlByShot(prev => ({ ...prev, [shotNumber]: url }));
  }

  /**
   * Polls `media.getTask` for an angle-variations grid task to completion.
   * Used both right after submit (live path) and on resume-on-load for a
   * `pendingTaskId` left behind by an interrupted prior session (2026-07-06
   * fix — grids that completed server-side while the page was reloaded/
   * closed used to be orphaned forever, since the ONLY thing tracking the
   * in-flight task was this function's in-memory state).
   *
   * `dismissedIndexes` lets the resume path preserve any dismissals already
   * recorded (not applicable for a live submit, where it's always []).
   */
  async function pollAngleVariationsTask(
    taskId: string,
    shotNumber: number,
    dismissedIndexes: number[] = [],
    softenLevel = 0
  ) {
    if (angleVariationsPollInFlightRef.current.has(shotNumber)) return;
    angleVariationsPollInFlightRef.current.add(shotNumber);
    setPollingAngleVariationsShot(shotNumber);
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th"
                ? "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                : "Generation completed but no result URL."
            );
            persistAngleGrid(shotNumber, null);
            return;
          }
          resolveCompletedAngleVariationsTask(
            shotNumber,
            resultUrl,
            taskId,
            dismissedIndexes
          );
          return;
        }
        if (status === "failed") {
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          const errorMessage = failedTask?.errorMessage;
          // Character-lock auto-soften — same convention as `pollStartFrameTask`.
          if (
            isCharacterLockPolicyFailureMessage(errorMessage) &&
            softenLevel < VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL
          ) {
            const nextLevel = softenLevel + 1;
            toast.info(
              lang === "th"
                ? `ปรับ prompt ให้อ่อนลงอัตโนมัติเนื่องจากติดนโยบาย model (ครั้งที่ ${nextLevel})`
                : `Automatically softening the prompt due to a model policy rejection (attempt ${nextLevel})`
            );
            persistAngleGrid(shotNumber, null);
            angleVariationsPollInFlightRef.current.delete(shotNumber);
            setPollingAngleVariationsShot(current =>
              current === shotNumber ? null : current
            );
            generateAngleVariationsMutation.mutate({
              seriesId,
              episodeId,
              shotNumber,
              softenLevel: nextLevel,
              idempotencyKey: crypto.randomUUID(),
            });
            return;
          }
          toast.error(
            buildVdGenerateFailureToastMessage(failedTask, lang, {
              th: "สร้างภาพล้มเหลว",
              en: "Generation failed",
            })
          );
          // Clear the orphan-recovery marker so a failed task isn't retried
          // as "still pending" forever (2026-07-06 fix).
          persistAngleGrid(shotNumber, null);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        lang === "th"
          ? "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
          : "Generation is taking too long — check back later."
      );
    } finally {
      angleVariationsPollInFlightRef.current.delete(shotNumber);
      setPollingAngleVariationsShot(current =>
        current === shotNumber ? null : current
      );
    }
  }

  const generateAngleVariationsMutation =
    trpc.verticalDramaEpisodes.generateStartFrameAngleVariations.useMutation({
      onSuccess: (data, variables) => {
        // Persist the pending task marker BEFORE polling starts (2026-07-06
        // fix) — if the page reloads/navigates away before this poll
        // observes completion, the resume-on-load effect below can pick the
        // task back up instead of the grid being silently lost forever.
        persistAngleGrid(variables.shotNumber, {
          pendingTaskId: data.taskId,
          dismissedIndexes: [],
        });
        void pollAngleVariationsTask(
          data.taskId,
          variables.shotNumber,
          [],
          variables.softenLevel ?? 0
        );
      },
      onError: (err, variables) => {
        const isStaleMapping =
          err.data?.code === "PRECONDITION_FAILED" &&
          typeof err.message === "string" &&
          err.message.includes("ไม่ตรงกับตัวละครในช็อต");
        if (isStaleMapping) {
          toast.error(err.message, {
            duration: 14000,
            action: {
              label: lang === "th" ? "สร้าง prompt ใหม่" : "Regenerate prompt",
              onClick: () =>
                void handleGeneratePromptAndImage(variables.shotNumber, "angles"),
            },
          });
          return;
        }
        const hermesPresentation = presentHermesError(err);
        toast.error(
          hermesPresentation ? formatHermesErrorForToast(hermesPresentation, lang) : err.message
        );
        if (err.data?.code === "BAD_REQUEST") scrollToVdModelPicker("image");
      },
    });

  async function handlePickAngleVariationCandidate(
    shotNumber: number,
    candidateDataUrl: string
  ) {
    try {
      const uploadResult = await angleVariationUploadMutation.mutateAsync({
        fileName: `shot-${shotNumber}-angle-${Date.now()}.jpg`,
        fileType: "image/jpeg",
        fileBase64: candidateDataUrl,
      });
      const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
        seriesId,
        source: "url",
        url: uploadResult.url,
        mimeType: uploadResult.fileType,
      });
      await setApprovedStartFrameAssetMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId: resolved.mediaAssetId,
      });
      // Picking a candidate closes the picker (same as "dismiss") — clear
      // the persisted grid too so a reload doesn't bring the picker back
      // for a shot that already has its final start frame chosen.
      setAngleVariationGridUrlByShot(prev => {
        const next = { ...prev };
        delete next[shotNumber];
        return next;
      });
      delete persistedAngleGridUrlByShotRef.current[shotNumber];
      const plan = episodeDetailQuery.data?.startFramePlan;
      const frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
      if (frame?.angleGrid) persistAngleGrid(shotNumber, null);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เลือกภาพไม่สำเร็จ"
            : "Failed to select image"
      );
      // 2026-07-07 fix: rethrow so the panel's "ใช้เป็นภาพเริ่มต้น" button
      // knows the swap failed and keeps the picker open instead of clearing
      // it optimistically (the picker used to disappear even when the
      // upload/resolve/set chain above failed, leaving the shot's start
      // frame unchanged with only this toast as a clue).
      throw err;
    }
  }

  /** Dragging an image directly onto a shot's start-frame slot (no need to
   *  open the swap panel first) — uploads local files when needed, resolves
   *  the durable URL to a canonical media asset, then links it immediately. */
  async function handleDropStartFrame(
    shotNumber: number,
    input: VerticalDramaStartFrameDropInput
  ) {
    try {
      await replaceVerticalDramaStartFrame(input, {
        upload: payload => startFrameDropUploadMutation.mutateAsync(payload),
        resolveMediaAsset: ({ url, mimeType }) =>
          resolveMediaAssetForImportMutation.mutateAsync({
            seriesId,
            source: "url",
            url,
            mimeType,
          }),
        setApprovedMediaAsset: mediaAssetId =>
          setApprovedStartFrameAssetMutation.mutateAsync({
            seriesId,
            episodeId,
            shotNumber,
            mediaAssetId,
          }),
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เปลี่ยนภาพไม่สำเร็จ"
            : "Failed to change image"
      );
    }
  }

  /** Same drop-to-replace shortcut, targeting a character's global portrait
   *  instead of one shot's start frame. */
  async function handleDropCharacterReference(
    characterId: string,
    url: string
  ) {
    try {
      const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
        seriesId,
        source: "url",
        url,
        mimeType: "image/jpeg",
      });
      await linkCharacterPortraitMutation.mutateAsync({
        seriesId,
        characterId,
        mediaAssetId: resolved.mediaAssetId,
        assetType: "character_reference",
        role: "primary_portrait",
        source: "imported",
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เปลี่ยนภาพไม่สำเร็จ"
            : "Failed to change image"
      );
    }
  }

  // Resolve the episode metadata (episodeNumber / title / status) from the
  // owning series detail — the base series router already exposes its episodes.
  const episode = useMemo(() => {
    const eps = seriesQuery.data?.episodes ?? [];
    const found = eps.find(e => String(e.id) === String(episodeId));
    return found
      ? {
          id: String(found.id),
          episodeNumber: found.episodeNumber,
          title: found.title,
          status: found.status,
        }
      : null;
  }, [seriesQuery.data, episodeId]);

  const completed = episode?.status === "completed";

  // Detects whether THIS episode was already manually summarized into series
  // memory (`summarizeEpisodeToMemory`'s own "already ran" state — tracked
  // independently from the pipeline-run `approveCheckpoint` path's events,
  // which never carry `payload.source === "manual"`).
  const episodeMemorySummaryQuery =
    trpc.verticalDramaEpisodes.listMemoryEvents.useQuery(
      {
        seriesId,
        kind: "episode_summary",
        episodeNumber: episode?.episodeNumber,
        limit: 50,
      },
      { enabled: Boolean(seriesId) && episode?.episodeNumber != null }
    );
  const episodeAlreadySummarizedToMemory = (
    episodeMemorySummaryQuery.data?.events ?? []
  ).some(
    (ev: { memoryKind?: string; payload?: Record<string, unknown> }) =>
      ev.memoryKind === "episode_summary" && ev.payload?.source === "manual"
  );

  const runRows = runsQuery.data?.runs ?? [];

  // Runs list rows (typed for the workspace's runs sub-list).
  const runs = useMemo<VerticalDramaRunRow[]>(
    () =>
      runRows.map(r => ({
        runId: r.runId,
        stage: r.stage as VerticalDramaPipelineStage,
        status: r.status,
        mode: r.mode,
        startedAt: r.startedAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt,
        artifactLedgerHref: r.artifactLedgerHref,
      })),
    [runRows]
  );

  // Per-stage state: the latest run per stage (runs come newest-first), with the
  // pending approval checkpoint id attached so the approval bar can approve.
  const stageStates = useMemo(() => {
    const map: Partial<
      Record<VerticalDramaPipelineStage, VerticalDramaStageState>
    > = {};
    for (const r of runRows) {
      const stage = r.stage as VerticalDramaPipelineStage;
      if (map[stage]) continue;
      map[stage] = {
        stage,
        status: r.status as RunResult["status"],
        nextAction: r.nextAction as RunResult["next_action"],
        artifactIds: r.artifactIds,
      };
    }
    for (const cp of checkpointsQuery.data?.checkpoints ?? []) {
      const stage = cp.stage as VerticalDramaPipelineStage;
      const s = map[stage];
      if (s && !s.checkpointId) s.checkpointId = cp.checkpointId;
    }
    return map;
  }, [runRows, checkpointsQuery.data]);

  function openRepair(
    stage: VerticalDramaPipelineStage,
    target?: VerticalDramaRepairTarget,
    template?: string
  ) {
    setRepairStage(stage);
    setRepairTarget(target);
    setRepairTemplate(template);
    setRepairJobStatus("idle");
    setRepairResultArtifactId(undefined);
    setRepairError(undefined);
  }

  // Generic "view this stage's runs/artifacts" detail — every stage except
  // dialogue_audio_plan falls back to this (spec §09 run ledger).
  const assemblyRunsQuery = trpc.verticalDramaAssembly.listRuns.useQuery(
    { seriesId, episodeId },
    { enabled }
  );
  const assemblyRuns = assemblyRunsQuery.data?.runs ?? [];
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    undefined
  );

  // Default the selected run to the focused stage's latest run whenever focus changes.
  useEffect(() => {
    if (!stageDetailStage) return;
    const latest = assemblyRuns.find(r => r.stage === stageDetailStage);
    setSelectedRunId(latest?.runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageDetailStage, assemblyRunsQuery.dataUpdatedAt]);

  const runDetailQuery = trpc.verticalDramaAssembly.getRunDetail.useQuery(
    { seriesId, episodeId, runId: selectedRunId ?? "" },
    { enabled: enabled && Boolean(selectedRunId) }
  );

  // Dialogue/audio plan for the dedicated review panel.
  const episodeDetailQuery =
    trpc.verticalDramaEpisodes.getEpisodeDetail.useQuery(
      { seriesId, episodeId },
      { enabled }
    );

  // Task #26 (data sanity — episode number beyond the planned season size)
  // — deliberately a SEPARATE query from `episodeDetailQuery` (see
  // `getEpisodeBreakdownStatus`'s doc comment on the server for why), fired
  // in parallel via TanStack Query the same way every other independent
  // query hook on this page is.
  const episodeBreakdownStatusQuery =
    trpc.verticalDramaEpisodes.getEpisodeBreakdownStatus.useQuery(
      { seriesId, episodeId },
      { enabled }
    );

  /* ---- Phase 1.3 — episode-level image/video model selection ----
   * Vertical-drama-ready models only (Phase 0.4 filter); the currently
   * selected model comes from the episode's own persisted plans
   * (`startFramePlan.selectedImageModelId` / `motionPromptPack.selectedVideoModelId`)
   * — falling back to this series' last-picked default (localStorage) only
   * when the episode has no selection yet at all (brand-new episode). */
  const imageModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "image", verticalDramaReady: true },
    { enabled }
  );
  const videoModelsQuery = trpc.mediaModels.list.useQuery(
    { type: "video", verticalDramaReady: true },
    { enabled }
  );
  const imageModels = (imageModelsQuery.data?.models ??
    []) as VerticalDramaCapableModel[];
  const videoModels = (videoModelsQuery.data?.models ??
    []) as VerticalDramaCapableModel[];

  /** Feature 135 (Hermes/Grok media worker), section-10 §4.5 — the
   *  hydration guard needs to know whether an AUTHORIZED hermes connection
   *  exists for the remembered per-series default model's asset type, but
   *  ONLY when that remembered model actually resolves to hermes transport
   *  (avoids an unconditional extra query on every page load for the common
   *  case where the remembered default is a gateway/MCP model). */
  const rememberedImageModelIdForHydration = readStoredSeriesModelDefault(
    seriesId,
    "image"
  );
  const rememberedImageModelRowForHydration =
    imageModels.find(m => m.modelId === rememberedImageModelIdForHydration) ??
    null;
  const rememberedImageModelIsHermesForHydration = Boolean(
    rememberedImageModelRowForHydration &&
      resolveMediaModelTransportConfig({
        configJson: rememberedImageModelRowForHydration.configJson,
      }).transport === "hermes_worker"
  );
  const hermesImageConnectionsForHydrationQuery =
    trpc.hermesConnections.listConnections.useQuery(
      { assetType: "image" },
      { enabled: rememberedImageModelIsHermesForHydration, retry: false }
    );
  const hasAuthorizedHermesImageConnectionForHydration = (
    hermesImageConnectionsForHydrationQuery.data ?? []
  ).some((connection: { status: string }) => connection.status === "authorized");

  const rememberedVideoModelIdForHydration = readStoredSeriesModelDefault(
    seriesId,
    "video"
  );
  const rememberedVideoModelRowForHydration =
    videoModels.find(m => m.modelId === rememberedVideoModelIdForHydration) ??
    null;
  const rememberedVideoModelIsHermesForHydration = Boolean(
    rememberedVideoModelRowForHydration &&
      resolveMediaModelTransportConfig({
        configJson: rememberedVideoModelRowForHydration.configJson,
      }).transport === "hermes_worker"
  );
  const hermesVideoConnectionsForHydrationQuery =
    trpc.hermesConnections.listConnections.useQuery(
      { assetType: "video" },
      { enabled: rememberedVideoModelIsHermesForHydration, retry: false }
    );
  const hasAuthorizedHermesVideoConnectionForHydration = (
    hermesVideoConnectionsForHydrationQuery.data ?? []
  ).some((connection: { status: string }) => connection.status === "authorized");

  const episodeSelectedImageModelId =
    episodeDetailQuery.data?.startFramePlan?.selectedImageModelId ?? "";
  const episodeSelectedVideoModelId =
    episodeDetailQuery.data?.motionPromptPack?.selectedVideoModelId ?? "";
  /** Optimistic per-episode model selection — mirrors the Character tab's
   *  instant local-state picker (`VerticalDramaCharacterStockPanel`'s
   *  `selectedImageModelId` useState). The storyboard model choice is
   *  server-persisted (drives generation + survives reload), but relying on
   *  the `setEpisodeModelSelection` mutation + refetch alone means the picker
   *  button and the MCP-connection row it reveals wouldn't react until the
   *  server confirmed — and for a heavy user whose localStorage is full, the
   *  localStorage fallback below writes nothing, so there'd be no instant
   *  feedback at all (the "picks a model but nothing happens / MCP row never
   *  shows" report). Holding the just-picked id locally makes the selection
   *  appear immediately; it's reset per episode (below) so a pick never leaks
   *  across episodes, and cleared on mutation error so a failed save reverts
   *  to the true server state. */
  const [optimisticImageModelId, setOptimisticImageModelId] = useState<
    string | null
  >(null);
  const [optimisticVideoModelId, setOptimisticVideoModelId] = useState<
    string | null
  >(null);
  useEffect(() => {
    setOptimisticImageModelId(null);
    setOptimisticVideoModelId(null);
  }, [episodeId]);
  const selectedImageModelId =
    optimisticImageModelId ??
    (episodeSelectedImageModelId ||
      readStoredSeriesModelDefault(seriesId, "image"));
  const selectedVideoModelId =
    optimisticVideoModelId ??
    (episodeSelectedVideoModelId ||
      readStoredSeriesModelDefault(seriesId, "video"));

  const setEpisodeModelSelectionMutation =
    trpc.verticalDramaEpisodes.setEpisodeModelSelection.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "บันทึกการเลือกโมเดลแล้ว" : "Model selection saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => {
        // Revert the optimistic pick so the UI reflects the true (unsaved)
        // server state instead of a selection that never persisted.
        setOptimisticImageModelId(null);
        setOptimisticVideoModelId(null);
        toast.error(err.message);
      },
    });

  /** Auto-hydrate the remembered per-series model choice into a BRAND-NEW
   *  episode (Phase 1.3 "pick once, use forever" follow-up to the server's
   *  fail-closed model requirement) — a fresh episode's
   *  `startFramePlan.selectedImageModelId` / `motionPromptPack.selectedVideoModelId`
   *  start out EMPTY (the server no longer silently seeds `DEFAULT_MODELS`),
   *  so without this the very first generate click on a new episode would
   *  hit the server's BAD_REQUEST guard even though the user already picked
   *  a model on a previous episode of the same series. Only fires when the
   *  PER-EPISODE selection is empty (never overwrites an explicit choice)
   *  AND the remembered series default still resolves to a valid, enabled
   *  model in the freshly-loaded catalog — a stale/disabled id is left
   *  alone so the buttons stay disabled and the user is prompted to pick
   *  again. `hydratedModelDefaultRef` guards each (episodeId, kind) pair to
   *  fire at most once per mount: `setEpisodeModelSelectionMutation`'s own
   *  `onSuccess` invalidates `getEpisodeDetail`, which flips
   *  `episodeSelectedImageModelId`/`episodeSelectedVideoModelId` non-empty
   *  on the next render (the effect's own re-run guard), but the ref closes
   *  the small window between the mutation firing and that refetch
   *  landing — without it a slow refetch could let the effect fire twice
   *  for the same (episodeId, kind) before the first write is reflected. */
  const hydratedModelDefaultRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!episodeDetailQuery.data) return;
    const candidates: Array<{
      kind: "image" | "video";
      episodeValue: string;
      models: VerticalDramaCapableModel[];
      hasAuthorizedHermesConnection: boolean;
    }> = [
      {
        kind: "image",
        episodeValue: episodeSelectedImageModelId,
        models: imageModels,
        hasAuthorizedHermesConnection: hasAuthorizedHermesImageConnectionForHydration,
      },
      {
        kind: "video",
        episodeValue: episodeSelectedVideoModelId,
        models: videoModels,
        hasAuthorizedHermesConnection: hasAuthorizedHermesVideoConnectionForHydration,
      },
    ];
    for (const { kind, episodeValue, models, hasAuthorizedHermesConnection } of candidates) {
      if (episodeValue) continue; // episode already has its own selection
      const hydrateKey = `${episodeId}:${kind}`;
      if (hydratedModelDefaultRef.current.has(hydrateKey)) continue;
      const storedDefault = readStoredSeriesModelDefault(seriesId, kind);
      if (!storedDefault) continue;
      const modelRow = models.find(m => m.modelId === storedDefault) ?? null;
      const isValid = shouldHydrateRememberedVdModel({
        rememberedModelId: storedDefault,
        modelRow: modelRow
          ? { isEnabled: modelRow.isEnabled !== false, configJson: modelRow.configJson }
          : null,
        hasAuthorizedHermesConnection,
      });
      if (!isValid) continue; // stale/disabled, or hermes with no authorized connection — leave empty, user re-picks
      if (setEpisodeModelSelectionMutation.isPending) continue;
      hydratedModelDefaultRef.current.add(hydrateKey);
      setEpisodeModelSelectionMutation.mutate(
        kind === "image"
          ? { seriesId, episodeId, selectedImageModelId: storedDefault }
          : { seriesId, episodeId, selectedVideoModelId: storedDefault }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    episodeDetailQuery.data,
    episodeId,
    seriesId,
    episodeSelectedImageModelId,
    episodeSelectedVideoModelId,
    imageModels,
    videoModels,
    hasAuthorizedHermesImageConnectionForHydration,
    hasAuthorizedHermesVideoConnectionForHydration,
  ]);

  /**
   * Product tie-in chip data (spec §13, storyboard product-tie-in wiring) —
   * client-side re-derivation of `verticalDramaProductTieIn.ts`'s
   * `extractShotProductPlacements` (kept duplicated rather than imported
   * since that module lives under `server/services/`, not `@shared/`, and
   * pulling server code into the client bundle is out of scope here). Reads
   * the same normalized `product_tie_in_plan.tie_ins[]` shape the server
   * writes onto `episode.script`, joined with the series' `productTieIn`
   * config for the display name. Read-only — this never triggers generation,
   * only shows which shots the pipeline already wired the product into.
   */
  const productTieInByShot = useMemo(() => {
    const script = episodeDetailQuery.data?.script as
      | { product_tie_in_plan?: { tie_ins?: unknown[] } }
      | null
      | undefined;
    const tieIns = script?.product_tie_in_plan?.tie_ins;
    if (!Array.isArray(tieIns) || tieIns.length === 0) return {};

    const rawProductTieIn = seriesQuery.data?.series?.productTieIn as
      | { productName?: string }
      | null
      | undefined;
    const productName = rawProductTieIn?.productName;

    // Additive (2026-07-06 Thai ad-compliance upgrade) — per-clip mandated
    // disclosure line, keyed by the clip's source shot number, from the
    // already-loaded `motionPromptPack.clips[].requiredDisclosure` (set by
    // `generateShotVideoPrompt` when the shot's product category requires
    // one). Read here rather than re-deriving from the tie-in config alone,
    // since the category->disclosure mapping is resolved server-side at
    // generation time.
    const pack = episodeDetailQuery.data?.motionPromptPack as
      | {
          clips?: Array<{
            sourceShotNumbers?: number[];
            requiredDisclosure?: string;
          }>;
        }
      | null
      | undefined;
    const requiredDisclosureByShot: Record<number, string> = {};
    for (const clip of pack?.clips ?? []) {
      if (!clip.requiredDisclosure) continue;
      for (const shotNumber of clip.sourceShotNumbers ?? []) {
        requiredDisclosureByShot[shotNumber] = clip.requiredDisclosure;
      }
    }

    const result: Record<
      number,
      {
        productName?: string;
        placementStyle?: "hero_prop" | "background" | "in_use_moment";
        benefitTalkingPoint?: string;
        requiredDisclosure?: string;
      }
    > = {};
    for (const raw of tieIns) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      const shotNumbers = Array.isArray(entry.shot_numbers)
        ? entry.shot_numbers
        : entry.shot_number !== undefined
          ? [entry.shot_number]
          : [];
      const storyFunction =
        typeof entry.story_function === "string"
          ? entry.story_function.trim()
          : "";
      if (!storyFunction) continue;
      const placementStyleRaw =
        typeof entry.placement_style === "string"
          ? entry.placement_style
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, "_")
          : "in_use_moment";
      const placementStyle: "hero_prop" | "background" | "in_use_moment" =
        placementStyleRaw === "hero_prop" || placementStyleRaw === "background"
          ? placementStyleRaw
          : "in_use_moment";
      const benefitTalkingPoint =
        typeof entry.benefit_talking_point === "string"
          ? entry.benefit_talking_point
          : typeof entry.benefit === "string"
            ? entry.benefit
            : undefined;
      for (const n of shotNumbers) {
        const shotNumber = typeof n === "number" ? n : Number(n);
        if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 9)
          continue;
        result[shotNumber] = {
          productName,
          placementStyle,
          benefitTalkingPoint,
          requiredDisclosure: requiredDisclosureByShot[shotNumber],
        };
      }
    }
    return result;
  }, [
    episodeDetailQuery.data?.script,
    episodeDetailQuery.data?.motionPromptPack,
    seriesQuery.data?.series,
  ]);

  /**
   * Every available product reference image for the series' tie-in config
   * (2026-07-06 product-reference upgrade) — the storyboard panel's
   * "เปลี่ยนภาพสินค้า" picker source list. Enabled only once tie-in shots
   * actually exist for this episode (`productTieInByShot` non-empty), so the
   * query is never fired for episodes without a product tie-in.
   */
  const productImagesQuery =
    trpc.verticalDramaSeries.listProductImages.useQuery(
      { seriesId },
      {
        enabled:
          Boolean(seriesId) && Object.keys(productTieInByShot).length > 0,
      }
    );

  /** Whether the SERIES has product tie-in configured at all (spec §13.1) —
   *  independent of `flags.tieInQc`. `VerticalDramaTieInReportCard` needs
   *  this to render its "no report yet" empty state even before the first
   *  quality review has produced a `tieInQualityReport` (see the panel's own
   *  `tieInQcEnabled && (tieInEnabled || tieInQualityReport)` gate). Read
   *  straight off the same `productTieIn` column `productTieInByShot` above
   *  already reads, mirroring `getEpisodeDetail`'s own `seriesTieInEnabled`
   *  derivation (server-side, wizard input only — not returned as its own
   *  field on the payload). */
  const tieInEnabled = Boolean(
    (
      seriesQuery.data?.series?.productTieIn as
        | { enabled?: boolean }
        | null
        | undefined
    )?.enabled
  );

  const [savingProductReferencesForShot, setSavingProductReferencesForShot] =
    useState<number | null>(null);
  const saveShotProductReferencesMutation =
    trpc.verticalDramaEpisodes.updateEpisodeDraft.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "อัปเดตภาพอ้างอิงสินค้าแล้ว"
            : "Product reference image(s) updated."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  /**
   * Persist a shot's user-chosen product reference image URL(s) —
   * `productReferenceAssetIds` + `productRefsCustomized: true` (even for an
   * explicit empty selection, so the pipeline's auto-resolution never
   * refills this shot again — see `verticalDramaEpisodePipeline.ts`'s
   * `productRefsCustomized` gate). Free `updateEpisodeDraft` JSONB-patch,
   * same convention as `handleSaveStartFramePrompt`/`persistAngleGrid`.
   */
  function handleSaveShotProductReferences(shotNumber: number, urls: string[]) {
    const plan = episodeDetailQuery.data?.startFramePlan;
    if (!plan) return;
    const updatedFrames = (plan.frames ?? []).map(frame =>
      frame.shotNumber === shotNumber
        ? {
            ...frame,
            productReferenceAssetIds: urls,
            productRefsCustomized: true,
          }
        : frame
    );
    setSavingProductReferencesForShot(shotNumber);
    saveShotProductReferencesMutation.mutate(
      {
        seriesId,
        episodeId,
        startFramePlan: { ...plan, frames: updatedFrames },
      },
      { onSettled: () => setSavingProductReferencesForShot(null) }
    );
  }

  /**
   * Per-shot character/variant reference override (planning/vertical-drama-
   * twin-variant-completeness/plan.md, W6 frontend) — separate from and
   * additive to the series-wide "change reference image" swap. Sends the
   * shot's FULL replacement `requiredCharacterRefs` array (empty array
   * clears every reference for this shot). Refetches `getEpisodeDetail` on
   * success (same convention as `saveShotProductReferencesMutation` above)
   * so the shot's character chips re-render from the newly-patched
   * `startFramePlan` without any manual cache surgery.
   */
  const [
    savingShotCharacterReferencesForShot,
    setSavingShotCharacterReferencesForShot,
  ] = useState<number | null>(null);
  const setShotCharacterReferenceMutation =
    trpc.verticalDramaEpisodes.setShotCharacterReference.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "อัปเดตตัวละครอ้างอิงของช็อตนี้แล้ว"
            : "This shot's character reference(s) updated."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  function handleSetShotCharacterReferences(
    shotNumber: number,
    characterRefs: string[]
  ) {
    setSavingShotCharacterReferencesForShot(shotNumber);
    setShotCharacterReferenceMutation.mutate(
      { seriesId, episodeId, shotNumber, characterRefs },
      {
        onSettled: () => setSavingShotCharacterReferencesForShot(null),
      }
    );
  }

  /**
   * "Repair missing characters" (episode-level) — scans every shot's
   * resolved dialogue speakers and union-merges any missing roster
   * character into that shot's `requiredCharacterRefs` (never removes
   * anything). Free/no-LLM-cost, no confirm dialog needed — same "cheap
   * direct data patch, refetch on success" convention as
   * `handleSetShotCharacterReferences` above.
   */
  const repairShotCharacterReferencesMutation =
    trpc.verticalDramaEpisodes.repairEpisodeShotCharacterReferences.useMutation(
      {
        onSuccess: data => {
          if (data.added.length === 0) {
            toast.success(
              lang === "th"
                ? "ไม่พบตัวละครที่ขาด"
                : "No missing characters found."
            );
            return;
          }
          const names = Array.from(
            new Set(data.added.flatMap(a => a.addedNames))
          );
          const resetShots = data.added
            .filter(a => a.promptReset)
            .map(a => a.shotNumber);
          const base =
            lang === "th"
              ? `เพิ่มตัวละคร ${names.join(", ")} เข้า ${data.added.length} ช็อต`
              : `Added ${names.join(", ")} to ${data.added.length} shot(s).`;
          const resetNote =
            resetShots.length > 0
              ? lang === "th"
                ? ` — ช็อต ${resetShots.join(", ")} ต้องกดสร้าง prompt ใหม่ (ตัวละครเปลี่ยน ทำให้ลำดับภาพเปลี่ยน)`
                : ` — regenerate the prompt for shot(s) ${resetShots.join(", ")} (characters changed, image order shifted).`
              : "";
          toast.success(base + resetNote);
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        },
        onError: err => toast.error(err.message),
      }
    );

  function handleRepairMissingShotCharacters() {
    repairShotCharacterReferencesMutation.mutate({ seriesId, episodeId });
  }

  /**
   * Per-shot LOCATION override (Phase D, `planning/polished-toasting-
   * gadget.md` — location visual bible) — the location sibling of
   * `handleSetShotCharacterReferences` above, independent of the
   * storyboard's own `distinct_locations[]` shot grouping. `locationKey:
   * null` clears the override. Refetches `getEpisodeDetail` on success (same
   * convention as every other shot-level patch on this page) so the shot's
   * location chip + its resolved reference image re-render immediately.
   */
  const setShotLocationMutation =
    trpc.verticalDramaEpisodes.setShotLocation.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "อัปเดตสถานที่ของช็อตนี้แล้ว"
            : "This shot's location updated."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  function handleSetShotLocation(
    shotNumber: number,
    locationKey: string | null
  ) {
    setShotLocationMutation.mutate({
      seriesId,
      episodeId,
      shotNumber,
      locationKey,
    });
  }

  const planSceneVisualStateMutation =
    trpc.verticalDramaEpisodes.planSceneVisualState.useMutation({
      onSuccess: result => {
        if (!result.planned) {
          toast.info(
            result.skippedReason === "manual_edit"
              ? lang === "th"
                ? "ล็อกฉากนี้ถูกแก้ด้วยมือไว้ — กด “สร้างใหม่ทับของเดิม” ถ้าต้องการให้ AI เขียนทับ"
                : "This lock was edited manually — use “Re-plan and overwrite” to let the AI replace it"
              : lang === "th"
                ? "ฉากนี้มีล็อกอยู่แล้ว"
                : "This scene already has a lock"
          );
        } else {
          toast.success(
            lang === "th" ? "วางแผนล็อกฉากเรียบร้อย" : "Scene lock planned"
          );
        }
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  function handlePlanSceneVisualState(
    locationKey: string,
    force?: boolean,
    expectedRevision = 0,
  ) {
    planSceneVisualStateMutation.mutate({
      seriesId,
      episodeId,
      locationKey,
      expectedRevision,
      ...(force ? { force: true } : {}),
    });
  }

  const updateSceneVisualStateMutation =
    trpc.verticalDramaEpisodes.updateSceneVisualState.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "บันทึกล็อกฉากแล้ว" : "Scene lock saved"
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  function handleUpdateSceneVisualState(
    locationKey: string,
    patch: VerticalDramaSceneVisualStatePatch,
    expectedRevision = 0,
  ) {
    updateSceneVisualStateMutation.mutate({
      seriesId,
      episodeId,
      locationKey,
      expectedRevision,
      patch,
    });
  }

  const handleSelectImageModel = (modelId: string) => {
    // Optimistic FIRST — the selection (and the MCP-connection row it reveals)
    // shows instantly, exactly like the Character tab, independent of the
    // server round-trip or a full-localStorage cache write. Both writes below
    // are best-effort and cannot block this.
    setOptimisticImageModelId(modelId);
    storeSeriesModelDefault(seriesId, "image", modelId);
    setEpisodeModelSelectionMutation.mutate({
      seriesId,
      episodeId,
      selectedImageModelId: modelId,
    });
  };
  const handleSelectVideoModel = (modelId: string) => {
    setOptimisticVideoModelId(modelId);
    storeSeriesModelDefault(seriesId, "video", modelId);
    setEpisodeModelSelectionMutation.mutate({
      seriesId,
      episodeId,
      selectedVideoModelId: modelId,
    });
  };

  /* ---- Independent image/video prompt-language settings ----
   *  Legacy episodes fall back to the former shared video setting until an
   *  explicit image language is saved. Policy-safe synopsis mode ignores the
   *  image selector and preserves the synopsis source language. */
  const selectedVideoPromptLanguage =
    episodeDetailQuery.data?.motionPromptPack?.promptLanguage ?? "en";
  const selectedImagePromptLanguage =
    episodeDetailQuery.data?.startFramePlan?.imagePromptLanguage ??
    episodeDetailQuery.data?.motionPromptPack?.promptLanguage ??
    "en";
  const selectedDialogueLanguage =
    episodeDetailQuery.data?.motionPromptPack?.dialogueLanguage ?? "th";
  const selectedThaiAccent =
    episodeDetailQuery.data?.motionPromptPack?.thaiAccent ?? null;

  /* ---- Start-frame image-prompt engine mode
   *  (planning/vd-start-frame-prompt-modes/plan.md) — per-sub-episode
   *  choice of which engine writes the start-frame image prompt.
   *  `"auto"` (default/absent) follows the episode's selected IMAGE model
   *  family at generation time; the user can also pin one explicitly.
   *  Read straight off the episode's own `startFramePlan`, mirroring the
   *  `motionPromptPack` reads above. */
  const selectedImagePromptMode =
    episodeDetailQuery.data?.startFramePlan?.imagePromptMode ?? "auto";

  const setEpisodeVideoPromptLanguageMutation =
    trpc.verticalDramaEpisodes.setEpisodeVideoPromptLanguage.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "บันทึกการตั้งค่าภาษาแล้ว"
            : "Language settings saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  const setEpisodeImagePromptLanguageMutation =
    trpc.verticalDramaEpisodes.setEpisodeImagePromptLanguage.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "บันทึกภาษาพรอมต์ภาพแล้ว"
            : "Image prompt language saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  const handleSelectVideoPromptLanguage = (language: string) => {
    setEpisodeVideoPromptLanguageMutation.mutate({
      seriesId,
      episodeId,
      promptLanguage: language as "en" | "th" | "zh" | "ja" | "ko",
    });
  };
  const handleSelectImagePromptLanguage = (language: string) => {
    setEpisodeImagePromptLanguageMutation.mutate({
      seriesId,
      episodeId,
      imagePromptLanguage: language as "en" | "th" | "zh" | "ja" | "ko",
    });
  };
  const handleSelectDialogueLanguage = (language: string) => {
    setEpisodeVideoPromptLanguageMutation.mutate({
      seriesId,
      episodeId,
      dialogueLanguage: language as "th" | "en",
    });
  };
  const handleSelectThaiAccent = (value: string) => {
    setEpisodeVideoPromptLanguageMutation.mutate({
      seriesId,
      episodeId,
      thaiAccent: value as VerticalDramaThaiAccent,
    });
  };

  /* ---- Start-frame image-prompt engine mode
   *  (planning/vd-start-frame-prompt-modes/plan.md) — free JSONB-patch
   *  setter, same convention as `setEpisodeVideoPromptLanguageMutation`
   *  above (own dedicated mutation since it patches `startFramePlan`, not
   *  `motionPromptPack`). */
  const setEpisodeImagePromptModeMutation =
    trpc.verticalDramaEpisodes.setEpisodeImagePromptMode.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "บันทึกโหมดพรอมต์ภาพแล้ว"
            : "Image prompt mode saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  const handleSelectImagePromptMode = (mode: string) => {
    setEpisodeImagePromptModeMutation.mutate({
      seriesId,
      episodeId,
      mode: mode as "auto" | "policy_safe_rewrite" | "cinematic_narrative",
    });
  };

  /* ---- Native audio direction toggle (task #36, added 2026-07-09) ----
   *  Optional ambient bed + SFX prompt direction for shot video-prompt
   *  generation (see `skills/vertical-drama-shot-video-prompt/skill.md`'s
   *  "NATIVE AUDIO DIRECTION" section). No dedicated setter mutation —
   *  unlike `promptLanguage`/`dialogueLanguage`, the current toggle state
   *  rides straight into `generateShotVideoPrompt`'s own mutation input
   *  (`handleGenerateShotVideoPrompt` below) and persists onto
   *  `motionPromptPack.nativeAudioEnabled` as a side effect of that call.
   *  `nativeAudioEnabledOverride` is local-only UI state (not read back from
   *  the server) that lets the user flip the toggle before the next
   *  generate call; falls back to the pack's last-persisted preference,
   *  then defaults ON (owner: default ON once shown) once neither is set
   *  yet.
   *
   *  F131AC `verticalDramaSeriesNativeAudioPrompts` — registered and wired
   *  by the conductor 2026-07-09: direct tenant-flag read (same
   *  `useTenantFeatureFlag` fallback pattern the voice-chain flag uses on
   *  this page). `VD_NATIVE_AUDIO_PROMPTS_ROLLOUT` in
   *  `@shared/verticalDramaSeries/nativeAudioPrompts` remains as the
   *  architecture doc anchor only. */
  const nativeAudioPromptsEnabled = useTenantFeatureFlag(
    "verticalDramaSeriesNativeAudioPrompts",
  );
  const [nativeAudioEnabledOverride, setNativeAudioEnabledOverride] =
    useState<boolean | null>(null);
  const nativeAudioEnabled =
    nativeAudioEnabledOverride ??
    episodeDetailQuery.data?.motionPromptPack?.nativeAudioEnabled ??
    true;

  /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ----
   *  Persisted per series+model (not per-episode/server-side) — purely a
   *  client-side generation-time input, same convention as the MCP
   *  connection id below. Re-read on every render (not `useState`) so
   *  switching models immediately reflects that model's own last-picked
   *  resolution instead of carrying over the previous model's value. */
  const [imageResolutionTick, setImageResolutionTick] = useState(0);
  const [videoResolutionTick, setVideoResolutionTick] = useState(0);
  const selectedImageResolution = useMemo(
    () => readStoredResolution(seriesId, "image", selectedImageModelId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesId, selectedImageModelId, imageResolutionTick]
  );
  const selectedVideoResolution = useMemo(
    () => readStoredResolution(seriesId, "video", selectedVideoModelId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesId, selectedVideoModelId, videoResolutionTick]
  );
  const handleSelectImageResolution = (resolution: string) => {
    storeResolution(seriesId, "image", selectedImageModelId, resolution);
    setImageResolutionTick(v => v + 1);
  };
  const handleSelectVideoResolution = (resolution: string) => {
    storeResolution(seriesId, "video", selectedVideoModelId, resolution);
    setVideoResolutionTick(v => v + 1);
  };

  // MCP connection selection (Phase — MCP-transport model wiring). A single
  // connection id, shared across the image/video pickers here (mirrors
  // Media Studio's own single-connection assumption) — persisted so a
  // reload (or a connection picked earlier in Media Studio) carries over.
  const [mcpConnectionId, setMcpConnectionIdState] = useState<string | null>(
    readStoredMcpConnectionId
  );
  const [mcpSharedGroupId, setMcpSharedGroupId] = useState<number | null>(null);
  /** Same query (and therefore the same TanStack cache entry) the
   *  `McpConnectionPicker` uses — read here only so
   *  `requireMcpConnectionOrToast` can tell "no MCP account at all" apart from
   *  "the picker just hasn't settled yet". Adds no extra network round-trip. */
  const mcpConnectionsQuery = trpc.mcpConnections.listConnections.useQuery(
    undefined,
    { retry: false }
  );
  const handleSelectMcpConnection = (connectionId: string | null) => {
    setMcpConnectionIdState(connectionId);
    storeMcpConnectionId(connectionId);
    if (!connectionId) setMcpSharedGroupId(null);
  };
  const resolveModelTransport = (
    model: VerticalDramaCapableModel | undefined,
    modelId: string
  ) =>
    resolveMediaModelTransportConfig({
      provider: model?.provider,
      modelId: model?.modelId ?? modelId,
      configJson: model?.configJson,
    });
  const selectedImageModelRecord = imageModels.find(
    m => m.modelId === selectedImageModelId
  );
  const selectedVideoModelRecord = videoModels.find(
    m => m.modelId === selectedVideoModelId
  );
  const imageModelUsesMcp =
    Boolean(selectedImageModelId) &&
    resolveModelTransport(selectedImageModelRecord, selectedImageModelId)
      .transport === "mcp";
  const videoModelUsesMcp =
    Boolean(selectedVideoModelId) &&
    resolveModelTransport(selectedVideoModelRecord, selectedVideoModelId)
      .transport === "mcp";
  /** Blocks the action client-side with a Thai/English toast instead of
   *  letting the server throw BAD_REQUEST — returns true if the action
   *  should proceed.
   *
   *  A null `mcpConnectionId` does NOT by itself mean the user lacks access:
   *  the MCP picker fills it in asynchronously (and its localStorage cache
   *  silently no-ops when the browser's storage is full, so it never
   *  pre-populates for those users), which made this guard reject generates
   *  from members who had a perfectly good SHARED account. The server resolves
   *  the actor's own eligible connection when the client doesn't pin one (see
   *  `mediaTransportResolver`), so only block when we positively know this user
   *  has NO MCP connection available. */
  function requireMcpConnectionOrToast(kind: "image" | "video"): boolean {
    const usesMcp = kind === "image" ? imageModelUsesMcp : videoModelUsesMcp;
    if (!usesMcp || mcpConnectionId) return true;
    if (
      mcpConnectionsQuery.isLoading ||
      (mcpConnectionsQuery.data?.length ?? 0) > 0
    ) {
      return true; // server resolves the eligible account for this actor
    }
    toast.error(
      lang === "th"
        ? "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลนี้"
        : kind === "image"
          ? "Select an MCP connection before using this image model."
          : "Select an MCP connection before using this video model."
    );
    return false;
  }

  // Hermes connection selection (Feature 135, section-10 §4.5) — sibling of
  // the MCP block above; mutually exclusive per model row (a row resolves to
  // exactly one transport), so at most one of imageModelUsesMcp/
  // imageModelUsesHermes is ever true.
  const [hermesConnectionId, setHermesConnectionIdState] = useState<
    string | null
  >(readStoredHermesConnectionId);
  const handleSelectHermesConnection = (connectionId: string | null) => {
    setHermesConnectionIdState(connectionId);
    storeHermesConnectionId(connectionId);
  };
  const imageModelUsesHermes =
    Boolean(selectedImageModelId) &&
    resolveModelTransport(selectedImageModelRecord, selectedImageModelId)
      .transport === "hermes_worker";
  const videoModelUsesHermes =
    Boolean(selectedVideoModelId) &&
    resolveModelTransport(selectedVideoModelRecord, selectedVideoModelId)
      .transport === "hermes_worker";
  /** Same convention as `requireMcpConnectionOrToast` above, for the Hermes
   *  transport arm — Hermes has no shared-pool auto-resolve equivalent, so
   *  (unlike the MCP guard) this blocks whenever no connection is pinned. */
  function requireHermesConnectionOrToast(kind: "image" | "video"): boolean {
    const usesHermes = kind === "image" ? imageModelUsesHermes : videoModelUsesHermes;
    if (!usesHermes || hermesConnectionId) return true;
    toast.error(
      lang === "th"
        ? "ต้องเลือกบัญชี Grok (Hermes) ก่อนใช้โมเดลนี้"
        : kind === "image"
          ? "Select a Grok (Hermes) connection before using this image model."
          : "Select a Grok (Hermes) connection before using this video model."
    );
    return false;
  }
  /** Blocks the action client-side when no image/video model has been
   *  picked yet, instead of letting the server silently fall back to its
   *  hardcoded DEFAULT_MODELS — returns true if the action should proceed.
   *  Only checks whether an id string is present (not whether the matching
   *  model record has finished loading), so it never false-blocks during a
   *  transient models-list fetch. */
  function requireModelSelectedOrToast(kind: "image" | "video"): boolean {
    const hasModel = Boolean(
      kind === "image" ? selectedImageModelId : selectedVideoModelId
    );
    if (hasModel) return true;
    toast.error(
      lang === "th"
        ? kind === "image"
          ? "กรุณาเลือกโมเดลภาพก่อนสร้าง"
          : "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง (มีผลต่อเสียงพูดในตัวและรูปแบบคลิป)"
        : kind === "image"
          ? "Select an image model before generating."
          : "Select a video model before generating (affects native audio and clip format).",
      {
        action: {
          label: lang === "th" ? "เลือกโมเดล" : "Select model",
          onClick: () => scrollToVdModelPicker(kind),
        },
      }
    );
    return false;
  }

  /* ---- Phase 2.5 — per-shot reference strip ---- */
  const shotReferencesQuery =
    trpc.verticalDramaEpisodes.listShotReferences.useQuery(
      { seriesId, episodeId },
      { enabled }
    );
  const shotReferencesByShot = (shotReferencesQuery.data?.references ??
    {}) as Record<number, VerticalDramaShotReferenceView[]>;

  const [addingShotReferenceForShot, setAddingShotReferenceForShot] = useState<
    Set<number>
  >(new Set());
  const linkShotReferenceMutation =
    trpc.verticalDramaEpisodes.linkShotReference.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.listShotReferences.invalidate(),
      onError: err => toast.error(err.message),
    });
  const deleteShotReferenceMutation =
    trpc.verticalDramaEpisodes.deleteShotReference.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.listShotReferences.invalidate(),
      onError: err => toast.error(err.message),
    });

  async function handleAddShotReference(
    shotNumber: number,
    payload: { url: string; source: VerticalDramaShotReferenceView["source"] }
  ) {
    setAddingShotReferenceForShot(prev => new Set(prev).add(shotNumber));
    try {
      let mediaAssetId: string;
      if (payload.url.startsWith("data:")) {
        const uploadResult = await angleVariationUploadMutation.mutateAsync({
          fileName: `shot-${shotNumber}-reference-${Date.now()}.jpg`,
          fileType: "image/jpeg",
          fileBase64: payload.url,
        });
        const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
          seriesId,
          source: "url",
          url: uploadResult.url,
          mimeType: uploadResult.fileType,
        });
        mediaAssetId = resolved.mediaAssetId;
      } else {
        const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
          seriesId,
          source: "url",
          url: payload.url,
          mimeType: "image/jpeg",
        });
        mediaAssetId = resolved.mediaAssetId;
      }
      await linkShotReferenceMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId,
        source: payload.source,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เพิ่มภาพอ้างอิงไม่สำเร็จ"
            : "Failed to add reference"
      );
    } finally {
      setAddingShotReferenceForShot(prev => {
        const next = new Set(prev);
        next.delete(shotNumber);
        return next;
      });
    }
  }

  function handleRemoveShotReference(_shotNumber: number, referenceId: string) {
    deleteShotReferenceMutation.mutate({ seriesId, episodeId, referenceId });
  }

  // Promote a reference-strip image to be the shot's main image
  // (main-image-swap-history upgrade) — reuses `setApprovedStartFrameAsset`
  // directly (the asset is already a canonical `media_assets` row, no
  // resolve step needed); the server auto-demotes the previous main image
  // into the reference strip and removes this asset's own reference row, so
  // both invalidations below (episode detail + shot references) pick up the
  // full result of the swap.
  const [usingShotReferenceAsMainForShot, setUsingShotReferenceAsMainForShot] =
    useState<number | null>(null);
  async function handleUseShotReferenceAsMain(
    shotNumber: number,
    mediaAssetId: string
  ) {
    setUsingShotReferenceAsMainForShot(shotNumber);
    try {
      await setApprovedStartFrameAssetMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId,
      });
      void utils.verticalDramaEpisodes.listShotReferences.invalidate();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เปลี่ยนภาพหลักไม่สำเร็จ"
            : "Failed to set as main image"
      );
    } finally {
      setUsingShotReferenceAsMainForShot(current =>
        current === shotNumber ? null : current
      );
    }
  }

  /* ---- Phase 6c — user-controlled supplementary reference frames
     (`planning/vd-start-frame-reference-mapping/plan.md`, Phase 6) ---- */
  const generateShotReferenceFramePromptMutation =
    trpc.verticalDramaEpisodes.generateShotReferenceFramePrompt.useMutation();
  const generateShotReferenceFrameImageMutation =
    trpc.verticalDramaEpisodes.generateShotReferenceFrameImage.useMutation();

  /** Per-shot "authoring the prompt" spinner (step 1 of the dialog) — kept
   *  separate from the render/poll set below so the two steps' loading
   *  states never fight each other. */
  const [
    generatingReferenceFramePromptForShot,
    setGeneratingReferenceFramePromptForShot,
  ] = useState<Set<number>>(new Set());
  /** Per-shot "rendering + polling" flag (step 2), same lifecycle convention
   *  as `pollingStartFrameShots` — set on submit, cleared in
   *  `pollReferenceFrameTask`'s own `finally`. A Set (not a single shot
   *  number) so more than one shot's reference frame can render at once. */
  const [pollingReferenceFrameShots, setPollingReferenceFrameShots] =
    useState<Set<number>>(new Set());

  /** Step 1: authors ONE reference-frame prompt. Returns `null` on failure
   *  (already toasted here) — the dialog stays on the selection step. */
  async function handleGenerateReferenceFramePrompt(args: {
    shotNumber: number;
    characterKeys: string[];
    instruction: string;
  }) {
    if (!requireModelSelectedOrToast("image")) return null;
    if (!requireMcpConnectionOrToast("image")) return null;
    if (!requireHermesConnectionOrToast("image")) return null;
    setGeneratingReferenceFramePromptForShot(prev =>
      new Set(prev).add(args.shotNumber)
    );
    try {
      return await generateShotReferenceFramePromptMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber: args.shotNumber,
        characterKeys: args.characterKeys,
        instruction: args.instruction,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (err) {
      const hermesPresentation = presentHermesError(err);
      toast.error(
        hermesPresentation
          ? formatHermesErrorForToast(hermesPresentation, lang)
          : err instanceof Error
            ? err.message
            : lang === "th"
              ? "สร้าง prompt เฟรมอ้างอิงไม่สำเร็จ"
              : "Failed to generate the reference-frame prompt."
      );
      if (
        (err as { data?: { code?: string } } | undefined)?.data?.code ===
        "BAD_REQUEST"
      ) {
        scrollToVdModelPicker("image");
      }
      return null;
    } finally {
      setGeneratingReferenceFramePromptForShot(prev => {
        const next = new Set(prev);
        next.delete(args.shotNumber);
        return next;
      });
    }
  }

  /** Bounded poll for a submitted reference-frame render task — mirrors
   *  `pollStartFrameTask` structurally, but on completion links the result
   *  into the shot's reference set (`source: "reference_frame"`) via
   *  `linkShotReferenceMutation` instead of `setApprovedStartFrameAsset`
   *  (a supplementary reference frame never replaces the shot's main image),
   *  and never auto-softens/resubmits on a policy failure (that convention
   *  is specific to the main start-frame identity-lock flow). Its own
   *  `pollingReferenceFrameShots` set keeps this independent from
   *  `pollingStartFrameShots` — a shot can have both a start-frame render
   *  AND a reference-frame render in flight at once, and this poller never
   *  fires the start-frame success toast. */
  async function pollReferenceFrameTask(taskId: string, shotNumber: number) {
    try {
      for (
        let attempt = 0;
        attempt < VD_START_FRAME_POLL_MAX_ATTEMPTS;
        attempt++
      ) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)
            ?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th"
                ? "สร้างเฟรมอ้างอิงสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                : "Reference-frame generation completed but no result URL."
            );
            return;
          }
          try {
            const resolved =
              await resolveMediaAssetForImportMutation.mutateAsync({
                seriesId,
                source: "url",
                url: resultUrl,
                mimeType: "image/png",
              });
            await linkShotReferenceMutation.mutateAsync({
              seriesId,
              episodeId,
              shotNumber,
              mediaAssetId: resolved.mediaAssetId,
              role: "reference",
              source: "reference_frame",
            });
          } catch (err) {
            toast.error(
              lang === "th"
                ? `สร้างเฟรมอ้างอิงเสร็จแล้ว แต่บันทึกเข้าช็อตไม่สำเร็จ${err instanceof Error ? `: ${err.message}` : ""}`
                : `Reference-frame generation finished, but saving it to the shot failed${err instanceof Error ? `: ${err.message}` : ""}.`
            );
            return;
          }
          toast.success(vdCopy(lang).referenceFrameRenderSuccess);
          return;
        }
        if (status === "failed") {
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          toast.error(
            buildVdGenerateFailureToastMessage(failedTask, lang, {
              th: vdCopy("th").referenceFrameRenderFailed,
              en: vdCopy("en").referenceFrameRenderFailed,
            })
          );
          return;
        }
        await new Promise(resolve =>
          setTimeout(resolve, VD_START_FRAME_POLL_INTERVAL_MS)
        );
      }
      toast.error(
        lang === "th"
          ? "สร้างเฟรมอ้างอิงใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
          : "Reference-frame generation is taking too long — check back later."
      );
    } finally {
      setPollingReferenceFrameShots(prev => {
        const next = new Set(prev);
        next.delete(shotNumber);
        return next;
      });
    }
  }

  /** Step 2: submits the user-confirmed (possibly hand-edited) prompt for
   *  the paid render, then polls it. Returns `true` on successful SUBMIT
   *  (closes the dialog — the render itself continues in the background,
   *  same "submit closes the dialog, poll finishes later" convention as
   *  every other async VD render in this file); `false` on a submit failure
   *  (already toasted here, dialog stays open so the user can retry without
   *  re-typing anything). */
  async function handleGenerateReferenceFrameImage(args: {
    shotNumber: number;
    prompt: string;
    negativePrompt?: string;
    characterKeys: string[];
  }): Promise<boolean> {
    setPollingReferenceFrameShots(prev => new Set(prev).add(args.shotNumber));
    try {
      const task = await generateShotReferenceFrameImageMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber: args.shotNumber,
        prompt: args.prompt,
        negativePrompt: args.negativePrompt,
        characterKeys: args.characterKeys,
        mcpConnectionId: imageModelUsesMcp
          ? (mcpConnectionId ?? undefined)
          : undefined,
        sharedGroupId:
          imageModelUsesMcp && mcpConnectionId
            ? (mcpSharedGroupId ?? undefined)
            : undefined,
        hermesConnectionId:
          imageModelUsesHermes && !(imageModelUsesMcp && mcpConnectionId)
            ? (hermesConnectionId ?? undefined)
            : undefined,
        resolution: selectedImageResolution || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      void pollReferenceFrameTask(task.taskId, args.shotNumber);
      return true;
    } catch (err) {
      const hermesPresentation = presentHermesError(err);
      toast.error(
        hermesPresentation
          ? formatHermesErrorForToast(hermesPresentation, lang)
          : err instanceof Error
            ? err.message
            : vdCopy(lang).referenceFrameRenderFailed
      );
      if (
        (err as { data?: { code?: string } } | undefined)?.data?.code ===
        "BAD_REQUEST"
      ) {
        scrollToVdModelPicker("image");
      }
      setPollingReferenceFrameShots(prev => {
        const next = new Set(prev);
        next.delete(args.shotNumber);
        return next;
      });
      return false;
    }
  }

  /* ---- Phase 3.4 — dialogue box (save via free updateEpisodeDraft) ---- */
  const [savingDialogueForClip, setSavingDialogueForClip] = useState<
    number | null
  >(null);
  const updateEpisodeDraftMutation =
    trpc.verticalDramaEpisodes.updateEpisodeDraft.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate(),
      onError: err => toast.error(err.message),
    });

  function handleSaveClipDialogue(
    clipNumber: number,
    dialogue: VerticalDramaClipDialogueLineView[]
  ) {
    const pack = episodeDetailQuery.data?.motionPromptPack;
    if (!pack) return;
    setSavingDialogueForClip(clipNumber);
    const updatedClips = (pack.clips ?? []).map(clip =>
      clip.clipNumber === clipNumber ? { ...clip, dialogue } : clip
    );
    updateEpisodeDraftMutation.mutate(
      {
        seriesId,
        episodeId,
        motionPromptPack: { ...pack, clips: updatedClips },
      },
      { onSettled: () => setSavingDialogueForClip(null) }
    );
  }

  /* ---- Phase 4.1/4.2 — inline (free) prompt edits ---- */
  function handleSaveStartFramePrompt(shotNumber: number, prompt: string) {
    const plan = episodeDetailQuery.data?.startFramePlan;
    if (!plan) return;
    const updatedFrames = (plan.frames ?? []).map(frame =>
      frame.shotNumber === shotNumber
        ? { ...frame, imagePrompt: prompt }
        : frame
    );
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      startFramePlan: { ...plan, frames: updatedFrames },
    });
  }

  /** Speaker-aware sub-shots (2026-07-10) fix: a shot can now have MULTIPLE
   *  clips (`sourceShotNumbers`/`parentShotNumber` all pointing at the same
   *  shot). This used to `.map()`-overwrite every clip matching the shot
   *  number with the SAME edited text — harmless while a shot only ever had
   *  one clip, but a real bug once split (it would stomp all N sub-shots
   *  with one clip's edit). Now scoped to the exact `clipNumber` the caller
   *  is editing; for an unsplit shot `clipNumber === shotNumber`, so this is
   *  byte-identical to the previous behavior. */
  function handleSaveVideoPrompt(
    shotNumber: number,
    clipNumber: number,
    prompt: string
  ) {
    const pack = episodeDetailQuery.data?.motionPromptPack;
    if (!pack) return;
    const updatedClips = (pack.clips ?? []).map(clip =>
      clip.clipNumber === clipNumber ? { ...clip, prompt } : clip
    );
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      motionPromptPack: { ...pack, clips: updatedClips },
    });
  }

  /* ---- Multi-angle (3x3) picker persistence (2026-07-05 fix) — the source
   *  grid image is already durable (a completed media task with a
   *  `resultUrl`); this just remembers that URL (plus which of the 9 tiles
   *  the user has since deleted) on `startFramePlan.frames[shot].angleGrid`
   *  via the same free `updateEpisodeDraft` JSONB-patch flow prompt edits
   *  already use, so a reload restores the picker instead of silently
   *  wiping it (bug report: Ctrl+Shift+R after deleting 2/9 tiles lost the
   *  remaining 7). ---- */
  function persistAngleGrid(
    shotNumber: number,
    angleGrid:
      | { pendingTaskId: string; dismissedIndexes: number[] }
      | { imageUrl: string; mediaTaskId?: string; dismissedIndexes: number[] }
      | null
  ) {
    const plan = episodeDetailQuery.data?.startFramePlan;
    if (!plan) return;
    const updatedFrames = (plan.frames ?? []).map(frame =>
      frame.shotNumber === shotNumber
        ? angleGrid
          ? { ...frame, angleGrid }
          : (() => {
              // Clearing (dismiss-all) — drop the key entirely rather than
              // setting it to null/undefined, keeping the persisted JSONB
              // shape clean.
              const { angleGrid: _drop, ...rest } = frame as typeof frame & {
                angleGrid?: unknown;
              };
              return rest;
            })()
        : frame
    );
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      startFramePlan: { ...plan, frames: updatedFrames },
    });
  }

  /** Shot numbers whose `pendingTaskId` this session has already picked up
   *  for resume-polling — prevents re-triggering `pollAngleVariationsTask`
   *  on every `getEpisodeDetail` refetch while a resumed poll is already
   *  running (`angleVariationsPollInFlightRef` alone isn't enough since it's
   *  cleared once the poll finishes, and by design we don't want to retry a
   *  shot whose resume attempt already ran to a terminal state this
   *  session). */
  const resumedAngleGridShotsRef = useRef<Set<number>>(new Set());

  /** RESUME ON LOAD (2026-07-06 fix — bug: "3x3 grid completes server-side
   *  but the 9-frame picker never appears"). Root cause: the ONLY thing
   *  tracking an in-flight angle-variations task used to be
   *  `pollAngleVariationsTask`'s in-memory state in this component — if the
   *  page reloaded/navigated away (or any transient interruption) before
   *  that poll observed `status === "completed"`, the grid was never
   *  persisted and was orphaned forever (confirmed via DB: episode id=6 had
   *  9 `startFramePlan` frames, none with an `angleGrid` key, despite a
   *  completed grid task in media history).
   *
   *  Fix: `generateAngleVariationsMutation`'s `onSuccess` now persists
   *  `angleGrid.pendingTaskId` immediately at submit time (before polling
   *  even starts). This effect runs on every `getEpisodeDetail` load/refetch
   *  and resumes polling any frame that has a `pendingTaskId` but no
   *  `imageUrl` yet — same completion handler
   *  (`resolveCompletedAngleVariationsTask`) as the live path, so both
   *  converge on the identical persisted shape. */
  useEffect(() => {
    const frames = episodeDetailQuery.data?.startFramePlan?.frames ?? [];
    for (const frame of frames) {
      const angleGrid = frame.angleGrid as
        | {
            pendingTaskId?: string;
            imageUrl?: string;
            dismissedIndexes?: number[];
          }
        | undefined;
      const shotNumber = frame.shotNumber;
      if (
        !shouldResumeAngleGridPoll(
          angleGrid,
          shotNumber,
          resumedAngleGridShotsRef.current,
          angleVariationsPollInFlightRef.current
        )
      ) {
        continue;
      }
      const pendingTaskId = angleGrid!.pendingTaskId!;
      resumedAngleGridShotsRef.current.add(shotNumber);
      void pollAngleVariationsTask(
        pendingTaskId,
        shotNumber,
        angleGrid?.dismissedIndexes ?? []
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeDetailQuery.data?.startFramePlan?.frames]);

  /** Tracks which shots' currently-showing grid URL has already been
   *  persisted, so the effect below only ever fires the free save mutation
   *  once per newly-completed grid (not on every render). */
  const persistedAngleGridUrlByShotRef = useRef<Record<number, string>>({});

  useEffect(() => {
    for (const [shotKey, gridUrl] of Object.entries(
      angleVariationGridUrlByShot
    )) {
      const shotNumber = Number(shotKey);
      if (persistedAngleGridUrlByShotRef.current[shotNumber] === gridUrl)
        continue;
      persistedAngleGridUrlByShotRef.current[shotNumber] = gridUrl;
      persistAngleGrid(shotNumber, { imageUrl: gridUrl, dismissedIndexes: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleVariationGridUrlByShot]);

  /** Per-tile delete in the picker — appends the tile's original 0..8 index
   *  to `dismissedIndexes` and persists (free), so the deletion survives a
   *  reload instead of only living in client state. */
  function handleDeleteAngleVariationCandidate(
    shotNumber: number,
    originalIndex: number
  ) {
    const plan = episodeDetailQuery.data?.startFramePlan;
    const frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
    const existing = frame?.angleGrid;
    if (!existing?.imageUrl) return; // nothing persisted yet for this shot — local-only state is enough
    const dismissedIndexes = Array.from(
      new Set([...(existing.dismissedIndexes ?? []), originalIndex])
    );
    persistAngleGrid(shotNumber, {
      imageUrl: existing.imageUrl,
      mediaTaskId: existing.mediaTaskId,
      dismissedIndexes,
    });
  }

  /** "ปิด" (dismiss the whole picker) — clears the persisted `angleGrid` so
   *  the picker doesn't come back on the next reload, in addition to
   *  clearing local state (handled by the panel/`setAngleVariationGridUrlByShot`
   *  below). */
  function handleDismissAngleVariations(shotNumber: number) {
    setAngleVariationGridUrlByShot(prev => {
      const next = { ...prev };
      delete next[shotNumber];
      return next;
    });
    delete persistedAngleGridUrlByShotRef.current[shotNumber];
    const plan = episodeDetailQuery.data?.startFramePlan;
    const frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
    if (frame?.angleGrid) persistAngleGrid(shotNumber, null);
  }

  /**
   * One-click "generate prompt + image" (2026-07-05 redesign — fixes the
   * "opens a mandatory-typing repair dialog" bug report). Ensures this
   * shot's image prompt exists WITHOUT any user typing, then submits either
   * a single image or a 3x3 multi-angle grid per the panel's mode choice:
   *
   *   1. No `start_frame_render_plan` at all yet → run it for real (mode
   *      "full") for every shot at once, same call `onGenerateStartFramePlan`
   *      already makes.
   *   2. Plan exists but THIS shot's `imagePrompt` is empty → call
   *      `repairStageOutput` with an auto-composed instruction (never shows
   *      the repair dialog — silent, internal step with its own loading
   *      state).
   *   3. Either way, refetch `getEpisodeDetail` until this shot's prompt is
   *      present, then submit the chosen generation mode.
   *
   * Every await path is wrapped so `pollingStartFrameShots` (this function's
   * loading flag, shared with the plain "Generate image" button) is always
   * cleared — no stuck spinners on error.
   */
  async function handleGeneratePromptAndImage(
    shotNumber: number,
    mode: "single" | "angles",
    // When true (default — the "สร้าง prompt + ภาพ" button), re-author this
    // shot's start-frame prompt from the latest Overview synopsis
    // (`canonicalShotSummary`) before rendering, so a stale/wrong stored
    // prompt is refreshed. When false (the "สร้างภาพ (AI)" render-only
    // button), reuse the shot's EXISTING `frame.imagePrompt` as-is and skip
    // re-authoring — this is the escape hatch for rendering a prompt the user
    // has manually edited/approved without it being overwritten. If the shot
    // has no stored prompt at all, the silent-repair fallback below still
    // composes one regardless of this flag.
    reauthor = true,
    awaitCompletion = false,
  ) {
    if (!requireModelSelectedOrToast("image")) return;
    if (!requireMcpConnectionOrToast("image")) return;
    if (!requireHermesConnectionOrToast("image")) return;
    setPollingStartFrameShots(prev => new Set(prev).add(shotNumber));
    try {
      let plan = episodeDetailQuery.data?.startFramePlan as
        | {
            frames?: Array<{
              shotNumber: number;
              imagePrompt?: string;
              canonicalShotSummary?: string;
            }>;
          }
        | null
        | undefined;
      let frame = plan?.frames?.find(f => f.shotNumber === shotNumber);

      const canonicalShotSummary =
        episodeDetailQuery.data?.episodePlan?.shotDrafts?.find(
          shot => shot.shotNumber === shotNumber
        )?.summary?.trim() || undefined;

      // The start-frame plan is a materialized snapshot. This button is
      // "สร้าง prompt + ภาพ" — it ALWAYS re-authors the shot's prompt through
      // the dedicated per-shot skill before the paid image render (2026-07-15
      // fix: the old summary-equality guard reused a stale stored prompt
      // whenever the Overview summary hadn't changed, so prompts authored
      // under older rules — or before the user added a character to the shot
      // — could never be refreshed from this button; ep60 shot9 kept its
      // "extreme close-up isolating one person" prompt through every click).
      // The per-shot skill reads the frame's CURRENT requiredCharacterRefs,
      // so a manually-added character now deterministically widens framing.
      // Render-only reuse stays available via the "สร้างภาพ (AI)" button,
      // which calls this function with `reauthor = false` to skip exactly this
      // re-authoring step and render the existing prompt as-is.
      // This dedicated per-shot mutation can now materialize its own minimal
      // frame when the episode/shot has no start-frame plan entry yet. Do not
      // call the whole-episode `runStage(start_frame_render_plan)` here: rapid
      // clicks used to start the same long LLM plan many times concurrently,
      // which exceeded the proxy timeout even though those duplicate runs
      // later completed. Render-only still reuses an existing prompt, but a
      // missing prompt must be authored once before the image can be queued.
      if (reauthor || !frame?.imagePrompt?.trim()) {
        try {
          await generateShotStartFramePromptMutation.mutateAsync({
            seriesId,
            episodeId,
            shotNumber,
            canonicalShotSummary,
            idempotencyKey: crypto.randomUUID(),
          });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : lang === "th"
                ? "ซิงก์ shot ล่าสุดเพื่อสร้างพรอมต์ไม่สำเร็จ"
                : "Failed to sync the latest shot source into the image prompt"
          );
          return;
        }
        const refreshed =
          await utils.verticalDramaEpisodes.getEpisodeDetail.fetch({
            seriesId,
            episodeId,
          });
        plan = refreshed?.startFramePlan as typeof plan;
        frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
      }

      if (!frame?.imagePrompt?.trim()) {
        toast.error(
          lang === "th"
            ? "เตรียมพรอมต์ภาพไม่สำเร็จ ลองใหม่อีกครั้ง"
            : "Failed to prepare the image prompt — try again.",
          {
            action: {
              label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
              onClick: () =>
                void handleGeneratePromptAndImage(shotNumber, mode, reauthor),
            },
          }
        );
        return;
      }

      if (mode === "angles") {
        generateAngleVariationsMutation.mutate({
          seriesId,
          episodeId,
          shotNumber,
          idempotencyKey: crypto.randomUUID(),
          mcpConnectionId: imageModelUsesMcp
            ? (mcpConnectionId ?? undefined)
            : undefined,
          sharedGroupId: imageModelUsesMcp && mcpConnectionId
            ? (mcpSharedGroupId ?? undefined)
            : undefined,
          hermesConnectionId:
            imageModelUsesHermes && !(imageModelUsesMcp && mcpConnectionId)
              ? (hermesConnectionId ?? undefined)
              : undefined,
          resolution: selectedImageResolution || undefined,
        });
      } else {
        const idempotencyKey = crypto.randomUUID();
        const request = {
          seriesId,
          episodeId,
          shotNumber,
          idempotencyKey,
          mcpConnectionId: imageModelUsesMcp
            ? (mcpConnectionId ?? undefined)
            : undefined,
          sharedGroupId: imageModelUsesMcp && mcpConnectionId
            ? (mcpSharedGroupId ?? undefined)
            : undefined,
          hermesConnectionId:
            imageModelUsesHermes && !(imageModelUsesMcp && mcpConnectionId)
              ? (hermesConnectionId ?? undefined)
              : undefined,
          resolution: selectedImageResolution || undefined,
        };
        if (awaitCompletion) {
          awaitStartFramePollKeysRef.current.add(idempotencyKey);
          try {
            const data = await generateStartFrameImageMutation.mutateAsync(request);
            await pollStartFrameTask(data.taskId, shotNumber);
          } finally {
            awaitStartFramePollKeysRef.current.delete(idempotencyKey);
          }
        } else {
          generateStartFrameImageMutation.mutate(request);
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง"
            : "Something went wrong — try again.",
        {
          action: {
            label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
            onClick: () => void handleGeneratePromptAndImage(shotNumber, mode, reauthor),
          },
        }
      );
    } finally {
      setPollingStartFrameShots(prev => {
        const next = new Set(prev);
        next.delete(shotNumber);
        return next;
      });
    }
  }

  /* ---- Video prompt pack (2026-07-05 fix): panel-level button that fills
   *  every clip's video prompt + dialogue at once. Sequential — dialogue/
   *  audio timing must exist before the motion prompts that reference it are
   *  generated — with a single combined confirm covering both paid steps
   *  (the confirm itself lives in the panel; this just runs them). ---- */
  const [generatingVideoPromptPack, setGeneratingVideoPromptPack] =
    useState(false);

  async function handleGenerateVideoPromptPack() {
    if (!requireModelSelectedOrToast("video")) return;
    setGeneratingVideoPromptPack(true);
    try {
      const existingDialoguePlan = episodeDetailQuery.data
        ?.dialogueAudioPlan as
        | VerticalDramaDialogueAudioPlan
        | null
        | undefined;
      const dialoguePlanUnderfilled = Boolean(
        existingDialoguePlan?.dialogueQuality?.issues?.some(
          issue =>
            issue.code === "VD_DIALOGUE_EPISODE_UNDERFILLED" ||
            issue.code === "VD_DIALOGUE_UNDERFILLED"
        ) ||
        existingDialoguePlan?.warnings?.some(
          warning =>
            warning.code === "episode_dialogue_underfilled" ||
            warning.code === "shot_dialogue_underfilled"
        )
      );
      if (!existingDialoguePlan || dialoguePlanUnderfilled) {
        const dialogueOutcome = await runStageMutation.mutateAsync({
          seriesId,
          episodeId,
          stage: "dialogue_audio_plan",
          mode: "full",
        });
        if (dialogueOutcome.result.status === "failed") {
          toast.error(
            lang === "th"
              ? `สร้างบทพูด/เสียงไม่สำเร็จ${dialogueOutcome.result.errors[0]?.message ? `: ${dialogueOutcome.result.errors[0].message}` : ""}`
              : `Failed to generate dialogue/audio${dialogueOutcome.result.errors[0]?.message ? `: ${dialogueOutcome.result.errors[0].message}` : ""}`,
            {
              action: {
                label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
                onClick: () => void handleGenerateVideoPromptPack(),
              },
            }
          );
          return;
        }
        if (
          dialogueOutcome.result.status === "approval_required" &&
          dialogueOutcome.checkpointId != null
        ) {
          await approveMutation.mutateAsync({
            seriesId,
            episodeId,
            checkpointId: String(dialogueOutcome.checkpointId),
            decision: "approve",
          });
        }
        const repairedStillUnderfilled = dialogueOutcome.result.warnings.some(
          warning =>
            warning.code === "episode_dialogue_underfilled" ||
            warning.code === "shot_dialogue_underfilled"
        );
        if (repairedStillUnderfilled) {
          toast.error(
            lang === "th"
              ? "บทพูดทั้งตอนยังน้อยเกินไป ควรซ่อมบท/แผนบททั้งตอนก่อนสร้าง prompt วิดีโอ"
              : "The episode dialogue is still too sparse. Repair the whole episode dialogue plan before video prompts.",
            {
              action: {
                label: lang === "th" ? "สร้างบทพูดใหม่" : "Regenerate dialogue",
                onClick: () => void handleGenerateVideoPromptPack(),
              },
            }
          );
          return;
        }
      }

      const motionOutcome = await runStageMutation.mutateAsync({
        seriesId,
        episodeId,
        stage: "video_motion_prompt_pack",
        mode: "full",
      });
      if (motionOutcome.result.status === "failed") {
        toast.error(
          lang === "th"
            ? `สร้าง prompt วิดีโอไม่สำเร็จ${motionOutcome.result.errors[0]?.message ? `: ${motionOutcome.result.errors[0].message}` : ""}`
            : `Failed to generate video prompts${motionOutcome.result.errors[0]?.message ? `: ${motionOutcome.result.errors[0].message}` : ""}`,
          {
            action: {
              label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
              onClick: () => void handleGenerateVideoPromptPack(),
            },
          }
        );
        return;
      }
      if (
        motionOutcome.result.status === "approval_required" &&
        motionOutcome.checkpointId != null
      ) {
        await approveMutation.mutateAsync({
          seriesId,
          episodeId,
          checkpointId: String(motionOutcome.checkpointId),
          decision: "approve",
        });
      }
      toast.success(
        lang === "th" ? "สร้าง prompt วิดีโอสำเร็จ" : "Video prompts generated."
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง"
            : "Something went wrong — try again.",
        {
          action: {
            label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
            onClick: () => void handleGenerateVideoPromptPack(),
          },
        }
      );
    } finally {
      setGeneratingVideoPromptPack(false);
    }
  }

  /* ---- Phase 3B.5 — episode quality-review scorecard ---- */
  const runQualityReviewMutation =
    trpc.verticalDramaEpisodes.runEpisodeQualityReview.useMutation({
      onSuccess: () =>
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate(),
      onError: err => {
        // `runEpisodeQualityReview` throws PRECONDITION_FAILED when the
        // script/storyboard haven't been generated yet — surface a friendly
        // Thai message for that specific case rather than the raw server
        // error text.
        if (err.data?.code === "PRECONDITION_FAILED") {
          toast.error(
            lang === "th"
              ? "ต้องสร้างสคริปต์และสตอรีบอร์ดก่อนตรวจคุณภาพ"
              : "The episode needs a generated script and storyboard before it can be quality-reviewed."
          );
          return;
        }
        toast.error(err.message);
      },
    });

  function handleCopySuggestedFix(suggestedFix: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(suggestedFix);
    }
    toast.success(
      lang === "th"
        ? "คัดลอกแล้ว — นำไปวางในหน้าซ่อม"
        : "Copied — paste it into Repair."
    );
  }

  /* ---- 3B.6 — approve-and-apply-suggestions / request-alternative loop ---- */
  const previousQualityOverallRef = useRef<number | null>(null);
  const applyQualityReviewSuggestionsMutation =
    trpc.verticalDramaEpisodes.applyQualityReviewSuggestions.useMutation({
      onSuccess: result => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        const before = previousQualityOverallRef.current;
        const after = result.newReview?.scorecard?.overall ?? null;
        if (result.warning) {
          toast.warning(result.warning);
        } else if (before != null && after != null) {
          toast.success(
            lang === "th"
              ? `ปรับแก้เรียบร้อย — คะแนนรวม ${before}/5 -> ${after}/5`
              : `Fixes applied — overall score ${before}/5 -> ${after}/5`
          );
        } else {
          toast.success(
            lang === "th"
              ? "ปรับแก้เรียบร้อย — ตรวจคุณภาพซ้ำแล้ว"
              : "Fixes applied — episode re-reviewed."
          );
        }
        if (result.staleStages.length > 0) {
          toast.info(
            lang === "th"
              ? `หมายเหตุ: ${result.staleStages.length} ขั้นตอนถัดไปกลายเป็นข้อมูลเก่าแล้ว ควรสร้าง prompt ภาพ/วิดีโอของช็อตที่เกี่ยวข้องใหม่`
              : `Note: ${result.staleStages.length} downstream stage(s) are now stale — regenerate affected shots' image/video prompts.`
          );
        }
      },
      onError: err => {
        if (err.data?.code === "PRECONDITION_FAILED") {
          toast.error(
            lang === "th"
              ? "ยังไม่มีผลตรวจคุณภาพให้ปรับตาม — กรุณาตรวจคุณภาพก่อน"
              : "No quality review yet to apply — run a quality review first."
          );
          return;
        }
        toast.error(err.message);
      },
    });

  function handleApplyQualityReviewSuggestions() {
    previousQualityOverallRef.current =
      episodeDetailQuery.data?.qualityReview?.scorecard?.overall ?? null;
    applyQualityReviewSuggestionsMutation.mutate({
      seriesId,
      episodeId,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  const requestAlternativeQualityReviewMutation =
    trpc.verticalDramaEpisodes.runEpisodeQualityReview.useMutation({
      onSuccess: () => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        toast.success(
          lang === "th"
            ? "ได้คำแนะนำแนวทางใหม่แล้ว"
            : "New alternative suggestions ready."
        );
      },
      onError: err => {
        toast.error(err.message);
      },
    });

  function handleRequestAlternativeQualityReview() {
    requestAlternativeQualityReviewMutation.mutate({
      seriesId,
      episodeId,
      avoidPrevious: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /* ---- Wave-5A (2026-07-07 production-grade upgrade) — bounded quality-loop
   *  v2 ("ปรับอัตโนมัติ") and tie-in defer. Both mutations are plain
   *  fire-and-invalidate wrappers — the confirm-before-firing step already
   *  lives INSIDE `QualityLoopArea` / `VerticalDramaTieInReportCard`
   *  (`VerticalDramaStoryboardPanel.tsx`/`VerticalDramaTieInReportCard.tsx`),
   *  so neither handler here needs its own confirm state. Each is its own
   *  `useMutation` instance (not reused from `applyQualityReviewSuggestionsMutation`
   *  above) so this button's pending/toast state never collides with the
   *  plain "ปรับแก้เรียบร้อย" apply-suggestions button — same convention as
   *  `requestAlternativeQualityReviewMutation` above reusing
   *  `runEpisodeQualityReview` as its own separate instance. */
  const vdc = vdCopy(lang);
  const runQualityImproveLoopMutation =
    trpc.verticalDramaEpisodes.applyQualityReviewSuggestions.useMutation({
      onSuccess: result => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        // The procedure's non-loop return branches never carry `loopState`
        // (spec §16.1's single-pass v1 shape) — only reachable here if the
        // tenant's `qualityLoopV2Enabled` flag flips off mid-flight, since
        // this handler is only ever wired behind that flag.
        const loopState = "loopState" in result ? result.loopState : null;
        const outcome = describeQualityImproveLoopOutcome(
          { warning: result.warning, loopState },
          vdc,
          lang === "th"
            ? "ปรับอัตโนมัติเสร็จแล้ว"
            : "Auto-improve loop finished."
        );
        toast[outcome.tone](outcome.message);
      },
      onError: err => toast.error(err.message),
    });

  function handleRunQualityImproveLoop() {
    runQualityImproveLoopMutation.mutate({
      seriesId,
      episodeId,
      loop: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  // `deferEpisodeTieIn`'s own `scheduleAtRisk` result (spec §13.1's
  // documented deviation — a best-effort computed flag, not a real
  // `arc_replan_proposal`) — transient, mutation-response-only state, not
  // part of `getEpisodeDetail`'s payload.
  const [tieInDeferScheduleAtRisk, setTieInDeferScheduleAtRisk] =
    useState(false);
  const deferEpisodeTieInMutation =
    trpc.verticalDramaEpisodes.deferEpisodeTieIn.useMutation({
      onSuccess: result => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        setTieInDeferScheduleAtRisk(result.scheduleAtRisk);
        // Task #31 (F131Y, spec §7.7.3) — `result.proposal` is only present
        // once the tenant flag is on AND a real re-placement slot was found;
        // every other case (flag off, or `result.reason` set) keeps the
        // pre-#31 toast, matching `scheduleAtRisk`'s own note above the
        // card. Action button navigates to the series Overview, where the
        // ArcReplanCard (Memory tab) surfaces the pending proposal for
        // approval — same "toast + link to where it's actioned" precedent
        // as this file's Story Lock scorecard link.
        if (result.proposal) {
          toast.success(
            vdCopyWithParams(vdc.tieInDeferProposalCreatedTemplate, {
              episode: result.proposal.targetEpisodeNumber,
            }),
            {
              action: {
                label: vdc.tieInDeferProposalViewCta,
                onClick: () =>
                  setLocation(verticalDramaRoutes.seriesDetail(seriesId)),
              },
            }
          );
        } else {
          toast.success(vdc.tieInDeferSuccess);
        }
      },
      onError: err => toast.error(err.message),
    });

  function handleDeferEpisodeTieIn() {
    deferEpisodeTieInMutation.mutate({
      seriesId,
      episodeId,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /* ---- Manual episode -> series memory summarization — makes the fully-
   *  wired series-memory pipeline (planner skill -> 8 event kinds -> memory
   *  bundle -> next-episode script) reachable without running the full
   *  pipeline tail (which almost no user does in practice). The user's
   *  explicit click IS the approval. */
  const summarizeEpisodeToMemoryMutation =
    trpc.verticalDramaEpisodes.summarizeEpisodeToMemory.useMutation({
      onSuccess: result => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        void utils.verticalDramaEpisodes.listMemoryEvents.invalidate();
        if (result.alreadySummarized) return;
        toast.success(
          lang === "th"
            ? `บันทึกความจำแล้ว: ${result.eventsAppended} รายการ`
            : `Memory saved: ${result.eventsAppended} events`
        );
      },
      onError: err => {
        if (err.data?.code === "PRECONDITION_FAILED") {
          toast.error(
            lang === "th"
              ? "ต้องสร้างสคริปต์และสตอรีบอร์ดก่อนสรุปความจำเข้าซีรีย์"
              : "The episode needs a generated script and storyboard before it can be summarized into series memory."
          );
          return;
        }
        toast.error(
          err.message ||
            (lang === "th"
              ? "สรุปความจำเข้าซีรีย์ไม่สำเร็จ"
              : "Failed to summarize episode into series memory.")
        );
      },
    });

  function handleSummarizeEpisodeToMemory(opts?: { force?: boolean }) {
    summarizeEpisodeToMemoryMutation.mutate({
      seriesId,
      episodeId,
      force: opts?.force,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /* ---- Video clip generation (`generateVideoClip`) — async submit + poll,
   *  same pattern as `pollStartFrameTask`/`pollAngleVariationsTask`. Media
   *  History registers the completed clip automatically (same convention as
   *  every other real generation in this codebase).
   *
   *  2026-07-06 fix (bug: "generation completed server-side but no video
   *  ever appears in the shot card") — root cause: completion used to be
   *  surfaced ONLY as a transient toast; nothing persisted the `taskId` or
   *  the resolved `resultUrl` anywhere, and the storyboard panel had no UI
   *  slot to render a completed clip video at all. Fixed the same way the
   *  angle-grid orphaned-task bug was fixed: persist `videoTask.pendingTaskId`
   *  onto `motionPromptPack.clips[]` at submit time (via the existing free
   *  `updateEpisodeDraft` JSONB-patch flow), persist `videoTask.videoUrl` on
   *  completion, and resume polling on load for any clip with a
   *  `pendingTaskId` but no `videoUrl` yet. */
  const [pollingVideoClips, setPollingVideoClips] = useState<Set<number>>(
    new Set()
  );
  const [ttsFallbackByClip, setTtsFallbackByClip] = useState<
    Record<number, boolean>
  >({});
  const [trimmedReferenceCountByClip, setTrimmedReferenceCountByClip] =
    useState<Record<number, number>>({});

  /** Clip numbers currently uploading an externally-generated video file
   *  (2026-07-07 upload-video-per-shot upgrade) — mirrors `pollingVideoClips`'
   *  shape but for the upload path, so the panel can show its own spinner
   *  independent of the AI-generate path. */
  const [uploadingVideoClipForClip, setUploadingVideoClipForClip] = useState<
    Set<number>
  >(new Set());
  /** One `WebAssetResolver` instance for the lifetime of this page — same
   *  large-file multipart upload route (`/api/media-jobs/upload`) used by
   *  Media Studio/Storyboard Review, reused here instead of `ai.upload`'s
   *  base64/tRPC path (bounded by the 10MB JSON body limit — impractical
   *  for video files). */
  const videoUploadResolverRef = useRef<WebAssetResolver | null>(null);
  if (!videoUploadResolverRef.current) {
    videoUploadResolverRef.current = new WebAssetResolver();
  }

  /** Clip numbers with a video-clip task currently being polled (live submit
   *  OR resumed-on-load) — guards against double-polling the same clip from
   *  both paths, same ref-guard convention as `angleVariationsPollInFlightRef`. */
  const videoClipPollInFlightRef = useRef<Set<number>>(new Set());
  /** Clip numbers whose `pendingTaskId` this session has already picked up
   *  for resume-polling — prevents re-triggering on every `getEpisodeDetail`
   *  refetch, same convention as `resumedAngleGridShotsRef`. */
  const resumedVideoClipsRef = useRef<Set<number>>(new Set());
  // A provider/MCP video can legitimately take much longer than the old
  // five-minute client poll window. Keep the task marker durable and wait up
  // to 30 minutes before surfacing a timeout to the user.
  const VIDEO_CLIP_POLL_MAX_ATTEMPTS = 720;

  /** Dedicated atomic persistence for one clip's task state. The server
   *  re-reads/locks the fresh motion pack before merging, so simultaneous
   *  clip completions cannot overwrite sibling `videoTask` values. `null`
   *  clears the field entirely. `sourceShotNumber` keeps the existing upload
   *  behavior that can create a minimal clip when no prompt-pack entry exists.
   */
  const persistVideoClipTaskMutation =
    trpc.verticalDramaEpisodes.persistVideoClipTask.useMutation();

  async function persistVideoTask(
    clipNumber: number,
    videoTask:
      | { pendingTaskId: string }
      | {
          videoUrl: string;
          mediaTaskId?: string;
          source?: "generated" | "upload";
        }
      | null,
    sourceShotNumber?: number
  ) {
    const storyboardShot = (
      episodeDetailQuery.data?.storyboard as
        | VerticalDramaStoryboardView
        | null
        | undefined
    )?.shots?.find(
      s => (s.shot_number ?? -1) === (sourceShotNumber ?? clipNumber)
    );

    await persistVideoClipTaskMutation.mutateAsync({
      seriesId,
      episodeId,
      clipNumber,
      sourceShotNumber,
      durationSeconds: storyboardShot?.duration_seconds ?? 8,
      selectedVideoModelId,
      videoTask,
    });
  }

  /** Shared completion handler for BOTH the live submit-then-poll path and
   *  the resume-on-load path — both must converge on the identical
   *  persisted `videoTask` shape ({ videoUrl, mediaTaskId }, `pendingTaskId`
   *  dropped). `source: "generated"` always overwrites a prior
   *  self-uploaded clip (2026-07-07 upload-video-per-shot upgrade) — "สร้าง
   *  ใหม่"/regen is still the AI path and replaces whatever was there. */
  async function resolveCompletedVideoClipTask(
    clipNumber: number,
    resultUrl: string,
    taskId: string
  ) {
    await persistVideoTask(clipNumber, {
      videoUrl: resultUrl,
      mediaTaskId: taskId,
      source: "generated",
    });
  }

  async function pollVideoClipTask(taskId: string, clipNumber: number) {
    if (videoClipPollInFlightRef.current.has(clipNumber)) return;
    videoClipPollInFlightRef.current.add(clipNumber);
    setPollingVideoClips(prev => new Set(prev).add(clipNumber));
    try {
      for (
        let attempt = 0;
        attempt < VIDEO_CLIP_POLL_MAX_ATTEMPTS;
        attempt++
      ) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th"
                ? "สร้างวิดีโอสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                : "Video generation completed but no result URL."
            );
            await persistVideoTask(clipNumber, null);
            return;
          }
          toast.success(
            lang === "th" ? "สร้างวิดีโอคลิปสำเร็จ" : "Video clip generated."
          );
          await resolveCompletedVideoClipTask(clipNumber, resultUrl, taskId);
          return;
        }
        if (status === "failed") {
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          toast.error(
            buildVdGenerateFailureToastMessage(failedTask, lang, {
              th: "สร้างวิดีโอล้มเหลว",
              en: "Video generation failed",
            })
          );
          await persistVideoTask(clipNumber, null);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        lang === "th"
          ? "สร้างวิดีโอใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
          : "Generation is taking too long — check back later."
      );
    } finally {
      videoClipPollInFlightRef.current.delete(clipNumber);
      setPollingVideoClips(prev => {
        const next = new Set(prev);
        next.delete(clipNumber);
        return next;
      });
    }
  }

  /** Upload video file per shot (2026-07-07 upgrade, fixed 2026-07-07: now
   *  shown/works on EVERY shot, not just ones with an existing motion-pack
   *  clip) — for users who generated the clip EXTERNALLY (took the main
   *  image + prompt elsewhere) and want to place the resulting video file as
   *  this shot's clip video. Uploads via the existing large-file multipart
   *  route (`/api/media-jobs/upload`, same one Media Studio/Storyboard
   *  Review use), then persists `{ videoUrl, source: "upload" }` onto the
   *  clip's `videoTask` via the dedicated atomic `persistVideoTask` flow (which
   *  creates a minimal clip/pack first when `clipNumber` has no existing
   *  match) — the player, download, and whole-episode assembly all pick it
   *  up the same way they do a generated clip. */
  async function handleUploadVideoClip(
    clipNumber: number,
    file: File,
    sourceShotNumber: number
  ) {
    setUploadingVideoClipForClip(prev => new Set(prev).add(clipNumber));
    try {
      const resolver = videoUploadResolverRef.current!;
      const { promise } = resolver.uploadAsset(file);
      const { uri } = await promise;
      await persistVideoTask(
        clipNumber,
        { videoUrl: uri, source: "upload" },
        sourceShotNumber
      );
      toast.success(lang === "th" ? "อัปโหลดวิดีโอสำเร็จ" : "Video uploaded.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "อัปโหลดวิดีโอไม่สำเร็จ"
            : "Failed to upload the video."
      );
    } finally {
      setUploadingVideoClipForClip(prev => {
        const next = new Set(prev);
        next.delete(clipNumber);
        return next;
      });
    }
  }

  const generateVideoClipMutation =
    trpc.verticalDramaEpisodes.generateVideoClip.useMutation({
      onSuccess: (data, variables) => {
        setTtsFallbackByClip(prev => ({
          ...prev,
          [variables.clipNumber]: data.ttsFallback,
        }));
        setTrimmedReferenceCountByClip(prev => ({
          ...prev,
          [variables.clipNumber]: data.trimmedReferenceCount,
        }));
        // Persist the pending task marker BEFORE polling starts — if the
        // page reloads/navigates away before this poll observes completion,
        // the resume-on-load effect below can pick the task back up instead
        // of the result being silently lost forever (2026-07-06 fix).
        // The completion poll starts only after this durable pending marker
        // is committed. Otherwise a very fast task could finish first and a
        // late pending write could overwrite its completed URL.
        void persistVideoTask(variables.clipNumber, {
          pendingTaskId: data.taskId,
        })
          .then(() => pollVideoClipTask(data.taskId, variables.clipNumber))
          .catch(err =>
            toast.error(
              err instanceof Error
                ? err.message
                : lang === "th"
                  ? "บันทึกสถานะวิดีโอไม่สำเร็จ"
                  : "Failed to save video task state."
            )
          );
      },
      onError: err => {
        const hermesPresentation = presentHermesError(err);
        toast.error(
          hermesPresentation ? formatHermesErrorForToast(hermesPresentation, lang) : err.message
        );
        if (err.data?.code === "BAD_REQUEST") scrollToVdModelPicker("video");
      },
    });

  /** RESUME ON LOAD (2026-07-06 fix) — same convention as the angle-grid
   *  resume effect: runs on every `getEpisodeDetail` load/refetch and
   *  resumes polling any clip that has a `videoTask.pendingTaskId` but no
   *  `videoUrl` yet. */
  useEffect(() => {
    const clips = episodeDetailQuery.data?.motionPromptPack?.clips ?? [];
    for (const clip of clips) {
      const videoTask = clip.videoTask as
        | { pendingTaskId?: string; videoUrl?: string; mediaTaskId?: string }
        | undefined;
      const clipNumber = clip.clipNumber;
      if (
        !shouldResumeVideoClipPoll(
          videoTask,
          clipNumber,
          resumedVideoClipsRef.current,
          videoClipPollInFlightRef.current
        )
      ) {
        continue;
      }
      const pendingTaskId = videoTask!.pendingTaskId!;
      resumedVideoClipsRef.current.add(clipNumber);
      void pollVideoClipTask(pendingTaskId, clipNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeDetailQuery.data?.motionPromptPack?.clips]);

  /* ---- Whole-episode dialogue TTS batch (W12-B voice chain wave) — submit
   *  ONE async TTS task PER LINE via `generateEpisodeDialogueAudio` (the
   *  server persists each submitted line's `audioTask.pendingTaskId` onto
   *  `dialogueAudioPlan.separateTtsPlan.items[]` itself, atomically, as part
   *  of that same mutation — unlike `generateVideoClip`, this page never
   *  needs to persist the pending marker before polling starts). Poll/
   *  persist/resume mirrors `pollVideoClipTask`/`persistVideoTask`/the
   *  video-clip resume effect above line-for-line, just keyed by `lineId`
   *  (string) instead of `clipNumber` (number) — see
   *  `shouldResumeAudioLinePoll`/`buildUpdatedItemsForAudioTask`/
   *  `resolveDialogueAudioLineStatus`'s own doc comments above for the
   *  exact parity + the one deliberate difference (failed-status tracking). */
  // debt-item-1 (2026-07-08) — prefer the server-resolved
  // `getEpisodeDetail.flags.voiceChain` (same tenant flag, resolved by
  // `resolveVerticalDramaVoiceChainFlag`) once it has loaded; falls back to
  // the direct tenant-flag read for the render(s) before `episodeDetailQuery`
  // resolves, so nothing regresses while the query is still loading.
  const voiceChainTenantFlagFallback = useTenantFeatureFlag(
    "verticalDramaSeriesVoiceChain"
  );
  const voiceChainFlagEnabled = resolveVoiceChainFlagEnabled(
    episodeDetailQuery.data?.flags?.voiceChain,
    voiceChainTenantFlagFallback
  );

  /* ---- Ad Banner Overlay (F131W, task #30-A2) — per-episode banner
   *  selection. Same server-preferred-with-tenant-fallback pattern as
   *  `voiceChainFlagEnabled` immediately above. */
  const adBannerOverlayTenantFlagFallback = useTenantFeatureFlag(
    "verticalDramaSeriesAdBannerOverlay"
  );
  const adBannerOverlayEnabled = resolveAdBannerOverlayFlagEnabled(
    episodeDetailQuery.data?.flags?.adBannerOverlay,
    adBannerOverlayTenantFlagFallback
  );
  const updateEpisodeAdBannerPlanMutation =
    trpc.verticalDramaEpisodes.updateEpisodeAdBannerPlan.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "บันทึกแบนเนอร์แล้ว" : "Ad banners saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => {
        toast.error(
          err.message ||
            (lang === "th"
              ? "บันทึกแบนเนอร์ไม่สำเร็จ"
              : "Failed to save ad banners.")
        );
      },
    });
  const adBannerPlanPanelData = useMemo(
    () => ({
      designs: episodeDetailQuery.data?.adBannerDesignsSummary ?? [],
      plan: episodeDetailQuery.data?.adBannerPlan ?? null,
      saving: updateEpisodeAdBannerPlanMutation.isPending,
      error: updateEpisodeAdBannerPlanMutation.error?.message ?? null,
      onSave: (plan: VerticalDramaAdBannerPlanView) =>
        updateEpisodeAdBannerPlanMutation.mutate({
          seriesId,
          episodeId,
          plan,
          idempotencyKey: crypto.randomUUID(),
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      episodeDetailQuery.data?.adBannerDesignsSummary,
      episodeDetailQuery.data?.adBannerPlan,
      updateEpisodeAdBannerPlanMutation.isPending,
      updateEpisodeAdBannerPlanMutation.error?.message,
      seriesId,
      episodeId,
    ]
  );

  /* ---- Text Overlay Suite (F131AB, task #34) — per-episode text-overlay
   *  plan. Same server-preferred-with-tenant-fallback pattern as
   *  `adBannerOverlayEnabled` immediately above. ---- */
  const textOverlaySuiteTenantFlagFallback = useTenantFeatureFlag(
    "verticalDramaSeriesTextOverlaySuite"
  );
  const textOverlaySuiteEnabled = resolveTextOverlaySuiteFlagEnabled(
    episodeDetailQuery.data?.flags?.textOverlaySuite,
    textOverlaySuiteTenantFlagFallback
  );
  const updateEpisodeTextOverlayPlanMutation =
    trpc.verticalDramaEpisodes.updateEpisodeTextOverlayPlan.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "บันทึกข้อความบนวิดีโอแล้ว" : "Text overlays saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => {
        toast.error(
          err.message ||
            (lang === "th"
              ? "บันทึกข้อความบนวิดีโอไม่สำเร็จ"
              : "Failed to save text overlays.")
        );
      },
    });
  const textOverlayPlanPanelData = useMemo(
    () => ({
      plan: episodeDetailQuery.data?.textOverlayPlan ?? null,
      preview: episodeDetailQuery.data?.textOverlayPreview ?? null,
      saving: updateEpisodeTextOverlayPlanMutation.isPending,
      error: updateEpisodeTextOverlayPlanMutation.error?.message ?? null,
      onSave: (plan: VerticalDramaTextOverlayPlanView) =>
        updateEpisodeTextOverlayPlanMutation.mutate({
          seriesId,
          episodeId,
          plan,
          idempotencyKey: crypto.randomUUID(),
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      episodeDetailQuery.data?.textOverlayPlan,
      episodeDetailQuery.data?.textOverlayPreview,
      updateEpisodeTextOverlayPlanMutation.isPending,
      updateEpisodeTextOverlayPlanMutation.error?.message,
      seriesId,
      episodeId,
    ]
  );
  /** Shot numbers available for the mid-episode card list editor's "which
   *  shot" picker — sourced from the storyboard (available earlier in the
   *  pipeline than start frames), same field convention
   *  (`shots[].shot_number`) every other storyboard reader on this page
   *  already uses. */
  const textOverlayShotNumbers = useMemo(() => {
    const shots = (
      episodeDetailQuery.data?.storyboard as
        | { shots?: Array<{ shot_number?: number }> }
        | null
        | undefined
    )?.shots;
    if (!Array.isArray(shots)) return [];
    return shots
      .map(s => s.shot_number)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
  }, [episodeDetailQuery.data?.storyboard]);

  const audioLinePollInFlightRef = useRef<Set<string>>(new Set());
  const resumedAudioLinesRef = useRef<Set<string>>(new Set());
  /** Lines whose most recent poll observed `status === "failed"` (or a
   *  completed task with no result URL) THIS session — see
   *  `resolveDialogueAudioLineStatus`'s doc comment for why "failed" cannot
   *  be derived from the persisted plan alone. Cleared for a line the
   *  moment it later resolves to `ready`. */
  const [failedAudioLineIds, setFailedAudioLineIds] = useState<Set<string>>(
    new Set()
  );

  /** Persists an `audioTask` patch onto the matching
   *  `dialogueAudioPlan.separateTtsPlan.items[]` entry via the existing free
   *  `updateEpisodeDraft` JSONB-patch flow — same convention as
   *  `persistVideoTask`. `null` clears the field entirely (poll failure). */
  function persistAudioTask(
    lineId: string,
    audioTask:
      | { pendingTaskId: string }
      | { audioUrl: string; mediaTaskId?: string }
      | null
  ) {
    const plan = episodeDetailQuery.data?.dialogueAudioPlan as
      | VerticalDramaDialogueAudioPlan
      | null
      | undefined;
    if (!plan?.separateTtsPlan) return;
    const updatedItems = buildUpdatedItemsForAudioTask(
      plan.separateTtsPlan.items as unknown as MinimalAudioTaskItem[],
      lineId,
      audioTask
    );
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      dialogueAudioPlan: {
        ...plan,
        separateTtsPlan: {
          ...plan.separateTtsPlan,
          items: updatedItems as unknown as typeof plan.separateTtsPlan.items,
        },
      },
    });
  }

  async function pollDialogueAudioLineTask(taskId: string, lineId: string) {
    if (audioLinePollInFlightRef.current.has(lineId)) return;
    audioLinePollInFlightRef.current.add(lineId);
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th"
                ? "สร้างเสียงพูดสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                : "Audio generation completed but no result URL."
            );
            setFailedAudioLineIds(prev => new Set(prev).add(lineId));
            persistAudioTask(lineId, null);
            return;
          }
          persistAudioTask(lineId, {
            audioUrl: resultUrl,
            mediaTaskId: taskId,
          });
          setFailedAudioLineIds(prev => {
            if (!prev.has(lineId)) return prev;
            const next = new Set(prev);
            next.delete(lineId);
            return next;
          });
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)
            ?.errorMessage;
          toast.error(
            lang === "th"
              ? `สร้างเสียงพูดล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`
              : `Audio generation failed${errorMessage ? `: ${errorMessage}` : ""}`
          );
          setFailedAudioLineIds(prev => new Set(prev).add(lineId));
          persistAudioTask(lineId, null);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      // Timeout — no persist change (mirrors `pollVideoClipTask`'s own
      // timeout branch): the pendingTaskId stays in place so a reload
      // resumes tracking via the resume-on-load effect below.
      toast.error(
        lang === "th"
          ? "สร้างเสียงพูดใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
          : "Audio generation is taking too long — check back later."
      );
    } finally {
      audioLinePollInFlightRef.current.delete(lineId);
    }
  }

  const generateEpisodeDialogueAudioMutation =
    trpc.verticalDramaEpisodes.generateEpisodeDialogueAudio.useMutation({
      onSuccess: data => {
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        toast.success(
          vdCopyWithParams(vdCopy(lang).dialogueAudioBatchSubmittedTemplate, {
            submitted: data.submittedCount,
            skipped: data.skippedCount,
            credits: data.creditEstimate,
          })
        );
        if (data.failures?.length) {
          toast.error(
            vdCopyWithParams(vdCopy(lang).dialogueAudioBatchFailuresTemplate, {
              n: data.failures.length,
            })
          );
        }
      },
      onError: err => toast.error(err.message),
    });

  function handleGenerateDialogueAudioBatch() {
    generateEpisodeDialogueAudioMutation.mutate({
      seriesId,
      episodeId,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /** RESUME ON LOAD (W12-B voice chain wave) — same convention as the
   *  video-clip resume effect above: runs on every `getEpisodeDetail` load/
   *  refetch and resumes polling any dialogue line that has an
   *  `audioTask.pendingTaskId` but no `audioUrl` yet (including every line
   *  a just-submitted batch call persisted, since `generateEpisodeDialogueAudio`
   *  writes ALL of them in the same DB update the mutation's own
   *  `onSuccess` invalidate above refetches). */
  useEffect(() => {
    const dialoguePlan = episodeDetailQuery.data?.dialogueAudioPlan as
      | VerticalDramaDialogueAudioPlan
      | null
      | undefined;
    const items = dialoguePlan?.separateTtsPlan?.items ?? [];
    for (const item of items) {
      if (
        !shouldResumeAudioLinePoll(
          item.audioTask,
          item.lineId,
          resumedAudioLinesRef.current,
          audioLinePollInFlightRef.current
        )
      ) {
        continue;
      }
      const pendingTaskId = item.audioTask!.pendingTaskId!;
      resumedAudioLinesRef.current.add(item.lineId);
      void pollDialogueAudioLineTask(pendingTaskId, item.lineId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeDetailQuery.data?.dialogueAudioPlan]);

  /* ---- Whole-episode compiled video (2026-07-06 download + assembly
   *  upgrade) — `assembleEpisodeVideo` concatenates every completed clip
   *  into one mp4. Async submit -> the actual ffmpeg job runs server-side
   *  and its status is persisted onto `episode.assemblyManifest.compiledVideo`
   *  (`{ pendingJobId?, videoUrl?, durationSeconds?, shotCount?, assembledAt?,
   *  status, error? }`) — same durable-status convention as
   *  `videoTask.pendingTaskId`, but polled by refetching `getEpisodeDetail`
   *  (there is no per-job `media.getTask`-style endpoint for this feature)
   *  instead of a dedicated task-status endpoint.
   *
   *  NOTE: `getEpisodeDetail`'s current response does not yet include
   *  `assemblyManifest` (only `updateEpisodeDraft`'s input accepts it) — read
   *  defensively via a loose cast so this degrades to "never resolves past
   *  pending" instead of crashing until that field is added server-side. */
  const compiledVideo = (
    episodeDetailQuery.data as
      | { assemblyManifest?: { compiledVideo?: Record<string, unknown> } }
      | undefined
  )?.assemblyManifest?.compiledVideo as
    | {
        pendingJobId?: string;
        videoUrl?: string;
        durationSeconds?: number;
        shotCount?: number;
        assembledAt?: string;
        status?: "pending" | "completed" | "failed";
        error?: string;
        /** `planning/vd-remotion-render-option/plan.md` wave 2 — mirrors
         *  `assemblyManifest.compiledVideo.renderEngine` (server-side,
         *  `verticalDramaEpisodeVideoAssembly.ts`/`verticalDramaRemotionRender.ts`)
         *  verbatim. Absent for compiled videos rendered before this option
         *  existed (treated as `"ffmpeg"` by the panel's badge check). */
        renderEngine?: "ffmpeg" | "remotion_queue";
      }
    | undefined;

  /** W12-B voice chain wave — the Dialogue/Audio panel's `batch` prop, built
   *  once here from the persisted plan + this session's `failedAudioLineIds`
   *  (see `resolveDialogueAudioLineStatus`'s doc comment). `undefined` when
   *  the flag is off or the plan has no separate-TTS strategy yet, so the
   *  panel's flag-off byte-identical guarantee holds regardless of what this
   *  page computes. */
  const dialogueAudioPlanForBatch = episodeDetailQuery.data
    ?.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null | undefined;
  const dialogueAudioBatchData:
    | VerticalDramaDialogueAudioBatchData
    | undefined =
    voiceChainFlagEnabled && dialogueAudioPlanForBatch?.separateTtsPlan
      ? {
          lineStatusByLineId:
            dialogueAudioPlanForBatch.separateTtsPlan.items.reduce<
              Record<string, VerticalDramaDialogueAudioLineBatchView>
            >((acc, item) => {
              acc[item.lineId] = {
                status: resolveDialogueAudioLineStatus(
                  item,
                  item.lineId,
                  failedAudioLineIds
                ),
                audioUrl: item.audioTask?.audioUrl,
                blockReason: item.blockReason,
              };
              return acc;
            }, {}),
          pendingCount: countPendingDialogueAudioLines(
            dialogueAudioPlanForBatch
          ),
          generating: generateEpisodeDialogueAudioMutation.isPending,
          onGenerateBatch: handleGenerateDialogueAudioBatch,
          onRetryLine: () => handleGenerateDialogueAudioBatch(),
          castingTabHref: `${verticalDramaRoutes.seriesDetail(seriesId)}?tab=characters`,
        }
      : undefined;

  /** Ref-guarded 3-5s poll of `getEpisodeDetail` while a compiled-video job is
   *  pending — cleared in `finally` so it never leaks an interval, and never
   *  double-starts across the live-submit path and the resume-on-load path,
   *  same convention as `videoClipPollInFlightRef`. */
  const compiledVideoPollIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const compiledVideoPollingRef = useRef(false);

  function stopCompiledVideoPoll() {
    if (compiledVideoPollIntervalRef.current != null) {
      clearInterval(compiledVideoPollIntervalRef.current);
      compiledVideoPollIntervalRef.current = null;
    }
    compiledVideoPollingRef.current = false;
  }

  function startCompiledVideoPoll() {
    if (compiledVideoPollingRef.current) return;
    compiledVideoPollingRef.current = true;
    compiledVideoPollIntervalRef.current = setInterval(() => {
      void episodeDetailQuery.refetch();
    }, 4000);
  }

  // Stop the poll once the job reaches a terminal state, wherever that
  // transition is observed (live submit refetch OR resume-on-load refetch).
  useEffect(() => {
    if (
      compiledVideo?.status === "completed" ||
      compiledVideo?.status === "failed"
    ) {
      stopCompiledVideoPoll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiledVideo?.status]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopCompiledVideoPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** RESUME ON LOAD — a `pendingJobId` with no terminal status means the job
   *  was still running when the page was last closed/reloaded; resume
   *  polling instead of leaving the card stuck showing nothing. */
  const resumedCompiledVideoPollRef = useRef(false);
  useEffect(() => {
    if (resumedCompiledVideoPollRef.current) return;
    if (!compiledVideo?.pendingJobId) return;
    if (
      compiledVideo.status === "completed" ||
      compiledVideo.status === "failed"
    )
      return;
    resumedCompiledVideoPollRef.current = true;
    startCompiledVideoPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiledVideo?.pendingJobId, compiledVideo?.status]);

  /* ---- Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) —
   *  dialogue-audio + subtitle option VALUES for `assembleEpisodeVideo`,
   *  owned here (not inside the workspace) since this is the only call site
   *  that actually mutates — `VerticalDramaEpisodeWorkspace`'s new
   *  `finalRenderOptionsPanel.onChange` just keeps this state in sync as the
   *  user edits the section's checkbox/select controls. Persistence across
   *  sessions is NOT required for this wave (plain in-memory state, same as
   *  every other episode-workspace draft toggle). */
  // Persisted per episode (2026-07-31). The original comment here said
  // "Persistence across sessions is NOT required for this wave (plain
  // in-memory state)" — which meant every reload silently reset the render
  // options, including the Remotion toggle the user had just ticked.
  //
  // `renderEngine` defaults to `"remotion_queue"` because the ffmpeg queue has
  // no worker that can claim its jobs (see `assembleEpisodeVideo`'s
  // `vd_assembly_remotion_failed_and_no_ffmpeg_worker` guard).
  const finalRenderOptionsStorageKey = `vd:render-options:${seriesId}:${episodeId}`;
  const [finalRenderOptions, setFinalRenderOptions] =
    useState<VerticalDramaFinalRenderOptionsView>(() => {
      const defaults: VerticalDramaFinalRenderOptionsView = {
        includeDialogueAudio: false,
        loudnessNormalize: false,
        subtitlePreset: "classic_box",
        // Render-options extension (2026-07-13) — mirrors the 3 fields above;
        // matches `assembleEpisodeVideo`'s own server-side defaults.
        subtitleFontSize: "medium",
        showAgeBadge: false,
        renderEngine: "remotion_queue",
      };
      const raw = safeStorageGet(finalRenderOptionsStorageKey);
      if (!raw) return defaults;
      try {
        // Merge over defaults so a payload saved by an older build (missing
        // `renderEngine`, or missing a field added later) still resolves to a
        // complete, valid object rather than partially-undefined state.
        return { ...defaults, ...(JSON.parse(raw) as object) };
      } catch {
        return defaults;
      }
    });
  useEffect(() => {
    safeStorageSet(
      finalRenderOptionsStorageKey,
      JSON.stringify(finalRenderOptions)
    );
  }, [finalRenderOptionsStorageKey, finalRenderOptions]);
  /** Durable (non-toast) proof of what the most recently SUBMITTED
   *  `assembleEpisodeVideo` call actually included — mirrors `scriptSummary`'s
   *  "not just a toast, which disappears" convention. `null` until the first
   *  successful submit this session. */
  const [finalRenderLastResult, setFinalRenderLastResult] =
    useState<VerticalDramaFinalRenderResultView | null>(null);

  const assembleEpisodeVideoMutation =
    trpc.verticalDramaEpisodes.assembleEpisodeVideo.useMutation({
      onSuccess: data => {
        setFinalRenderLastResult({
          dialogueAudioSegmentsIncluded: data.dialogueAudioSegmentsIncluded,
          subtitleLinesIncluded: data.subtitleLinesIncluded,
          excludedAdBanners: data.excludedAdBanners,
          // `planning/vd-remotion-render-option/plan.md` wave 2 — present
          // only when a `"remotion_queue"` request fell back to ffmpeg for
          // this submission (see `assembleEpisodeVideo`'s response doc
          // comment, `server/routers/verticalDramaEpisodes.ts`).
          renderEngineFallbackReason: data.renderEngineFallbackReason,
        });
        toast.success(
          vdCopyWithParams(vdCopy(lang).finalRenderStartedSummaryTemplate, {
            subtitleLines: data.subtitleLinesIncluded,
            audioSegments: data.dialogueAudioSegmentsIncluded,
          })
        );
        if (data.renderEngineFallbackReason) {
          toast.warning(
            vdCopyWithParams(
              vdCopy(lang).finalRenderEngineFallbackReasonTemplate,
              { reason: data.renderEngineFallbackReason }
            )
          );
        }
        if (data.excludedAdBanners?.length) {
          const designs = episodeDetailQuery.data?.adBannerDesignsSummary ?? [];
          const list = data.excludedAdBanners
            .map(exclusion => {
              const label =
                designs.find(d => d.id === exclusion.bannerId)?.label ??
                exclusion.bannerId;
              const reason = vdAdBannerExclusionReasonLabel(
                exclusion.code,
                lang
              );
              return `${label} (${reason})`;
            })
            .join(", ");
          toast.warning(
            vdCopyWithParams(
              vdCopy(lang).finalRenderExcludedAdBannersToastTemplate,
              { n: data.excludedAdBanners.length, list }
            )
          );
        }
        startCompiledVideoPoll();
        void episodeDetailQuery.refetch();
      },
      onError: err => {
        // The raw server code is precise but unreadable; translate the one
        // failure a user can actually act on (2026-07-31 gap audit: the
        // ffmpeg fallback has no consumer, so a Remotion failure is terminal).
        if (err.message?.startsWith("vd_assembly_remotion_failed_and_no_ffmpeg_worker")) {
          const detail = err.message.split(":").slice(1).join(":").trim();
          toast.error(
            lang === "th"
              ? `ส่งงานเข้าคิว Remotion ไม่สำเร็จ และไม่มีเครื่อง worker ที่รับงาน ffmpeg ได้ จึงยังประกอบวิดีโอไม่ได้${detail ? ` — ${detail}` : ""}`
              : `Remotion queue submission failed and no worker can take the ffmpeg fallback, so assembly cannot proceed${detail ? ` — ${detail}` : ""}`
          );
          return;
        }
        toast.error(
          err.message ||
            (lang === "th"
              ? "เริ่มการประกอบวิดีโอไม่สำเร็จ"
              : "Failed to start assembly.")
        );
      },
    });

  function handleAssembleCompiledVideo(opts?: { allowPartial?: boolean }) {
    assembleEpisodeVideoMutation.mutate({
      seriesId,
      episodeId,
      allowPartial: opts?.allowPartial,
      // `voiceChainFlagEnabled` re-check mirrors the server's own
      // `voiceChainEnabled && input.includeDialogueAudio === true` guard
      // (`assembleEpisodeVideo`, server/routers/verticalDramaEpisodes.ts) —
      // belt-and-suspenders only, since the checkbox itself never renders
      // (so `finalRenderOptions.includeDialogueAudio` can never become
      // `true`) while the flag is off.
      includeDialogueAudio:
        voiceChainFlagEnabled && finalRenderOptions.includeDialogueAudio,
      loudnessNormalize: finalRenderOptions.loudnessNormalize,
      subtitlePreset: finalRenderOptions.subtitlePreset,
      // Render-options extension (2026-07-13) — optional on the mutation;
      // sent explicitly here since the section always resolves a concrete
      // value (defaults "medium"/false match the server's own defaults).
      subtitleFontSize: finalRenderOptions.subtitleFontSize,
      showAgeBadge: finalRenderOptions.showAgeBadge,
      // `planning/vd-remotion-render-option/plan.md` wave 2 — only sent when
      // the user opted in; omitted (not `"ffmpeg"`) for every other call so
      // the mutate payload stays BYTE-IDENTICAL to before this option
      // existed whenever the toggle is off.
      ...(finalRenderOptions.renderEngine === "remotion_queue"
        ? { renderEngine: "remotion_queue" as const }
        : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  /* ---- Phase 6.5 — image-to-image repair dialog (`repairShotImage`) ----
   *  Async submit + poll like every other real generation here: submit ->
   *  `taskId` -> poll `media.getTask` -> the result URL is shown as the
   *  dialog's AFTER image WITHOUT auto-replacing the shot's approved image;
   *  the user explicitly picks "ใช้ภาพใหม่" (resolve + setApprovedStartFrameAsset)
   *  or "เก็บภาพเดิม" (discard — the generated image stays in Media History,
   *  untouched). */
  const [repairImageDialogForShot, setRepairImageDialogForShot] = useState<
    number | null
  >(null);
  const [repairImageSubmittingForShot, setRepairImageSubmittingForShot] =
    useState<number | null>(null);
  const [repairImageResultByShot, setRepairImageResultByShot] = useState<
    Record<number, { beforeUrl: string; afterUrl: string }>
  >({});
  const [repairImageErrorByShot, setRepairImageErrorByShot] = useState<
    Record<number, string>
  >({});
  /** Guards against the poll loop and a subsequent "accept" resolving the
   *  same shot's state out of order if the user closes/reopens the dialog
   *  quickly (recent race lesson — always clear loading flags in `finally`
   *  AND guard re-entrancy with a ref, not just React state). */
  const repairImagePollInFlightRef = useRef<Set<number>>(new Set());

  const repairShotImageMutation =
    trpc.verticalDramaEpisodes.repairShotImage.useMutation({
      onError: (err, variables) => {
        setRepairImageSubmittingForShot(current =>
          current === variables.shotNumber ? null : current
        );
        // BAD_REQUEST here is the server's fail-closed "no image model
        // selected" guard (`resolveEpisodeImageModelId`) — surface its
        // actual bilingual message (don't swallow it under the generic
        // fallback below) and scroll the picker into view once the dialog
        // is dismissed.
        if (err.data?.code === "BAD_REQUEST") scrollToVdModelPicker("image");
        // Feature 135 section-10 review fix: `HERMES_CONNECTION_REQUIRED`
        // and friends also throw with `code: "BAD_REQUEST"` — check for the
        // pinned `[HERMES_X] ...` prefix before falling through to the raw
        // `err.message` pass-through below (which predates this feature).
        const hermesPresentation = presentHermesError(err);
        setRepairImageErrorByShot(prev => ({
          ...prev,
          [variables.shotNumber]: hermesPresentation
            ? formatHermesErrorForToast(hermesPresentation, lang)
            : err.data?.code === "PRECONDITION_FAILED" ||
                err.data?.code === "BAD_REQUEST"
              ? err.message
              : lang === "th"
                ? "สร้างภาพที่แก้ไม่สำเร็จ"
                : "Failed to generate the fixed image.",
        }));
      },
    });

  async function pollRepairImageTask(
    taskId: string,
    shotNumber: number,
    beforeUrl: string,
    instruction: string,
    softenLevel = 0
  ) {
    if (repairImagePollInFlightRef.current.has(shotNumber)) return;
    repairImagePollInFlightRef.current.add(shotNumber);
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            setRepairImageErrorByShot(prev => ({
              ...prev,
              [shotNumber]:
                lang === "th"
                  ? "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์"
                  : "Generation completed but no result URL.",
            }));
            return;
          }
          setRepairImageResultByShot(prev => ({
            ...prev,
            [shotNumber]: { beforeUrl, afterUrl: resultUrl },
          }));
          return;
        }
        if (status === "failed") {
          const failedTask = task as { errorMessage?: string; errorCode?: string } | null;
          const errorMessage = failedTask?.errorMessage;
          // Character-lock auto-soften — same convention as `pollStartFrameTask`.
          if (
            isCharacterLockPolicyFailureMessage(errorMessage) &&
            softenLevel < VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL
          ) {
            const nextLevel = softenLevel + 1;
            toast.info(
              lang === "th"
                ? `ปรับ prompt ให้อ่อนลงอัตโนมัติเนื่องจากติดนโยบาย model (ครั้งที่ ${nextLevel})`
                : `Automatically softening the prompt due to a model policy rejection (attempt ${nextLevel})`
            );
            repairImagePollInFlightRef.current.delete(shotNumber);
            repairShotImageMutation.mutate(
              {
                seriesId,
                episodeId,
                shotNumber,
                instruction,
                softenLevel: nextLevel,
                idempotencyKey: crypto.randomUUID(),
                mcpConnectionId: imageModelUsesMcp
                  ? (mcpConnectionId ?? undefined)
                  : undefined,
                sharedGroupId: imageModelUsesMcp && mcpConnectionId
                  ? (mcpSharedGroupId ?? undefined)
                  : undefined,
                hermesConnectionId:
                  imageModelUsesHermes && !(imageModelUsesMcp && mcpConnectionId)
                    ? (hermesConnectionId ?? undefined)
                    : undefined,
                resolution: selectedImageResolution || undefined,
              },
              {
                onSuccess: data => {
                  void pollRepairImageTask(
                    data.taskId,
                    shotNumber,
                    beforeUrl,
                    instruction,
                    nextLevel
                  );
                },
              }
            );
            return;
          }
          setRepairImageErrorByShot(prev => ({
            ...prev,
            [shotNumber]: buildVdGenerateFailureToastMessage(failedTask, lang, {
              th: "สร้างภาพที่แก้ไม่สำเร็จ",
              en: "Failed to generate the fixed image",
            }),
          }));
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      setRepairImageErrorByShot(prev => ({
        ...prev,
        [shotNumber]:
          lang === "th"
            ? "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง"
            : "Generation is taking too long — check back later.",
      }));
    } finally {
      repairImagePollInFlightRef.current.delete(shotNumber);
      setRepairImageSubmittingForShot(current =>
        current === shotNumber ? null : current
      );
    }
  }

  function handleSubmitRepairImage(shotNumber: number, instruction: string) {
    if (!instruction.trim()) return;
    if (!requireModelSelectedOrToast("image")) return;
    if (!requireMcpConnectionOrToast("image")) return;
    if (!requireHermesConnectionOrToast("image")) return;
    const plan = episodeDetailQuery.data?.startFramePlan;
    const frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
    const assetId = frame?.approvedMediaAssetId;
    const beforeUrl = assetId
      ? (
          episodeDetailQuery.data?.assetUrls as
            | VerticalDramaAssetUrlMap
            | undefined
        )?.[assetId]?.url
      : undefined;
    if (!beforeUrl) {
      setRepairImageErrorByShot(prev => ({
        ...prev,
        [shotNumber]:
          lang === "th"
            ? "ต้องมีภาพหลักของช็อตก่อน"
            : "This shot needs an approved image first.",
      }));
      return;
    }
    setRepairImageSubmittingForShot(shotNumber);
    setRepairImageErrorByShot(prev => {
      if (!(shotNumber in prev)) return prev;
      const next = { ...prev };
      delete next[shotNumber];
      return next;
    });
    repairShotImageMutation.mutate(
      {
        seriesId,
        episodeId,
        shotNumber,
        instruction,
        idempotencyKey: crypto.randomUUID(),
        mcpConnectionId: imageModelUsesMcp
          ? (mcpConnectionId ?? undefined)
          : undefined,
        sharedGroupId: imageModelUsesMcp && mcpConnectionId
          ? (mcpSharedGroupId ?? undefined)
          : undefined,
        hermesConnectionId:
          imageModelUsesHermes && !(imageModelUsesMcp && mcpConnectionId)
            ? (hermesConnectionId ?? undefined)
            : undefined,
        resolution: selectedImageResolution || undefined,
      },
      {
        onSuccess: data => {
          void pollRepairImageTask(
            data.taskId,
            shotNumber,
            beforeUrl,
            instruction
          );
        },
      }
    );
  }

  async function handleAcceptRepairImage(shotNumber: number) {
    const result = repairImageResultByShot[shotNumber];
    if (!result) return;
    try {
      const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
        seriesId,
        source: "url",
        url: result.afterUrl,
        mimeType: "image/png",
      });
      await setApprovedStartFrameAssetMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId: resolved.mediaAssetId,
      });
      toast.success(
        lang === "th"
          ? "เปลี่ยนเป็นภาพใหม่แล้ว"
          : "Replaced with the new image."
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เปลี่ยนภาพไม่สำเร็จ"
            : "Failed to apply the new image"
      );
      return;
    } finally {
      setRepairImageResultByShot(prev => {
        const next = { ...prev };
        delete next[shotNumber];
        return next;
      });
      setRepairImageDialogForShot(null);
    }
  }

  function handleDiscardRepairImage(shotNumber: number) {
    setRepairImageResultByShot(prev => {
      const next = { ...prev };
      delete next[shotNumber];
      return next;
    });
    setRepairImageDialogForShot(null);
    toast.success(
      lang === "th"
        ? "เก็บภาพเดิมไว้ — ภาพใหม่ยังอยู่ในประวัติ"
        : "Kept the original image — the new one stays in history."
    );
  }

  function handleCloseRepairImageDialog() {
    setRepairImageDialogForShot(null);
  }

  /* ---- Phase 6.6 — per-shot video prompt generation (`generateShotVideoPrompt`) ----
   *  Synchronous LLM call (no polling) — the LLM analyzes the shot's actual
   *  approved image. Refetches `getEpisodeDetail` on success so the video
   *  prompt box + dialogue lines reflect the server-persisted result. */
  const [
    generatingShotVideoPromptForShot,
    setGeneratingShotVideoPromptForShot,
  ] = useState<Set<number>>(new Set());
  const [usedVisionByShot, setUsedVisionByShot] = useState<
    Record<number, boolean>
  >({});

  const generateShotVideoPromptMutation =
    trpc.verticalDramaEpisodes.generateShotVideoPrompt.useMutation({
      onError: (err, variables) => {
        if (err.data?.code === "PRECONDITION_FAILED") {
          toast.error(
            lang === "th"
              ? "ต้องมีภาพหลักของช็อตก่อน"
              : "This shot needs an approved image first."
          );
          return;
        }
        toast.error(err.message);
      },
      onSettled: (_data, _err, variables) => {
        setGeneratingShotVideoPromptForShot(prev => {
          const next = new Set(prev);
          next.delete(variables.shotNumber);
          return next;
        });
      },
    });

  function handleGenerateShotVideoPrompt(shotNumber: number) {
    if (!requireModelSelectedOrToast("video")) return;
    setGeneratingShotVideoPromptForShot(prev => new Set(prev).add(shotNumber));
    generateShotVideoPromptMutation.mutate(
      {
        seriesId,
        episodeId,
        shotNumber,
        idempotencyKey: crypto.randomUUID(),
        // Task #36 — rides the current toggle state into the generate
        // call; the server re-gates this against the F131AC rollout flag
        // + the selected model's `supportsNativeAudio` capability, so this
        // is safe to always send.
        nativeAudioEnabled,
      },
      {
        onSuccess: data => {
          setUsedVisionByShot(prev => ({
            ...prev,
            [shotNumber]: data.usedVision,
          }));
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
        },
      }
    );
  }

  /* ---- 2026-07-07 unusable-dialogue fix — `regenerateClipDialogue` ----
   *  Writes a FRESH 2-4 line dialogue for one shot (OVERWRITES whatever
   *  dialogue currently exists on the matching clip, including a broken
   *  script-fallback fragment). If the clip already has a generated video
   *  prompt, offers a one-click follow-up action to regenerate that prompt
   *  too so it stays in sync with the new dialogue (via
   *  `handleGenerateShotVideoPrompt`, unchanged). */
  const [regeneratingDialogueForShot, setRegeneratingDialogueForShot] =
    useState<Set<number>>(new Set());

  const regenerateClipDialogueMutation =
    trpc.verticalDramaEpisodes.regenerateClipDialogue.useMutation({
      onError: err => toast.error(err.message),
      onSettled: (_data, _err, variables) => {
        setRegeneratingDialogueForShot(prev => {
          const next = new Set(prev);
          next.delete(variables.shotNumber);
          return next;
        });
      },
    });

  function handleRegenerateClipDialogue(
    shotNumber: number,
    instruction: string
  ) {
    setRegeneratingDialogueForShot(prev => new Set(prev).add(shotNumber));
    regenerateClipDialogueMutation.mutate(
      {
        seriesId,
        episodeId,
        shotNumber,
        instruction: instruction || undefined,
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: data => {
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();

          const pack = episodeDetailQuery.data?.motionPromptPack;
          const matchingClip = pack?.clips?.find(c =>
            c.sourceShotNumbers?.includes(shotNumber)
          );
          const hasExistingVideoPrompt = Boolean(matchingClip?.prompt?.trim());

          // Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
          // — `data.synced` is true only when the backend took the sync-only
          // path (canonical Overview-page dialogue existed, no LLM call was
          // made) rather than actually generating new dialogue.
          const successMessage = data?.synced
            ? lang === "th"
              ? "อัปเดตจากหน้าภาพรวมแล้ว"
              : "Synced from the Overview page."
            : lang === "th"
              ? "สร้างบทพูดใหม่แล้ว"
              : "New dialogue generated.";
          if (hasExistingVideoPrompt) {
            toast.success(successMessage, {
              description:
                lang === "th"
                  ? "อัปเดตพรอมต์วิดีโอให้ตรงบทใหม่ไหม?"
                  : "Update the video prompt to match the new dialogue?",
              action: {
                label:
                  lang === "th" ? "อัปเดตพรอมต์วิดีโอ" : "Update video prompt",
                onClick: () => handleGenerateShotVideoPrompt(shotNumber),
              },
            });
          } else {
            toast.success(successMessage);
          }
        },
      }
    );
  }

  // `storyboardReviewId` is cast defensively: the `getEpisodeDetail` procedure
  // is gaining this field from a parallel backend change (contract: string |
  // null once the create_storyboard_review_project stage has actually run).
  // The cast target's property is optional, so it type-checks against the
  // procedure's return shape both before and after that field lands.
  const storyboardReviewId =
    (
      episodeDetailQuery.data as
        | { storyboardReviewId?: string | null }
        | undefined
    )?.storyboardReviewId ?? null;
  const storyboardArtifactProvenance = (
    episodeDetailQuery.data as
      | {
          artifactProvenance?: {
            startFramePlan?: "current" | "stale" | "unknown";
            motionPromptPack?: "current" | "stale" | "unknown";
            assemblyManifest?: "current" | "stale" | "unknown";
          };
        }
      | undefined
  )?.artifactProvenance;
  const hasStaleStoryboardArtifacts = Object.values(
    storyboardArtifactProvenance ?? {},
  ).some(status => status === "stale");

  // Set right before triggering a real run of `create_storyboard_review_project`
  // when no review project exists yet; cleared once the id shows up (via the
  // effect below) or the run fails — drives the auto-navigate-once-ready flow.
  const [awaitingStoryboardReviewNav, setAwaitingStoryboardReviewNav] =
    useState(false);

  useEffect(() => {
    if (!awaitingStoryboardReviewNav || !storyboardReviewId) return;
    setAwaitingStoryboardReviewNav(false);
    setLocation(`/storyboard-review/${storyboardReviewId}`);
  }, [awaitingStoryboardReviewNav, storyboardReviewId, setLocation]);

  if (seriesQuery.isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent
          role="alert"
          className="flex flex-col items-center gap-3 py-10 text-center"
        >
          <p className="text-sm text-muted-foreground">
            {seriesQuery.error?.message ??
              pickCopy(lang, verticalDramaCopy.errorTitle)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    // Tablet-portrait fix (main content + media panel layout): the media
    // panel becomes a right-side column starting at `md` (768px) — matching
    // `ResizableCollapsiblePanel`'s own `breakpoint="md"` below — instead of
    // waiting until `xl` (1280px), which used to stack the panel below the
    // storyboard on portrait tablets (~768-1024px) even though there's
    // plenty of horizontal room for a ~300px column there.
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-4">
        <SeriesLookLockStatusChip
          lang={lang}
          bible={seriesQuery.data?.series?.bible}
          lookLockEnabled={seriesLookLockEnabled}
          presetMixEnabled={presetMixV2Enabled}
        />
        {hasStaleStoryboardArtifacts ? (
          <Card className="border-amber-500/50" role="status" aria-live="polite">
            <CardContent className="py-3 text-sm">
              {lang === "th"
                ? "สตอรี่บอร์ดถูกแก้ไขแล้ว พรอมต์/ภาพ/วิดีโอเดิมยังถูกเก็บไว้เพื่ออ้างอิง แต่ต้องสร้างส่วนที่ล้าสมัยใหม่ก่อนเริ่มงานที่มีค่าใช้จ่าย"
                : "The storyboard changed. Existing prompts and media are preserved for reference, but stale items must be regenerated before paid generation."}
            </CardContent>
          </Card>
        ) : null}
        <VerticalDramaEpisodeWorkspace
          locale={lang}
          loading={seriesQuery.isLoading}
          episode={episode}
          stageStates={stageStates}
          completed={completed}
          approvalBarState={approveMutation.isPending ? "approving" : "idle"}
          runs={runs}
          runsLoading={runsQuery.isLoading}
          memory={{
            events: memoryQuery.data?.events ?? [],
            loading: memoryQuery.isLoading,
            kindFilter: memoryKind,
            episodeFilter: memoryEpisode,
            onKindFilterChange: setMemoryKind,
            onEpisodeFilterChange: setMemoryEpisode,
            retconDecisionState: decidingRetconId
              ? { [decidingRetconId]: "deciding" }
              : {},
            onApproveRetcon: id => {
              setDecidingRetconId(id);
              approveRetconMutation.mutate(
                { seriesId, proposalEventId: id },
                { onSettled: () => setDecidingRetconId(null) }
              );
            },
            onRejectRetcon: id => {
              setDecidingRetconId(id);
              rejectRetconMutation.mutate(
                { seriesId, proposalEventId: id },
                { onSettled: () => setDecidingRetconId(null) }
              );
            },
          }}
          onCreateEpisode={() => createEpisodeMutation.mutate({ seriesId })}
          onPrimaryCta={({ stage, nextAction }) => {
            if (nextAction === "open_storyboard_review") {
              if (storyboardReviewId) {
                // Review project already exists (e.g. revisiting this stage) —
                // navigate straight there, do not re-run the stage.
                setLocation(`/storyboard-review/${storyboardReviewId}`);
                return;
              }
              // Not created yet: run for real (this stage is free/uncredited,
              // no confirm-before-spend gate needed) and auto-navigate once
              // `getEpisodeDetail` refetches with a non-null storyboardReviewId.
              setAwaitingStoryboardReviewNav(true);
              runStageMutation.mutate(
                { seriesId, episodeId, stage, mode: "full" },
                { onError: () => setAwaitingStoryboardReviewNav(false) }
              );
              return;
            }
            if (
              stage === "update_character_visual_bible" ||
              stage === "generate_or_import_character_refs"
            ) {
              // Free (a DB sync, no LLM/credit cost — see
              // `syncCharacterVisualBible`, reused by both stages), so no
              // confirm-before-spend gate needed, same as
              // `open_storyboard_review` above. Always run in "full" mode so
              // `runStage` reports the ACTUAL character-reference readiness
              // (real character reference generation happens in the character
              // tab, not here) instead of leaving the always-empty dry-run
              // placeholder in place — that placeholder never reflecting real
              // state is exactly what prompted the "what's this test button
              // even for" complaint.
              runStageMutation.mutate({
                seriesId,
                episodeId,
                stage,
                mode: "full",
              });
              return;
            }
            runStageMutation.mutate({
              seriesId,
              episodeId,
              stage,
              mode: "dry_run",
            });
          }}
          onGenerateRealScript={() =>
            runStageMutation.mutate({
              seriesId,
              episodeId,
              stage: "plan_episode_script",
              mode: "full",
            })
          }
          generatingRealScript={
            runStageMutation.isPending &&
            runStageMutation.variables?.stage === "plan_episode_script" &&
            runStageMutation.variables?.mode === "full"
          }
          onGenerateEpisodeStoryboard={handleGenerateEpisodeStoryboard}
          generatingEpisodeStage={generatingEpisodeStage}
          generateEpisodeFailure={generateEpisodeFailure}
          onApprove={checkpointId => {
            if (checkpointId) {
              approveMutation.mutate({
                seriesId,
                episodeId,
                checkpointId,
                decision: "approve",
              });
            }
          }}
          onReject={checkpointId => {
            if (checkpointId) {
              approveMutation.mutate({
                seriesId,
                episodeId,
                checkpointId,
                decision: "reject",
              });
            }
          }}
          onRepair={stage => openRepair(stage)}
          onRegenerateStage={stage =>
            regenerateStageMutation.mutate({ seriesId, episodeId, stage })
          }
          regeneratingStage={
            regenerateStageMutation.isPending
              ? (regenerateStageMutation.variables?.stage ?? null)
              : // Bug #127 (regenerate path) — same gap as
                // `storyboardPanel.generating` below: for `storyboard_shotgrid`
                // the mutation itself now resolves near-instantly while the
                // real generation runs in a background job, so
                // `regenerateStageMutation.isPending` alone would flip this
                // back to `null` right as the job is just starting — making
                // the "Regenerate storyboard" button's own disabled/spinner
                // state (`regeneratingStoryboard` in
                // `VerticalDramaEpisodeWorkspace.tsx`) look like the
                // regenerate finished instantly. `pollingStoryboardShotgrid`
                // stays true for the WHOLE background job regardless of
                // which of the three call sites (run / regenerate / panel
                // button) started it — reusing it here also correctly keeps
                // the regenerate button disabled if a plain "generate" run
                // is already in flight for the same stage (only one can run
                // at a time server-side).
                pollingStoryboardShotgrid
                ? "storyboard_shotgrid"
                : null
          }
          onOpenRun={run => setLocation(run.artifactLedgerHref)}
          onOpenStageDetail={stage => setStageDetailStage(stage)}
          stageRunDetail={{
            runs: assemblyRuns,
            detail: runDetailQuery.data ?? null,
            selectedRunId,
            onSelectRun: setSelectedRunId,
            loading:
              assemblyRunsQuery.isLoading ||
              (Boolean(selectedRunId) && runDetailQuery.isLoading),
            error:
              assemblyRunsQuery.error?.message ??
              runDetailQuery.error?.message ??
              null,
          }}
          dialogueAudioPanel={{
            plan: episodeDetailQuery.data?.dialogueAudioPlan as
              | VerticalDramaDialogueAudioPlan
              | null
              | undefined,
            loading: episodeDetailQuery.isLoading || runStageMutation.isPending,
            error: episodeDetailQuery.error?.message ?? null,
            onGenerate: () =>
              runStageMutation.mutate({
                seriesId,
                episodeId,
                stage: "dialogue_audio_plan",
                mode: "dry_run",
              }),
            batch: dialogueAudioBatchData,
          }}
          storyboardPanel={{
            seriesId,
            episodeNumber: episode?.episodeNumber,
            storyboard: episodeDetailQuery.data?.storyboard as
              | VerticalDramaStoryboardView
              | null
              | undefined,
            startFramePlan: episodeDetailQuery.data?.startFramePlan as
              | VerticalDramaStartFramePlanView
              | null
              | undefined,
            motionPromptPack: episodeDetailQuery.data?.motionPromptPack as
              | VerticalDramaMotionPromptPackView
              | null
              | undefined,
            canonicalShotDrafts:
              episodeDetailQuery.data?.episodePlan?.shotDrafts,
            assetUrls: episodeDetailQuery.data?.assetUrls as
              | VerticalDramaAssetUrlMap
              | undefined,
            loading: episodeDetailQuery.isLoading,
            error: episodeDetailQuery.error?.message ?? null,
            // Bug #127 — the mutation itself now resolves almost instantly
            // (real generation moved to a background job), so
            // `runStageMutation.isPending` alone would flip back to `false`
            // right as the actual work is just starting. OR in
            // `pollingStoryboardShotgrid`, set/cleared by the shared poll
            // (kicked off automatically by `runStageMutation.onSuccess`
            // above once it sees this stage's `status: "queued"`), so the
            // spinner stays up for the whole background job.
            generating:
              (runStageMutation.isPending &&
                runStageMutation.variables?.stage === "storyboard_shotgrid") ||
              pollingStoryboardShotgrid,
            onGenerateReal: () =>
              // Fire-and-forget, same as before this fix — the shared
              // `runStageMutation.onSuccess` above owns starting/joining the
              // poll and reporting the eventual toast/invalidate; no need to
              // await or duplicate that logic here.
              runStageMutation.mutate({
                seriesId,
                episodeId,
                stage: "storyboard_shotgrid",
                mode: "full",
              }),
            onEditVideoPrompt: (
              shotNumber,
              clipNumber,
              subShotNumber,
              _currentPrompt,
              shotImageUrl
            ) => {
              setVideoPromptAiEditTarget({
                shotNumber,
                clipNumber,
                subShotNumber,
                shotImageUrl,
              });
              setVideoPromptAiEditJobStatus("idle");
              setVideoPromptAiEditError(undefined);
            },
            onChangeStartFrame: shotNumber =>
              setImageSwapTarget({ type: "startFrame", shotNumber }),
            onGenerateStartFramePlan: () =>
              runStageMutation.mutate({
                seriesId,
                episodeId,
                stage: "start_frame_render_plan",
                mode: "full",
              }),
            generatingStartFramePlan:
              runStageMutation.isPending &&
              runStageMutation.variables?.stage === "start_frame_render_plan",
            onEditStartFramePrompt: (shotNumber, currentPrompt, shotImageUrl) => {
              setImagePromptAiEditTarget({
                shotNumber,
                currentPrompt,
                shotImageUrl,
              });
              setImagePromptAiEditJobStatus("idle");
              setImagePromptAiEditError(undefined);
            },
            onGenerateVideoPromptPack: handleGenerateVideoPromptPack,
            generatingVideoPromptPack,
            onRepairMissingShotCharacters: handleRepairMissingShotCharacters,
            repairingMissingShotCharacters:
              repairShotCharacterReferencesMutation.isPending,
            onGenerateStartFrameImage: shotNumber => {
              // Render-only: reuse the shot's existing (possibly manually
              // edited) prompt as-is; do NOT re-author it from the synopsis.
              void handleGeneratePromptAndImage(shotNumber, "single", false);
            },
            generatingStartFrameImageForShot: pollingStartFrameShots,
            onGenerateAllStartFrameImages: (shotNumbers: number[]) => {
              if (!requireModelSelectedOrToast("image")) return;
              if (!requireMcpConnectionOrToast("image")) return;
              if (!requireHermesConnectionOrToast("image")) return;
              setPollingStartFrameShots(prev => {
                const next = new Set(prev);
                shotNumbers.forEach(n => next.add(n));
                return next;
              });
              const sceneContinuityEnabled =
                episodeDetailQuery.data?.flags?.sceneContinuity === true;
              if (!sceneContinuityEnabled) {
                void Promise.all(
                  shotNumbers.map(shotNumber =>
                    handleGeneratePromptAndImage(shotNumber, "single")
                  )
                );
                return;
              }
              const frameOverrides = new Map<number, string>();
              for (const frame of episodeDetailQuery.data?.startFramePlan?.frames ?? []) {
                if (frame.locationKey?.trim()) {
                  frameOverrides.set(frame.shotNumber, frame.locationKey.trim());
                }
              }
              const groups = buildSceneShotGroups({
                distinctLocations: (
                  episodeDetailQuery.data?.storyboard as
                    | { distinct_locations?: unknown }
                    | null
                    | undefined
                )?.distinct_locations,
                overridesByShotNumber: frameOverrides,
              });
              const lanes = planSceneOrderedBatch({ shotNumbers, groups });
              void Promise.all(
                lanes.map(async lane => {
                  for (const shotNumber of lane) {
                    await handleGeneratePromptAndImage(
                      shotNumber,
                      "single",
                      true,
                      true,
                    );
                  }
                })
              );
            },
            characterPortraits: episodeDetailQuery.data?.characterPortraits as
              | VerticalDramaCharacterPortraitMap
              | undefined,
            episodeLocations: episodeDetailQuery.data?.episodeLocations as
              | VerticalDramaEpisodeLocationView[]
              | undefined,
            productTieInByShot,
            productImages: (productImagesQuery.data?.images ??
              []) as VerticalDramaAvailableProductImageView[],
            productImagesLoading: productImagesQuery.isLoading,
            onSaveShotProductReferences: handleSaveShotProductReferences,
            savingProductReferencesForShot,
            onChangeCharacterReference: characterId =>
              setImageSwapTarget({ type: "characterPortrait", characterId }),
            onDropCharacterReference: handleDropCharacterReference,
            onSetShotCharacterReferences: handleSetShotCharacterReferences,
            savingShotCharacterReferencesForShot,
            onSetShotLocation: handleSetShotLocation,
            sceneContinuityEnabled:
              episodeDetailQuery.data?.flags?.sceneContinuity,
            onPlanSceneVisualState: handlePlanSceneVisualState,
            planningSceneVisualStateForKey:
              planSceneVisualStateMutation.isPending
                ? (planSceneVisualStateMutation.variables?.locationKey ?? null)
                : null,
            onUpdateSceneVisualState: handleUpdateSceneVisualState,
            savingSceneVisualStateForKey:
              updateSceneVisualStateMutation.isPending
                ? (updateSceneVisualStateMutation.variables?.locationKey ?? null)
                : null,
            onDropStartFrame: handleDropStartFrame,
            onGenerateAngleVariations: shotNumber => {
              void handleGeneratePromptAndImage(shotNumber, "angles");
            },
            generatingAngleVariationsForShot:
              pollingAngleVariationsShot ??
              (generateAngleVariationsMutation.isPending
                ? (generateAngleVariationsMutation.variables?.shotNumber ??
                  null)
                : null),
            angleVariationGridUrlByShot,
            onPickAngleVariationCandidate: handlePickAngleVariationCandidate,
            onDismissAngleVariations: handleDismissAngleVariations,
            onDeleteAngleVariationCandidate:
              handleDeleteAngleVariationCandidate,
            angleGridAssetsByShotNumber:
              episodeDetailQuery.data?.angleGridAssetsByShotNumber,
            onOpenStoredAngleGrid: handleOpenStoredAngleGrid,
            imageModels,
            videoModels,
            selectedImageModelId,
            selectedVideoModelId,
            onSelectImageModel: handleSelectImageModel,
            onSelectVideoModel: handleSelectVideoModel,
            modelsLoading:
              imageModelsQuery.isLoading || videoModelsQuery.isLoading,
            mcpConnectionId,
            onSelectMcpConnection: handleSelectMcpConnection,
            mcpSharedGroupId,
            onSelectMcpSharedGroup: setMcpSharedGroupId,
            hermesConnectionId,
            onHermesConnectionChange: handleSelectHermesConnection,
            selectedImageResolution,
            selectedVideoResolution,
            onSelectImageResolution: handleSelectImageResolution,
            onSelectVideoResolution: handleSelectVideoResolution,
            selectedImagePromptLanguage,
            selectedVideoPromptLanguage,
            selectedDialogueLanguage,
            onSelectImagePromptLanguage: handleSelectImagePromptLanguage,
            onSelectVideoPromptLanguage: handleSelectVideoPromptLanguage,
            onSelectDialogueLanguage: handleSelectDialogueLanguage,
            selectedThaiAccent,
            onSelectThaiAccent: handleSelectThaiAccent,
            imagePromptMode: selectedImagePromptMode,
            onSelectImagePromptMode: handleSelectImagePromptMode,
            // Task #36 — `onSelectNativeAudioEnabled` is wired ONLY while
            // the F131AC rollout flag is on (`nativeAudioPromptsEnabled`);
            // omitting the callback while pending keeps the panel's toggle
            // invisible end-to-end, exactly like every other optional
            // selector in this bag that the caller doesn't wire.
            nativeAudioEnabled,
            onSelectNativeAudioEnabled: setNativeAudioEnabledOverride,
            shotReferencesByShot,
            onAddShotReference: handleAddShotReference,
            onRemoveShotReference: handleRemoveShotReference,
            addingShotReferenceForShot,
            onUseShotReferenceAsMain: handleUseShotReferenceAsMain,
            usingShotReferenceAsMainForShot,
            onGenerateReferenceFramePrompt: handleGenerateReferenceFramePrompt,
            generatingReferenceFramePromptForShot,
            onGenerateReferenceFrameImage: handleGenerateReferenceFrameImage,
            generatingReferenceFrameImageForShot: pollingReferenceFrameShots,
            onSaveClipDialogue: handleSaveClipDialogue,
            savingDialogueForClip,
            onRegenerateClipDialogue: handleRegenerateClipDialogue,
            regeneratingDialogueForShot,
            onGenerateVideoClip: clipNumber => {
              if (!requireModelSelectedOrToast("video")) return;
              if (!requireMcpConnectionOrToast("video")) return;
              if (!requireHermesConnectionOrToast("video")) return;
              generateVideoClipMutation.mutate({
                seriesId,
                episodeId,
                clipNumber,
                idempotencyKey: crypto.randomUUID(),
                mcpConnectionId: videoModelUsesMcp
                  ? (mcpConnectionId ?? undefined)
                  : undefined,
                sharedGroupId: videoModelUsesMcp && mcpConnectionId
                  ? (mcpSharedGroupId ?? undefined)
                  : undefined,
                hermesConnectionId:
                  videoModelUsesHermes && !(videoModelUsesMcp && mcpConnectionId)
                    ? (hermesConnectionId ?? undefined)
                    : undefined,
                resolution: selectedVideoResolution || undefined,
              });
            },
            generatingVideoClipForClip: pollingVideoClips,
            ttsFallbackByClip,
            trimmedReferenceCountByClip,
            onUploadVideoClip: handleUploadVideoClip,
            uploadingVideoClipForClip,
            onSaveStartFramePrompt: handleSaveStartFramePrompt,
            onSaveVideoPrompt: handleSaveVideoPrompt,
            onGeneratePromptAndImage: handleGeneratePromptAndImage,
            generatingPromptAndImageForShot: pollingStartFrameShots,
            qualityReview: episodeDetailQuery.data?.qualityReview ?? null,
            onRunQualityReview: () =>
              runQualityReviewMutation.mutate({
                seriesId,
                episodeId,
                idempotencyKey: crypto.randomUUID(),
              }),
            runningQualityReview: runQualityReviewMutation.isPending,
            onCopySuggestedFix: handleCopySuggestedFix,
            onApplyQualityReviewSuggestions:
              handleApplyQualityReviewSuggestions,
            applyingQualityReviewSuggestions:
              applyQualityReviewSuggestionsMutation.isPending,
            onRequestAlternativeQualityReview:
              handleRequestAlternativeQualityReview,
            requestingAlternativeQualityReview:
              requestAlternativeQualityReviewMutation.isPending,
            onSummarizeEpisodeToMemory: handleSummarizeEpisodeToMemory,
            summarizingEpisodeToMemory:
              summarizeEpisodeToMemoryMutation.isPending,
            episodeAlreadySummarizedToMemory,
            onSubmitRepairImage: handleSubmitRepairImage,
            repairImageSubmittingForShot,
            repairImageResultByShot,
            repairImageErrorByShot,
            onAcceptRepairImage: handleAcceptRepairImage,
            onDiscardRepairImage: handleDiscardRepairImage,
            repairImageDialogForShot,
            onOpenRepairImageDialog: setRepairImageDialogForShot,
            onCloseRepairImageDialog: handleCloseRepairImageDialog,
            onGenerateShotVideoPrompt: handleGenerateShotVideoPrompt,
            generatingShotVideoPromptForShot,
            usedVisionByShot,
            compiledVideo,
            onAssembleCompiledVideo: handleAssembleCompiledVideo,
            assemblingCompiledVideo: assembleEpisodeVideoMutation.isPending,
            // Wave-5A (2026-07-07 production-grade upgrade) — density meter,
            // quality-loop v2, tie-in QC. Every flag/value below is sourced
            // straight from `getEpisodeDetail`'s flag-gated payload (never a
            // client-side default) — while a flag is off, the corresponding
            // field here is `undefined`/`false`/`null`, and
            // `VerticalDramaStoryboardPanel`'s own gating renders nothing.
            speechBudgetEnabled: episodeDetailQuery.data?.flags?.speechBudget,
            onRepairWholeEpisodeScript: () => openRepair("plan_episode_script"),
            qualityLoopV2Enabled: episodeDetailQuery.data?.flags?.qualityLoopV2,
            tieInQcEnabled: episodeDetailQuery.data?.flags?.tieInQc,
            qualityPolicy: episodeDetailQuery.data?.qualityPolicyResolved as
              | VerticalDramaQualityPolicyView
              | null
              | undefined,
            qualityLoopState: episodeDetailQuery.data
              ?.latestQualityLoopState as
              | VerticalDramaQualityLoopStateView
              | null
              | undefined,
            onRunQualityImproveLoop: handleRunQualityImproveLoop,
            runningQualityImproveLoop: runQualityImproveLoopMutation.isPending,
            tieInEnabled,
            tieInQualityReport: episodeDetailQuery.data?.tieInQualityReport as
              | VerticalDramaTieInReportView
              | null
              | undefined,
            onDeferTieIn: handleDeferEpisodeTieIn,
            deferringTieIn: deferEpisodeTieInMutation.isPending,
            tieInDeferScheduleAtRisk,
            // Task #31 (spec §7.7.2/§7.7.3) — season-plan status line, see
            // `VerticalDramaTieInReportCard`'s own prop doc comment.
            seasonTieInPlacement: episodeDetailQuery.data
              ?.seasonTieInPlacement as
              | VerticalDramaSeasonTieInPlacementView
              | null
              | undefined,
          }}
          adBannerOverlayEnabled={adBannerOverlayEnabled}
          adBannerPlanPanel={adBannerPlanPanelData}
          textOverlaySuiteEnabled={textOverlaySuiteEnabled}
          textOverlayPlanPanel={textOverlayPlanPanelData}
          textOverlayShotNumbers={textOverlayShotNumbers}
          voiceChainEnabled={voiceChainFlagEnabled}
          finalRenderOptionsPanel={{
            value: finalRenderOptions,
            onChange: setFinalRenderOptions,
            lastResult: finalRenderLastResult,
          }}
          scriptSummary={(() => {
            const script = episodeDetailQuery.data?.script as
              | { episode_title?: string; hook?: string }
              | null
              | undefined;
            // "Dry-run hook" is the exact placeholder string `buildStagePayload`
            // uses (verticalDramaEpisodePipeline.ts) — a simple, reliable way
            // to tell real generated content apart from the free placeholder
            // without needing a separate "isReal" flag on the episode row.
            if (!script?.episode_title || script.hook === "Dry-run hook")
              return null;
            return {
              episodeTitle: script.episode_title,
              hook: script.hook ?? "",
            };
          })()}
          storyboardReviewId={storyboardReviewId}
          onOpenStoryboardReview={() =>
            storyboardReviewId &&
            setLocation(`/storyboard-review/${storyboardReviewId}`)
          }
          // Wave-5A (2026-07-07 production-grade upgrade) Production Wizard —
          // sourced verbatim from `getEpisodeDetail.wizard` /
          // `.flags.productionWizard`; `null`/`false` while the flag is off or
          // the episode detail hasn't loaded yet, which renders no wizard UI.
          wizard={
            episodeDetailQuery.data?.wizard as
              | VerticalDramaProductionWizardState
              | null
              | undefined
          }
          productionWizardEnabled={Boolean(
            episodeDetailQuery.data?.flags?.productionWizard
          )}
          seriesId={seriesId}
          // 2026-07-08 W9-C wiring — sourced verbatim from
          // `getEpisodeDetail.perShotDialoguePreview` (W9-A); `null` while the
          // wizard flag is off, `undefined` while the episode detail hasn't
          // loaded yet, both of which render no dialogue-preview section
          // (mirrors `wizard`'s own convention above).
          perShotDialoguePreview={
            episodeDetailQuery.data?.perShotDialoguePreview
          }
          // Part A2 (planning/`polished-toasting-gadget.md`) — read-only
          // Episode Plan panel (ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง),
          // sourced verbatim from `getEpisodeDetail.episodePlan`, replacing
          // the Production Wizard mount above. Rendered unconditionally by
          // the workspace (no flag gate) — `undefined`/`null` both render
          // that panel's own empty state.
          episodePlan={episodeDetailQuery.data?.episodePlan ?? null}
          // Task #26 (data sanity — episode number beyond the planned season
          // size) — sourced from the SEPARATE `episodeBreakdownStatusQuery`
          // (not `episodeDetailQuery`, see that hook's own doc comment).
          // `undefined` while it hasn't loaded yet, which renders no banner.
          breakdownStatus={episodeBreakdownStatusQuery.data?.breakdownStatus}
          plannedEpisodeCount={
            episodeBreakdownStatusQuery.data?.plannedEpisodeCount
          }
          seasonPlanTabHref={`${verticalDramaRoutes.seriesDetail(seriesId)}?tab=overview`}
        />

        {/* Video prompt AI-edit dialog — opened from "ให้ AI ปรับ" on a video
             prompt box (InlineEditablePromptBox's onAiAdjust handler), wired
             directly into generateShotVideoPromptMutation with an instruction
             and optional reference image URLs. Separate from the generic
             RepairDialog so it can surface example chips + image attachment. */}
        <VideoPromptAiEditDialog
          locale={lang}
          open={videoPromptAiEditTarget != null}
          onOpenChange={open => {
            if (!open) setVideoPromptAiEditTarget(null);
          }}
          shotLabel={
            videoPromptAiEditTarget
              ? lang === "th"
                ? `ช็อต ${videoPromptAiEditTarget.shotNumber}`
                : `Shot ${videoPromptAiEditTarget.shotNumber}`
              : undefined
          }
          shotImageUrl={videoPromptAiEditTarget?.shotImageUrl}
          jobStatus={videoPromptAiEditJobStatus}
          errorReason={videoPromptAiEditError}
          onSubmit={({ instruction, attachShotImage }) => {
            const target = videoPromptAiEditTarget;
            if (!target) return;
            if (!requireModelSelectedOrToast("video")) return;
            setVideoPromptAiEditJobStatus("submitting");
            setVideoPromptAiEditError(undefined);
            generateShotVideoPromptMutation.mutate(
              {
                seriesId,
                episodeId,
                shotNumber: target.shotNumber,
                instruction,
                attachShotImage,
                idempotencyKey: crypto.randomUUID(),
              },
              {
                onSuccess: data => {
                  setUsedVisionByShot(prev => ({
                    ...prev,
                    [target.shotNumber]: data.usedVision,
                  }));
                  setVideoPromptAiEditJobStatus("succeeded");
                  void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
                  // Close dialog automatically after a short success delay
                  setTimeout(() => setVideoPromptAiEditTarget(null), 1200);
                },
                onError: err => {
                  setVideoPromptAiEditJobStatus("failed");
                  setVideoPromptAiEditError(err.message);
                },
              }
            );
          }}
        />

        {/* Start-frame image prompt AI-edit dialog — opened when the user
             clicks "ให้ AI ปรับ" on a start frame prompt box. */}
        <ImagePromptAiEditDialog
          locale={lang}
          open={imagePromptAiEditTarget != null}
          onOpenChange={open => {
            if (!open) setImagePromptAiEditTarget(null);
          }}
          shotLabel={
            imagePromptAiEditTarget
              ? lang === "th"
                ? `ช็อต ${imagePromptAiEditTarget.shotNumber}`
                : `Shot ${imagePromptAiEditTarget.shotNumber}`
              : undefined
          }
          currentPrompt={imagePromptAiEditTarget?.currentPrompt}
          shotImageUrl={imagePromptAiEditTarget?.shotImageUrl}
          jobStatus={imagePromptAiEditJobStatus}
          errorReason={imagePromptAiEditError}
          onSubmit={({ instruction, attachShotImage }) => {
            const target = imagePromptAiEditTarget;
            if (!target) return;
            if (!requireModelSelectedOrToast("image")) return;
            setImagePromptAiEditJobStatus("submitting");
            setImagePromptAiEditError(undefined);
            generateShotStartFramePromptMutation.mutate(
              {
                seriesId,
                episodeId,
                shotNumber: target.shotNumber,
                instruction,
                attachShotImage,
                idempotencyKey: crypto.randomUUID(),
              },
              {
                onSuccess: data => {
                  if ("usedVision" in data && typeof data.usedVision === "boolean") {
                    setUsedVisionByShot(prev => ({
                      ...prev,
                      [target.shotNumber]: data.usedVision,
                    }));
                  }
                  setImagePromptAiEditJobStatus("succeeded");
                  void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
                  setTimeout(() => setImagePromptAiEditTarget(null), 1200);
                },
                onError: err => {
                  setImagePromptAiEditJobStatus("failed");
                  setImagePromptAiEditError(err.message);
                },
              }
            );
          }}
        />

        {/* Repair instruction capture — entered from the approval bar / failed stage. */}
        <VerticalDramaRepairDialog
          locale={lang}
          open={repairStage != null}
          onOpenChange={open => {
            if (!open) setRepairStage(null);
          }}
          stage={repairStage ?? "plan_episode_script"}
          target={repairTarget}
          templateInstruction={repairTemplate}
          jobStatus={
            // Extended for Fix A/B (planning/`polished-toasting-gadget.md`)
            // — the two per-shot stages that now bypass `repairMutation`
            // still need this dialog's spinner to reflect THEIR mutation's
            // pending state while in flight.
            repairMutation.isPending ||
            generateShotStartFramePromptMutation.isPending ||
            generateShotVideoPromptMutation.isPending
              ? "submitting"
              : repairJobStatus
          }
          resultArtifactId={repairResultArtifactId}
          errorReason={repairError}
          onSubmit={({ instruction, target }) => {
            if (!repairStage) return;
            setRepairJobStatus("submitting");
            setRepairError(undefined);
            setRepairResultArtifactId(undefined);
            // planning/`polished-toasting-gadget.md` Fix A/B — these two
            // stages bypass the generic `repairMutation` entirely (its
            // `repairStage` dispatcher has no real regeneration branch for
            // either one, see that mutation's own doc comment above) and
            // call their own dedicated per-shot procedures instead. Every
            // other stage keeps calling `repairMutation` exactly as before
            // this fix.
            if (repairStage === "start_frame_render_plan") {
              const shotNumber = target?.parentShotNumber;
              if (shotNumber == null) return;
              if (!requireModelSelectedOrToast("image")) return;
              generateShotStartFramePromptMutation.mutate({
                seriesId,
                episodeId,
                shotNumber,
                instruction,
                idempotencyKey: crypto.randomUUID(),
              });
              return;
            }
            if (repairStage === "video_motion_prompt_pack") {
              const shotNumber = target?.parentShotNumber;
              if (shotNumber == null) return;
              if (!requireModelSelectedOrToast("video")) return;
              // Reuses the SAME mutation object the "สร้างพรอมต์วิดีโอ (AI)"
              // button already calls (`generateShotVideoPromptMutation`,
              // declared above near `handleGenerateShotVideoPrompt`) rather
              // than a second instance — its hook-level `onError` is
              // procedure-generic (missing-approved-image precondition, or
              // a plain fallback toast), equally valid regardless of which
              // UI entry point triggered the call, and its hook-level
              // `onSettled` only touches `generatingShotVideoPromptForShot`,
              // a Set the dialog never reads. This call-specific
              // onSuccess/onError layers the repair-dialog's own status
              // state on top (React Query runs hook-level callbacks first,
              // then these), the same per-call layering
              // `handleGenerateShotVideoPrompt` above already relies on.
              generateShotVideoPromptMutation.mutate(
                {
                  seriesId,
                  episodeId,
                  shotNumber,
                  instruction,
                  idempotencyKey: crypto.randomUUID(),
                },
                {
                  onSuccess: data => {
                    setUsedVisionByShot(prev => ({
                      ...prev,
                      [shotNumber]: data.usedVision,
                    }));
                    setRepairJobStatus("succeeded");
                    void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
                  },
                  onError: err => {
                    setRepairJobStatus("failed");
                    setRepairError(err.message);
                  },
                }
              );
              return;
            }
            repairMutation.mutate({
              seriesId,
              episodeId,
              stage: repairStage,
              instruction,
              target,
            });
          }}
        />
      </div>

      {/* Persistent right-side media panel — Media History/Library/Grid-cutter,
        ALWAYS mounted and always usable (2026-07-05 fix: previously only
        rendered content once a shot's "Change image" or a
        character-reference chip set `imageSwapTarget` — this made the
        History/Library tabs unreachable from the storyboard view except via
        that click-through). Two modes, same underlying panel component:
        - No `imageSwapTarget` ("browse" mode): History/Library/Cutter tabs
          are usable via DRAG-AND-DROP onto a shot's image or its reference
          strip (both existing drop targets already accept "history" /
          "library" / "grid_cut" sources) — click-to-link affordances are
          hidden since there's no explicit target to resolve onto.
        - `imageSwapTarget` set (a shot's "Change image" / a character chip):
          click-to-link works too, same as before.
        Collapsible + resizable via the shared `ResizableCollapsiblePanel`
        (same component/convention already used by `StoryboardReviewPage.tsx`'s
        own right panel). */}
      <ResizableCollapsiblePanel
        side="right"
        breakpoint="md"
        collapsed={isRightPanelCollapsed}
        onCollapsedChange={setIsRightPanelCollapsed}
        width={rightPanelWidth}
        onWidthChange={setRightPanelWidth}
        minWidth={EPISODE_RIGHT_PANEL_MIN_WIDTH}
        maxWidth={EPISODE_RIGHT_PANEL_MAX_WIDTH}
        // Independent scrolling (2026-07-31): the media panel used to be a
        // plain grid item, so it scrolled away with the storyboard column and
        // you had to scroll back up to reach it every time you wanted to swap a
        // shot's image. `sticky` keeps it pinned in the viewport while the
        // centre column scrolls past it; `dvh` (not `vh`) so mobile browser
        // chrome collapsing does not clip it. The old `md:h-full` is
        // deliberately gone — matching the grid row's height would make it
        // exactly as tall as the storyboard and defeat the pin.
        className="max-h-[min(48rem,82dvh)] md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)]"
        collapsedContent={lang === "th" ? "สื่อ" : "Media"}
        collapseLabel={
          lang === "th" ? "ยุบ panel สื่อ" : "Collapse media panel"
        }
        expandLabel={lang === "th" ? "เปิด panel สื่อ" : "Open media panel"}
        resizeLabel={
          lang === "th" ? "ปรับขนาด panel สื่อ" : "Resize media panel"
        }
        testId="vd-episode-right-panel"
      >
        {/* `overflow-y-auto` here, not on the panel root (which stays
            `overflow-hidden` for the resize handle): the panel's OWN content
            scrolls inside the pinned frame, so a long media history is still
            fully reachable without moving the storyboard. */}
        <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2.5 sm:p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {imageSwapTarget?.type === "startFrame"
                ? lang === "th"
                  ? `เปลี่ยนภาพเฟรมเริ่มต้น — ช็อต ${imageSwapTarget.shotNumber}`
                  : `Change start frame — Shot ${imageSwapTarget.shotNumber}`
                : imageSwapTarget?.type === "characterPortrait"
                  ? lang === "th"
                    ? "เปลี่ยนภาพอ้างอิงตัวละคร"
                    : "Change character reference image"
                  : lang === "th"
                    ? "คลังภาพ / ประวัติ"
                    : "Media History / Library"}
            </h2>
            {imageSwapTarget != null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setImageSwapTarget(null)}
                data-testid="vd-episode-right-panel-clear-target"
              >
                {lang === "th" ? "ล้างเป้าหมาย" : "Clear target"}
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <VerticalDramaCharacterReferencePanel
              seriesId={seriesId}
              characterId={
                imageSwapTarget?.type === "characterPortrait"
                  ? imageSwapTarget.characterId
                  : imageSwapTarget?.type === "startFrame"
                    ? `shot-${imageSwapTarget.shotNumber}`
                    : undefined
              }
              defaultTab="history"
              isLinking={
                setApprovedStartFrameAssetMutation.isPending ||
                linkCharacterPortraitMutation.isPending
              }
              onLinkMediaAssetId={
                imageSwapTarget != null
                  ? mediaAssetId => {
                      if (imageSwapTarget.type === "startFrame") {
                        setApprovedStartFrameAssetMutation.mutate({
                          seriesId,
                          episodeId,
                          shotNumber: imageSwapTarget.shotNumber,
                          mediaAssetId,
                        });
                      } else {
                        linkCharacterPortraitMutation.mutate({
                          seriesId,
                          characterId: imageSwapTarget.characterId,
                          mediaAssetId,
                          assetType: "character_reference",
                          role: "primary_portrait",
                          source: "imported",
                        });
                      }
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </ResizableCollapsiblePanel>
    </div>
  );
}

/** Read-only past-run artifact ledger (spec §8.1 run detail). */
function RunDetailLedger({
  lang,
  runId,
}: {
  lang: VerticalDramaLang;
  runId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileClock className="h-4 w-4" aria-hidden="true" />
          {lang === "th"
            ? `บันทึกแอสเซ็ตของรอบ ${runId}`
            : `Artifact ledger for run ${runId}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>
          {lang === "th"
            ? "รายการแอสเซ็ตของรอบนี้แบบอ่านอย่างเดียว — เชื่อมโยงตรงได้และไม่ถูกซ่อน"
            : "Read-only artifact list for this run — directly linkable and never hidden."}
        </p>
      </CardContent>
    </Card>
  );
}
