/**
 * Vertical Drama Series — self-contained bilingual (Thai/English) copy + the
 * ~4-phase grouping the episode workspace renders (spec §04 §16).
 *
 * Copy lives here (not react-i18next namespaces) so these feature components are
 * drop-in without new translation-namespace wiring. Pick a language with the
 * `locale` prop; components default to the app's resolved locale.
 */

import {
  CheckCircle2,
  Clapperboard,
  Eye,
  FileText,
  Film,
  ImageIcon,
  ListChecks,
  Music,
  RefreshCw,
  Sparkles,
  UserSquare2,
  type LucideIcon,
} from "lucide-react";

import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries";
import type { VerticalDramaSilenceIntent } from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaDialogueQualityIssueCode } from "@shared/verticalDramaSeries/dialogueQuality";
import type { VerticalDramaQualityRepairGroup } from "@shared/verticalDramaSeries/qualityPolicy";
import type {
  VerticalDramaProductionWizardBlockingReasonCode,
  VerticalDramaProductionWizardCriterionId,
  VerticalDramaProductionWizardEvidenceId,
  VerticalDramaProductionWizardOutOfScopeNoteId,
  VerticalDramaProductionWizardPassState,
  VerticalDramaProductionWizardPrimaryAction,
  VerticalDramaProductionWizardQualityLoopStatus,
  VerticalDramaProductionWizardScriptCoverageStatus,
  VerticalDramaProductionWizardStepId,
  VerticalDramaProductionWizardStepStatus,
} from "@shared/verticalDramaSeries/productionWizard";

export type VdLocale = "th" | "en";

export type VdPhaseId =
  | "plan"
  | "frames"
  | "prompt_handoff"
  | "generate_assemble";

export interface VdPhase {
  id: VdPhaseId;
  labelEn: string;
  labelTh: string;
  stages: VerticalDramaPipelineStage[];
}

/** The ~4 operator-facing phases the 15 canonical stages group into (spec §16). */
export const VD_PHASES: readonly VdPhase[] = [
  {
    id: "plan",
    labelEn: "Plan",
    labelTh: "วางแผน",
    stages: [
      "normalize_series_input",
      "plan_episode_script",
      "update_character_visual_bible",
      "generate_or_import_character_refs",
    ],
  },
  {
    id: "frames",
    labelEn: "Frames",
    labelTh: "เฟรม",
    stages: [
      "storyboard_shotgrid",
      "start_frame_render_plan",
      "render_or_import_start_frames",
      "approve_start_frames",
    ],
  },
  {
    id: "prompt_handoff",
    labelEn: "Prompt & Handoff",
    labelTh: "พรอมป์และส่งต่อ",
    stages: [
      "dialogue_audio_plan",
      "video_motion_prompt_pack",
      "create_storyboard_review_project",
      "review_generate_repair_in_storyboard_review",
    ],
  },
  {
    id: "generate_assemble",
    labelEn: "Generate & Assemble",
    labelTh: "สร้างและประกอบ",
    stages: [
      "render_or_import_video_clips",
      "assemble_episode_manifest",
      "summarize_episode_to_series_memory",
    ],
  },
] as const;

export function vdPhaseForStage(stage: VerticalDramaPipelineStage): VdPhase {
  return VD_PHASES.find(p => p.stages.includes(stage)) ?? VD_PHASES[0];
}

export function vdPhaseLabel(phase: VdPhase, locale: VdLocale): string {
  return locale === "th" ? phase.labelTh : phase.labelEn;
}

/** Human, bilingual stage labels. */
export const VD_STAGE_LABELS: Record<
  VerticalDramaPipelineStage,
  { en: string; th: string }
> = {
  normalize_series_input: { en: "Normalize input", th: "จัดรูปแบบข้อมูล" },
  plan_episode_script: { en: "Sub-episode script", th: "บทตอนย่อย" },
  update_character_visual_bible: {
    en: "Character visual bible",
    th: "ไบเบิลตัวละคร",
  },
  generate_or_import_character_refs: {
    en: "Character references",
    th: "ภาพอ้างอิงตัวละคร",
  },
  storyboard_shotgrid: { en: "9-shot storyboard", th: "สตอรีบอร์ด 9 ช็อต" },
  start_frame_render_plan: { en: "Start-frame plan", th: "แผนเฟรมเริ่ม" },
  render_or_import_start_frames: {
    en: "Render start frames",
    th: "เรนเดอร์เฟรมเริ่ม",
  },
  approve_start_frames: { en: "Approve start frames", th: "อนุมัติเฟรมเริ่ม" },
  dialogue_audio_plan: { en: "Dialogue & audio", th: "บทพูดและเสียง" },
  video_motion_prompt_pack: {
    en: "Motion prompt pack",
    th: "ชุดพรอมป์การเคลื่อนไหว",
  },
  create_storyboard_review_project: {
    en: "Storyboard Review project",
    th: "โปรเจกต์รีวิวสตอรีบอร์ด",
  },
  review_generate_repair_in_storyboard_review: {
    en: "Review, generate, repair",
    th: "รีวิว สร้าง ซ่อม",
  },
  render_or_import_video_clips: {
    en: "Render video clips",
    th: "เรนเดอร์คลิปวิดีโอ",
  },
  assemble_episode_manifest: {
    en: "Assemble Sub-episode",
    th: "ประกอบตอนย่อย",
  },
  summarize_episode_to_series_memory: {
    en: "Update series memory",
    th: "อัปเดตความจำซีรีส์",
  },
};

export function vdStageLabel(
  stage: VerticalDramaPipelineStage,
  locale: VdLocale
): string {
  const l = VD_STAGE_LABELS[stage];
  return locale === "th" ? l.th : l.en;
}

/**
 * Icon that best represents each stage's output type (video, audio,
 * manifest/document, review, images, etc.) — used by artifact/run listings so
 * the media kind is recognizable at a glance instead of only reading text.
 */
export const VD_STAGE_ICONS: Record<VerticalDramaPipelineStage, LucideIcon> = {
  normalize_series_input: ListChecks,
  plan_episode_script: FileText,
  update_character_visual_bible: UserSquare2,
  generate_or_import_character_refs: ImageIcon,
  storyboard_shotgrid: Clapperboard,
  start_frame_render_plan: Sparkles,
  render_or_import_start_frames: ImageIcon,
  approve_start_frames: CheckCircle2,
  dialogue_audio_plan: Music,
  video_motion_prompt_pack: Film,
  create_storyboard_review_project: Eye,
  review_generate_repair_in_storyboard_review: RefreshCw,
  render_or_import_video_clips: Film,
  assemble_episode_manifest: FileText,
  summarize_episode_to_series_memory: ListChecks,
};

export function vdStageIcon(stage: VerticalDramaPipelineStage): LucideIcon {
  return VD_STAGE_ICONS[stage] ?? FileText;
}

/** Central bilingual UI string table for the section-04 surfaces. */
export const VD_COPY = {
  en: {
    runDryRun: "Run dry run",
    runPlanOnly: "Plan only",
    generateImages: "Generate images (paid)",
    generateVideo: "Generate video (paid)",
    generateRealScript: "Generate real script (paid)",
    generatingRealScript: "Generating…",
    generateRealScriptConfirmWarning:
      "This uses real AI generation and spends credits.",
    generateRealScriptConfirmNote:
      "Continue only if you want the actual Sub-episode script, not the free placeholder.",
    regenerateStage: "Regenerate (delete old)",
    regenerateConfirm:
      "Deletes the current output and creates new — cannot be undone.",
    regenerateConfirmButton: "Delete & regenerate",
    regenerating: "Regenerating…",
    generateEpisode: "Generate this Sub-episode (paid)",
    generateEpisodeExplain:
      "One click generates the Sub-episode script, syncs character data, checks references, and builds the 9-shot storyboard.",
    generateEpisodeConfirmNote:
      "This runs the full setup in one go — script + storyboard generation, real AI, spends credits.",
    generateEpisodeConfirmButton: "Generate",
    generateEpisodeProgress: "Working on:",
    generateEpisodeFailedAt: "Stopped at:",
    generateEpisodeRetry: "Retry",
    syncCharacterData: "Sync character data",
    approve: "Approve",
    reject: "Reject",
    repair: "Repair",
    approving: "Approving…",
    approved: "Approved",
    rejected: "Rejected",
    rejectionReason: "Rejection reason",
    nextAction: "Next action",
    phaseProgress: "Phase progress",
    running: "Running",
    completed: "Completed",
    blocked: "Blocked",
    waitingForApproval: "Waiting for approval",
    failed: "Failed",
    runs: "Runs",
    noRuns: "No runs yet",
    openLedger: "Open artifact ledger",
    openStoryboardReview: "Open Storyboard Review",
    memoryTimeline: "Memory timeline",
    currentSummary:
      "Current summary (derived view — pending updates not yet applied)",
    noMemory: "No memory events yet",
    retconProposal: "Retcon proposal",
    proposedChange: "Proposed change",
    rationale: "Rationale",
    noRetcon: "No pending retcon proposal",
    repairInstruction: "Repair instruction",
    repairPlaceholder: "Describe what to fix…",
    creditEstimate: "Credit estimate",
    confirmPaidRepair: "This repair spends credits. Confirm to continue.",
    confirm: "Confirm",
    cancel: "Cancel",
    submit: "Submit repair",
    submitting: "Submitting…",
    repairRunning: "Repair running…",
    repairResult: "Repair result",
    newArtifact: "New artifact/version",
    createEpisode: "Create Sub-episode",
    noEpisode: "No Sub-episode yet",
    readOnlyCompleted: "Completed Sub-episode (read-only)",
    dryRunNote: "Dry run: no paid generation.",
    filterKind: "Filter by kind",
    filterEpisode: "Sub-episode #",
    all: "All",
    advancedPipelineDetail: "Advanced — view all pipeline stages & run history",

    /* ---- Model selection (storyboard header, Phase 1.3) ---- */
    imageModel: "Image model",
    videoModel: "Video model",
    chooseModel: "Choose model",
    capabilityStartFrame: "Start frame",
    capabilityNativeAudio: "Native audio",
    capabilityMaxRefs: "Max refs {n}",
    capabilityCreditCost: "{n} credits",
    modelChangeNote:
      "Changing the model only affects future generations — images/clips already made are untouched.",
    modelSelectionSaved: "Model selection saved.",
    capabilityMcpFree: "MCP (0 credits)",
    mcpConnectionLabel: "MCP connection",
    mcpConnectionNeededFor: "Needed for: {n}",
    mcpConnectionMissingToastImage:
      "Select an MCP connection before using this image model.",
    mcpConnectionMissingToastVideo:
      "Select an MCP connection before using this video model.",

    /* ---- Shot reference strip (Phase 2.5) ---- */
    references: "References",
    addReference: "Add reference",
    removeReference: "Remove reference",
    removeReferenceConfirm:
      "Remove this reference image from the shot? This does not delete it from your library.",
    referenceLimitWarning: "This model supports up to {n} reference images.",
    noReferencesYet:
      "No reference images yet — drag one here, or add from the grid cutter/history/library.",
    dropReferenceHint: "Drop an image here to add it as a reference",
    uploadReferenceImage: "Upload image",
    useReferenceAsMain: "Use as main image",
    unsupportedImageFileType: "Only image files are supported",
    imageFileTooLarge: "Image is too large (max {n}MB)",
    uploadingImage: "Uploading…",
    useAsStartFrame: "Use as start frame",
    addAsReferences: "Add as references ({n})",
    pickBestAngleTitle: "Pick the best angle",
    angleTileCount: "{n} tiles",

    /* ---- Upload video file per shot (externally-generated clip) ---- */
    uploadVideoClip: "Upload video",
    uploadingVideoClip: "Uploading video…",
    unsupportedVideoFileType: "Only video files are supported (mp4, webm, mov)",
    videoFileTooLarge: "Video is too large (max {n}MB)",
    videoClipUploaded: "Video uploaded.",
    videoClipUploadFailed: "Failed to upload the video.",
    videoClipSourceUpload: "Self-uploaded video",

    /* ---- Copy prompt / dialogue to clipboard ---- */
    copyPrompt: "Copy",
    copiedPrompt: "Copied.",
    copyDialogue: "Copy",
    copiedDialogue: "Copied.",

    /* ---- Dialogue box (Phase 3.4) ---- */
    dialogueLines: "Dialogue",
    noDialogueLines: "No dialogue lines for this clip.",
    dialogueSpeaksNatively: "Spoken in video",
    dialogueSeparateTts: "Separate TTS audio",
    saveDialogue: "Save",
    editDialogue: "Edit",
    emotionLabel: "Emotion",
    deliveryLabel: "Delivery",
    estimatedDialogueSecondsLabel: "Estimated total speech",

    /* ---- One-click generate + inline prompt editing (Phase 4.1/4.2) ---- */
    generatePromptAndImage: "Generate prompt + image",
    generatingPromptAndImage: "Working…",
    reviewGeneratedPrompt:
      "Review the generated prompt before spending credits",
    savePromptFree: "Save (free)",
    aiAdjustPaid: "AI adjust (paid)",
    promptSaved: "Prompt saved.",
    promptOverLimitHint:
      "Over the limit — it will be auto-refined to fit when you generate.",

    /* ---- One-click generate mode choice + auto-prompt (2026-07-05 fix) ---- */
    chooseGenerateMode: "Choose how to generate",
    generateModeSingle: "Single image",
    generateModeAngles: "9 camera angles (3x3)",
    generateModeSingleHint: "One image for this shot.",
    generateModeAnglesHint: "One 3x3 grid image, then pick the best angle.",
    autoPreparingPrompt: "Preparing the image prompt automatically…",
    autoPromptFailed: "Failed to prepare the image prompt.",
    retry: "Retry",
    reviewAutoPrompt:
      "Review the auto-generated prompt (edit if needed), then generate the image.",
    generateWithThisPrompt: "Generate image",

    /* ---- Video prompt pack generation (2026-07-05 fix) ---- */
    generateVideoPromptPack: "Generate video prompts (paid)",
    generatingVideoPromptPack: "Generating…",
    generateVideoPromptPackConfirmNote:
      "This generates dialogue/audio timing and video motion prompts for every clip — real AI, spends credits.",
    generateVideoPromptPackNeedsStoryboard: "Storyboard is required first.",

    /* ---- Quality review card (Phase 3B.5) ---- */
    qualityReview: "Quality review (AI)",
    runQualityReview: "Check Sub-episode quality (AI)",
    runningQualityReview: "Reviewing…",
    qualityReviewCostNote:
      "Cheap, LLM-only check — run this before spending credits on images/video.",
    qualityOverall: "Overall",
    qualityReversalCount: "Reversals",
    qualityReversalSharpness: "Reversal sharpness",
    qualityEmotionVariety: "Emotion variety",
    qualityDialogueNaturalness: "Dialogue naturalness",
    qualityPacing: "Pacing",
    qualityIssues: "Issues found",
    qualityNoIssues: "No issues flagged.",
    copySuggestedFix: "Copy suggestion",
    copiedSuggestedFix: "Copied — paste it into Repair.",

    /* ---- Quality review approve/alternative loop (3B.6) ---- */
    qualityApply: "Approve & apply suggestions (paid)",
    qualityApplyRunning: "Applying fixes…",
    qualityApplyConfirmTitle: "This will apply the following suggested fixes:",
    qualityApplyConfirmCountTemplate: "Will apply {n} suggested fixes.",
    qualityApplyCostNote:
      "Real AI repair calls — spends credits on each affected stage (script and/or storyboard).",
    qualityApplySuccess: "Fixes applied — Sub-episode re-reviewed.",
    qualityApplySuccessNoReReview:
      "Fixes applied, but the re-review could not run.",
    qualityApplyStaleNotice:
      "Note: downstream stages are now stale — regenerate affected shots' image/video prompts.",
    qualityAlternative: "Re-review — suggest different fixes (paid)",
    qualityAlternativeRunning: "Reviewing…",
    qualityAlternativeSuccess: "New alternative suggestions ready.",

    /* ---- Episode -> series memory summarization (manual trigger) ---- */
    summarizeMemory: "Summarize into series memory (AI)",
    summarizeMemoryButton: "Summarize into series memory (AI)",
    summarizeMemoryRunning: "Summarizing…",
    summarizeMemoryNeedsScript:
      "Sub-episode needs a generated script and storyboard first.",
    summarizeMemoryCostNote:
      "Extracts canonical facts, hooks, character/relationship changes, and continuity risks from this Sub-episode into durable series memory used by future Sub-episodes.",
    summarizeMemoryAlready:
      "This Sub-episode was already summarized into series memory.",
    summarizeMemoryReSummarize: "Re-summarize",
    summarizeMemoryReSummarizeConfirm:
      "Re-summarizing appends a fresh set of memory events for this Sub-episode. The prior summary is kept in history, not deleted. Continue?",
    summarizeMemorySuccess: "Memory saved: {count} events",
    summarizeMemoryFailed:
      "Failed to summarize Sub-episode into series memory.",

    /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ---- */
    resolutionLabel: "Resolution",
    resolutionAuto: "Default",

    /* ---- Repair image (image-to-image) dialog (Phase 6.5) ---- */
    repairImage: "Fix image (AI)",
    repairImageDialogTitle: "Fix this image with AI",
    repairImageInstructionLabel: "What do you want to change in this image?",
    repairImageInstructionPlaceholder:
      "e.g. change the outfit, change the background",
    repairImageSubmit: "Generate fix",
    repairImageSubmitting: "Submitting…",
    repairImageWorking: "Generating the fixed image…",
    repairImageBefore: "Before",
    repairImageAfter: "After",
    repairImageUseNew: "Use the new image",
    repairImageKeepOld: "Keep the original",
    repairImageApplied: "Replaced with the new image.",
    repairImageDiscarded:
      "Kept the original image — the new one stays in history.",
    repairImageUnsupportedModel:
      "This model does not support image-to-image editing.",
    repairImageUnsupportedModelWithList:
      "This model does not support image-to-image editing. Models that support it: {n}",
    repairImageFailed: "Failed to generate the fixed image.",
    repairImageNeedsApprovedImage:
      "This shot needs an approved image before it can be fixed.",

    /* ---- Per-shot video prompt generation (Phase 6.6) ---- */
    generateShotVideoPrompt: "Generate video prompt (AI)",
    generatingShotVideoPrompt: "Analyzing image…",
    generateShotVideoPromptNeedsImage:
      "This shot needs an approved image first.",
    generateShotVideoPromptFailed: "Failed to generate the video prompt.",
    usedVisionNote: "Analyzed from the actual image",
    generateVideoPromptPackWholeEpisode:
      "Generate video prompts for the whole Sub-episode",

    /* ---- Regenerate clip dialogue (2026-07-07 unusable-dialogue fix) ---- */
    regenerateClipDialogue: "Generate new dialogue (AI)",
    regeneratingClipDialogue: "Writing dialogue…",
    regenerateClipDialogueInstructionPlaceholder:
      "Optional: describe the direction you want, e.g. shorter / less formal",
    regenerateClipDialogueSubmit: "Generate",
    regenerateClipDialogueCancel: "Cancel",
    regenerateClipDialogueFailed: "Failed to generate new dialogue.",
    regenerateClipDialogueSuccess: "New dialogue generated.",
    regenerateClipDialogueUpdatePromptPrompt:
      "Update the video prompt to match the new dialogue?",
    regenerateClipDialogueUpdatePromptAction: "Update video prompt",
    dialogueOriginScriptHint:
      "From the script — check it sounds natural before using it.",

    /* ---- Completed video-clip player (2026-07-06 fix — completed video
       renders were never persisted/shown; only a transient toast) ---- */
    videoClipGenerating: "Generating video…",
    videoClipRegenerate: "Regenerate",
    videoClipOpenFull: "Open full screen",
    videoClipDurationLabel: "sec",
    download: "Download",

    /* ---- Whole-episode compiled video (2026-07-06 download + assembly upgrade) ---- */
    compiledVideoTitle: "Compiled Sub-episode video",
    compiledVideoAssemble: "Assemble full Sub-episode video",
    compiledVideoReassemble: "Re-assemble",
    compiledVideoReassembleConfirm:
      "This replaces the current compiled video and cannot be undone.",
    compiledVideoReadyHint: "{ready}/{total} clips ready",
    compiledVideoMissingWarning:
      "Missing clips: {list} — generate those clips first, or assemble with only the completed clips.",
    compiledVideoAssemblePartial: "Assemble with completed clips only",
    compiledVideoProcessing: "Assembling the full Sub-episode video…",
    compiledVideoFailed: "Failed to assemble the full Sub-episode video.",
    compiledVideoRetry: "Retry",
    compiledVideoDurationLabel: "sec",
    compiledVideoPartialBadge: "Partial ({n} clips)",
    compiledVideoAssembleFailedToast: "Failed to start assembly.",
    compiledVideoAssembleStartedToast:
      "Started assembling the full Sub-episode video.",

    /* ---- Ad Banner Overlay — per-episode banner selection (F131W, task
       #30-A2, plan.md §6 episode side) ---- */
    adBannerSectionTitle: "Ad banners in this video",
    adBannerEnableLabel: "Enable ad banner overlay",
    adBannerNoDesigns:
      "No ready ad banner designs yet — create them in the Product Tie-in tab first.",
    adBannerPlacementBottomBand: "Bottom band",
    adBannerPlacementSideVertical: "Side vertical",
    adBannerPlacementFullscreen: "Fullscreen",
    adBannerApprovalRequiredBadge: "Needs approval before use",
    adBannerTimingEntire: "Whole clip",
    adBannerTimingWindow: "Time window",
    adBannerStartSecLabel: "Start (sec)",
    adBannerDurationSecLabel: "Duration (sec)",
    adBannerTooManyError: "You can select at most {n} ad banners.",
    adBannerFullscreenOverlapError:
      "Selected fullscreen ad banners overlap in time.",
    adBannerSave: "Save ad banners",
    adBannerSaving: "Saving…",

    /* ---- Video-prompt language options (episode-level language plan) ---- */
    promptLanguageLabel: "Prompt language",
    promptLanguageEn: "English (recommended)",
    promptLanguageTh: "Thai",
    promptLanguageZh: "Chinese",
    promptLanguageJa: "Japanese",
    promptLanguageKo: "Korean",
    dialogueLanguageLabel: "Speech language",
    thaiAccentLabel: "Thai speech accent",
    videoPromptLanguageSaved: "Language settings saved.",

    /* ---- Native audio direction toggle (task #36, added 2026-07-09) ---- */
    nativeAudioToggleLabel:
      "Include SFX & ambient sound cues in video prompts (entire Sub-episode)",
    nativeAudioToggleHint:
      "When enabled, 'Generate Video Prompt' integrates SFX & ambient soundscape cues directly inside every shot's prompt across the Sub-episode.",
    nativeAudioDirectionChipLabel: "AUDIO:",

    /* ---- Product reference image picker (2026-07-06 product tie-in upgrade) ---- */
    changeProductImage: "Change product image",
    productImagePickerTitle: "Choose product reference image(s)",
    productImagePickerCapHint: "Up to {n} product images are used per shot",
    productImagePickerBudgetHint:
      "This model accepts up to {n} reference images in total (characters + product)",
    productImagePickerNoImages:
      "No product images available yet — link a Marketplace Capture or add a product image URL in Product Tie-in settings.",
    productImagePickerSave: "Save selection",
    productImagePickerSaved: "Product reference image(s) updated.",
    productImagePickerSelectedCount: "{n} selected",
    productImageMultipleBadge: "+{n}",

    /* ---- Density meter (section-13, 2026-07-07 production-grade upgrade) ---- */
    densityMeterTitle: "Dialogue density",
    densityEpisodeCoverageTemplate:
      "Total dialogue {n}s of target {min}-{max}s",
    densityStateInRange: "In range",
    densityStateUnderfilledWarning: "Below target (warning)",
    densityStateUnderfilledError: "Well below target (blocking)",
    densityShotEstimateTemplate: "{est}s / target {target}s",
    densitySilenceGapBadgeTemplate: "This shot is silent for {n}s too long",
    densityShotOverLengthTemplate:
      "Won't fit — {est}s of speech in a {duration}s clip",
    densityUnderfilledBlockingMessage:
      "Dialogue is still too thin — repair the whole Sub-episode script first",
    densityShotLabelTemplate: "Shot {n}",
    densityNoSilenceGapLabel: "No long silence",
    // Owner-reported fix (2026-07-08) — shown only once the shot-chip list
    // is tall enough to need its scroll cap (see
    // `DENSITY_SHOT_CHIPS_SCROLL_THRESHOLD` in `VerticalDramaDensityMeter.tsx`).
    densityShotChipsScrollHint: "Scroll to see more shots",
    // 2026-07-08 wizard cross-link wave — the meter can show a per-shot
    // "no dialogue" chip BEFORE the dialogue/audio step has actually run
    // (a forecast from the script alone), and an over-length chip's
    // actionable next step.
    densityDialogueForecastNoteTemplate:
      "Dialogue will be assigned to shots in the '{step}' step — this number is a forecast.",
    densityOverLengthHintTemplate:
      "Rebalance the dialogue in the '{step}' step, or press '{repair}'.",
    // 2026-07-08 W9-B, owner directive (spec §14.1 rule 6b speakability) —
    // shared verbatim between this chip and the Production Wizard's
    // per-shot dialogue preview badge (single source of truth, same
    // convention as densityMeterTitle/densityEpisodeCoverageTemplate).
    densityUnspeakableSymbolsBadge: "Contains unreadable symbols",
    // Safe fallback for vdDialogueIssueLabel — never a raw enum leak.
    dialogueIssueUnknownFallback: "Dialogue issue",

    /* ---- Production Wizard (section-12, 2026-07-07 production-grade upgrade) ---- */
    repairWholeEpisodeScript: "Repair the whole Sub-episode script",
    repairThisShotOnly: "Repair only this shot",
    generateRealVideoCta: "Generate the real video",
    wizardNextUpLabel: "Next up",
    wizardStatusPassedLabel: "Passed",
    wizardStatusNeedsRepairLabel: "Needs repair",
    wizardCreditChipLabel: "Uses credits",
    wizardViewDetails: "View details",
    wizardAdvancedStagesDisclosure: "Advanced stages",
    wizardStatusLockedLabel: "Locked",
    wizardStatusReadyLabel: "Ready",
    wizardStatusRunningLabel: "Running",
    wizardStatusOptionalLabel: "Optional",
    wizardStatusSkippedLabel: "Skipped",
    wizardStatusBlockedLabel: "Blocked",
    wizardPaidConfirmTitle: "This spends credits",
    wizardPaidConfirmNote: "Confirm to continue with real AI generation.",
    wizardRepairDialogueWholeEpisode:
      "Repair the whole Sub-episode dialogue plan",
    wizardGenerateMissingStartFrames: "Generate missing start frames",
    wizardGenerateDialoguePlan: "Generate dialogue/audio plan",
    wizardGenerateScript: "Generate Sub-episode script",
    wizardGenerateStoryboard: "Generate storyboard",
    wizardAssembleEpisode: "Assemble the Sub-episode video",
    wizardCompleteSeriesSetup: "Complete series setup",
    wizardNoActionLabel: "Nothing to do",
    wizardEvidenceTitle: "Evidence",
    wizardBlockingReasonsTitle: "Why this is blocked",
    wizardStepperAriaLabel: "Production steps",
    // 2026-07-08 fix (spec §17 grandfathering) — episode_script step's
    // speech-coverage evidence row, shown ONLY for `no_dialogue_data`
    // (a legacy script with no embedded per-beat dialogue data — see
    // `vdWizardScriptCoverageEvidence`). Reworded 2026-07-08 W9-B
    // plain-language sweep (dropped "per-beat"/"density tracking" jargon).
    wizardScriptNoDialogueDataMessage:
      "This is an older Sub-episode script without detailed dialogue data yet — generate a new Sub-episode script to see accurate dialogue numbers.",

    /* ---- Criteria transparency (2026-07-08 wave — owner-facing "why did
       this step pass/fail, what does it check" upgrade) ---- */
    wizardStatusPassedWithWarningsLabel: "Passed with warnings",
    wizardCriteriaTitle: "This step's criteria",
    wizardCriterionPassedLabel: "Passed",
    wizardCriterionFailedLabel: "Not passed",
    wizardCriterionWarningLabel: "Not checked yet",
    wizardOutOfScopeTemplate:
      "Not checked at this step: {item} — happens at the '{step}' step",
    wizardScorecardNotReviewed: "Not reviewed",
    wizardLoopStateRowLabel: "Auto-improve loop",

    /* ---- Content completeness (2026-07-08 W9-B, owner directive —
       section-12 "Pass Semantics — Content Completeness"): per-shot
       dialogue viewer + the "incomplete" partial pass state. ---- */
    wizardDialoguePreviewTitle: "Actual dialogue per shot",
    wizardDialoguePreviewLineTemplate: "{speaker}: {line}",
    wizardDialoguePreviewNoDialogueBadge: "No dialogue",
    wizardDialoguePreviewOverLengthBadge: "Too long for the shot",
    wizardDialoguePreviewNoLinesPlaceholder: "No dialogue lines in this shot.",
    wizardDialoguePreviewShowMore: "Show all",
    wizardDialoguePreviewShowLess: "Collapse",
    wizardStatusIncompleteLabel: "Not complete",
    wizardIncompleteHeadlineTemplate:
      "This step isn't complete yet — still missing: {items}",
    wizardIncompleteHeadlineGeneric: "This step isn't complete yet.",

    /* ---- Scorecard v2 (section-14, 2026-07-07 production-grade upgrade) ---- */
    qualityHookStrength: "Hook strength",
    qualityCliffhangerStrength: "Cliffhanger strength",
    qualityContinuityConsistency: "Continuity consistency",
    qualityTieInNaturalness: "Tie-in naturalness",
    qualityOverallVsFloorTemplate: "Overall {x}/5 (floor {y})",
    qualityFloorMarkTemplate: "floor {y}",
    qualityLoopCtaTemplate: "Auto-improve (up to {n} rounds, ~{c} credits)",
    qualityLoopConfirmTitle: "Run the bounded auto-improve loop?",
    qualityLoopConfirmNote:
      "Each round re-reviews and repairs the script/storyboard/dialogue automatically; a worse result is never kept.",
    qualityLoopStageScript: "fix script",
    qualityLoopStageStoryboard: "fix storyboard",
    qualityLoopStageDialogue: "fix dialogue",
    qualityLoopStageTieIn: "fix tie-in",
    qualityLoopStageReReview: "re-review",
    qualityLoopRoundPrefixTemplate: "Round {i}:",
    qualityLoopEscalatedMaxRoundsTemplate:
      "Reached {n} rounds and still below floor — needs manual review",
    qualityLoopEscalatedRegression:
      "Score got worse — kept the better version, needs manual review",
    qualityLoopRunningLabel: "Auto-improving…",
    qualityLoopRoundBeforeAfterTemplate: "{before}/5 → {after}/5",
    qualityLoopRoundHistoryTitle: "Round history",
    qualityLoopBothReportsNote:
      "Comparing the report before this round to the report currently kept.",
    qualityDensityMetricsTitle: "Density facts",
    densityMetricsSpeechSecondsLabel: "Estimated speech",
    densityMetricsClipsEvaluatedLabel: "Clips evaluated",
    densityMetricsClipsBelowMinLabel: "Clips below warning",
    densityMetricsClipsBelowErrorLabel: "Clips below error",
    densityMetricsAvgCoverageLabel: "Avg coverage",
    densityMetricsSilentGapsLabel: "Long silent gaps",
    densityMetricsDuplicateLinesLabel: "Duplicate lines",
    densityMetricsStageDirectionsLabel: "Stage directions in dialogue",
    densityMetricsReversalCountLabel: "Script reversals",
    densityMetricsMaxSameEmotionLabel: "Max same-emotion streak",

    /* ---- Story Lock (W11.6, 2026-07-08) — story finalized on the series
       Overview; episode-level improve/repair may only change execution. ---- */
    qualityStoryDimensionsTitle: "Story quality — decided on the Overview",
    qualityStoryDimensionsOverviewLink: "Go edit the story on Overview",
    qualityExecutionDimensionsTitle: "Execution quality",
    qualityApplyStoryLocked:
      "Smooth wording / polish delivery (story unchanged)",
    qualityReviewCostNoteStoryLocked:
      "Cheap, LLM-only check — run this before spending credits on images/video. Story is locked: repairs here can only change wording, delivery, and camera work, never the story.",
    wizardStoryLockNote:
      "The story is locked to the season plan — edit the story on the series Overview.",

    /* ---- Tie-in naturalness report card (section-08 §13.1, 2026-07-07 production-grade upgrade) ---- */
    tieInReportTitle: "Tie-in naturalness report",
    tieInNaturalnessScoreTemplate: "Naturalness {score}/100 (floor {floor})",
    tieInPassedBadge: "Passed",
    tieInFailedBadge: "Below floor",
    tieInNoReportYet: "No tie-in report yet — run the quality review first.",
    tieInSpokenMentionsTemplate: "Spoken mentions {n}/{max}",
    tieInVisualShotsTemplate: "Visual shots {n}/{max}",
    tieInAdSpeakViolationsTemplate: "Ad-speak phrases found: {n}",
    tieInClaimViolationsTemplate: "Flagged claims found: {n}",
    tieInDisclosureOk: "Disclosure is separated from the prompt",
    tieInDisclosureFail: "Disclosure is not separated from the prompt",
    tieInFatigueOk: "Placement frequency is within limits",
    tieInFatigueFail: "Placement is too frequent right now",
    tieInApplyRecommendationsCta: "Apply the recommendations",
    tieInDeferCta: "Defer the product to the next Sub-episode",
    tieInDeferConfirmTitle: "Defer this Sub-episode's product placement?",
    tieInDeferConfirmExplain:
      "Removes the product placement from this Sub-episode and records the deferral in history. This Sub-episode will no longer carry the tie-in.",
    tieInBlockedHint:
      "This Sub-episode is below the tie-in naturalness floor — repair, remove, or defer the tie-in before generating.",
    tieInScheduleAtRiskNote:
      "Deferring this placement means the series may miss its tie-in schedule target.",
    tieInDeferring: "Deferring…",
    tieInDeferSuccess: "Product placement deferred.",

    /* ---- Season-plan tie-in status line + real-proposal defer toast
     *  (task #31, spec §7.7.2/§7.7.3, added 2026-07-09) — `null`/absent
     *  `seasonTieInPlacement` (flag off, or a legacy series with no plan
     *  yet) renders none of these lines; see `getEpisodeDetail`'s
     *  `seasonTieInPlacement` field. ---- */
    tieInSeasonPlanPlannedText:
      "Per the season plan: this Sub-episode has a product.",
    tieInSeasonPlanMovedFromTemplate:
      "Per the season plan: this Sub-episode has a product (moved from Sub-episode {fromEpisode}).",
    tieInSeasonPlanNotPlannedText:
      "Per the season plan: this Sub-episode has no product.",
    tieInDeferProposalCreatedTemplate:
      "Created a proposal to move to Sub-episode {episode} — awaiting approval on the Overview page.",
    tieInDeferProposalViewCta: "View on Overview",

    /* ---- Whole-episode dialogue TTS batch (W12-B, voice chain wave) ---- */
    dialogueAudioSummaryTemplate: "Voice audio: {ready}/{total} lines",
    dialogueAudioGenerateBatchCta:
      "Generate all dialogue audio (paid, ≈ based on lines missing audio)",
    dialogueAudioGenerateBatchConfirmTitle: "This spends credits",
    dialogueAudioGenerateBatchConfirmBody:
      "Generates audio for every dialogue line that doesn't have one yet. Lines that already have audio are skipped.",
    dialogueAudioNoPendingLines:
      "Every line already has audio (or is waiting on voice casting).",
    dialogueAudioBatchSubmittedTemplate:
      "Submitted {submitted} line(s) for audio (skipped {skipped} already done) ~{credits} credits",
    dialogueAudioBatchFailuresTemplate: "{n} line(s) failed to submit",
    dialogueAudioMissingCastTitle: "Some characters have no voice cast yet",
    dialogueAudioMissingCastLink: "Go cast voices in the Characters tab",
    dialogueAudioStatusQueued: "Queued",
    dialogueAudioStatusGenerating: "Generating…",
    dialogueAudioStatusReady: "Ready",
    dialogueAudioStatusFailed: "Failed",
    dialogueAudioStatusBlocked: "Needs voice casting",
    dialogueAudioRetryLine: "Retry",
    dialogueAudioPlayerLabelTemplate: "Audio for {speaker}, line {n}",

    /* ---- Task #26 (data sanity — episode number beyond the planned
     *  season plan, e.g. episode 11 while the plan only covers 10) —
     *  `getEpisodeBreakdownStatus`'s `"beyond_plan"` warning banner.
     *  Mirrors `dialogueAudioMissingCastTitle`/`Link`'s shape exactly. ---- */
    episodeBeyondPlanTitle:
      "This Sub-episode is outside the current story plan (plan covers {count} Sub-episode(s))",
    episodeBeyondPlanBody:
      "Extend the season plan on the Overview page first so the script, deep drafts, and QC can reference the story outline.",
    episodeBeyondPlanLink: "Go to Overview to extend the season plan",

    /* ---- Task #21 / W12.5 "Final Render Suite" phase B (dialogue audio +
     *  subtitles for the whole-episode compiled video, plus season batch
     *  render), added 2026-07-09 ---- */
    finalRenderOptionsTitle: "Render options",
    finalRenderIncludeDialogueAudioLabel: "Include generated dialogue audio",
    finalRenderLoudnessNormalizeLabel: "Normalize loudness",
    finalRenderSubtitlePresetLabel: "Subtitle style",
    finalRenderSubtitlePresetNone: "No subtitles",
    /* ---- Subtitle font size + audience-age badge (render-options
     *  extension, 2026-07-13) — mirrors the subtitle preset picker/toggle
     *  copy immediately above verbatim. ---- */
    finalRenderSubtitleFontSizeLabel: "Subtitle font size",
    finalRenderShowAgeBadgeLabel: "Show audience-age badge",
    finalRenderShowAgeBadgeHelp:
      "Burns the series' age rating as a small corner badge",
    finalRenderResultTitle: "Last render result",
    finalRenderResultSubtitleLinesTemplate: "{n} subtitle line(s) included",
    finalRenderResultAudioSegmentsTemplate:
      "{n} dialogue audio segment(s) included",
    finalRenderResultExcludedBannersTitle:
      "Ad banners excluded from this render",
    adBannerExclusionUnknownReasonFallback: "Excluded from this render",
    finalRenderStartedSummaryTemplate:
      "Started assembling the full Sub-episode video — {subtitleLines} subtitle line(s), {audioSegments} audio segment(s)",
    finalRenderExcludedAdBannersToastTemplate:
      "Skipped {n} ad banner(s): {list}",
    seasonRenderButton: "Render whole season",
    seasonRenderDialogTitle: "Render whole season",
    seasonRenderDialogExplainer:
      "Sub-episodes render one at a time, in order. Sub-episodes that aren't ready are skipped (ad banners are only available for single-Sub-episode renders in this version).",
    seasonRenderDialogConfirm: "Start season render",
    seasonRenderSubmittedSummaryTemplate:
      "Queued {n} Sub-episode(s): {episodes}",
    seasonRenderSkippedSummaryTemplate: "Skipped {n} Sub-episode(s)",
    seasonRenderNoneSubmittedToast: "No Sub-episodes were ready to render.",
    seasonRenderStartedToast: "Started the season render.",
    seasonRenderFailedToast: "Failed to start the season render.",

    /* ---- Episode Plan panel (planning/`polished-toasting-gadget.md` Part
       A2) — read-only ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง reference card,
       replaces the Production Wizard mount. ---- */
    episodePlanPanelTitle: "Sub-episode plan",
    episodePlanWorkingTitleLabel: "Sub-episode title",
    episodePlanLoglineLabel: "Logline",
    episodePlanKeyBeatsLabel: "Key beats",
    episodePlanCliffhangerLabel: "Cliffhanger",
    episodePlanEmptyState: "This Sub-episode has no drafted story plan yet.",

    /* ---- Per-shot character/variant reference picker (planning/vertical-
       drama-twin-variant-completeness/plan.md, W6 frontend) — distinct from
       the series-wide "change reference image" swap (`changeProductImage`'s
       sibling for characters, `onChangeCharacterReference`). ---- */
    shotCharacterRefEditLabel:
      "Change character reference(s) for this shot only",
    shotCharacterRefPickerTitle: "Character reference for this shot",
    shotCharacterRefPickerHint:
      "This selection only affects this shot — other shots are unaffected.",
    shotCharacterRefPickerOutfitBadge: "Outfit",
    shotCharacterRefPickerAgeStageBadge: "Age stage",
    shotCharacterRefPickerTwinBadge: "twin of {name}",
    shotCharacterRefPickerUnknownSectionTitle:
      "Keys not found in the character roster (removable)",
    shotCharacterRefPickerNoCharacters: "This series has no characters yet.",
    shotCharacterRefPickerSave: "Save",
    shotCharacterRefPickerSelectedCount: "{n} selected",
    shotCharacterRefPickerSaved: "This shot's character reference(s) updated.",

    /* ---- Character portrait "additional details" hint (planning/vertical-
       drama-character-custom-instruction/plan.md) — optional free-text fact
       sent to `previewCharacterPrompt` so repeated portrait generations vary
       instead of producing near-identical prompts every click. ---- */
    characterCustomInstructionLabel: "Additional details (optional)",
    characterCustomInstructionPlaceholder:
      "e.g. front-facing, half-body, full-body",
  },
  th: {
    runDryRun: "รันแบบทดสอบ",
    runPlanOnly: "วางแผนเท่านั้น",
    generateImages: "สร้างภาพ (มีค่าใช้จ่าย)",
    generateVideo: "สร้างวิดีโอ (มีค่าใช้จ่าย)",
    generateRealScript: "สร้างบทจริง (มีค่าใช้จ่าย)",
    generatingRealScript: "กำลังสร้าง…",
    generateRealScriptConfirmWarning: "การทำงานนี้ใช้ AI จริงและใช้เครดิต",
    generateRealScriptConfirmNote:
      "ดำเนินการต่อเฉพาะเมื่อต้องการบทตอนย่อยจริง ไม่ใช่ placeholder ฟรี",
    regenerateStage: "สร้างใหม่ (ลบชุดเดิม)",
    regenerateConfirm: "จะลบผลลัพธ์ปัจจุบันและสร้างใหม่ — ย้อนกลับไม่ได้",
    regenerateConfirmButton: "ลบและสร้างใหม่",
    regenerating: "กำลังสร้างใหม่…",
    generateEpisode: "สร้างตอนย่อยนี้ (มีค่าใช้จ่าย)",
    generateEpisodeExplain:
      "กดครั้งเดียว ระบบจะสร้างบทตอนย่อย ซิงก์ข้อมูลตัวละคร ตรวจภาพอ้างอิง และสร้างสตอรีบอร์ด 9 ช็อตให้ครบ",
    generateEpisodeConfirmNote:
      "จะรันขั้นตอนทั้งหมดในครั้งเดียว — สร้างบท + สตอรีบอร์ด ใช้ AI จริง มีค่าใช้จ่าย",
    generateEpisodeConfirmButton: "สร้างเลย",
    generateEpisodeProgress: "กำลังทำ:",
    generateEpisodeFailedAt: "หยุดที่ขั้นตอน:",
    generateEpisodeRetry: "ลองใหม่",
    syncCharacterData: "ซิงก์ข้อมูลตัวละคร",
    approve: "อนุมัติ",
    reject: "ปฏิเสธ",
    repair: "ซ่อม",
    approving: "กำลังอนุมัติ…",
    approved: "อนุมัติแล้ว",
    rejected: "ถูกปฏิเสธ",
    rejectionReason: "เหตุผลการปฏิเสธ",
    nextAction: "ขั้นตอนถัดไป",
    phaseProgress: "ความคืบหน้าตามเฟส",
    running: "กำลังทำงาน",
    completed: "เสร็จสิ้น",
    blocked: "ถูกบล็อก",
    waitingForApproval: "รออนุมัติ",
    failed: "ล้มเหลว",
    runs: "ประวัติการรัน",
    noRuns: "ยังไม่มีการรัน",
    openLedger: "เปิดบันทึกอาร์ติแฟกต์",
    openStoryboardReview: "เปิด Storyboard Review",
    memoryTimeline: "ไทม์ไลน์ความจำ",
    currentSummary:
      "สรุปปัจจุบัน (มุมมองที่สืบทอด — อัปเดตที่รอยังไม่ถูกนำไปใช้)",
    noMemory: "ยังไม่มีเหตุการณ์ความจำ",
    retconProposal: "ข้อเสนอแก้ย้อนหลัง",
    proposedChange: "การเปลี่ยนแปลงที่เสนอ",
    rationale: "เหตุผล",
    noRetcon: "ไม่มีข้อเสนอแก้ย้อนหลังที่รออยู่",
    repairInstruction: "คำสั่งซ่อม",
    repairPlaceholder: "อธิบายสิ่งที่ต้องการแก้ไข…",
    creditEstimate: "ประมาณการเครดิต",
    confirmPaidRepair: "การซ่อมนี้ใช้เครดิต กดยืนยันเพื่อดำเนินการต่อ",
    confirm: "ยืนยัน",
    cancel: "ยกเลิก",
    submit: "ส่งคำสั่งซ่อม",
    submitting: "กำลังส่ง…",
    repairRunning: "กำลังซ่อม…",
    repairResult: "ผลการซ่อม",
    newArtifact: "อาร์ติแฟกต์/เวอร์ชันใหม่",
    createEpisode: "สร้างตอนย่อย",
    noEpisode: "ยังไม่มีตอนย่อย",
    readOnlyCompleted: "ตอนย่อยที่เสร็จแล้ว (อ่านอย่างเดียว)",
    dryRunNote: "โหมดทดสอบ: ไม่มีการสร้างที่มีค่าใช้จ่าย",
    filterKind: "กรองตามชนิด",
    filterEpisode: "ตอนย่อยที่",
    all: "ทั้งหมด",
    advancedPipelineDetail:
      "ขั้นสูง — ดูทุกขั้นตอนของ pipeline และประวัติการรัน",

    /* ---- Model selection (storyboard header, Phase 1.3) ---- */
    imageModel: "โมเดลภาพ",
    videoModel: "โมเดลวิดีโอ",
    chooseModel: "เลือกโมเดล",
    capabilityStartFrame: "เฟรมเริ่มต้น",
    capabilityNativeAudio: "เสียงพูดในตัว",
    capabilityMaxRefs: "อ้างอิงสูงสุด {n} ภาพ",
    capabilityCreditCost: "{n} เครดิต",
    modelChangeNote:
      "การเปลี่ยนโมเดลมีผลเฉพาะการสร้างครั้งถัดไป — ภาพ/คลิปที่ทำไปแล้วไม่ถูกแตะ",
    modelSelectionSaved: "บันทึกการเลือกโมเดลแล้ว",
    capabilityMcpFree: "MCP (0 เครดิต)",
    mcpConnectionLabel: "การเชื่อมต่อ MCP",
    mcpConnectionNeededFor: "จำเป็นสำหรับ: {n}",
    mcpConnectionMissingToastImage:
      "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลภาพนี้",
    mcpConnectionMissingToastVideo:
      "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลวิดีโอนี้",

    /* ---- Shot reference strip (Phase 2.5) ---- */
    references: "ภาพอ้างอิง",
    addReference: "เพิ่มภาพอ้างอิง",
    removeReference: "ลบภาพอ้างอิง",
    removeReferenceConfirm:
      "ลบภาพอ้างอิงนี้ออกจากช็อตนี้หรือไม่? การลบนี้ไม่ได้ลบภาพออกจากคลังของคุณ",
    referenceLimitWarning: "โมเดลนี้ใช้ภาพอ้างอิงได้สูงสุด {n} ภาพ",
    noReferencesYet:
      "ยังไม่มีภาพอ้างอิง — ลากภาพมาวางที่นี่ หรือเพิ่มจากช่องตัดภาพ/ประวัติ/คลัง",
    dropReferenceHint: "ลากภาพมาวางที่นี่เพื่อเพิ่มเป็นภาพอ้างอิง",
    uploadReferenceImage: "อัปโหลดภาพ",
    useReferenceAsMain: "ใช้เป็นภาพหลัก",
    unsupportedImageFileType: "รองรับเฉพาะไฟล์ภาพ",
    imageFileTooLarge: "ไฟล์ภาพใหญ่เกินไป (สูงสุด {n}MB)",
    uploadingImage: "กำลังอัปโหลด…",
    useAsStartFrame: "ใช้เป็นภาพเริ่มต้น",
    addAsReferences: "เพิ่มเป็นภาพอ้างอิง ({n})",
    pickBestAngleTitle: "เลือกมุมกล้องที่ดีที่สุด",
    angleTileCount: "{n} ภาพ",

    /* ---- Upload video file per shot (externally-generated clip) ---- */
    uploadVideoClip: "อัปโหลดวิดีโอ",
    uploadingVideoClip: "กำลังอัปโหลดวิดีโอ…",
    unsupportedVideoFileType: "รองรับเฉพาะไฟล์วิดีโอ (mp4, webm, mov)",
    videoFileTooLarge: "ไฟล์วิดีโอใหญ่เกินไป (สูงสุด {n}MB)",
    videoClipUploaded: "อัปโหลดวิดีโอสำเร็จ",
    videoClipUploadFailed: "อัปโหลดวิดีโอไม่สำเร็จ",
    videoClipSourceUpload: "วิดีโอที่อัปโหลดเอง",

    /* ---- Copy prompt / dialogue to clipboard ---- */
    copyPrompt: "คัดลอก",
    copiedPrompt: "คัดลอกแล้ว",
    copyDialogue: "คัดลอก",
    copiedDialogue: "คัดลอกแล้ว",

    /* ---- Dialogue box (Phase 3.4) ---- */
    dialogueLines: "บทพูด",
    noDialogueLines: "คลิปนี้ยังไม่มีบทพูด",
    dialogueSpeaksNatively: "พูดในวิดีโอ",
    dialogueSeparateTts: "เสียงแยก TTS",
    saveDialogue: "บันทึก",
    editDialogue: "แก้ไข",
    emotionLabel: "อารมณ์",
    deliveryLabel: "น้ำเสียง/การแสดง",
    estimatedDialogueSecondsLabel: "รวมบทพูดประมาณ",

    /* ---- One-click generate + inline prompt editing (Phase 4.1/4.2) ---- */
    generatePromptAndImage: "สร้าง prompt + ภาพ",
    generatingPromptAndImage: "กำลังทำงาน…",
    reviewGeneratedPrompt: "ตรวจสอบ prompt ที่สร้างก่อนใช้เครดิต",
    savePromptFree: "บันทึก (ฟรี)",
    aiAdjustPaid: "ให้ AI ปรับ (มีค่าใช้จ่าย)",
    promptSaved: "บันทึก prompt แล้ว",
    promptOverLimitHint:
      "เกินขีดจำกัด — ระบบจะปรับให้พอดีอัตโนมัติตอนสร้างภาพ/วิดีโอ",

    /* ---- One-click generate mode choice + auto-prompt (2026-07-05 fix) ---- */
    chooseGenerateMode: "เลือกวิธีสร้างภาพ",
    generateModeSingle: "ภาพเดียว",
    generateModeAngles: "9 เฟรมหลายมุมกล้อง (3x3)",
    generateModeSingleHint: "สร้างภาพเดียวสำหรับช็อตนี้",
    generateModeAnglesHint:
      "สร้างภาพตาราง 3x3 หนึ่งภาพ แล้วเลือกมุมที่ดีที่สุด",
    autoPreparingPrompt: "กำลังเตรียมพรอมต์ภาพให้อัตโนมัติ…",
    autoPromptFailed: "เตรียมพรอมต์ภาพไม่สำเร็จ",
    retry: "ลองใหม่",
    reviewAutoPrompt:
      "ตรวจสอบพรอมต์ที่ระบบสร้างให้ (แก้ไขได้ถ้าต้องการ) แล้วจึงสร้างภาพ",
    generateWithThisPrompt: "สร้างภาพ",

    /* ---- Video prompt pack generation (2026-07-05 fix) ---- */
    generateVideoPromptPack: "สร้าง prompt วิดีโอ (มีค่าใช้จ่าย)",
    generatingVideoPromptPack: "กำลังสร้าง…",
    generateVideoPromptPackConfirmNote:
      "จะสร้างจังหวะบทพูด/เสียง และพรอมต์การเคลื่อนไหวของทุกคลิป — ใช้ AI จริง มีค่าใช้จ่าย",
    generateVideoPromptPackNeedsStoryboard: "ต้องมีสตอรีบอร์ดก่อน",

    /* ---- Quality review card (Phase 3B.5) ---- */
    qualityReview: "ตรวจคุณภาพตอนย่อย (AI)",
    runQualityReview: "ตรวจคุณภาพตอนย่อย (AI)",
    runningQualityReview: "กำลังตรวจสอบ…",
    qualityReviewCostNote:
      "ตรวจสอบด้วย AI ราคาถูก — ควรทำก่อนใช้เครดิตสร้างภาพ/วิดีโอ",
    qualityOverall: "คะแนนรวม",
    qualityReversalCount: "จำนวนจุดพลิก",
    qualityReversalSharpness: "ความคมของจุดพลิก",
    qualityEmotionVariety: "ความหลากหลายของอารมณ์",
    qualityDialogueNaturalness: "ความเป็นธรรมชาติของบทพูด",
    qualityPacing: "จังหวะเรื่อง",
    qualityIssues: "จุดที่ควรแก้",
    qualityNoIssues: "ไม่พบจุดที่ต้องแก้",
    copySuggestedFix: "คัดลอกคำแนะนำ",

    /* ---- Quality review approve/alternative loop (3B.6) ---- */
    qualityApply: "อนุมัติและปรับเรื่องตามคำแนะนำ (มีค่าใช้จ่าย)",
    qualityApplyRunning: "กำลังปรับแก้…",
    qualityApplyConfirmTitle: "ระบบจะปรับแก้ตามคำแนะนำต่อไปนี้:",
    qualityApplyConfirmCountTemplate: "จะปรับตามคำแนะนำ {n} รายการ",
    qualityApplyCostNote:
      "เป็นการเรียก AI จริงเพื่อแก้ไข — มีค่าใช้จ่ายในแต่ละส่วนที่ได้รับผลกระทบ (บทและ/หรือสตอรีบอร์ด)",
    qualityApplySuccess: "ปรับแก้เรียบร้อย — ตรวจคุณภาพตอนย่อยซ้ำแล้ว",
    qualityApplySuccessNoReReview: "ปรับแก้เรียบร้อย แต่ตรวจคุณภาพซ้ำไม่สำเร็จ",
    qualityApplyStaleNotice:
      "หมายเหตุ: ขั้นตอนถัดไปกลายเป็นข้อมูลเก่าแล้ว — ควรสร้าง prompt ภาพ/วิดีโอของช็อตที่เกี่ยวข้องใหม่",
    qualityAlternative: "ตรวจใหม่ แนะนำแนวทางอื่น (มีค่าใช้จ่าย)",
    qualityAlternativeRunning: "กำลังตรวจสอบ…",
    qualityAlternativeSuccess: "ได้คำแนะนำแนวทางใหม่แล้ว",
    copiedSuggestedFix: "คัดลอกแล้ว — นำไปวางในหน้าซ่อม",

    /* ---- Episode -> series memory summarization (manual trigger) ---- */
    summarizeMemory: "สรุปความจำเข้าซีรีย์ (AI)",
    summarizeMemoryButton: "สรุปความจำเข้าซีรีย์ (AI)",
    summarizeMemoryRunning: "กำลังสรุป…",
    summarizeMemoryNeedsScript:
      "ตอนย่อยนี้ต้องมีบทและสตอรี่บอร์ดที่สร้างแล้วก่อน",
    summarizeMemoryCostNote:
      "ดึงข้อเท็จจริงหลัก ปมค้าง การเปลี่ยนแปลงของตัวละคร/ความสัมพันธ์ และความเสี่ยงด้านความต่อเนื่องจากตอนย่อยนี้ เข้าสู่ความจำถาวรของซีรีย์ เพื่อใช้กับตอนย่อยถัดไป",
    summarizeMemoryAlready: "ตอนย่อยนี้ถูกสรุปเข้าความจำซีรีย์แล้ว",
    summarizeMemoryReSummarize: "สรุปใหม่",
    summarizeMemoryReSummarizeConfirm:
      "การสรุปใหม่จะเพิ่มชุดเหตุการณ์ความจำใหม่สำหรับตอนย่อยนี้ สรุปเดิมจะยังถูกเก็บไว้ในประวัติ ไม่ถูกลบ ต้องการดำเนินการต่อหรือไม่?",
    summarizeMemorySuccess: "บันทึกความจำแล้ว: {count} รายการ",
    summarizeMemoryFailed: "สรุปตอนย่อยเข้าความจำซีรีย์ไม่สำเร็จ",

    /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ---- */
    resolutionLabel: "ความละเอียด",
    resolutionAuto: "ค่าเริ่มต้น",

    /* ---- Repair image (image-to-image) dialog (Phase 6.5) ---- */
    repairImage: "แก้ไขภาพ (AI)",
    repairImageDialogTitle: "แก้ไขภาพนี้ด้วย AI",
    repairImageInstructionLabel: "อยากแก้อะไรในภาพนี้",
    repairImageInstructionPlaceholder: "เช่น เปลี่ยนเสื้อผ้า, เปลี่ยนฉากหลัง",
    repairImageSubmit: "สร้างภาพที่แก้แล้ว",
    repairImageSubmitting: "กำลังส่ง…",
    repairImageWorking: "กำลังสร้างภาพที่แก้แล้ว…",
    repairImageBefore: "ก่อน",
    repairImageAfter: "หลัง",
    repairImageUseNew: "ใช้ภาพใหม่",
    repairImageKeepOld: "เก็บภาพเดิม",
    repairImageApplied: "เปลี่ยนเป็นภาพใหม่แล้ว",
    repairImageDiscarded: "เก็บภาพเดิมไว้ — ภาพใหม่ยังอยู่ในประวัติ",
    repairImageUnsupportedModel:
      "โมเดลนี้ไม่รองรับการแก้ไขภาพแบบ image-to-image",
    repairImageUnsupportedModelWithList:
      "โมเดลนี้ไม่รองรับการแก้ไขภาพ โมเดลที่รองรับ: {n}",
    repairImageFailed: "สร้างภาพที่แก้ไม่สำเร็จ",
    repairImageNeedsApprovedImage:
      "ช็อตนี้ต้องมีภาพที่อนุมัติแล้วก่อนจึงจะแก้ไขได้",

    /* ---- Per-shot video prompt generation (Phase 6.6) ---- */
    generateShotVideoPrompt: "สร้างพรอมต์วิดีโอ (AI)",
    generatingShotVideoPrompt: "กำลังวิเคราะห์ภาพ…",
    generateShotVideoPromptNeedsImage: "ต้องมีภาพหลักของช็อตก่อน",
    generateShotVideoPromptFailed: "สร้างพรอมต์วิดีโอไม่สำเร็จ",
    usedVisionNote: "วิเคราะห์จากภาพจริง",

    /* ---- Regenerate clip dialogue (2026-07-07 unusable-dialogue fix) ---- */
    regenerateClipDialogue: "สร้างบทพูดใหม่ (AI)",
    regeneratingClipDialogue: "กำลังเขียนบทพูด…",
    regenerateClipDialogueInstructionPlaceholder:
      "ไม่บังคับ: บอกแนวที่ต้องการ เช่น สั้นลง / ทางการน้อยลง",
    regenerateClipDialogueSubmit: "สร้าง",
    regenerateClipDialogueCancel: "ยกเลิก",
    regenerateClipDialogueFailed: "สร้างบทพูดใหม่ไม่สำเร็จ",
    regenerateClipDialogueSuccess: "สร้างบทพูดใหม่แล้ว",
    regenerateClipDialogueUpdatePromptPrompt:
      "อัปเดตพรอมต์วิดีโอให้ตรงบทใหม่ไหม?",
    regenerateClipDialogueUpdatePromptAction: "อัปเดตพรอมต์วิดีโอ",
    dialogueOriginScriptHint: "ดึงจากบท — ตรวจความเป็นธรรมชาติก่อนใช้",
    generateVideoPromptPackWholeEpisode: "สร้างพรอมต์วิดีโอทั้งตอนย่อย",

    /* ---- Completed video-clip player (2026-07-06 fix — completed video
       renders were never persisted/shown; only a transient toast) ---- */
    videoClipGenerating: "กำลังสร้างวิดีโอ…",
    videoClipRegenerate: "สร้างใหม่",
    videoClipOpenFull: "เปิดแบบเต็มจอ",
    videoClipDurationLabel: "วิ",
    download: "ดาวน์โหลด",

    /* ---- Whole-episode compiled video (2026-07-06 download + assembly upgrade) ---- */
    compiledVideoTitle: "วิดีโอรวม Sub-episode",
    compiledVideoAssemble: "ประกอบวิดีโอรวม Sub-episode",
    compiledVideoReassemble: "ประกอบใหม่",
    compiledVideoReassembleConfirm:
      "การทำนี้จะแทนที่วิดีโอรวมที่มีอยู่ และย้อนกลับไม่ได้",
    compiledVideoReadyHint: "พร้อม {ready}/{total} คลิป",
    compiledVideoMissingWarning:
      "ยังไม่มีคลิป: {list} — สร้างคลิปเหล่านี้ก่อน หรือประกอบเฉพาะช็อตที่เสร็จแล้ว",
    compiledVideoAssemblePartial: "ประกอบเฉพาะช็อตที่เสร็จแล้ว",
    compiledVideoProcessing: "กำลังประกอบวิดีโอรวม Sub-episode…",
    compiledVideoFailed: "ประกอบวิดีโอรวม Sub-episode ไม่สำเร็จ",
    compiledVideoRetry: "ลองใหม่",
    compiledVideoDurationLabel: "วิ",
    compiledVideoPartialBadge: "บางส่วน ({n} คลิป)",
    compiledVideoAssembleFailedToast: "เริ่มการประกอบวิดีโอไม่สำเร็จ",
    compiledVideoAssembleStartedToast: "เริ่มประกอบวิดีโอรวม Sub-episode แล้ว",

    /* ---- Ad Banner Overlay — per-episode banner selection (F131W, task
       #30-A2, plan.md §6 episode side) ---- */
    adBannerSectionTitle: "แบนเนอร์ในวิดีโอนี้",
    adBannerEnableLabel: "เปิดใช้แบนเนอร์โฆษณา",
    adBannerNoDesigns:
      "ยังไม่มีดีไซน์แบนเนอร์ที่พร้อมใช้งาน — สร้างที่แท็บสินค้าผูกเรื่องก่อน",
    adBannerPlacementBottomBand: "แถบล่าง",
    adBannerPlacementSideVertical: "แนวตั้งข้าง",
    adBannerPlacementFullscreen: "เต็มจอ",
    adBannerApprovalRequiredBadge: "ต้องอนุมัติก่อนใช้ในวิดีโอ",
    adBannerTimingEntire: "ทั้งคลิป",
    adBannerTimingWindow: "ช่วงเวลา",
    adBannerStartSecLabel: "เริ่มที่ (วินาที)",
    adBannerDurationSecLabel: "ระยะเวลา (วินาที)",
    adBannerTooManyError: "เลือกแบนเนอร์ได้สูงสุด {n} รายการ",
    adBannerFullscreenOverlapError: "แบนเนอร์เต็มจอที่เลือกมีช่วงเวลาทับกัน",
    adBannerSave: "บันทึกแบนเนอร์",
    adBannerSaving: "กำลังบันทึก…",

    /* ---- Video-prompt language options (episode-level language plan) ---- */
    promptLanguageLabel: "ภาษา prompt",
    promptLanguageEn: "อังกฤษ (แนะนำ)",
    promptLanguageTh: "ไทย",
    promptLanguageZh: "中文",
    promptLanguageJa: "日本語",
    promptLanguageKo: "한국어",
    dialogueLanguageLabel: "ภาษาเสียงพูด",
    thaiAccentLabel: "สำเนียงพูดไทย",
    videoPromptLanguageSaved: "บันทึกการตั้งค่าภาษาแล้ว",

    /* ---- Native audio direction toggle (task #36, added 2026-07-09) ---- */
    nativeAudioToggleLabel:
      "รวมเสียงประกอบในพรอมต์วิดีโอทั้งตอนย่อย (SFX + บรรยากาศ)",
    nativeAudioToggleHint:
      "เมื่อเปิดใช้งาน ปุ่ม 'สร้างพรอมต์วีดีโอ' จะรวมคำสั่งเสียงประกอบ (SFX/บรรยากาศ) เข้าไปในพรอมต์วิดีโอของทุกช็อตในตอนย่อยทันที ไม่ต้องตั้งค่าทีละช็อต",
    nativeAudioDirectionChipLabel: "เสียง:",

    /* ---- Product reference image picker (2026-07-06 product tie-in upgrade) ---- */
    changeProductImage: "เปลี่ยนภาพสินค้า",
    productImagePickerTitle: "เลือกภาพอ้างอิงสินค้า",
    productImagePickerCapHint: "สินค้าใช้ภาพได้สูงสุด {n} ภาพต่อช็อต",
    productImagePickerBudgetHint:
      "โมเดลนี้รับภาพอ้างอิงรวมได้สูงสุด {n} ภาพ (ตัวละคร + สินค้า)",
    productImagePickerNoImages:
      "ยังไม่มีภาพสินค้าให้เลือก — เชื่อมโยง Marketplace Capture หรือใส่ URL ภาพสินค้าในการตั้งค่าผูกสินค้า",
    productImagePickerSave: "บันทึกการเลือก",
    productImagePickerSaved: "อัปเดตภาพอ้างอิงสินค้าแล้ว",
    productImagePickerSelectedCount: "เลือกแล้ว {n} ภาพ",
    productImageMultipleBadge: "+{n}",

    /* ---- Density meter (section-13, 2026-07-07 production-grade upgrade) ---- */
    densityMeterTitle: "ความหนาแน่นบทพูด",
    densityEpisodeCoverageTemplate: "บทพูดรวม {n} วิ จากเป้า {min}-{max} วิ",
    densityStateInRange: "อยู่ในเกณฑ์",
    densityStateUnderfilledWarning: "ต่ำกว่าเป้า (คำเตือน)",
    densityStateUnderfilledError: "ต่ำกว่าเป้ามาก (บล็อก)",
    densityShotEstimateTemplate: "พูด {est} วิ จากเป้า {target} วิ",
    densitySilenceGapBadgeTemplate: "ช็อตนี้เงียบเกิน {n} วิ",
    densityShotOverLengthTemplate:
      "ยาวเกินช็อต — พูด {est} วิ ในช็อต {duration} วิ",
    densityUnderfilledBlockingMessage: "บทยังบางเกินไป — ซ่อมบททั้งตอนย่อยก่อน",
    densityShotLabelTemplate: "ช็อต {n}",
    densityNoSilenceGapLabel: "ไม่มีช่วงเงียบยาว",
    densityShotChipsScrollHint: "เลื่อนดูช็อตเพิ่มเติม",
    densityDialogueForecastNoteTemplate:
      "บทพูดจะถูกแจกลงช็อตในขั้น '{step}' — ตัวเลขนี้เป็นการคาดการณ์ล่วงหน้า",
    densityOverLengthHintTemplate: "เกลี่ยบทในขั้น '{step}' หรือกด '{repair}'",
    densityUnspeakableSymbolsBadge: "มีสัญลักษณ์ที่อ่านไม่ได้",
    dialogueIssueUnknownFallback: "บทพูดมีปัญหา",

    /* ---- Production Wizard (section-12, 2026-07-07 production-grade upgrade) ---- */
    repairWholeEpisodeScript: "ซ่อมบททั้งตอนย่อย",
    repairThisShotOnly: "ซ่อมเฉพาะช็อตนี้",
    generateRealVideoCta: "สร้างวิดีโอจริง",
    wizardNextUpLabel: "ขั้นต่อไป",
    wizardStatusPassedLabel: "ผ่านแล้ว",
    wizardStatusNeedsRepairLabel: "ต้องซ่อมก่อน",
    wizardCreditChipLabel: "ใช้เครดิต",
    wizardViewDetails: "ดูรายละเอียด",
    wizardAdvancedStagesDisclosure: "ขั้นสูง",
    wizardStatusLockedLabel: "ล็อกอยู่",
    wizardStatusReadyLabel: "พร้อมทำ",
    wizardStatusRunningLabel: "กำลังทำงาน",
    wizardStatusOptionalLabel: "ไม่บังคับ",
    wizardStatusSkippedLabel: "ข้าม",
    wizardStatusBlockedLabel: "ติดขัด",
    wizardPaidConfirmTitle: "การทำงานนี้ใช้เครดิต",
    wizardPaidConfirmNote: "กดยืนยันเพื่อดำเนินการด้วย AI จริง",
    wizardRepairDialogueWholeEpisode: "ซ่อมแผนบทพูดทั้งตอนย่อย",
    wizardGenerateMissingStartFrames: "สร้างเฟรมเริ่มต้นที่ยังขาด",
    wizardGenerateDialoguePlan: "สร้างแผนบทพูด/เสียง",
    wizardGenerateScript: "สร้างบทตอนย่อย",
    wizardGenerateStoryboard: "สร้างสตอรีบอร์ด",
    wizardAssembleEpisode: "ประกอบวิดีโอตอนย่อย",
    wizardCompleteSeriesSetup: "ตั้งค่าซีรีส์ให้ครบ",
    wizardNoActionLabel: "ไม่มีขั้นตอนต้องทำ",
    wizardEvidenceTitle: "ข้อมูลประกอบ",
    wizardBlockingReasonsTitle: "เหตุผลที่ติดขัด",
    wizardStepperAriaLabel: "ขั้นตอนการผลิต",
    // 2026-07-08 W9-B plain-language sweep — dropped "ฝังบีต"/"ระบบวัด
    // ความหนาแน่น" jargon (embedded-beat data / density-measurement
    // system), same meaning in plain words.
    wizardScriptNoDialogueDataMessage:
      "บทนี้เป็นบทเก่าที่ยังไม่มีข้อมูลบทพูดละเอียดพอ — สร้างบทตอนย่อยใหม่เพื่อดูตัวเลขบทพูดที่แม่นยำ",

    /* ---- Criteria transparency (2026-07-08 wave — "ทำไมขั้นนี้ถึงผ่าน/ไม่ผ่าน
       เกณฑ์คืออะไร" ให้เจ้าของงานตรวจสอบได้เอง) ---- */
    wizardStatusPassedWithWarningsLabel: "ผ่านแบบมีคำเตือน",
    wizardCriteriaTitle: "เกณฑ์ของขั้นนี้",
    wizardCriterionPassedLabel: "ผ่าน",
    wizardCriterionFailedLabel: "ไม่ผ่าน",
    wizardCriterionWarningLabel: "ยังไม่ตรวจ",
    wizardOutOfScopeTemplate:
      "สิ่งที่ยังไม่ตรวจในขั้นนี้: {item} — จะทำที่ขั้น '{step}'",
    wizardScorecardNotReviewed: "ยังไม่ได้ตรวจ",
    wizardLoopStateRowLabel: "การปรับอัตโนมัติ",

    /* ---- Content completeness (2026-07-08 W9-B, owner directive —
       section-12 "Pass Semantics — Content Completeness"): บทพูดจริงรายช็อต
       + สถานะ "ยังไม่ครบ" ---- */
    wizardDialoguePreviewTitle: "บทพูดจริงรายช็อต",
    wizardDialoguePreviewLineTemplate: "{speaker}: {line}",
    wizardDialoguePreviewNoDialogueBadge: "ไม่มีบทพูด",
    wizardDialoguePreviewOverLengthBadge: "ยาวเกินช็อต",
    wizardDialoguePreviewNoLinesPlaceholder: "ช็อตนี้ยังไม่มีบทพูด",
    wizardDialoguePreviewShowMore: "แสดงทั้งหมด",
    wizardDialoguePreviewShowLess: "ย่อ",
    wizardStatusIncompleteLabel: "ยังไม่ครบ",
    wizardIncompleteHeadlineTemplate: "ขั้นนี้ยังไม่ครบ — เหลือ: {items}",
    wizardIncompleteHeadlineGeneric: "ขั้นนี้ยังไม่ครบ",

    /* ---- Scorecard v2 (section-14, 2026-07-07 production-grade upgrade) ---- */
    qualityHookStrength: "ความแข็งแรงของ hook",
    qualityCliffhangerStrength: "ความค้างคาใจตอนจบ",
    qualityContinuityConsistency: "ความต่อเนื่องของเรื่อง",
    qualityTieInNaturalness: "ความเป็นธรรมชาติของการฝังสินค้า",
    qualityOverallVsFloorTemplate: "คะแนนรวม {x}/5 (เกณฑ์ {y})",
    qualityFloorMarkTemplate: "เกณฑ์ {y}",
    qualityLoopCtaTemplate: "ปรับอัตโนมัติ (สูงสุด {n} รอบ, ~{c} เครดิต)",
    qualityLoopConfirmTitle: "เริ่มปรับอัตโนมัติแบบมีขอบเขตหรือไม่?",
    qualityLoopConfirmNote:
      "แต่ละรอบจะตรวจและซ่อมบท/สตอรีบอร์ด/บทพูดให้อัตโนมัติ — จะไม่เก็บผลลัพธ์ที่แย่ลง",
    qualityLoopStageScript: "แก้บท",
    qualityLoopStageStoryboard: "แก้สตอรีบอร์ด",
    qualityLoopStageDialogue: "แก้บทพูด",
    qualityLoopStageTieIn: "ปรับสินค้า",
    qualityLoopStageReReview: "ตรวจใหม่",
    qualityLoopRoundPrefixTemplate: "รอบ {i}:",
    qualityLoopEscalatedMaxRoundsTemplate:
      "ครบ {n} รอบแล้วยังไม่ถึงเกณฑ์ — ต้องตรวจเอง",
    qualityLoopEscalatedRegression:
      "คะแนนแย่ลง — คงเวอร์ชันที่ดีกว่าไว้ ต้องตรวจเอง",
    qualityLoopRunningLabel: "กำลังปรับอัตโนมัติ…",
    qualityLoopRoundBeforeAfterTemplate: "{before}/5 → {after}/5",
    qualityLoopRoundHistoryTitle: "ประวัติการปรับ",
    qualityLoopBothReportsNote:
      "เทียบรายงานก่อนรอบนี้กับรายงานที่ระบบเก็บไว้ในปัจจุบัน",
    qualityDensityMetricsTitle: "ข้อเท็จจริงด้านความหนาแน่น",
    densityMetricsSpeechSecondsLabel: "เวลาพูดโดยประมาณ",
    densityMetricsClipsEvaluatedLabel: "คลิปที่ตรวจ",
    densityMetricsClipsBelowMinLabel: "คลิปต่ำกว่าเกณฑ์เตือน",
    densityMetricsClipsBelowErrorLabel: "คลิปต่ำกว่าเกณฑ์บล็อก",
    densityMetricsAvgCoverageLabel: "ค่าเฉลี่ยความครอบคลุม",
    densityMetricsSilentGapsLabel: "ช่วงเงียบเกิน",
    densityMetricsDuplicateLinesLabel: "บทพูดซ้ำ",
    densityMetricsStageDirectionsLabel: "คำสั่งฉาก/เสียงปนในบท",
    densityMetricsReversalCountLabel: "จุดพลิกจากบท",
    densityMetricsMaxSameEmotionLabel: "ช็อตอารมณ์เดิมติดกันสูงสุด",

    /* ---- Story Lock (W11.6, 2026-07-08) — เนื้อเรื่องตัดสินที่หน้าภาพรวมของซีรีส์
       แล้ว การปรับ/ซ่อมระดับตอนแก้ได้เฉพาะการนำเสนอเท่านั้น ---- */
    qualityStoryDimensionsTitle: "คุณภาพเนื้อเรื่อง — ตัดสินที่หน้าภาพรวมแล้ว",
    qualityStoryDimensionsOverviewLink: "ไปปรับเนื้อเรื่องที่หน้าภาพรวม",
    qualityExecutionDimensionsTitle: "คุณภาพการนำเสนอ",
    qualityApplyStoryLocked: "เกลี่ยบท/ปรับถ้อยคำ (ไม่เปลี่ยนเนื้อเรื่อง)",
    qualityReviewCostNoteStoryLocked:
      "ตรวจแบบ AI ราคาถูก — ทำก่อนใช้เครดิตสร้างภาพ/วิดีโอ เนื้อเรื่องถูกล็อกไว้แล้ว การซ่อมที่นี่ปรับได้เฉพาะถ้อยคำ การแสดงอารมณ์ และงานกล้อง ไม่แตะเนื้อเรื่อง",
    wizardStoryLockNote:
      "เนื้อเรื่องล็อกตามแผนซีซั่น — แก้เนื้อเรื่องที่หน้าภาพรวม",

    /* ---- Tie-in naturalness report card (section-08 §13.1, 2026-07-07 production-grade upgrade) ---- */
    tieInReportTitle: "รายงานความเป็นธรรมชาติของการฝังสินค้า",
    tieInNaturalnessScoreTemplate:
      "คะแนนความเป็นธรรมชาติ {score}/100 (เกณฑ์ {floor})",
    tieInPassedBadge: "ผ่านเกณฑ์",
    tieInFailedBadge: "ต่ำกว่าเกณฑ์",
    tieInNoReportYet:
      "ยังไม่มีรายงานความเป็นธรรมชาติของการฝังสินค้า — ตรวจคุณภาพก่อน",
    tieInSpokenMentionsTemplate: "พูดถึงสินค้า {n}/{max} ครั้ง",
    tieInVisualShotsTemplate: "ปรากฏในภาพ {n}/{max} ช็อต",
    tieInAdSpeakViolationsTemplate: "พบคำโฆษณาต้องห้าม {n} จุด",
    tieInClaimViolationsTemplate: "พบข้อความอวดอ้างต้องระวัง {n} จุด",
    tieInDisclosureOk: "แยกข้อความเปิดเผยจากพรอมต์แล้ว",
    tieInDisclosureFail: "ข้อความเปิดเผยยังไม่แยกจากพรอมต์",
    tieInFatigueOk: "ความถี่การฝังสินค้ายังปกติ",
    tieInFatigueFail: "ฝังสินค้าถี่เกินไปในช่วงนี้",
    tieInApplyRecommendationsCta: "ปรับตามคำแนะนำ",
    tieInDeferCta: "เลื่อนสินค้าไปตอนย่อยถัดไป",
    tieInDeferConfirmTitle: "เลื่อนตำแหน่งสินค้าของตอนย่อยนี้หรือไม่?",
    tieInDeferConfirmExplain:
      "จะลบตำแหน่งสินค้าออกจากตอนย่อยนี้ และบันทึกการเลื่อนไว้ในประวัติ — ตอนย่อยนี้จะไม่มีการฝังสินค้าอีก",
    tieInBlockedHint:
      "ตอนย่อยนี้ยังต่ำกว่าเกณฑ์ความเป็นธรรมชาติของการฝังสินค้า — ปรับ ลบ หรือเลื่อนสินค้าออกก่อนสร้างสื่อ",
    tieInScheduleAtRiskNote:
      "การเลื่อนครั้งนี้อาจทำให้ซีรีส์พลาดเป้าตารางการฝังสินค้า",
    tieInDeferring: "กำลังเลื่อน…",
    tieInDeferSuccess: "เลื่อนตำแหน่งสินค้าแล้ว",

    /* ---- Season-plan tie-in status line + real-proposal defer toast
     *  (task #31, spec §7.7.2/§7.7.3, added 2026-07-09) ---- */
    tieInSeasonPlanPlannedText: "ตามแผนซีซั่น: ตอนย่อยนี้มีสินค้า",
    tieInSeasonPlanMovedFromTemplate:
      "ตามแผนซีซั่น: ตอนย่อยนี้มีสินค้า (ย้ายมาจากตอนย่อยที่ {fromEpisode})",
    tieInSeasonPlanNotPlannedText: "ตอนย่อยนี้ไม่มีสินค้าตามแผน",
    tieInDeferProposalCreatedTemplate:
      "สร้างข้อเสนอย้ายไปตอนย่อยที่ {episode} แล้ว — รออนุมัติที่หน้าภาพรวม",
    tieInDeferProposalViewCta: "ดูที่หน้าภาพรวม",

    /* ---- Whole-episode dialogue TTS batch (W12-B, voice chain wave) ---- */
    dialogueAudioSummaryTemplate: "เสียงพูด: {ready}/{total} บรรทัด",
    dialogueAudioGenerateBatchCta:
      "สร้างเสียงพูดทั้งตอนย่อย (มีค่าใช้จ่าย ≈ ตามจำนวนบรรทัดที่ยังไม่มีเสียง)",
    dialogueAudioGenerateBatchConfirmTitle: "การทำงานนี้ใช้เครดิต",
    dialogueAudioGenerateBatchConfirmBody:
      "จะสร้างเสียงพูดให้ทุกบรรทัดที่ยังไม่มีเสียง บรรทัดที่มีเสียงอยู่แล้วจะถูกข้าม",
    dialogueAudioNoPendingLines:
      "ทุกบรรทัดมีเสียงแล้ว (หรือกำลังรอกำหนดเสียงตัวละคร)",
    dialogueAudioBatchSubmittedTemplate:
      "ส่งสร้างเสียงพูด {submitted} บรรทัด (ข้าม {skipped} บรรทัดที่มีอยู่แล้ว) ~{credits} เครดิต",
    dialogueAudioBatchFailuresTemplate: "ล้มเหลว {n} บรรทัด",
    dialogueAudioMissingCastTitle: "มีตัวละครที่ยังไม่กำหนดเสียง",
    dialogueAudioMissingCastLink: "ไปกำหนดเสียงที่แท็บตัวละคร",
    dialogueAudioStatusQueued: "รอคิว",
    dialogueAudioStatusGenerating: "กำลังสร้าง",
    dialogueAudioStatusReady: "พร้อมใช้งาน",
    dialogueAudioStatusFailed: "ล้มเหลว",
    dialogueAudioStatusBlocked: "ต้องกำหนดเสียงก่อน",
    dialogueAudioRetryLine: "ลองใหม่",
    dialogueAudioPlayerLabelTemplate: "เสียงพูดของ {speaker} บรรทัดที่ {n}",

    /* ---- Task #26 (data sanity — episode number beyond the planned
     *  season plan, e.g. episode 11 while the plan only covers 10) —
     *  `getEpisodeBreakdownStatus`'s `"beyond_plan"` warning banner.
     *  Mirrors `dialogueAudioMissingCastTitle`/`Link`'s shape exactly. ---- */
    episodeBeyondPlanTitle:
      "ตอนย่อยนี้อยู่นอกโครงสร้างเรื่องปัจจุบัน (แผนมี {count} ตอนย่อย)",
    episodeBeyondPlanBody:
      "ขยายแผนซีซั่นที่หน้าภาพรวมก่อน เพื่อให้บท/ร่างละเอียด/QC อ้างอิงโครงเรื่องได้",
    episodeBeyondPlanLink: "ไปที่หน้าภาพรวมเพื่อขยายแผนซีซั่น",

    /* ---- Task #21 / W12.5 "Final Render Suite" phase B (dialogue audio +
     *  subtitles for the whole-episode compiled video, plus season batch
     *  render), added 2026-07-09 ---- */
    finalRenderOptionsTitle: "ตัวเลือกการเรนเดอร์วิดีโอ",
    finalRenderIncludeDialogueAudioLabel: "รวมเสียงพูดที่สร้างไว้",
    finalRenderLoudnessNormalizeLabel: "ปรับความดังมาตรฐาน (loudness)",
    finalRenderSubtitlePresetLabel: "รูปแบบซับไตเติล",
    finalRenderSubtitlePresetNone: "ไม่ฝังซับไตเติล",
    /* ---- Subtitle font size + audience-age badge (render-options
     *  extension, 2026-07-13) — mirrors the subtitle preset picker/toggle
     *  copy immediately above verbatim. ---- */
    finalRenderSubtitleFontSizeLabel: "ขนาดตัวอักษรซับไตเติล",
    finalRenderShowAgeBadgeLabel: "แสดง badge อายุผู้ชม",
    finalRenderShowAgeBadgeHelp:
      "ติดป้ายเรตอายุมุมวิดีโอ (จากที่ตั้งไว้ในซีรีย์)",
    finalRenderResultTitle: "ผลการเรนเดอร์ล่าสุด",
    finalRenderResultSubtitleLinesTemplate: "ฝังซับไตเติล {n} บรรทัด",
    finalRenderResultAudioSegmentsTemplate: "รวมเสียงพูด {n} ช่วง",
    finalRenderResultExcludedBannersTitle:
      "แบนเนอร์ที่ถูกข้ามจากการเรนเดอร์นี้",
    adBannerExclusionUnknownReasonFallback: "ถูกข้ามจากการเรนเดอร์นี้",
    finalRenderStartedSummaryTemplate:
      "เริ่มประกอบวิดีโอรวมตอนย่อยแล้ว — ซับไตเติล {subtitleLines} บรรทัด, เสียงพูด {audioSegments} ช่วง",
    finalRenderExcludedAdBannersToastTemplate:
      "ข้ามแบนเนอร์ {n} รายการ: {list}",
    seasonRenderButton: "เรนเดอร์ทั้งซีซั่น",
    seasonRenderDialogTitle: "เรนเดอร์ทั้งซีซั่น",
    seasonRenderDialogExplainer:
      "ระบบจะเรนเดอร์ทีละตอนย่อยตามลำดับ ตอนย่อยที่ไม่พร้อมจะถูกข้าม (แบนเนอร์ใช้ได้เฉพาะการเรนเดอร์รายตอนย่อยในเวอร์ชันนี้)",
    seasonRenderDialogConfirm: "เริ่มเรนเดอร์ทั้งซีซั่น",
    seasonRenderSubmittedSummaryTemplate: "คิวแล้ว {n} ตอนย่อย: {episodes}",
    seasonRenderSkippedSummaryTemplate: "ข้าม {n} ตอนย่อย",
    seasonRenderNoneSubmittedToast: "ไม่มีตอนย่อยไหนพร้อมเรนเดอร์",
    seasonRenderStartedToast: "เริ่มเรนเดอร์ทั้งซีซั่นแล้ว",
    seasonRenderFailedToast: "เริ่มเรนเดอร์ทั้งซีซั่นไม่สำเร็จ",

    /* ---- Episode Plan panel (planning/`polished-toasting-gadget.md` Part
       A2) — read-only ชื่อตอน/เรื่องย่อ/จุดดำเนินเรื่อง/จุดค้าง reference card,
       replaces the Production Wizard mount. ---- */
    episodePlanPanelTitle: "แผนเนื้อเรื่องของตอนย่อย",
    episodePlanWorkingTitleLabel: "ชื่อตอนย่อย",
    episodePlanLoglineLabel: "เรื่องย่อ",
    episodePlanKeyBeatsLabel: "จุดดำเนินเรื่อง",
    episodePlanCliffhangerLabel: "จุดค้าง",
    episodePlanEmptyState: "ยังไม่มีแผนเนื้อเรื่องของตอนย่อยนี้",

    /* ---- Per-shot character/variant reference picker (planning/vertical-
       drama-twin-variant-completeness/plan.md, W6 frontend) ---- */
    shotCharacterRefEditLabel: "เปลี่ยนเฉพาะช็อตนี้",
    shotCharacterRefPickerTitle: "ตัวละครอ้างอิงสำหรับช็อตนี้",
    shotCharacterRefPickerHint:
      "การเลือกนี้มีผลเฉพาะช็อตนี้เท่านั้น ไม่กระทบช็อตอื่น",
    shotCharacterRefPickerOutfitBadge: "ชุด",
    shotCharacterRefPickerAgeStageBadge: "วัย",
    shotCharacterRefPickerTwinBadge: "แฝดของ {name}",
    shotCharacterRefPickerUnknownSectionTitle:
      "คีย์ที่ไม่พบในรายชื่อตัวละคร (สามารถลบได้)",
    shotCharacterRefPickerNoCharacters: "ซีรีย์นี้ยังไม่มีตัวละคร",
    shotCharacterRefPickerSave: "บันทึก",
    shotCharacterRefPickerSelectedCount: "เลือกแล้ว {n} รายการ",
    shotCharacterRefPickerSaved: "อัปเดตตัวละครอ้างอิงของช็อตนี้แล้ว",

    /* ---- Character portrait "additional details" hint (planning/vertical-
       drama-character-custom-instruction/plan.md) — optional free-text fact
       sent to `previewCharacterPrompt` so repeated portrait generations vary
       instead of producing near-identical prompts every click. ---- */
    characterCustomInstructionLabel: "รายละเอียดเพิ่มเติม (ไม่บังคับ)",
    characterCustomInstructionPlaceholder:
      "เช่น หน้าตรง, ภาพครึ่งตัว, ภาพเต็มตัว",
  },
} as const;

export type VdCopy = Record<keyof (typeof VD_COPY)["en"], string>;

export function vdCopy(locale: VdLocale): VdCopy {
  return VD_COPY[locale] as VdCopy;
}

/**
 * Substitutes a single `{n}` placeholder in a copy string (used by the
 * capability-badge / reference-limit / credit-cost strings above, which all
 * carry a single numeric value). Falls back to the raw template if no
 * placeholder is present.
 */
export function vdCopyWithCount(template: string, n: number | string): string {
  return template.replace("{n}", String(n));
}

/**
 * General multi-placeholder template substitution — replaces every `{key}`
 * token with `String(value)` for each entry in `params` (e.g.
 * `vdCopyWithParams(t.densityEpisodeCoverageTemplate, {n: 12.3, min: 35, max: 41})`).
 * Uses `split("{key}").join(value)` rather than a `RegExp` so keys never need
 * regex-escaping. Falls back to leaving unmatched `{token}`s untouched.
 */
export function vdCopyWithParams(
  template: string,
  params: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Density meter — silence-intent labels (section-13, 2026-07-07)             */
/* -------------------------------------------------------------------------- */

export const VD_SILENCE_INTENT_LABELS: Record<
  VerticalDramaSilenceIntent,
  { en: string; th: string }
> = {
  dramatic_pause: { en: "Dramatic pause", th: "หยุดเว้นจังหวะดราม่า" },
  action_visual: { en: "Action visual", th: "ภาพแอ็กชันไม่มีบทพูด" },
  montage: { en: "Montage", th: "มอนทาจ" },
  establishing: { en: "Establishing shot", th: "ช็อตปูฉาก" },
};

export function vdSilenceIntentLabel(
  intent: VerticalDramaSilenceIntent,
  locale: VdLocale
): string {
  const l = VD_SILENCE_INTENT_LABELS[intent];
  return locale === "th" ? l.th : l.en;
}

/**
 * Short, chip-friendly labels for `dialogueQuality.ts`'s deterministic issue
 * codes — used by the density meter's per-shot chip (a11y: a blocking/
 * warning tone must never appear with no accompanying text). Deliberately
 * NOT the raw `issue.message` string (that module's messages are
 * English-only, provider-free heuristic text) — mirrors this file family's
 * existing convention of re-deriving a localized string from the issue
 * CODE rather than displaying the analyzer's own message verbatim (see
 * `VerticalDramaStoryboardPanel.tsx`'s dialogue-underfilled hints).
 */
export const VD_DIALOGUE_ISSUE_LABELS: Record<
  VerticalDramaDialogueQualityIssueCode,
  { en: string; th: string }
> = {
  VD_DIALOGUE_EMPTY: {
    en: "No dialogue on this shot",
    th: "ช็อตนี้ไม่มีบทพูด",
  },
  VD_DIALOGUE_STAGE_DIRECTION: {
    en: "Stage direction, not dialogue",
    th: "เป็นคำสั่งฉาก ไม่ใช่บทพูด",
  },
  VD_DIALOGUE_SCRIPT_FALLBACK: {
    en: "Unreviewed fallback dialogue",
    th: "บทพูดสำรองยังไม่ได้ตรวจ",
  },
  VD_DIALOGUE_UNDERFILLED: {
    en: "Dialogue too short for this shot",
    th: "บทพูดสั้นเกินไปสำหรับช็อตนี้",
  },
  VD_DIALOGUE_EPISODE_UNDERFILLED: {
    en: "Sub-episode dialogue is too sparse",
    th: "บทพูดทั้งตอนย่อยน้อยเกินไป",
  },
  // 2026-07-08/W9-A landed this code for real (spec §14.1 rule 6b) —
  // shares its exact wording with the density meter's own dedicated
  // `densityUnspeakableSymbolsBadge` chip (single source of truth).
  VD_DIALOGUE_UNSPEAKABLE_SYMBOLS: {
    en: "Contains unreadable symbols",
    th: "มีสัญลักษณ์ที่อ่านไม่ได้",
  },
  VD_DIALOGUE_DUPLICATE: {
    en: "Dialogue duplicates another shot",
    th: "บทพูดซ้ำกับอีกช็อต",
  },
};

/**
 * Widened to `code: string` (2026-07-08 W9-B) — was
 * `VerticalDramaDialogueQualityIssueCode` only. The density meter's generic
 * issue badge (`VerticalDramaDensityMeter.tsx`) picks its `issueCode` from
 * ANY error/warning-severity issue on a clip, generically — so the moment
 * `dialogueQuality.ts` gains a new issue code this component doesn't
 * recognize yet (e.g. the concurrent W9-A wave's
 * `VD_DIALOGUE_UNSPEAKABLE_SYMBOLS`), that generic path would otherwise
 * index `VD_DIALOGUE_ISSUE_LABELS[code]` with `undefined` and crash on
 * `.th`. Falls back to a short, still-meaningful, never-raw-enum sentence
 * instead (same "no raw English leaks into Thai UI" rule this file's own
 * tests already enforce for `VD_WIZARD_EVIDENCE_LABELS`) — every one of the
 * 6 currently-known codes is completely unaffected (still returns the exact
 * same string as before).
 */
export function vdDialogueIssueLabel(code: string, locale: VdLocale): string {
  const l = (
    VD_DIALOGUE_ISSUE_LABELS as Record<
      string,
      { en: string; th: string } | undefined
    >
  )[code];
  if (!l) return vdCopy(locale).dialogueIssueUnknownFallback;
  return locale === "th" ? l.th : l.en;
}

/* -------------------------------------------------------------------------- */
/* Production Wizard — step / status / action / reason-code labels            */
/* (section-12, 2026-07-07 production-grade upgrade)                          */
/* -------------------------------------------------------------------------- */

export const VD_WIZARD_STEP_LABELS: Record<
  VerticalDramaProductionWizardStepId,
  { en: string; th: string }
> = {
  series_setup: { en: "Series setup", th: "ตั้งค่าซีรีส์" },
  episode_script: { en: "Sub-episode script", th: "บทตอนย่อย" },
  storyboard_shots: { en: "Storyboard", th: "สตอรีบอร์ด" },
  script_qc: { en: "Script quality QC", th: "ตรวจคุณภาพบท" },
  start_frames: { en: "Start frames", th: "เฟรมเริ่มต้น" },
  dialogue_audio: { en: "Dialogue & audio", th: "บทพูด/เสียง" },
  dialogue_qc: { en: "Dialogue QC", th: "ตรวจบทพูด" },
  video_prompts: { en: "Video prompts", th: "พรอมต์วิดีโอ" },
  shot_repair: { en: "Shot repair", th: "ซ่อมช็อต" },
  video_clips: { en: "Video clips", th: "คลิปวิดีโอ" },
  final_episode: { en: "Final Sub-episode", th: "ประกอบตอนย่อยจบ" },
};

export function vdWizardStepLabel(
  stepId: VerticalDramaProductionWizardStepId,
  locale: VdLocale
): string {
  const l = VD_WIZARD_STEP_LABELS[stepId];
  return locale === "th" ? l.th : l.en;
}

export const VD_WIZARD_STATUS_LABELS: Record<
  VerticalDramaProductionWizardStepStatus,
  { en: string; th: string }
> = {
  locked: { en: "Locked", th: "ล็อกอยู่" },
  ready: { en: "Ready", th: "พร้อมทำ" },
  running: { en: "Running", th: "กำลังทำงาน" },
  passed: { en: "Passed", th: "ผ่านแล้ว" },
  needs_repair: { en: "Needs repair", th: "ต้องซ่อมก่อน" },
  optional: { en: "Optional", th: "ไม่บังคับ" },
  skipped: { en: "Skipped", th: "ข้าม" },
  blocked: { en: "Blocked", th: "ติดขัด" },
};

export function vdWizardStatusLabel(
  status: VerticalDramaProductionWizardStepStatus,
  locale: VdLocale
): string {
  const l = VD_WIZARD_STATUS_LABELS[status];
  return locale === "th" ? l.th : l.en;
}

/**
 * Display-status label that additionally recognizes `passed_with_warnings`
 * (2026-07-08 criteria-transparency wave) — a "passed" step whose
 * `passState` reads `"passed_with_warnings"` gets the dedicated "ผ่านแบบมี
 * คำเตือน" text instead of the plain "ผ่านแล้ว", so the DISTINCTION is a
 * real text difference (a11y: never color/icon-only), not just a tone
 * change. Every other `status`/`passState` combination is unchanged.
 *
 * 2026-07-08/W9-A content-completeness additions (owner directive,
 * section-12 "Pass Semantics — Content Completeness", module header
 * decision 12 in `productionWizard.ts`) — two MORE combinations now need
 * their own text, both checked BEFORE `passed_with_warnings`:
 *
 *  - `passState === "incomplete"` (a NEW pass state; `storyboard_shots`
 *    when its per-shot image/video prompts aren't all there yet) —
 *    "ยังไม่ครบ", unconditional on `status` (this resolver only ever
 *    produces it alongside `status: "passed"`, but checking `passState`
 *    alone keeps this label correct even from a hand-built fixture that
 *    pairs it with something else).
 *  - `status === "passed" && passState === "failed"` (`episode_script`/
 *    `script_qc` when a NEW completeness criterion reads a definite
 *    `false` — `withCompletenessPassStateOverride` REUSES the "failed"
 *    token instead of inventing a new one, specifically so it reads as
 *    urgent, but WITHOUT changing `status` itself and re-locking
 *    downstream steps that already passed) — shows the SAME "ต้องซ่อมก่อน"
 *    text an actual `needs_repair` step already shows, so a user never
 *    sees a bare "ผ่านแล้ว" while a completeness criterion is unmet (the
 *    owner directive's core rule). A `needs_repair`/`blocked` step ALSO
 *    reads `passState: "failed"` from `derivePassState` — those are
 *    already handled correctly by the final fallback below (their
 *    `status` itself already renders the right text), so this branch is
 *    scoped to `status === "passed"` specifically to avoid double-handling
 *    them.
 */
export function vdWizardStepDisplayStatusLabel(
  status: VerticalDramaProductionWizardStepStatus,
  passState: VerticalDramaProductionWizardPassState | undefined,
  locale: VdLocale
): string {
  if (passState === "incomplete") {
    return vdCopy(locale).wizardStatusIncompleteLabel;
  }
  if (status === "passed" && passState === "failed") {
    return vdWizardStatusLabel("needs_repair", locale);
  }
  if (status === "passed" && passState === "passed_with_warnings") {
    return vdCopy(locale).wizardStatusPassedWithWarningsLabel;
  }
  return vdWizardStatusLabel(status, locale);
}

/**
 * Base (non-parameterized) label per primary action. `run_quality_improve_loop`
 * only ever renders this as a last-resort fallback — its real button text is
 * the dynamic `qualityLoopCtaTemplate` (needs the policy's round count + a
 * credit estimate, neither of which this flat map has), formatted by the
 * caller via `vdCopyWithParams`.
 */
export const VD_WIZARD_PRIMARY_ACTION_LABELS: Record<
  VerticalDramaProductionWizardPrimaryAction,
  { en: string; th: string }
> = {
  complete_series_setup: {
    en: "Complete series setup",
    th: "ตั้งค่าซีรีส์ให้ครบ",
  },
  generate_script: { en: "Generate Sub-episode script", th: "สร้างบทตอนย่อย" },
  run_quality_review: { en: "Run quality review", th: "ตรวจคุณภาพเรื่อง" },
  run_quality_improve_loop: { en: "Auto-improve", th: "ปรับอัตโนมัติ" },
  generate_storyboard: { en: "Generate storyboard", th: "สร้างสตอรีบอร์ด" },
  approve_start_frames: {
    en: "Generate missing start frames",
    th: "สร้างเฟรมเริ่มต้นที่ยังขาด",
  },
  generate_dialogue_plan: {
    en: "Generate dialogue/audio plan",
    th: "สร้างแผนบทพูด/เสียง",
  },
  repair_dialogue: {
    en: "Repair the whole Sub-episode dialogue plan",
    th: "ซ่อมแผนบทพูดทั้งตอนย่อย",
  },
  generate_video_prompts: {
    en: "Generate video prompts for the whole Sub-episode",
    th: "สร้างพรอมต์วิดีโอทั้งตอนย่อย",
  },
  repair_shots: { en: "Repair only this shot", th: "ซ่อมเฉพาะช็อตนี้" },
  generate_video_clips: {
    en: "Generate the real video",
    th: "สร้างวิดีโอจริง",
  },
  assemble_episode: {
    en: "Assemble the Sub-episode video",
    th: "ประกอบวิดีโอตอนย่อย",
  },
  none: { en: "", th: "" },
};

export function vdWizardPrimaryActionLabel(
  action: VerticalDramaProductionWizardPrimaryAction,
  locale: VdLocale
): string {
  const l = VD_WIZARD_PRIMARY_ACTION_LABELS[action];
  return locale === "th" ? l.th : l.en;
}

/** One-line reason sentences for the 13 fixed `VD_WIZARD_*` blocking-reason
 *  codes (section-12 "Server" — exact fixed list). Accepts a plain `string`
 *  (not the narrower code union) because
 *  `VerticalDramaProductionWizardStep.blockingReasons` is itself typed as
 *  `string[]` in the shared resolver (documented there as matching
 *  section-12's pinned contract shape verbatim) — an unrecognized code falls
 *  back to being displayed as-is rather than throwing. */
export const VD_WIZARD_REASON_LABELS: Record<
  VerticalDramaProductionWizardBlockingReasonCode,
  { en: string; th: string }
> = {
  VD_WIZARD_SCRIPT_MISSING: {
    en: "The Sub-episode script has not been generated yet.",
    th: "ยังไม่ได้สร้างบทตอนย่อย",
  },
  VD_WIZARD_SCRIPT_UNDERFILLED: {
    en: "The script has too little dialogue for the target duration.",
    th: "บทมีบทพูดน้อยเกินไปสำหรับความยาวเป้าหมาย",
  },
  VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR: {
    en: "The quality scorecard has not met the required floor yet.",
    th: "คะแนนคุณภาพยังไม่ถึงเกณฑ์ที่กำหนด",
  },
  // Acceptance-review fix #6 (2026-07-08, LOW) — distinct from
  // VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR above: this fires only when
  // script_qc has never been reviewed even once (no scorecard exists yet),
  // never when a review actually ran and failed the floor. Task-specified
  // Thai string verbatim.
  VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED: {
    en: "The script's quality has not been reviewed yet — review it before generating images.",
    th: "ยังไม่ได้ตรวจคุณภาพบท — ตรวจก่อนสร้างภาพ",
  },
  VD_WIZARD_QUALITY_LOOP_ESCALATED: {
    en: "The auto-improve loop escalated and needs manual review.",
    th: "การปรับอัตโนมัติต้องหยุดและรอการตรวจด้วยตนเอง",
  },
  VD_WIZARD_TIE_IN_BELOW_FLOOR: {
    en: "The product tie-in is below the naturalness floor.",
    th: "การฝังสินค้ายังต่ำกว่าเกณฑ์ความเป็นธรรมชาติ",
  },
  VD_WIZARD_ARC_REPLAN_PENDING: {
    en: "A season re-plan proposal is waiting for review.",
    th: "มีข้อเสนอปรับแผนซีซั่นรอการตรวจสอบ",
  },
  VD_WIZARD_STORYBOARD_MISSING: {
    en: "The storyboard has not been generated yet.",
    th: "ยังไม่ได้สร้างสตอรีบอร์ด",
  },
  VD_WIZARD_START_FRAMES_NOT_APPROVED: {
    en: "Not every shot has an approved start frame yet.",
    th: "ยังมีช็อตที่ไม่มีภาพเริ่มต้นที่อนุมัติแล้ว",
  },
  VD_WIZARD_DIALOGUE_PLAN_MISSING: {
    en: "The dialogue/audio plan has not been generated yet.",
    th: "ยังไม่ได้สร้างแผนบทพูด/เสียง",
  },
  VD_WIZARD_DIALOGUE_UNDERFILLED: {
    en: "The dialogue plan has a problem to fix first (too little dialogue, or a gap that's too quiet).",
    // 2026-07-08 W9-B plain-language sweep — "ความหนาแน่น" (density) is
    // abstract/technical for a ม.ปลาย reader; replaced with the two
    // concrete problems it actually means (too little dialogue, or too
    // quiet for too long), matching this task's "concrete evidence, not
    // abstract" goal. No test asserts this string verbatim (verified before
    // changing).
    th: "แผนบทพูดมีปัญหาที่ต้องแก้ก่อน (บทน้อยไป หรือเงียบนานไป)",
  },
  VD_WIZARD_VIDEO_PROMPTS_STALE: {
    en: "The video prompt pack is missing or out of date.",
    th: "ชุดพรอมต์วิดีโอยังไม่มีหรือเป็นข้อมูลเก่า",
  },
  VD_WIZARD_VIDEO_CLIPS_INCOMPLETE: {
    en: "Not every video clip is complete yet.",
    th: "ยังมีคลิปวิดีโอที่ยังไม่เสร็จ",
  },
  VD_WIZARD_ASSEMBLY_BLOCKED: {
    en: "The Sub-episode is not ready to assemble yet.",
    // 2026-07-08 W9-B plain-language sweep — the old "ตอนนี้ยังไม่พร้อม
    // ประกอบ" reads ambiguously (ตอนนี้ = "right now", not "this episode",
    // on first read). Rewritten to reuse the SAME "ประกอบตอนวิดีโอ" phrase
    // the assemble_episode CTA already uses (single source of truth, zero
    // ambiguity).
    th: "ยังไม่พร้อมประกอบวิดีโอตอนย่อย",
  },
};

export function vdWizardReasonLabel(code: string, locale: VdLocale): string {
  const l = (
    VD_WIZARD_REASON_LABELS as Record<
      string,
      { en: string; th: string } | undefined
    >
  )[code];
  if (!l) return code;
  return locale === "th" ? l.th : l.en;
}

/**
 * Localizes the `episode_script` step's speech-coverage evidence row
 * (Wave-7E, 2026-07-08 fix) from the shared resolver's structured
 * `evidence[].scriptCoverage` payload (`productionWizard.ts`) — NEVER
 * renders the raw `ScriptSpeechCoverageStatus` enum string, since that
 * resolver has no locale awareness (its own `label`/`value` fallback exists
 * only for a caller that hasn't localized this row yet). Reuses the density
 * meter's own `densityMeterTitle`/`densityEpisodeCoverageTemplate` copy for
 * every numeric status so the SAME phrase ("บทพูดรวม X วิ จากเป้า Y-Z วิ")
 * reads identically in both surfaces (`VerticalDramaDensityMeter.tsx` and
 * the Production Wizard) — `no_dialogue_data` (spec §17 grandfathering) gets
 * its own dedicated warning sentence instead, since there is no meaningful
 * number to show yet.
 */
export function vdWizardScriptCoverageEvidence(
  scriptCoverage: {
    status: VerticalDramaProductionWizardScriptCoverageStatus;
    estimatedSpeechSeconds: number;
    targetSpeechSecondsMin: number;
    targetSpeechSecondsMax: number;
  },
  locale: VdLocale
): { label: string; value: string } {
  const t = vdCopy(locale);
  const label = t.densityMeterTitle;
  if (scriptCoverage.status === "no_dialogue_data") {
    return { label, value: t.wizardScriptNoDialogueDataMessage };
  }
  return {
    label,
    value: vdCopyWithParams(t.densityEpisodeCoverageTemplate, {
      n: scriptCoverage.estimatedSpeechSeconds.toFixed(1),
      min: scriptCoverage.targetSpeechSecondsMin.toFixed(0),
      max: scriptCoverage.targetSpeechSecondsMax.toFixed(0),
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Criteria transparency (section-12 owner-facing follow-up, 2026-07-08)      */
/* -------------------------------------------------------------------------- */

/**
 * One neutral, locale-aware label per `VerticalDramaProductionWizardCriterionId`
 * (`productionWizard.ts`) — describes WHAT the criterion checks, never
 * whether it currently passes (that is a separate pass/fail/unknown badge,
 * `vdWizardCriterionStatusLabel` below — a11y: two independent pieces of
 * text, never color-only).
 */
export const VD_WIZARD_CRITERION_LABELS: Record<
  VerticalDramaProductionWizardCriterionId,
  { en: string; th: string }
> = {
  series_setup_complete: {
    en: "Series setup is complete",
    th: "ตั้งค่าซีรีส์ครบถ้วน",
  },
  script_exists: {
    en: "Sub-episode script has been generated",
    th: "สร้างบทตอนย่อยแล้ว",
  },
  coverage_at_least_minimum: {
    en: "Dialogue clears the minimum floor",
    th: "บทพูดผ่านเกณฑ์ขั้นต่ำ",
  },
  coverage_in_recommended_band: {
    en: "Dialogue is within the recommended range",
    th: "บทพูดอยู่ในช่วงที่แนะนำ",
  },
  // Acceptance-review fix #1 (2026-07-08, HIGH false-positive) — task-
  // specified Thai label verbatim.
  story_structure_complete: {
    en: "Story is complete (hook, beats, cliffhanger)",
    th: "เนื้อเรื่องครบ (จุดเปิดเรื่อง บีตเรื่อง จุดค้างท้ายตอนย่อย)",
  },
  shots_9: {
    en: "Storyboard has the required 9 shots",
    th: "สตอรีบอร์ดมีครบ 9 ช็อต",
  },
  beats_mapped: {
    en: "Every shot carries a clear narrative purpose",
    th: "ทุกช็อตมีจุดประสงค์การเล่าเรื่องชัดเจน",
  },
  scorecard_meets_floor: {
    en: "Quality scorecard meets the floor",
    th: "คะแนนคุณภาพผ่านเกณฑ์",
  },
  loop_state: {
    en: "Auto-improve loop has not escalated",
    th: "การปรับอัตโนมัติไม่ติดขัด",
  },
  tie_in_naturalness_floor: {
    en: "Product tie-in meets the naturalness floor",
    th: "การฝังสินค้าผ่านเกณฑ์ความเป็นธรรมชาติ",
  },
  start_frames_all_approved: {
    en: "Every shot has an approved start frame",
    th: "ทุกช็อตมีภาพเริ่มต้นที่อนุมัติแล้ว",
  },
  dialogue_plan_exists: {
    en: "Dialogue/audio plan has been generated",
    th: "สร้างแผนบทพูด/เสียงแล้ว",
  },
  dialogue_no_blocking_issues: {
    en: "No blocking dialogue issues",
    th: "ไม่มีปัญหาบทพูดที่ต้องแก้ก่อน",
  },
  // Acceptance-review fix #3 (2026-07-08, MEDIUM) — task-specified Thai
  // label verbatim.
  dialogue_no_warning_issues: {
    en: "No outstanding dialogue warnings",
    th: "ไม่มีคำเตือนเรื่องบทพูดค้างอยู่",
  },
  video_prompts_exist: {
    en: "Video prompt pack has been generated",
    th: "สร้างชุดพรอมต์วิดีโอแล้ว",
  },
  video_prompts_not_stale: {
    en: "Video prompt pack is up to date",
    th: "ชุดพรอมต์วิดีโอเป็นข้อมูลล่าสุด",
  },
  video_clips_all_complete: {
    en: "Every required video clip is complete",
    th: "คลิปวิดีโอครบตามที่ต้องการ",
  },
  final_assembly_durations_aligned: {
    en: "Clip durations match the duration profile",
    th: "ความยาวคลิปตรงตามแผนความยาว",
  },
  final_assembly_audio_subtitle_resolved: {
    en: "Audio/subtitle strategy is resolved",
    th: "กำหนดแนวทางเสียง/คำบรรยายแล้ว",
  },
  final_assembly_completed: {
    en: "Sub-episode has been assembled",
    th: "ประกอบตอนย่อยแล้ว",
  },

  // 2026-07-08/W9-A landed these 7 content-completeness ids for real (spec
  // §14.1 rule 6b, section-12 "Pass Semantics — Content Completeness") —
  // `episode_script` gains 4, `storyboard_shots` gains 2, `script_qc` gains
  // 1 (see `productionWizard.ts`'s `VERTICAL_DRAMA_WIZARD_CRITERION_IDS`).
  // Every Thai string is plain, short, and concrete (ม.ปลาย register) per
  // this task's copy-register requirement.
  dialogue_every_shot: {
    en: "Every shot has dialogue",
    th: "ทุกช็อตมีบทพูด",
  },
  no_shot_over_length: {
    en: "No shot's dialogue runs longer than its clip",
    th: "ไม่มีช็อตที่บทยาวเกินเวลา",
  },
  no_long_silence: {
    en: "No silence gap runs too long",
    th: "ไม่มีช่วงเงียบนานเกินไป",
  },
  all_lines_speakable: {
    en: "Every line can actually be spoken aloud (no stray symbols)",
    th: "ทุกประโยคอ่านออกเสียงได้จริง (ไม่มีสัญลักษณ์แปลก)",
  },
  image_prompts_all_shots: {
    en: "Every shot has an image prompt",
    th: "ทุกช็อตมีคำสั่งสร้างภาพ (prompt ภาพ)",
  },
  video_prompts_all_shots: {
    en: "Every shot has a video prompt",
    th: "ทุกช็อตมีคำสั่งสร้างวิดีโอ (prompt วิดีโอ)",
  },
  no_unresolved_recommended_repairs: {
    en: "Every recommended repair has been handled",
    th: "จัดการรายการซ่อมที่แนะนำครบแล้ว",
  },
};

/**
 * Accepts a plain `string` (not the narrower
 * `VerticalDramaProductionWizardCriterionId`) for the same reason as
 * `vdWizardReasonLabel` above — defensive against any FUTURE criterion id
 * this map doesn't recognize yet (this exact scenario already happened once
 * during this task: the 7 content-completeness ids above landed mid-edit).
 * Every existing/known id keeps returning the exact same string as a
 * strictly-typed accessor would; an id in neither map renders as itself
 * rather than throwing.
 */
export function vdWizardCriterionLabel(id: string, locale: VdLocale): string {
  const l = (
    VD_WIZARD_CRITERION_LABELS as Record<
      string,
      { en: string; th: string } | undefined
    >
  )[id];
  if (!l) return id;
  return locale === "th" ? l.th : l.en;
}

/**
 * "ขั้นนี้ยังไม่ครบ — เหลือ: {items}" (2026-07-08 W9-B, owner directive,
 * section-12 "Pass Semantics — Content Completeness" rule 1) — the
 * step-detail headline for a step with a content-completeness gap: either
 * `passState === "incomplete"` (`storyboard_shots`) or `status === "passed"
 * && passState === "failed"` (`episode_script`/`script_qc` — see
 * `vdWizardStepDisplayStatusLabel`'s doc comment and `productionWizard.ts`'s
 * `withCompletenessPassStateOverride`, module header decision 12). Both
 * cases get the SAME headline wording — it is equally true in both that
 * "this step isn't complete", the difference is only how urgent the small
 * status badge reads. Lists every criterion whose `passed` is NOT `true`
 * (both `false` — a definite unmet fact — and `null` — not yet evaluable,
 * e.g. an artifact a LATER step produces) via `vdWizardCriterionLabel`, so
 * the exact same label a criterion row shows also appears here — one
 * source of truth, no separately-maintained wording. Falls back to a
 * generic sentence when `criteria` is empty (a stale/hand-built fixture)
 * so the headline never renders empty text.
 */
export function vdWizardIncompleteHeadline(
  criteria: readonly { id: string; passed: boolean | null }[],
  locale: VdLocale
): string {
  const t = vdCopy(locale);
  const unmet = criteria.filter(c => c.passed !== true);
  if (unmet.length === 0) return t.wizardIncompleteHeadlineGeneric;
  const items = unmet.map(c => vdWizardCriterionLabel(c.id, locale)).join(", ");
  return vdCopyWithParams(t.wizardIncompleteHeadlineTemplate, { items });
}

/** Pass/fail/unknown TEXT badge for a criterion row (✓/⚠/✗ — icon shape is
 *  chosen by the caller from the SAME `passed` value; this is the
 *  accompanying text so severity is never color/icon-only). */
export function vdWizardCriterionStatusLabel(
  passed: boolean | null,
  locale: VdLocale
): string {
  const t = vdCopy(locale);
  if (passed === true) return t.wizardCriterionPassedLabel;
  if (passed === false) return t.wizardCriterionFailedLabel;
  return t.wizardCriterionWarningLabel;
}

/** Short label for "what this step's criteria do NOT cover" — paired with
 *  the OTHER step's own canonical `vdWizardStepLabel` inside
 *  `wizardOutOfScopeTemplate` (never a second, separately-maintained step
 *  name). */
export const VD_WIZARD_OUT_OF_SCOPE_ITEM_LABELS: Record<
  VerticalDramaProductionWizardOutOfScopeNoteId,
  { en: string; th: string }
> = {
  dialogue_later_step: { en: "per-shot dialogue lines", th: "บทพูดรายช็อต" },
  prompts_later_step: { en: "video prompts", th: "พรอมต์วิดีโอ" },
};

/**
 * Renders one full "not checked at this step, happens later" sentence
 * (spec owner confusions #1 and #3) from a resolver `outOfScopeNotes[]`
 * entry — `laterStepId` is resolved through the SAME `vdWizardStepLabel`
 * every other surface uses, so the destination step's name can never drift
 * out of sync between this line and the stepper itself.
 */
export function vdWizardOutOfScopeLine(
  note: {
    id: VerticalDramaProductionWizardOutOfScopeNoteId;
    laterStepId: VerticalDramaProductionWizardStepId;
  },
  locale: VdLocale
): string {
  const t = vdCopy(locale);
  const itemLabel = VD_WIZARD_OUT_OF_SCOPE_ITEM_LABELS[note.id];
  return vdCopyWithParams(t.wizardOutOfScopeTemplate, {
    item: locale === "th" ? itemLabel.th : itemLabel.en,
    step: vdWizardStepLabel(note.laterStepId, locale),
  });
}

/**
 * Localizes `script_qc`'s "Scorecard overall" evidence row from the
 * resolver's structured `scorecardOverall` payload (module header, decision
 * 11) — `overall: null` (never reviewed) gets the dedicated "not reviewed"
 * sentence; otherwise reuses the SAME `qualityOverallVsFloorTemplate` the
 * quality-review card already uses elsewhere in this file family, so
 * "คะแนนรวม {x}/5 (เกณฑ์ {y})" reads identically in both places.
 */
export function vdWizardScorecardOverallEvidence(
  scorecardOverall: { overall: number | null; minOverall: number },
  locale: VdLocale
): { label: string; value: string } {
  const t = vdCopy(locale);
  const label = t.qualityOverall;
  if (scorecardOverall.overall === null) {
    return { label, value: t.wizardScorecardNotReviewed };
  }
  return {
    label,
    value: vdCopyWithParams(t.qualityOverallVsFloorTemplate, {
      x: scorecardOverall.overall,
      y: scorecardOverall.minOverall,
    }),
  };
}

/** Every auto-improve loop state the wizard's `script_qc` evidence row can
 *  carry, including the wizard-only `"not_run"` (spec owner confusion #4 —
 *  the leaked raw `"not_run"` string). */
export const VD_WIZARD_LOOP_STATE_LABELS: Record<
  VerticalDramaProductionWizardQualityLoopStatus,
  { en: string; th: string }
> = {
  not_run: {
    en: "Auto-improve has never run",
    th: "ยังไม่เคยรันปรับอัตโนมัติ",
  },
  idle: {
    en: "Reviewed — no auto-improve needed",
    th: "ตรวจแล้ว ไม่ต้องปรับอัตโนมัติ",
  },
  running: { en: "Auto-improving now", th: "กำลังปรับอัตโนมัติอยู่" },
  passed: {
    en: "Auto-improve finished successfully",
    th: "ปรับอัตโนมัติสำเร็จแล้ว",
  },
  escalated_max_rounds: {
    en: "Reached the round limit — needs manual review",
    th: "ครบรอบสูงสุดแล้ว — ต้องตรวจเอง",
  },
  escalated_regression: {
    en: "Score got worse — needs manual review",
    th: "คะแนนแย่ลง — ต้องตรวจเอง",
  },
};

export function vdWizardLoopStateLabel(
  status: VerticalDramaProductionWizardQualityLoopStatus,
  locale: VdLocale
): string {
  const l = VD_WIZARD_LOOP_STATE_LABELS[status];
  return locale === "th" ? l.th : l.en;
}

/** Localizes `script_qc`'s "Auto-improve loop" evidence row from the
 *  resolver's structured `loopState` payload (module header, decision 11). */
export function vdWizardLoopStateEvidence(
  status: VerticalDramaProductionWizardQualityLoopStatus,
  locale: VdLocale
): { label: string; value: string } {
  return {
    label: vdCopy(locale).wizardLoopStateRowLabel,
    value: vdWizardLoopStateLabel(status, locale),
  };
}

/**
 * Fixed vocabulary of every OTHER evidence row's localized `{label, value}`
 * pair (module header, decision 11) — one entry per
 * `VerticalDramaProductionWizardEvidenceId`. `value` may contain a single
 * `{n}` placeholder, filled from the row's `detail` (pre-formatted numbers
 * only) via `vdWizardEvidenceIdValue` below.
 */
export const VD_WIZARD_EVIDENCE_LABELS: Record<
  VerticalDramaProductionWizardEvidenceId,
  { en: { label: string; value: string }; th: { label: string; value: string } }
> = {
  series_setup_complete: {
    en: { label: "Series setup", value: "Complete" },
    th: { label: "ตั้งค่าซีรีส์", value: "ครบถ้วน" },
  },
  series_setup_incomplete: {
    en: { label: "Series setup", value: "Incomplete" },
    th: { label: "ตั้งค่าซีรีส์", value: "ยังไม่ครบ" },
  },
  episode_script_needs_series_setup: {
    en: { label: "Series setup", value: "Required first" },
    th: { label: "ตั้งค่าซีรีส์", value: "ต้องทำให้ครบก่อน" },
  },
  episode_script_not_started: {
    en: { label: "Script", value: "Not started" },
    th: { label: "บทตอนย่อย", value: "ยังไม่เริ่ม" },
  },
  // Acceptance-review fix #4 (2026-07-08, dormant leak) — the
  // `episode_script` speech-coverage row's flags-off fallback (no real
  // numbers available yet, see `SCRIPT_SPEECH_COVERAGE_STATUS_EVIDENCE_IDS`
  // in `productionWizard.ts`). Reuses `densityMeterTitle` as the label (same
  // concept the "with real numbers" `vdWizardScriptCoverageEvidence` path
  // already uses) so both rendering paths read identically.
  script_speech_coverage_in_range: {
    en: { label: "Dialogue density", value: "Within the recommended range" },
    th: { label: "ความหนาแน่นบทพูด", value: "อยู่ในเกณฑ์ที่แนะนำ" },
  },
  script_speech_coverage_underfilled_warning: {
    en: {
      label: "Dialogue density",
      value: "A bit below the recommended range",
    },
    th: { label: "ความหนาแน่นบทพูด", value: "น้อยกว่าช่วงที่แนะนำเล็กน้อย" },
  },
  script_speech_coverage_underfilled_error: {
    en: { label: "Dialogue density", value: "Below the minimum floor" },
    th: { label: "ความหนาแน่นบทพูด", value: "น้อยกว่าเกณฑ์ขั้นต่ำ" },
  },
  script_speech_coverage_no_dialogue_data: {
    en: {
      label: "Dialogue density",
      value: VD_COPY.en.wizardScriptNoDialogueDataMessage,
    },
    th: {
      label: "ความหนาแน่นบทพูด",
      value: VD_COPY.th.wizardScriptNoDialogueDataMessage,
    },
  },
  storyboard_needs_script_fix: {
    en: { label: "Sub-episode script", value: "Underfilled" },
    th: { label: "บทตอนย่อย", value: "บทพูดน้อยเกินไป" },
  },
  storyboard_needs_script: {
    en: { label: "Sub-episode script", value: "Missing" },
    th: { label: "บทตอนย่อย", value: "ยังไม่มี" },
  },
  storyboard_generated: {
    en: { label: "Storyboard", value: "9 shots generated" },
    th: { label: "สตอรีบอร์ด", value: "สร้างครบ 9 ช็อตแล้ว" },
  },
  storyboard_not_generated: {
    en: { label: "Storyboard", value: "Not generated" },
    th: { label: "สตอรีบอร์ด", value: "ยังไม่ได้สร้าง" },
  },
  script_qc_needs_storyboard: {
    en: { label: "Storyboard", value: "Required before quality review" },
    th: { label: "สตอรีบอร์ด", value: "ต้องมีก่อนตรวจคุณภาพ" },
  },
  tie_in_not_produced: {
    en: { label: "Tie-in naturalness", value: "Not produced" },
    th: { label: "ความเป็นธรรมชาติของการฝังสินค้า", value: "ยังไม่มีรายงาน" },
  },
  tie_in_naturalness_passed: {
    en: { label: "Tie-in naturalness", value: "Passed" },
    th: { label: "ความเป็นธรรมชาติของการฝังสินค้า", value: "ผ่านเกณฑ์" },
  },
  tie_in_naturalness_below_floor: {
    en: { label: "Tie-in naturalness", value: "Below floor" },
    th: { label: "ความเป็นธรรมชาติของการฝังสินค้า", value: "ต่ำกว่าเกณฑ์" },
  },
  arc_replan_pending: {
    en: { label: "Arc re-plan", value: "Pending review" },
    th: { label: "การปรับแผนซีซั่น", value: "รอการตรวจสอบ" },
  },
  start_frames_needs_script_qc: {
    en: { label: "Script quality QC", value: "Not passed yet" },
    th: { label: "ตรวจคุณภาพบท", value: "ยังไม่ผ่าน" },
  },
  start_frames_approved_count: {
    en: { label: "Approved start frames", value: "{n} approved" },
    th: { label: "เฟรมเริ่มต้นที่อนุมัติแล้ว", value: "อนุมัติแล้ว {n}" },
  },
  dialogue_audio_needs_start_frames: {
    en: { label: "Start frames", value: "Not fully approved yet" },
    th: { label: "เฟรมเริ่มต้น", value: "ยังอนุมัติไม่ครบ" },
  },
  dialogue_audio_created: {
    en: { label: "Dialogue plan", value: "Created" },
    th: { label: "แผนบทพูด", value: "สร้างแล้ว" },
  },
  dialogue_audio_not_created: {
    en: { label: "Dialogue plan", value: "Not created" },
    th: { label: "แผนบทพูด", value: "ยังไม่ได้สร้าง" },
  },
  dialogue_qc_needs_dialogue_audio: {
    en: { label: "Dialogue plan", value: "Required first" },
    th: { label: "แผนบทพูด", value: "ต้องมีก่อน" },
  },
  dialogue_qc_episode_coverage: {
    en: { label: "Sub-episode speech coverage", value: "{n} sec" },
    th: { label: "ความครอบคลุมบทพูดทั้งตอนย่อย", value: "{n} วิ" },
  },
  dialogue_qc_episode_coverage_unavailable: {
    en: { label: "Sub-episode speech coverage", value: "Not available" },
    th: { label: "ความครอบคลุมบทพูดทั้งตอนย่อย", value: "ยังไม่มีข้อมูล" },
  },
  dialogue_qc_blocking_count: {
    en: { label: "Blocking dialogue issues", value: "{n}" },
    th: { label: "ปัญหาบทพูดที่ต้องแก้ก่อน", value: "{n} จุด" },
  },
  video_prompts_prerequisites_not_met: {
    en: { label: "Video prompts", value: "Prerequisites not met" },
    th: { label: "พรอมต์วิดีโอ", value: "ยังไม่ครบเงื่อนไข" },
  },
  video_prompts_not_generated: {
    en: { label: "Video prompt pack", value: "Not generated" },
    th: { label: "ชุดพรอมต์วิดีโอ", value: "ยังไม่ได้สร้าง" },
  },
  video_prompts_stale: {
    en: { label: "Video prompt pack", value: "Stale" },
    th: { label: "ชุดพรอมต์วิดีโอ", value: "เป็นข้อมูลเก่า" },
  },
  video_prompts_fresh: {
    en: { label: "Video prompt pack", value: "Fresh" },
    th: { label: "ชุดพรอมต์วิดีโอ", value: "เป็นข้อมูลล่าสุด" },
  },
  shot_repair_needs_storyboard: {
    en: { label: "Storyboard", value: "Required first" },
    th: { label: "สตอรีบอร์ด", value: "ต้องมีก่อน" },
  },
  shot_repair_count: {
    en: { label: "Shots needing repair", value: "{n}" },
    th: { label: "ช็อตที่ต้องซ่อม", value: "{n} ช็อต" },
  },
  video_clips_needs_video_prompts: {
    en: { label: "Video prompts", value: "Not ready" },
    th: { label: "พรอมต์วิดีโอ", value: "ยังไม่พร้อม" },
  },
  video_clips_completed_count: {
    en: { label: "Clips completed", value: "{n}" },
    th: { label: "คลิปที่เสร็จแล้ว", value: "{n}" },
  },
  final_episode_needs_video_clips: {
    en: { label: "Video clips", value: "Not complete" },
    th: { label: "คลิปวิดีโอ", value: "ยังไม่ครบ" },
  },
  final_episode_durations_misaligned: {
    en: {
      label: "Assembly readiness",
      value: "Clip durations do not match the duration profile",
    },
    th: {
      label: "ความพร้อมประกอบตอนย่อย",
      value: "ความยาวคลิปไม่ตรงตามแผนความยาว",
    },
  },
  final_episode_audio_subtitle_unresolved: {
    en: {
      label: "Assembly readiness",
      value: "Audio/subtitle strategy unresolved",
    },
    th: {
      label: "ความพร้อมประกอบตอนย่อย",
      value: "ยังไม่ได้กำหนดแนวทางเสียง/คำบรรยาย",
    },
  },
  final_episode_completed: {
    en: { label: "Assembly", value: "Completed" },
    th: { label: "การประกอบตอนย่อย", value: "เสร็จแล้ว" },
  },
  final_episode_ready_to_assemble: {
    en: { label: "Assembly", value: "Ready to assemble" },
    th: { label: "การประกอบตอนย่อย", value: "พร้อมประกอบ" },
  },
};

/**
 * Localizes any OTHER evidence row from its `evidenceId` (+ optional
 * `detail`, pre-formatted numbers only) — module header, decision 11. Falls
 * back to the row's own English `label`/`value` when `id` is somehow not in
 * the fixed vocabulary (defensive only; every id this resolver emits is a
 * member by construction).
 */
export function vdWizardEvidenceIdValue(
  id: VerticalDramaProductionWizardEvidenceId,
  detail: string | undefined,
  locale: VdLocale
): { label: string; value: string } {
  const entry = VD_WIZARD_EVIDENCE_LABELS[id];
  if (!entry) return { label: id, value: detail ?? "" };
  const pair = locale === "th" ? entry.th : entry.en;
  return {
    label: pair.label,
    value:
      detail !== undefined ? pair.value.split("{n}").join(detail) : pair.value,
  };
}

/**
 * Round-history stage-repair label (section-14 loop CTA copy: "รอบ {i}:
 * แก้บท → แก้สตอรีบอร์ด → ตรวจใหม่"). Only the four groups the loop can
 * actually target at runtime (`plan_episode_script` / `storyboard_shotgrid` /
 * `dialogue_audio_plan` / `tie_in`) have dedicated short verb-phrase copy;
 * any other `VerticalDramaPipelineStage` value falls back to `vdStageLabel`
 * (defensive only — `VerticalDramaQualityRepairGroup` is typed as the WIDE
 * `VerticalDramaPipelineStage | "tie_in"` union purely for compatibility, see
 * that type's own doc comment in `qualityPolicy.ts`).
 */
export function vdQualityRepairGroupLabel(
  group: VerticalDramaQualityRepairGroup,
  locale: VdLocale
): string {
  const c = vdCopy(locale);
  switch (group) {
    case "plan_episode_script":
      return c.qualityLoopStageScript;
    case "storyboard_shotgrid":
      return c.qualityLoopStageStoryboard;
    case "dialogue_audio_plan":
      return c.qualityLoopStageDialogue;
    case "tie_in":
      return c.qualityLoopStageTieIn;
    default:
      return vdStageLabel(group, locale);
  }
}

/**
 * Maps a raw mutation error message to a friendly localized string when it
 * carries the `VD_TIE_IN_BELOW_FLOOR:` prefix (spec §13.1) — thrown by
 * `runStage` / `regenerateStage` / `generateStartFrameImage` /
 * `generateVideoClip` (`assertTieInQualityGatePassed`,
 * `server/routers/verticalDramaEpisodes.ts`) when a tie-in-carrying shot's
 * naturalness report is failing or missing. Any other message passes through
 * unchanged, so this is always safe to apply to an arbitrary error string.
 */
export function vdMapGenerationErrorMessage(
  message: string,
  locale: VdLocale
): string {
  if (message.startsWith("VD_TIE_IN_BELOW_FLOOR:")) {
    return vdCopy(locale).tieInBlockedHint;
  }
  return message;
}

/* -------------------------------------------------------------------------- */
/* Task #21 / W12.5 "Final Render Suite" phase B (2026-07-09) — subtitle      */
/* preset labels + defensive reason-code/reason-message -> Thai mappers      */
/* -------------------------------------------------------------------------- */

/**
 * The 9 real caption STYLE presets `assembleEpisodeVideo`/`assembleSeasonVideos`
 * accept (`HyperframesFinalCompositeSubtitlePresetSchema`,
 * `shared/hyperframes/runtimeApiSchemas.ts`) — kept as this file's own
 * independent id union (not imported from server code), same "independent
 * client view types" convention as the Ad Banner Overlay types above. That
 * schema actually has a 10th member, `"no_subtitle_style"`, but the render
 * service (`resolveEpisodeDialogueAudioAndSubtitlesRunInputs`,
 * `verticalDramaEpisodeVideoAssembly.ts`) treats it and the mutations' own
 * `"none"` literal IDENTICALLY (both mean "burn in no subtitles at all") —
 * so the picker below only ever sends `"none"` for "no subtitles" (never
 * `"no_subtitle_style"`), avoiding two options that do the exact same thing.
 */
export const VD_FINAL_RENDER_SUBTITLE_PRESET_LABELS: Record<
  | "classic_box"
  | "minimal_shadow"
  | "creator_pop"
  | "karaoke_word"
  | "highlight_bar"
  | "lower_third"
  | "cinematic_wide"
  | "neon_glow"
  | "review_bubble",
  { en: string; th: string }
> = {
  classic_box: { en: "Classic box", th: "กล่องคลาสสิก" },
  minimal_shadow: { en: "Minimal shadow", th: "เงาบางเบา" },
  creator_pop: { en: "Creator pop", th: "ครีเอเตอร์" },
  karaoke_word: { en: "Karaoke word", th: "คาราโอเกะ" },
  highlight_bar: { en: "Highlight bar", th: "แถบไฮไลต์" },
  lower_third: { en: "Lower third", th: "แถบล่างซ้าย" },
  cinematic_wide: { en: "Cinematic wide", th: "ซีเนม่า" },
  neon_glow: { en: "Neon glow", th: "นีออน" },
  review_bubble: { en: "Review bubble", th: "บับเบิลรีวิว" },
};

export type VdFinalRenderSubtitlePresetId =
  keyof typeof VD_FINAL_RENDER_SUBTITLE_PRESET_LABELS;

/** The mutations' full `subtitlePreset` input union (a real style preset, or `"none"` to skip subtitles entirely). */
export type VdFinalRenderSubtitlePresetValue =
  | VdFinalRenderSubtitlePresetId
  | "none";

/** Stable render order for the picker — insertion order of the labels map above. */
export const VD_FINAL_RENDER_SUBTITLE_PRESET_IDS = Object.keys(
  VD_FINAL_RENDER_SUBTITLE_PRESET_LABELS
) as VdFinalRenderSubtitlePresetId[];

export function vdFinalRenderSubtitlePresetLabel(
  id: VdFinalRenderSubtitlePresetId,
  locale: VdLocale
): string {
  const l = VD_FINAL_RENDER_SUBTITLE_PRESET_LABELS[id];
  return locale === "th" ? l.th : l.en;
}

/**
 * Subtitle FONT SIZE options for the whole-episode compiled video render
 * (render-options extension, 2026-07-13) — mirrors
 * `VD_FINAL_RENDER_SUBTITLE_PRESET_LABELS`'s id-map + stable-order-array +
 * label-helper shape exactly, just for the 4-value `subtitleFontSize` union
 * instead of the 9 style presets. `"medium"` is the server's default
 * whenever `subtitleFontSize` is omitted from the mutate payload
 * (`assembleEpisodeVideo`, `server/routers/verticalDramaEpisodes.ts`).
 */
export const VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_LABELS: Record<
  "small" | "medium" | "large" | "xlarge",
  { en: string; th: string }
> = {
  small: { en: "Small", th: "เล็ก" },
  medium: { en: "Medium (default)", th: "กลาง (ค่าเริ่มต้น)" },
  large: { en: "Large", th: "ใหญ่" },
  xlarge: { en: "Extra large", th: "ใหญ่มาก" },
};

/** The mutations' `subtitleFontSize` input union. */
export type VdFinalRenderSubtitleFontSizeValue =
  keyof typeof VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_LABELS;

/** Stable render order for the picker — insertion order of the labels map above. */
export const VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_IDS = Object.keys(
  VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_LABELS
) as VdFinalRenderSubtitleFontSizeValue[];

export function vdFinalRenderSubtitleFontSizeLabel(
  id: VdFinalRenderSubtitleFontSizeValue,
  locale: VdLocale
): string {
  const l = VD_FINAL_RENDER_SUBTITLE_FONT_SIZE_LABELS[id];
  return locale === "th" ? l.th : l.en;
}

/**
 * Short chip-style labels for `assembleEpisodeVideo`'s `excludedAdBanners[]
 * .code` (F131W, task #21 phase B — `VdEpisodeAdBannerExclusion`,
 * `server/routers/verticalDramaEpisodes.ts`). Same "re-derive a localized
 * string from the CODE, never show the server's own English-only message
 * verbatim" convention as `VD_DIALOGUE_ISSUE_LABELS`/`vdDialogueIssueLabel`
 * above — falls back to a generic (still localized, never-raw-English)
 * string for any code this file doesn't recognize yet.
 */
export const VD_AD_BANNER_EXCLUSION_REASON_LABELS: Record<
  string,
  { en: string; th: string }
> = {
  VD_EPISODE_AD_BANNER_DESIGN_NOT_READY: {
    en: "Design not ready",
    th: "ดีไซน์ยังไม่พร้อม",
  },
  VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED: {
    en: "Needs approval",
    th: "ต้องรออนุมัติก่อน",
  },
};

export function vdAdBannerExclusionReasonLabel(
  code: string,
  locale: VdLocale
): string {
  const l = VD_AD_BANNER_EXCLUSION_REASON_LABELS[code];
  if (!l) return vdCopy(locale).adBannerExclusionUnknownReasonFallback;
  return locale === "th" ? l.th : l.en;
}

/**
 * `assembleSeasonVideos`'s per-episode `skipped[].reason` (task #21 phase B,
 * `server/routers/verticalDramaSeries.ts`) is a raw English SENTENCE, not a
 * short code — either this router's own
 * "No video clips exist for this episode yet…" precondition text, or
 * `resolveClipsForAssembly`'s (`verticalDramaEpisodeVideoAssembly.ts`)
 * `vertical_drama_assembly_missing_clips:`/`vertical_drama_assembly_no_clips:`
 * -prefixed errors. Matches the currently-known messages/prefixes and
 * returns a short Thai/English label for them; any other message (a future
 * precondition this file hasn't been taught about yet) passes through
 * UNCHANGED — same raw-passthrough-on-no-match convention as
 * `vdMapGenerationErrorMessage` above, per this feature's own "unknown
 * reason shows raw" design decision.
 */
export function vdSeasonRenderSkipReasonLabel(
  reason: string,
  locale: VdLocale
): string {
  if (reason.startsWith("vertical_drama_assembly_missing_clips:")) {
    return locale === "th"
      ? "มีช็อต/คลิปที่ยังไม่มีวิดีโอสมบูรณ์"
      : "Some shots/clips have no completed video yet";
  }
  if (reason.startsWith("vertical_drama_assembly_no_clips:")) {
    return locale === "th"
      ? "ยังไม่มีคลิปวิดีโอที่เสร็จสมบูรณ์เลย"
      : "No completed video clips exist yet";
  }
  if (
    reason ===
      "No video clips exist for this Sub-episode yet — generate the video motion prompt pack and render clips first." ||
    reason ===
      "No video clips exist for this episode yet — generate the video motion prompt pack and render clips first."
  ) {
    return locale === "th"
      ? "ยังไม่มีคลิปวิดีโอ — ต้องสร้างชุดพรอมป์วิดีโอและเรนเดอร์คลิปก่อน"
      : "No video clips yet — generate the video motion prompt pack and render clips first";
  }
  return reason;
}
