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

import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { FileClock } from "lucide-react";
import { toast } from "sonner";

import { AppPage } from "@/components/AppPage";
import { Badge } from "@/components/ui/badge";
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
import {
  VerticalDramaContactSheetPicker,
  type VerticalDramaStartFrameMode,
} from "@/components/verticalDramaSeries/VerticalDramaContactSheetPicker";
import type { VerticalDramaRunRow } from "@/components/verticalDramaSeries/VerticalDramaRunsList";
import type {
  RunResult,
  VerticalDramaMemoryKind,
  VerticalDramaPipelineStage,
} from "@shared/verticalDramaSeries";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type {
  VerticalDramaAssetUrlMap,
  VerticalDramaCharacterPortraitMap,
  VerticalDramaMotionPromptPackView,
  VerticalDramaStartFramePlanView,
  VerticalDramaStoryboardView,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";
import { VerticalDramaCharacterReferencePanel } from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";

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

/** Start-frame phase stages that surface the contact-sheet picker on drill-down. */
const START_FRAME_STAGES: readonly VerticalDramaPipelineStage[] = [
  "start_frame_render_plan",
  "render_or_import_start_frames",
  "approve_start_frames",
];

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

  // Start-frame contact-sheet picker gate state (drill-down surface).
  const [stageDetailStage, setStageDetailStage] =
    useState<VerticalDramaPipelineStage | null>(null);
  const [startFrameMode, setStartFrameMode] =
    useState<VerticalDramaStartFrameMode>("contact_sheet_3x3_batch");
  const [selectedImageModelId, setSelectedImageModelId] = useState("");
  const [sheetCount, setSheetCount] = useState(1);
  const [promptModelApproved, setPromptModelApproved] = useState(false);

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
  const [pollingStartFrameShot, setPollingStartFrameShot] = useState<
    number | null
  >(null);
  const resolveMediaAssetForImportMutation =
    trpc.verticalDramaCharacters.resolveMediaAssetForImport.useMutation();

  async function pollStartFrameTask(taskId: string, shotNumber: number) {
    setPollingStartFrameShot(shotNumber);
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
      setPollingStartFrameShot(null);
    }
  }

  const generateStartFrameImageMutation =
    trpc.verticalDramaEpisodes.generateStartFrameImage.useMutation({
      onSuccess: (data, variables) => {
        void pollStartFrameTask(data.taskId, variables.shotNumber);
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

  async function pollAngleVariationsTask(taskId: string, shotNumber: number) {
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
            return;
          }
          setAngleVariationGridUrlByShot(prev => ({ ...prev, [shotNumber]: resultUrl }));
          return;
        }
        if (status === "failed") {
          const errorMessage = (task as { errorMessage?: string } | null)?.errorMessage;
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
      setPollingAngleVariationsShot(null);
    }
  }

  const generateAngleVariationsMutation =
    trpc.verticalDramaEpisodes.generateStartFrameAngleVariations.useMutation({
      onSuccess: (data, variables) => {
        void pollAngleVariationsTask(data.taskId, variables.shotNumber);
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
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : lang === "th"
            ? "เลือกภาพไม่สำเร็จ"
            : "Failed to select image"
      );
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

  const showPicker =
    stageDetailStage != null && START_FRAME_STAGES.includes(stageDetailStage);

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

  // Start-frame batch surface state derived from the render stage's latest run.
  const startFrameState = stageStates["render_or_import_start_frames"];
  const pickerStatus: "loading" | "empty" | "error" | "success" =
    startFrameState?.status === "running"
      ? "loading"
      : startFrameState?.status === "failed"
        ? "error"
        : "empty";

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
          if (stage === "update_character_visual_bible") {
            // Free (a DB sync, no LLM/credit cost — see
            // `syncCharacterVisualBible`), so no confirm-before-spend gate
            // needed, same as `open_storyboard_review` above. Always run in
            // "full" mode so `runStage` actually invokes the real sync
            // instead of leaving the empty-characters placeholder in place.
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
          onGenerateStartFrameImage: shotNumber =>
            generateStartFrameImageMutation.mutate({ seriesId, episodeId, shotNumber }),
          generatingStartFrameImageForShot:
            pollingStartFrameShot ??
            (generateStartFrameImageMutation.isPending
              ? generateStartFrameImageMutation.variables?.shotNumber ?? null
              : null),
          characterPortraits: episodeDetailQuery.data?.characterPortraits as
            | VerticalDramaCharacterPortraitMap
            | undefined,
          onChangeCharacterReference: characterId =>
            setImageSwapTarget({ type: "characterPortrait", characterId }),
          onDropCharacterReference: handleDropCharacterReference,
          onDropStartFrame: handleDropStartFrame,
          onGenerateAngleVariations: shotNumber =>
            generateAngleVariationsMutation.mutate({ seriesId, episodeId, shotNumber }),
          generatingAngleVariationsForShot:
            pollingAngleVariationsShot ??
            (generateAngleVariationsMutation.isPending
              ? generateAngleVariationsMutation.variables?.shotNumber ?? null
              : null),
          angleVariationGridUrlByShot,
          onPickAngleVariationCandidate: handlePickAngleVariationCandidate,
          onDismissAngleVariations: shotNumber =>
            setAngleVariationGridUrlByShot(prev => {
              const next = { ...prev };
              delete next[shotNumber];
              return next;
            }),
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

      {/* Start-frame candidate review & selection (start-frame stage drill-down). */}
      {showPicker ? (
        <VerticalDramaContactSheetPicker
          status={pickerStatus}
          errorMessage={startFrameState?.errors?.[0]?.message}
          mode={startFrameMode}
          onModeChange={setStartFrameMode}
          imageModels={[]}
          selectedImageModelId={selectedImageModelId}
          onImageModelChange={setSelectedImageModelId}
          sheetCountPresets={[1, 2, 3]}
          sheetCount={sheetCount}
          onSheetCountChange={setSheetCount}
          promptSets={[]}
          promptModelApproved={promptModelApproved}
          onApprovePromptModel={setPromptModelApproved}
          creditEstimate={0}
          batchStatus="planned"
          expectedCandidateFrameCount={0}
          completedCandidateFrameCount={0}
          candidates={[]}
          selectedByShot={{}}
          onRepairFrame={payload =>
            openRepair("render_or_import_start_frames", {
              parentShotNumber: payload.shotNumber,
            })
          }
          readOnly={completed}
        />
      ) : null}

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

    {/* Persistent right-side reference panel — pick an existing Media
        History/Library/this-character image directly (no-cost, no LLM
        regeneration), distinct from the repair dialog above. ALWAYS
        mounted (not gated behind a popup) per explicit user request — an
        idle empty state shows until a shot's "Change image" or a
        character-reference chip sets `imageSwapTarget`. Reuses the
        character-reference panel's Library/History/this-character
        resolve-and-link flow for BOTH targets: a shot's start frame, or a
        specific character's global portrait. Collapsible + resizable via
        the shared `ResizableCollapsiblePanel` (same component/convention
        already used by `StoryboardReviewPage.tsx`'s own right panel). */}
    <ResizableCollapsiblePanel
      side="right"
      collapsed={isRightPanelCollapsed}
      onCollapsedChange={setIsRightPanelCollapsed}
      width={rightPanelWidth}
      onWidthChange={setRightPanelWidth}
      minWidth={EPISODE_RIGHT_PANEL_MIN_WIDTH}
      maxWidth={EPISODE_RIGHT_PANEL_MAX_WIDTH}
      className="max-h-[min(48rem,82dvh)] xl:h-full xl:max-h-none"
      collapsedContent={lang === "th" ? "เปลี่ยนภาพ" : "Change image"}
      collapseLabel={lang === "th" ? "ยุบ panel เปลี่ยนภาพ" : "Collapse image-swap panel"}
      expandLabel={lang === "th" ? "เปิด panel เปลี่ยนภาพ" : "Open image-swap panel"}
      resizeLabel={lang === "th" ? "ปรับขนาด panel เปลี่ยนภาพ" : "Resize image-swap panel"}
      testId="vd-episode-right-panel"
    >
      <div className="flex h-full min-h-0 flex-col p-2.5 sm:p-3">
        <h2 className="mb-2 text-sm font-semibold">
          {imageSwapTarget?.type === "startFrame"
            ? lang === "th"
              ? `เปลี่ยนภาพเฟรมเริ่มต้น — ช็อต ${imageSwapTarget.shotNumber}`
              : `Change start frame — Shot ${imageSwapTarget.shotNumber}`
            : imageSwapTarget?.type === "characterPortrait"
              ? lang === "th"
                ? "เปลี่ยนภาพอ้างอิงตัวละคร"
                : "Change character reference image"
              : lang === "th"
                ? "เปลี่ยนภาพ"
                : "Change image"}
        </h2>
        {imageSwapTarget != null ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <VerticalDramaCharacterReferencePanel
              seriesId={seriesId}
              characterId={
                imageSwapTarget.type === "characterPortrait"
                  ? imageSwapTarget.characterId
                  : `shot-${imageSwapTarget.shotNumber}`
              }
              isLinking={
                setApprovedStartFrameAssetMutation.isPending ||
                linkCharacterPortraitMutation.isPending
              }
              onLinkMediaAssetId={mediaAssetId => {
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
              }}
            />
          </div>
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">
            {lang === "th"
              ? "เลือกช็อตหรือตัวละครเพื่อเริ่มเปลี่ยนภาพ"
              : "Pick a shot or character to start swapping images."}
          </p>
        )}
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
