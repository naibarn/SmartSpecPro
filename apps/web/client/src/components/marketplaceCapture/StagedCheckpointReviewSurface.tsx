import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  StagedCheckpointReviewPanel,
  type StagedCheckpoint,
  type StagedCheckpointEdit,
  type StagedCheckpointRetry,
  type StagedReviewState,
} from "./StagedCheckpointReviewPanel";

function uiIdempotencyKey(prefix: string, value: string) {
  return `ui-staged:${prefix}:${value}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function StagedCheckpointReviewSurface(props: {
  runId?: string | null;
  enabled?: boolean;
  className?: string;
}) {
  const runId = props.runId?.trim() ?? "";
  const enabled = Boolean(runId && props.enabled !== false);
  const [actionError, setActionError] = useState<string | null>(null);
  const stateQuery =
    trpc.marketplaceCapture.getStagedAutoReviewCheckpointState.useQuery(
      { runId },
      {
        enabled,
        refetchInterval: enabled ? 4000 : false,
        refetchOnWindowFocus: true,
        staleTime: 0,
        retry: false,
      }
    );
  const refresh = async () => {
    setActionError(null);
    await stateQuery.refetch();
  };
  const mutationOptions: {
    onSuccess: () => Promise<void>;
    onError: (error: { message: string }) => void;
  } = {
    onSuccess: async () => {
      setActionError(null);
      await stateQuery.refetch();
    },
    onError: (error: { message: string }) => setActionError(error.message),
  };
  const approveMutation =
    trpc.marketplaceCapture.approveStagedAutoReviewCheckpoint.useMutation(
      mutationOptions
    );
  const acceptImageMutation =
    trpc.marketplaceCapture.acceptStagedAutoReviewImage.useMutation(
      mutationOptions
    );
  const rejectMutation =
    trpc.marketplaceCapture.rejectStagedAutoReviewCheckpoint.useMutation(
      mutationOptions
    );
  const editShotMutation =
    trpc.marketplaceCapture.editStagedAutoReviewShot.useMutation(
      mutationOptions
    );
  const editAudioMutation =
    trpc.marketplaceCapture.editStagedAutoReviewAudioPlan.useMutation(
      mutationOptions
    );
  const editFinalMutation =
    trpc.marketplaceCapture.editStagedAutoReviewFinalAssembly.useMutation(
      mutationOptions
    );
  const retryShotMutation =
    trpc.marketplaceCapture.retryStagedAutoReviewShot.useMutation(
      mutationOptions
    );
  const retryAudioMutation =
    trpc.marketplaceCapture.retryStagedAutoReviewAudioPlan.useMutation(
      mutationOptions
    );
  const retryFinalMutation =
    trpc.marketplaceCapture.retryStagedAutoReviewFinalAssembly.useMutation(
      mutationOptions
    );
  const redraftMutation =
    trpc.marketplaceCapture.redraftStagedAutoReviewPlan.useMutation(
      mutationOptions
    );
  const pendingMutation = useMemo(() => {
    const entries: Array<[string, boolean]> = [
      ["approve", approveMutation.isPending],
      ["accept-image", acceptImageMutation.isPending],
      ["reject", rejectMutation.isPending],
      ["edit-shot", editShotMutation.isPending],
      ["edit-audio", editAudioMutation.isPending],
      ["edit-final", editFinalMutation.isPending],
      ["retry-shot", retryShotMutation.isPending],
      ["retry-audio", retryAudioMutation.isPending],
      ["retry-final", retryFinalMutation.isPending],
      ["retry-story", redraftMutation.isPending],
    ];
    return entries.find(([, pending]) => pending)?.[0] ?? null;
  }, [
    acceptImageMutation.isPending,
    approveMutation.isPending,
    editAudioMutation.isPending,
    editFinalMutation.isPending,
    editShotMutation.isPending,
    redraftMutation.isPending,
    rejectMutation.isPending,
    retryAudioMutation.isPending,
    retryFinalMutation.isPending,
    retryShotMutation.isPending,
  ]);
  if (!enabled) return null;
  const state = stateQuery.data as StagedReviewState | null | undefined;
  const stateDigest = state?.stateDigest ?? "";

  const onApprove = (input: {
    checkpoint: StagedCheckpoint;
    expected: Parameters<typeof approveMutation.mutate>[0]["expected"];
  }) => {
    if (!stateDigest) return;
    const payload = {
      runId,
      checkpointId: input.checkpoint.checkpointId,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey(
        "approve",
        input.checkpoint.checkpointId
      ),
      expected: input.expected,
    };
    if (input.checkpoint.kind === "image_result")
      acceptImageMutation.mutate(payload);
    else approveMutation.mutate(payload);
  };
  const onReject = (checkpoint: StagedCheckpoint) => {
    if (!stateDigest) return;
    rejectMutation.mutate({
      runId,
      checkpointId: checkpoint.checkpointId,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey("reject", checkpoint.checkpointId),
      reasonCode: "user_requested_correction",
    });
  };
  const onEdit = (input: StagedCheckpointEdit) => {
    if (!stateDigest) return;
    if (input.audioText !== undefined) {
      editAudioMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("edit-audio", runId),
        text: input.audioText,
        language: input.audioLanguage,
      });
      return;
    }
    if (input.finalShotOrder) {
      editFinalMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("edit-final", runId),
        shotOrder: input.finalShotOrder,
        includeAudio: input.includeAudio !== false,
      });
      return;
    }
    editShotMutation.mutate({
      runId,
      shotId: input.shotId,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey(
        "edit-shot",
        String(input.shotId ?? "story")
      ),
      ...(input.storySummary !== undefined
        ? { storySummary: input.storySummary }
        : {}),
      ...(input.dialogue !== undefined ? { dialogue: input.dialogue } : {}),
      ...(input.imagePrompt !== undefined
        ? { imagePrompt: input.imagePrompt }
        : {}),
      ...(input.videoPrompt !== undefined
        ? { videoPrompt: input.videoPrompt }
        : {}),
    });
  };
  const onRetry = (input: StagedCheckpointRetry) => {
    if (!stateDigest) return;
    if (input.stage === "story") {
      redraftMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("retry-story", runId),
        notes: input.notes || undefined,
      });
    } else if (input.stage === "audio") {
      retryAudioMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("retry-audio", runId),
      });
    } else if (input.stage === "final") {
      retryFinalMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("retry-final", runId),
      });
    } else if (input.shotId) {
      retryShotMutation.mutate({
        runId,
        shotId: input.shotId,
        stage: input.stage,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey(
          `retry-${input.stage}`,
          String(input.shotId)
        ),
      });
    }
  };
  return (
    <div className={props.className}>
      <StagedCheckpointReviewPanel
        runId={runId}
        state={state}
        loading={stateQuery.isLoading}
        error={actionError ?? stateQuery.error?.message ?? null}
        pending={Boolean(pendingMutation)}
        pendingAction={pendingMutation}
        onRefresh={refresh}
        onApprove={onApprove}
        onReject={onReject}
        onEdit={onEdit}
        onRetry={onRetry}
      />
    </div>
  );
}
