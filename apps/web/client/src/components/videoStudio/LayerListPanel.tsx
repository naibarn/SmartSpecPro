/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P1/P2, §2.1 D3.
 *
 * D3 — this is a FIRST-CLASS permanent surface, not a narrow-screen
 * fallback: simultaneously the keyboard/screen-reader path, the narrow-
 * screen path (§4.14), and — for a non-editor — often the easier path
 * ("3.0 วินาที" typed beats a pixel drag). It lists every hand-authored clip
 * (background/overlay/brand band — `collectAuthoredLayerClips`; the scene
 * strip, subtitle track and audio tracks are display-only elsewhere and have
 * no author-editable geometry) as an ordinary form row.
 *
 * P2: `editable` flips every numeric field live and wires the row-action
 * buttons (lock/hide, band, duplicate, remove — §4.5's "never a raw z-order
 * number", only `นำมาไว้ด้านหน้า`/`ส่งไปด้านหลัง`). Every action callback is
 * optional and only rendered/invoked while `editable` is true, so a caller
 * that still only passes `onChange` (or nothing) keeps the P1 read-only
 * behaviour unchanged.
 */
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import {
  collectAuthoredLayerClips,
  type TimelineClipRef,
} from "./timelineProjection";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { VideoProjectDocument } from "@shared/videoIntelligence/projectSchemas";

/** A P2 write path will key off this shape — one row's ref plus which field
 *  changed and its new value. Not used in P1 (`onChange` is never invoked
 *  since every field is disabled), typed now so P2 doesn't need a breaking
 *  prop-signature change. */
export type LayerListFieldKey =
  | "startMs"
  | "durationMs"
  | "x"
  | "y"
  | "width"
  | "height"
  | "opacity"
  | "rotationDeg";

export interface LayerListPanelProps {
  lang: VideoStudioLang;
  document: VideoProjectDocument;
  selectedClipId: string | null;
  onSelect: (ref: TimelineClipRef, clipId: string) => void;
  /** P2 hook — flips every field from disabled to editable. Defaults to
   *  `false` so P1 ships fully read-only without any caller change. */
  editable?: boolean;
  /** P2 hook — never called while `editable` is false. */
  onChange?: (ref: TimelineClipRef, field: LayerListFieldKey, value: number) => void;
  /** P2 row actions — every one is optional, only rendered/invoked while
   *  `editable` is true. */
  onRename?: (ref: TimelineClipRef, name: string) => void;
  onToggleLock?: (ref: TimelineClipRef) => void;
  onToggleHidden?: (ref: TimelineClipRef) => void;
  onBringForward?: (ref: TimelineClipRef) => void;
  onSendBackward?: (ref: TimelineClipRef) => void;
  onDuplicate?: (ref: TimelineClipRef) => void;
  onRemove?: (ref: TimelineClipRef) => void;
  missingLayerIds?: ReadonlySet<string>;
  onReplaceMissing?: (ref: TimelineClipRef) => void;
}

function typeLabel(layer: RemotionLayer): string {
  return layer.type;
}

function formatMsRange(startMs: number, durationMs: number): string {
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  return `${fmt(startMs)}–${fmt(startMs + durationMs)}`;
}

export function LayerListPanel({
  lang,
  document,
  selectedClipId,
  onSelect,
  editable = false,
  onChange,
  onRename,
  onToggleLock,
  onToggleHidden,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onRemove,
  missingLayerIds,
  onReplaceMissing,
}: LayerListPanelProps) {
  const pairs = collectAuthoredLayerClips(document);

  return (
    <div data-testid="vs-layer-list" className="flex flex-col gap-2">
      <Text type="body" weight="medium">
        {pickCopy(lang, videoStudioCopy.layerListTitle)}
      </Text>

      {pairs.length === 0 ? (
        <Text type="supporting" color="secondary">
          {pickCopy(lang, videoStudioCopy.layerListEmpty)}
        </Text>
      ) : null}

      {pairs.map(({ clip, layer }) => {
        const isSelected = selectedClipId === clip.id;
        const isMissing = clip.ref.kind === "layer" && Boolean(missingLayerIds?.has(clip.ref.layerId));
        const rowLabel = `${clip.label} ${formatMsRange(clip.startMs, clip.durationMs)}`;
        const emit = (field: LayerListFieldKey, value: number) => {
          if (editable) onChange?.(clip.ref, field, value);
        };
        return (
          <Card
            key={clip.id}
            data-testid="vs-layer-list-row"
            aria-label={rowLabel}
            tabIndex={0}
            role="group"
            onClick={() => onSelect(clip.ref, clip.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(clip.ref, clip.id);
              }
            }}
            className={isSelected ? "outline outline-2 outline-[var(--color-accent,#6ea8fe)]" : undefined}
          >
            <VStack gap={2}>
              <HStack justify="between" align="center">
                <Text type="body" weight="medium">
                  {clip.label}
                </Text>
                <HStack gap={1} align="center">
                  {isMissing ? (
                    <Text
                      type="supporting"
                      className="text-red-700 dark:text-red-300"
                      data-testid="vs-layer-missing-badge"
                    >
                      {pickCopy(lang, videoStudioCopy.timelineMissingAsset)}
                    </Text>
                  ) : null}
                  <Text type="supporting" color="secondary">
                    {typeLabel(layer)}
                  </Text>
                </HStack>
              </HStack>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListStart)}
                  isIntegerOnly
                  min={0}
                  value={clip.startMs}
                  isDisabled={!editable}
                  onChange={(value) => emit("startMs", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListDuration)}
                  isIntegerOnly
                  min={1}
                  value={clip.durationMs}
                  isDisabled={!editable}
                  onChange={(value) => emit("durationMs", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListPositionX)}
                  min={0}
                  max={100}
                  value={layer.x}
                  isDisabled={!editable}
                  onChange={(value) => emit("x", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListPositionY)}
                  min={0}
                  max={100}
                  value={layer.y}
                  isDisabled={!editable}
                  onChange={(value) => emit("y", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListWidth)}
                  min={0}
                  max={100}
                  value={layer.width}
                  isDisabled={!editable}
                  onChange={(value) => emit("width", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListHeight)}
                  min={0}
                  max={100}
                  value={layer.height}
                  isDisabled={!editable}
                  onChange={(value) => emit("height", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListOpacity)}
                  min={0}
                  max={1}
                  value={layer.opacity}
                  isDisabled={!editable}
                  onChange={(value) => emit("opacity", value)}
                />
                <NumberInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListRotation)}
                  value={layer.rotationDeg}
                  isDisabled={!editable}
                  onChange={(value) => emit("rotationDeg", value)}
                />
              </div>

              {editable ? (
                <TextInput
                  data-testid="vs-layer-list-field"
                  label={pickCopy(lang, videoStudioCopy.layerListRename)}
                  value={layer.name ?? ""}
                  onChange={(value) => onRename?.(clip.ref, value)}
                />
              ) : null}

              {editable ? (
                <HStack gap={1} wrap="wrap" onClick={(event) => event.stopPropagation()}>
                  {isMissing ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid="vs-layer-replace-missing"
                      label={pickCopy(lang, videoStudioCopy.timelineReplaceMissingAsset)}
                      onClick={() => onReplaceMissing?.(clip.ref)}
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    label={pickCopy(
                      lang,
                      clip.locked ? videoStudioCopy.timelineUnlockClip : videoStudioCopy.layerListLockToggle,
                    )}
                    onClick={() => onToggleLock?.(clip.ref)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isDisabled={clip.locked}
                    label={pickCopy(
                      lang,
                      clip.hidden ? videoStudioCopy.timelineShowClip : videoStudioCopy.layerListHideToggle,
                    )}
                    onClick={() => onToggleHidden?.(clip.ref)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isDisabled={clip.locked}
                    label={pickCopy(lang, videoStudioCopy.layerListBringForward)}
                    onClick={() => onBringForward?.(clip.ref)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isDisabled={clip.locked}
                    label={pickCopy(lang, videoStudioCopy.layerListSendBackward)}
                    onClick={() => onSendBackward?.(clip.ref)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    label={pickCopy(lang, videoStudioCopy.layerListDuplicate)}
                    onClick={() => onDuplicate?.(clip.ref)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isDisabled={clip.locked}
                    label={pickCopy(lang, videoStudioCopy.layerListRemove)}
                    onClick={() => onRemove?.(clip.ref)}
                  />
                </HStack>
              ) : null}

              {layer.type === "text" ? (
                <Text type="supporting" color="secondary">
                  {layer.content}
                </Text>
              ) : null}
              {(layer.type === "image" || layer.type === "video" || layer.type === "audio") ? (
                <Text type="supporting" color="secondary" className="truncate">
                  {layer.src}
                </Text>
              ) : null}
            </VStack>
          </Card>
        );
      })}
    </div>
  );
}
