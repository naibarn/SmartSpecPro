diff --git a/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx b/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx
new file mode 100644
index 0000000..2da660a
--- /dev/null
+++ b/apps/web/client/src/components/presentation/SlideAudioPanel.test.tsx
@@ -0,0 +1,212 @@
+/**
+ * @vitest-environment jsdom
+ */
+import React from "react";
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, act } from "@testing-library/react";
+import { SlideAudioPanel } from "./SlideAudioPanel";
+import { trpc } from "@/lib/trpc";
+
+// ---------------------------------------------------------------------------
+// Mock tRPC hooks
+// ---------------------------------------------------------------------------
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    presentation: {
+      setSlideAudio: { useMutation: vi.fn() },
+      setDeckAudio: { useMutation: vi.fn() },
+    },
+    library: {
+      search: { useQuery: vi.fn() },
+    },
+  },
+}));
+
+vi.mock("sonner", () => ({
+  toast: { error: vi.fn(), success: vi.fn() },
+}));
+
+// ---------------------------------------------------------------------------
+// Mock factories
+// ---------------------------------------------------------------------------
+
+function makeMutationMock(mutate?: ReturnType<typeof vi.fn>) {
+  return {
+    mutate: mutate ?? vi.fn(),
+    isPending: false,
+    isError: false,
+    isSuccess: false,
+    reset: vi.fn(),
+  };
+}
+
+function makeSearchQueryMock(items: Array<{ item_id: number; title: string; item_type: string }> = []) {
+  return {
+    data: { results: items, total: items.length },
+    isLoading: false,
+    isError: false,
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Default props
+// ---------------------------------------------------------------------------
+
+const SLIDE_AUDIO_TRACK = {
+  libraryItemId: 1,
+  volume: 0.6,
+  startAtMs: 0,
+  title: "Track A",
+};
+
+const DECK_AUDIO_TRACK = {
+  libraryItemId: 2,
+  volume: 0.5,
+  loop: true,
+  fadeOutMs: null,
+  title: "BG Music",
+};
+
+const PROPS_NO_AUDIO = {
+  slideId: 10,
+  slideVersion: 1,
+  slideAudioTrack: null,
+  deckId: 42,
+  deckVersion: 1,
+  deckAudioTrack: null,
+};
+
+// ---------------------------------------------------------------------------
+// Tests
+// ---------------------------------------------------------------------------
+
+describe("SlideAudioPanel", () => {
+  beforeEach(() => {
+    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
+      makeMutationMock() as any,
+    );
+    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
+      makeMutationMock() as any,
+    );
+    vi.mocked(trpc.library.search.useQuery).mockReturnValue(
+      makeSearchQueryMock() as any,
+    );
+  });
+
+  // 1. Add Audio button shown when no slide audio configured
+  it("renders 'Add Audio' button when no audio track is configured for slide", () => {
+    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
+    expect(screen.getByRole("button", { name: /add audio/i })).toBeDefined();
+  });
+
+  // 2. Audio file name and volume slider shown when audio track exists
+  it("renders audio file name and volume slider when audio track exists", () => {
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        slideAudioTrack={SLIDE_AUDIO_TRACK}
+      />,
+    );
+    expect(screen.getByText("Track A")).toBeDefined();
+    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
+  });
+
+  // 3. Remove clears per-slide audio track
+  it("'Remove' button clears audio track (calls setSlideAudio with null)", () => {
+    const mockMutate = vi.fn();
+    vi.mocked(trpc.presentation.setSlideAudio.useMutation).mockReturnValue(
+      makeMutationMock(mockMutate) as any,
+    );
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        slideAudioTrack={SLIDE_AUDIO_TRACK}
+      />,
+    );
+    fireEvent.click(screen.getByRole("button", { name: /remove slide audio/i }));
+    expect(mockMutate).toHaveBeenCalledTimes(1);
+    expect(mockMutate).toHaveBeenCalledWith(
+      expect.objectContaining({
+        slideId: 10,
+        audioTrack: null,
+      }),
+    );
+  });
+
+  // 4. Volume slider reflects audioTrack.volume mapped from 0.0–1.0 to 0–100
+  it("volume slider value reflects audioTrack.volume (0–1 mapped to 0–100%)", () => {
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        slideAudioTrack={{ libraryItemId: 1, volume: 0.75, startAtMs: 0, title: "Track A" }}
+      />,
+    );
+    // Radix Slider.Thumb renders with aria-valuenow
+    const sliders = screen.getAllByRole("slider");
+    const volumeSlider = sliders[0];
+    expect(volumeSlider.getAttribute("aria-valuenow")).toBe("75");
+  });
+
+  // 5. Add Project Audio button always visible (even without slide selection)
+  it("'Add Project Audio' button is always visible (not gated on slide selection)", () => {
+    render(<SlideAudioPanel {...PROPS_NO_AUDIO} slideId={null} />);
+    expect(screen.getByRole("button", { name: /add project audio/i })).toBeDefined();
+  });
+
+  // 6. Deck audio section shows file name and loop toggle
+  it("project audio section shows file name and loop toggle when deck audio exists", () => {
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        deckAudioTrack={DECK_AUDIO_TRACK}
+      />,
+    );
+    expect(screen.getByText("BG Music")).toBeDefined();
+    // Loop Switch renders with role="switch"
+    const loopSwitch = screen.getByRole("switch", { name: /loop/i });
+    expect(loopSwitch).toBeDefined();
+    expect(loopSwitch.getAttribute("data-state")).toBe("checked");
+  });
+
+  // 7. Remove deck audio calls setDeckAudio with null
+  it("setDeckAudio mutation is called with null when deck audio is removed", () => {
+    const mockMutate = vi.fn();
+    vi.mocked(trpc.presentation.setDeckAudio.useMutation).mockReturnValue(
+      makeMutationMock(mockMutate) as any,
+    );
+    render(
+      <SlideAudioPanel
+        {...PROPS_NO_AUDIO}
+        deckAudioTrack={DECK_AUDIO_TRACK}
+      />,
+    );
+    fireEvent.click(screen.getByRole("button", { name: /remove project audio/i }));
+    expect(mockMutate).toHaveBeenCalledTimes(1);
+    expect(mockMutate).toHaveBeenCalledWith(
+      expect.objectContaining({
+        deckId: 42,
+        audioTrack: null,
+      }),
+    );
+  });
+
+  // 8. Picker opens filtered to audio item type
+  it("media library picker filters to audio item type when Add Audio is clicked", async () => {
+    let capturedInput: any;
+    vi.mocked(trpc.library.search.useQuery).mockImplementation(
+      (input: any) => {
+        capturedInput = input;
+        return makeSearchQueryMock() as any;
+      },
+    );
+
+    render(<SlideAudioPanel {...PROPS_NO_AUDIO} />);
+    act(() => {
+      fireEvent.click(screen.getByRole("button", { name: /add audio/i }));
+    });
+
+    // AudioPickerDialog is now open, useQuery is called with audio filter
+    expect(capturedInput?.filters?.itemType).toBe("audio");
+  });
+});
diff --git a/apps/web/client/src/components/presentation/SlideAudioPanel.tsx b/apps/web/client/src/components/presentation/SlideAudioPanel.tsx
new file mode 100644
index 0000000..986a194
--- /dev/null
+++ b/apps/web/client/src/components/presentation/SlideAudioPanel.tsx
@@ -0,0 +1,506 @@
+import { useEffect, useState } from "react";
+import { Music, Trash2, Plus } from "lucide-react";
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogHeader,
+  DialogTitle,
+} from "@/components/ui/dialog";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import { Separator } from "@/components/ui/separator";
+import { Slider } from "@/components/ui/slider";
+import { Switch } from "@/components/ui/switch";
+import { trpc } from "@/lib/trpc";
+import { toast } from "sonner";
+import type { AudioTrackInput, ProjectAudioTrackInput } from "@shared/presentation/contracts";
+
+// ---------------------------------------------------------------------------
+// Extended types — add optional display title (not persisted to DB)
+// ---------------------------------------------------------------------------
+
+export type AudioTrackWithTitle = AudioTrackInput & { title?: string };
+export type ProjectAudioTrackWithTitle = ProjectAudioTrackInput & { title?: string };
+
+// ---------------------------------------------------------------------------
+// Component props
+// ---------------------------------------------------------------------------
+
+export interface SlideAudioPanelProps {
+  /** ID of the currently selected slide. null if no slide is selected. */
+  slideId: number | null;
+  /** Version of the currently selected slide (for optimistic locking). */
+  slideVersion: number | null;
+  /** Current audio track on the selected slide, or null. */
+  slideAudioTrack: AudioTrackWithTitle | null;
+  /** ID of the deck. */
+  deckId: number;
+  /** Version of the deck (for optimistic locking). */
+  deckVersion: number;
+  /** Current project-wide audio track on the deck, or null. */
+  deckAudioTrack: ProjectAudioTrackWithTitle | null;
+}
+
+// ---------------------------------------------------------------------------
+// AudioPickerDialog — reusable picker using library.search filtered to audio
+// ---------------------------------------------------------------------------
+
+interface AudioPickerDialogProps {
+  open: boolean;
+  onClose: () => void;
+  onSelect: (libraryItemId: number, title: string) => void;
+}
+
+function AudioPickerDialog({ open, onClose, onSelect }: AudioPickerDialogProps) {
+  const [query, setQuery] = useState("");
+  const [debouncedQuery, setDebouncedQuery] = useState("");
+
+  useEffect(() => {
+    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
+    return () => window.clearTimeout(t);
+  }, [query]);
+
+  const searchQuery = trpc.library.search.useQuery(
+    {
+      query: debouncedQuery || undefined,
+      filters: { itemType: "audio" },
+    },
+    { enabled: open },
+  );
+
+  const results = searchQuery.data?.results ?? [];
+
+  function handleSelect(itemId: number, title: string) {
+    onSelect(itemId, title);
+    onClose();
+    setQuery("");
+  }
+
+  return (
+    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
+      <DialogContent className="sm:max-w-md">
+        <DialogHeader>
+          <DialogTitle>Select Audio</DialogTitle>
+          <DialogDescription className="sr-only">
+            Search your media library for audio files to attach.
+          </DialogDescription>
+        </DialogHeader>
+        <div className="space-y-3">
+          <Input
+            placeholder="Search audio files..."
+            value={query}
+            onChange={(e) => setQuery(e.target.value)}
+            data-testid="audio-picker-search"
+          />
+          <div className="max-h-64 overflow-y-auto space-y-1">
+            {searchQuery.isLoading && (
+              <p className="text-sm text-muted-foreground py-2 text-center">Loading...</p>
+            )}
+            {!searchQuery.isLoading && results.length === 0 && (
+              <p className="text-sm text-muted-foreground py-2 text-center">
+                No audio files found.
+              </p>
+            )}
+            {results.map((item) => (
+              <button
+                key={item.item_id}
+                className="w-full text-left flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50 cursor-pointer"
+                onClick={() => handleSelect(item.item_id, item.title)}
+                data-testid={`audio-picker-item-${item.item_id}`}
+              >
+                <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
+                <span className="truncate">{item.title}</span>
+              </button>
+            ))}
+          </div>
+        </div>
+      </DialogContent>
+    </Dialog>
+  );
+}
+
+// ---------------------------------------------------------------------------
+// Main component
+// ---------------------------------------------------------------------------
+
+export function SlideAudioPanel({
+  slideId,
+  slideVersion,
+  slideAudioTrack,
+  deckId,
+  deckVersion,
+  deckAudioTrack,
+}: SlideAudioPanelProps) {
+  // Picker state
+  const [pickerOpen, setPickerOpen] = useState(false);
+  const [pickerTarget, setPickerTarget] = useState<"slide" | "deck">("slide");
+
+  // Per-slide audio draft state (local, not persisted until Save)
+  const [slideVolumePct, setSlideVolumePct] = useState<number>(
+    Math.round((slideAudioTrack?.volume ?? 1) * 100),
+  );
+  const [slideStartSec, setSlideStartSec] = useState<number>(
+    (slideAudioTrack?.startAtMs ?? 0) / 1000,
+  );
+  const [slidePlayToEnd, setSlidePlayToEnd] = useState<boolean>(
+    slideAudioTrack?.endAtMs == null,
+  );
+  const [slideEndSec, setSlideEndSec] = useState<number>(
+    (slideAudioTrack?.endAtMs ?? 0) / 1000,
+  );
+
+  // Project-wide audio draft state
+  const [deckVolumePct, setDeckVolumePct] = useState<number>(
+    Math.round((deckAudioTrack?.volume ?? 1) * 100),
+  );
+  const [deckLoop, setDeckLoop] = useState<boolean>(deckAudioTrack?.loop ?? false);
+  const [deckFadeMs, setDeckFadeMs] = useState<number>(deckAudioTrack?.fadeOutMs ?? 0);
+
+  // Sync draft state when props change
+  useEffect(() => {
+    setSlideVolumePct(Math.round((slideAudioTrack?.volume ?? 1) * 100));
+    setSlideStartSec((slideAudioTrack?.startAtMs ?? 0) / 1000);
+    setSlidePlayToEnd(slideAudioTrack?.endAtMs == null);
+    setSlideEndSec((slideAudioTrack?.endAtMs ?? 0) / 1000);
+  }, [slideAudioTrack]);
+
+  useEffect(() => {
+    setDeckVolumePct(Math.round((deckAudioTrack?.volume ?? 1) * 100));
+    setDeckLoop(deckAudioTrack?.loop ?? false);
+    setDeckFadeMs(deckAudioTrack?.fadeOutMs ?? 0);
+  }, [deckAudioTrack]);
+
+  // Mutations
+  const setSlideAudioMutation = trpc.presentation.setSlideAudio.useMutation({
+    onError(err) {
+      toast.error(`Failed to update slide audio: ${err.message}`);
+    },
+  });
+
+  const setDeckAudioMutation = trpc.presentation.setDeckAudio.useMutation({
+    onError(err) {
+      toast.error(`Failed to update project audio: ${err.message}`);
+    },
+  });
+
+  // Handlers — per-slide
+  function handleSlideAudioSelect(libraryItemId: number, title: string) {
+    if (slideId == null || slideVersion == null) return;
+    setSlideAudioMutation.mutate({
+      slideId,
+      deckId,
+      audioTrack: {
+        libraryItemId,
+        volume: slideVolumePct / 100,
+        startAtMs: Math.round(slideStartSec * 1000),
+        endAtMs: slidePlayToEnd ? null : Math.round(slideEndSec * 1000),
+        title,
+      } as AudioTrackInput & { title: string },
+      expectedVersion: slideVersion,
+    });
+  }
+
+  function handleRemoveSlideAudio() {
+    if (slideId == null || slideVersion == null) return;
+    setSlideAudioMutation.mutate({
+      slideId,
+      deckId,
+      audioTrack: null,
+      expectedVersion: slideVersion,
+    });
+  }
+
+  function handleSaveSlideAudio() {
+    if (slideId == null || slideVersion == null || slideAudioTrack == null) return;
+    setSlideAudioMutation.mutate({
+      slideId,
+      deckId,
+      audioTrack: {
+        libraryItemId: slideAudioTrack.libraryItemId,
+        volume: slideVolumePct / 100,
+        startAtMs: Math.round(slideStartSec * 1000),
+        endAtMs: slidePlayToEnd ? null : Math.round(slideEndSec * 1000),
+      },
+      expectedVersion: slideVersion,
+    });
+  }
+
+  // Handlers — deck
+  function handleDeckAudioSelect(libraryItemId: number, title: string) {
+    setDeckAudioMutation.mutate({
+      deckId,
+      audioTrack: {
+        libraryItemId,
+        volume: deckVolumePct / 100,
+        loop: deckLoop,
+        fadeOutMs: deckFadeMs > 0 ? deckFadeMs : null,
+        title,
+      } as ProjectAudioTrackInput & { title: string },
+      expectedVersion: deckVersion,
+    });
+  }
+
+  function handleRemoveDeckAudio() {
+    setDeckAudioMutation.mutate({
+      deckId,
+      audioTrack: null,
+      expectedVersion: deckVersion,
+    });
+  }
+
+  function handleSaveDeckAudio() {
+    if (deckAudioTrack == null) return;
+    setDeckAudioMutation.mutate({
+      deckId,
+      audioTrack: {
+        libraryItemId: deckAudioTrack.libraryItemId,
+        volume: deckVolumePct / 100,
+        loop: deckLoop,
+        fadeOutMs: deckFadeMs > 0 ? deckFadeMs : null,
+      },
+      expectedVersion: deckVersion,
+    });
+  }
+
+  function openSlidePicker() {
+    setPickerTarget("slide");
+    setPickerOpen(true);
+  }
+
+  function openDeckPicker() {
+    setPickerTarget("deck");
+    setPickerOpen(true);
+  }
+
+  function handlePickerSelect(libraryItemId: number, title: string) {
+    if (pickerTarget === "slide") {
+      handleSlideAudioSelect(libraryItemId, title);
+    } else {
+      handleDeckAudioSelect(libraryItemId, title);
+    }
+  }
+
+  // ---------------------------------------------------------------------------
+  // Render
+  // ---------------------------------------------------------------------------
+
+  return (
+    <div className="space-y-5 p-3">
+      {/* ---- Per-slide audio ---- */}
+      <section aria-label="Slide audio">
+        <p className="text-sm font-medium mb-3">Slide Audio</p>
+
+        {slideId == null ? (
+          <p className="text-xs text-muted-foreground">
+            Select a slide to configure its audio.
+          </p>
+        ) : slideAudioTrack == null ? (
+          <div className="space-y-2">
+            <p className="text-xs text-muted-foreground">No audio configured for this slide.</p>
+            <Button
+              size="sm"
+              variant="outline"
+              onClick={openSlidePicker}
+              aria-label="Add audio"
+              data-testid="add-slide-audio-btn"
+            >
+              <Plus className="mr-1 h-3 w-3" />
+              Add Audio
+            </Button>
+          </div>
+        ) : (
+          <div className="space-y-3">
+            <div className="flex items-center gap-2">
+              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
+              <span className="text-sm truncate">{slideAudioTrack.title ?? `Audio #${slideAudioTrack.libraryItemId}`}</span>
+            </div>
+
+            {/* Volume */}
+            <div className="space-y-1">
+              <div className="flex items-center justify-between">
+                <Label className="text-xs">Volume</Label>
+                <span className="text-xs text-muted-foreground">{slideVolumePct}%</span>
+              </div>
+              <Slider
+                min={0}
+                max={100}
+                step={1}
+                value={[slideVolumePct]}
+                onValueChange={([v]) => setSlideVolumePct(v)}
+                aria-label="Slide audio volume"
+              />
+            </div>
+
+            {/* Start time */}
+            <div className="flex items-center gap-2">
+              <Label className="text-xs shrink-0">Start (s)</Label>
+              <Input
+                type="number"
+                min={0}
+                step={0.1}
+                value={slideStartSec}
+                onChange={(e) => setSlideStartSec(Number(e.target.value))}
+                className="h-7 text-xs"
+              />
+            </div>
+
+            {/* End time */}
+            <div className="space-y-1">
+              <div className="flex items-center gap-2">
+                <Switch
+                  checked={slidePlayToEnd}
+                  onCheckedChange={setSlidePlayToEnd}
+                  id="slide-play-to-end"
+                />
+                <Label htmlFor="slide-play-to-end" className="text-xs cursor-pointer">
+                  Play to end
+                </Label>
+              </div>
+              {!slidePlayToEnd && (
+                <div className="flex items-center gap-2">
+                  <Label className="text-xs shrink-0">End (s)</Label>
+                  <Input
+                    type="number"
+                    min={0}
+                    step={0.1}
+                    value={slideEndSec}
+                    onChange={(e) => setSlideEndSec(Number(e.target.value))}
+                    className="h-7 text-xs"
+                  />
+                </div>
+              )}
+            </div>
+
+            {/* Actions */}
+            <div className="flex gap-2">
+              <Button
+                size="sm"
+                variant="outline"
+                onClick={handleRemoveSlideAudio}
+                disabled={setSlideAudioMutation.isPending}
+                aria-label="Remove slide audio"
+                data-testid="remove-slide-audio-btn"
+              >
+                <Trash2 className="mr-1 h-3 w-3" />
+                Remove
+              </Button>
+              <Button
+                size="sm"
+                onClick={handleSaveSlideAudio}
+                disabled={setSlideAudioMutation.isPending}
+                data-testid="save-slide-audio-btn"
+              >
+                Save
+              </Button>
+            </div>
+          </div>
+        )}
+      </section>
+
+      <Separator />
+
+      {/* ---- Project-wide audio ---- */}
+      <section aria-label="Project audio">
+        <p className="text-sm font-medium mb-3">Project Audio</p>
+
+        {deckAudioTrack == null ? (
+          <div className="space-y-2">
+            <p className="text-xs text-muted-foreground">No project audio configured.</p>
+            <Button
+              size="sm"
+              variant="outline"
+              onClick={openDeckPicker}
+              aria-label="Add project audio"
+              data-testid="add-deck-audio-btn"
+            >
+              <Plus className="mr-1 h-3 w-3" />
+              Add Project Audio
+            </Button>
+          </div>
+        ) : (
+          <div className="space-y-3">
+            <div className="flex items-center gap-2">
+              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
+              <span className="text-sm truncate">{deckAudioTrack.title ?? `Audio #${deckAudioTrack.libraryItemId}`}</span>
+            </div>
+
+            {/* Volume */}
+            <div className="space-y-1">
+              <div className="flex items-center justify-between">
+                <Label className="text-xs">Volume</Label>
+                <span className="text-xs text-muted-foreground">{deckVolumePct}%</span>
+              </div>
+              <Slider
+                min={0}
+                max={100}
+                step={1}
+                value={[deckVolumePct]}
+                onValueChange={([v]) => setDeckVolumePct(v)}
+                aria-label="Project audio volume"
+              />
+            </div>
+
+            {/* Loop */}
+            <div className="flex items-center gap-2">
+              <Switch
+                checked={deckLoop}
+                onCheckedChange={setDeckLoop}
+                id="deck-loop"
+                aria-label="Loop"
+              />
+              <Label htmlFor="deck-loop" className="text-xs cursor-pointer">
+                Loop
+              </Label>
+            </div>
+
+            {/* Fade out */}
+            <div className="flex items-center gap-2">
+              <Label className="text-xs shrink-0">Fade out (ms)</Label>
+              <Input
+                type="number"
+                min={0}
+                step={100}
+                value={deckFadeMs}
+                onChange={(e) => setDeckFadeMs(Number(e.target.value))}
+                className="h-7 text-xs"
+                placeholder="0 = none"
+              />
+            </div>
+
+            {/* Actions */}
+            <div className="flex gap-2">
+              <Button
+                size="sm"
+                variant="outline"
+                onClick={handleRemoveDeckAudio}
+                disabled={setDeckAudioMutation.isPending}
+                aria-label="Remove project audio"
+                data-testid="remove-deck-audio-btn"
+              >
+                <Trash2 className="mr-1 h-3 w-3" />
+                Remove
+              </Button>
+              <Button
+                size="sm"
+                onClick={handleSaveDeckAudio}
+                disabled={setDeckAudioMutation.isPending}
+                data-testid="save-deck-audio-btn"
+              >
+                Save
+              </Button>
+            </div>
+          </div>
+        )}
+      </section>
+
+      {/* ---- Audio picker dialog ---- */}
+      <AudioPickerDialog
+        open={pickerOpen}
+        onClose={() => setPickerOpen(false)}
+        onSelect={handlePickerSelect}
+      />
+    </div>
+  );
+}
