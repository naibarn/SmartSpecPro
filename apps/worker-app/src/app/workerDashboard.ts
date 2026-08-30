import type { WorkerLocale } from "./workerRoutes";

export type WorkerConnectionPresentation = {
  connected?: boolean;
  label: string;
  detail: string;
  tone: "ready" | "warning" | "pending" | "error";
  expiresAt?: string | null;
  hoursUntilExpiry?: number | null;
  checkedAt?: string | null;
  stale?: boolean;
};

export type WorkerRemoteQueueItem = {
  transportStatus: string;
  domainStatus: string;
};

export function localizeConnectionPresentation(
  status: WorkerConnectionPresentation,
  locale: WorkerLocale,
): WorkerConnectionPresentation {
  if (locale !== "th") return status;
  const labels: Record<string, string> = {
    Connected: "เชื่อมต่อแล้ว",
    Offline: "ออฟไลน์",
    "Not connected": "ยังไม่เชื่อมต่อ",
    "Ready to receive jobs": "พร้อมรับงาน",
    "Connected · loop stopped": "เชื่อมต่อแล้ว · หยุดรับงาน",
    "Connected · runtime needs attention": "เชื่อมต่อแล้ว · runtime ต้องตรวจสอบ",
    "Reconnect required": "ต้องเชื่อมต่อใหม่",
    "Connection check delayed": "การตรวจสอบการเชื่อมต่อล่าช้า",
    "Approval pending": "รออนุมัติ",
    "Reconnecting automatically": "กำลังเชื่อมต่อใหม่อัตโนมัติ",
    "Smart AI Hub unavailable · retrying": "Smart AI Hub ไม่พร้อมใช้งาน · กำลังลองใหม่",
  };
  const details: Record<string, string> = {
    "Connect this machine to receive worker jobs.": "เปิดหน้า Connection แล้วกดเชื่อมต่อเครื่องนี้เพื่อรับงาน",
    "Approve this Worker App in the browser.": "อนุมัติ Worker App นี้ใน browser ที่เปิดขึ้นมา",
    "Verifying the saved connection with Smart AI Hub...": "กำลังตรวจสอบการเชื่อมต่อที่บันทึกไว้กับ Smart AI Hub...",
    "Access and runtime are valid. Start the worker loop to receive jobs.": "สิทธิ์และ runtime ใช้งานได้ ให้เริ่ม Worker loop เพื่อรับงาน",
    "Connection, runtime, and worker loop are active.": "การเชื่อมต่อ runtime และ Worker loop ทำงานอยู่",
  };
  return { ...status, label: labels[status.label] ?? status.label, detail: details[status.detail] ?? status.detail };
}

export function summarizeRemoteQueue(items: readonly WorkerRemoteQueueItem[]) {
  return items.reduce(
    (summary, item) => {
      const attention = ["failed", "expired", "canceled", "needs_review"].includes(item.transportStatus)
        || item.domainStatus === "needs_review"
        || item.domainStatus === "stalled";
      const active = ["processing_local_derivatives", "publishing_series_assets"].includes(item.domainStatus)
        || ["running", "processing", "uploading", "publishing", "indexing"].includes(item.transportStatus);
      if (attention) summary.attention += 1;
      else if (active) summary.processing += 1;
      else if (item.transportStatus === "queued" || item.domainStatus === "paused") summary.queued += 1;
      else if (["completed", "succeeded", "published"].includes(item.transportStatus) || ["succeeded", "published", "completed"].includes(item.domainStatus)) summary.completed += 1;
      else summary.other += 1;
      return summary;
    },
    { processing: 0, queued: 0, attention: 0, completed: 0, other: 0 },
  );
}
