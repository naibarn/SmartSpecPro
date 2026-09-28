import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkerTopbar } from "../../src/app/WorkerTopbar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("fixture")),
}));

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container = null;
});

it("exposes a bilingual language selector and reports a validated choice", () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("section");
  root = createRoot(container);
  const onLocaleChange = vi.fn();

  act(() => root?.render(
    <WorkerTopbar
      activeRoute="media-workspace"
      connected={false}
      queueDepth={0}
      runtimeStatus="ready"
      locale="th"
      onLocaleChange={onLocaleChange}
    />,
  ));

  const select = container.querySelector<HTMLSelectElement>(".worker-locale-select");
  expect(select?.value).toBe("th");
  expect(select?.querySelectorAll("option")).toHaveLength(2);

  act(() => {
    select!.value = "en";
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onLocaleChange).toHaveBeenCalledWith("en");
});
