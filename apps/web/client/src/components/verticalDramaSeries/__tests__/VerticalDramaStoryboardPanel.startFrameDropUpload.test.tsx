import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: {
      frames: [{ shotNumber: 1, imagePrompt: "a prompt" }],
    },
    loading: false,
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("VerticalDramaStoryboardPanel — Start Frame harddisk drop upload", () => {
  it("sends local image metadata and base64, and stays busy until replacement settles", async () => {
    const pending = deferred();
    const onDropStartFrame = vi.fn(() => pending.promise);
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onDropStartFrame }) as any)}
      />
    );

    const target = screen.getByTestId("vd-storyboard-start-frame-drop-1");
    const file = new File(["portrait"], "portrait.png", {
      type: "image/png",
    });

    fireEvent.dragOver(target);
    expect(target).toHaveClass("ring-primary/40");
    fireEvent.dragLeave(target);
    expect(target).not.toHaveClass("ring-primary/40");

    fireEvent.drop(target, {
      dataTransfer: {
        files: [file],
        getData: vi.fn(() => ""),
      },
    });

    await waitFor(() => {
      expect(onDropStartFrame).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          kind: "upload",
          fileName: "portrait.png",
          fileType: "image/png",
          fileBase64: expect.stringMatching(/^data:image\/png;base64,/),
        })
      );
    });
    expect(target).toHaveAttribute("aria-busy", "true");

    fireEvent.drop(target, {
      dataTransfer: {
        files: [file],
        getData: vi.fn(() => ""),
      },
    });
    expect(onDropStartFrame).toHaveBeenCalledTimes(1);

    pending.resolve();
    await waitFor(() => {
      expect(target).toHaveAttribute("aria-busy", "false");
    });
  });

  it("keeps independent busy state for simultaneous drops on different shots", async () => {
    const first = deferred();
    const second = deferred();
    const onDropStartFrame = vi.fn((shotNumber: number) =>
      shotNumber === 1 ? first.promise : second.promise
    );
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onDropStartFrame,
          storyboard: {
            shots: [
              { shot_number: 1, visual_description: "one", characters: [] },
              { shot_number: 2, visual_description: "two", characters: [] },
            ],
          },
          startFramePlan: {
            frames: [
              { shotNumber: 1, imagePrompt: "one" },
              { shotNumber: 2, imagePrompt: "two" },
            ],
          },
        }) as any)}
      />
    );

    const firstTarget = screen.getByTestId("vd-storyboard-start-frame-drop-1");
    const secondTarget = screen.getByTestId("vd-storyboard-start-frame-drop-2");
    const drop = (target: HTMLElement, name: string) =>
      fireEvent.drop(target, {
        dataTransfer: {
          files: [new File([name], name, { type: "image/png" })],
          getData: vi.fn(() => ""),
        },
      });

    drop(firstTarget, "first.png");
    drop(secondTarget, "second.png");
    await waitFor(() => {
      expect(firstTarget).toHaveAttribute("aria-busy", "true");
      expect(secondTarget).toHaveAttribute("aria-busy", "true");
    });

    second.resolve();
    await waitFor(() => {
      expect(secondTarget).toHaveAttribute("aria-busy", "false");
    });
    expect(firstTarget).toHaveAttribute("aria-busy", "true");

    first.resolve();
    await waitFor(() => {
      expect(firstTarget).toHaveAttribute("aria-busy", "false");
    });
  });

  it("passes a durable application URL without converting it to an upload", async () => {
    const onDropStartFrame = vi.fn().mockResolvedValue(undefined);
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onDropStartFrame }) as any)}
      />
    );

    fireEvent.drop(screen.getByTestId("vd-storyboard-start-frame-drop-1"), {
      dataTransfer: {
        files: [],
        getData: vi.fn((type: string) =>
          type === "application/x-smartspec-media-type"
            ? "image"
            : type === "text/uri-list"
              ? "https://cdn.example.com/frame.jpg"
              : ""
        ),
      },
    });

    await waitFor(() => {
      expect(onDropStartFrame).toHaveBeenCalledWith(1, {
        kind: "url",
        url: "https://cdn.example.com/frame.jpg",
      });
    });
  });

  it("converts an inline image data URL to an upload input", async () => {
    const onDropStartFrame = vi.fn().mockResolvedValue(undefined);
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onDropStartFrame }) as any)}
      />
    );

    const dataUrl = "data:image/png;base64,cG9ydHJhaXQ=";
    fireEvent.drop(screen.getByTestId("vd-storyboard-start-frame-drop-1"), {
      dataTransfer: {
        files: [],
        getData: vi.fn((type: string) =>
          type === "text/plain" ? dataUrl : ""
        ),
      },
    });

    await waitFor(() => {
      expect(onDropStartFrame).toHaveBeenCalledWith(1, {
        kind: "upload",
        fileName: "start-frame.png",
        fileType: "image/png",
        fileBase64: dataUrl,
      });
    });
  });

  it("rejects a non-image harddisk file", async () => {
    const onDropStartFrame = vi.fn().mockResolvedValue(undefined);
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onDropStartFrame }) as any)}
      />
    );

    fireEvent.drop(screen.getByTestId("vd-storyboard-start-frame-drop-1"), {
      dataTransfer: {
        files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
        getData: vi.fn(() => ""),
      },
    });

    await waitFor(() => {
      expect(onDropStartFrame).not.toHaveBeenCalled();
    });
  });
});
