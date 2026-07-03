/**
 * Vertical Drama Series — self-contained bilingual (Thai/English) copy + the
 * ~4-phase grouping the episode workspace renders (spec §04 §16).
 *
 * Copy lives here (not react-i18next namespaces) so these feature components are
 * drop-in without new translation-namespace wiring. Pick a language with the
 * `locale` prop; components default to the app's resolved locale.
 */

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

/** Central bilingual UI string table for the section-04 surfaces. */
export const VD_COPY = {
  en: {
    runDryRun: "Run dry run",
    runPlanOnly: "Plan only",
    generateImages: "Generate images (paid)",
    generateVideo: "Generate video (paid)",
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
  },
  th: {
    runDryRun: "รันแบบทดสอบ",
    runPlanOnly: "วางแผนเท่านั้น",
    generateImages: "สร้างภาพ (มีค่าใช้จ่าย)",
    generateVideo: "สร้างวิดีโอ (มีค่าใช้จ่าย)",
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
  },
} as const;

export type VdCopy = Record<keyof (typeof VD_COPY)["en"], string>;

export function vdCopy(locale: VdLocale): VdCopy {
  return VD_COPY[locale] as VdCopy;
}
