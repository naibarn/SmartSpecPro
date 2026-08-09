/**
 * Explicit physical barrier-dialogue contract for Vertical Drama shots.
 *
 * This is deliberately separate from `screenCallerCharacterRefs`: a person
 * behind a closed door is a real off-screen scene participant, not a phone
 * caller. The contract is explicit so prose cannot silently move a character
 * across the barrier.
 */

export type VerticalDramaBarrierDialogue = {
  type: "closed_door";
  state: "closed" | "locked";
  cameraSide: "inside" | "outside";
  visibleCharacterRefs: string[];
  offscreenCharacterRefs: string[];
};

function cleanRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
}

/** Normalize only the explicit closed-door shape; never infer it from prose. */
export function normalizeVerticalDramaBarrierDialogue(
  value: unknown
): VerticalDramaBarrierDialogue | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const visibleCharacterRefs = cleanRefs(raw.visibleCharacterRefs ?? raw.visible_character_refs);
  const offscreenCharacterRefs = cleanRefs(
    raw.offscreenCharacterRefs ?? raw.offscreen_character_refs
  );
  const cameraSide = raw.cameraSide ?? raw.camera_side;
  const state = raw.state;
  if (
    raw.type !== "closed_door" ||
    (state !== "closed" && state !== "locked") ||
    (cameraSide !== "inside" && cameraSide !== "outside") ||
    visibleCharacterRefs.length === 0
  ) {
    return undefined;
  }
  const visible = new Set(visibleCharacterRefs);
  if (offscreenCharacterRefs.some(ref => visible.has(ref))) return undefined;
  return {
    type: "closed_door",
    state,
    cameraSide,
    visibleCharacterRefs,
    offscreenCharacterRefs,
  };
}

/** Deterministic facts consumed by the start-frame skill. */
export function renderVerticalDramaBarrierDialogueBlock(
  barrier: VerticalDramaBarrierDialogue
): string {
  return [
    "BARRIER DIALOGUE (MANDATORY):",
    "barrier_type: closed_door",
    `barrier_state: ${barrier.state}`,
    `camera_side: ${barrier.cameraSide}`,
    `visible_character_refs: ${barrier.visibleCharacterRefs.join(", ")}`,
    `offscreen_physical_character_refs: ${barrier.offscreenCharacterRefs.join(", ") || "(none)"}`,
    "The visible character is on the camera side of the closed barrier. The offscreen physical character remains on the other side and may be heard through the closed door but must not appear in frame.",
    "Do not show an open doorway, door gap, face/body/limb crossing, reflection or duplicate of the offscreen character, or direct face-to-face placement across the room.",
  ].join("\n");
}
