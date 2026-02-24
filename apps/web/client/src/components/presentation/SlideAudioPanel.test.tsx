/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SlideAudioPanel } from "./SlideAudioPanel";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Mock tRPC hooks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc", () => ({
  trpc: {
    presentation: {
      setSlideAudio: { useMutation: vi.fn() },
      setDeckAudio: { useMutation: vi.fn() },
    },
    library: {
      search: { useQuery: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMutationMock(mutate?: ReturnType<typeof vi.fn>) {
  return {
    mutate: mutate ?? vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
  };
}

function makeSearchQueryMock(items: Array<{ item_id: number; title: string; item_type: string }> = []) {
  return {
    data: { results: items, total: items.length },
    isLoading: false,
    isError: false,
  };
}

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const SLIDE_AUDIO_TRACK = {
  libraryItemId: 1,
  volume: 0.6,
  startAtMs: 0,
  title: "Track A",
};

const DECK_AUDIO_TRACK = {
  libraryItemId: 2,
  volume: 0.5,
  loop: true,
  fadeOutMs: null,
  title: "BG Music",
};

const PROPS_NO_AUDIO = {
  slideId: 10,
  slideVersion: 1,
  slideAudioTrack: null,
  deckId: 42,
  deckVersion: 1,
  deckAudioTrack: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlideAudioPanel", () => {
  beforeEach(() => {
    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.library.search.useQuery).mockReturnValue(
      makeSearchQueryMock() as any,
    );
  });

  // 1. Add Audio button shown when no slide audio configured
  it("renders 'Add Audio' button when no audio track is configured for slide", () => {
    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    expect(screen.getByRole("button", { name: /add audio/i })).toBeDefined();
  });

  // 2. Audio file name and volume slider shown when audio track exists
  it("renders audio file name and volume slider when audio track exists", () => {
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideAudioTrack={SLIDE_AUDIO_TRACK}
      />,
    );
    expect(screen.getByText("Track A")).toBeDefined();
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
  });

  // 3. Remove clears per-slide audio track
  it("'Remove' button clears audio track (calls setSlideAudio with null)", () => {
    const mockMutate = vi.fn();
    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
      makeMutationMock(mockMutate) as any,
    );
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideAudioTrack={SLIDE_AUDIO_TRACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove slide audio/i }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        slideId: 10,
        audioTrack: null,
      }),
    );
  });

  // 4. Volume slider reflects audioTrack.volume mapped from 0.0–1.0 to 0–100
  it("volume slider value reflects audioTrack.volume (0–1 mapped to 0–100%)", () => {
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideAudioTrack={{ libraryItemId: 1, volume: 0.75, startAtMs: 0, title: "Track A" }}
      />,
    );
    // Radix Slider.Thumb renders with aria-valuenow
    const sliders = screen.getAllByRole("slider");
    const volumeSlider = sliders[0];
    expect(volumeSlider.getAttribute("aria-valuenow")).toBe("75");
  });

  // 5. Add Project Audio button always visible (even without slide selection)
  it("'Add Project Audio' button is always visible (not gated on slide selection)", () => {
    render(<SlideAudioPanel {...PROPS_NO_AUDIO} slideId={null} />);
    expect(screen.getByRole("button", { name: /add project audio/i })).toBeDefined();
  });

  // 6. Deck audio section shows file name and loop toggle
  it("project audio section shows file name and loop toggle when deck audio exists", () => {
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        deckAudioTrack={DECK_AUDIO_TRACK}
      />,
    );
    expect(screen.getByText("BG Music")).toBeDefined();
    // Loop Switch renders with role="switch"
    const loopSwitch = screen.getByRole("switch", { name: /loop/i });
    expect(loopSwitch).toBeDefined();
    expect(loopSwitch.getAttribute("data-state")).toBe("checked");
  });

  // 7. Remove deck audio calls setDeckAudio with null
  it("setDeckAudio mutation is called with null when deck audio is removed", () => {
    const mockMutate = vi.fn();
    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
      makeMutationMock(mockMutate) as any,
    );
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        deckAudioTrack={DECK_AUDIO_TRACK}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /remove project audio/i }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 42,
        projectAudioTrack: null,
      }),
    );
  });

  // 8. Picker opens filtered to audio item type
  it("media library picker filters to audio item type when Add Audio is clicked", async () => {
    let capturedInput: any;
    vi.mocked(trpc.library.search.useQuery).mockImplementation(
      (input: any) => {
        capturedInput = input;
        return makeSearchQueryMock() as any;
      },
    );

    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /add audio/i }));
    });

    // AudioPickerDialog is now open, useQuery is called with audio filter
    expect(capturedInput?.filters?.itemType).toBe("audio");
  });
});
