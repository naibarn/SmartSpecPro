import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectAutosave } from "../../src/screens/media-workspace/useProjectAutosave";
import { createDefaultProjectDraft, type SmartSpecProjectDraft } from "../../src/types/nleProject";
const project = (id: string) => createDefaultProjectDraft({projectId: id, title: "same.mp4", videoPath: `/${id}/same.mp4`, videoDurationMs: 1000});
function Harness({draft, storageKey, status}: {draft: SmartSpecProjectDraft; storageKey: string; status: (message: string) => void}) {
  useProjectAutosave(draft, storageKey, status); return null;
}
let root: ReturnType<typeof createRoot>;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); localStorage.clear(); root = createRoot(document.createElement("section")); });
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });
it("flushes the outgoing draft without overwriting the incoming key", () => {
  const status = vi.fn();
  act(() => root.render(<Harness draft={project("a")} storageKey="a" status={status} />));
  act(() => root.render(<Harness draft={project("b")} storageKey="b" status={status} />));
  expect(JSON.parse(localStorage.getItem("a")!).projectId).toBe("a");
  act(() => vi.advanceTimersByTime(2000));
  expect(JSON.parse(localStorage.getItem("b")!).projectId).toBe("b");
});
it("flushes the latest edit on page hide before debounce expires", () => {
  const status = vi.fn();
  act(() => root.render(<Harness draft={project("a")} storageKey="a" status={status} />));
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(localStorage.getItem("a")).not.toBeNull();
});
it("reports storage failure instead of claiming saved", () => {
  const status = vi.fn(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  act(() => root.render(<Harness draft={project("a")} storageKey="a" status={status} />));
  act(() => vi.advanceTimersByTime(2000));
  expect(status).toHaveBeenCalledWith(expect.stringContaining("ไม่สำเร็จ"));
});
