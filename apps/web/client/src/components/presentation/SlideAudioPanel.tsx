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
import { Badge } from "@/components/ui/badge";
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
  /** Called after audio is successfully saved or removed, to refresh parent data. */
  onAudioChanged?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

const AUDIO_SLIDER_CLASS = [
  "h-6",
  "[&_[data-slot=slider-track]]:h-2",
  "[&_[data-slot=slider-track]]:rounded-full",
  "[&_[data-slot=slider-track]]:border",
  "[&_[data-slot=slider-track]]:border-slate-400/80",
  "[&_[data-slot=slider-track]]:bg-slate-200",
  "[&_[data-slot=slider-range]]:bg-sky-500",
  "[&_[data-slot=slider-thumb]]:size-5",
  "[&_[data-slot=slider-thumb]]:border-sky-500",
  "[&_[data-slot=slider-thumb]]:bg-white",
].join(" ");

function extractDurationSeconds(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const source = metadata as Record<string, unknown>;
  const durationMs = source.durationMs;
  if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs / 1000;
  }
  const durationSec = source.durationSeconds ?? source.durationSec ?? source.duration;
  if (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0) {
    return durationSec;
  }
  return null;
}

function useMediaDurationSeconds(sourceUrl: string | null | undefined, fallbackSec: number | null): number | null {
  const [durationSec, setDurationSec] = useState<number | null>(fallbackSec);

  useEffect(() => {
    setDurationSec(fallbackSec);
  }, [fallbackSec, sourceUrl]);

  useEffect(() => {
    if (!sourceUrl) {
      return;
    }

    let cancelled = false;
    const media = new Audio();
    media.preload = "metadata";
    media.src = sourceUrl;

    const handleLoadedMetadata = () => {
      if (cancelled) return;
      if (Number.isFinite(media.duration) && media.duration > 0) {
        setDurationSec(media.duration);
      }
    };

    media.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      cancelled = true;
      media.removeEventListener("loadedmetadata", handleLoadedMetadata);
      media.src = "";
    };
  }, [sourceUrl]);

  return durationSec;
}

interface AudioTrimTimelineProps {
  idPrefix: string;
  durationSec: number | null;
  startSec: number;
  endSec: number;
  playToEnd: boolean;
  onStartSecChange: (next: number) => void;
  onEndSecChange: (next: number) => void;
  onPlayToEndChange: (next: boolean) => void;
}

function AudioTrimTimeline({
  idPrefix,
  durationSec,
  startSec,
  endSec,
  playToEnd,
  onStartSecChange,
  onEndSecChange,
  onPlayToEndChange,
}: AudioTrimTimelineProps) {
  const maxSec = Math.max(
    0.5,
    durationSec ?? 0,
    startSec + 0.5,
    endSec > 0 ? endSec : 0,
  );
  const boundedStart = clamp(startSec, 0, maxSec);
  const boundedEnd = clamp(playToEnd ? maxSec : Math.max(endSec, boundedStart), boundedStart, maxSec);
  const playDuration = Math.max(0, boundedEnd - boundedStart);

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Trim</Label>
        <span className="text-[11px] text-muted-foreground">
          {durationSec != null ? `Audio: ${formatDuration(durationSec)}` : "Audio: unknown length"}
        </span>
      </div>
      <Slider
        min={0}
        max={maxSec}
        step={0.1}
        className={AUDIO_SLIDER_CLASS}
        value={[boundedStart, boundedEnd]}
        onValueChange={(values) => {
          if (values.length < 2) return;
          const nextStart = clamp(values[0], 0, maxSec);
          const nextEnd = clamp(values[1], nextStart, maxSec);
          if (playToEnd && nextEnd < maxSec) {
            onPlayToEndChange(false);
          }
          onStartSecChange(nextStart);
          onEndSecChange(playToEnd && nextEnd >= maxSec ? maxSec : nextEnd);
        }}
        aria-label={`${idPrefix}-trim-slider`}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Start (s)</Label>
          <Input
            type="number"
            min={0}
            max={maxSec}
            step={0.1}
            value={Number.isFinite(boundedStart) ? boundedStart.toFixed(1) : "0.0"}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              if (!Number.isFinite(parsed)) return;
              onStartSecChange(clamp(parsed, 0, maxSec));
            }}
            className="h-7 bg-white text-xs"
            aria-label={`${idPrefix}-trim-start-seconds`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">End (s)</Label>
          <Input
            type="number"
            min={boundedStart}
            max={maxSec}
            step={0.1}
            value={Number.isFinite(boundedEnd) ? boundedEnd.toFixed(1) : "0.0"}
            onChange={(event) => {
              const parsed = Number.parseFloat(event.target.value);
              if (!Number.isFinite(parsed)) return;
              if (playToEnd) onPlayToEndChange(false);
              onEndSecChange(clamp(parsed, boundedStart, maxSec));
            }}
            className="h-7 bg-white text-xs"
            aria-label={`${idPrefix}-trim-end-seconds`}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={playToEnd}
          onCheckedChange={onPlayToEndChange}
          id={`${idPrefix}-play-to-end`}
        />
        <Label htmlFor={`${idPrefix}-play-to-end`} className="cursor-pointer text-xs">
          Play to end
        </Label>
      </div>
      {playToEnd ? (
        <p className="text-[11px] text-slate-500">
          Playing to audio end. Edit End (s) or drag the end handle to set a custom end time.
        </p>
      ) : null}
      <div className="grid grid-cols-3 gap-1 text-[11px]">
        <span className="rounded bg-slate-100 px-1.5 py-0.5">Start {formatDuration(boundedStart)}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5">End {formatDuration(boundedEnd)}</span>
        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900">Play {formatDuration(playDuration)}</span>
      </div>
    </div>
  );
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

interface AudioLibraryResultItemLike {
  id: number;
  title: string;
  status?: string;
  source_url?: string | null;
  created_at?: string;
  owner_user_id?: number | null;
  access_source?: string | null;
  metadata?: Record<string, unknown>;
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

  const listQuery = trpc.library.listDocuments.useQuery(
    {
      query: debouncedQuery || undefined,
      scope: "all",
      sort: "updated_desc",
      limit: 40,
      offset: 0,
      filters: { itemType: "audio" },
    },
    { enabled: open },
  );

  const results = (listQuery.data?.results ?? []) as AudioLibraryResultItemLike[];

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
        <p className="text-xs text-muted-foreground">
          Source includes your Library and files shared via Group.
        </p>

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
          {listQuery.isLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          )}

          {!listQuery.isLoading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Music className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {query ? "No audio files match your search." : "No audio files in Library or Shared yet."}
              </p>
            </div>
          )}

          {results.map((item) => {
            const isPlaying = playingId === item.id;
            const canPreview = !!item.source_url && item.status === "ready";
            const accessSource = String(item.access_source || "").toLowerCase();
            const sourceLabel = accessSource === "shared_group" || accessSource === "shared_direct"
              ? "Shared"
              : "Library";
            const subtitle = [
              item.metadata && typeof item.metadata === "object"
                ? String((item.metadata.model_name ?? item.metadata.model ?? "") || "").trim()
                : "",
              item.created_at ? new Date(item.created_at).toLocaleDateString() : "",
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={item.id}
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
                  onClick={() => canPreview && handleTogglePlay(item.id, item.source_url!)}
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
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium leading-tight">{item.title}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "h-5 rounded px-1.5 text-[10px] font-medium uppercase tracking-wide",
                        sourceLabel === "Shared"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-slate-300 bg-slate-100 text-slate-700",
                      )}
                    >
                      {sourceLabel}
                    </Badge>
                  </div>
                  {subtitle && (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                  )}
                </div>

                {/* Add button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => handleAdd(item.id, item.title)}
                  data-testid={`audio-picker-add-${item.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            );
          })}
        </div>

        {/* Footer — result count + hint */}
        {!listQuery.isLoading && results.length > 0 && (
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
  onAudioChanged,
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
  const [deckStartSec, setDeckStartSec] = useState<number>(
    (deckAudioTrack?.startAtMs ?? 0) / 1000,
  );
  const [deckPlayToEnd, setDeckPlayToEnd] = useState<boolean>(
    deckAudioTrack == null || deckAudioTrack.endAtMs == null,
  );
  const [deckEndSec, setDeckEndSec] = useState<number>(
    (deckAudioTrack?.endAtMs ?? 0) / 1000,
  );
  const [deckLoop, setDeckLoop] = useState<boolean>(deckAudioTrack?.loop ?? false);
  const [deckFadeMs, setDeckFadeMs] = useState<number>(deckAudioTrack?.fadeOutMs ?? 0);
  const [previewTarget, setPreviewTarget] = useState<"slide" | "deck" | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideAudioItemQuery = trpc.library.getItem.useQuery(
    { id: slideAudioTrack?.libraryItemId ?? 0 },
    { enabled: Boolean(slideAudioTrack?.libraryItemId) },
  );
  const deckAudioItemQuery = trpc.library.getItem.useQuery(
    { id: deckAudioTrack?.libraryItemId ?? 0 },
    { enabled: Boolean(deckAudioTrack?.libraryItemId) },
  );

  const slideAudioSourceUrl = slideAudioItemQuery.data?.sourceUrl ?? null;
  const deckAudioSourceUrl = deckAudioItemQuery.data?.sourceUrl ?? null;
  const slideAudioDurationSec = useMediaDurationSeconds(
    slideAudioSourceUrl,
    extractDurationSeconds(slideAudioItemQuery.data?.metadata),
  );
  const deckAudioDurationSec = useMediaDurationSeconds(
    deckAudioSourceUrl,
    extractDurationSeconds(deckAudioItemQuery.data?.metadata),
  );

  // M1: sync draft state when slideId or slideAudioTrack changes
  useEffect(() => {
    setSlideVolumePct(Math.round((slideAudioTrack?.volume ?? 1) * 100));
    setSlideStartSec((slideAudioTrack?.startAtMs ?? 0) / 1000);
    setSlidePlayToEnd(slideAudioTrack == null || slideAudioTrack.endAtMs == null);
    setSlideEndSec((slideAudioTrack?.endAtMs ?? 0) / 1000);
  }, [slideId, slideAudioTrack]); // M1: slideId added so state resets on slide change

  useEffect(() => {
    setDeckVolumePct(Math.round((deckAudioTrack?.volume ?? 1) * 100));
    setDeckStartSec((deckAudioTrack?.startAtMs ?? 0) / 1000);
    setDeckPlayToEnd(deckAudioTrack == null || deckAudioTrack.endAtMs == null);
    setDeckEndSec((deckAudioTrack?.endAtMs ?? 0) / 1000);
    setDeckLoop(deckAudioTrack?.loop ?? false);
    setDeckFadeMs(deckAudioTrack?.fadeOutMs ?? 0);
  }, [deckAudioTrack]);

  useEffect(() => {
    return () => {
      if (previewStopTimerRef.current !== null) {
        clearTimeout(previewStopTimerRef.current);
        previewStopTimerRef.current = null;
      }
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

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
    onSuccess: (_data, variables) => {
      toast.success(variables.audioTrack ? "Slide audio saved." : "Slide audio removed.");
      onAudioChanged?.();
    },
  });

  const setDeckAudioMutation = trpc.presentation.setDeckAudio.useMutation({
    onError: onDeckAudioError,
    onSuccess: (_data, variables) => {
      toast.success(
        variables.projectAudioTrack ? "Project audio saved." : "Project audio removed.",
      );
      onAudioChanged?.();
    },
  });

  // H3: helper to compute endAtMs — guards against accidental endAtMs: 0
  function computeSlideEndAtMs(): number | null {
    if (slidePlayToEnd) return null;
    if (slideEndSec <= slideStartSec) return null;
    return Math.round(slideEndSec * 1000);
  }

  function computeDeckEndAtMs(): number | null {
    if (deckPlayToEnd) return null;
    if (deckEndSec <= deckStartSec) return null;
    return Math.round(deckEndSec * 1000);
  }

  function handleSlidePlayToEndChange(next: boolean) {
    setSlidePlayToEnd(next);
    if (!next) {
      setSlideEndSec((current) => {
        const durationFallback = slideAudioDurationSec ?? 0;
        const minEnd = slideStartSec + 0.5;
        return Math.max(current, durationFallback, minEnd);
      });
      return;
    }
    if (slideAudioDurationSec != null) {
      setSlideEndSec(slideAudioDurationSec);
    }
  }

  function handleDeckPlayToEndChange(next: boolean) {
    setDeckPlayToEnd(next);
    if (!next) {
      setDeckEndSec((current) => {
        const durationFallback = deckAudioDurationSec ?? 0;
        const minEnd = deckStartSec + 0.5;
        return Math.max(current, durationFallback, minEnd);
      });
      return;
    }
    if (deckAudioDurationSec != null) {
      setDeckEndSec(deckAudioDurationSec);
    }
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
      startAtMs: Math.round(deckStartSec * 1000),
      endAtMs: computeDeckEndAtMs(),
      loop: deckLoop,
      fadeOutMs: deckFadeMs > 0 ? deckFadeMs : null,
    };
  }

  function stopPreviewAudio() {
    if (previewStopTimerRef.current !== null) {
      clearTimeout(previewStopTimerRef.current);
      previewStopTimerRef.current = null;
    }
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPreviewTarget(null);
  }

  function togglePreviewAudio(
    target: "slide" | "deck",
    sourceUrl: string | null,
    startSeconds: number,
    endSeconds: number | null,
    volumePercent: number,
  ) {
    if (!sourceUrl) {
      toast.error("Audio source unavailable for preview.");
      return;
    }
    if (previewTarget === target) {
      stopPreviewAudio();
      return;
    }

    stopPreviewAudio();
    const audio = new Audio(sourceUrl);
    audio.volume = clamp(volumePercent, 0, 100) / 100;
    audio.currentTime = Math.max(0, startSeconds);
    previewAudioRef.current = audio;
    setPreviewTarget(target);

    const playbackDurationMs =
      endSeconds != null
        ? Math.max(0, Math.round((endSeconds - startSeconds) * 1000))
        : null;

    if (playbackDurationMs != null && playbackDurationMs > 0) {
      previewStopTimerRef.current = setTimeout(() => {
        stopPreviewAudio();
      }, playbackDurationMs);
    }

    audio.onended = () => {
      stopPreviewAudio();
    };
    audio.play().catch(() => {
      stopPreviewAudio();
      toast.error("Unable to preview this audio.");
    });
  }

  // Handlers — per-slide
  // NOTE: expectedVersion must be deckVersion (not slideVersion) because the
  // backend's updateSlideAudioTrack calls ensureExpectedDeckVersion(deck, ...).
  function handleSlideAudioSelect(libraryItemId: number, _title: string) {
    if (slideId == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: buildSlideAudioTrackInput(libraryItemId),
      expectedVersion: deckVersion,
    });
  }

  function handleRemoveSlideAudio() {
    if (slideId == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: null,
      expectedVersion: deckVersion,
    });
  }

  function handleSaveSlideAudio() {
    if (slideId == null || slideAudioTrack == null) return;
    setSlideAudioMutation.mutate({
      slideId,
      deckId,
      audioTrack: buildSlideAudioTrackInput(slideAudioTrack.libraryItemId),
      expectedVersion: deckVersion,
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
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate flex-1">
                {slideAudioTrack.title
                  ?? slideAudioItemQuery.data?.title
                  ?? `Audio #${slideAudioTrack.libraryItemId}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => togglePreviewAudio(
                  "slide",
                  slideAudioSourceUrl,
                  slideStartSec,
                  slidePlayToEnd ? null : Math.max(slideEndSec, slideStartSec),
                  slideVolumePct,
                )}
                title={previewTarget === "slide" ? "Stop preview" : "Preview current trim"}
                aria-label={previewTarget === "slide" ? "Stop slide audio preview" : "Preview slide audio trim"}
              >
                {previewTarget === "slide" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
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
                className={AUDIO_SLIDER_CLASS}
                min={0}
                max={100}
                step={1}
                value={[slideVolumePct]}
                onValueChange={([v]) => setSlideVolumePct(v)}
                aria-label="Slide audio volume"
              />
            </div>

            <AudioTrimTimeline
              idPrefix="slide-audio"
              durationSec={slideAudioDurationSec}
              startSec={slideStartSec}
              endSec={slideEndSec}
              playToEnd={slidePlayToEnd}
              onStartSecChange={(next) => {
                setSlideStartSec(next);
                if (!slidePlayToEnd) {
                  setSlideEndSec((current) => Math.max(current, next));
                }
              }}
              onEndSecChange={setSlideEndSec}
              onPlayToEndChange={handleSlidePlayToEndChange}
            />

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
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate flex-1">
                {deckAudioTrack.title
                  ?? deckAudioItemQuery.data?.title
                  ?? `Audio #${deckAudioTrack.libraryItemId}`}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => togglePreviewAudio(
                  "deck",
                  deckAudioSourceUrl,
                  deckStartSec,
                  deckPlayToEnd ? null : Math.max(deckEndSec, deckStartSec),
                  deckVolumePct,
                )}
                title={previewTarget === "deck" ? "Stop preview" : "Preview current trim"}
                aria-label={previewTarget === "deck" ? "Stop project audio preview" : "Preview project audio trim"}
              >
                {previewTarget === "deck" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              </Button>
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
                className={AUDIO_SLIDER_CLASS}
                min={0}
                max={100}
                step={1}
                value={[deckVolumePct]}
                onValueChange={([v]) => setDeckVolumePct(v)}
                aria-label="Project audio volume"
              />
            </div>

            <AudioTrimTimeline
              idPrefix="deck-audio"
              durationSec={deckAudioDurationSec}
              startSec={deckStartSec}
              endSec={deckEndSec}
              playToEnd={deckPlayToEnd}
              onStartSecChange={(next) => {
                setDeckStartSec(next);
                if (!deckPlayToEnd) {
                  setDeckEndSec((current) => Math.max(current, next));
                }
              }}
              onEndSecChange={setDeckEndSec}
              onPlayToEndChange={handleDeckPlayToEndChange}
            />

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
