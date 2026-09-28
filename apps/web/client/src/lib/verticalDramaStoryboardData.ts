/**
 * Normalize the two authoritative episode inputs into the one storyboard
 * contract consumed by the production panel.
 *
 * Normal episodes provide summaries/dialogue from the Overview episode plan.
 * Special tie-ins provide them from their persisted start-frame plan and
 * motion prompt pack. Everything downstream (shots, scene, characters,
 * products, and generation actions) must consume this same shape.
 */

export interface VerticalDramaUnifiedShotDraft {
  shotNumber: number;
  summary: string;
  dialogueLines: Array<{ speaker: string; line: string }>;
  silenceIntent?: string;
}

interface StoryboardRecord {
  storyboard_summary?: {
    episode_title?: string;
    visual_promise?: string;
  };
  canonical_style_bible?: { overall_style?: string };
  distinct_locations?: Array<Record<string, unknown>>;
  shots?: Array<Record<string, unknown>>;
}

interface StartFrameRecord {
  shotNumber?: unknown;
  canonicalShotSummary?: unknown;
  requiredCharacterRefs?: unknown;
  locationKey?: unknown;
  sceneDescription?: unknown;
}

interface MotionClipRecord {
  sourceShotNumbers?: unknown;
  parentShotNumber?: unknown;
  durationSeconds?: unknown;
  dialogue?: unknown;
}

interface DialogueAudioPlanRecord {
  dialogue_lines?: unknown;
  shotLines?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function shotNumber(value: Record<string, unknown>): number | undefined {
  return positiveNumber(value.shot_number ?? value.shotNumber);
}

function frameShotNumber(frame: StartFrameRecord): number | undefined {
  return positiveNumber(frame.shotNumber);
}

function clipMatchesShot(clip: MotionClipRecord, number: number): boolean {
  const sourceShotNumbers = Array.isArray(clip.sourceShotNumbers)
    ? clip.sourceShotNumbers
        .map(positiveNumber)
        .filter((value): value is number => value !== undefined)
    : [];
  return (
    sourceShotNumbers.includes(number) ||
    positiveNumber(clip.parentShotNumber) === number
  );
}

function normalizeDialogueLines(
  value: unknown,
  characterNames: Record<string, string>
): Array<{ speaker: string; line: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(entry => {
      const line = record(entry);
      if (!line) return null;
      const lineText = text(
        line.lineTh ?? line.line ?? line.text ?? line.dialogue_line
      );
      if (!lineText) return null;
      const key = text(
        line.characterKey ??
          line.speaker ??
          line.speakerKey ??
          line.speaker_character_key ??
          line.speakerCharacterKey
      );
      const speakerName = text(line.speaker_name ?? line.speakerName);
      return {
        speaker: speakerName || characterNames[key] || key || "—",
        line: lineText,
      };
    })
    .filter(
      (value): value is { speaker: string; line: string } => value !== null
    );
}

function normalizeDialogueAudioPlanLines(
  value: unknown,
  characterNames: Record<string, string>
): Map<number, Array<{ speaker: string; line: string }>> {
  const plan = record(value) as DialogueAudioPlanRecord | null;
  const rawLines = Array.isArray(plan?.dialogue_lines)
    ? plan.dialogue_lines
    : Array.isArray(plan?.shotLines)
      ? plan.shotLines
      : [];
  const result = new Map<number, Array<{ speaker: string; line: string }>>();

  for (const rawLine of rawLines) {
    const line = record(rawLine);
    if (!line) continue;
    const number = positiveNumber(line.shot_number ?? line.shotNumber);
    if (number === undefined) continue;
    const normalized = normalizeDialogueLines([line], characterNames)[0];
    if (!normalized) continue;
    const existing = result.get(number);
    if (existing) existing.push(normalized);
    else result.set(number, [normalized]);
  }

  return result;
}

function normalizeCanonicalDrafts(
  value: unknown,
  characterNames: Record<string, string>
): Map<number, VerticalDramaUnifiedShotDraft> {
  if (!Array.isArray(value)) return new Map();
  const result = new Map<number, VerticalDramaUnifiedShotDraft>();
  for (const entry of value) {
    const draft = record(entry);
    const number = draft
      ? positiveNumber(draft.shotNumber ?? draft.shot_number)
      : undefined;
    const summary = draft ? text(draft.summary ?? draft.story_summary) : "";
    if (!draft || number === undefined || !summary) continue;
    result.set(number, {
      shotNumber: number,
      summary,
      dialogueLines: normalizeDialogueLines(
        draft.dialogueLines ?? draft.dialogue_lines,
        characterNames
      ),
      ...(text(draft.silenceIntent ?? draft.silence_intent)
        ? { silenceIntent: text(draft.silenceIntent ?? draft.silence_intent) }
        : {}),
    });
  }
  return result;
}

function normalizeStoryboardShot(
  value: Record<string, unknown>,
  frame: StartFrameRecord | undefined,
  clip: MotionClipRecord | undefined
): Record<string, unknown> | null {
  const number =
    shotNumber(value) ?? (frame ? frameShotNumber(frame) : undefined);
  if (number === undefined) return null;
  const requiredCharacterRefs = Array.isArray(frame?.requiredCharacterRefs)
    ? frame?.requiredCharacterRefs.map(text).filter(Boolean)
    : Array.isArray(value.required_character_refs)
      ? value.required_character_refs.map(text).filter(Boolean)
      : Array.isArray(value.characters)
        ? value.characters.map(text).filter(Boolean)
        : Array.isArray(value.characterIds)
          ? value.characterIds.map(text).filter(Boolean)
          : undefined;
  const summary =
    text(value.visual_description ?? value.description ?? value.summary) ||
    text(frame?.canonicalShotSummary);
  const action = text(value.action);
  const duration = positiveNumber(
    value.duration_seconds ?? value.durationSeconds ?? clip?.durationSeconds
  );
  return {
    ...value,
    shot_number: number,
    ...(summary ? { visual_description: summary } : {}),
    ...(action ? { action } : {}),
    ...(requiredCharacterRefs?.length
      ? { required_character_refs: requiredCharacterRefs }
      : {}),
    ...(duration ? { duration_seconds: duration } : {}),
  };
}

export function buildVerticalDramaUnifiedStoryboardData(input: {
  episodeTitle?: string | null;
  storyboard?: unknown;
  episodePlanShotDrafts?: unknown;
  startFramePlan?: { frames?: unknown[] } | null;
  motionPromptPack?: { clips?: unknown[] } | null;
  dialogueAudioPlan?: unknown;
  characterPortraits?: Record<string, { name?: string }> | null;
}): {
  storyboard: StoryboardRecord | null;
  canonicalShotDrafts: VerticalDramaUnifiedShotDraft[];
} {
  const sourceStoryboard = record(input.storyboard);
  const frames = (input.startFramePlan?.frames ?? [])
    .map(record)
    .filter(
      (value): value is Record<string, unknown> => value !== null
    ) as StartFrameRecord[];
  const clips = (input.motionPromptPack?.clips ?? [])
    .map(record)
    .filter(
      (value): value is Record<string, unknown> => value !== null
    ) as MotionClipRecord[];
  const frameByShot = new Map(
    frames
      .map(frame => [frameShotNumber(frame), frame] as const)
      .filter(
        (entry): entry is [number, StartFrameRecord] => entry[0] !== undefined
      )
  );
  const characterNames = Object.fromEntries(
    Object.entries(input.characterPortraits ?? {})
      .map(([key, portrait]) => [key, text(portrait?.name)] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  const dialogueAudioPlanByShot = normalizeDialogueAudioPlanLines(
    input.dialogueAudioPlan,
    characterNames
  );
  const legacyClipDialogueByShot = new Map<
    number,
    Array<{ speaker: string; line: string }>
  >();
  for (const clip of clips) {
    const dialogueLines = normalizeDialogueLines(clip.dialogue, characterNames);
    if (dialogueLines.length === 0) continue;
    const shotNumbers = Array.from(
      new Set([
        ...(Array.isArray(clip.sourceShotNumbers)
          ? clip.sourceShotNumbers
              .map(positiveNumber)
              .filter((value): value is number => value !== undefined)
          : []),
        ...(positiveNumber(clip.parentShotNumber) !== undefined
          ? [positiveNumber(clip.parentShotNumber)!]
          : []),
      ])
    );
    for (const number of shotNumbers) {
      if (dialogueAudioPlanByShot.has(number)) continue;
      const existing = legacyClipDialogueByShot.get(number);
      if (existing) existing.push(...dialogueLines);
      else legacyClipDialogueByShot.set(number, [...dialogueLines]);
    }
  }
  const dialogueByShot = new Map(dialogueAudioPlanByShot);
  for (const [number, dialogueLines] of legacyClipDialogueByShot) {
    if (!dialogueByShot.has(number)) dialogueByShot.set(number, dialogueLines);
  }

  const sourceShots = Array.isArray(sourceStoryboard?.shots)
    ? sourceStoryboard.shots
        .map(record)
        .filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const shotNumbers = new Set<number>();
  const shots: Array<Record<string, unknown>> = [];
  for (const sourceShot of sourceShots) {
    const number = shotNumber(sourceShot);
    const frame = number === undefined ? undefined : frameByShot.get(number);
    const clip =
      number === undefined
        ? undefined
        : clips.find(value => clipMatchesShot(value, number));
    const normalized = normalizeStoryboardShot(sourceShot, frame, clip);
    if (!normalized) continue;
    shotNumbers.add(Number(normalized.shot_number));
    shots.push(normalized);
  }
  for (const frame of frames) {
    const number = frameShotNumber(frame);
    if (number === undefined || shotNumbers.has(number)) continue;
    const clip = clips.find(value => clipMatchesShot(value, number));
    const normalized = normalizeStoryboardShot({}, frame, clip);
    if (!normalized) continue;
    shotNumbers.add(number);
    shots.push(normalized);
  }
  shots.sort(
    (left, right) => Number(left.shot_number) - Number(right.shot_number)
  );

  if (shots.length === 0) {
    return { storyboard: null, canonicalShotDrafts: [] };
  }

  const canonicalDrafts = normalizeCanonicalDrafts(
    input.episodePlanShotDrafts,
    characterNames
  );

  // `dialogueAudioPlan` is the durable shot-level dialogue source. In
  // particular, special tie-in image approval can remove a not-yet-authored
  // motion clip, so the clip's dialogue must never be the only copy used by
  // the storyboard UI. Keep an existing Overview draft as the highest-
  // priority authored source, and fill only missing dialogue from the plan.
  for (const [number, dialogueLines] of dialogueByShot) {
    const existing = canonicalDrafts.get(number);
    if (!existing || existing.dialogueLines.length === 0) {
      if (existing) {
        canonicalDrafts.set(number, { ...existing, dialogueLines });
      }
    }
  }

  for (const frame of frames) {
    const number = frameShotNumber(frame);
    const summary = text(frame.canonicalShotSummary);
    if (number === undefined || canonicalDrafts.has(number) || !summary)
      continue;
    const dialogueLines = dialogueByShot.get(number) ?? [];
    canonicalDrafts.set(number, { shotNumber: number, summary, dialogueLines });
  }
  for (const shot of shots) {
    const number = Number(shot.shot_number);
    if (canonicalDrafts.has(number)) continue;
    const summary = text(shot.visual_description);
    if (summary) {
      canonicalDrafts.set(number, {
        shotNumber: number,
        summary,
        dialogueLines: [],
      });
    }
  }

  const storyboardSummary = sourceStoryboard?.storyboard_summary ?? {
    episode_title: input.episodeTitle ?? undefined,
    visual_promise: "Unified episode storyboard",
  };
  return {
    storyboard: {
      ...sourceStoryboard,
      storyboard_summary: storyboardSummary,
      shots,
    },
    canonicalShotDrafts: Array.from(canonicalDrafts.values()).sort(
      (left, right) => left.shotNumber - right.shotNumber
    ),
  };
}
