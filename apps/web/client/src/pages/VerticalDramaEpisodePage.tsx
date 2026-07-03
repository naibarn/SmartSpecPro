/**
 * VerticalDramaEpisodePage (spec feature 131, section 03 · §8.1, §8.4).
 *
 * Episode workspace shell. Serves two routes:
 *   - /dashboard/vertical-drama/:seriesId/episodes/:episodeId         (workspace)
 *   - /dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId
 *       (read-only past-run artifact ledger — a directly linkable deep link)
 *
 * Both render a reversible `VerticalDramaBreadcrumb` (Series › Episode, plus
 * › Storyboard Review at run depth). The workspace route mounts the real
 * `VerticalDramaEpisodeWorkspace`, wired to the `verticalDramaEpisodes` tRPC
 * router (runs, memory, approval checkpoints, stage runs, repair). The repair
 * dialog and the start-frame contact-sheet picker are mounted at their proper
 * entry points. All actions are dry-run-safe — no paid generation is triggered
 * from this shell.
 */

import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { FileClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  VerticalDramaBreadcrumb,
  type VerticalDramaCrumb,
} from "@/components/verticalDramaSeries/VerticalDramaBreadcrumb";
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

export default function VerticalDramaEpisodePage() {
  const lang = useVerticalDramaLang();

  const [isRunRoute, runParams] = useRoute(
    "/dashboard/vertical-drama/:seriesId/episodes/:episodeId/runs/:runId",
  );
  const [, episodeParams] = useRoute(
    "/dashboard/vertical-drama/:seriesId/episodes/:episodeId",
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
    crumbs.push({ label: pickCopy(lang, verticalDramaCopy.storyboardReviewCrumb) });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 sm:p-6">
        <VerticalDramaBreadcrumb crumbs={crumbs} />

        <header className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {isRunRoute
              ? pickCopy(lang, verticalDramaCopy.runDetailTitle)
              : `${pickCopy(lang, verticalDramaCopy.episodeCrumb)} ${episodeId}`}
          </h1>
          {isRunRoute && (
            <Badge variant="outline">{pickCopy(lang, verticalDramaCopy.readOnly)}</Badge>
          )}
        </header>

        {isRunRoute ? (
          <RunDetailLedger lang={lang} runId={runId} />
        ) : (
          <EpisodeWorkspaceShell lang={lang} seriesId={seriesId} episodeId={episodeId} />
        )}
      </div>
    </main>
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
    { enabled: Boolean(seriesId), staleTime: 30_000 },
  );
  const runsQuery = trpc.verticalDramaEpisodes.listEpisodeRuns.useQuery(
    { seriesId, episodeId },
    { enabled },
  );
  const checkpointsQuery = trpc.verticalDramaEpisodes.listCheckpoints.useQuery(
    { seriesId, episodeId, state: "pending" },
    { enabled },
  );

  // Memory timeline filters (kind + episode number).
  const [memoryKind, setMemoryKind] = useState<VerticalDramaMemoryKind | "all">("all");
  const [memoryEpisode, setMemoryEpisode] = useState<number | null>(null);
  const memoryQuery = trpc.verticalDramaEpisodes.listMemoryEvents.useQuery(
    {
      seriesId,
      kind: memoryKind === "all" ? undefined : memoryKind,
      episodeNumber: memoryEpisode ?? undefined,
    },
    { enabled: Boolean(seriesId) },
  );

  // Repair dialog state (entry from the approval bar / failed stages / picker).
  const [repairStage, setRepairStage] = useState<VerticalDramaPipelineStage | null>(null);
  const [repairTarget, setRepairTarget] = useState<VerticalDramaRepairTarget | undefined>(undefined);
  const [repairJobStatus, setRepairJobStatus] = useState<VerticalDramaRepairJobStatus>("idle");
  const [repairResultArtifactId, setRepairResultArtifactId] = useState<string | undefined>(undefined);
  const [repairError, setRepairError] = useState<string | undefined>(undefined);

  // Start-frame contact-sheet picker gate state (drill-down surface).
  const [stageDetailStage, setStageDetailStage] = useState<VerticalDramaPipelineStage | null>(null);
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
  };

  const runStageMutation = trpc.verticalDramaEpisodes.runStage.useMutation({
    onSuccess: invalidateRuns,
  });
  const approveMutation = trpc.verticalDramaEpisodes.approveCheckpoint.useMutation({
    onSuccess: () => {
      invalidateRuns();
      void utils.verticalDramaEpisodes.listMemoryEvents.invalidate();
      void utils.verticalDramaSeries.get.invalidate();
    },
  });
  const createEpisodeMutation = trpc.verticalDramaEpisodes.createEpisode.useMutation({
    onSuccess: () => {
      void utils.verticalDramaSeries.get.invalidate();
      invalidateRuns();
    },
  });
  const repairMutation = trpc.verticalDramaEpisodes.repairStageOutput.useMutation({
    onSuccess: (data) => {
      setRepairJobStatus("succeeded");
      setRepairResultArtifactId(data?.result?.artifactIds?.[0]);
      invalidateRuns();
    },
    onError: (err) => {
      setRepairJobStatus("failed");
      setRepairError(err.message);
    },
  });
  const approveRetconMutation = trpc.verticalDramaEpisodes.approveRetconProposal.useMutation({
    onSuccess: () => void utils.verticalDramaEpisodes.listMemoryEvents.invalidate(),
  });
  const rejectRetconMutation = trpc.verticalDramaEpisodes.rejectRetconProposal.useMutation({
    onSuccess: () => void utils.verticalDramaEpisodes.listMemoryEvents.invalidate(),
  });

  // Resolve the episode metadata (episodeNumber / title / status) from the
  // owning series detail — the base series router already exposes its episodes.
  const episode = useMemo(() => {
    const eps = seriesQuery.data?.episodes ?? [];
    const found = eps.find((e) => String(e.id) === String(episodeId));
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
      runRows.map((r) => ({
        runId: r.runId,
        stage: r.stage as VerticalDramaPipelineStage,
        status: r.status,
        mode: r.mode,
        startedAt: r.startedAt,
        updatedAt: r.updatedAt,
        completedAt: r.completedAt,
        artifactLedgerHref: r.artifactLedgerHref,
      })),
    [runRows],
  );

  // Per-stage state: the latest run per stage (runs come newest-first), with the
  // pending approval checkpoint id attached so the approval bar can approve.
  const stageStates = useMemo(() => {
    const map: Partial<Record<VerticalDramaPipelineStage, VerticalDramaStageState>> = {};
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

  function openRepair(stage: VerticalDramaPipelineStage, target?: VerticalDramaRepairTarget) {
    setRepairStage(stage);
    setRepairTarget(target);
    setRepairJobStatus("idle");
    setRepairResultArtifactId(undefined);
    setRepairError(undefined);
  }

  const showPicker =
    stageDetailStage != null && START_FRAME_STAGES.includes(stageDetailStage);

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
        <CardContent role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {seriesQuery.error?.message ?? pickCopy(lang, verticalDramaCopy.errorTitle)}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
          retconDecisionState: decidingRetconId ? { [decidingRetconId]: "deciding" } : {},
          onApproveRetcon: (id) => {
            setDecidingRetconId(id);
            approveRetconMutation.mutate(
              { seriesId, proposalEventId: id },
              { onSettled: () => setDecidingRetconId(null) },
            );
          },
          onRejectRetcon: (id) => {
            setDecidingRetconId(id);
            rejectRetconMutation.mutate(
              { seriesId, proposalEventId: id },
              { onSettled: () => setDecidingRetconId(null) },
            );
          },
        }}
        onCreateEpisode={() => createEpisodeMutation.mutate({ seriesId })}
        onPrimaryCta={({ stage }) =>
          runStageMutation.mutate({ seriesId, episodeId, stage, mode: "dry_run" })
        }
        onApprove={(checkpointId) => {
          if (checkpointId) {
            approveMutation.mutate({ seriesId, episodeId, checkpointId, decision: "approve" });
          }
        }}
        onReject={(checkpointId) => {
          if (checkpointId) {
            approveMutation.mutate({ seriesId, episodeId, checkpointId, decision: "reject" });
          }
        }}
        onRepair={(stage) => openRepair(stage)}
        onOpenRun={(run) => setLocation(run.artifactLedgerHref)}
        onOpenStageDetail={(stage) =>
          setStageDetailStage((prev) => (prev === stage ? null : stage))
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
          onRepairFrame={(payload) =>
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
        onOpenChange={(open) => {
          if (!open) setRepairStage(null);
        }}
        stage={repairStage ?? "plan_episode_script"}
        target={repairTarget}
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
  );
}

/** Read-only past-run artifact ledger (spec §8.1 run detail). */
function RunDetailLedger({ lang, runId }: { lang: VerticalDramaLang; runId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileClock className="h-4 w-4" aria-hidden="true" />
          {lang === "th" ? `บันทึกแอสเซ็ตของรอบ ${runId}` : `Artifact ledger for run ${runId}`}
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
