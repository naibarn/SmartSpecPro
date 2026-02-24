import { useEffect, useRef, useState } from "react";
import { Music, Trash2, Plus, Play, Pause, Search, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { AudioTrackInput, ProjectAudioTrackInput } from "@shared/presentation/contracts";

// ---------------------------------------------------------------------------
// Extended types — add optional display title (not persisted to DB)
// ---------------------------------------------------------------------------

export type AudioTrackWithTitle = AudioTrackInput & { title?: string };
export type ProjectAudioTrackWithTitle = ProjectAudioTrackInput & { title?: string };

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface SlideAudioPanelProps {
  /** ID of the currently selected slide. null if no slide is selected. */
  slideId: number | null;
  /** Version of the currently selected slide (for optimistic locking). */
  slideVersion: number | null;
  /** Current audio track on the selected slide, or null. */
  slideAudioTrack: AudioTrackWithTitle | null;
  /** ID of the deck. */
  deckId: number;
  /** Version of the deck (for optimistic locking). */
  deckVersion: number;
  /** Current project-wide audio track on the deck, or null. */
  deckAudioTrack: ProjectAudioTrackWithTitle | null;
}

// ---------------------------------------------------------------------------
// AudioPickerDialog — full browsable library with search + preview
// ---------------------------------------------------------------------------

interface AudioPickerDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called when user confirms a selection */
  onSelect: (libraryItemId: number, title: string) => void;
  /** Whether we're picking for the current slide or the whole project */
  target: "slide" | "deck";
}

function AudioPickerDialog({ open, onClose, onSelect, target }: AudioPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio + reset on dialog close
  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingId(null);
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Debounce search input
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchQuery = trpc.library.search.useQuery(
    {
      query: debouncedQuery || undefined,
      filters: { itemType: "audio" },
      limit: 40,
    },
    { enabled: open },
  );

  const results = searchQuery.data?.results ?? [];

  function handleTogglePlay(itemId: number, url: string) {
    if (playingId === itemId) {
      // Pause currently playing track
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      // Stop previous track and start new one
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.play().catch(() => {
        setPlayingId(null);
      });
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(itemId);
    }
  }

  function handleAdd(itemId: number, title: string) {
    // Stop preview before confirming
    audioRef.current?.pause();
    setPlayingId(null);
    onSelect(itemId, title);
    onClose();
  }

  const dialogTitle = target === "slide" ? "Add Audio to Slide" : "Add Background Audio";
  const addLabel = target === "slide" ? "Add to Slide" : "Set as Background";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg flex flex-col gap-4 max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription className="sr-only">
            Browse, search and preview audio files from your media library, then click Add.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Search audio files..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            data-testid="audio-picker-search"
          />
        </div>

        {/* Results list */}
        <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5 min-h-0">
          {searchQuery.isLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {!searchQuery.isLoading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Music className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {query ? "No audio files match your search." : "No audio files in your library yet."}
              </p>
            </div>
          )}

          {results.map((item) => {
            const isPlaying = playingId === item.item_id;
            const canPreview = !!item.source_url && item.status === "ready";
            const subtitle = [
              item.model_name ?? item.provider_name,
              new Date(item.created_at).toLocaleDateString(),
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={item.item_id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  isPlaying
                    ? "border-primary/40 bg-primary/5"
                    : "border-transparent hover:border-border hover:bg-muted/40",
                )}
                data-testid={`audio-picker-item-${item.item_id}`}
              >
                {/* Play / Pause preview button */}
                <button
                  type="button"
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isPlaying
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary",
                    !canPreview && "cursor-not-allowed opacity-40",
                  )}
                  disabled={!canPreview}
                  onClick={() => canPreview && handleTogglePlay(item.item_id, item.source_url!)}
                  aria-label={isPlaying ? "Pause preview" : "Play preview"}
                  title={canPreview ? (isPlaying ? "Pause" : "Preview") : "Preview unavailable"}
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 translate-x-px" />
                  )}
                </button>

                {/* Title + metadata */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                  {subtitle && (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                  )}
                </div>

                {/* Add button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => handleAdd(item.item_id, item.title)}
                  data-testid={`audio-picker-add-${item.item_id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            );
          })}
        </div>

        {/* Footer — result count + hint */}
        {!searchQuery.isLoading && results.length > 0 && (
          <p className="text-xs text-muted-foreground shrink-0">
            {results.length} result{results.length !== 1 ? "s" : ""}
            {" · "}Click <Play className="inline h-3 w-3" /> to preview, then{" "}
            <strong className="font-medium">{addLabel}</strong>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SlideAudioPanel({
  slideId,
  slideVersion,
  slideAudioTrack,
  deckId,
  deckVersion,
  deckAudioTrack,
}: SlideAudioPanelProps) {
  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"slide" | "deck">("slide");

  // Per-slide audio draft state (local, not persisted until Save/Select)
  const [slideVolumePct, setSlideVolumePct] = useState<number>(
    Math.round((slideAudioTrack?.volume ?? 1) * 100),
  );
  const [slideStartSec, setSlideStartSec] = useState<number>(
    (slideAudioTrack?.startAtMs ?? 0) / 1000,
  );
  const [slidePlayToEnd, setSlidePlayToEnd] = useState<boolean>(
    slideAudioTrack == null || slideAudioTrack.endAtMs == null,
  );
  const [slideEndSec, setSlideEndSec] = useState<number>(
    (slideAudioTrack?.endAtMs ?? 0) / 1000,
  );

  // Project-wide audio draft state
  const [deckVolumePct, setDeckVolumePct] = useState<number>(
    Math.round((deckAudioTrack?.volume ?? 1) * 100),
  );
  const [deckLoop, setDeckLoop] = useState<boolean>(deckAudioTrack?.loop ?? false);
  const [deckFadeMs, setDeckFadeMs] = useState<number>(deckAudioTrack?.fadeOutMs ?? 0);

  // M1: sync draft state when slideId or slideAudioTrack changes
  useEffect(() => {
    setSlideVolumePct(Math.round((slideAudioTrack?.volume ?? 1) * 100));
    setSlideStartSec((slideAudioTrack?.startAtMs ?? 0) / 1000);
    setSlidePlayToEnd(slideAudioTrack == null || slideAudioTrack.endAtMs == null);
    setSlideEndSec((slideAudioTrack?.endAtMs ?? 0) / 1000);
  }, [slideId, slideAudioTrack]); // M1: slideId added so state resets on slide change

  useEffect(() => {
    setDeckVolumePct(Math.round((deckAudioTrack?.volume ?? 1) * 100));
    setDeckLoop(deckAudioTrack?.loop ?? false);
    setDeckFadeMs(deckAudioTrack?.fadeOutMs ?? 0);
  }, [deckAudioTrack]);

  // M3: Detect version conflict errors and offer clearer message
  function onSlideAudioError(err: { message: string; data?: { code?: string } | null }) {
    if (err.data?.code === "CONFLICT") {
      toast.error("Slide was modified by another session. Please reload and try again.");
    } else {
      toast.error(`Failed to update slide audio: ${err.message}`);
    }
  }

  function onDeckAudioError(err: { message: string; data?: { code?: string } | null }) {
    if (err.data?.code === "CONFLICT") {
      toast.error("Deck was modified by another session. Please reload and try again.");
    } else {
      toast.error(`Failed to update project audio: ${err.message}`);
    }
  }

  // Mutations
  const setSlideAudioMutation = trpc.presentation.setSlideAudio.useMutation({
    onError: onSlideAudioError,
  });

  const setDeckAudioMutation = trpc.presentation.setDeckAudio.useMutation({
    onError: onDeckAudioError,
  });

  // H3: helper to compute endAtMs — guards against accidental endAtMs: 0
  function computeSlideEndAtMs(): number | null {
    if (slidePlayToEnd) return null;
    if (slideEndSec <= 0) return null; // H3: don't send 0 ms; treat as "play to end"
    return Math.round(slideEndSec * 1000);
  }

  // H2: build slide AudioTrackInput WITHOUT title — schema is .strict()
  function buildSlideAudioTrackInput(libraryItemId: number): AudioTrackInput {
    return {
      libraryItemId,
      volume: slideVolumePct / 100,
      startAtMs: Math.round(slideStartSec * 1000),
      endAtMs: computeSlideEndAtMs(),
    };
  }

  // H2: build deck ProjectAudioTrackInput WITHOUT title — schema is .strict()
  function buildDeckAudioTrackInput(libraryItemId: number): ProjectAudioTrackInput {
    return {
      libraryItemId,
      volume: deckVolumePct / 100,
      loop: deckLoop,
      fadeOutMs: deckFadeMs > 0 ? deckFadeMs : null,
    };
  }

  // Handlers — per-slide
  function handleSlideAudioSelect(libraryItemId: number, _title: string) {
    if (slideId == null || slideVersion == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: buildSlideAudioTrackInput(libraryItemId),
      expectedVersion: slideVersion,
    });
  }

  function handleRemoveSlideAudio() {
    if (slideId == null || slideVersion == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: null,
      expectedVersion: slideVersion,
    });
  }

  function handleSaveSlideAudio() {
    if (slideId == null || slideVersion == null || slideAudioTrack == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: buildSlideAudioTrackInput(slideAudioTrack.libraryItemId),
      expectedVersion: slideVersion,
    });
  }

  // Handlers — deck
  function handleDeckAudioSelect(libraryItemId: number, _title: string) {
    setDeckAudioMutation.mutate({
      deckId,
      projectAudioTrack: buildDeckAudioTrackInput(libraryItemId),
      expectedVersion: deckVersion,
    });
  }

  function handleRemoveDeckAudio() {
    setDeckAudioMutation.mutate({
      deckId,
      projectAudioTrack: null,
      expectedVersion: deckVersion,
    });
  }

  function handleSaveDeckAudio() {
    if (deckAudioTrack == null) return;
    setDeckAudioMutation.mutate({
      deckId,
      projectAudioTrack: buildDeckAudioTrackInput(deckAudioTrack.libraryItemId),
      expectedVersion: deckVersion,
    });
  }

  function openSlidePicker() {
    setPickerTarget("slide");
    setPickerOpen(true);
  }

  function openDeckPicker() {
    setPickerTarget("deck");
    setPickerOpen(true);
  }

  function handlePickerSelect(libraryItemId: number, title: string) {
    if (pickerTarget === "slide") {
      handleSlideAudioSelect(libraryItemId, title);
    } else {
      handleDeckAudioSelect(libraryItemId, title);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5 p-3">
      {/* ---- Per-slide audio ---- */}
      <section aria-label="Slide audio">
        <p className="text-sm font-medium mb-3">Slide Audio</p>

        {slideId == null ? (
          <p className="text-xs text-muted-foreground">
            Select a slide to configure its audio.
          </p>
        ) : slideAudioTrack == null ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No audio configured for this slide.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={openSlidePicker}
              aria-label="Add audio"
              data-testid="add-slide-audio-btn"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Audio
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate flex-1">
                {slideAudioTrack.title ?? `Audio #${slideAudioTrack.libraryItemId}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={openSlidePicker}
                title="Change audio"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {/* Volume */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Volume</Label>
                <span className="text-xs text-muted-foreground">{slideVolumePct}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[slideVolumePct]}
                onValueChange={([v]) => setSlideVolumePct(v)}
                aria-label="Slide audio volume"
              />
            </div>

            {/* Start time */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Start (s)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={slideStartSec}
                onChange={(e) => setSlideStartSec(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>

            {/* End time */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={slidePlayToEnd}
                  onCheckedChange={setSlidePlayToEnd}
                  id="slide-play-to-end"
                />
                <Label htmlFor="slide-play-to-end" className="text-xs cursor-pointer">
                  Play to end
                </Label>
              </div>
              {!slidePlayToEnd && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">End (s)</Label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={slideEndSec}
                    onChange={(e) => setSlideEndSec(Number(e.target.value))}
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveSlideAudio}
                disabled={setSlideAudioMutation.isPending}
                aria-label="Remove slide audio"
                data-testid="remove-slide-audio-btn"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSlideAudio}
                disabled={setSlideAudioMutation.isPending}
                aria-label="Save slide audio"
                data-testid="save-slide-audio-btn"
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </section>

      <Separator />

      {/* ---- Project-wide audio ---- */}
      <section aria-label="Project audio">
        <p className="text-sm font-medium mb-3">Project Audio</p>

        {deckAudioTrack == null ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No project audio configured.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={openDeckPicker}
              aria-label="Add project audio"
              data-testid="add-deck-audio-btn"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Project Audio
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate flex-1">
                {deckAudioTrack.title ?? `Audio #${deckAudioTrack.libraryItemId}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={openDeckPicker}
                title="Change background audio"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {/* Volume */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Volume</Label>
                <span className="text-xs text-muted-foreground">{deckVolumePct}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[deckVolumePct]}
                onValueChange={([v]) => setDeckVolumePct(v)}
                aria-label="Project audio volume"
              />
            </div>

            {/* Loop */}
            <div className="flex items-center gap-2">
              <Switch
                checked={deckLoop}
                onCheckedChange={setDeckLoop}
                id="deck-loop"
                aria-label="Loop"
              />
              <Label htmlFor="deck-loop" className="text-xs cursor-pointer">
                Loop
              </Label>
            </div>

            {/* Fade out */}
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Fade out (ms)</Label>
              <Input
                type="number"
                min={0}
                step={100}
                value={deckFadeMs}
                onChange={(e) => setDeckFadeMs(Number(e.target.value))}
                className="h-7 text-xs"
                placeholder="0 = none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveDeckAudio}
                disabled={setDeckAudioMutation.isPending}
                aria-label="Remove project audio"
                data-testid="remove-deck-audio-btn"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove
              </Button>
              <Button
                size="sm"
                onClick={handleSaveDeckAudio}
                disabled={setDeckAudioMutation.isPending}
                aria-label="Save project audio"
                data-testid="save-deck-audio-btn"
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ---- Audio picker dialog ---- */}
      <AudioPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickerSelect}
        target={pickerTarget}
      />
    </div>
  );
}
