import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

describe("VerticalDramaStoryboardPanel — shot-local character descriptions", () => {
  const baseProps = {
    locale: "th" as const,
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
        dialogueLines: [
          { speaker: "ไอริณ", line: "สวัสดี" },
          { speaker: "ภาคิน", line: "สวัสดีเช่นกัน" },
        ],
      },
    ],
    characterPortraits: {
      alice: { characterId: "1", name: "ไอริณ", portraitUrl: null },
      bob: { characterId: "2", name: "ภาคิน", portraitUrl: null },
    },
    loading: false,
  };

  it("lets the user save an identity description for a dialogue character", () => {
    const onSave = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
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

  it("keeps unsaved details when cast-position controls rerender the shot", () => {
    const { rerender } = render(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
          onSetShotCharacterDescriptionOverrides: vi.fn(),
        } as any)}
      />,
    );

    const aliceInput = screen.getByTestId(
      "vd-storyboard-character-description-input-1-alice",
    );
    const bobInput = screen.getByTestId(
      "vd-storyboard-character-description-input-1-bob",
    );
    fireEvent.change(aliceInput, {
      target: { value: "ผู้หญิงที่ใส่ผ้ากันเปื้อน" },
    });
    fireEvent.change(bobInput, {
      target: { value: "ผู้ชายเสื้อเชิ้ตสีขาว" },
    });

    // Selecting a cast-position option causes the parent panel to render
    // again. The editor must retain these drafts until the user saves them.
    rerender(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
          onSetShotCharacterDescriptionOverrides: vi.fn(),
          startFramePlan: {
            ...baseProps.startFramePlan,
            frames: [
              {
                ...baseProps.startFramePlan.frames[0],
                castPositionLock: {
                  assetId: "10",
                  orderedCharacterRefs: ["bob", "alice"],
                  confirmedAt: "2026-08-18T00:00:00.000Z",
                },
              },
            ],
          },
        } as any)}
      />,
    );

    expect(aliceInput).toHaveValue("ผู้หญิงที่ใส่ผ้ากันเปื้อน");
    expect(bobInput).toHaveValue("ผู้ชายเสื้อเชิ้ตสีขาว");
  });

  it("keeps every character while the user types one letter at a time", async () => {
    const user = userEvent.setup();
    render(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
          onSetShotCharacterDescriptionOverrides: vi.fn(),
        } as any)}
      />,
    );

    const aliceInput = screen.getByTestId(
      "vd-storyboard-character-description-input-1-alice",
    );
    await user.type(aliceInput, "ผู้หญิง");

    expect(aliceInput).toHaveValue("ผู้หญิง");
  });

  it("keeps the draft when the parent rebuilds shot props after each keystroke", () => {
    const { rerender } = render(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
          onSetShotCharacterDescriptionOverrides: vi.fn(),
        } as any)}
      />,
    );
    const aliceInput = screen.getByTestId(
      "vd-storyboard-character-description-input-1-alice",
    );
    let value = "";
    for (const character of "abc") {
      value += character;
      fireEvent.change(aliceInput, { target: { value } });
      rerender(
        <VerticalDramaStoryboardPanel
          {...({
            ...baseProps,
            storyboard: {
              ...baseProps.storyboard,
              shots: [...baseProps.storyboard.shots],
            },
            startFramePlan: {
              ...baseProps.startFramePlan,
              frames: [...baseProps.startFramePlan.frames],
            },
            onSetShotCharacterDescriptionOverrides: vi.fn(),
          } as any)}
        />,
      );
      expect(aliceInput).toHaveValue(value);
    }
  });

  it("shows the latest video-prompt failure instead of leaving a running label", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...({
          ...baseProps,
          selectedVideoModelId: "grok-imagine-video-1-5-preview",
          onGenerateShotVideoPrompt: vi.fn(),
          generatingShotVideoPromptForShot: new Set(),
          videoPromptJobStatusByShot: {},
          videoPromptJobErrorByShot: {
            1: "สร้างพรอมต์ไม่สำเร็จ: ไม่พบชื่อผู้พูด",
          },
        } as any)}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "สร้างพรอมต์ไม่สำเร็จ: ไม่พบชื่อผู้พูด",
    );
    expect(screen.queryByText("กำลังสร้างพรอมต์…")).not.toBeInTheDocument();
  });
});
