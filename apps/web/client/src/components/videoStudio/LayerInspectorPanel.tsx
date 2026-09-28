/**
 * Feature 143 (Video Studio — Layer & Timeline Editor), P2, §4.4/§4.5/§4.8.
 *
 * The "รายละเอียด" panel from the §4.4 ASCII mock — shows/edits the
 * currently-selected clip's timing, position/size/opacity/rotation,
 * lock/hide, band (`นำมาไว้ด้านหน้า`/`ส่งไปด้านหลัง` — NEVER a raw z-order
 * number, §4.15) and type-specific fields. When nothing is selected it shows
 * project-wide values are in effect (§4.4: "ไม่ได้เลือก → ค่าของทั้งโปรเจกต์"),
 * matching the mock rather than rendering nothing.
 *
 * §4.8 brand-lock caution: `enforceBrandLocks` THROWS at compile if
 * `locks.colors` is on and a `color` field differs from
 * `brandKit.colors.primary`, or `locks.fonts` is on and a text layer's
 * `fontFamily` differs from `brandKit.fonts.body`. Rather than let the user
 * author an uncompilable document, the color/font controls here are
 * CONSTRAINED (disabled, forced to the locked token, with an inline hint)
 * whenever the resolved brand kit has that lock on — never a validation
 * error surfaced only at save/compile time.
 */
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Slider } from "@astryxdesign/core/Slider";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";

import type { LayerPropsPatch } from "./timelineEdits";
import { pickCopy, videoStudioCopy, type VideoStudioLang } from "./videoStudioCopy";
import type { RemotionLayer } from "@shared/remotion/layerTemplateSchemas";
import type { AudioTrack } from "@shared/videoIntelligence/projectSchemas";

export interface InspectorBrandKit {
  colors?: { primary?: string } | null;
  fonts?: { body?: string } | null;
  locks?: { colors?: boolean; fonts?: boolean } | null;
}

export interface LayerInspectorPanelProps {
  lang: VideoStudioLang;
  layer: RemotionLayer | null;
  startMs: number;
  durationMs: number;
  brandKit: InspectorBrandKit | null;
  onPatch: (patch: LayerPropsPatch) => void;
  onRename: (name: string) => void;
  onMoveStart: (newStartMs: number) => void;
  onResizeEnd: (newDurationMs: number) => void;
  onToggleLock: () => void;
  onToggleHidden: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function LayerInspectorPanel({
  lang,
  layer,
  startMs,
  durationMs,
  brandKit,
  onPatch,
  onRename,
  onMoveStart,
  onResizeEnd,
  onToggleLock,
  onToggleHidden,
  onBringForward,
  onSendBackward,
  onDuplicate,
  onRemove,
}: LayerInspectorPanelProps) {
  if (!layer) {
    return (
      <Card data-testid="vs-inspector">
        <VStack gap={1}>
          <Text type="body" weight="medium">
            {pickCopy(lang, videoStudioCopy.inspectorTitle)}
          </Text>
          <Text type="supporting" color="secondary">
            {pickCopy(lang, videoStudioCopy.inspectorNoSelection)}
          </Text>
        </VStack>
      </Card>
    );
  }

  const colorLocked = layer.type === "text" && Boolean(brandKit?.locks?.colors);
  const fontLocked = layer.type === "text" && Boolean(brandKit?.locks?.fonts);
  const lockedColorValue = brandKit?.colors?.primary ?? "";
  const lockedFontValue = brandKit?.fonts?.body ?? "";

  return (
    <Card data-testid="vs-inspector">
      <VStack gap={3}>
        <HStack justify="between" align="center">
          <Text type="body" weight="medium">
            {pickCopy(lang, videoStudioCopy.inspectorTitle)}
          </Text>
          <HStack gap={1}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="vs-inspector-lock"
              label={pickCopy(
                lang,
                layer.locked ? videoStudioCopy.timelineUnlockClip : videoStudioCopy.timelineLockClip,
              )}
              onClick={onToggleLock}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="vs-inspector-hide"
              isDisabled={layer.locked}
              label={pickCopy(
                lang,
                layer.hidden ? videoStudioCopy.timelineShowClip : videoStudioCopy.timelineHideClip,
              )}
              onClick={onToggleHidden}
            />
          </HStack>
        </HStack>

        <TextInput
          data-testid="vs-inspector-name"
          label={pickCopy(lang, videoStudioCopy.inspectorNameLabel)}
          value={layer.name ?? ""}
          isDisabled={layer.locked}
          onChange={onRename}
        />

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListStart)}
            isIntegerOnly
            min={0}
            value={startMs}
            isDisabled={layer.locked}
            onChange={onMoveStart}
          />
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListDuration)}
            isIntegerOnly
            min={1}
            value={durationMs}
            isDisabled={layer.locked}
            onChange={(value) => onResizeEnd(startMs + Math.max(1, value))}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListPositionX)}
            min={0}
            max={100}
            value={layer.x}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ x: value })}
          />
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListPositionY)}
            min={0}
            max={100}
            value={layer.y}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ y: value })}
          />
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListWidth)}
            min={0}
            max={100}
            value={layer.width}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ width: value })}
          />
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListHeight)}
            min={0}
            max={100}
            value={layer.height}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ height: value })}
          />
          <NumberInput
            label={pickCopy(lang, videoStudioCopy.layerListOpacity)}
            min={0}
            max={1}
            value={layer.opacity}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ opacity: value })}
          />
          <NumberInput
            data-testid="vs-inspector-rotation"
            label={pickCopy(lang, videoStudioCopy.inspectorRotationLabel)}
            value={layer.rotationDeg}
            isDisabled={layer.locked}
            onChange={(value) => onPatch({ rotationDeg: value })}
          />
        </div>

        {layer.type === "text" ? (
          <VStack gap={2}>
            <TextInput
              label={pickCopy(lang, videoStudioCopy.inspectorContentLabel)}
              value={layer.content}
              isDisabled={layer.locked}
              onChange={(value) => onPatch({ content: value })}
            />
            <TextInput
              data-testid="vs-inspector-color"
              label={pickCopy(lang, videoStudioCopy.inspectorColorLabel)}
              value={colorLocked ? lockedColorValue : layer.color}
              isDisabled={layer.locked || colorLocked}
              onChange={(value) => onPatch({ color: value })}
            />
            {colorLocked ? (
              <Text type="supporting" color="secondary" data-testid="vs-inspector-color-locked-hint">
                {pickCopy(lang, videoStudioCopy.inspectorBrandLockedColor)}
              </Text>
            ) : null}
            <TextInput
              data-testid="vs-inspector-font"
              label={pickCopy(lang, videoStudioCopy.inspectorFontLabel)}
              value={fontLocked ? lockedFontValue : layer.fontFamily}
              isDisabled={layer.locked || fontLocked}
              onChange={(value) => onPatch({ fontFamily: value })}
            />
            {fontLocked ? (
              <Text type="supporting" color="secondary" data-testid="vs-inspector-font-locked-hint">
                {pickCopy(lang, videoStudioCopy.inspectorBrandLockedFont)}
              </Text>
            ) : null}
          </VStack>
        ) : null}

        {layer.type === "motionGraphic" ? (
          <TextInput
            data-testid="vs-inspector-color"
            label={pickCopy(lang, videoStudioCopy.inspectorColorLabel)}
            value={colorLocked ? lockedColorValue : (layer.color ?? "")}
            isDisabled={layer.locked || colorLocked}
            onChange={(value) => onPatch({ color: value })}
          />
        ) : null}

        {layer.type === "image" || layer.type === "video" || layer.type === "audio" ? (
          <Text type="supporting" color="secondary" className="truncate">
            {layer.src}
          </Text>
        ) : null}

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="vs-inspector-bring-forward"
            isDisabled={layer.locked}
            label={pickCopy(lang, videoStudioCopy.timelineBringForward)}
            onClick={onBringForward}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="vs-inspector-send-backward"
            isDisabled={layer.locked}
            label={pickCopy(lang, videoStudioCopy.timelineSendBackward)}
            onClick={onSendBackward}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="vs-inspector-duplicate"
            label={pickCopy(lang, videoStudioCopy.timelineDuplicateClip)}
            onClick={onDuplicate}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="vs-inspector-remove"
            isDisabled={layer.locked}
            label={pickCopy(lang, videoStudioCopy.timelineDeleteClip)}
            onClick={onRemove}
          />
        </HStack>
      </VStack>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* AudioTrackInspectorPanel — P3 §4.8/§6, audio row selected                  */
/* -------------------------------------------------------------------------- */

export interface AudioTrackInspectorPanelProps {
  lang: VideoStudioLang;
  /** Narration or music only — `sfx` has no `gainDb`/span/ducking/fades and
   *  is never routed to this panel (the caller filters it out before
   *  selecting a track for the inspector, same as `collectAuthoredLayerClips`
   *  filters `TimelineStagePanel`'s layer selection). */
  track: Extract<AudioTrack, { kind: "narration" | "music" }>;
  /** The track's CURRENTLY RESOLVED absolute span (§4.8: absent
   *  `startMs`/`endMs` project to `[0, documentDurationMs]` — see
   *  `timelineProjection.ts`'s `buildAudioTracks`), never raw `undefined`,
   *  so every field here always has a real number to show/edit. */
  startMs: number;
  durationMs: number;
  documentDurationMs: number;
  onGainChange: (gainDb: number) => void;
  onDuckingChange: (ducking: boolean) => void;
  onSpanChange: (span: { startMs: number | null; endMs: number | null }) => void;
  onFadesChange: (fades: { fadeInMs: number; fadeOutMs: number }) => void;
  onRemove: () => void;
}

/** The audio-track equivalent of `LayerInspectorPanel` — rendered INSTEAD of
 *  it (never alongside) when the current timeline selection is a
 *  narration/music row rather than a `scene.layers[]` entry, so there is
 *  always exactly one `data-testid="vs-inspector"` element on screen at a
 *  time. Exposes every field the task brief asks for here specifically
 *  (level, span, fades, ducking) — the timeline row itself
 *  (`TimelineTrackLabelList`) only exposes level/ducking/a span TOGGLE,
 *  deferring precise ms entry to this panel; see this file's sibling
 *  `TimelineTracks.tsx` module docstring for why no pointer-drag span gesture
 *  exists for a document-level (non-scene-relative) track. */
export function AudioTrackInspectorPanel({
  lang,
  track,
  startMs,
  durationMs,
  documentDurationMs,
  onGainChange,
  onDuckingChange,
  onSpanChange,
  onFadesChange,
  onRemove,
}: AudioTrackInspectorPanelProps) {
  const hasExplicitSpan = track.startMs != null || track.endMs != null;
  const endMs = startMs + durationMs;

  return (
    <Card data-testid="vs-inspector">
      <VStack gap={3}>
        <HStack justify="between" align="center">
          <Text type="body" weight="medium">
            {pickCopy(
              lang,
              track.kind === "music"
                ? videoStudioCopy.timelineTrackAudioMusic
                : videoStudioCopy.timelineTrackAudioNarration,
            )}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="vs-audio-remove-track"
            label={pickCopy(lang, videoStudioCopy.audioRemoveTrackLabel)}
            onClick={onRemove}
          />
        </HStack>

        <Slider
          data-testid="vs-audio-volume"
          label={pickCopy(lang, videoStudioCopy.audioVolumeLabel)}
          min={-60}
          max={24}
          step={1}
          value={track.gainDb}
          valueDisplay="text"
          formatValue={(value) =>
            value <= -60 ? pickCopy(lang, videoStudioCopy.audioVolumeMutedLabel) : `${value} dB`
          }
          onChangeEnd={onGainChange}
        />

        {track.kind === "music" ? (
          <Switch
            data-testid="vs-audio-ducking"
            label={pickCopy(lang, videoStudioCopy.audioDuckingLabel)}
            value={track.ducking ?? true}
            onChange={onDuckingChange}
          />
        ) : null}

        <VStack gap={2}>
          <Switch
            label={pickCopy(lang, videoStudioCopy.audioSpanToggleLabel)}
            description={
              !hasExplicitSpan ? pickCopy(lang, videoStudioCopy.audioSpanFullVideoLabel) : undefined
            }
            value={hasExplicitSpan}
            onChange={(checked) =>
              onSpanChange(checked ? { startMs, endMs } : { startMs: null, endMs: null })
            }
          />
          {hasExplicitSpan ? (
            <div className="grid grid-cols-2 gap-2" data-testid="vs-audio-span">
              <NumberInput
                label={pickCopy(lang, videoStudioCopy.audioSpanStartLabel)}
                isIntegerOnly
                min={0}
                max={Math.max(0, endMs - 1)}
                value={startMs}
                onChange={(value) => onSpanChange({ startMs: value, endMs })}
              />
              <NumberInput
                label={pickCopy(lang, videoStudioCopy.audioSpanEndLabel)}
                isIntegerOnly
                min={startMs + 1}
                max={documentDurationMs}
                value={endMs}
                onChange={(value) => onSpanChange({ startMs, endMs: value })}
              />
            </div>
          ) : null}
        </VStack>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            data-testid="vs-audio-fade-in"
            label={pickCopy(lang, videoStudioCopy.audioFadeInLabel)}
            isIntegerOnly
            min={0}
            value={track.fadeInMs ?? 0}
            onChange={(value) => onFadesChange({ fadeInMs: value, fadeOutMs: track.fadeOutMs ?? 0 })}
          />
          <NumberInput
            data-testid="vs-audio-fade-out"
            label={pickCopy(lang, videoStudioCopy.audioFadeOutLabel)}
            isIntegerOnly
            min={0}
            value={track.fadeOutMs ?? 0}
            onChange={(value) => onFadesChange({ fadeInMs: track.fadeInMs ?? 0, fadeOutMs: value })}
          />
        </div>
      </VStack>
    </Card>
  );
}
