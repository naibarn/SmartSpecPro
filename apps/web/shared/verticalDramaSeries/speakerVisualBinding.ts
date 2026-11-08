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

/** Unpersisted, confidence-gated proposal for the current approved frame. */
export interface VerticalDramaShotSpeakerSuggestion {
  speakerLabel: string;
  personId: string;
  confidence: number;
}

/** Outcome returned to the storyboard while one durable speaker-detection job runs. */
export interface VerticalDramaSpeakerDetectionOutcome {
  status: "completed" | "failed" | "uncertain" | "timed_out" | "busy";
  /** Actual credits reported by the underlying detection/profile/matching skills. */
  creditsUsed: number;
  /** High-confidence suggestions successfully persisted to the current frame. */
  matchedSpeakerCount: number;
  saved: boolean;
  attributionIssue?: string;
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

/** Merge only requested, high-confidence detections into the saved frame map. */
export function applyVerticalDramaSpeakerSuggestionsToBindings(input: {
  bindings: unknown;
  requestedSpeakerLabels: readonly string[];
  people: readonly VerticalDramaDetectedShotPerson[];
  suggestions: readonly VerticalDramaShotSpeakerSuggestion[];
  sourceMediaAssetId: string;
  shotNumber: number;
}): {
  bindings: VerticalDramaSpeakerVisualBinding[];
  matchedSpeakerCount: number;
  capacityExceeded: boolean;
} {
  const bindings = normalizeVerticalDramaSpeakerVisualBindings(input.bindings);
  const normalizeLabel = (label: string) =>
    label.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const requestedLabels = new Set(
    input.requestedSpeakerLabels.map(normalizeLabel)
  );
  const next = bindings.slice();
  let matchedSpeakerCount = 0;
  let capacityExceeded = false;

  for (const suggestion of input.suggestions) {
    const speakerKey = normalizeLabel(suggestion.speakerLabel);
    if (!requestedLabels.has(speakerKey)) continue;
    const person = input.people.find(
      candidate => candidate.id === suggestion.personId
    );
    if (!person) continue;

    const bindingIndex = next.findIndex(
      binding => normalizeLabel(binding.speakerLabel) === speakerKey
    );
    const existing = bindingIndex >= 0 ? next[bindingIndex] : undefined;
    const existingIsCompleteForCurrentFrame = Boolean(
      existing?.sourceMediaAssetId === input.sourceMediaAssetId &&
        ((existing.personId && existing.boundingBox) ||
          (existing.visualCue && !existing.personId && !existing.boundingBox))
    );
    if (existingIsCompleteForCurrentFrame) continue;

    const personAlreadyMappedToAnotherSpeaker = next.some(
      binding =>
        binding.speakerLabel.trim() &&
        normalizeLabel(binding.speakerLabel) !== speakerKey &&
        binding.sourceMediaAssetId === input.sourceMediaAssetId &&
        binding.personId === person.id
    );
    if (personAlreadyMappedToAnotherSpeaker) continue;

    if (bindingIndex < 0 && next.length >= VD_SPEAKER_VISUAL_BINDING_MAX) {
      capacityExceeded = true;
      continue;
    }

    const nextBinding: VerticalDramaSpeakerVisualBinding = {
      id:
        existing?.id ??
        `shot-speaker-${input.shotNumber}-${Date.now()}-${matchedSpeakerCount + 1}`,
      speakerLabel: suggestion.speakerLabel,
      visualCue: person.appearance,
      personId: person.id,
      boundingBox: person.boundingBox,
      sourceMediaAssetId: input.sourceMediaAssetId,
    };
    if (bindingIndex >= 0) next[bindingIndex] = nextBinding;
    else next.push(nextBinding);
    matchedSpeakerCount += 1;
  }

  return { bindings: next, matchedSpeakerCount, capacityExceeded };
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
  return bindings?.find(binding => {
    const normalizedId = binding.id
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, " ");
    return (
      keys.has(
        binding.speakerLabel.trim().toLocaleLowerCase().replace(/\s+/g, " ")
      ) ||
      keys.has(normalizedId) ||
      keys.has(`shot-local-speaker-${normalizedId}`)
    );
  });
}

/**
 * A complete, frame-specific speaker map can replace the legacy left-to-right
 * cast lock. A detected selection needs its person region; a user-authored
 * visual cue is also valid when it was saved against this exact approved frame.
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
    if (!binding || binding.sourceMediaAssetId !== currentAssetId) return false;
    const detectedPersonSelected = Boolean(binding.personId && binding.boundingBox);
    const manualVisualCueConfirmed = Boolean(
      binding.visualCue && !binding.personId && !binding.boundingBox
    );
    return detectedPersonSelected || manualVisualCueConfirmed;
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

/** Keep appearance wording as the identity cue; the selected region already
 * supplies spatial grounding, so legacy viewer buckets are redundant here. */
export function cleanVerticalDramaSpeakerVisualCue(value: string): string {
  return value
    .replace(/\bviewer[ -](?:far[ -](?:left|right)|left|right|center(?:[ -](?:left|right))?)\b/giu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
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
      return `- Dialogue speaker “${binding.speakerLabel}” maps to ${binding.personId ? `selected person ${binding.personId}` : "the person"} already visible in START_FRAME_IMAGE: ${cleanVerticalDramaSpeakerVisualCue(binding.visualCue)}.${box} Keep this speaker attached to their exact line and animate only this person's mouth while they speak.`;
    }),
    "For every mapped dialogue line, identify the speaker by the supplied appearance cue and selected person ID/region. Write the speaker name followed by 'identified by [appearance cue]' next to their line. Never identify a mapped speaker with viewer-left/right/center wording, left-to-right ordering, or a legacy cast-position lock. Do not turn these speakers into off-screen voices or assign their lines to another person. Do not add a new person if the selected person is not visible in the approved start frame; preserve the frame and flag an uncertain match instead of guessing.",
  ].join("\n");
}
