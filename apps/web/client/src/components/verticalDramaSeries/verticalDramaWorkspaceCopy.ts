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

export type VdLocale = "th" | "en";

export type VdPhaseId = "plan" | "frames" | "prompt_handoff" | "generate_assemble";

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
  return VD_PHASES.find((p) => p.stages.includes(stage)) ?? VD_PHASES[0];
}

export function vdPhaseLabel(phase: VdPhase, locale: VdLocale): string {
  return locale === "th" ? phase.labelTh : phase.labelEn;
}

/** Human, bilingual stage labels. */
export const VD_STAGE_LABELS: Record<VerticalDramaPipelineStage, { en: string; th: string }> = {
  normalize_series_input: { en: "Normalize input", th: "จัดรูปแบบข้อมูล" },
  plan_episode_script: { en: "Episode script", th: "บทตอน" },
  update_character_visual_bible: { en: "Character visual bible", th: "ไบเบิลตัวละคร" },
  generate_or_import_character_refs: { en: "Character references", th: "ภาพอ้างอิงตัวละคร" },
  storyboard_shotgrid: { en: "9-shot storyboard", th: "สตอรีบอร์ด 9 ช็อต" },
  start_frame_render_plan: { en: "Start-frame plan", th: "แผนเฟรมเริ่ม" },
  render_or_import_start_frames: { en: "Render start frames", th: "เรนเดอร์เฟรมเริ่ม" },
  approve_start_frames: { en: "Approve start frames", th: "อนุมัติเฟรมเริ่ม" },
  dialogue_audio_plan: { en: "Dialogue & audio", th: "บทพูดและเสียง" },
  video_motion_prompt_pack: { en: "Motion prompt pack", th: "ชุดพรอมป์การเคลื่อนไหว" },
  create_storyboard_review_project: { en: "Storyboard Review project", th: "โปรเจกต์รีวิวสตอรีบอร์ด" },
  review_generate_repair_in_storyboard_review: { en: "Review, generate, repair", th: "รีวิว สร้าง ซ่อม" },
  render_or_import_video_clips: { en: "Render video clips", th: "เรนเดอร์คลิปวิดีโอ" },
  assemble_episode_manifest: { en: "Assemble episode", th: "ประกอบตอน" },
  summarize_episode_to_series_memory: { en: "Update series memory", th: "อัปเดตความจำซีรีส์" },
};

export function vdStageLabel(stage: VerticalDramaPipelineStage, locale: VdLocale): string {
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
    generateRealScriptConfirmWarning: "This uses real AI generation and spends credits.",
    generateRealScriptConfirmNote: "Continue only if you want the actual episode script, not the free placeholder.",
    regenerateStage: "Regenerate (delete old)",
    regenerateConfirm: "Deletes the current output and creates new — cannot be undone.",
    regenerateConfirmButton: "Delete & regenerate",
    regenerating: "Regenerating…",
    generateEpisode: "Generate this episode (paid)",
    generateEpisodeExplain: "One click generates the script, syncs character data, checks references, and builds the 9-shot storyboard.",
    generateEpisodeConfirmNote: "This runs the full setup in one go — script + storyboard generation, real AI, spends credits.",
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
    currentSummary: "Current summary (derived view — pending updates not yet applied)",
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
    createEpisode: "Create episode",
    noEpisode: "No episode yet",
    readOnlyCompleted: "Completed episode (read-only)",
    dryRunNote: "Dry run: no paid generation.",
    filterKind: "Filter by kind",
    filterEpisode: "Episode #",
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
    modelChangeNote: "Changing the model only affects future generations — images/clips already made are untouched.",
    modelSelectionSaved: "Model selection saved.",
    capabilityMcpFree: "MCP (0 credits)",
    mcpConnectionLabel: "MCP connection",
    mcpConnectionNeededFor: "Needed for: {n}",
    mcpConnectionMissingToastImage: "Select an MCP connection before using this image model.",
    mcpConnectionMissingToastVideo: "Select an MCP connection before using this video model.",

    /* ---- Shot reference strip (Phase 2.5) ---- */
    references: "References",
    addReference: "Add reference",
    removeReference: "Remove reference",
    removeReferenceConfirm: "Remove this reference image from the shot? This does not delete it from your library.",
    referenceLimitWarning: "This model supports up to {n} reference images.",
    noReferencesYet: "No reference images yet — drag one here, or add from the grid cutter/history/library.",
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

    /* ---- One-click generate + inline prompt editing (Phase 4.1/4.2) ---- */
    generatePromptAndImage: "Generate prompt + image",
    generatingPromptAndImage: "Working…",
    reviewGeneratedPrompt: "Review the generated prompt before spending credits",
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
    reviewAutoPrompt: "Review the auto-generated prompt (edit if needed), then generate the image.",
    generateWithThisPrompt: "Generate image",

    /* ---- Video prompt pack generation (2026-07-05 fix) ---- */
    generateVideoPromptPack: "Generate video prompts (paid)",
    generatingVideoPromptPack: "Generating…",
    generateVideoPromptPackConfirmNote: "This generates dialogue/audio timing and video motion prompts for every clip — real AI, spends credits.",
    generateVideoPromptPackNeedsStoryboard: "Storyboard is required first.",

    /* ---- Quality review card (Phase 3B.5) ---- */
    qualityReview: "Quality review (AI)",
    runQualityReview: "Check episode quality (AI)",
    runningQualityReview: "Reviewing…",
    qualityReviewCostNote: "Cheap, LLM-only check — run this before spending credits on images/video.",
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
    qualityApplyCostNote:
      "Real AI repair calls — spends credits on each affected stage (script and/or storyboard).",
    qualityApplySuccess: "Fixes applied — episode re-reviewed.",
    qualityApplySuccessNoReReview: "Fixes applied, but the re-review could not run.",
    qualityApplyStaleNotice:
      "Note: downstream stages are now stale — regenerate affected shots' image/video prompts.",
    qualityAlternative: "Re-review — suggest different fixes (paid)",
    qualityAlternativeRunning: "Reviewing…",
    qualityAlternativeSuccess: "New alternative suggestions ready.",

    /* ---- Episode -> series memory summarization (manual trigger) ---- */
    summarizeMemory: "Summarize into series memory (AI)",
    summarizeMemoryButton: "Summarize into series memory (AI)",
    summarizeMemoryRunning: "Summarizing…",
    summarizeMemoryNeedsScript: "Episode needs a generated script and storyboard first.",
    summarizeMemoryCostNote: "Extracts canonical facts, hooks, character/relationship changes, and continuity risks from this episode into durable series memory used by future episodes.",
    summarizeMemoryAlready: "This episode was already summarized into series memory.",
    summarizeMemoryReSummarize: "Re-summarize",
    summarizeMemoryReSummarizeConfirm: "Re-summarizing appends a fresh set of memory events for this episode. The prior summary is kept in history, not deleted. Continue?",
    summarizeMemorySuccess: "Memory saved: {count} events",
    summarizeMemoryFailed: "Failed to summarize episode into series memory.",

    /* ---- Resolution selector (storyboard-complete plan Phase 6.2) ---- */
    resolutionLabel: "Resolution",
    resolutionAuto: "Default",

    /* ---- Repair image (image-to-image) dialog (Phase 6.5) ---- */
    repairImage: "Fix image (AI)",
    repairImageDialogTitle: "Fix this image with AI",
    repairImageInstructionLabel: "What do you want to change in this image?",
    repairImageInstructionPlaceholder: "e.g. change the outfit, change the background",
    repairImageSubmit: "Generate fix",
    repairImageSubmitting: "Submitting…",
    repairImageWorking: "Generating the fixed image…",
    repairImageBefore: "Before",
    repairImageAfter: "After",
    repairImageUseNew: "Use the new image",
    repairImageKeepOld: "Keep the original",
    repairImageApplied: "Replaced with the new image.",
    repairImageDiscarded: "Kept the original image — the new one stays in history.",
    repairImageUnsupportedModel: "This model does not support image-to-image editing.",
    repairImageUnsupportedModelWithList: "This model does not support image-to-image editing. Models that support it: {n}",
    repairImageFailed: "Failed to generate the fixed image.",
    repairImageNeedsApprovedImage: "This shot needs an approved image before it can be fixed.",

    /* ---- Per-shot video prompt generation (Phase 6.6) ---- */
    generateShotVideoPrompt: "Generate video prompt (AI)",
    generatingShotVideoPrompt: "Analyzing image…",
    generateShotVideoPromptNeedsImage: "This shot needs an approved image first.",
    generateShotVideoPromptFailed: "Failed to generate the video prompt.",
    usedVisionNote: "Analyzed from the actual image",
    generateVideoPromptPackWholeEpisode: "Generate video prompts for the whole episode",

    /* ---- Completed video-clip player (2026-07-06 fix — completed video
       renders were never persisted/shown; only a transient toast) ---- */
    videoClipGenerating: "Generating video…",
    videoClipRegenerate: "Regenerate",
    videoClipOpenFull: "Open full screen",
    videoClipDurationLabel: "sec",
    download: "Download",

    /* ---- Whole-episode compiled video (2026-07-06 download + assembly upgrade) ---- */
    compiledVideoTitle: "Full-episode video",
    compiledVideoAssemble: "Assemble full episode video",
    compiledVideoReassemble: "Re-assemble",
    compiledVideoReassembleConfirm: "This replaces the current compiled video and cannot be undone.",
    compiledVideoReadyHint: "{ready}/{total} clips ready",
    compiledVideoMissingWarning: "Missing clips: {list} — generate those clips first, or assemble with only the completed clips.",
    compiledVideoAssemblePartial: "Assemble with completed clips only",
    compiledVideoProcessing: "Assembling the full episode video…",
    compiledVideoFailed: "Failed to assemble the full episode video.",
    compiledVideoRetry: "Retry",
    compiledVideoDurationLabel: "sec",
    compiledVideoPartialBadge: "Partial ({n} clips)",
    compiledVideoAssembleFailedToast: "Failed to start assembly.",
    compiledVideoAssembleStartedToast: "Started assembling the full episode video.",

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

    /* ---- Product reference image picker (2026-07-06 product tie-in upgrade) ---- */
    changeProductImage: "Change product image",
    productImagePickerTitle: "Choose product reference image(s)",
    productImagePickerCapHint: "Up to {n} product images are used per shot",
    productImagePickerBudgetHint: "This model accepts up to {n} reference images in total (characters + product)",
    productImagePickerNoImages: "No product images available yet — link a Marketplace Capture or add a product image URL in Product Tie-in settings.",
    productImagePickerSave: "Save selection",
    productImagePickerSaved: "Product reference image(s) updated.",
    productImagePickerSelectedCount: "{n} selected",
    productImageMultipleBadge: "+{n}",
  },
  th: {
    runDryRun: "รันแบบทดสอบ",
    runPlanOnly: "วางแผนเท่านั้น",
    generateImages: "สร้างภาพ (มีค่าใช้จ่าย)",
    generateVideo: "สร้างวิดีโอ (มีค่าใช้จ่าย)",
    generateRealScript: "สร้างบทจริง (มีค่าใช้จ่าย)",
    generatingRealScript: "กำลังสร้าง…",
    generateRealScriptConfirmWarning: "การทำงานนี้ใช้ AI จริงและใช้เครดิต",
    generateRealScriptConfirmNote: "ดำเนินการต่อเฉพาะเมื่อต้องการบทตอนจริง ไม่ใช่ placeholder ฟรี",
    regenerateStage: "สร้างใหม่ (ลบชุดเดิม)",
    regenerateConfirm: "จะลบผลลัพธ์ปัจจุบันและสร้างใหม่ — ย้อนกลับไม่ได้",
    regenerateConfirmButton: "ลบและสร้างใหม่",
    regenerating: "กำลังสร้างใหม่…",
    generateEpisode: "สร้างตอนนี้ (มีค่าใช้จ่าย)",
    generateEpisodeExplain: "กดครั้งเดียว ระบบจะสร้างบท ซิงก์ข้อมูลตัวละคร ตรวจภาพอ้างอิง และสร้างสตอรีบอร์ด 9 ช็อตให้ครบ",
    generateEpisodeConfirmNote: "จะรันขั้นตอนทั้งหมดในครั้งเดียว — สร้างบท + สตอรีบอร์ด ใช้ AI จริง มีค่าใช้จ่าย",
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
    currentSummary: "สรุปปัจจุบัน (มุมมองที่สืบทอด — อัปเดตที่รอยังไม่ถูกนำไปใช้)",
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
    createEpisode: "สร้างตอน",
    noEpisode: "ยังไม่มีตอน",
    readOnlyCompleted: "ตอนที่เสร็จแล้ว (อ่านอย่างเดียว)",
    dryRunNote: "โหมดทดสอบ: ไม่มีการสร้างที่มีค่าใช้จ่าย",
    filterKind: "กรองตามชนิด",
    filterEpisode: "ตอนที่",
    all: "ทั้งหมด",
    advancedPipelineDetail: "ขั้นสูง — ดูทุกขั้นตอนของ pipeline และประวัติการรัน",

    /* ---- Model selection (storyboard header, Phase 1.3) ---- */
    imageModel: "โมเดลภาพ",
    videoModel: "โมเดลวิดีโอ",
    chooseModel: "เลือกโมเดล",
    capabilityStartFrame: "เฟรมเริ่มต้น",
    capabilityNativeAudio: "เสียงพูดในตัว",
    capabilityMaxRefs: "อ้างอิงสูงสุด {n} ภาพ",
    capabilityCreditCost: "{n} เครดิต",
    modelChangeNote: "การเปลี่ยนโมเดลมีผลเฉพาะการสร้างครั้งถัดไป — ภาพ/คลิปที่ทำไปแล้วไม่ถูกแตะ",
    modelSelectionSaved: "บันทึกการเลือกโมเดลแล้ว",
    capabilityMcpFree: "MCP (0 เครดิต)",
    mcpConnectionLabel: "การเชื่อมต่อ MCP",
    mcpConnectionNeededFor: "จำเป็นสำหรับ: {n}",
    mcpConnectionMissingToastImage: "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลภาพนี้",
    mcpConnectionMissingToastVideo: "ต้องเลือกการเชื่อมต่อ MCP ก่อนใช้โมเดลวิดีโอนี้",

    /* ---- Shot reference strip (Phase 2.5) ---- */
    references: "ภาพอ้างอิง",
    addReference: "เพิ่มภาพอ้างอิง",
    removeReference: "ลบภาพอ้างอิง",
    removeReferenceConfirm: "ลบภาพอ้างอิงนี้ออกจากช็อตนี้หรือไม่? การลบนี้ไม่ได้ลบภาพออกจากคลังของคุณ",
    referenceLimitWarning: "โมเดลนี้ใช้ภาพอ้างอิงได้สูงสุด {n} ภาพ",
    noReferencesYet: "ยังไม่มีภาพอ้างอิง — ลากภาพมาวางที่นี่ หรือเพิ่มจากช่องตัดภาพ/ประวัติ/คลัง",
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

    /* ---- One-click generate + inline prompt editing (Phase 4.1/4.2) ---- */
    generatePromptAndImage: "สร้าง prompt + ภาพ",
    generatingPromptAndImage: "กำลังทำงาน…",
    reviewGeneratedPrompt: "ตรวจสอบ prompt ที่สร้างก่อนใช้เครดิต",
    savePromptFree: "บันทึก (ฟรี)",
    aiAdjustPaid: "ให้ AI ปรับ (มีค่าใช้จ่าย)",
    promptSaved: "บันทึก prompt แล้ว",
    promptOverLimitHint: "เกินขีดจำกัด — ระบบจะปรับให้พอดีอัตโนมัติตอนสร้างภาพ/วิดีโอ",

    /* ---- One-click generate mode choice + auto-prompt (2026-07-05 fix) ---- */
    chooseGenerateMode: "เลือกวิธีสร้างภาพ",
    generateModeSingle: "ภาพเดียว",
    generateModeAngles: "9 เฟรมหลายมุมกล้อง (3x3)",
    generateModeSingleHint: "สร้างภาพเดียวสำหรับช็อตนี้",
    generateModeAnglesHint: "สร้างภาพตาราง 3x3 หนึ่งภาพ แล้วเลือกมุมที่ดีที่สุด",
    autoPreparingPrompt: "กำลังเตรียมพรอมต์ภาพให้อัตโนมัติ…",
    autoPromptFailed: "เตรียมพรอมต์ภาพไม่สำเร็จ",
    retry: "ลองใหม่",
    reviewAutoPrompt: "ตรวจสอบพรอมต์ที่ระบบสร้างให้ (แก้ไขได้ถ้าต้องการ) แล้วจึงสร้างภาพ",
    generateWithThisPrompt: "สร้างภาพ",

    /* ---- Video prompt pack generation (2026-07-05 fix) ---- */
    generateVideoPromptPack: "สร้าง prompt วิดีโอ (มีค่าใช้จ่าย)",
    generatingVideoPromptPack: "กำลังสร้าง…",
    generateVideoPromptPackConfirmNote: "จะสร้างจังหวะบทพูด/เสียง และพรอมต์การเคลื่อนไหวของทุกคลิป — ใช้ AI จริง มีค่าใช้จ่าย",
    generateVideoPromptPackNeedsStoryboard: "ต้องมีสตอรีบอร์ดก่อน",

    /* ---- Quality review card (Phase 3B.5) ---- */
    qualityReview: "ตรวจคุณภาพเรื่อง (AI)",
    runQualityReview: "ตรวจคุณภาพเรื่อง (AI)",
    runningQualityReview: "กำลังตรวจสอบ…",
    qualityReviewCostNote: "ตรวจสอบด้วย AI ราคาถูก — ควรทำก่อนใช้เครดิตสร้างภาพ/วิดีโอ",
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
    qualityApplyCostNote:
      "เป็นการเรียก AI จริงเพื่อแก้ไข — มีค่าใช้จ่ายในแต่ละส่วนที่ได้รับผลกระทบ (บทและ/หรือสตอรีบอร์ด)",
    qualityApplySuccess: "ปรับแก้เรียบร้อย — ตรวจคุณภาพซ้ำแล้ว",
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
    summarizeMemoryNeedsScript: "ตอนนี้ต้องมีบทและสตอรี่บอร์ดที่สร้างแล้วก่อน",
    summarizeMemoryCostNote: "ดึงข้อเท็จจริงหลัก ปมค้าง การเปลี่ยนแปลงของตัวละคร/ความสัมพันธ์ และความเสี่ยงด้านความต่อเนื่องจากตอนนี้ เข้าสู่ความจำถาวรของซีรีย์ เพื่อใช้กับตอนถัดไป",
    summarizeMemoryAlready: "ตอนนี้ถูกสรุปเข้าความจำซีรีย์แล้ว",
    summarizeMemoryReSummarize: "สรุปใหม่",
    summarizeMemoryReSummarizeConfirm: "การสรุปใหม่จะเพิ่มชุดเหตุการณ์ความจำใหม่สำหรับตอนนี้ สรุปเดิมจะยังถูกเก็บไว้ในประวัติ ไม่ถูกลบ ต้องการดำเนินการต่อหรือไม่?",
    summarizeMemorySuccess: "บันทึกความจำแล้ว: {count} รายการ",
    summarizeMemoryFailed: "สรุปความจำเข้าซีรีย์ไม่สำเร็จ",

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
    repairImageUnsupportedModel: "โมเดลนี้ไม่รองรับการแก้ไขภาพแบบ image-to-image",
    repairImageUnsupportedModelWithList: "โมเดลนี้ไม่รองรับการแก้ไขภาพ โมเดลที่รองรับ: {n}",
    repairImageFailed: "สร้างภาพที่แก้ไม่สำเร็จ",
    repairImageNeedsApprovedImage: "ช็อตนี้ต้องมีภาพที่อนุมัติแล้วก่อนจึงจะแก้ไขได้",

    /* ---- Per-shot video prompt generation (Phase 6.6) ---- */
    generateShotVideoPrompt: "สร้างพรอมต์วิดีโอ (AI)",
    generatingShotVideoPrompt: "กำลังวิเคราะห์ภาพ…",
    generateShotVideoPromptNeedsImage: "ต้องมีภาพหลักของช็อตก่อน",
    generateShotVideoPromptFailed: "สร้างพรอมต์วิดีโอไม่สำเร็จ",
    usedVisionNote: "วิเคราะห์จากภาพจริง",
    generateVideoPromptPackWholeEpisode: "สร้างพรอมต์วิดีโอทั้งตอน",

    /* ---- Completed video-clip player (2026-07-06 fix — completed video
       renders were never persisted/shown; only a transient toast) ---- */
    videoClipGenerating: "กำลังสร้างวิดีโอ…",
    videoClipRegenerate: "สร้างใหม่",
    videoClipOpenFull: "เปิดแบบเต็มจอ",
    videoClipDurationLabel: "วิ",
    download: "ดาวน์โหลด",

    /* ---- Whole-episode compiled video (2026-07-06 download + assembly upgrade) ---- */
    compiledVideoTitle: "วิดีโอรวมทั้งตอน",
    compiledVideoAssemble: "ประกอบวิดีโอทั้งตอน",
    compiledVideoReassemble: "ประกอบใหม่",
    compiledVideoReassembleConfirm: "การทำนี้จะแทนที่วิดีโอรวมที่มีอยู่ และย้อนกลับไม่ได้",
    compiledVideoReadyHint: "พร้อม {ready}/{total} คลิป",
    compiledVideoMissingWarning: "ยังไม่มีคลิป: {list} — สร้างคลิปเหล่านี้ก่อน หรือประกอบเฉพาะช็อตที่เสร็จแล้ว",
    compiledVideoAssemblePartial: "ประกอบเฉพาะช็อตที่เสร็จแล้ว",
    compiledVideoProcessing: "กำลังประกอบวิดีโอทั้งตอน…",
    compiledVideoFailed: "ประกอบวิดีโอทั้งตอนไม่สำเร็จ",
    compiledVideoRetry: "ลองใหม่",
    compiledVideoDurationLabel: "วิ",
    compiledVideoPartialBadge: "บางส่วน ({n} คลิป)",
    compiledVideoAssembleFailedToast: "เริ่มการประกอบวิดีโอไม่สำเร็จ",
    compiledVideoAssembleStartedToast: "เริ่มประกอบวิดีโอทั้งตอนแล้ว",

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

    /* ---- Product reference image picker (2026-07-06 product tie-in upgrade) ---- */
    changeProductImage: "เปลี่ยนภาพสินค้า",
    productImagePickerTitle: "เลือกภาพอ้างอิงสินค้า",
    productImagePickerCapHint: "สินค้าใช้ภาพได้สูงสุด {n} ภาพต่อช็อต",
    productImagePickerBudgetHint: "โมเดลนี้รับภาพอ้างอิงรวมได้สูงสุด {n} ภาพ (ตัวละคร + สินค้า)",
    productImagePickerNoImages: "ยังไม่มีภาพสินค้าให้เลือก — เชื่อมโยง Marketplace Capture หรือใส่ URL ภาพสินค้าในการตั้งค่าผูกสินค้า",
    productImagePickerSave: "บันทึกการเลือก",
    productImagePickerSaved: "อัปเดตภาพอ้างอิงสินค้าแล้ว",
    productImagePickerSelectedCount: "เลือกแล้ว {n} ภาพ",
    productImageMultipleBadge: "+{n}",
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
