import {
  hyperframesBlockerCodes,
  hyperframesRenderStatuses,
  type HyperframesBlockerCode,
  type HyperframesRenderStatus,
} from "./contracts";

export type HyperframesLocale = "en" | "th";

export interface HyperframesCopyEntry {
  copyId: string;
  label: Record<HyperframesLocale, string>;
  description: Record<HyperframesLocale, string>;
  nextAction?: Record<HyperframesLocale, string>;
}

export const HYPERFRAMES_STATUS_COPY: Record<
  HyperframesRenderStatus,
  HyperframesCopyEntry
> = {
  not_available: {
    copyId: "hyperframes.status.not_available",
    label: { en: "Auto render unavailable", th: "ยังไม่พร้อมใช้งาน Auto render" },
    description: {
      en: "HyperFrames is not available for this product state.",
      th: "สถานะสินค้านี้ยังใช้ HyperFrames ไม่ได้",
    },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
  queued: {
    copyId: "hyperframes.status.queued",
    label: { en: "Queued", th: "เข้าคิวแล้ว" },
    description: {
      en: "The render job is queued and has not started yet.",
      th: "งานเข้าคิวแล้ว ยังไม่ได้เริ่ม render",
    },
  },
  staging_assets: {
    copyId: "hyperframes.status.staging_assets",
    label: { en: "Staging assets", th: "เตรียมไฟล์ประกอบ" },
    description: { en: "Trusted media refs are being staged safely.", th: "ระบบกำลังเตรียมไฟล์ที่ตรวจสิทธิ์แล้ว" },
  },
  linting: {
    copyId: "hyperframes.status.linting",
    label: { en: "Checking template", th: "ตรวจ template" },
    description: { en: "The composition is being checked before rendering.", th: "ระบบกำลังตรวจองค์ประกอบก่อน render" },
  },
  snapshotting: {
    copyId: "hyperframes.status.snapshotting",
    label: { en: "Creating snapshots", th: "สร้าง snapshot" },
    description: { en: "Key frames are being generated for QA.", th: "ระบบกำลังสร้างภาพตัวอย่างเพื่อ QA" },
  },
  inspecting: {
    copyId: "hyperframes.status.inspecting",
    label: { en: "Inspecting layout", th: "ตรวจ layout" },
    description: { en: "Safe areas, captions, and disclosure placement are being inspected.", th: "ระบบกำลังตรวจ safe area คำบรรยาย และตำแหน่ง disclosure" },
  },
  rendering: {
    copyId: "hyperframes.status.rendering",
    label: { en: "Rendering video", th: "กำลัง render วิดีโอ" },
    description: { en: "The video output is being rendered.", th: "ระบบกำลังสร้างวิดีโอ" },
  },
  qa_checking: {
    copyId: "hyperframes.status.qa_checking",
    label: { en: "Running QA", th: "กำลังตรวจ QA" },
    description: { en: "The rendered output is being checked before review or save.", th: "ระบบกำลังตรวจคุณภาพก่อนให้รีวิวหรือบันทึก" },
  },
  ready_for_review: {
    copyId: "hyperframes.status.ready_for_review",
    label: { en: "Ready for review", th: "พร้อมรีวิว" },
    description: { en: "The preview is ready for storyboard review.", th: "ตัวอย่างพร้อมให้ตรวจใน Storyboard Review" },
    nextAction: { en: "Review output", th: "ตรวจผลลัพธ์" },
  },
  saving_to_library: {
    copyId: "hyperframes.status.saving_to_library",
    label: { en: "Saving to Library", th: "กำลังบันทึกเข้า Library" },
    description: { en: "The QA-passed output is being finalized.", th: "ระบบกำลังบันทึกไฟล์ที่ผ่าน QA แล้ว" },
  },
  completed: {
    copyId: "hyperframes.status.completed",
    label: { en: "Completed", th: "เสร็จแล้ว" },
    description: { en: "The render is complete and ready for the next step.", th: "render เสร็จแล้ว พร้อมดำเนินการต่อ" },
    nextAction: { en: "Save to Library", th: "บันทึกเข้า Library" },
  },
  saved_to_library: {
    copyId: "hyperframes.status.saved_to_library",
    label: { en: "Saved to Library", th: "บันทึกเข้า Library แล้ว" },
    description: { en: "The final video is available as a Library item.", th: "วิดีโอสุดท้ายพร้อมใช้งานใน Library" },
    nextAction: { en: "Open Library item", th: "เปิดรายการใน Library" },
  },
  cancel_requested: {
    copyId: "hyperframes.status.cancel_requested",
    label: { en: "Cancellation requested", th: "ขอยกเลิกแล้ว" },
    description: { en: "The worker will stop when it reaches a safe point.", th: "worker จะหยุดเมื่อถึงจุดที่ปลอดภัย" },
  },
  cancelled: {
    copyId: "hyperframes.status.cancelled",
    label: { en: "Cancelled", th: "ยกเลิกแล้ว" },
    description: { en: "The render job was cancelled.", th: "งาน render ถูกยกเลิกแล้ว" },
    nextAction: { en: "Use Auto or Standard again", th: "เริ่ม Auto หรือ Standard ใหม่" },
  },
  blocked_needs_user: {
    copyId: "hyperframes.status.blocked_needs_user",
    label: { en: "Needs review", th: "ต้องตรวจเพิ่มเติม" },
    description: { en: "A safe user action is required before Auto can continue.", th: "ต้องมีการตรวจหรือยืนยันก่อน Auto ทำต่อได้" },
    nextAction: { en: "Review blocker", th: "ตรวจ blocker" },
  },
  compliance_blocked: {
    copyId: "hyperframes.status.compliance_blocked",
    label: { en: "Compliance review required", th: "ต้องตรวจ compliance" },
    description: { en: "The product copy needs review before automatic render.", th: "ข้อความสินค้าต้องตรวจ policy ก่อน render อัตโนมัติ" },
    nextAction: { en: "Review claims", th: "ตรวจ claim" },
  },
  template_disabled: {
    copyId: "hyperframes.status.template_disabled",
    label: { en: "Template disabled", th: "template ถูกปิด" },
    description: { en: "This template cannot start new renders.", th: "template นี้เริ่ม render ใหม่ไม่ได้" },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
  stale_input_hash: {
    copyId: "hyperframes.status.stale_input_hash",
    label: { en: "Plan changed", th: "แผนเปลี่ยนแล้ว" },
    description: { en: "The product or storyboard changed after this render was planned.", th: "สินค้า หรือ storyboard เปลี่ยนหลังจากสร้างแผนนี้" },
    nextAction: { en: "Regenerate from current plan", th: "สร้างใหม่จากแผนล่าสุด" },
  },
  failed_transient: {
    copyId: "hyperframes.status.failed_transient",
    label: { en: "Temporary failure", th: "ขัดข้องชั่วคราว" },
    description: { en: "The worker hit a retryable dependency or storage problem.", th: "worker เจอปัญหาชั่วคราวที่ retry ได้" },
    nextAction: { en: "Retry worker step", th: "ลองขั้นตอนนี้ใหม่" },
  },
  failed_permanent: {
    copyId: "hyperframes.status.failed_permanent",
    label: { en: "Render blocked", th: "render ถูกบล็อก" },
    description: { en: "The input, policy, template, or QA issue cannot be retried automatically.", th: "ปัญหา input, policy, template หรือ QA นี้ retry อัตโนมัติไม่ได้" },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
  dead_lettered: {
    copyId: "hyperframes.status.dead_lettered",
    label: { en: "Needs operator recovery", th: "ต้องให้ operator กู้คืน" },
    description: { en: "Retry attempts are exhausted and operator replay is required.", th: "ใช้ retry ครบแล้ว ต้องให้ operator ตรวจและ replay" },
  },
  failed: {
    copyId: "hyperframes.status.failed",
    label: { en: "Failed", th: "ไม่สำเร็จ" },
    description: { en: "The render failed with safe diagnostics.", th: "งาน render ไม่สำเร็จ โดยมี diagnostic ที่ปลอดภัย" },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
};

export const HYPERFRAMES_BLOCKER_COPY: Record<
  HyperframesBlockerCode,
  HyperframesCopyEntry
> = {
  feature_disabled: {
    copyId: "hyperframes.blocker.feature_disabled",
    label: { en: "Auto is disabled", th: "Auto ถูกปิดอยู่" },
    description: { en: "HyperFrames Auto is off for this environment.", th: "สภาพแวดล้อมนี้ยังไม่เปิด HyperFrames Auto" },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
  tenant_not_allowed: {
    copyId: "hyperframes.blocker.tenant_not_allowed",
    label: { en: "Tenant not allowlisted", th: "tenant ยังไม่อยู่ใน allowlist" },
    description: { en: "This tenant is not enabled for HyperFrames Auto.", th: "tenant นี้ยังไม่ได้รับสิทธิ์ HyperFrames Auto" },
  },
  permission_denied: {
    copyId: "hyperframes.blocker.permission_denied",
    label: { en: "Permission required", th: "ต้องมีสิทธิ์เพิ่มเติม" },
    description: { en: "Your role cannot start this Auto render.", th: "role นี้เริ่ม Auto render ไม่ได้" },
  },
  worker_disabled: {
    copyId: "hyperframes.blocker.worker_disabled",
    label: { en: "Worker unavailable", th: "worker ยังไม่พร้อม" },
    description: { en: "Rendering is blocked until the worker is enabled.", th: "ต้องเปิด worker ก่อนจึง render ได้" },
    nextAction: { en: "Use Standard Order", th: "ใช้ Standard Order" },
  },
  template_unavailable: {
    copyId: "hyperframes.blocker.template_unavailable",
    label: { en: "Template unavailable", th: "template ไม่พร้อม" },
    description: { en: "No approved template matches the Auto plan.", th: "ไม่มี template ที่ผ่านอนุมัติสำหรับแผน Auto นี้" },
  },
  missing_product_anchor: {
    copyId: "hyperframes.blocker.missing_product_anchor",
    label: { en: "Product image required", th: "ต้องมีภาพสินค้า" },
    description: { en: "Select or confirm a product reference image.", th: "เลือกหรือยืนยันภาพอ้างอิงสินค้า" },
  },
  missing_character_anchor: {
    copyId: "hyperframes.blocker.missing_character_anchor",
    label: { en: "Character reference required", th: "ต้องมีภาพตัวละคร" },
    description: { en: "A character reference is required for this plan.", th: "แผนนี้ต้องมีภาพอ้างอิงตัวละคร" },
  },
  missing_environment_anchor: {
    copyId: "hyperframes.blocker.missing_environment_anchor",
    label: { en: "Environment reference required", th: "ต้องมีภาพฉาก" },
    description: { en: "An environment reference is required for this plan.", th: "แผนนี้ต้องมีภาพอ้างอิงฉาก" },
  },
  insufficient_credit: {
    copyId: "hyperframes.blocker.insufficient_credit",
    label: { en: "Credit required", th: "เครดิตไม่พอ" },
    description: { en: "The estimated render cost needs authorization or credit.", th: "ค่า render โดยประมาณต้องมีเครดิตหรือการอนุมัติ" },
  },
  quota_blocked: {
    copyId: "hyperframes.blocker.quota_blocked",
    label: { en: "Quota limit reached", th: "เกิน quota" },
    description: { en: "The planned render exceeds MVP quota limits.", th: "แผน render เกิน quota ของ MVP" },
  },
  compliance_review_required: {
    copyId: "hyperframes.blocker.compliance_review_required",
    label: { en: "Claim review required", th: "ต้องตรวจ claim" },
    description: { en: "Potentially sensitive claims must be reviewed before Auto render.", th: "claim ที่เสี่ยงต้องตรวจ ก่อน render อัตโนมัติ" },
  },
  active_standard_run: {
    copyId: "hyperframes.blocker.active_standard_run",
    label: { en: "Standard Order already running", th: "มีงาน Standard Order กำลังทำอยู่" },
    description: {
      en: "Finish or review the active Standard Order run before starting Auto Storyboard Review.",
      th: "ตรวจหรือรอให้งาน Standard Order ที่กำลังทำอยู่เสร็จก่อนเริ่ม Auto Storyboard Review",
    },
    nextAction: { en: "Open the active Standard Order run", th: "เปิดงาน Standard Order ที่กำลังทำอยู่" },
  },
  stale_plan: {
    copyId: "hyperframes.blocker.stale_plan",
    label: { en: "Plan expired", th: "แผนหมดอายุ" },
    description: { en: "Refresh the Auto plan before starting.", th: "โหลดแผน Auto ใหม่ก่อนเริ่ม" },
  },
  stale_input_hash: {
    copyId: "hyperframes.blocker.stale_input_hash",
    label: { en: "Input changed", th: "input เปลี่ยนแล้ว" },
    description: { en: "Regenerate from current product and run state.", th: "สร้างใหม่จากสถานะสินค้าและ run ล่าสุด" },
  },
  asset_rejected: {
    copyId: "hyperframes.blocker.asset_rejected",
    label: { en: "Asset rejected", th: "ไฟล์ถูกปฏิเสธ" },
    description: { en: "One or more media refs failed safety checks.", th: "ไฟล์บางรายการไม่ผ่านการตรวจความปลอดภัย" },
  },
  qa_failed: {
    copyId: "hyperframes.blocker.qa_failed",
    label: { en: "QA failed", th: "ไม่ผ่าน QA" },
    description: { en: "The output cannot be saved until QA passes.", th: "ต้องผ่าน QA ก่อนจึงบันทึกได้" },
  },
  library_save_disabled: {
    copyId: "hyperframes.blocker.library_save_disabled",
    label: { en: "Library save disabled", th: "ยังไม่เปิดบันทึกเข้า Library" },
    description: { en: "Preview is available but final save is disabled for rollout.", th: "ดู preview ได้ แต่ยังไม่เปิดบันทึกผลลัพธ์ใน rollout นี้" },
  },
  operator_permission_required: {
    copyId: "hyperframes.blocker.operator_permission_required",
    label: { en: "Operator permission required", th: "ต้องใช้สิทธิ์ operator" },
    description: { en: "This recovery action is available only to operators.", th: "การกู้คืนนี้ทำได้เฉพาะ operator" },
  },
};

export function getHyperframesStatusCopy(
  status: HyperframesRenderStatus,
  locale: HyperframesLocale = "th"
): { copyId: string; label: string; description: string; nextAction?: string } {
  const entry = HYPERFRAMES_STATUS_COPY[status];
  return {
    copyId: entry.copyId,
    label: entry.label[locale],
    description: entry.description[locale],
    nextAction: entry.nextAction?.[locale],
  };
}

export function getHyperframesBlockerCopy(
  code: HyperframesBlockerCode,
  locale: HyperframesLocale = "th"
): { copyId: string; label: string; description: string; nextAction?: string } {
  const entry = HYPERFRAMES_BLOCKER_COPY[code];
  return {
    copyId: entry.copyId,
    label: entry.label[locale],
    description: entry.description[locale],
    nextAction: entry.nextAction?.[locale],
  };
}

export function assertHyperframesCopyCoverage(): void {
  const missingStatuses = hyperframesRenderStatuses.filter(
    status => !HYPERFRAMES_STATUS_COPY[status]
  );
  const missingBlockers = hyperframesBlockerCodes.filter(
    code => !HYPERFRAMES_BLOCKER_COPY[code]
  );
  if (missingStatuses.length || missingBlockers.length) {
    throw new Error(
      `Missing HyperFrames copy coverage: statuses=${missingStatuses.join(",")}; blockers=${missingBlockers.join(",")}`
    );
  }
}
