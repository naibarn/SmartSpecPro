/** A roster look used by the deterministic per-shot selector. */
export interface VerticalDramaCharacterLookCatalogEntry {
  characterKey: string;
  name: string;
  parentCharacterKey?: string;
  variantLabel?: string;
  variantType?: "outfit" | "age_stage";
  description?: string;
  wardrobeRules?: string[];
  hasPortrait?: boolean;
}

export interface VerticalDramaLookSelectionShot {
  shotNumber: number;
  characterKeys: string[];
  text: string;
  sceneKey?: string;
  locationKey?: string;
  timeKey?: string;
}

export type VerticalDramaCharacterLookAssignmentMode =
  | "base"
  | "matched_existing"
  | "needs_new_look"
  | "manual_override";

export type VerticalDramaCharacterLookAssignmentStatus =
  | "ready"
  | "waiting_for_portrait"
  | "review";

/** Persisted on a start-frame frame; additive so legacy plans remain valid. */
export interface VerticalDramaCharacterLookAssignment {
  baseCharacterKey: string;
  selectedLookKey: string;
  mode: VerticalDramaCharacterLookAssignmentMode;
  status: VerticalDramaCharacterLookAssignmentStatus;
  canonicalIntent?: string;
  requestedLabel?: string;
  imageBrief?: string;
  reason: string;
  confidence: number;
}

export interface VerticalDramaCharacterLookSelectionResult {
  assignmentsByShotNumber: Map<
    number,
    VerticalDramaCharacterLookAssignment[]
  >;
  characterKeysByShotNumber: Map<number, string[]>;
  suggestions: VerticalDramaCharacterLookSuggestion[];
}

export interface VerticalDramaCharacterLookSuggestion {
  baseCharacterKey: string;
  parentCharacterKey: string;
  variantLabel: string;
  variantType: "outfit" | "age_stage";
  canonicalIntent: string;
  description: string;
  imageBrief: string;
  sourceShotNumbers: number[];
}

/**
 * Maximum size for the reusable, persisted visual brief of a character look.
 * This is intentionally separate from the 500-character, per-render
 * `customInstruction` request field used by the character-image router.
 */
export const VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH = 2000;

/**
 * Normalize a persisted look brief without allowing an unusually large JSON
 * field to balloon every downstream visual prompt. The ellipsis makes a
 * defensive truncation visible to prompt authors while keeping the pipeline
 * recoverable instead of rejecting the user's generation request.
 */
export function normalizeVerticalDramaCharacterLookImageBrief(
  value: unknown
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length <= VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH) {
    return normalized;
  }
  const cutoff = normalized
    .slice(0, VERTICAL_DRAMA_LOOK_IMAGE_BRIEF_MAX_LENGTH - 1)
    .trimEnd();
  return `${cutoff}…`;
}

type LookIntent = {
  key: string;
  label: string;
  variantType: "outfit" | "age_stage";
  phrases: readonly string[];
};

const LOOK_INTENTS: readonly LookIntent[] = [
  {
    key: "newborn",
    label: "วัยทารกแรกเกิด",
    variantType: "age_stage",
    phrases: [
      "เด็กทารก",
      "ทารก",
      "เด็กแรกเกิด",
      "เพิ่งคลอด",
      "พึ่งคลอด",
      "คลอดใหม่",
      "วัยแรกเกิด",
      "ทารกน้อย",
      "newborn",
      "infant",
      "baby",
    ],
  },
  {
    key: "sleepwear",
    label: "ชุดนอน",
    variantType: "outfit",
    phrases: [
      "เข้านอน",
      "นอนหลับ",
      "คุยบนเตียง",
      "กำลังนอน",
      "นอนบนเตียง",
      "ห้องนอน",
      "บนเตียง",
      "บนเตียงนอน",
      "เตียงนอน",
      "ชุดนอน",
      "ชุดใส่นอน",
      "เสื้อผ้านอน",
      "pajama",
      "sleepwear",
      "bedtime",
    ],
  },
  {
    key: "casual_home",
    label: "ชุดลำลองอยู่บ้าน",
    variantType: "outfit",
    phrases: [
      "ชุดลำลอง",
      "ลุคลำลอง",
      "เสื้อผ้าลำลอง",
      "อยู่บ้าน",
      "ในบ้าน",
      "บ้านพัก",
      "ที่บ้าน",
      "ห้องนั่งเล่น",
      "casual wear",
      "casual outfit",
      "at home",
      "homewear",
    ],
  },
  {
    key: "evening_formal",
    label: "ชุดราตรี",
    variantType: "outfit",
    phrases: [
      "งานกลางคืน",
      "งานเลี้ยงกลางคืน",
      "ดินเนอร์",
      "งานกาลา",
      "งานเลี้ยง",
      "ชุดราตรี",
      "ชุดออกงาน",
      "เดรสออกงาน",
      "evening gown",
      "evening dress",
      "formal dress",
      "gala",
      "night party",
    ],
  },
  {
    key: "school_uniform",
    label: "ชุดนักเรียน",
    variantType: "outfit",
    phrases: [
      "โรงเรียน",
      "ไปเรียน",
      "ชุดนักเรียน",
      "ห้องเรียน",
      "school uniform",
      "at school",
    ],
  },
  {
    key: "workwear",
    label: "ชุดทำงาน",
    variantType: "outfit",
    phrases: [
      "ไปทำงาน",
      "ที่ทำงาน",
      "ออฟฟิศ",
      "ชุดทำงาน",
      "สำนักงาน",
      "workwear",
      "office outfit",
    ],
  },
];

function normalizeLookText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function readableText(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function findIntentMatches(text: string): LookIntent[] {
  const normalized = normalizeLookText(text);
  return LOOK_INTENTS.filter(intent =>
    intent.phrases.some(phrase => normalized.includes(normalizeLookText(phrase)))
  );
}

function findIntent(text: string): LookIntent | undefined {
  return findIntentMatches(text)[0];
}

function findConflictingIntents(text: string): LookIntent[] {
  const matches = findIntentMatches(text);
  const ageStageMatches = matches.filter(
    intent => intent.variantType === "age_stage"
  );
  const outfitMatches = matches.filter(intent => intent.variantType === "outfit");
  const incompatibleAgeAndOutfit =
    ageStageMatches.some(intent => intent.key === "newborn") &&
    outfitMatches.some(intent =>
      ["school_uniform", "workwear"].includes(intent.key)
    );
  const incompatibleOutfitPair = outfitMatches.some((left, index) =>
    outfitMatches.slice(index + 1).some(right => {
      const compatible = new Set([left.key, right.key]);
      return !(compatible.has("sleepwear") && compatible.has("casual_home"));
    })
  );
  if (
    ageStageMatches.length > 1 ||
    incompatibleOutfitPair ||
    incompatibleAgeAndOutfit
  ) {
    return matches;
  }
  return [];
}

const CONTEXT_TRANSITION_PHRASES = [
  "วันถัดมา",
  "วันรุ่งขึ้น",
  "เช้าวันต่อมา",
  "หลายชั่วโมงต่อมา",
  "เวลาต่อมา",
  "ต่อมา",
  "สถานที่ใหม่",
  "อีกสถานที่หนึ่ง",
  "ย้ายสถานที่",
  "เดินทางไป",
  "the next day",
  "the following day",
  "later that day",
  "hours later",
  "new location",
  "elsewhere",
] as const;

const TEXT_TIME_BUCKETS = [
  { key: "morning", phrases: ["ตอนเช้า", "ยามเช้า", "รุ่งเช้า", "morning"] },
  { key: "day", phrases: ["ตอนกลางวัน", "ช่วงกลางวัน", "กลางวัน", "daytime"] },
  { key: "evening", phrases: ["ตอนเย็น", "ยามเย็น", "ช่วงเย็น", "evening"] },
  { key: "night", phrases: ["ตอนกลางคืน", "กลางคืน", "ยามค่ำ", "ค่ำคืน", "at night", "nighttime"] },
] as const;

function findTextTimeBucket(text: string): string | undefined {
  const normalized = normalizeLookText(text);
  return TEXT_TIME_BUCKETS.find(bucket =>
    bucket.phrases.some(phrase => normalized.includes(normalizeLookText(phrase)))
  )?.key;
}

function hasMeaningfulTextContextTransition(
  previousText: string,
  currentText: string
): boolean {
  const currentNormalized = normalizeLookText(currentText);
  if (
    CONTEXT_TRANSITION_PHRASES.some(phrase =>
      currentNormalized.includes(normalizeLookText(phrase))
    )
  ) {
    return true;
  }
  const previousTime = findTextTimeBucket(previousText);
  const currentTime = findTextTimeBucket(currentText);
  return Boolean(previousTime && currentTime && previousTime !== currentTime);
}

function resolveShotIntent(text: string): {
  intent?: LookIntent;
  conflicts: LookIntent[];
} {
  const conflicts = findConflictingIntents(text);
  if (conflicts.length > 0) return { conflicts };
  const matches = findIntentMatches(text);
  // Age-stage correctness outranks an outfit cue when both are compatible,
  // e.g. a newborn wearing safe sleepwear.
  return {
    intent:
      matches.find(match => match.variantType === "age_stage") ?? matches[0],
    conflicts,
  };
}

function catalogText(entry: VerticalDramaCharacterLookCatalogEntry): string {
  return [
    entry.variantLabel,
    entry.description,
    ...(entry.wardrobeRules ?? []),
  ]
    .map(readableText)
    .filter(Boolean)
    .join(" ");
}

function intentForEntry(
  entry: VerticalDramaCharacterLookCatalogEntry
): LookIntent | undefined {
  return findIntent(catalogText(entry));
}

function getFamilyKey(entry: VerticalDramaCharacterLookCatalogEntry): string {
  return entry.parentCharacterKey ?? entry.characterKey;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function canonicalDescription(
  intent: LookIntent,
  shotText: string,
  base: VerticalDramaCharacterLookCatalogEntry
): string {
  const identity = readableText(base.description) || readableText(base.name);
  const context = readableText(shotText).slice(0, 700);
  if (intent.key === "newborn") {
    return `${identity}; same character identity represented as a newborn/infant, with age-appropriate proportions and safe neutral baby clothing, suitable for a reusable character reference portrait. Story evidence: ${context}`;
  }
  return `${identity}; ${intent.label}, age and identity unchanged, with clothing and styling appropriate to the requested context. Story evidence: ${context}`;
}

/**
 * Expand a short story cue into a reusable image brief. This is intentionally
 * deterministic and free: the subsequent character-image flow can still use
 * its own prompt skill, but it now receives enough concrete facts to avoid
 * inventing an unrelated wardrobe from a one-line label.
 */
export function buildVerticalDramaCharacterLookImageBrief(params: {
  base: VerticalDramaCharacterLookCatalogEntry;
  intent: string;
  label: string;
  shotText: string;
}): string {
  const identity = readableText(params.base.description) || params.base.name;
  const context = readableText(params.shotText).slice(0, 700);
  return normalizeVerticalDramaCharacterLookImageBrief([
    `Reusable character reference portrait for ${params.base.name}.`,
    `Preserve the same person's identity, face structure, signature hair and defining features from the base character facts: ${identity}.`,
    `Required look: ${params.label} (canonical intent: ${params.intent}).`,
    `Design the complete age-appropriate wardrobe: garment pieces, material, fit, color palette, footwear or safe accessories, hair and makeup/styling. Keep the requested look clearly readable and internally consistent.`,
    `Use a clean portrait-oriented composition with the full upper body visible, neutral studio-like background, flattering soft light, realistic anatomy, natural skin texture, and no text, watermark, logos, extra people, or distracting props.`,
    `Do not change the person's identity except for the requested age-stage or wardrobe change. Do not merge this look with another look.`,
    `Source shot context (use only to explain the requested look): ${context}`,
  ].join(" ")) ?? "";
}

function scoreCandidate(params: {
  entry: VerticalDramaCharacterLookCatalogEntry;
  intent?: LookIntent;
  currentKey?: string;
  recentKeys: readonly string[];
  transition: boolean;
}): number {
  const entryIntent = intentForEntry(params.entry);
  let score = params.entry.parentCharacterKey ? 55 : 50;
  if (params.intent) {
    if (entryIntent?.key === params.intent.key) score += 60;
    else if (entryIntent?.variantType === params.intent.variantType) score += 8;
    else score -= 35;
  }
  if (params.entry.characterKey === params.currentKey) score += 12;
  if (params.transition && params.entry.characterKey !== params.currentKey) {
    score += params.recentKeys.includes(params.entry.characterKey) ? -12 : 12;
  }
  if (!params.entry.hasPortrait) score -= 1;
  return score;
}

/**
 * Select looks in shot order. It deliberately returns a proposal instead of
 * throwing for a missing/ambiguous look; the caller can materialize the
 * proposal as a portrait-less variant and keep the pipeline successful.
 */
export function selectVerticalDramaCharacterLooks(params: {
  shots: readonly VerticalDramaLookSelectionShot[];
  catalog: readonly VerticalDramaCharacterLookCatalogEntry[];
  manualShotNumbers?: ReadonlySet<number>;
}): VerticalDramaCharacterLookSelectionResult {
  const catalogByKey = new Map(
    params.catalog.map(entry => [entry.characterKey, entry])
  );
  const familyEntries = new Map<string, VerticalDramaCharacterLookCatalogEntry[]>();
  for (const entry of params.catalog) {
    const family = getFamilyKey(entry);
    const list = familyEntries.get(family) ?? [];
    list.push(entry);
    familyEntries.set(family, list);
  }

  const assignmentsByShotNumber = new Map<
    number,
    VerticalDramaCharacterLookAssignment[]
  >();
  const characterKeysByShotNumber = new Map<number, string[]>();
  const suggestionsByIdentity = new Map<string, VerticalDramaCharacterLookSuggestion>();
  const recentByFamily = new Map<string, string[]>();
  const priorShot = new Map<string, VerticalDramaLookSelectionShot>();

  for (const shot of [...params.shots].sort((a, b) => a.shotNumber - b.shotNumber)) {
    const manual = params.manualShotNumbers?.has(shot.shotNumber) === true;
    const assignments: VerticalDramaCharacterLookAssignment[] = [];
    const nextKeys: string[] = [];
    const currentFamilies = new Set<string>();

    for (const rawKey of uniqueStrings(shot.characterKeys)) {
      const currentEntry = catalogByKey.get(rawKey);
      if (!currentEntry) {
        nextKeys.push(rawKey);
        continue;
      }
      const familyKey = getFamilyKey(currentEntry);
      if (currentFamilies.has(familyKey)) continue;
      currentFamilies.add(familyKey);
      const family = familyEntries.get(familyKey) ?? [currentEntry];
      const base = family.find(entry => !entry.parentCharacterKey) ?? currentEntry;
      const { intent, conflicts } = resolveShotIntent(shot.text);
      const prior = priorShot.get(familyKey);
      const transition = Boolean(
        prior &&
          (prior.sceneKey !== shot.sceneKey ||
            prior.locationKey !== shot.locationKey ||
            prior.timeKey !== shot.timeKey ||
            hasMeaningfulTextContextTransition(prior.text, shot.text))
      );
      const recentKeys = recentByFamily.get(familyKey) ?? [];
      const carriedLookKey = recentKeys[recentKeys.length - 1] ?? rawKey;
      const carriedLookEntry = catalogByKey.get(carriedLookKey) ?? currentEntry;

      if (manual) {
        nextKeys.push(rawKey);
        assignments.push({
          baseCharacterKey: familyKey,
          selectedLookKey: rawKey,
          mode: "manual_override",
          status: currentEntry.hasPortrait === false ? "waiting_for_portrait" : "ready",
          reason: "ผู้ใช้เลือก reference ของช็อตนี้เอง",
          confidence: 1,
        });
        recentByFamily.set(familyKey, [...recentKeys, rawKey].slice(-4));
        priorShot.set(familyKey, shot);
        continue;
      }

      if (conflicts.length > 0) {
        const conflictLabels = uniqueStrings(conflicts.map(match => match.label));
        const selected = carriedLookEntry;
        const status: VerticalDramaCharacterLookAssignmentStatus = "review";
        nextKeys.push(selected.characterKey);
        assignments.push({
          baseCharacterKey: familyKey,
          selectedLookKey: selected.characterKey,
          mode: selected.parentCharacterKey ? "matched_existing" : "base",
          status,
          reason:
            "พบสัญญาณลุคขัดแย้งกัน (" +
            conflictLabels.join(", ") +
            ") จึงรักษาลุคปัจจุบันและรอการตรวจสอบ",
          confidence: 0.2,
        });
        recentByFamily.set(familyKey, [
          ...recentKeys,
          selected.characterKey,
        ].slice(-4));
        priorShot.set(familyKey, shot);
        continue;
      }

      const ranked = family
        .map(entry => ({
          entry,
          score: scoreCandidate({
            entry,
            intent,
            currentKey: carriedLookKey,
            recentKeys,
            transition,
          }),
        }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0]?.entry ?? currentEntry;
      const bestIntent = intentForEntry(best);
      const explicitMatch = Boolean(intent && bestIntent?.key === intent.key);
      const currentIntent = intentForEntry(carriedLookEntry);
      const currentFits = Boolean(intent && currentIntent?.key === intent.key);
      const clearRequirement = Boolean(intent);
      const transitionNeedsLook = Boolean(
        !intent &&
          transition &&
          family.length === 1 &&
          !carriedLookEntry.parentCharacterKey
      );
      const requestedIntent = intent
        ? {
            key: intent.key,
            label: intent.label,
            variantType: intent.variantType,
          }
        : transitionNeedsLook
          ? {
              key: "scene_transition",
              label: "ลุคเปลี่ยนฉาก",
              variantType: "outfit" as const,
            }
          : undefined;
      let selected = best;
      let mode: VerticalDramaCharacterLookAssignmentMode = "base";
      let status: VerticalDramaCharacterLookAssignmentStatus = "ready";
      let reason = "ไม่มีสัญญาณเปลี่ยนลุคที่ชัดเจน จึงรักษาความต่อเนื่องของลุคเดิม";
      let confidence = 0.62;

      if (
        (clearRequirement && !explicitMatch && !currentFits) ||
        transitionNeedsLook
      ) {
        const canonicalIntent = requestedIntent!.key;
        const identity = `${familyKey}::${canonicalIntent}`;
        const description = intent
          ? canonicalDescription(intent, shot.text, base)
          : `${readableText(base.description) || readableText(base.name)}; refreshed wardrobe for a meaningful scene/location/time transition, identity unchanged, coordinated with the new story context. Story evidence: ${readableText(shot.text).slice(0, 700)}`;
        const imageBrief = buildVerticalDramaCharacterLookImageBrief({
          base,
          intent: canonicalIntent,
          label: requestedIntent!.label,
          shotText: shot.text,
        });
        const suggestion = suggestionsByIdentity.get(identity);
        if (suggestion) {
          if (!suggestion.sourceShotNumbers.includes(shot.shotNumber)) {
            suggestion.sourceShotNumbers.push(shot.shotNumber);
          }
        } else {
          suggestionsByIdentity.set(identity, {
            baseCharacterKey: familyKey,
            parentCharacterKey: familyKey,
            variantLabel: requestedIntent!.label,
            variantType: requestedIntent!.variantType,
            canonicalIntent,
            description,
            imageBrief,
            sourceShotNumbers: [shot.shotNumber],
          });
        }
        // The caller assigns the stable key after idempotent materialization.
        // Keep the base key in this pure result until that key is supplied by
        // the persistence layer; this prevents an invented key from entering
        // the render contract.
        selected = currentEntry;
        mode = "needs_new_look";
        status = "waiting_for_portrait";
        reason = intent
          ? `ช็อตนี้ระบุลุค${intent.label} แต่ยังไม่มีลุคที่ตรงกันในตัวละคร`
          : "เวลา/ฉากเปลี่ยนและตัวละครยังมีลุคเดียว จึงเสนอ slot ลุคใหม่แบบใช้ซ้ำได้";
        confidence = 0.9;
      } else if (explicitMatch && best.characterKey !== rawKey) {
        selected = best;
        mode = "matched_existing";
        status = best.hasPortrait === false ? "waiting_for_portrait" : "ready";
        reason = `เลือกลุค${intent!.label} ให้ตรงกับบริบทของช็อต`;
        confidence = best.hasPortrait === false ? 0.88 : 0.96;
      } else if (
        !intent &&
        transition &&
        best.characterKey !== rawKey &&
        best.parentCharacterKey &&
        !recentKeys.includes(best.characterKey)
      ) {
        selected = best;
        mode = "matched_existing";
        status = best.hasPortrait === false ? "waiting_for_portrait" : "ready";
        reason = "เปลี่ยนฉาก/สถานที่ จึงหมุนไปใช้ลุคเดิมที่เหมาะสมและไม่ได้เพิ่งใช้";
        confidence = 0.78;
      } else {
        selected = carriedLookEntry;
        mode = carriedLookEntry.parentCharacterKey ? "matched_existing" : "base";
        status = carriedLookEntry.hasPortrait === false ? "waiting_for_portrait" : "ready";
        if (carriedLookEntry.parentCharacterKey) {
          reason = "ไม่พบเหตุผลชัดเจนให้เปลี่ยน จึงรักษาลุคปัจจุบันเพื่อความต่อเนื่อง";
        }
      }

      nextKeys.push(selected.characterKey);
      assignments.push({
        baseCharacterKey: familyKey,
        selectedLookKey: selected.characterKey,
        mode,
        status,
        ...(requestedIntent ? { canonicalIntent: requestedIntent.key } : {}),
        ...(mode === "needs_new_look"
          ? {
              requestedLabel: requestedIntent!.label,
              imageBrief: suggestionsByIdentity.get(`${familyKey}::${requestedIntent!.key}`)?.imageBrief,
            }
          : {}),
        reason,
        confidence,
      });
      recentByFamily.set(familyKey, [...recentKeys, selected.characterKey].slice(-4));
      priorShot.set(familyKey, shot);
    }

    assignmentsByShotNumber.set(shot.shotNumber, assignments);
    characterKeysByShotNumber.set(shot.shotNumber, uniqueStrings(nextKeys));
  }

  return {
    assignmentsByShotNumber,
    characterKeysByShotNumber,
    suggestions: Array.from(suggestionsByIdentity.values()),
  };
}

/** Stable semantic identity used by the persistence layer for de-duplication. */
export function getVerticalDramaCharacterLookSemanticKey(params: {
  parentCharacterKey: string;
  canonicalIntent: string;
  variantType: "outfit" | "age_stage";
}): string {
  return `${params.parentCharacterKey.trim()}::${params.variantType}::${normalizeLookText(params.canonicalIntent)}`;
}

/** Exposed for tests and future vocabulary expansion. */
export function detectVerticalDramaCharacterLookIntent(
  text: string
): { key: string; label: string; variantType: "outfit" | "age_stage" } | null {
  const intent = findIntent(text);
  return intent
    ? { key: intent.key, label: intent.label, variantType: intent.variantType }
    : null;
}

/** Returns canonical labels when a shot contains incompatible look cues. */
export function detectVerticalDramaCharacterLookConflict(
  text: string
): string[] {
  return uniqueStrings(findConflictingIntents(text).map(intent => intent.label));
}
