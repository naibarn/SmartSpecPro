import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function renderPanel(
  onSaveShotSummary: (shotNumber: number, summary: string) => Promise<void>
) {
  return render(
    <VerticalDramaStoryboardPanel
      {...({
        locale: "th",
        storyboard: {
          shots: [
            {
              shot_number: 1,
              visual_description: "ข้อความเก่าจาก storyboard",
              characters: [],
            },
          ],
        },
        startFramePlan: {
          frames: [{ shotNumber: 1, imagePrompt: "a prompt" }],
        },
        canonicalShotDrafts: [
          {
            shotNumber: 1,
            summary: "เรื่องย่อจากหน้ารวม",
            dialogueLines: [],
          },
        ],
        onSaveShotSummary,
        loading: false,
      } as any)}
    />
  );
}

describe("VerticalDramaStoryboardPanel — per-shot summary editing", () => {
  it("prefills the canonical Overview summary and saves the trimmed edit", async () => {
    const onSaveShotSummary = vi.fn().mockResolvedValue(undefined);
    renderPanel(onSaveShotSummary);

    fireEvent.click(screen.getByTestId("vd-storyboard-shot-summary-edit-1"));
    const input = screen.getByTestId("vd-storyboard-shot-summary-input-1");
    expect(input).toHaveValue("เรื่องย่อจากหน้ารวม");

    fireEvent.change(input, { target: { value: "  เรื่องย่อที่แก้แล้ว  " } });
    fireEvent.click(screen.getByTestId("vd-storyboard-shot-summary-save-1"));

    await waitFor(() => {
      expect(onSaveShotSummary).toHaveBeenCalledWith(1, "เรื่องย่อที่แก้แล้ว");
      expect(
        screen.queryByTestId("vd-storyboard-shot-summary-editor-1")
      ).not.toBeInTheDocument();
    });
  });

  it("does not allow an empty summary and preserves the draft after a failed save", async () => {
    const onSaveShotSummary = vi
      .fn()
      .mockRejectedValue(new Error("save failed"));
    renderPanel(onSaveShotSummary);

    fireEvent.click(screen.getByTestId("vd-storyboard-shot-summary-edit-1"));
    const input = screen.getByTestId("vd-storyboard-shot-summary-input-1");
    fireEvent.change(input, { target: { value: "   " } });
    expect(
      screen.getByTestId("vd-storyboard-shot-summary-save-1")
    ).toBeDisabled();

    fireEvent.change(input, { target: { value: "ข้อความที่ต้องเก็บไว้" } });
    fireEvent.click(screen.getByTestId("vd-storyboard-shot-summary-save-1"));

    await waitFor(() => expect(onSaveShotSummary).toHaveBeenCalledTimes(1));
    expect(
      screen.getByTestId("vd-storyboard-shot-summary-editor-1")
    ).toBeInTheDocument();
    expect(input).toHaveValue("ข้อความที่ต้องเก็บไว้");
  });
});
