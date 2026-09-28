import { useEffect, useRef } from "react";
import type { SmartSpecProjectDraft } from "../../types/nleProject";
import { saveNleProject } from "./projectPersistence";

/** Flush the outgoing draft before a file switch/unmount, including within the debounce window. */
export function useProjectAutosave(
  project: SmartSpecProjectDraft | null,
  storageKey: string | null,
  diskProjectPathOrStatus?: string | null | ((message: string) => void),
  onStatusOrUndefined?: (message: string) => void
) {
  const diskProjectPath = typeof diskProjectPathOrStatus === "string" ? diskProjectPathOrStatus : null;
  const onStatus: (message: string) => void = typeof diskProjectPathOrStatus === "function"
    ? diskProjectPathOrStatus
    : (typeof onStatusOrUndefined === "function" ? onStatusOrUndefined : () => {});

  const pending = useRef<{ key: string; json: string; diskPath?: string | null; project?: SmartSpecProjectDraft } | null>(null);
  const status = useRef(onStatus);
  const lastStatusMsg = useRef<string | null>(null);
  status.current = onStatus;

  const notifyStatus = (msg: string) => {
    if (lastStatusMsg.current !== msg) {
      lastStatusMsg.current = msg;
      try {
        status.current(msg);
      } catch {
        // Ignore status callback errors
      }
    }
  };

  const lastSavedJson = useRef<string | null>(null);

  const flush = async () => {
    const value = pending.current;
    if (!value) return;
    if (value.json === lastSavedJson.current) {
      pending.current = null;
      return;
    }
    try {
      localStorage.setItem(value.key, value.json);
      lastSavedJson.current = value.json;
      pending.current = null;

      // Also persist project to workspace folder on harddisk if diskPath is available
      if (value.diskPath && value.project) {
        try {
          await saveNleProject(value.project, value.diskPath);
          const fileName = value.diskPath.replace(/\\/g, "/").split("/").pop() || "";
          notifyStatus(`บันทึกโปรเจกต์อัตโนมัติแล้ว (${fileName})`);
          return;
        } catch (diskErr) {
          console.warn("Autosave to disk path warning:", diskErr);
        }
      }

      notifyStatus("บันทึกโปรเจกต์อัตโนมัติเรียบร้อย");
    } catch (err: unknown) {
      const isQuota = err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
      if (isQuota) {
        notifyStatus("พื้นที่บันทึกเต็ม กรุณาบันทึกโปรเจกต์เป็นไฟล์ .json หรือ .ssproj");
      } else {
        notifyStatus("บันทึกอัตโนมัติไม่สำเร็จ กรุณาบันทึกโปรเจกต์เป็นไฟล์");
      }
    }
  };

  useEffect(() => {
    const onPageHide = () => void flush();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      void flush();
    };
  }, [storageKey, diskProjectPath]);

  useEffect(() => {
    if (!project || !storageKey) return;
    try {
      const json = JSON.stringify(project);
      if (json === lastSavedJson.current) return;
      pending.current = { key: storageKey, json, diskPath: diskProjectPath, project };
    } catch {
      notifyStatus("โครงสร้างโปรเจกต์มีข้อมูลที่ไม่สามารถแปลงเป็น JSON ได้");
      return;
    }

    const timer = setTimeout(() => void flush(), 2000);
    return () => {
      clearTimeout(timer);
      if (pending.current && pending.current.key === storageKey) {
        void flush();
      }
    };
  }, [project, storageKey, diskProjectPath]);
}

