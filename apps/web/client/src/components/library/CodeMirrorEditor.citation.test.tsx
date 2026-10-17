// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import CodeMirrorEditor from "./CodeMirrorEditor";

describe("CodeMirror citation line navigation", () => {
  beforeAll(() => {
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    }
  });

  it("selects and focuses the canonical 1-based inclusive line range", async () => {
    const { container } = render(
      <CodeMirrorEditor
        value={"first line\nsecond citation line\nlast line"}
        onChange={() => undefined}
        fileExtension="md"
        focusLineRange={{ start: 2, end: 2 }}
      />,
    );

    await waitFor(() => {
      expect(document.activeElement?.closest(".cm-editor")).toBe(container.querySelector(".cm-editor"));
      expect(window.getSelection()?.toString()).toBe("second citation line");
    });
  });
});
