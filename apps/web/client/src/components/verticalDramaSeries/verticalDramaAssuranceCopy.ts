import type { VerticalDramaAssuranceErrorCode } from "@shared/verticalDramaSeries/assurance";

export type VerticalDramaAssuranceLanguage = "th" | "en";

const COPY: Record<string, { th: string; en: string }> = {
  VD_ASSURANCE_CONTEXT_STALE: { th: "ข้อมูลต้นทางเปลี่ยนแล้ว กรุณาตรวจสอบและลองใหม่", en: "The source context changed. Review it and try again." },
  VD_ASSURANCE_PREDECESSOR_STALE: { th: "ขั้นตอนก่อนหน้าไม่ใช่เวอร์ชันปัจจุบัน", en: "A predecessor artifact is no longer current." },
  VD_ASSURANCE_RUNTIME_UNAVAILABLE: { th: "ระบบตรวจสอบอัตโนมัติไม่พร้อม ระบบยังเก็บงานเดิมไว้ให้แก้ไขต่อได้", en: "Automated assurance is unavailable. Your existing work remains editable." },
  VD_ASSURANCE_USAGE_UNKNOWN: { th: "ยังยืนยันผลการเรียกบริการไม่ได้ กรุณารอตรวจสอบก่อนลองซ้ำ", en: "The provider outcome is uncertain. Reconcile it before retrying." },
  VD_ASSURANCE_FINAL_GATE_BLOCKED: { th: "ยังไปขั้นตอนถัดไปไม่ได้ เพราะข้อมูลยืนยันยังไม่ครบ", en: "The next step is blocked because required proof is incomplete." },
  reconciliation_required: { th: "รอตรวจสอบผลการเรียกบริการ", en: "Waiting for provider reconciliation" },
  retry: { th: "ลองตรวจสอบใหม่", en: "Retry check" },
  repair: { th: "ซ่อมจากผลตรวจล่าสุด", en: "Repair from the latest result" },
  inspect_progress: { th: "ดูความคืบหน้า", en: "Inspect progress" },
  start_new_run: { th: "เริ่มการตรวจสอบใหม่", en: "Start a new check" },
};

export function getVerticalDramaAssuranceCopy(key: VerticalDramaAssuranceErrorCode | string, language: VerticalDramaAssuranceLanguage = "th"): string {
  return COPY[key]?.[language] ?? (language === "th" ? "ระบบกำลังตรวจสอบข้อมูล กรุณาดูรายละเอียดและดำเนินการตามขั้นตอนถัดไป" : "The system is checking the data. Review the details and follow the next action.");
}

export function getVerticalDramaAssuranceActionLabel(nextAction: string, language: VerticalDramaAssuranceLanguage = "th"): string {
  return getVerticalDramaAssuranceCopy(nextAction, language);
}
