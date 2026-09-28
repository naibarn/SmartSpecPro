import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { TextOverlayModal } from "../../src/screens/media-workspace/TextOverlayModal";
import { SandboxedOverlayViewer } from "../../src/screens/media-workspace/SandboxedOverlayViewer";

it("persists bold italic text and shows it at a fractional paused playhead", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("section");
  const root = createRoot(container);
  const onAdd = vi.fn();
  try {
    act(() => root.render(<TextOverlayModal isOpen onClose={() => {}} onAddTextClip={onAdd} currentTimeMs={11466.6667} />));
    for (const [id, value] of [["text-font-weight", "700"], ["text-font-style", "italic"]]) {
      const select = container.querySelector<HTMLSelectElement>(`#${id}`)!;
      act(() => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
    }
    const add = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("เพิ่มข้อความลง"))!;
    act(() => add.click());
    const clip = JSON.parse(JSON.stringify(onAdd.mock.calls[0][0]));
    expect(clip.fontWeight).toBe(700);
    expect(clip.fontStyle).toBe("italic");
    act(() => root.render(<SandboxedOverlayViewer activeClips={[clip]} currentTimeMs={11466.6667} width={1080} height={1920} frameStyle={{ left: "35%", width: "30%", height: "100%" }} />));
    const text = container.querySelector<HTMLElement>(".overlay-text-item")!;
    expect(text.textContent).toBe(clip.text);
    expect(text.style.fontWeight).toBe("700");
    expect(text.style.fontStyle).toBe("italic");
    expect(text.classList.contains("anim-pop")).toBe(false);
    expect(text.querySelector(".anim-pop")).not.toBeNull();
    expect(text.parentElement?.style.left).toBe("35%");
    act(() => root.render(<SandboxedOverlayViewer activeClips={[clip]} currentTimeMs={20000} width={1080} height={1920} />));
    expect(container.querySelector(".overlay-text-item")).toBeNull();
  } finally { act(() => root.unmount()); }
});
