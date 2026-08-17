import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    locale: "th" as const,
    storyboard: {
      shots: [{ shot_number: 1, visual_description: "test", characters: [] }],
    },
    startFramePlan: {
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "a prompt",
          requiredCharacterRefs: ["left-character", "right-character"],
        },
      ],
    },
    characterPortraits: {
      "left-character": {
        characterId: "1",
        name: "ตัวละครซ้าย",
        portraitUrl: null,
      },
      "right-character": {
        characterId: "2",
        name: "ตัวละครขวา",
        portraitUrl: null,
      },
    },
    loading: false,
    onSetShotCastPositionLock: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — cast position swaps", () => {
  it("keeps every character option selectable so users can swap positions", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);

    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    const firstSelect = selects[0] as HTMLSelectElement;
    const rightCharacterOption = firstSelect.querySelector(
      'option[value="right-character"]'
    );
    expect(rightCharacterOption).not.toBeNull();
    expect(rightCharacterOption).not.toBeDisabled();

    // Selecting the other slot's value is the first step of a manual swap.
    fireEvent.change(firstSelect, { target: { value: "right-character" } });
    expect(firstSelect).toHaveValue("right-character");

    // The temporary duplicate is visible, but confirmation remains guarded
    // until the user finishes the swap and restores a unique order.
    expect(
      screen.getByTestId("vd-storyboard-confirm-cast-position-1")
    ).toBeDisabled();
  });
});
