export type VerticalDramaEpisodeCoverStatus = "generating" | "ready" | "failed";

export type VerticalDramaEpisodeCoverSafetyReview = {
  checked: true;
  mode: "vertical_drama_cover";
  skillId: string;
  skillVersion: string;
  riskLevel: "low" | "medium" | "high";
  rewritten: boolean;
  fallback: boolean;
  blocked: boolean;
  originalPromptHash: string;
  safePromptHash: string;
  changes: string[];
  preservedIntent: string[];
};

export const verticalDramaEpisodeCoverSlotIds = [1, 2, 3, 4] as const;
export type VerticalDramaEpisodeCoverSlotId =
  (typeof verticalDramaEpisodeCoverSlotIds)[number];

/** Internal JSONB state for one episode cover. */
export type VerticalDramaEpisodeCoverState = {
  status: VerticalDramaEpisodeCoverStatus;
  pendingTaskId?: string;
  mediaAssetId?: string;
  modelId?: string;
  sourceShotNumbers?: number[];
  prompt?: string;
  generatedAt?: string;
  source?: "generated" | "upload";
  error?: string;
  /** The last provider failure was transient and may be retried safely. */
  retryable?: boolean;
  /** Number of automatic provider retries already attempted. */
  retryCount?: number;
  /** Server-only replay key. Never expose this through a client projection. */
  idempotencyKey?: string;
  /** Server-only stale-task cleanup handle for a manual replacement. */
  supersededTaskId?: string;
  /** Internal record of how this variant selected scene references. */
  referenceStrategy?: "one" | "two" | "three" | "random";
  referenceImageCount?: number;
  /** Bounded server-side record of the cover prompt safety preparation. */
  safetyReview?: VerticalDramaEpisodeCoverSafetyReview;
};

export type VerticalDramaEpisodeCoverVariantsEnvelope = {
  version: 2;
  activeSlotId?: VerticalDramaEpisodeCoverSlotId;
  variants: Array<{
    slotId: VerticalDramaEpisodeCoverSlotId;
    state: VerticalDramaEpisodeCoverState;
  }>;
};

export type VerticalDramaEpisodeCoverDisplay = {
  status: VerticalDramaEpisodeCoverStatus;
  url: string | null;
  modelId: string | null;
  sourceShotNumbers: number[];
  error: string | null;
  pendingTaskId: string | null;
  retryable?: boolean;
};

export type EpisodeCoverPromptInput = {
  seriesTitle: string;
  episodeNumber: number;
  episodeTitle?: string | null;
  synopsis?: string | null;
  plotBeats?: readonly string[] | null;
  /** Optional slot-specific composition role for visibly distinct variants. */
  coverSlotId?: VerticalDramaEpisodeCoverSlotId;
  /** Logo reference kinds in the same order as the attached image URLs. */
  logoReferences?: readonly ("title_logo" | "channel_logo")[];
  /** Number of scene references attached before the logo references. */
  referenceImageCountBeforeLogos?: number;
};

export type EpisodeCoverReferenceCandidate = {
  shotNumber: number;
  approvedMediaAssetId: string;
  sourceIndex: number;
  visual?: string | null;
  action?: string | null;
  characters?: readonly string[] | null;
  location?: string | null;
};

export type EpisodeCoverReference = {
  shotNumber: number;
  approvedMediaAssetId: string;
  sourceIndex: number;
};

const MAX_REFERENCES = 4;
const COVER_VARIANT_REFERENCE_BUDGETS = [1, 2, 3, 3] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBeats(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
}

function coverVariantDirection(
  slotId: VerticalDramaEpisodeCoverSlotId
): string {
  switch (slotId) {
    case 1:
      return [
        "**แนวทางองค์ประกอบหน้าปกแบบที่ 1**",
        "สร้างภาพ close-up หรือ medium close-up ที่เน้นตัวละครหรือความสัมพันธ์หลักและอารมณ์สำคัญของตอน ให้ใบหน้า มือ หรือวัตถุสำคัญเด่นชัด ฉากหลังละลายและหลีกเลี่ยงภาพกลุ่มหรือมุมกว้าง",
      ].join("\n");
    case 2:
      return [
        "**แนวทางองค์ประกอบหน้าปกแบบที่ 2**",
        "สร้างภาพ wide establishing shot ให้สถานที่และบรรยากาศของเหตุการณ์เป็นจุดเด่น วางตัวละครขนาดเล็กลงในพื้นที่หนึ่งส่วนสามของภาพ และแสดงความสัมพันธ์กับสภาพแวดล้อมอย่างชัดเจน ห้ามใช้เฟรมระยะใกล้แบบหน้าปกอื่น",
      ].join("\n");
    case 3:
      return [
        "**แนวทางองค์ประกอบหน้าปกแบบที่ 3**",
        "สร้างภาพ action framing ระยะกลางที่จับการกระทำ ปฏิสัมพันธ์ หรือความขัดแย้งสำคัญของตอน เช่น มือ วัตถุ หรือท่าทางที่กำลังเกิดขึ้น ใช้เส้นทแยงและการแยก foreground/background เพื่อไม่ให้กลายเป็นภาพยืนเรียงกัน",
      ].join("\n");
    case 4:
      return [
        "**แนวทางองค์ประกอบหน้าปกแบบที่ 4**",
        "สร้าง alternate cinematic angle ที่แตกต่างจากหน้าปกแบบอื่นอย่างชัดเจน เช่น มุมสูง มุมต่ำ มุมมองผ่าน foreground หรือการจัดองค์ประกอบแบบอสมมาตรที่มีพื้นที่ว่าง โดยยังคงเหตุการณ์และตัวตนของตัวละครให้สอดคล้องกับเรื่อง",
      ].join("\n");
  }
}

/** Build only the exact user-approved prompt; no style or negative text is appended. */
export function buildEpisodeCoverPrompt(
  input: EpisodeCoverPromptInput
): string {
  const seriesTitle = clean(input.seriesTitle);
  const episodeTitle = clean(input.episodeTitle);
  const synopsis = clean(input.synopsis);
  const beats = cleanBeats(input.plotBeats);
  const sections = [
    "ช่วยหน้าปก ซีรีย์",
    seriesTitle,
    `**ตอนย่อยที่ ${input.episodeNumber}  · ${episodeTitle}**`,
  ];

  if (synopsis) {
    sections.push("**เรื่องย่อ**", synopsis);
  }
  if (beats.length > 0) {
    sections.push("**จุดดำเนินเรื่อง**", beats.join("\n"));
  }

  if (input.coverSlotId) {
    sections.push(
      coverVariantDirection(input.coverSlotId),
      "ปรับแนวทางนี้ให้เข้ากับชื่อเรื่อง เรื่องย่อ จุดดำเนินเรื่อง และภาพอ้างอิงของตอนนี้โดยอัตโนมัติ ห้ามเพิ่มเหตุการณ์หรือตัวละครที่ไม่มีข้อมูลอ้างอิง และต้องสร้างองค์ประกอบภาพที่แตกต่างอย่างมีความหมายจากหน้าปกแบบอื่น"
    );
  }

  const logoReferences = input.logoReferences ?? [];
  if (logoReferences.length > 0) {
    const firstLogoImageNumber =
      Math.max(0, Math.floor(input.referenceImageCountBeforeLogos ?? 0)) + 1;
    const logoDirections = logoReferences.map((kind, index) => {
      const imageNumber = firstLogoImageNumber + index;
      return kind === "title_logo"
        ? `- ภาพอ้างอิงที่ ${imageNumber} คือโลโก้ชื่อเรื่อง: ต้องนำโลโก้นี้ไปใช้จริงบนหน้าปก โดยคงข้อความภาษาไทย รูปร่าง สี และรายละเอียดเดิม ห้ามวาดหรือสะกดโลโก้ใหม่`
        : `- ภาพอ้างอิงที่ ${imageNumber} คือโลโก้ช่อง: ต้องนำโลโก้นี้ไปใช้จริงและแสดงให้เห็นชัดเจนบนหน้าปก โดยคงข้อความ รูปร่าง สี และรายละเอียดเดิม ห้ามละเลยหรือสร้างโลโก้ใหม่แทน`;
    });
    sections.push(
      "**คำสั่งการใช้โลโก้ (จำเป็นต้องทำตาม)**",
      [
        "ใช้โลโก้ภาพอ้างอิงทุกภาพที่แนบมาในหน้าปกสุดท้าย ห้ามละเลยโลโก้ใดโลโก้หนึ่ง",
        ...logoDirections,
        "วางโลโก้ทั้งสองในตำแหน่งที่อ่านได้ชัดเจน ไม่บังใบหน้าหรือตัวละครสำคัญ และอย่าเปลี่ยนโลโก้ให้กลายเป็นข้อความหรือสัญลักษณ์ใหม่",
      ].join("\n")
    );
  }
  return sections.join("\n\n");
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function termsFor(value: string): Set<string> {
  const normalized = normalizeText(value);
  if (!normalized) return new Set();
  const terms = new Set(
    normalized.split(/\s+/).filter(term => term.length >= 2)
  );

  // Thai and other scripts are commonly stored without spaces. Short n-grams
  // make overlap deterministic without introducing an LLM or a tokenizer.
  const compact = normalized.replace(/\s+/g, "");
  if (compact.length >= 3 && /[^\x00-\x7F]/u.test(compact)) {
    for (let size = 3; size <= 5; size += 1) {
      for (let index = 0; index + size <= compact.length; index += 1) {
        terms.add(compact.slice(index, index + size));
      }
    }
  }
  return terms;
}

function candidateText(candidate: EpisodeCoverReferenceCandidate): string {
  return [
    candidate.visual,
    candidate.action,
    ...(candidate.characters ?? []),
    candidate.location,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function scoreCandidate(
  candidate: EpisodeCoverReferenceCandidate,
  narrativeTerms: Set<string>
): number {
  if (narrativeTerms.size === 0) return 0;
  const candidateTerms = termsFor(candidateText(candidate));
  let score = 0;
  for (const term of narrativeTerms) {
    if (candidateTerms.has(term)) score += term.length >= 4 ? 2 : 1;
  }
  return score;
}

/**
 * Select at most four approved frames deterministically. The result keeps
 * storyboard order so retries attach the same story sequence.
 */
export function selectEpisodeCoverReferences(
  candidates: readonly EpisodeCoverReferenceCandidate[],
  narrativeText: string,
  maxReferences: number = MAX_REFERENCES,
  selectionOffset: number = 0,
  variantSlotIndex?: number
): EpisodeCoverReference[] {
  const limit = Math.max(
    0,
    Math.min(MAX_REFERENCES, Math.floor(maxReferences))
  );
  if (limit === 0) return [];

  const unique = candidates.filter(
    (candidate, index, all) =>
      candidate.approvedMediaAssetId.trim().length > 0 &&
      Number.isInteger(candidate.shotNumber) &&
      all.findIndex(
        other =>
          other.shotNumber === candidate.shotNumber &&
          other.approvedMediaAssetId === candidate.approvedMediaAssetId
      ) === index
  );
  if (unique.length <= limit) {
    return unique
      .slice()
      .sort((a, b) => a.sourceIndex - b.sourceIndex)
      .map(({ shotNumber, approvedMediaAssetId, sourceIndex }) => ({
        shotNumber,
        approvedMediaAssetId,
        sourceIndex,
      }));
  }

  const narrativeTerms = termsFor(narrativeText);
  const scored = unique.map(candidate => ({
    candidate,
    score: scoreCandidate(candidate, narrativeTerms),
  }));
  const hasNarrativeMatch = scored.some(item => item.score > 0);

  const ranked = hasNarrativeMatch
    ? scored
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.candidate.sourceIndex - b.candidate.sourceIndex
        )
        .map(item => item.candidate)
    : unique;

  if (variantSlotIndex !== undefined) {
    return selectCoverVariantBand(ranked, limit, variantSlotIndex);
  }

  let selected: EpisodeCoverReferenceCandidate[];
  if (!hasNarrativeMatch) {
    const step = (unique.length - 1) / Math.max(1, limit - 1);
    const offset =
      Math.abs(Math.floor(selectionOffset)) % Math.max(1, unique.length);
    const indexes = new Set(
      Array.from({ length: limit }, (_, index) =>
        (Math.round(index * step) + offset) % unique.length
      )
    );
    selected = Array.from(indexes)
      .sort((a, b) => a - b)
      .map(index => unique[index]);
  } else {
    const offset = Math.abs(Math.floor(selectionOffset)) % ranked.length;
    selected = Array.from({ length: limit }, (_, index) =>
      ranked[(index + offset) % ranked.length]
    );
  }

  return selected
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(({ shotNumber, approvedMediaAssetId, sourceIndex }) => ({
      shotNumber,
      approvedMediaAssetId,
      sourceIndex,
    }));
}

function allocateCoverVariantBandSizes(candidateCount: number): number[] {
  const sizes = COVER_VARIANT_REFERENCE_BUDGETS.map(() => 0);
  const initialAssignments = Math.min(candidateCount, sizes.length);
  for (let index = 0; index < initialAssignments; index += 1) {
    sizes[index] = 1;
  }

  let remaining = candidateCount - initialAssignments;
  for (
    let index = 1;
    index < COVER_VARIANT_REFERENCE_BUDGETS.length && remaining > 0;
    index += 1
  ) {
    const room = COVER_VARIANT_REFERENCE_BUDGETS[index] - sizes[index];
    const addition = Math.min(room, remaining);
    sizes[index] += addition;
    remaining -= addition;
  }
  return sizes;
}

function selectCoverVariantBand(
  orderedCandidates: readonly EpisodeCoverReferenceCandidate[],
  limit: number,
  variantSlotIndex: number
): EpisodeCoverReference[] {
  const normalizedSlotIndex =
    Math.abs(Math.floor(variantSlotIndex)) %
    COVER_VARIANT_REFERENCE_BUDGETS.length;
  const bandSizes = allocateCoverVariantBandSizes(orderedCandidates.length);
  const bandStart = bandSizes
    .slice(0, normalizedSlotIndex)
    .reduce((total, size) => total + size, 0);
  const bandEnd = bandStart + bandSizes[normalizedSlotIndex];
  const selected = orderedCandidates.slice(bandStart, bandEnd).slice(0, limit);
  const selectedIds = new Set(
    selected.map(candidate => candidate.approvedMediaAssetId)
  );

  // Short episodes cannot fill every variant's preferred band. Complete the
  // requested count deterministically, while keeping the preferred band first.
  for (const candidate of orderedCandidates) {
    if (selected.length >= limit) break;
    if (selectedIds.has(candidate.approvedMediaAssetId)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.approvedMediaAssetId);
  }

  return selected
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(({ shotNumber, approvedMediaAssetId, sourceIndex }) => ({
      shotNumber,
      approvedMediaAssetId,
      sourceIndex,
    }));
}

function readSingleEpisodeCoverState(
  value: unknown
): VerticalDramaEpisodeCoverState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.status !== "generating" &&
    raw.status !== "ready" &&
    raw.status !== "failed"
  ) {
    return null;
  }
  const sourceShotNumbers = Array.isArray(raw.sourceShotNumbers)
    ? raw.sourceShotNumbers.filter(
        (shotNumber): shotNumber is number =>
          Number.isInteger(shotNumber) && shotNumber > 0
      )
    : undefined;
  const referenceStrategy =
    raw.referenceStrategy === "one" ||
    raw.referenceStrategy === "two" ||
    raw.referenceStrategy === "three" ||
    raw.referenceStrategy === "random"
      ? raw.referenceStrategy
      : undefined;
  const referenceImageCount = Number.isInteger(raw.referenceImageCount)
    ? Number(raw.referenceImageCount)
    : undefined;
  const rawSafetyReview =
    raw.safetyReview && typeof raw.safetyReview === "object"
      ? (raw.safetyReview as Record<string, unknown>)
      : null;
  const safetyRiskLevel = rawSafetyReview?.riskLevel;
  const safetyReview: VerticalDramaEpisodeCoverSafetyReview | undefined =
    rawSafetyReview?.checked === true &&
    rawSafetyReview?.mode === "vertical_drama_cover" &&
    typeof rawSafetyReview.skillId === "string" &&
    typeof rawSafetyReview.skillVersion === "string" &&
    (safetyRiskLevel === "low" ||
      safetyRiskLevel === "medium" ||
      safetyRiskLevel === "high") &&
    typeof rawSafetyReview.rewritten === "boolean" &&
    typeof rawSafetyReview.fallback === "boolean" &&
    typeof rawSafetyReview.blocked === "boolean" &&
    typeof rawSafetyReview.originalPromptHash === "string" &&
    typeof rawSafetyReview.safePromptHash === "string"
      ? {
          checked: true,
          mode: "vertical_drama_cover",
          skillId: rawSafetyReview.skillId.slice(0, 128),
          skillVersion: rawSafetyReview.skillVersion.slice(0, 32),
          riskLevel: safetyRiskLevel,
          rewritten: rawSafetyReview.rewritten,
          fallback: rawSafetyReview.fallback,
          blocked: rawSafetyReview.blocked,
          originalPromptHash: rawSafetyReview.originalPromptHash.slice(0, 128),
          safePromptHash: rawSafetyReview.safePromptHash.slice(0, 128),
          changes: Array.isArray(rawSafetyReview.changes)
            ? rawSafetyReview.changes
                .filter((item): item is string => typeof item === "string")
                .map(item => item.slice(0, 240))
                .slice(0, 12)
            : [],
          preservedIntent: Array.isArray(rawSafetyReview.preservedIntent)
            ? rawSafetyReview.preservedIntent
                .filter((item): item is string => typeof item === "string")
                .map(item => item.slice(0, 240))
                .slice(0, 12)
            : [],
        }
      : undefined;
  return {
    status: raw.status,
    ...(clean(raw.pendingTaskId)
      ? { pendingTaskId: clean(raw.pendingTaskId) }
      : {}),
    ...(clean(raw.mediaAssetId)
      ? { mediaAssetId: clean(raw.mediaAssetId) }
      : {}),
    ...(clean(raw.modelId) ? { modelId: clean(raw.modelId) } : {}),
    ...(sourceShotNumbers ? { sourceShotNumbers } : {}),
    ...(clean(raw.prompt) ? { prompt: clean(raw.prompt) } : {}),
    ...(clean(raw.generatedAt) ? { generatedAt: clean(raw.generatedAt) } : {}),
    ...(raw.source === "generated" || raw.source === "upload"
      ? { source: raw.source }
      : {}),
    ...(clean(raw.error) ? { error: clean(raw.error).slice(0, 500) } : {}),
    ...(clean(raw.idempotencyKey)
      ? { idempotencyKey: clean(raw.idempotencyKey) }
      : {}),
    ...(clean(raw.supersededTaskId)
      ? { supersededTaskId: clean(raw.supersededTaskId) }
      : {}),
    ...(referenceStrategy ? { referenceStrategy } : {}),
    ...(referenceImageCount !== undefined && referenceImageCount >= 0
      ? { referenceImageCount }
      : {}),
    ...(safetyReview ? { safetyReview } : {}),
  };
}

function isCoverSlotId(value: unknown): value is VerticalDramaEpisodeCoverSlotId {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    verticalDramaEpisodeCoverSlotIds.includes(value as VerticalDramaEpisodeCoverSlotId)
  );
}

export function readEpisodeCoverVariants(
  value: unknown
): Array<{
  slotId: VerticalDramaEpisodeCoverSlotId;
  state: VerticalDramaEpisodeCoverState;
}> {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (raw.version === 2 && Array.isArray(raw.variants)) {
      return raw.variants
        .map(item => {
          if (!item || typeof item !== "object") return null;
          const variant = item as Record<string, unknown>;
          const slotId = isCoverSlotId(variant.slotId) ? variant.slotId : null;
          const state = readSingleEpisodeCoverState(variant.state);
          return slotId && state ? { slotId, state } : null;
        })
        .filter(
          (
            item
          ): item is {
            slotId: VerticalDramaEpisodeCoverSlotId;
            state: VerticalDramaEpisodeCoverState;
          } => Boolean(item)
        )
        .sort((a, b) => a.slotId - b.slotId);
    }
  }
  const legacyState = readSingleEpisodeCoverState(value);
  return legacyState ? [{ slotId: 1, state: legacyState }] : [];
}

export function buildEpisodeCoverVariantsEnvelope(
  variants: readonly {
    slotId: VerticalDramaEpisodeCoverSlotId;
    state: VerticalDramaEpisodeCoverState;
  }[],
  activeSlotId: VerticalDramaEpisodeCoverSlotId = 1
): VerticalDramaEpisodeCoverVariantsEnvelope {
  return {
    version: 2,
    activeSlotId,
    variants: [...variants]
      .filter((variant, index, all) =>
        all.findIndex(item => item.slotId === variant.slotId) === index
      )
      .sort((a, b) => a.slotId - b.slotId)
      .map(variant => ({
        slotId: variant.slotId,
        state: { ...variant.state },
      })),
  };
}

export function upsertEpisodeCoverVariant(
  currentValue: unknown,
  slotId: VerticalDramaEpisodeCoverSlotId,
  state: VerticalDramaEpisodeCoverState
): VerticalDramaEpisodeCoverVariantsEnvelope {
  const current = readEpisodeCoverVariants(currentValue).filter(
    variant => variant.slotId !== slotId
  );
  return buildEpisodeCoverVariantsEnvelope(
    [...current, { slotId, state }],
    slotId
  );
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveEpisodeCoverReferenceCount(
  slotId: VerticalDramaEpisodeCoverSlotId,
  availableReferenceCount: number,
  seed: string
): { strategy: "one" | "two" | "three" | "random"; count: number } {
  const available = Math.max(0, Math.floor(availableReferenceCount));
  if (available === 0) return { strategy: slotId === 4 ? "random" : "one", count: 0 };
  if (slotId === 1) return { strategy: "one", count: Math.min(1, available) };
  if (slotId === 2) return { strategy: "two", count: Math.min(2, available) };
  if (slotId === 3) return { strategy: "three", count: Math.min(3, available) };
  return { strategy: "random", count: 1 + (stableSeed(seed) % Math.min(3, available)) };
}

export function selectEpisodePreviewCoverSlot(
  readySlotIds: readonly VerticalDramaEpisodeCoverSlotId[],
  usedSlotIds: readonly VerticalDramaEpisodeCoverSlotId[],
  seed: string
): VerticalDramaEpisodeCoverSlotId | null {
  const ready = [...new Set(readySlotIds)].filter(isCoverSlotId).sort();
  if (ready.length === 0) return null;
  const unused = ready.filter(slotId => !usedSlotIds.includes(slotId));
  const candidates = unused.length > 0 ? unused : ready;
  return candidates[stableSeed(seed) % candidates.length] ?? null;
}

export function readEpisodeCoverState(
  value: unknown,
  slotId?: VerticalDramaEpisodeCoverSlotId
): VerticalDramaEpisodeCoverState | null {
  const variants = readEpisodeCoverVariants(value);
  if (variants.length > 0) {
    if (slotId) return variants.find(item => item.slotId === slotId)?.state ?? null;
    const raw = value as Record<string, unknown>;
    const activeSlotId = isCoverSlotId(raw.activeSlotId) ? raw.activeSlotId : 1;
    return (
      variants.find(item => item.slotId === activeSlotId)?.state ?? variants[0].state
    );
  }
  return null;
}

export function toEpisodeCoverDisplay(
  value: unknown,
  url: string | null = null
): VerticalDramaEpisodeCoverDisplay | null {
  const state = readEpisodeCoverState(value);
  if (!state) return null;
  return {
    status: state.status,
    // Keep the previous cover visible while a replacement is generating or
    // after a failed retry. The server resolves this URL from the persisted
    // mediaAssetId, so this does not expose a new asset before it is ready.
    url: state.mediaAssetId ? url : null,
    modelId: state.modelId ?? null,
    sourceShotNumbers: state.sourceShotNumbers ?? [],
    error: state.error ?? null,
    pendingTaskId: state.pendingTaskId ?? state.supersededTaskId ?? null,
    ...(state.retryable === true ? { retryable: true } : {}),
  };
}
