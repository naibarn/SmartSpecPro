/** Shot-local visual identity for dialogue speakers without a roster entry. */

export const VD_SPEAKER_VISUAL_BINDING_MAX = 6;
export const VD_SPEAKER_VISUAL_BINDING_LABEL_MAX = 120;
export const VD_SPEAKER_VISUAL_BINDING_CUE_MAX = 240;

export interface VerticalDramaSpeakerVisualBinding {
  /** Stable only within this shot; never a Character Stock key. */
  id: string;
  /** Exact authored speaker label used by this shot's canonical dialogue. */
  speakerLabel: string;
  /** User-confirmed cue that distinguishes the visible person in Start Frame. */
  visualCue: string;
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
    result.push({ id, speakerLabel, visualCue });
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

export function renderVerticalDramaSpeakerVisualBindings(
  bindings: readonly VerticalDramaSpeakerVisualBinding[] | null | undefined
): string | null {
  const normalized = normalizeVerticalDramaSpeakerVisualBindings(bindings);
  if (normalized.length === 0) return null;
  return [
    "USER-CONFIRMED SHOT-LOCAL SPEAKER BINDINGS (visible extras; no persistent character identity):",
    ...normalized.map(
      binding =>
        `- Dialogue speaker “${binding.speakerLabel}” is the person already visible in START_FRAME_IMAGE: ${binding.visualCue}. Keep this exact speaker attached to their line and animate only this person's mouth for that line.`
    ),
    "Do not turn these speakers into off-screen voices or assign their lines to an established character. Do not add a new person if the described person is not visible in the approved start frame; preserve the frame and flag an uncertain match instead of guessing.",
  ].join("\n");
}
