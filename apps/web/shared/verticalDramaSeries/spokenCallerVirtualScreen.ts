/**
 * Deterministic visual contract for spoken phone callers.
 *
 * Caller role is always explicit. Dialogue can activate the stricter
 * whole-shot virtual-screen rule, but dialogue text never creates a caller
 * role by itself.
 */

export type VerticalDramaSpokenCallerVirtualScreen = {
  callerCharacterRef: string;
  screenIndex: number;
  orientation: "vertical";
  visibleFaceRequired: true;
  faceReferenceImageIndex?: number;
};

export type VerticalDramaSpokenCallerVirtualScreenPolicy = {
  physicalSceneCharacterRefs: string[];
  screenCallerCharacterRefs: string[];
  spokenScreenCallerCharacterRefs: string[];
  virtualScreens: VerticalDramaSpokenCallerVirtualScreen[];
};

function normalize(value: string): string {
  return value
    .trim()
    .replace(/^(คุณ|นาย|นางสาว|นาง)\s*/i, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
}

/**
 * Resolve the screen-caller contract without consulting synopsis prose.
 * `characterAliases` is optional and maps canonical caller refs to display
 * names/legacy labels already resolved by the caller.
 */
export function deriveVerticalDramaSpokenCallerVirtualScreens(params: {
  physicalSceneCharacterRefs: readonly string[];
  screenCallerCharacterRefs: readonly string[];
  dialogueSpeakerRefs: readonly string[];
  characterAliases?: Readonly<Record<string, readonly string[]>>;
  /** 1-based provider attachment index for each caller's approved portrait. */
  faceReferenceImageIndexByCharacterRef?: Readonly<Record<string, number>>;
}): VerticalDramaSpokenCallerVirtualScreenPolicy {
  const physical = [...new Set(params.physicalSceneCharacterRefs.map(v => v.trim()).filter(Boolean))];
  const callers = [...new Set(params.screenCallerCharacterRefs.map(v => v.trim()).filter(Boolean))];
  const aliases = new Map<string, string>();

  callers.forEach(caller => {
    aliases.set(normalize(caller), caller);
    for (const alias of params.characterAliases?.[caller] ?? []) {
      if (alias.trim()) aliases.set(normalize(alias), caller);
    }
  });

  const spoken: string[] = [];
  for (const speaker of params.dialogueSpeakerRefs) {
    const canonical = aliases.get(normalize(speaker));
    if (canonical && !spoken.includes(canonical)) spoken.push(canonical);
  }

  const spokenSet = new Set(spoken);
  return {
    physicalSceneCharacterRefs: physical.filter(ref => !spokenSet.has(ref)),
    screenCallerCharacterRefs: callers,
    spokenScreenCallerCharacterRefs: spoken,
    virtualScreens: spoken.map((callerCharacterRef, index) => ({
      callerCharacterRef,
      screenIndex: index + 1,
      orientation: "vertical" as const,
      visibleFaceRequired: true as const,
      ...(Number.isInteger(
        params.faceReferenceImageIndexByCharacterRef?.[callerCharacterRef]
      )
        ? {
            faceReferenceImageIndex:
              params.faceReferenceImageIndexByCharacterRef?.[
                callerCharacterRef
              ],
          }
        : {}),
    })),
  };
}

export function renderVerticalDramaSpokenCallerVirtualScreenPromptBlock(
  policy: VerticalDramaSpokenCallerVirtualScreenPolicy,
): string | undefined {
  if (policy.virtualScreens.length === 0) return undefined;
  const screens = policy.virtualScreens
    .map(
      screen =>
        `screen_${screen.screenIndex}=${screen.callerCharacterRef} (vertical phone screen; caller face clearly visible and readable; screen remains visible throughout the entire shot; caller speaks only inside this screen${screen.faceReferenceImageIndex ? `; face identity reference=Image ${screen.faceReferenceImageIndex}` : ""})`,
    )
    .join("; ");
  const faceIdentityLock = renderVerticalDramaSpokenCallerFaceIdentityLockPromptBlock(policy);
  return [
    "SPOKEN CALLER VIRTUAL SCREENS (MANDATORY): every spoken phone caller must appear only inside a dedicated vertical virtual phone screen for the entire shot, with that caller's face clearly visible and readable while speaking.",
    `SEPARATE SCREEN ASSIGNMENTS (MANDATORY, in first-speaking order): ${screens}. Never merge multiple callers into one screen. Never show a spoken caller physically in the room, and never duplicate a caller outside the assigned screen. Keep non-speaking callers' mouths closed.`,
    faceIdentityLock,
  ].filter(Boolean).join(" ");
}

export function renderVerticalDramaSpokenCallerFaceIdentityLockPromptBlock(
  policy: VerticalDramaSpokenCallerVirtualScreenPolicy,
): string | undefined {
  if (policy.virtualScreens.length === 0) return undefined;
  const faceLocks = policy.virtualScreens
    .map(screen => {
      const reference = screen.faceReferenceImageIndex
        ? `Image ${screen.faceReferenceImageIndex} = ${screen.callerCharacterRef}`
        : "the attached approved caller portrait";
      return `screen_${screen.screenIndex}=${screen.callerCharacterRef} must use ${reference} as the sole face identity reference; match facial structure, eyes, nose, mouth, jawline, hairline, skin tone, and hairstyle; Never use a different face or invent a substitute identity`;
    })
    .join("; ");
  const attachedImageOrder = policy.virtualScreens.some(
    screen => screen.faceReferenceImageIndex
  )
    ? ` ATTACHED REFERENCE IMAGE ORDER (MANDATORY): physical-scene portraits come first; caller portraits are attached immediately after them; the location reference, if present, comes after all caller portraits. Ignore any earlier mapping that assigns a caller's image index to the location.`
    : "";
  return `CALLER FACE IDENTITY LOCK (MANDATORY): ${faceLocks}.${attachedImageOrder}`;
}
