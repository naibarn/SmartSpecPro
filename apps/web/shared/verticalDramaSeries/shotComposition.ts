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
  composition: VerticalDramaShotComposition | undefined
): string | undefined {
  if (!composition || !Object.values(composition).some(Boolean))
    return undefined;
  const lines = [
    "CURRENT SHOT COMPOSITION LOCK (MANDATORY):",
    composition.shotType ? `- Shot type: ${composition.shotType}` : "",
    composition.angle ? `- Camera angle: ${composition.angle}` : "",
    composition.movement ? `- Camera movement: ${composition.movement}` : "",
    composition.lens ? `- Lens/focal feel: ${composition.lens}` : "",
    composition.composition ? `- Composition: ${composition.composition}` : "",
    composition.bodyLanguage
      ? `- Body language: ${composition.bodyLanguage}`
      : "",
    composition.gazeDirection
      ? `- Gaze direction: ${composition.gazeDirection}`
      : "",
    composition.facialExpression
      ? `- Facial expression: ${composition.facialExpression}`
      : "",
    "CURRENT SHOT PROP VISIBILITY RULE (MANDATORY): continuity props are candidates only; show only props explicitly required by this shot's synopsis/composition, omit unrelated prior props, and never duplicate handheld devices or merge objects into hands.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function findVerticalDramaShotGroundingIssues(input: {
  prompt: string;
  composition?: VerticalDramaShotComposition;
  continuityLockBlock?: string;
}): string[] {
  const issues: string[] = [];
  if (
    input.composition &&
    !input.prompt.includes("CURRENT SHOT COMPOSITION LOCK")
  ) {
    issues.push("missing_current_shot_composition_lock");
  }
  const hasContinuityProps =
    input.continuityLockBlock?.includes("Active props") ||
    input.prompt.includes("Active props") ||
    input.prompt.includes("Continuity prop candidates");
  if (
    hasContinuityProps &&
    !input.prompt.includes("CURRENT SHOT PROP VISIBILITY RULE")
  ) {
    issues.push("missing_current_shot_prop_visibility_rule");
  }
  return issues;
}
