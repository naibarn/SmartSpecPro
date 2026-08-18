/**
 * Coverage for the per-shot character/variant reference picker (planning/
 * vertical-drama-twin-variant-completeness/plan.md, W6 frontend) —
 * `VerticalDramaStoryboardPanel`'s pencil edit-affordance next to a shot's
 * character chips, opening a dialog that lets the user override WHICH
 * character(s)/variant(s) are used as the identity-lock reference for that
 * ONE shot, wired via `onSetShotCharacterReferences`.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VerticalDramaStoryboardPanel } from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

function checkboxFor(testId: string): HTMLElement {
  const row = screen.getByTestId(testId);
  const box = row.querySelector('button[role="checkbox"]');
  if (!box) throw new Error(`No checkbox found inside ${testId}`);
  return box as HTMLElement;
}

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
          requiredCharacterRefs: ["hero"],
        },
      ],
    },
    characterPortraits: {
      hero: { characterId: "1", name: "พระเอก", portraitUrl: null },
      "hero-uniform": {
        characterId: "2",
        name: "พระเอก",
        portraitUrl: null,
        parentCharacterId: "1",
        variantLabel: "ชุดยูนิฟอร์ม",
        variantType: "outfit" as const,
      },
      "hero-twin": {
        characterId: "3",
        name: "น้องเอก",
        portraitUrl: null,
        sharesFaceWithCharacterId: "1",
      },
    },
    loading: false,
    onSetShotCharacterReferences: vi.fn(),
    ...overrides,
  };
}

describe("VerticalDramaStoryboardPanel — per-shot character reference picker (W6)", () => {
  it("does not render the edit affordance when onSetShotCharacterReferences is absent", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onSetShotCharacterReferences: undefined }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-storyboard-character-ref-edit-1")
    ).not.toBeInTheDocument();
  });

  it("opens the picker and shows every roster entry grouped: variant nested under its parent (with an outfit badge), twin as its own entry with a 'twin of' badge", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    fireEvent.click(screen.getByTestId("vd-storyboard-character-ref-edit-1"));

    expect(
      screen.getByTestId("vd-storyboard-character-ref-picker-1")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-character-ref-option-1-hero")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-character-ref-option-1-hero-uniform")
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("vd-storyboard-character-ref-option-1-hero-twin")
    ).toBeInTheDocument();

    // Outfit badge on the nested variant row.
    expect(screen.getByText("ชุด")).toBeInTheDocument();
    // Twin badge resolved to the face-source character's name.
    expect(screen.getByText(/แฝดของ พระเอก/)).toBeInTheDocument();
  });

  it("seeds checkboxes from the shot's current requiredCharacterRefs", () => {
    render(<VerticalDramaStoryboardPanel {...(baseProps() as any)} />);
    fireEvent.click(screen.getByTestId("vd-storyboard-character-ref-edit-1"));

    expect(
      checkboxFor("vd-storyboard-character-ref-option-1-hero")
    ).toHaveAttribute("data-state", "checked");
    expect(
      checkboxFor("vd-storyboard-character-ref-option-1-hero-uniform")
    ).toHaveAttribute("data-state", "unchecked");
    expect(
      checkboxFor("vd-storyboard-character-ref-option-1-hero-twin")
    ).toHaveAttribute("data-state", "unchecked");
  });

  it("submits the full-replacement array with the correct shotNumber on save", () => {
    const onSet = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onSetShotCharacterReferences: onSet }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-storyboard-character-ref-edit-1"));
    fireEvent.click(
      checkboxFor("vd-storyboard-character-ref-option-1-hero-twin")
    );
    fireEvent.click(
      screen.getByTestId("vd-storyboard-character-ref-picker-save-1")
    );

    expect(onSet).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledWith(1, ["hero", "hero-twin"]);
  });

  it("edits phone callers separately from the physical scene cast", () => {
    const onSetCaller = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onSetShotScreenCallerReferences: onSetCaller,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a prompt",
                requiredCharacterRefs: ["hero"],
                screenCallerCharacterRefs: ["hero-twin"],
              },
            ],
          },
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-storyboard-screen-caller-edit-1"));
    expect(screen.getByText("กำหนด Caller ทางโทรศัพท์")).toBeInTheDocument();
    fireEvent.click(
      screen.getByTestId("vd-storyboard-character-ref-option-1-hero-twin")
    );
    fireEvent.click(
      screen.getByTestId(
        "vd-storyboard-character-ref-picker-save-1-screen_caller"
      )
    );
    expect(onSetCaller).toHaveBeenCalledWith(1, []);
  });

  it("renders each phone caller as a separate vertical virtual screen", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          characterPortraits: {
            hero: {
              characterId: "1",
              name: "พระเอก",
              portraitUrl: "https://cdn.test/hero.jpg",
            },
            "hero-twin": {
              characterId: "3",
              name: "น้องเอก",
              portraitUrl: "https://cdn.test/caller.jpg",
            },
            "caller-two": {
              characterId: "4",
              name: "เพื่อน",
              portraitUrl: "https://cdn.test/caller-two.jpg",
            },
          },
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a prompt",
                requiredCharacterRefs: ["hero"],
                screenCallerCharacterRefs: ["hero-twin", "caller-two"],
              },
            ],
          },
        }) as any)}
      />
    );

    const firstScreen = screen.getByTestId(
      "vd-storyboard-virtual-phone-screen-1-hero-twin"
    );
    expect(firstScreen).toHaveAttribute("data-orientation", "vertical");
    expect(firstScreen.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/caller.jpg"
    );
    expect(
      screen.getByTestId("vd-storyboard-virtual-phone-screen-1-caller-two")
    ).toBeInTheDocument();
  });

  it("an unchecked-then-saved selection sends an empty array (explicit clear)", () => {
    const onSet = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({ onSetShotCharacterReferences: onSet }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-storyboard-character-ref-edit-1"));
    fireEvent.click(checkboxFor("vd-storyboard-character-ref-option-1-hero"));
    fireEvent.click(
      screen.getByTestId("vd-storyboard-character-ref-picker-save-1")
    );

    expect(onSet).toHaveBeenCalledWith(1, []);
  });

  it("shows a stale/unknown key (present on the shot but absent from the roster) as a removable row, and removing it drops it from the saved payload", () => {
    const onSet = vi.fn();
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          onSetShotCharacterReferences: onSet,
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a prompt",
                requiredCharacterRefs: ["hero", "ghost-key"],
              },
            ],
          },
        }) as any)}
      />
    );
    fireEvent.click(screen.getByTestId("vd-storyboard-character-ref-edit-1"));

    const unknownRow = screen.getByTestId(
      "vd-storyboard-character-ref-unknown-1-ghost-key"
    );
    expect(unknownRow).toBeInTheDocument();
    expect(unknownRow.textContent).toContain("ghost-key");

    fireEvent.click(unknownRow.querySelector("button")!);
    fireEvent.click(
      screen.getByTestId("vd-storyboard-character-ref-picker-save-1")
    );
    expect(onSet).toHaveBeenCalledWith(1, ["hero"]);
  });

  it("re-renders the shot's character chips from the updated plan after a save (chips read frame.requiredCharacterRefs, not the storyboard's own field)", () => {
    const { rerender } = render(
      <VerticalDramaStoryboardPanel {...(baseProps() as any)} />
    );
    expect(
      screen.getByTestId("vd-storyboard-character-chip-1-hero")
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("vd-storyboard-character-chip-1-hero-twin")
    ).not.toBeInTheDocument();

    // Simulate the caller re-rendering with the mutation's returned plan.
    rerender(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          startFramePlan: {
            frames: [
              {
                shotNumber: 1,
                imagePrompt: "a prompt",
                requiredCharacterRefs: ["hero", "hero-twin"],
              },
            ],
          },
        }) as any)}
      />
    );
    expect(
      screen.getByTestId("vd-storyboard-character-chip-1-hero-twin")
    ).toBeInTheDocument();
  });

  it("respects an explicit empty requiredCharacterRefs on the plan (does not fall back to the storyboard's own characters list)", () => {
    render(
      <VerticalDramaStoryboardPanel
        {...(baseProps({
          storyboard: {
            shots: [
              {
                shot_number: 1,
                visual_description: "test",
                characters: ["hero"],
              },
            ],
          },
          startFramePlan: {
            frames: [
              { shotNumber: 1, imagePrompt: "a prompt", requiredCharacterRefs: [] },
            ],
          },
        }) as any)}
      />
    );
    expect(
      screen.queryByTestId("vd-storyboard-character-chip-1-hero")
    ).not.toBeInTheDocument();
    // The edit affordance still renders (so the user can add one back).
    expect(
      screen.getByTestId("vd-storyboard-character-ref-edit-1")
    ).toBeInTheDocument();
  });
});
