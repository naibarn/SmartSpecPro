/**
 * Deterministic visual contract for phone/video-call callers.
 *
 * Caller role is always explicit. A selected caller must receive a virtual
 * screen even when dialogue resolution is empty; dialogue text may order the
 * screens and mark which callers speak, but it never creates a caller role by
 * itself.
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

export const VERTICAL_DRAMA_HARD_SPEAKER_MAP_MARKER =
  "HARD SPEAKER MAP (MANDATORY)";

export type VerticalDramaHardSpeakerMapLine = {
  characterKey?: string;
  speakerName?: string;
  lineTh?: string;
};

function renderSpeakerEntries(
  refs: readonly string[],
  names: readonly string[] | undefined,
): string {
  return refs
    .map((characterKey, index) =>
      `${names?.[index] ?? characterKey} [characterKey=${characterKey}]`
    )
    .join(", ");
}

/**
 * Deterministic speaker-to-face/location contract used both while authoring a
 * motion prompt and again at the paid provider boundary. A visual-cast block
 * alone is not sufficient: models can still attach a dialogue line to the
 * wrong visible face unless each line explicitly names its allowed body or
 * existing virtual screen.
 */
export function renderVerticalDramaHardSpeakerMapPromptBlock(params: {
  physicalCharacterRefs: readonly string[];
  physicalCharacterNames?: readonly string[];
  screenCallerCharacterRefs: readonly string[];
  screenCallerCharacterNames?: readonly string[];
  dialogueLines: readonly VerticalDramaHardSpeakerMapLine[];
  includeCanonicalLineText?: boolean;
}): string | undefined {
  const physicalRefs = Array.from(
    new Set(params.physicalCharacterRefs.map(value => value.trim()).filter(Boolean))
  );
  const callerRefs = Array.from(
    new Set(params.screenCallerCharacterRefs.map(value => value.trim()).filter(Boolean))
  );
  const callerSet = new Set(callerRefs);
  const physicalSet = new Set(physicalRefs);
  const lines = params.dialogueLines.filter(line => Boolean(line.lineTh?.trim()));
  if (physicalRefs.length === 0 && callerRefs.length === 0) {
    return undefined;
  }

  const physicalEntries = renderSpeakerEntries(
    physicalRefs,
    params.physicalCharacterNames,
  );
  const callerEntries = renderSpeakerEntries(
    callerRefs,
    params.screenCallerCharacterNames,
  );
  const lineMap = lines
    .map((line, index) => {
      const characterKey = line.characterKey?.trim();
      const speaker = line.speakerName?.trim() || characterKey || "the character";
      const role = characterKey && callerSet.has(characterKey)
        ? "the same existing virtual-screen face already visible in START_FRAME_IMAGE; never a physical body"
        : characterKey && physicalSet.has(characterKey)
          ? "the physical body already visible in START_FRAME_IMAGE"
          : "not assigned to a visible body by the server-resolved cast; do not add a person or screen for this line";
      const lineText = params.includeCanonicalLineText
        ? line.lineTh?.trim().slice(0, 500)
        : undefined;
      return `Line ${index + 1} ONLY: ${speaker}${characterKey ? ` [characterKey=${characterKey}]` : ""} — ${role}; only this speaker's mouth moves${lineText ? `; canonical line for audio/TTS routing: "${lineText}"` : ""}.`;
    })
    .join(" ");

  return [
    VERTICAL_DRAMA_HARD_SPEAKER_MAP_MARKER + ": preserve the exact speaker-to-face mapping from the approved START_FRAME_IMAGE.",
    `Physical scene speakers ONLY: ${physicalEntries || "none"}. Do not add a screen caller to the room, background, reflection, mirror, poster, or duplicate body.`,
    callerEntries
      ? `Existing virtual-screen speakers ONLY: ${callerEntries}. Use the exact caller inset/screen already visible in START_FRAME_IMAGE; keep it in the same place and do not create a new inset, second phone UI, floating extra window, or physical caller.`
      : null,
    lineMap || null,
    "Only the timed speaker moves their mouth. Every non-timed speaker keeps their mouth closed. No off-screen voice, extra character, identity swap, subtitle, music, cut, reset, or newly generated virtual screen. Audio delivery remains the existing dialogue/TTS path; do not invent another voice.",
  ]
    .filter(Boolean)
    .join(" ");
}

export const VERTICAL_DRAMA_HANDHELD_PHONE_DISPLAY_RULE =
  "PHYSICAL DEVICE DISPLAY RULE (MANDATORY): Every real phone, tablet, monitor, or other device in the physical scene is an ordinary non-identifying prop: keep its physical display blank, neutral, or unreadable. Never place the caller's face, portrait, or video-call UI on a real device display. The caller face belongs only in the separate floating virtual screen assigned below.";

export const VERTICAL_DRAMA_CALLER_VIRTUAL_SCREEN_FINAL_OVERRIDE_MARKER =
  "CALLER VIRTUAL SCREEN FINAL OUTPUT OVERRIDE (MANDATORY)";

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
  const physical = [
    ...new Set(
      params.physicalSceneCharacterRefs.map(v => v.trim()).filter(Boolean)
    ),
  ];
  const callers = [
    ...new Set(
      params.screenCallerCharacterRefs.map(v => v.trim()).filter(Boolean)
    ),
  ];
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

  // `screenCallerCharacterRefs` is an explicit user/storyboard role. Keep
  // every selected caller out of the physical cast even when that caller has
  // no resolved dialogue line for this shot.
  const callerSet = new Set(callers);
  const orderedScreenCallers = [
    ...spoken,
    ...callers.filter(caller => !spoken.includes(caller)),
  ];
  return {
    physicalSceneCharacterRefs: physical.filter(ref => !callerSet.has(ref)),
    screenCallerCharacterRefs: callers,
    spokenScreenCallerCharacterRefs: spoken,
    virtualScreens: orderedScreenCallers.map((callerCharacterRef, index) => ({
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
  policy: VerticalDramaSpokenCallerVirtualScreenPolicy
): string | undefined {
  if (policy.virtualScreens.length === 0) return undefined;
  const screens = policy.virtualScreens
    .map(
      screen =>
        `screen_${screen.screenIndex}=${screen.callerCharacterRef} (floating vertical virtual video-call screen/overlay, not a real phone, tablet, monitor, or physical display; caller face clearly visible and readable; screen remains visible throughout the entire shot; caller speaks only inside this screen and remains visible with mouth closed when not speaking${screen.faceReferenceImageIndex ? `; face identity reference=Image ${screen.faceReferenceImageIndex}` : ""})`
    )
    .join("; ");
  const faceIdentityLock =
    renderVerticalDramaSpokenCallerFaceIdentityLockPromptBlock(policy);
  return [
    `${VERTICAL_DRAMA_CALLER_VIRTUAL_SCREEN_FINAL_OVERRIDE_MARKER}: ignore any earlier caller/device-screen wording that conflicts with this block. Every selected phone/video-call caller must appear only inside a dedicated floating vertical virtual screen/overlay for the entire shot, with that caller's face clearly visible and readable; spoken callers speak only inside their assigned virtual screen.`,
    `SPOKEN CALLER VIRTUAL SCREENS (MANDATORY): ${screens}. Never merge multiple callers into one screen. Never show any caller physically in the room, as a standing/seated person, background extra, reflection, mirror image, photograph, poster, or duplicate body. Never show the caller on a real phone, tablet, monitor, or other physical device display. Never duplicate a caller outside the assigned floating virtual screen. ${VERTICAL_DRAMA_HANDHELD_PHONE_DISPLAY_RULE} Keep non-speaking callers' mouths closed.`,
    faceIdentityLock,
  ]
    .filter(Boolean)
    .join(" ");
}

export function renderVerticalDramaSpokenCallerFaceIdentityLockPromptBlock(
  policy: VerticalDramaSpokenCallerVirtualScreenPolicy
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
