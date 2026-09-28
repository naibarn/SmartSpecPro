/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1, §4.4/§4.5.
 *
 * Time ruler: tick marks + mm:ss labels, click-to-seek (reports the clicked
 * ms upward — the shell drives the Remotion `<Player>` with it via
 * `playerRef.seekTo`, this component owns no player reference).
 *
 * This component renders at its full, unclamped content width
 * (`contentDurationMs * pxPerSecond/1000`) and is meant to be mounted as a
 * child of the SAME horizontally-scrolling container `TimelineTracks` uses
 * (see `Timeline.tsx`) — one native scroll region instead of two elements
 * mirrored via JS is a deliberate simplification of
 * `videoeditor/Timeline.tsx:455-460`'s two-div + manual `scrollLeft` mirror
 * (ported logic, not the component): that pattern exists there because the
 * ruler needs to stay vertically pinned while a tall track list scrolls
 * vertically underneath it. This timeline never scrolls vertically in P1
 * (§4.16 — a handful of fixed-height rows, no vertical windowing needed), so
 * there is nothing to pin against and a single shared scroll container gives
 * ruler/lane alignment "for free" from the browser instead of by hand.
 */
import type { MouseEvent } from "react";

import { Text } from "@astryxdesign/core/Text";

function formatTimeLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Same stepping convention as `VideoEditorPhase3.tsx:3437-3446` (×1.2,
 *  clamp 10-200 px/sec) — the tick interval just needs to stay readable at
 *  every zoom level, so the same three-tier threshold is ported here. */
export function tickIntervalMs(pxPerSecond: number): number {
  if (pxPerSecond > 50) return 1000;
  if (pxPerSecond > 20) return 5000;
  return 10000;
}

export const RULER_HEIGHT_PX = 32;

export interface TimelineRulerProps {
  /** Total scrollable content span, in ms — from
   *  `timelineContentDurationMs(projection)`, never clamped to the nominal
   *  document duration (§3.2 — a clip may run longer). */
  contentDurationMs: number;
  pxPerSecond: number;
  onSeek: (ms: number) => void;
}

export function TimelineRuler({ contentDurationMs, pxPerSecond, onSeek }: TimelineRulerProps) {
  const pxPerMs = pxPerSecond / 1000;
  const intervalMs = tickIntervalMs(pxPerSecond);
  const contentWidthPx = Math.max(1, contentDurationMs * pxPerMs);

  const ticks: { ms: number; x: number }[] = [];
  for (let ms = 0; ms <= contentDurationMs; ms += intervalMs) {
    ticks.push({ ms, x: ms * pxPerMs });
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const ms = Math.max(0, Math.min(contentDurationMs, localX / pxPerMs));
    onSeek(Math.round(ms));
  }

  return (
    <div
      data-testid="vs-timeline-ruler"
      onClick={handleClick}
      className="relative border-b border-[var(--color-border,#2a2a2a)] cursor-pointer select-none"
      style={{ height: RULER_HEIGHT_PX, width: contentWidthPx }}
      role="slider"
      aria-label="Timeline ruler"
      aria-valuemin={0}
      aria-valuemax={contentDurationMs}
    >
      {ticks.map(({ ms, x }) => (
        <div key={ms} className="absolute top-0 flex flex-col items-start" style={{ left: x }}>
          <div className="h-2 w-px bg-current opacity-50" />
          <Text type="supporting" color="secondary">
            {formatTimeLabel(ms)}
          </Text>
        </div>
      ))}
    </div>
  );
}
