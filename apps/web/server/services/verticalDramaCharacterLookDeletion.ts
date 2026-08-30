import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";

const DELETED_LOOK_FALLBACK_REASON =
  "ลุคเดิมถูกลบ จึงเปลี่ยนกลับไปใช้ภาพตัวละครหลัก";

function replaceAndDedupeKeys(
  keys: readonly string[] | undefined,
  fromKey: string,
  toKey: string
): { value: string[] | undefined; changed: boolean } {
  if (!Array.isArray(keys)) return { value: keys, changed: false };

  const value: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const key of keys) {
    const nextKey = key === fromKey ? toKey : key;
    if (nextKey !== key) changed = true;
    if (seen.has(nextKey)) {
      changed = true;
      continue;
    }
    seen.add(nextKey);
    value.push(nextKey);
  }
  return { value, changed };
}

/**
 * Repairs a persisted start-frame plan before a variant/look row is deleted.
 * A deleted look is a reference replacement, not a cast removal: every shot
 * that used it must continue using the parent character's primary portrait.
 * Prompt text is cleared whenever a reference changed because it may contain
 * the deleted look's wardrobe description.
 */
export function repairStartFramePlanAfterLookDeletion(params: {
  plan: VerticalDramaStartFramePlan;
  deletedLookKey: string;
  parentCharacterKey: string;
}): {
  plan: VerticalDramaStartFramePlan;
  changedShots: number[];
} {
  const { plan, deletedLookKey, parentCharacterKey } = params;
  if (!Array.isArray(plan.frames) || deletedLookKey === parentCharacterKey) {
    return { plan, changedShots: [] };
  }

  const changedShots: number[] = [];
  const frames = plan.frames.map(frame => {
    const required = replaceAndDedupeKeys(
      frame.requiredCharacterRefs,
      deletedLookKey,
      parentCharacterKey
    );
    const callers = replaceAndDedupeKeys(
      frame.screenCallerCharacterRefs,
      deletedLookKey,
      parentCharacterKey
    );
    let assignmentsChanged = false;
    const assignments = frame.characterLookAssignments?.map(assignment => {
      const baseCharacterKey =
        assignment.baseCharacterKey === deletedLookKey
          ? parentCharacterKey
          : assignment.baseCharacterKey;
      const selectedLookKey =
        assignment.selectedLookKey === deletedLookKey
          ? parentCharacterKey
          : assignment.selectedLookKey;
      if (
        baseCharacterKey === assignment.baseCharacterKey &&
        selectedLookKey === assignment.selectedLookKey
      ) {
        return assignment;
      }

      assignmentsChanged = true;
      const {
        canonicalIntent: _canonicalIntent,
        requestedLabel: _requestedLabel,
        requestedRequestKey: _requestedRequestKey,
        imageBrief: _imageBrief,
        ...rest
      } = assignment;
      return {
        ...rest,
        baseCharacterKey,
        selectedLookKey,
        mode: "base" as const,
        status: "ready" as const,
        reason: DELETED_LOOK_FALLBACK_REASON,
        confidence: 1,
      };
    });

    const changed = required.changed || callers.changed || assignmentsChanged;
    if (!changed) return frame;

    changedShots.push(frame.shotNumber);
    return {
      ...frame,
      ...(required.changed ? { requiredCharacterRefs: required.value! } : {}),
      ...(callers.changed ? { screenCallerCharacterRefs: callers.value } : {}),
      ...(assignmentsChanged ? { characterLookAssignments: assignments } : {}),
      imagePrompt: "",
      negativePrompt: "",
    };
  });

  return changedShots.length > 0
    ? { plan: { ...plan, frames }, changedShots }
    : { plan, changedShots };
}
