import { useEffect, useRef } from "react";
import type { SmartSpecProjectDraft } from "../../types/nleProject";

/** Flush the outgoing draft before a file switch/unmount, including within the debounce window. */
export function useProjectAutosave(project: SmartSpecProjectDraft | null, storageKey: string | null, onStatus: (message: string) => void) {
  const pending = useRef<{ key: string; json: string } | null>(null);
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

  const flush = () => {
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
      notifyStatus("บันทึกอัตโนมัติแล้ว");
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
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      flush();
    };
  }, [storageKey]);

  useEffect(() => {
    if (!project || !storageKey) return;
    try {
      const json = JSON.stringify(project);
      if (json === lastSavedJson.current) return;
      pending.current = { key: storageKey, json };
    } catch {
      notifyStatus("โครงสร้างโปรเจกต์มีข้อมูลที่ไม่สามารถแปลงเป็น JSON ได้");
      return;
    }

    const timer = setTimeout(flush, 2000);
    return () => {
      clearTimeout(timer);
      if (pending.current && pending.current.key === storageKey) {
        flush();
      }
    };
  }, [project, storageKey]);
}

