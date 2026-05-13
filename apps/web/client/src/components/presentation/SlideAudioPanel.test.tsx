/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { SlideAudioPanel } from "./SlideAudioPanel";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Mock tRPC hooks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: vi.fn(),
    presentation: {
      setSlideAudio: { useMutation: vi.fn() },
      setDeckAudio: { useMutation: vi.fn() },
      uploadAndAttachAsset: { useMutation: vi.fn() },
      generateSlideAudioFromNote: { useMutation: vi.fn() },
    },
    media: {
      getModels: { useQuery: vi.fn() },
      listModelFieldOptions: { useQuery: vi.fn() },
      listTasks: { useQuery: vi.fn() },
      generateAudioAsync: { useMutation: vi.fn() },
      addTaskToLibrary: { useMutation: vi.fn() },
    },
    library: {
      listDocuments: { useQuery: vi.fn() },
      search: { useQuery: vi.fn() },
      getItem: { useQuery: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMutationMock(
  mutate?: ReturnType<typeof vi.fn>,
  mutateAsync?: ReturnType<typeof vi.fn>,
) {
  return {
    mutate: mutate ?? vi.fn(),
    mutateAsync: mutateAsync ?? vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    isSuccess: false,
    reset: vi.fn(),
  };
}

function makeLibraryDocumentsQueryMock(items: Array<Record<string, unknown>> = []) {
  return {
    data: { results: items, total: items.length },
    isLoading: false,
    isError: false,
  };
}

function makeGetItemQueryMock(overrides?: Partial<{ title: string; sourceUrl: string; metadata: Record<string, unknown> }>) {
  return {
    data: {
      title: overrides?.title ?? "Audio item",
      sourceUrl: overrides?.sourceUrl ?? "https://cdn.example.com/test.mp3",
      metadata: overrides?.metadata ?? { durationSeconds: 12.5 },
    },
    isLoading: false,
    isError: false,
  };
}

function makeMediaTasksQueryMock(tasks: Array<Record<string, unknown>> = []) {
  return {
    data: { tasks, total: tasks.length },
    isLoading: false,
    isError: false,
  };
}

function makeAudioModelsQueryMock() {
  return {
    data: {
      models: [
        {
          id: "uvoice/tts-standard",
          name: "UVoice Standard",
          provider: "uvoice",
          configJson: {
            inputFields: [
              {
                key: "voice",
                label: "Voice",
                type: "select",
                required: true,
                options: [{ value: "alloy", label: "Alloy" }],
              },
            ],
          },
        },
      ],
      defaults: {
        audio: "uvoice/tts-standard",
      },
    },
    isLoading: false,
    error: null,
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
  slideTitle: "Intro",
  slideNote: null,
  slideNoteDirty: false,
  onSaveSlideNote: vi.fn().mockResolvedValue(true),
  deckId: 42,
  deckVersion: 1,
  deckAudioTrack: null,
};

class MockFileReader {
  result: string | null = null;
  onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
  onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL(file: Blob) {
    this.result = `data:${(file as File).type || "audio/mpeg"};base64,dGVzdA==`;
    this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlideAudioPanel", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);
    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.uploadAndAttachAsset.useMutation).mockReturnValue(
      makeMutationMock() as any,
    );
    vi.mocked(trpc.presentation.generateSlideAudioFromNote.useMutation).mockReturnValue(
      makeMutationMock(undefined, vi.fn().mockResolvedValue({ libraryItemId: 777 })) as any,
    );
    vi.mocked(trpc.media.getModels.useQuery).mockReturnValue(
      makeAudioModelsQueryMock() as any,
    );
    vi.mocked(trpc.media.listModelFieldOptions.useQuery).mockReturnValue(
      { data: { options: [] }, isLoading: false, error: null } as any,
    );
    vi.mocked(trpc.media.listTasks.useQuery).mockReturnValue(
      makeMediaTasksQueryMock() as any,
    );
    vi.mocked(trpc.media.generateAudioAsync.useMutation).mockReturnValue(
      makeMutationMock(undefined, vi.fn().mockResolvedValue({ id: "audio-task-1" })) as any,
    );
    vi.mocked(trpc.media.addTaskToLibrary.useMutation).mockReturnValue(
      makeMutationMock(undefined, vi.fn().mockResolvedValue({ itemId: 777 })) as any,
    );
    vi.mocked(trpc.library.listDocuments.useQuery).mockReturnValue(
      makeLibraryDocumentsQueryMock() as any,
    );
    vi.mocked(trpc.library.search.useQuery).mockReturnValue(
      makeLibraryDocumentsQueryMock() as any,
    );
    vi.mocked(trpc.library.getItem.useQuery).mockReturnValue(
      makeGetItemQueryMock() as any,
    );
    vi.mocked(trpc.useUtils).mockReturnValue({
      media: {
        getTask: {
          fetch: vi.fn().mockResolvedValue({ status: "completed" }),
        },
      },
    } as any);
  });

  // 1. Add Audio button shown when no slide audio configured
  it("renders 'Add Audio' button when no audio track is configured for slide", () => {
    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    expect(screen.getByRole("button", { name: /add audio/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /upload slide audio/i })).toBeDefined();
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
    expect(screen.getByRole("button", { name: /upload project audio/i })).toBeDefined();
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
    vi.mocked(trpc.library.listDocuments.useQuery).mockImplementation(
      (input: any) => {
        capturedInput = input;
        return makeLibraryDocumentsQueryMock() as any;
      },
    );

    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /add audio/i }));
    });

    // AudioPickerDialog is now open, useQuery is called with audio filter/scope
    expect(capturedInput?.filters?.itemType).toBe("audio");
    expect(capturedInput?.scope).toBe("all");
  });

  it("end trim input is always enabled regardless of Play to end state", () => {
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideAudioTrack={SLIDE_AUDIO_TRACK}
      />,
    );

    const endInput = screen.getByLabelText("slide-audio-trim-end-seconds") as HTMLInputElement;
    // End input is always enabled — editing it auto-disables "Play to end"
    expect(endInput.disabled).toBe(false);
  });

  it("shows 'Shared' badge for audio files shared via group", () => {
    vi.mocked(trpc.library.listDocuments.useQuery).mockReturnValue(
      makeLibraryDocumentsQueryMock([
        {
          id: 99,
          item_type: "audio",
          title: "Shared Group Audio",
          status: "ready",
          source_url: "https://cdn.example.com/shared-group-audio.mp3",
          access_source: "shared_group",
          created_at: new Date().toISOString(),
          metadata: {},
        },
      ]) as any,
    );

    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    fireEvent.click(screen.getByRole("button", { name: /add audio/i }));
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });

  it("includes completed audio from media history and adds it through the library bridge", async () => {
    const addTaskToLibrary = vi.fn().mockResolvedValue({ itemId: 909 });
    const setDeckAudio = vi.fn();
    vi.mocked(trpc.library.listDocuments.useQuery).mockReturnValue(
      makeLibraryDocumentsQueryMock([
        {
          id: 33,
          item_type: "audio",
          title: "Older library audio",
          status: "ready",
          source_url: "https://cdn.example.com/older-library.mp3",
          created_at: "2026-01-01T00:00:00.000Z",
          metadata: {},
        },
      ]) as any,
    );
    vi.mocked(trpc.media.addTaskToLibrary.useMutation).mockReturnValue(
      makeMutationMock(undefined, addTaskToLibrary) as any,
    );
    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
      makeMutationMock(setDeckAudio) as any,
    );
    vi.mocked(trpc.media.listTasks.useQuery).mockReturnValue(
      makeMediaTasksQueryMock([
        {
          id: "task-audio-1",
          mediaType: "audio",
          status: "completed",
          model: "elevenlabs/text-to-dialogue",
          prompt: "History narration prompt",
          resultUrl: "https://cdn.example.com/history-narration.mp3",
          createdAt: new Date().toISOString(),
        },
      ]) as any,
    );

    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    fireEvent.click(screen.getByRole("button", { name: /add project audio/i }));

    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("History narration prompt")).toBeInTheDocument();
    const items = screen.getAllByTestId(/^audio-picker-item-/);
    expect(items[0]).toHaveTextContent("History narration prompt");

    fireEvent.click(screen.getByTestId("audio-picker-add-history:task-audio-1"));

    await waitFor(() => {
      expect(addTaskToLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-audio-1",
          title: "History narration prompt",
        }),
      );
      expect(setDeckAudio).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: 42,
          projectAudioTrack: expect.objectContaining({ libraryItemId: 909 }),
        }),
      );
    });
  });

  it("shows save-note-first CTA when the slide note is dirty", async () => {
    const onSaveSlideNote = vi.fn().mockResolvedValue(true);
    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideNote="Saved note"
        slideNoteDirty
        onSaveSlideNote={onSaveSlideNote}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save note first/i }));
    await waitFor(() => {
      expect(onSaveSlideNote).toHaveBeenCalledTimes(1);
    });
  });

  it("generates slide audio from the saved note and replaces the slide track after success", async () => {
    const generateSlideAudioFromNote = vi.fn().mockResolvedValue({ libraryItemId: 777 });
    vi.mocked(trpc.presentation.generateSlideAudioFromNote.useMutation).mockReturnValue(
      makeMutationMock(undefined, generateSlideAudioFromNote) as any,
    );

    render(
      <SlideAudioPanel
        {...PROPS_NO_AUDIO}
        slideNote="Saved narration note"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate from note/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate audio/i }));

    await waitFor(() => {
      expect(generateSlideAudioFromNote).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: 42,
          slideId: 10,
          expectedVersion: 1,
        }),
      );
    });
  });

  it("reuses the latest local deck version across sequential slide audio uploads without waiting for parent refresh", async () => {
    const uploadAndAttachAsset = vi.fn()
      .mockResolvedValueOnce({ item: { id: 701 } })
      .mockResolvedValueOnce({ item: { id: 702 } });
    const setSlideAudioAsync = vi.fn()
      .mockResolvedValueOnce({ deckVersion: 3, slideVersion: 2 })
      .mockResolvedValueOnce({ deckVersion: 5, slideVersion: 3 });

    vi.mocked(trpc.presentation.uploadAndAttachAsset.useMutation).mockReturnValue(
      makeMutationMock(undefined, uploadAndAttachAsset) as any,
    );
    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
      makeMutationMock(undefined, setSlideAudioAsync) as any,
    );

    const { container } = render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /upload slide audio/i }));
    await act(async () => {
      fireEvent.change(fileInput, {
        target: {
          files: [new File(["audio-one"], "one.mp3", { type: "audio/mpeg" })],
        },
      });
    });

    await waitFor(() => {
      expect(uploadAndAttachAsset).toHaveBeenCalledWith(
        expect.objectContaining({ expectedVersion: 1 }),
      );
      expect(setSlideAudioAsync).toHaveBeenCalledWith(
        expect.objectContaining({ expectedVersion: 2 }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /upload slide audio/i }));
    await act(async () => {
      fireEvent.change(fileInput, {
        target: {
          files: [new File(["audio-two"], "two.mp3", { type: "audio/mpeg" })],
        },
      });
    });

    await waitFor(() => {
      expect(uploadAndAttachAsset).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ expectedVersion: 3 }),
      );
      expect(setSlideAudioAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ expectedVersion: 4 }),
      );
    });
  });
});
