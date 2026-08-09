/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P2, §4.5/G7/AC15.
 * Undo/redo for the timeline editor, wrapping the existing, TESTED
 * `CommandBus<State>` (`presentation-canvas/commands/CommandBus.ts`) wholesale
 * per §4.3's reuse map — this file adds no new undo algorithm, only a React
 * hook surface + gesture-id bookkeeping over it.
 *
 * **Depth ≥50 (G7):** `CommandBus`'s `undoStack`/`redoStack` are plain
 * unbounded arrays with no cap of their own, so "at least 50 undo levels" is
 * satisfied trivially without this file adding any trimming logic — capping
 * would only ever REDUCE the depth below what `CommandBus` already provides
 * for free.
 *
 * **One drag = one undo step (G7/AC15):** `CommandBus.executeAndMerge`
 * already implements gesture coalescing keyed by `command.id` (first call in
 * a group pushes the pre-gesture state; later calls with the same id reuse
 * it). This hook's `beginGesture`/`endGesture` just remember which id is
 * "currently open" so a caller (`useClipDrag`) doesn't have to thread a
 * gesture id through every intermediate `apply()` call during a drag —
 * `apply()` without an explicit `{ merge }` option automatically merges into
 * whatever gesture is open, and is a normal discrete undo step otherwise.
 */
import { useCallback, useRef, useState } from "react";

import { CommandBus, type CanvasCommand } from "@/presentation-canvas/commands/CommandBus";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

export type TimelineEditOperation = (
  document: VideoProjectDocument,
) => VideoProjectDocument;

export interface ApplyOptions {
  /** Explicit merge-group id, overriding whatever gesture `beginGesture` may
   *  have opened. Most callers should just call `beginGesture`/`endGesture`
   *  around a drag and never pass this. */
  merge?: string;
}

export interface UseTimelineHistoryResult {
  document: VideoProjectDocument;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Runs `op(document)` and pushes ONE new undo entry, unless a gesture is
   *  currently open (`beginGesture`) or `options.merge` is given, in which
   *  case it coalesces into that gesture's single entry. Returns the new
   *  document (also available afterward via the `document` field on the
   *  hook's next render). */
  apply: (op: TimelineEditOperation, options?: ApplyOptions) => VideoProjectDocument;
  /** Selection-only or other changes that must never be undoable. */
  applyWithoutUndo: (op: TimelineEditOperation) => VideoProjectDocument;
  /** Opens a merge group under `gestureId` — call at pointer-down. Every
   *  `apply()` call (without its own `{ merge }` override) until
   *  `endGesture()` collapses into ONE undo entry. */
  beginGesture: (gestureId: string) => void;
  /** Closes whatever gesture is open — call at pointer-up/pointer-cancel.
   *  Idempotent; safe to call with no gesture open. */
  endGesture: () => void;
  /** True while a gesture is open (`beginGesture` called, `endGesture` not
   *  yet called) — lets a caller avoid double-opening. */
  isGestureOpen: () => boolean;
  /** Replaces the document and clears all undo/redo history (e.g. after
   *  loading a fresh server revision — the old history no longer applies to
   *  the new base document). */
  reset: (document: VideoProjectDocument) => void;
}

export function useTimelineHistory(
  initialDocument: VideoProjectDocument,
): UseTimelineHistoryResult {
  const busRef = useRef<CommandBus<VideoProjectDocument> | null>(null);
  if (busRef.current === null) {
    busRef.current = new CommandBus<VideoProjectDocument>(initialDocument);
  }
  const bus = busRef.current;

  // CommandBus is a plain class with no subscription mechanism, so this hook
  // re-renders by bumping a tick after every mutating call and reads
  // `bus.getState()`/`bus.canUndo()`/`bus.canRedo()` fresh on each render —
  // `bus` itself is the single source of truth, this is not duplicated state.
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const activeGestureId = useRef<string | null>(null);
  const discreteIdCounter = useRef(0);

  const apply = useCallback(
    (op: TimelineEditOperation, options?: ApplyOptions): VideoProjectDocument => {
      const mergeId = options?.merge ?? activeGestureId.current ?? null;
      const command: CanvasCommand<VideoProjectDocument> = {
        id: mergeId ?? `vs-discrete-${(discreteIdCounter.current += 1)}`,
        apply: op,
      };
      const next = mergeId !== null ? bus.executeAndMerge(command) : bus.execute(command);
      rerender();
      return next;
    },
    [bus, rerender],
  );

  const applyWithoutUndo = useCallback(
    (op: TimelineEditOperation): VideoProjectDocument => {
      const next = bus.applyWithoutUndo({ id: "vs-no-undo", apply: op });
      rerender();
      return next;
    },
    [bus, rerender],
  );

  const beginGesture = useCallback((gestureId: string) => {
    activeGestureId.current = gestureId;
  }, []);

  const endGesture = useCallback(() => {
    activeGestureId.current = null;
    bus.breakMerge();
  }, [bus]);

  const isGestureOpen = useCallback(() => activeGestureId.current !== null, []);

  const undo = useCallback(() => {
    activeGestureId.current = null;
    bus.undo();
    rerender();
  }, [bus, rerender]);

  const redo = useCallback(() => {
    activeGestureId.current = null;
    bus.redo();
    rerender();
  }, [bus, rerender]);

  const reset = useCallback(
    (document: VideoProjectDocument) => {
      activeGestureId.current = null;
      bus.reset(document);
      rerender();
    },
    [bus, rerender],
  );

  return {
    document: bus.getState(),
    canUndo: bus.canUndo(),
    canRedo: bus.canRedo(),
    undo,
    redo,
    apply,
    applyWithoutUndo,
    beginGesture,
    endGesture,
    isGestureOpen,
    reset,
  };
}
