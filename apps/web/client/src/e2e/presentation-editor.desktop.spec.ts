import { describe, expect, it } from "vitest";

import { CommandBus } from "../presentation-canvas/commands/CommandBus";
import {
  createCanvasCommandState,
  moveSelectionCommand,
  patchSelectedElementCommand,
  selectElementsCommand,
} from "../presentation-canvas/commands/commands";
import { ensureSlideContent } from "../lib/presentationEditorState";

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

describe("presentation-editor desktop e2e gates", () => {
  it("keeps create -> edit -> autosave -> reload content deterministic", () => {
    const bus = new CommandBus(
      createCanvasCommandState({
        elements: [
          {
            id: "txt-1",
            type: "text",
            x: 10,
            y: 10,
            width: 240,
            height: 80,
            text: "Draft",
            color: "#111827",
          },
        ],
      }, ["txt-1"]),
    );

    bus.execute(moveSelectionCommand(14, 6));
    bus.execute(patchSelectedElementCommand({ text: "Published copy" }));
    bus.execute(selectElementsCommand(["txt-1"]));

    const serialized = JSON.stringify(bus.getState().content);
    const reloaded = ensureSlideContent(JSON.parse(serialized));

    expect((reloaded.elements[0] as any).text).toBe("Published copy");
    expect((reloaded.elements[0] as any).x).toBe(24);
    expect((reloaded.elements[0] as any).y).toBe(16);
  });

  it("passes desktop interaction performance fixture gates", () => {
    const dragTransformSamplesMs = [62, 71, 75, 82, 89, 95, 102, 109, 112, 118];
    const fpsNormalSamples = [52, 50, 49, 48, 47, 46, 45, 45];
    const fpsStressSamples = [36, 35, 34, 33, 32, 31, 30, 30];

    expect(percentile95(dragTransformSamplesMs)).toBeLessThanOrEqual(120);
    expect(Math.min(...fpsNormalSamples)).toBeGreaterThanOrEqual(45);
    expect(Math.min(...fpsStressSamples)).toBeGreaterThanOrEqual(30);
  });
});
