export type VerticalDramaEpisodeCoverStatus = "generating" | "ready" | "failed";

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
  /** Server-only replay key. Never expose this through a client projection. */
  idempotencyKey?: string;
  /** Server-only stale-task cleanup handle for a manual replacement. */
  supersededTaskId?: string;
};

export type VerticalDramaEpisodeCoverDisplay = {
  status: VerticalDramaEpisodeCoverStatus;
  url: string | null;
  modelId: string | null;
  sourceShotNumbers: number[];
  error: string | null;
  pendingTaskId: string | null;
};

export type EpisodeCoverPromptInput = {
  seriesTitle: string;
  episodeNumber: number;
  episodeTitle?: string | null;
  synopsis?: string | null;
  plotBeats?: readonly string[] | null;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBeats(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter(Boolean);
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
  maxReferences: number = MAX_REFERENCES
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

  let selected: EpisodeCoverReferenceCandidate[];
  if (!hasNarrativeMatch) {
    const step = (unique.length - 1) / Math.max(1, limit - 1);
    const indexes = new Set(
      Array.from({ length: limit }, (_, index) => Math.round(index * step))
    );
    selected = Array.from(indexes)
      .sort((a, b) => a - b)
      .map(index => unique[index]);
  } else {
    selected = scored
      .sort(
        (a, b) =>
          b.score - a.score || a.candidate.sourceIndex - b.candidate.sourceIndex
      )
      .slice(0, limit)
      .map(item => item.candidate);
  }

  return selected
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map(({ shotNumber, approvedMediaAssetId, sourceIndex }) => ({
      shotNumber,
      approvedMediaAssetId,
      sourceIndex,
    }));
}

export function readEpisodeCoverState(
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
  };
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
  };
}
