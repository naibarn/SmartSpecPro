/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n";
import { GenerationProgress, type GenerationTask } from "./GenerationProgress";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const baseTask: GenerationTask = {
  id: "task-1",
  type: "image",
  prompt: "Cinematic portrait with moody light",
  status: "processing",
  progress: 45,
  createdAt: new Date("2026-04-03T01:00:00.000Z"),
  updatedAt: new Date("2026-04-03T01:02:00.000Z"),
};

function createDomRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function renderQueue(tasks: GenerationTask[] = [baseTask]) {
  return render(
    <I18nProvider>
      <GenerationProgress tasks={tasks} />
    </I18nProvider>,
  );
}

describe("GenerationProgress", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets users drag the queue panel from the header handle", async () => {
    renderQueue();

    const panel = screen.getByTestId("generation-progress-panel");
    const handle = screen.getByTestId("generation-progress-drag-handle");

    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 880, top: 120, width: 320, height: 420 }),
    );

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 940,
      clientY: 180,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(window, {
      clientX: 820,
      clientY: 240,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(panel.style.left).toBe("760px");
      expect(panel.style.top).toBe("180px");
    });

    fireEvent.pointerUp(window, { pointerId: 1 });
  });

  it("keeps the dragged queue panel inside the viewport bounds", async () => {
    renderQueue();

    const panel = screen.getByTestId("generation-progress-panel");
    const handle = screen.getByTestId("generation-progress-drag-handle");

    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(
      createDomRect({ left: 880, top: 120, width: 320, height: 420 }),
    );

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 940,
      clientY: 180,
      pointerId: 7,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(window, {
      clientX: -200,
      clientY: -200,
      pointerId: 7,
    });

    await waitFor(() => {
      expect(panel.style.left).toBe("12px");
      expect(panel.style.top).toBe("12px");
    });
  });

  it("minimizes the queue panel and expands it again", () => {
    renderQueue();

    expect(screen.getByText(baseTask.prompt)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("generationQueue.collapseQueue"));

    expect(screen.getByTestId("generation-progress-minimized-button")).toBeTruthy();
    expect(screen.queryByText(baseTask.prompt)).toBeNull();

    fireEvent.click(screen.getByTestId("generation-progress-minimized-button"));

    expect(screen.getByText(baseTask.prompt)).toBeTruthy();
  });
});
