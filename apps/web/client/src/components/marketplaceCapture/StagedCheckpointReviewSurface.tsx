import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { readShotMediaFileAsDataUrl } from "@/lib/marketplaceShotMediaUpload";
import {
  StagedCheckpointReviewPanel,
  type ReferenceManifestItem,
  type StagedBulkGenerateTarget,
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
  // Tracks the sequential bulk-generate chain specifically (see
  // onBulkGenerate below) rather than reusing retryShotMutation.isPending —
  // that flag can briefly flip false between two awaited calls in the same
  // chain, which would let other action buttons re-enable mid-chain.
  const [bulkGeneratePending, setBulkGeneratePending] = useState(false);
  // Tracks the per-shot "generate prompt then dispatch" chain (see
  // onGenerateAndDispatch below) for the same reason as bulkGeneratePending
  // above — generatePromptMutation.isPending / retryShotMutation.isPending
  // can each briefly read false in the gap between the two awaited calls,
  // which would flicker other buttons back to enabled mid-chain. Holds the
  // exact `generate-{stage}-{shotId}` key so the Panel's `action()` helper
  // can match it to show "กำลังดำเนินการ…" on the ONE button that was
  // clicked, not every generate button across every shot.
  const [chainPendingKey, setChainPendingKey] = useState<string | null>(null);
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
  // Raw backend reason codes that are actually user-actionable get a
  // plain-Thai explanation instead of the bare code. This lives on the
  // SHARED mutation onError (not inside one handler's catch) so every path
  // that can hit the precondition benefits — originally this remap lived
  // only inside onGenerateAndDispatch's catch block, which became
  // unreachable when the consolidated one-click button was split back into
  // separate "สร้าง Prompt" / "สร้างภาพ" steps, silently regressing the
  // message back to a raw error code for the dispatch-only video button.
  const friendlyActionError = (message: string): string => {
    if (
      message === "staged_image_result_not_approved" ||
      message === "staged_image_artifact_missing"
    ) {
      return 'ยังไม่มีภาพที่อนุมัติแล้วสำหรับช็อตนี้ — กรุณากดปุ่ม "สร้างภาพ" ของช็อตนี้ให้เสร็จก่อน แล้วค่อยสร้างวิดีโอ';
    }
    if (message === "staged_image_prompt_missing") {
      return 'ช็อตนี้ยังไม่มี Prompt ภาพ — กรุณากดปุ่ม "สร้าง Prompt ภาพ" ของช็อตนี้ก่อน แล้วค่อยกดสร้างภาพ';
    }
    if (message === "staged_video_prompt_missing") {
      return 'ช็อตนี้ยังไม่มี Prompt วิดีโอ — กรุณากดปุ่ม "สร้าง Prompt วิดีโอ" ของช็อตนี้ก่อน แล้วค่อยกดสร้างวิดีโอ';
    }
    if (message === "staged_media_task_in_flight") {
      return "ช็อตนี้กำลังสร้างอยู่แล้ว กรุณารอให้เสร็จก่อน (สถานะจะอัปเดตอัตโนมัติ)";
    }
    if (message === "staged_render_clips_incomplete") {
      return "ยังมีช็อตที่วิดีโอไม่ครบ — ต้องมีวิดีโอครบทุกช็อตก่อนจึงจะส่ง render ได้";
    }
    if (message === "staged_render_not_full_video") {
      return "งานนี้เป็นโหมดภาพนิ่ง (storyboard) จึงไม่มีขั้นรวมวิดีโอ";
    }
    if (message.startsWith("staged_render_submit_failed")) {
      const code = message.split(":")[1];
      return `ส่งงาน render ไปที่คิวไม่สำเร็จ${code ? ` (${code})` : ""} — ตรวจว่ามีวิดีโอครบและลองใหม่อีกครั้ง`;
    }
    if (message === "staged_state_drift") {
      return "ข้อมูลบนหน้าจอไม่ตรงกับเซิร์ฟเวอร์ (อาจมีการเปลี่ยนแปลงพร้อมกัน) — ระบบกำลังรีเฟรชให้ กรุณากดใหม่อีกครั้ง";
    }
    return message;
  };
  const mutationOptions: {
    onSuccess: () => Promise<void>;
    onError: (error: { message: string }) => void;
  } = {
    onSuccess: async () => {
      setActionError(null);
      await stateQuery.refetch();
    },
    onError: (error: { message: string }) => {
      setActionError(friendlyActionError(error.message));
      // A digest mismatch means this client is holding a stale snapshot —
      // retrying with the SAME stale digest would just drift again. Pull a
      // fresh one immediately so the user's next click actually lands.
      // Fire-and-forget: never re-enter the mutation's own error path.
      if (error.message === "staged_state_drift") {
        void stateQuery.refetch();
      }
    },
  };
  const approveMutation =
    trpc.marketplaceCapture.approveStagedAutoReviewCheckpoint.useMutation(
      mutationOptions
    );
  // Older isolated component tests intentionally provide a partial tRPC
  // mock. Keep the new additive mutation optional at the client boundary so
  // those tests (and any embedded legacy surface) remain renderable; the
  // production router always supplies the real hook.
  const creativeQcProcedure = (trpc.marketplaceCapture as any)
    .startAutoReviewDraftQualityQc;
  const creativeQcMutation = creativeQcProcedure?.useMutation
    ? creativeQcProcedure.useMutation(mutationOptions)
    : {
        isPending: false,
        error: null,
        mutate: (_input: unknown) => undefined,
      };
  const creativeQcRepairProcedure = (trpc.marketplaceCapture as any)
    .startAutoReviewDraftQualityQcRepair;
  const creativeQcRepairMutation = creativeQcRepairProcedure?.useMutation
    ? creativeQcRepairProcedure.useMutation(mutationOptions)
    : {
        isPending: false,
        error: null,
        mutate: (_input: unknown) => undefined,
      };
  const creativeQcSelectRepairProcedure = (trpc.marketplaceCapture as any)
    .selectAutoReviewDraftQualityQcRepair;
  const creativeQcSelectRepairMutation = creativeQcSelectRepairProcedure?.useMutation
    ? creativeQcSelectRepairProcedure.useMutation(mutationOptions)
    : {
        isPending: false,
        error: null,
        mutate: (_input: unknown) => undefined,
      };
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
  const generatePromptMutation =
    trpc.marketplaceCapture.generateStagedAutoReviewShotPrompt.useMutation(
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
  const saveRenderSettingsMutation =
    trpc.marketplaceCapture.updateStagedAutoReviewFinalRenderSettings.useMutation(
      mutationOptions
    );
  const submitFinalRenderMutation =
    trpc.marketplaceCapture.submitStagedAutoReviewFinalRender.useMutation(
      mutationOptions
    );
  // Deliberately NOT in `mutationOptions` / `pendingMutation`: the upload owns
  // its own inline busy state inside the panel's overlay drop zone, so an
  // in-flight upload must not raise the panel-wide pending flag that once
  // disabled every other button (2026-07-30 dead-button incident).
  const uploadOverlayImageMutation =
    trpc.marketplaceCapture.uploadStagedAutoReviewOverlayImage.useMutation();
  const saveLanguagePlanMutation =
    trpc.marketplaceCapture.saveAutoReviewSequentialLanguagePlan.useMutation(
      mutationOptions
    );
  const updateManifestMutation =
    trpc.marketplaceCapture.updateStagedAutoReviewReferenceManifest.useMutation(
      mutationOptions
    );
  const updateShotCastMutation =
    trpc.marketplaceCapture.updateStagedAutoReviewShotCast.useMutation(
      mutationOptions
    );
  // Deliberately NOT included in mutationOptions / pendingMutation below —
  // this mutation's pending state is tracked entirely inside the Panel's own
  // per-shot, per-stage `uploadingShotMedia` Set (keyed by `${stage}:${shotId}`)
  // so an in-flight upload on one slot never disables every OTHER button in
  // the whole panel the way the shared `pendingAction` gate does for every
  // other mutation here. It still shares `mutationOptions` for the
  // onSuccess-refetch / onError-sets-actionError behavior every other
  // mutation in this file gets.
  const uploadShotMediaMutation =
    trpc.marketplaceCapture.uploadStagedAutoReviewShotMedia.useMutation(
      mutationOptions
    );
  const pendingMutation = useMemo(() => {
    // The generate-then-dispatch chain owns its own precise pending key
    // (see chainPendingKey above) — surface that verbatim instead of a
    // generic category so the Panel's exact-match check on `action()`'s id
    // only lights up the ONE button the user clicked, not every generate
    // button across every shot.
    if (chainPendingKey) return chainPendingKey;
    const entries: Array<[string, boolean]> = [
      ["approve", approveMutation.isPending],
      ["creative-qc", creativeQcMutation.isPending],
      ["creative-qc-repair", creativeQcRepairMutation.isPending],
      ["creative-qc-repair-select", creativeQcSelectRepairMutation.isPending],
      ["accept-image", acceptImageMutation.isPending],
      ["reject", rejectMutation.isPending],
      ["edit-shot", editShotMutation.isPending],
      ["generate-prompt", generatePromptMutation.isPending],
      ["edit-audio", editAudioMutation.isPending],
      ["edit-final", editFinalMutation.isPending],
      ["retry-shot", retryShotMutation.isPending],
      ["retry-audio", retryAudioMutation.isPending],
      ["retry-final", retryFinalMutation.isPending],
      ["retry-story", redraftMutation.isPending],
      ["language-plan", saveLanguagePlanMutation.isPending],
      ["update-manifest", updateManifestMutation.isPending],
      ["save-render-settings", saveRenderSettingsMutation.isPending],
      ["submit-final-render", submitFinalRenderMutation.isPending],
      ["bulk-generate", bulkGeneratePending],
    ];
    return entries.find(([, pending]) => pending)?.[0] ?? null;
  }, [
    acceptImageMutation.isPending,
    approveMutation.isPending,
    bulkGeneratePending,
    chainPendingKey,
    creativeQcMutation.isPending,
    creativeQcRepairMutation.isPending,
    creativeQcSelectRepairMutation.isPending,
    editAudioMutation.isPending,
    editFinalMutation.isPending,
    editShotMutation.isPending,
    generatePromptMutation.isPending,
    redraftMutation.isPending,
    rejectMutation.isPending,
    retryAudioMutation.isPending,
    retryFinalMutation.isPending,
    retryShotMutation.isPending,
    saveLanguagePlanMutation.isPending,
    saveRenderSettingsMutation.isPending,
    submitFinalRenderMutation.isPending,
    updateManifestMutation.isPending,
  ]);
  if (!enabled) return null;
  const state = stateQuery.data as StagedReviewState | null | undefined;
  const stateDigest = state?.stateDigest ?? "";
  // Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
  // shot 8): every action handler below used to silently `return` when
  // `stateDigest` was empty — a click with no visible error and (confirmed
  // via server logs) no request reaching the server at all, which read to
  // the user as "the button does nothing." `stateDigest` is only
  // empty/falsy while `stateQuery` has no data yet (first load, or a query
  // error with no prior successful fetch to fall back on). Centralized so
  // every action surfaces the same explanation instead of silently no-oping.
  const requireStateDigest = (): boolean => {
    if (stateDigest) return true;
    setActionError(
      "ระบบยังโหลดข้อมูลล่าสุดไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง"
    );
    return false;
  };

  const onApprove = (input: {
    checkpoint: StagedCheckpoint;
    expected: Parameters<typeof approveMutation.mutate>[0]["expected"];
  }) => {
    if (!requireStateDigest()) return;
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
    if (!requireStateDigest()) return;
    rejectMutation.mutate({
      runId,
      checkpointId: checkpoint.checkpointId,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey("reject", checkpoint.checkpointId),
      reasonCode: "user_requested_correction",
    });
  };
  const onEdit = (input: StagedCheckpointEdit) => {
    if (!requireStateDigest()) return;
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
  const onSaveRenderSettings = (settings: {
    subtitlePresetId?: string;
    aiDisclosureEnabled?: boolean;
    overlayText?: NonNullable<StagedReviewState["finalRender"]>["settings"]["overlayText"];
    overlayImage?: NonNullable<StagedReviewState["finalRender"]>["settings"]["overlayImage"];
  }) => {
    if (!requireStateDigest()) return;
    saveRenderSettingsMutation.mutate({
      runId,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey("render-settings", runId),
      settings: settings as never,
    });
  };
  const onUploadOverlayImage = async (file: {
    fileName: string;
    fileType: string;
    fileBase64: string;
  }): Promise<string> => {
    const result: any = await uploadOverlayImageMutation.mutateAsync({
      runId,
      ...file,
    });
    const url = typeof result?.url === "string" ? result.url : "";
    if (!url) throw new Error("เซิร์ฟเวอร์ไม่ได้คืน URL ของภาพ");
    return url;
  };
  const onSubmitFinalRender = () => {
    // Deliberately NOT gated on `requireStateDigest()` — this mutation takes
    // no digest, so a not-yet-loaded snapshot is irrelevant to it and
    // blocking on one would be another silent dead button.
    submitFinalRenderMutation.mutate({ runId });
  };
  const onRetry = (input: StagedCheckpointRetry) => {
    if (!requireStateDigest()) return;
    if (input.stage === "story") {
      redraftMutation.mutate({
        runId,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey("retry-story", runId),
        notes: input.notes || undefined,
        model: input.model || undefined,
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
        autoApprove: input.autoApprove === true,
        model: input.model || undefined,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey(
          `retry-${input.stage}`,
          String(input.shotId)
        ),
      });
    }
  };
  // Fires every target's retry sequentially, one await at a time — never
  // Promise.all / a synchronous forEach. Each mutation is gated on the
  // ENTIRE run's metadata digest (stagedMetadataStateDigest), not a
  // per-checkpoint one, so firing several at once would let only the first
  // land and 409 ("staged_state_drift") every other one — the same bug the
  // old "approve all images/videos" buttons had. Chaining the fresh
  // stateDigest from each response into the next call's expectedStateDigest
  // (instead of the one `stateDigest` captured before the loop started, or
  // a full stateQuery.refetch() round trip between each shot) is what makes
  // this safe.
  const onBulkGenerate = async (targets: StagedBulkGenerateTarget[]) => {
    if (targets.length === 0) return;
    // See onGenerateAndDispatch's matching comment (field incident
    // 2026-07-29) — surface these instead of silently no-opping.
    if (bulkGeneratePending) {
      setActionError(
        "กำลังดำเนินการสร้างหลายช็อตอยู่ กรุณารอให้เสร็จก่อนแล้วลองใหม่"
      );
      return;
    }
    if (!requireStateDigest()) return;
    setBulkGeneratePending(true);
    setActionError(null);
    let digest = stateDigest;
    const failedShotIds: number[] = [];
    for (const target of targets) {
      try {
        const response = await retryShotMutation.mutateAsync({
          runId,
          shotId: target.shotId,
          stage: target.stage,
          autoApprove: true,
          model: target.model || undefined,
          expectedStateDigest: digest,
          idempotencyKey: uiIdempotencyKey(
            `bulk-generate-${target.stage}`,
            String(target.shotId)
          ),
        });
        const nextDigest = (
          response as { operation?: { stateDigest?: string } } | undefined
        )?.operation?.stateDigest;
        if (nextDigest) digest = nextDigest;
      } catch {
        failedShotIds.push(target.shotId);
      }
    }
    setBulkGeneratePending(false);
    if (failedShotIds.length > 0) {
      setActionError(
        `สั่งสร้างไม่สำเร็จสำหรับช็อตที่ ${failedShotIds.join(", ")} — ลองกด retry เฉพาะช็อตนั้นอีกครั้ง`
      );
    }
  };
  const onGeneratePrompt = (input: {
    shotId: number;
    stage: "image" | "video";
    // Optional free-text instruction from the panel's "AI ปรับแต่งด้วย
    // คำสั่งเพิ่มเติม" dialog — forwarded as-is to the mutation's own
    // optional `instruction` field. Omitted for the plain regenerate
    // button, matching the pre-existing no-instruction call shape exactly.
    instruction?: string;
  }) => {
    if (!requireStateDigest()) return;
    generatePromptMutation.mutate({
      runId,
      shotId: input.shotId,
      stage: input.stage,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey(
        `generate-prompt-${input.stage}`,
        String(input.shotId)
      ),
      ...(input.instruction ? { instruction: input.instruction } : {}),
    });
  };
  // The consolidated one-click "สร้างภาพ/สร้างวิดีโอ" action: writes a fresh
  // prompt via generatePromptMutation (now synchronous server-side — it
  // actually awaits the skill/LLM call before resolving), then immediately
  // dispatches generation with THAT fresh prompt via retryShotMutation,
  // chaining the fresh stateDigest the first call just returned into the
  // second call's expectedStateDigest — never the pre-click stale digest
  // (same digest-chaining pattern as onBulkGenerate above). If the first
  // step fails, the second step is never attempted, matching
  // onBulkGenerate's per-target try/catch.
  const onGenerateAndDispatch = async (input: {
    shotId: number;
    stage: "image" | "video";
    model?: string;
  }) => {
    // Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
    // shot 8): this used to be a silent `return` for BOTH guard conditions —
    // a click that produced no error, no toast, and (confirmed via server
    // logs) no request reaching the server at all. Distinguish the two
    // cases so the user always gets an explanation instead of ambiguous
    // silence: `chainPendingKey` means a generate-and-dispatch chain for
    // some shot is already mid-flight (this button, or another shot's);
    // missing `stateDigest` means the run's state hasn't finished loading
    // yet (first load, or a query error with no prior successful fetch).
    if (chainPendingKey) {
      setActionError(
        "กำลังดำเนินการสร้างช็อตอื่นอยู่ กรุณารอให้เสร็จก่อนแล้วลองใหม่"
      );
      return;
    }
    if (!requireStateDigest()) return;
    const key = `generate-${input.stage}-${input.shotId}`;
    setChainPendingKey(key);
    setActionError(null);
    try {
      const promptResponse = await generatePromptMutation.mutateAsync({
        runId,
        shotId: input.shotId,
        stage: input.stage,
        expectedStateDigest: stateDigest,
        idempotencyKey: uiIdempotencyKey(
          `generate-prompt-${input.stage}`,
          String(input.shotId)
        ),
      });
      const freshDigest =
        (
          promptResponse as
            | { operation?: { stateDigest?: string } }
            | undefined
        )?.operation?.stateDigest ?? stateDigest;
      await retryShotMutation.mutateAsync({
        runId,
        shotId: input.shotId,
        stage: input.stage,
        autoApprove: true,
        model: input.model || undefined,
        expectedStateDigest: freshDigest,
        idempotencyKey: uiIdempotencyKey(
          `generate-dispatch-${input.stage}`,
          String(input.shotId)
        ),
      });
    } catch {
      // Both mutations share `mutationOptions.onError`, which already ran
      // and set `actionError` — including the plain-Thai remap of
      // user-actionable reason codes (see `friendlyActionError` above, which
      // now owns that mapping for EVERY mutation path rather than only this
      // one). Nothing further to do here beyond stopping the chain, matching
      // onBulkGenerate's stop-on-first-failure behavior.
    } finally {
      setChainPendingKey(null);
    }
  };
  // Manual drag-and-drop / tap-to-browse replacement of a shot's image or
  // video slot with a local file (see the Panel's per-slot drop zones and
  // "📤 อัปโหลดไฟล์แทน" fallback button). Reads the File into a base64 data
  // URL client-side, then calls the same uploadStagedAutoReviewShotMedia
  // mutation whether the slot is currently empty or already holds an
  // AI-generated result — the backend replaces the artifact either way.
  // Client-side type/size validation already happened in the Panel before
  // this is ever called (see validateMarketplaceShotMediaFile), so this
  // stays a thin FileReader → mutation bridge.
  const onUploadShotMedia = async (input: {
    shotId: number;
    stage: "image" | "video";
    file: File;
  }) => {
    if (!requireStateDigest()) return;
    const fileBase64 = await readShotMediaFileAsDataUrl(input.file);
    await uploadShotMediaMutation.mutateAsync({
      runId,
      shotId: input.shotId,
      stage: input.stage,
      fileName: input.file.name,
      fileType: input.file.type,
      fileBase64,
      expectedStateDigest: stateDigest,
      idempotencyKey: uiIdempotencyKey(
        `upload-shot-media-${input.stage}`,
        String(input.shotId)
      ),
    });
  };
  const onLanguagePlanChange = (plan: {
    summaryLanguage: "th" | "en";
    dialogueLanguage: "th" | "en";
    promptLanguage: "th" | "en";
  }) => {
    saveLanguagePlanMutation.mutate({ runId, ...plan });
  };
  const onUpdateReferenceManifest = (manifest: ReferenceManifestItem[]) => {
    updateManifestMutation.mutate({ runId, referenceManifest: manifest });
  };
  /** Per-shot cast presence / look override
   *  (`planning/marketplace-four-character-cast/plan.md` §6) — free, so it
   *  follows the same fire-and-refetch shape as the manifest update above. */
  const onUpdateShotCast = (input: {
    shotId: number;
    castInShot?: string[];
    castLooks?: Record<
      string,
      { url: string; vdCharacterId?: string; variantLabel?: string }
    >;
  }) => {
    updateShotCastMutation.mutate({ runId, ...input });
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
        onStartCreativeQc={rounds =>
          creativeQcMutation.mutate({ runId, maxImprovementRounds: rounds })
        }
        creativeQcStarting={creativeQcMutation.isPending}
        creativeQcError={creativeQcMutation.error?.message ?? null}
        onRepairCreativeQc={() => creativeQcRepairMutation.mutate({ runId })}
        onSelectCreativeQcRepair={() =>
          creativeQcSelectRepairMutation.mutate({ runId })
        }
        creativeQcRepairing={creativeQcRepairMutation.isPending}
        creativeQcRepairError={creativeQcRepairMutation.error?.message ?? null}
        onReject={onReject}
        onEdit={onEdit}
        onGeneratePrompt={onGeneratePrompt}
        onGenerateAndDispatch={onGenerateAndDispatch}
        onRetry={onRetry}
        onBulkGenerate={onBulkGenerate}
        onUploadShotMedia={onUploadShotMedia}
        onLanguagePlanChange={onLanguagePlanChange}
        onUpdateReferenceManifest={onUpdateReferenceManifest}
        onUpdateShotCast={onUpdateShotCast}
        onSaveRenderSettings={onSaveRenderSettings}
        onSubmitFinalRender={onSubmitFinalRender}
        onUploadOverlayImage={onUploadOverlayImage}
      />
    </div>
  );
}
