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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizableCollapsiblePanel } from "@/components/ui/resizable-collapsible-panel";
import { trpc } from "@/lib/trpc";
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
} from "@/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace";
import {
  VerticalDramaRepairDialog,
  type VerticalDramaRepairJobStatus,
  type VerticalDramaRepairTarget,
} from "@/components/verticalDramaSeries/VerticalDramaRepairDialog";
import type { VerticalDramaRunRow } from "@/components/verticalDramaSeries/VerticalDramaRunsList";
import type {
  RunResult,
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
  VerticalDramaThaiAccent,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type {
  VerticalDramaAssetUrlMap,
  VerticalDramaAvailableProductImageView,
  VerticalDramaCapableModel,
  VerticalDramaCharacterPortraitMap,
  VerticalDramaClipDialogueLineView,
  VerticalDramaMotionPromptPackView,
  VerticalDramaShotReferenceView,
  VerticalDramaStartFramePlanView,
  VerticalDramaStoryboardView,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";
import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
import {
  isCharacterLockPolicyFailureMessage,
  VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
} from "@shared/verticalDramaSeries/characterLock";

// Persistent right-side reference panel (image swap) — collapsed/width state
// persisted the same way `StoryboardReviewPage.tsx`'s own right panel does,
// so behavior across the two pages feels identical.
const EPISODE_RIGHT_PANEL_WIDTH_KEY = "smartspec_vd_episode_right_panel_width_v1";
const EPISODE_RIGHT_PANEL_COLLAPSED_KEY = "smartspec_vd_episode_right_panel_collapsed_v1";
const EPISODE_RIGHT_PANEL_DEFAULT_WIDTH = 380;
const EPISODE_RIGHT_PANEL_MIN_WIDTH = 300;
const EPISODE_RIGHT_PANEL_MAX_WIDTH = 720;

function readStoredEpisodePanelWidth(): number {
  if (typeof window === "undefined") return EPISODE_RIGHT_PANEL_DEFAULT_WIDTH;
  const value = Number(window.localStorage.getItem(EPISODE_RIGHT_PANEL_WIDTH_KEY));
  if (!Number.isFinite(value)) return EPISODE_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(
    EPISODE_RIGHT_PANEL_MAX_WIDTH,
    Math.max(EPISODE_RIGHT_PANEL_MIN_WIDTH, Math.round(value))
  );
}

function readStoredEpisodePanelCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(EPISODE_RIGHT_PANEL_COLLAPSED_KEY) === "true";
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
  if (videoTask.videoUrl) return false;
  if (alreadyResumedClips.has(clipNumber)) return false;
  if (currentlyPollingClips.has(clipNumber)) return false;
  return true;
}

/** Per-series last-picked image/video model (Phase 1.3) — used only as the
 *  DEFAULT for a new episode's model selection; an episode with its own
 *  `startFramePlan.selectedImageModelId` / `motionPromptPack.selectedVideoModelId`
 *  always wins over this. Keyed by series id so different series can default
 *  to different models. */
function vdModelStorageKey(seriesId: string, kind: "image" | "video"): string {
  return `smartspec_vd_series_${seriesId}_${kind}_model`;
}

function readStoredSeriesModelDefault(
  seriesId: string,
  kind: "image" | "video"
): string {
  if (typeof window === "undefined" || !seriesId) return "";
  return window.localStorage.getItem(vdModelStorageKey(seriesId, kind)) || "";
}

function storeSeriesModelDefault(
  seriesId: string,
  kind: "image" | "video",
  modelId: string
): void {
  if (typeof window === "undefined" || !seriesId) return;
  window.localStorage.setItem(vdModelStorageKey(seriesId, kind), modelId);
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
  if (typeof window === "undefined" || !seriesId || !modelId) return "";
  return window.localStorage.getItem(vdResolutionStorageKey(seriesId, kind, modelId)) || "";
}

function storeResolution(
  seriesId: string,
  kind: "image" | "video",
  modelId: string,
  resolution: string
): void {
  if (typeof window === "undefined" || !seriesId || !modelId) return;
  if (resolution) {
    window.localStorage.setItem(vdResolutionStorageKey(seriesId, kind, modelId), resolution);
  } else {
    window.localStorage.removeItem(vdResolutionStorageKey(seriesId, kind, modelId));
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
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MCP_CONNECTION_ID_STORAGE_KEY) || null;
}

function storeMcpConnectionId(connectionId: string | null): void {
  if (typeof window === "undefined") return;
  if (connectionId) {
    window.localStorage.setItem(MCP_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    window.localStorage.removeItem(MCP_CONNECTION_ID_STORAGE_KEY);
  }
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
      href: verticalDramaRoutes.seriesDetail(seriesId),
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

  const pageTitle = isRunRoute
    ? pickCopy(lang, verticalDramaCopy.runDetailTitle)
    : `${pickCopy(lang, verticalDramaCopy.episodeCrumb)} ${episodeId}`;

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

  // Image swap target (Media History/Library picker), independent of the
  // LLM-driven repair flow above — a direct, no-cost asset pick. Either a
  // specific shot's start frame, or a specific character's global portrait
  // (triggered from a shot's character-reference chip) — same picker UI,
  // different finalize target.
  const [imageSwapTarget, setImageSwapTarget] = useState<
    { type: "startFrame"; shotNumber: number } | { type: "characterPortrait"; characterId: string } | null
  >(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(
    readStoredEpisodePanelCollapsed
  );
  const [rightPanelWidth, setRightPanelWidth] = useState(readStoredEpisodePanelWidth);
  useEffect(() => {
    window.localStorage.setItem(EPISODE_RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth));
  }, [rightPanelWidth]);
  useEffect(() => {
    window.localStorage.setItem(
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

  const runStageMutation = trpc.verticalDramaEpisodes.runStage.useMutation({
    onSuccess: data => {
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
          lang === "th" ? "ขั้นตอนสำเร็จ ไปขั้นตอนถัดไป" : "Stage complete — advancing."
        );
      }
    },
    onError: err => toast.error(err.message),
  });
  const regenerateStageMutation =
    trpc.verticalDramaEpisodes.regenerateStage.useMutation({
      onSuccess: data => {
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
  // Separate mutation instance from `repairMutation` above — the one-click
  // "generate prompt + image" flow (2026-07-05 fix) runs this SILENTLY (no
  // repair dialog shown, no free-text typing required from the user) to
  // auto-compose a missing shot's image prompt, so it must not touch the
  // repair dialog's own status state (`repairJobStatus` etc.), which only
  // reflects the dialog's own explicit submissions.
  const silentRepairMutation =
    trpc.verticalDramaEpisodes.repairStageOutput.useMutation();
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
          lang === "th" ? "เปลี่ยนภาพเฟรมเริ่มต้นแล้ว" : "Start frame image updated."
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
          lang === "th" ? "เปลี่ยนภาพอ้างอิงตัวละครแล้ว" : "Character reference image updated."
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
  const resolveMediaAssetForImportMutation =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();

  async function pollStartFrameTask(
    taskId: string,
    shotNumber: number,
    softenLevel = 0
  ) {
    setPollingStartFrameShots(prev => new Set(prev).add(shotNumber));
    try {
      // Bounded poll (5 min max at 2.5s intervals) — matches the timeout
      // discipline used for other async media polls in this codebase.
      for (let attempt = 0; attempt < 120; attempt++) {
        const task = await utils.media.getTask.fetch({ taskId });
        const status = (task as { status?: string } | null)?.status;
        if (status === "completed") {
          const resultUrl = (task as { resultUrl?: string } | null)?.resultUrl;
          if (!resultUrl) {
            toast.error(
              lang === "th" ? "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์" : "Generation completed but no result URL."
            );
            return;
          }
          const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
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
          toast.success(
            lang === "th" ? "สร้างภาพเฟรมเริ่มต้นสำเร็จ" : "Start frame image generated."
          );
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
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
            lang === "th"
              ? `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`
              : `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`
          );
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        lang === "th" ? "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง" : "Generation is taking too long — check back later."
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
        void pollStartFrameTask(data.taskId, variables.shotNumber, variables.softenLevel ?? 0);
      },
      onError: err => toast.error(err.message),
    });

  // Multi-angle (3x3 grid) generation — submit + poll like start-frame
  // images, but the result is a single grid URL the panel splits
  // client-side into 9 candidates for the user to pick from (not
  // auto-finalized), so no `setApprovedStartFrameAsset` call here.
  const [pollingAngleVariationsShot, setPollingAngleVariationsShot] =
    useState<number | null>(null);
  const [angleVariationGridUrlByShot, setAngleVariationGridUrlByShot] =
    useState<Record<number, string>>({});
  const angleVariationUploadMutation = trpc.ai.upload.useMutation();

  /** Shot numbers with an angle-variations task currently being polled (live
   *  submit OR resumed-on-load) — guards against double-polling the same
   *  shot from both paths (2026-07-06 orphaned-task fix), same ref-guard
   *  convention as `splitInFlightShotsRef` in the storyboard panel. */
  const angleVariationsPollInFlightRef = useRef<Set<number>>(new Set());

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
    setAngleVariationGridUrlByShot(prev => ({ ...prev, [shotNumber]: resultUrl }));
    persistedAngleGridUrlByShotRef.current[shotNumber] = resultUrl;
    persistAngleGrid(shotNumber, {
      imageUrl: resultUrl,
      mediaTaskId: taskId,
      dismissedIndexes,
    });
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
              lang === "th" ? "สร้างภาพสำเร็จแต่ไม่พบ URL ผลลัพธ์" : "Generation completed but no result URL."
            );
            persistAngleGrid(shotNumber, null);
            return;
          }
          resolveCompletedAngleVariationsTask(shotNumber, resultUrl, taskId, dismissedIndexes);
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
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
            setPollingAngleVariationsShot(current => (current === shotNumber ? null : current));
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
            lang === "th"
              ? `สร้างภาพล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`
              : `Generation failed${errorMessage ? `: ${errorMessage}` : ""}`
          );
          // Clear the orphan-recovery marker so a failed task isn't retried
          // as "still pending" forever (2026-07-06 fix).
          persistAngleGrid(shotNumber, null);
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      toast.error(
        lang === "th" ? "สร้างภาพใช้เวลานานเกินไป ลองตรวจสอบภายหลัง" : "Generation is taking too long — check back later."
      );
    } finally {
      angleVariationsPollInFlightRef.current.delete(shotNumber);
      setPollingAngleVariationsShot(current => (current === shotNumber ? null : current));
    }
  }

  const generateAngleVariationsMutation =
    trpc.verticalDramaEpisodes.generateStartFrameAngleVariations.useMutation({
      onSuccess: (data, variables) => {
        // Persist the pending task marker BEFORE polling starts (2026-07-06
        // fix) — if the page reloads/navigates away before this poll
        // observes completion, the resume-on-load effect below can pick the
        // task back up instead of the grid being silently lost forever.
        persistAngleGrid(variables.shotNumber, { pendingTaskId: data.taskId, dismissedIndexes: [] });
        void pollAngleVariationsTask(
          data.taskId,
          variables.shotNumber,
          [],
          variables.softenLevel ?? 0
        );
      },
      onError: err => toast.error(err.message),
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
   *  open the swap panel first) — resolves the dropped URL to a canonical
   *  media asset then links it immediately, same finalize path the swap
   *  panel itself uses. */
  async function handleDropStartFrame(shotNumber: number, url: string) {
    try {
      const resolved = await resolveMediaAssetForImportMutation.mutateAsync({
        seriesId,
        source: "url",
        url,
        mimeType: "image/jpeg",
      });
      await setApprovedStartFrameAssetMutation.mutateAsync({
        seriesId,
        episodeId,
        shotNumber,
        mediaAssetId: resolved.mediaAssetId,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : lang === "th" ? "เปลี่ยนภาพไม่สำเร็จ" : "Failed to change image"
      );
    }
  }

  /** Same drop-to-replace shortcut, targeting a character's global portrait
   *  instead of one shot's start frame. */
  async function handleDropCharacterReference(characterId: string, url: string) {
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
        err instanceof Error ? err.message : lang === "th" ? "เปลี่ยนภาพไม่สำเร็จ" : "Failed to change image"
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

  const episodeSelectedImageModelId =
    episodeDetailQuery.data?.startFramePlan?.selectedImageModelId ?? "";
  const episodeSelectedVideoModelId =
    episodeDetailQuery.data?.motionPromptPack?.selectedVideoModelId ?? "";
  const selectedImageModelId =
    episodeSelectedImageModelId || readStoredSeriesModelDefault(seriesId, "image");
  const selectedVideoModelId =
    episodeSelectedVideoModelId || readStoredSeriesModelDefault(seriesId, "video");

  const setEpisodeModelSelectionMutation =
    trpc.verticalDramaEpisodes.setEpisodeModelSelection.useMutation({
      onSuccess: () => {
        toast.success(lang === "th" ? "บันทึกการเลือกโมเดลแล้ว" : "Model selection saved.");
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

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
      | { clips?: Array<{ sourceShotNumbers?: number[]; requiredDisclosure?: string }> }
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
        typeof entry.story_function === "string" ? entry.story_function.trim() : "";
      if (!storyFunction) continue;
      const placementStyleRaw =
        typeof entry.placement_style === "string"
          ? entry.placement_style.trim().toLowerCase().replace(/[\s-]+/g, "_")
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
        if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 9) continue;
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
  const productImagesQuery = trpc.verticalDramaSeries.listProductImages.useQuery(
    { seriesId },
    { enabled: Boolean(seriesId) && Object.keys(productTieInByShot).length > 0 }
  );

  const [savingProductReferencesForShot, setSavingProductReferencesForShot] =
    useState<number | null>(null);
  const saveShotProductReferencesMutation =
    trpc.verticalDramaEpisodes.updateEpisodeDraft.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "อัปเดตภาพอ้างอิงสินค้าแล้ว" : "Product reference image(s) updated."
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
        ? { ...frame, productReferenceAssetIds: urls, productRefsCustomized: true }
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

  const handleSelectImageModel = (modelId: string) => {
    storeSeriesModelDefault(seriesId, "image", modelId);
    setEpisodeModelSelectionMutation.mutate({
      seriesId,
      episodeId,
      selectedImageModelId: modelId,
    });
  };
  const handleSelectVideoModel = (modelId: string) => {
    storeSeriesModelDefault(seriesId, "video", modelId);
    setEpisodeModelSelectionMutation.mutate({
      seriesId,
      episodeId,
      selectedVideoModelId: modelId,
    });
  };

  /* ---- Video-prompt language options (episode-level language plan) ----
   *  `promptLanguage` (the language the video-clip PROMPT TEXT is written
   *  in — default "en") and `dialogueLanguage` (the language the characters
   *  SPEAK in the video — default "th"), persisted via
   *  `setEpisodeVideoPromptLanguage` (free — same JSONB-patch convention as
   *  `setEpisodeModelSelection`). Read straight off the episode's own
   *  `motionPromptPack`, falling back to the defaults when absent. */
  const selectedPromptLanguage =
    episodeDetailQuery.data?.motionPromptPack?.promptLanguage ?? "en";
  const selectedDialogueLanguage =
    episodeDetailQuery.data?.motionPromptPack?.dialogueLanguage ?? "th";
  const selectedThaiAccent =
    episodeDetailQuery.data?.motionPromptPack?.thaiAccent ?? null;

  const setEpisodeVideoPromptLanguageMutation =
    trpc.verticalDramaEpisodes.setEpisodeVideoPromptLanguage.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th" ? "บันทึกการตั้งค่าภาษาแล้ว" : "Language settings saved."
        );
        void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
      },
      onError: err => toast.error(err.message),
    });

  const handleSelectPromptLanguage = (language: string) => {
    setEpisodeVideoPromptLanguageMutation.mutate({
      seriesId,
      episodeId,
      promptLanguage: language as "en" | "th" | "zh" | "ja" | "ko",
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
  const handleSelectMcpConnection = (connectionId: string | null) => {
    setMcpConnectionIdState(connectionId);
    storeMcpConnectionId(connectionId);
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
   *  should proceed. */
  function requireMcpConnectionOrToast(kind: "image" | "video"): boolean {
    const usesMcp = kind === "image" ? imageModelUsesMcp : videoModelUsesMcp;
    if (!usesMcp || mcpConnectionId) return true;
    toast.error(
      lang === "th"
        ? "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลนี้"
        : kind === "image"
          ? "Select an MCP connection before using this image model."
          : "Select an MCP connection before using this video model."
    );
    return false;
  }

  /* ---- Phase 2.5 — per-shot reference strip ---- */
  const shotReferencesQuery = trpc.verticalDramaEpisodes.listShotReferences.useQuery(
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
      onSuccess: () => void utils.verticalDramaEpisodes.listShotReferences.invalidate(),
      onError: err => toast.error(err.message),
    });
  const deleteShotReferenceMutation =
    trpc.verticalDramaEpisodes.deleteShotReference.useMutation({
      onSuccess: () => void utils.verticalDramaEpisodes.listShotReferences.invalidate(),
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

  /* ---- Phase 3.4 — dialogue box (save via free updateEpisodeDraft) ---- */
  const [savingDialogueForClip, setSavingDialogueForClip] = useState<
    number | null
  >(null);
  const updateEpisodeDraftMutation =
    trpc.verticalDramaEpisodes.updateEpisodeDraft.useMutation({
      onSuccess: () => void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate(),
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
      frame.shotNumber === shotNumber ? { ...frame, imagePrompt: prompt } : frame
    );
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      startFramePlan: { ...plan, frames: updatedFrames },
    });
  }

  function handleSaveVideoPrompt(shotNumber: number, prompt: string) {
    const pack = episodeDetailQuery.data?.motionPromptPack;
    if (!pack) return;
    const updatedClips = (pack.clips ?? []).map(clip => {
      const shotNumbers = clip.sourceShotNumbers?.length
        ? clip.sourceShotNumbers
        : clip.parentShotNumber != null
          ? [clip.parentShotNumber]
          : [];
      return shotNumbers.includes(shotNumber) ? { ...clip, prompt } : clip;
    });
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
        | { pendingTaskId?: string; imageUrl?: string; dismissedIndexes?: number[] }
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
      void pollAngleVariationsTask(pendingTaskId, shotNumber, angleGrid?.dismissedIndexes ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeDetailQuery.data?.startFramePlan?.frames]);

  /** Tracks which shots' currently-showing grid URL has already been
   *  persisted, so the effect below only ever fires the free save mutation
   *  once per newly-completed grid (not on every render). */
  const persistedAngleGridUrlByShotRef = useRef<Record<number, string>>({});

  useEffect(() => {
    for (const [shotKey, gridUrl] of Object.entries(angleVariationGridUrlByShot)) {
      const shotNumber = Number(shotKey);
      if (persistedAngleGridUrlByShotRef.current[shotNumber] === gridUrl) continue;
      persistedAngleGridUrlByShotRef.current[shotNumber] = gridUrl;
      persistAngleGrid(shotNumber, { imageUrl: gridUrl, dismissedIndexes: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleVariationGridUrlByShot]);

  /** Per-tile delete in the picker — appends the tile's original 0..8 index
   *  to `dismissedIndexes` and persists (free), so the deletion survives a
   *  reload instead of only living in client state. */
  function handleDeleteAngleVariationCandidate(shotNumber: number, originalIndex: number) {
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
    mode: "single" | "angles"
  ) {
    if (!requireMcpConnectionOrToast("image")) return;
    setPollingStartFrameShots(prev => new Set(prev).add(shotNumber));
    try {
      let plan = episodeDetailQuery.data?.startFramePlan as
        | { frames?: Array<{ shotNumber: number; imagePrompt?: string }> }
        | null
        | undefined;
      let frame = plan?.frames?.find(f => f.shotNumber === shotNumber);

      if (!plan || !plan.frames?.length) {
        // No plan at all yet — generate real prompts for every shot first
        // (same call as the panel's own "Generate start-frame prompts"
        // button), then refetch until this shot's frame shows up.
        const outcome = await runStageMutation.mutateAsync({
          seriesId,
          episodeId,
          stage: "start_frame_render_plan",
          mode: "full",
        });
        if (outcome.result.status === "failed") {
          toast.error(
            lang === "th"
              ? `เตรียมพรอมต์ภาพไม่สำเร็จ${outcome.result.errors[0]?.message ? `: ${outcome.result.errors[0].message}` : ""}`
              : `Failed to prepare image prompts${outcome.result.errors[0]?.message ? `: ${outcome.result.errors[0].message}` : ""}`,
            {
              action: {
                label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
                onClick: () => void handleGeneratePromptAndImage(shotNumber, mode),
              },
            }
          );
          return;
        }
        const refreshed = await utils.verticalDramaEpisodes.getEpisodeDetail.fetch(
          { seriesId, episodeId }
        );
        plan = refreshed?.startFramePlan as typeof plan;
        frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
      }

      if (!frame?.imagePrompt?.trim()) {
        // Plan exists but this specific shot has no prompt — auto-compose an
        // instruction and repair it SILENTLY (no dialog, no typing).
        const autoInstruction =
          lang === "th"
            ? `สร้าง image prompt สำหรับช็อตที่ ${shotNumber} ให้ครบถ้วนตามรายละเอียด storyboard และตัวละครที่กำหนดของช็อตนี้`
            : `Generate a complete image prompt for shot ${shotNumber}, following this shot's storyboard details and required characters.`;
        try {
          await silentRepairMutation.mutateAsync({
            seriesId,
            episodeId,
            stage: "start_frame_render_plan",
            target: { parentShotNumber: shotNumber },
            instruction: autoInstruction,
          });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : lang === "th"
                ? "เตรียมพรอมต์ภาพไม่สำเร็จ"
                : "Failed to prepare the image prompt",
            {
              action: {
                label: lang === "th" ? "ลองอีกครั้ง" : "Retry",
                onClick: () => void handleGeneratePromptAndImage(shotNumber, mode),
              },
            }
          );
          return;
        }
        invalidateRuns();
        const refreshed = await utils.verticalDramaEpisodes.getEpisodeDetail.fetch(
          { seriesId, episodeId }
        );
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
              onClick: () => void handleGeneratePromptAndImage(shotNumber, mode),
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
          mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
          resolution: selectedImageResolution || undefined,
        });
      } else {
        generateStartFrameImageMutation.mutate({
          seriesId,
          episodeId,
          shotNumber,
          idempotencyKey: crypto.randomUUID(),
          mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
          resolution: selectedImageResolution || undefined,
        });
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
            onClick: () => void handleGeneratePromptAndImage(shotNumber, mode),
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
  const [generatingVideoPromptPack, setGeneratingVideoPromptPack] = useState(false);

  async function handleGenerateVideoPromptPack() {
    setGeneratingVideoPromptPack(true);
    try {
      if (!episodeDetailQuery.data?.dialogueAudioPlan) {
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
      onSuccess: () => void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate(),
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
      lang === "th" ? "คัดลอกแล้ว — นำไปวางในหน้าซ่อม" : "Copied — paste it into Repair."
    );
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

  /** Clip numbers with a video-clip task currently being polled (live submit
   *  OR resumed-on-load) — guards against double-polling the same clip from
   *  both paths, same ref-guard convention as `angleVariationsPollInFlightRef`. */
  const videoClipPollInFlightRef = useRef<Set<number>>(new Set());
  /** Clip numbers whose `pendingTaskId` this session has already picked up
   *  for resume-polling — prevents re-triggering on every `getEpisodeDetail`
   *  refetch, same convention as `resumedAngleGridShotsRef`. */
  const resumedVideoClipsRef = useRef<Set<number>>(new Set());

  /** Persists `videoTask` onto the matching `motionPromptPack.clips[]` entry
   *  via the existing free `updateEpisodeDraft` JSONB-patch flow — same
   *  convention as `persistAngleGrid`. `null` clears the field entirely. */
  function persistVideoTask(
    clipNumber: number,
    videoTask:
      | { pendingTaskId: string }
      | { videoUrl: string; mediaTaskId?: string }
      | null
  ) {
    const pack = episodeDetailQuery.data?.motionPromptPack;
    if (!pack) return;
    const updatedClips = (pack.clips ?? []).map(clip => {
      if (clip.clipNumber !== clipNumber) return clip;
      if (videoTask) return { ...clip, videoTask };
      const { videoTask: _drop, ...rest } = clip as typeof clip & {
        videoTask?: unknown;
      };
      return rest;
    });
    updateEpisodeDraftMutation.mutate({
      seriesId,
      episodeId,
      motionPromptPack: { ...pack, clips: updatedClips },
    });
  }

  /** Shared completion handler for BOTH the live submit-then-poll path and
   *  the resume-on-load path — both must converge on the identical
   *  persisted `videoTask` shape ({ videoUrl, mediaTaskId }, `pendingTaskId`
   *  dropped). */
  function resolveCompletedVideoClipTask(
    clipNumber: number,
    resultUrl: string,
    taskId: string
  ) {
    persistVideoTask(clipNumber, { videoUrl: resultUrl, mediaTaskId: taskId });
  }

  async function pollVideoClipTask(taskId: string, clipNumber: number) {
    if (videoClipPollInFlightRef.current.has(clipNumber)) return;
    videoClipPollInFlightRef.current.add(clipNumber);
    setPollingVideoClips(prev => new Set(prev).add(clipNumber));
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
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
            persistVideoTask(clipNumber, null);
            return;
          }
          toast.success(
            lang === "th" ? "สร้างวิดีโอคลิปสำเร็จ" : "Video clip generated."
          );
          resolveCompletedVideoClipTask(clipNumber, resultUrl, taskId);
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)
            ?.errorMessage;
          toast.error(
            lang === "th"
              ? `สร้างวิดีโอล้มเหลว${errorMessage ? `: ${errorMessage}` : ""}`
              : `Video generation failed${errorMessage ? `: ${errorMessage}` : ""}`
          );
          persistVideoTask(clipNumber, null);
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
        persistVideoTask(variables.clipNumber, { pendingTaskId: data.taskId });
        void pollVideoClipTask(data.taskId, variables.clipNumber);
      },
      onError: err => toast.error(err.message),
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
      }
    | undefined;

  const motionPromptClips = episodeDetailQuery.data?.motionPromptPack?.clips ?? [];
  const totalClipCount = motionPromptClips.length;
  const readyClipNumbers = motionPromptClips
    .filter(c => Boolean((c.videoTask as { videoUrl?: string } | undefined)?.videoUrl))
    .map(c => c.clipNumber);

  /** Ref-guarded 3-5s poll of `getEpisodeDetail` while a compiled-video job is
   *  pending — cleared in `finally` so it never leaks an interval, and never
   *  double-starts across the live-submit path and the resume-on-load path,
   *  same convention as `videoClipPollInFlightRef`. */
  const compiledVideoPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
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
    if (compiledVideo?.status === "completed" || compiledVideo?.status === "failed") {
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
    if (compiledVideo.status === "completed" || compiledVideo.status === "failed") return;
    resumedCompiledVideoPollRef.current = true;
    startCompiledVideoPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiledVideo?.pendingJobId, compiledVideo?.status]);

  const assembleEpisodeVideoMutation =
    trpc.verticalDramaEpisodes.assembleEpisodeVideo.useMutation({
      onSuccess: () => {
        toast.success(
          lang === "th"
            ? "เริ่มประกอบวิดีโอทั้งตอนแล้ว"
            : "Started assembling the full episode video."
        );
        startCompiledVideoPoll();
        void episodeDetailQuery.refetch();
      },
      onError: err => {
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
        setRepairImageErrorByShot(prev => ({
          ...prev,
          [variables.shotNumber]:
            err.data?.code === "PRECONDITION_FAILED"
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
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
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
                mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
                resolution: selectedImageResolution || undefined,
              },
              {
                onSuccess: data => {
                  void pollRepairImageTask(data.taskId, shotNumber, beforeUrl, instruction, nextLevel);
                },
              }
            );
            return;
          }
          setRepairImageErrorByShot(prev => ({
            ...prev,
            [shotNumber]:
              lang === "th"
                ? `สร้างภาพที่แก้ไม่สำเร็จ${errorMessage ? `: ${errorMessage}` : ""}`
                : `Failed to generate the fixed image${errorMessage ? `: ${errorMessage}` : ""}`,
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
    if (!requireMcpConnectionOrToast("image")) return;
    const plan = episodeDetailQuery.data?.startFramePlan;
    const frame = plan?.frames?.find(f => f.shotNumber === shotNumber);
    const assetId = frame?.approvedMediaAssetId;
    const beforeUrl = assetId
      ? (episodeDetailQuery.data?.assetUrls as VerticalDramaAssetUrlMap | undefined)?.[assetId]
          ?.url
      : undefined;
    if (!beforeUrl) {
      setRepairImageErrorByShot(prev => ({
        ...prev,
        [shotNumber]: lang === "th" ? "ต้องมีภาพหลักของช็อตก่อน" : "This shot needs an approved image first.",
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
        mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
        resolution: selectedImageResolution || undefined,
      },
      {
        onSuccess: data => {
          void pollRepairImageTask(data.taskId, shotNumber, beforeUrl, instruction);
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
        lang === "th" ? "เปลี่ยนเป็นภาพใหม่แล้ว" : "Replaced with the new image."
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
  const [generatingShotVideoPromptForShot, setGeneratingShotVideoPromptForShot] =
    useState<Set<number>>(new Set());
  const [usedVisionByShot, setUsedVisionByShot] = useState<Record<number, boolean>>(
    {}
  );

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
    setGeneratingShotVideoPromptForShot(prev => new Set(prev).add(shotNumber));
    generateShotVideoPromptMutation.mutate(
      { seriesId, episodeId, shotNumber, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: data => {
          setUsedVisionByShot(prev => ({ ...prev, [shotNumber]: data.usedVision }));
          void utils.verticalDramaEpisodes.getEpisodeDetail.invalidate();
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
    <div className="min-w-0 space-y-4">
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
            runStageMutation.mutate({ seriesId, episodeId, stage, mode: "full" });
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
          assetUrls: episodeDetailQuery.data?.assetUrls as
            | VerticalDramaAssetUrlMap
            | undefined,
          loading: episodeDetailQuery.isLoading,
          error: episodeDetailQuery.error?.message ?? null,
          generating:
            runStageMutation.isPending &&
            runStageMutation.variables?.stage === "storyboard_shotgrid",
          onGenerateReal: () =>
            runStageMutation.mutate({
              seriesId,
              episodeId,
              stage: "storyboard_shotgrid",
              mode: "full",
            }),
          onEditVideoPrompt: (shotNumber, currentPrompt) =>
            openRepair(
              "video_motion_prompt_pack",
              { parentShotNumber: shotNumber },
              currentPrompt
            ),
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
          onEditStartFramePrompt: (shotNumber, currentPrompt) =>
            openRepair(
              "start_frame_render_plan",
              { parentShotNumber: shotNumber },
              currentPrompt
            ),
          onGenerateVideoPromptPack: handleGenerateVideoPromptPack,
          generatingVideoPromptPack,
          onGenerateStartFrameImage: shotNumber => {
            if (!requireMcpConnectionOrToast("image")) return;
            generateStartFrameImageMutation.mutate({
              seriesId,
              episodeId,
              shotNumber,
              idempotencyKey: crypto.randomUUID(),
              mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
              resolution: selectedImageResolution || undefined,
            });
          },
          generatingStartFrameImageForShot: pollingStartFrameShots,
          onGenerateAllStartFrameImages: (shotNumbers: number[]) => {
            if (!requireMcpConnectionOrToast("image")) return;
            setPollingStartFrameShots(prev => {
              const next = new Set(prev);
              shotNumbers.forEach(n => next.add(n));
              return next;
            });
            shotNumbers.forEach(shotNumber => {
              generateStartFrameImageMutation.mutate({
                seriesId,
                episodeId,
                shotNumber,
                idempotencyKey: crypto.randomUUID(),
                mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
                resolution: selectedImageResolution || undefined,
              });
            });
          },
          characterPortraits: episodeDetailQuery.data?.characterPortraits as
            | VerticalDramaCharacterPortraitMap
            | undefined,
          productTieInByShot,
          productImages: (productImagesQuery.data?.images ?? []) as VerticalDramaAvailableProductImageView[],
          productImagesLoading: productImagesQuery.isLoading,
          onSaveShotProductReferences: handleSaveShotProductReferences,
          savingProductReferencesForShot,
          onChangeCharacterReference: characterId =>
            setImageSwapTarget({ type: "characterPortrait", characterId }),
          onDropCharacterReference: handleDropCharacterReference,
          onDropStartFrame: handleDropStartFrame,
          onGenerateAngleVariations: shotNumber => {
            if (!requireMcpConnectionOrToast("image")) return;
            generateAngleVariationsMutation.mutate({
              seriesId,
              episodeId,
              shotNumber,
              idempotencyKey: crypto.randomUUID(),
              mcpConnectionId: imageModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
              resolution: selectedImageResolution || undefined,
            });
          },
          generatingAngleVariationsForShot:
            pollingAngleVariationsShot ??
            (generateAngleVariationsMutation.isPending
              ? generateAngleVariationsMutation.variables?.shotNumber ?? null
              : null),
          angleVariationGridUrlByShot,
          onPickAngleVariationCandidate: handlePickAngleVariationCandidate,
          onDismissAngleVariations: handleDismissAngleVariations,
          onDeleteAngleVariationCandidate: handleDeleteAngleVariationCandidate,
          imageModels,
          videoModels,
          selectedImageModelId,
          selectedVideoModelId,
          onSelectImageModel: handleSelectImageModel,
          onSelectVideoModel: handleSelectVideoModel,
          modelsLoading: imageModelsQuery.isLoading || videoModelsQuery.isLoading,
          mcpConnectionId,
          onSelectMcpConnection: handleSelectMcpConnection,
          selectedImageResolution,
          selectedVideoResolution,
          onSelectImageResolution: handleSelectImageResolution,
          onSelectVideoResolution: handleSelectVideoResolution,
          selectedPromptLanguage,
          selectedDialogueLanguage,
          onSelectPromptLanguage: handleSelectPromptLanguage,
          onSelectDialogueLanguage: handleSelectDialogueLanguage,
          selectedThaiAccent,
          onSelectThaiAccent: handleSelectThaiAccent,
          shotReferencesByShot,
          onAddShotReference: handleAddShotReference,
          onRemoveShotReference: handleRemoveShotReference,
          addingShotReferenceForShot,
          onSaveClipDialogue: handleSaveClipDialogue,
          savingDialogueForClip,
          onGenerateVideoClip: clipNumber => {
            if (!requireMcpConnectionOrToast("video")) return;
            generateVideoClipMutation.mutate({
              seriesId,
              episodeId,
              clipNumber,
              idempotencyKey: crypto.randomUUID(),
              mcpConnectionId: videoModelUsesMcp ? mcpConnectionId ?? undefined : undefined,
              resolution: selectedVideoResolution || undefined,
            });
          },
          generatingVideoClipForClip: pollingVideoClips,
          ttsFallbackByClip,
          trimmedReferenceCountByClip,
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
          totalClipCount,
          readyClipNumbers,
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
          if (!script?.episode_title || script.hook === "Dry-run hook") return null;
          return { episodeTitle: script.episode_title, hook: script.hook ?? "" };
        })()}
        storyboardReviewId={storyboardReviewId}
        onOpenStoryboardReview={() =>
          storyboardReviewId && setLocation(`/storyboard-review/${storyboardReviewId}`)
        }
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
        jobStatus={repairMutation.isPending ? "submitting" : repairJobStatus}
        resultArtifactId={repairResultArtifactId}
        errorReason={repairError}
        onSubmit={({ instruction, target }) => {
          if (!repairStage) return;
          setRepairJobStatus("submitting");
          setRepairError(undefined);
          setRepairResultArtifactId(undefined);
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
      collapsed={isRightPanelCollapsed}
      onCollapsedChange={setIsRightPanelCollapsed}
      width={rightPanelWidth}
      onWidthChange={setRightPanelWidth}
      minWidth={EPISODE_RIGHT_PANEL_MIN_WIDTH}
      maxWidth={EPISODE_RIGHT_PANEL_MAX_WIDTH}
      className="max-h-[min(48rem,82dvh)] xl:h-full xl:max-h-none"
      collapsedContent={lang === "th" ? "สื่อ" : "Media"}
      collapseLabel={lang === "th" ? "ยุบ panel สื่อ" : "Collapse media panel"}
      expandLabel={lang === "th" ? "เปิด panel สื่อ" : "Open media panel"}
      resizeLabel={lang === "th" ? "ปรับขนาด panel สื่อ" : "Resize media panel"}
      testId="vd-episode-right-panel"
    >
      <div className="flex h-full min-h-0 flex-col p-2.5 sm:p-3">
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
