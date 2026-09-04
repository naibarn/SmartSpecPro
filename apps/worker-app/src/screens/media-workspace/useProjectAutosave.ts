import { useEffect, useRef } from "react";
import type { SmartSpecProjectDraft } from "../../types/nleProject";

/** Flush the outgoing draft before a file switch/unmount, including within the debounce window. */
export function useProjectAutosave(project: SmartSpecProjectDraft | null, storageKey: string | null, onStatus: (message: string) => void) {
  const pending = useRef<{ key: string; json: string } | null>(null);
  const status = useRef(onStatus);
  status.current = onStatus;
  const flush = () => {
    const value = pending.current;
    if (!value) return;
    try {
      localStorage.setItem(value.key, value.json);
      pending.current = null;
      status.current("บันทึกอัตโนมัติแล้ว");
    } catch {
      status.current("บันทึกอัตโนมัติไม่สำเร็จ กรุณาบันทึกโปรเจกต์เป็นไฟล์");
    }
  };
  useEffect(() => {
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [storageKey]);
  useEffect(() => {
    if (!project || !storageKey) return;
    pending.current = { key: storageKey, json: JSON.stringify(project) };
    const timer = setTimeout(flush, 2000);
    return () => clearTimeout(timer);
  }, [project, storageKey]);
}
