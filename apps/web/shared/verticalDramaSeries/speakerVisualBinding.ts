/** Shot-local visual identity for dialogue speakers without a roster entry. */

export const VD_SPEAKER_VISUAL_BINDING_MAX = 12;
export const VD_SPEAKER_VISUAL_BINDING_LABEL_MAX = 120;
export const VD_SPEAKER_VISUAL_BINDING_CUE_MAX = 240;

export interface VerticalDramaDetectedShotPerson {
  id: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  appearance: string;
  confidence: number;
}

export interface VerticalDramaSpeakerVisualBinding {
  /** Stable only within this shot; never a Character Stock key. */
  id: string;
  /** Exact authored speaker label used by this shot's canonical dialogue. */
  speakerLabel: string;
  /** User-confirmed cue that distinguishes the visible person in Start Frame. */
  visualCue: string;
  /** AI-proposed, user-selected person instance in this exact Start Frame. */
  personId?: string;
  /** Normalized [0, 1] region from the exact Start Frame used for confirmation. */
  boundingBox?: { x: number; y: number; width: number; height: number };
  /** Approved frame this visual cue was confirmed against; stale after frame replacement. */
  sourceMediaAssetId?: string;
}

function normalizedBoundingBox(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const raw = value as Record<string, unknown>;
  const numbers = [raw.x, raw.y, raw.width, raw.height];
  if (!numbers.every(item => typeof item === "number" && Number.isFinite(item)))
    return undefined;
  const [x, y, width, height] = numbers as number[];
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1.001 ||
    y + height > 1.001
  )
    return undefined;
  return { x, y, width, height };
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeVerticalDramaSpeakerVisualBindings(
  value: unknown
): VerticalDramaSpeakerVisualBinding[] {
  if (!Array.isArray(value)) return [];
  const result: VerticalDramaSpeakerVisualBinding[] = [];
  const usedIds = new Set<string>();
  const usedLabels = new Set<string>();
  const usedPersonIds = new Set<string>();

  for (const [index, raw] of value.entries()) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const speakerLabel = boundedText(
      entry.speakerLabel,
      VD_SPEAKER_VISUAL_BINDING_LABEL_MAX
    );
    const visualCue = boundedText(
      entry.visualCue,
      VD_SPEAKER_VISUAL_BINDING_CUE_MAX
    );
    if (!speakerLabel || !visualCue) continue;

    const labelKey = speakerLabel.toLocaleLowerCase().replace(/\s+/g, " ");
    if (usedLabels.has(labelKey)) continue;
    usedLabels.add(labelKey);

    const rawId = boundedText(entry.id, 80);
    const idBase = rawId || `shot-speaker-${index + 1}`;
    let id = idBase;
    let suffix = 2;
    while (usedIds.has(id)) id = `${idBase}-${suffix++}`;
    usedIds.add(id);
    const personId = boundedText(entry.personId, 64) || undefined;
    if (personId && usedPersonIds.has(personId)) continue;
    if (personId) usedPersonIds.add(personId);
    const sourceMediaAssetId =
      boundedText(entry.sourceMediaAssetId, 128) || undefined;
    const boundingBox = normalizedBoundingBox(entry.boundingBox);
    result.push({
      id,
      speakerLabel,
      visualCue,
      ...(personId ? { personId } : {}),
      ...(boundingBox ? { boundingBox } : {}),
      ...(sourceMediaAssetId ? { sourceMediaAssetId } : {}),
    });
    if (result.length >= VD_SPEAKER_VISUAL_BINDING_MAX) break;
  }
  return result;
}

export function findVerticalDramaSpeakerVisualBinding(
  bindings: readonly VerticalDramaSpeakerVisualBinding[] | null | undefined,
  ...speakerLabels: Array<string | null | undefined>
): VerticalDramaSpeakerVisualBinding | undefined {
  const keys = new Set(
    speakerLabels
      .map(value => value?.trim().toLocaleLowerCase().replace(/\s+/g, " "))
      .filter((value): value is string => Boolean(value))
  );
  if (keys.size === 0) return undefined;
  return bindings?.find(binding =>
    keys.has(
      binding.speakerLabel.trim().toLocaleLowerCase().replace(/\s+/g, " ")
    )
  );
}

/**
 * A complete, frame-specific detected-person map can replace the legacy
 * left-to-right cast lock for the dialogue speakers in that frame. Free-text
 * cues and stale/manual bindings do not satisfy this gate.
 */
export function hasCompleteDetectedVerticalDramaSpeakerVisualBindings(
  bindings: readonly VerticalDramaSpeakerVisualBinding[] | null | undefined,
  requiredSpeakerAliases: readonly (readonly (string | null | undefined)[])[],
  currentSourceMediaAssetId: string | number | null | undefined
): boolean {
  const currentAssetId =
    currentSourceMediaAssetId == null
      ? ""
      : String(currentSourceMediaAssetId).trim();
  if (!currentAssetId || requiredSpeakerAliases.length === 0) return false;

  return requiredSpeakerAliases.every(aliases => {
    const binding = findVerticalDramaSpeakerVisualBinding(bindings, ...aliases);
    return Boolean(
      binding?.personId &&
      binding.boundingBox &&
      binding.sourceMediaAssetId === currentAssetId
    );
  });
}

/** Keep image-grounded selections only while they still refer to this frame. */
export function getCurrentVerticalDramaSpeakerVisualBindings(
  bindings: unknown,
  currentSourceMediaAssetId: string | number | null | undefined
): VerticalDramaSpeakerVisualBinding[] {
  const currentId =
    currentSourceMediaAssetId == null ? "" : String(currentSourceMediaAssetId);
  return normalizeVerticalDramaSpeakerVisualBindings(bindings).filter(
    binding =>
      !binding.sourceMediaAssetId || binding.sourceMediaAssetId === currentId
  );
}

export function renderVerticalDramaSpeakerVisualBindings(
  bindings: readonly VerticalDramaSpeakerVisualBinding[] | null | undefined
): string | null {
  const normalized = normalizeVerticalDramaSpeakerVisualBindings(bindings);
  if (normalized.length === 0) return null;
  return [
    "USER-CONFIRMED SHOT-LOCAL SPEAKER BINDINGS (person selection is local to this approved frame; no persistent character identity):",
    ...normalized.map(binding => {
      const box = binding.boundingBox
        ? ` normalized region x=${binding.boundingBox.x.toFixed(3)}, y=${binding.boundingBox.y.toFixed(3)}, width=${binding.boundingBox.width.toFixed(3)}, height=${binding.boundingBox.height.toFixed(3)}`
        : "";
      return `- Dialogue speaker “${binding.speakerLabel}” maps to ${binding.personId ? `selected person ${binding.personId}` : "the person"} already visible in START_FRAME_IMAGE: ${binding.visualCue}.${box} Keep this speaker attached to their exact line and animate only this person's mouth while they speak.`;
    }),
    "Treat each selected person ID and region as a visual anchor, stronger than left-to-right ordering. Do not turn these speakers into off-screen voices or assign their lines to another person. Do not add a new person if the selected person is not visible in the approved start frame; preserve the frame and flag an uncertain match instead of guessing.",
  ].join("\n");
}
