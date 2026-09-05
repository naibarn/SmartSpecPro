/**
 * Grounding facts that belong to the current shot, rather than to the
 * scene-wide continuity state. Keeping this contract separate prevents a
 * continuity prop list from being mistaken for a list of simultaneously
 * visible props.
 */
export type VerticalDramaShotComposition = {
  shotType?: string;
  angle?: string;
  movement?: string;
  lens?: string;
  composition?: string;
  bodyLanguage?: string;
  gazeDirection?: string;
  facialExpression?: string;
};

function clean(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${clean(entry)}`)
      .filter(entry => !entry.endsWith(": "))
      .join("; ");
  }
  return "";
}

export function normalizeVerticalDramaShotComposition(
  raw: unknown
): VerticalDramaShotComposition | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const result: VerticalDramaShotComposition = {
    shotType: clean(value.shotType ?? value.shot_type),
    angle: clean(value.angle),
    movement: clean(value.movement),
    lens: clean(value.lens ?? value.focal_length),
    composition: clean(value.composition),
    bodyLanguage: clean(value.bodyLanguage ?? value.body_language),
    gazeDirection: clean(value.gazeDirection ?? value.gaze_direction),
    facialExpression: clean(value.facialExpression ?? value.facial_expression),
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

export function renderVerticalDramaShotCompositionLock(
  composition: VerticalDramaShotComposition | undefined,
  characterNameByKey?: ReadonlyMap<string, string>
): string | undefined {
  if (!composition || !Object.values(composition).some(Boolean))
    return undefined;
  const resolveCharacterKeys = (value: string): string => {
    if (!characterNameByKey || characterNameByKey.size === 0) return value;
    let resolved = value;
    for (const [characterKey, characterName] of Array.from(
      characterNameByKey.entries()
    ).sort(([left], [right]) => right.length - left.length)) {
      if (!characterKey.trim() || !characterName.trim()) continue;
      const escapedKey = characterKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      resolved = resolved.replace(
        new RegExp(`(^|[\\s;])${escapedKey}(?=\\s*:)`, "gu"),
        `$1${characterName}`
      );
    }
    return resolved;
  };
  const lines = [
    "CURRENT SHOT COMPOSITION LOCK (MANDATORY):",
    composition.shotType ? `- Shot type: ${composition.shotType}` : "",
    composition.angle
      ? `- Camera angle: ${composition.angle === "over_the_shoulder" ? "open_over_the_shoulder (open three-quarter angle with both characters' faces clearly visible to the lens; never obscure either face from behind)" : composition.angle}`
      : "",
    composition.movement ? `- Camera movement: ${composition.movement}` : "",
    composition.lens ? `- Lens/focal feel: ${composition.lens}` : "",
    composition.composition
      ? `- Composition: ${resolveCharacterKeys(composition.composition)}`
      : "",
    composition.bodyLanguage
      ? `- Body language: ${resolveCharacterKeys(composition.bodyLanguage)}`
      : "",
    composition.gazeDirection
      ? `- Gaze direction: ${resolveCharacterKeys(composition.gazeDirection)}`
      : "",
    composition.facialExpression
      ? `- Facial expression: ${resolveCharacterKeys(composition.facialExpression)}`
      : "",
    "CURRENT SHOT PROP VISIBILITY RULE (MANDATORY): continuity props are candidates only; show only props explicitly required by this shot's synopsis/composition, omit unrelated prior props, and never duplicate handheld devices or merge objects into hands.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Replace legacy internal character-key labels in an already-persisted lock. */
export function replaceVerticalDramaShotCompositionCharacterKeys(
  prompt: string,
  characterNameByKey: ReadonlyMap<string, string>
): string {
  if (!prompt || characterNameByKey.size === 0) return prompt;
  const start = prompt.indexOf("CURRENT SHOT COMPOSITION LOCK");
  if (start === -1) return prompt;
  const endMarker = "CURRENT SHOT PROP VISIBILITY RULE";
  const relativeEnd = prompt.indexOf(endMarker, start);
  const end = relativeEnd === -1 ? prompt.length : relativeEnd;
  const block = prompt.slice(start, end);
  // Use the same key substitution against the bounded block while preserving
  // all existing labels and line formatting.
  let rewritten = block;
  for (const [characterKey, characterName] of Array.from(
    characterNameByKey.entries()
  ).sort(([left], [right]) => right.length - left.length)) {
    if (!characterKey.trim() || !characterName.trim()) continue;
    const escapedKey = characterKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewritten = rewritten.replace(
      new RegExp(`(^|[\\s;])${escapedKey}(?=\\s*:)`, "gmu"),
      `$1${characterName}`
    );
  }
  return `${prompt.slice(0, start)}${rewritten}${prompt.slice(end)}`;
}

/**
 * Repairs a legacy provider prompt using the authoritative composition that
 * is already attached to the current shot. This keeps old prompts renderable
 * without silently bypassing the grounding contract.
 */
export function ensureVerticalDramaShotCompositionLock(input: {
  prompt: string;
  composition?: VerticalDramaShotComposition;
}): string {
  const lock = renderVerticalDramaShotCompositionLock(input.composition);
  if (
    !lock ||
    hasVerticalDramaGroundingMarker(
      input.prompt,
      "CURRENT SHOT COMPOSITION LOCK"
    )
  ) {
    return input.prompt;
  }
  return `${input.prompt.trimEnd()}\n\n${lock}`;
}

function hasVerticalDramaGroundingMarker(
  prompt: string,
  marker: string
): boolean {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  return normalize(prompt).includes(normalize(marker));
}

export function findVerticalDramaShotGroundingIssues(input: {
  prompt: string;
  composition?: VerticalDramaShotComposition;
  continuityLockBlock?: string;
}): string[] {
  const issues: string[] = [];
  if (
    input.composition &&
    !hasVerticalDramaGroundingMarker(
      input.prompt,
      "CURRENT SHOT COMPOSITION LOCK"
    )
  ) {
    issues.push("missing_current_shot_composition_lock");
  }
  const hasContinuityProps =
    hasVerticalDramaGroundingMarker(
      input.continuityLockBlock ?? "",
      "Active props"
    ) ||
    hasVerticalDramaGroundingMarker(input.prompt, "Active props") ||
    hasVerticalDramaGroundingMarker(input.prompt, "Continuity prop candidates");
  if (
    hasContinuityProps &&
    !hasVerticalDramaGroundingMarker(
      input.prompt,
      "CURRENT SHOT PROP VISIBILITY RULE"
    )
  ) {
    issues.push("missing_current_shot_prop_visibility_rule");
  }
  return issues;
}
