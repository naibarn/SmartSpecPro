import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

describe("VerticalDramaStoryboardPanel — shot-local character descriptions", () => {
  it("lets the user save an identity description for a dialogue character", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...({
          locale: "th",
          storyboard: {
            shots: [{ shot_number: 1, visual_description: "บทสนทนา", characters: [] }],
          },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "two people in a kitchen",
                requiredCharacterRefs: ["alice", "bob"],
              },
            ],
          },
          canonicalShotDrafts: [
            {
              shotNumber: 1,
              summary: "บทสนทนาในครัว",
              dialogueLines: [{ speaker: "ไอริณ", line: "สวัสดี" }],
            },
          ],
          characterPortraits: {
            alice: { characterId: "1", name: "ไอริณ", portraitUrl: null },
            bob: { characterId: "2", name: "ภาคิน", portraitUrl: null },
          },
          loading: false,
          onSetShotCharacterDescriptionOverrides: onSave,
        } as any)}
      />,
    );

    const input = screen.getByTestId(
      "vd-storyboard-character-description-input-1-alice",
    );
    fireEvent.change(input, {
      target: { value: "ผู้หญิงที่ใส่ผ้ากันเปื้อน" },
    });
    fireEvent.click(
      screen.getByTestId("vd-storyboard-character-description-save-1"),
    );

    expect(onSave).toHaveBeenCalledWith(1, {
      alice: "ผู้หญิงที่ใส่ผ้ากันเปื้อน",
    });
  });
});
