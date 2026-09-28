/**
 * Shot-local generic people/groups that should be visible in a Vertical Drama
 * image without becoming identity-locked series characters.
 *
 * This is intentionally separate from `requiredCharacterRefs` and
 * `screenCallerCharacterRefs`: those fields carry durable portrait identity,
 * while this field is text-only, bounded, and scoped to one shot.
 */

export const VD_SUPPORTING_PRESENCE_MAX_ENTRIES = 6;
export const VD_SUPPORTING_PRESENCE_MAX_ROLE_LENGTH = 80;
export const VD_SUPPORTING_PRESENCE_MAX_ACTION_LENGTH = 240;
export const VD_SUPPORTING_PRESENCE_MAX_EVIDENCE_LENGTH = 240;
export const VD_SUPPORTING_PRESENCE_MAX_COUNT = 20;

export type VerticalDramaSupportingPresenceVisibility =
  | "visible"
  | "background";

export type VerticalDramaSupportingPresenceSource = "auto" | "manual";

export type VerticalDramaSupportingPresenceConfidence =
  | "high"
  | "medium"
  | "low";

export type VerticalDramaSupportingPresenceStatus =
  | "suggestion"
  | "auto_confirmed"
  | "accepted";

export interface VerticalDramaSupportingPresence {
  /** Stable within the shot; never a character roster key. */
  id: string;
  /** Generic role/group label, e.g. "ตำรวจ" or "ชาวบ้านแถวนั้น". */
  role: string;
  /** Inclusive lower bound. For an exact count, min === max. */
  countMin: number;
  /** Inclusive upper bound. */
  countMax: number;
  visibility: VerticalDramaSupportingPresenceVisibility;
  action?: string;
  evidence?: string;
  source: VerticalDramaSupportingPresenceSource;
  confidence?: VerticalDramaSupportingPresenceConfidence;
  status?: VerticalDramaSupportingPresenceStatus;
}

export type VerticalDramaSupportingPresenceInput = Partial<
  Omit<VerticalDramaSupportingPresence, "id" | "role" | "countMin" | "countMax">
> & {
  id?: unknown;
  role?: unknown;
  count?: unknown;
  countMin?: unknown;
  countMax?: unknown;
  count_min?: unknown;
  count_max?: unknown;
};

export interface VerticalDramaSupportingPresenceShotText {
  description?: unknown;
  action?: unknown;
  visualDescription?: unknown;
  visual_description?: unknown;
  narrativePurpose?: unknown;
  narrative_purpose?: unknown;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return undefined;
  const integer = Math.floor(number);
  return integer >= 1 ? integer : undefined;
}

function resolveCount(input: VerticalDramaSupportingPresenceInput): {
  countMin: number;
  countMax: number;
} {
  const countRecord =
    typeof input.count === "object" && input.count !== null
      ? (input.count as Record<string, unknown>)
      : undefined;
  const exactCount = positiveInteger(input.count);
  const countMin =
    positiveInteger(input.countMin) ??
    positiveInteger(input.count_min) ??
    positiveInteger(countRecord?.min) ??
    exactCount ??
    1;
  const countMax =
    positiveInteger(input.countMax) ??
    positiveInteger(input.count_max) ??
    positiveInteger(countRecord?.max) ??
    exactCount ??
    countMin;
  return {
    countMin: Math.min(countMin, VD_SUPPORTING_PRESENCE_MAX_COUNT),
    countMax: Math.min(
      Math.max(countMin, countMax),
      VD_SUPPORTING_PRESENCE_MAX_COUNT
    ),
  };
}

function normalizeId(value: unknown, index: number, idPrefix: string): string {
  const id = cleanText(value, 100)?.replace(/[^a-zA-Z0-9._:-]+/g, "-");
  return id || `${idPrefix}-${index + 1}`;
}

/**
 * Normalize LLM/UI input into the safe shared shape. Invalid entries are
 * dropped; valid entries are capped and never gain a character identity.
 */
export function normalizeVerticalDramaSupportingPresence(
  value: unknown,
  options: {
    idPrefix?: string;
    source?: VerticalDramaSupportingPresenceSource;
  } = {}
): VerticalDramaSupportingPresence[] {
  if (!Array.isArray(value)) return [];
  const idPrefix = options.idPrefix ?? "supporting";
  const result: VerticalDramaSupportingPresence[] = [];
  const usedIds = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (typeof raw !== "object" || raw === null) continue;
    const input = raw as VerticalDramaSupportingPresenceInput;
    const role = cleanText(input.role, VD_SUPPORTING_PRESENCE_MAX_ROLE_LENGTH);
    if (!role) continue;
    const idBase = normalizeId(input.id, index, idPrefix);
    let id = idBase;
    let suffix = 2;
    while (usedIds.has(id)) id = `${idBase}-${suffix++}`;
    usedIds.add(id);
    const count = resolveCount(input);
    const visibility: VerticalDramaSupportingPresenceVisibility =
      input.visibility === "background" ? "background" : "visible";
    const source: VerticalDramaSupportingPresenceSource =
      options.source ?? (input.source === "manual" ? "manual" : "auto");
    const confidence =
      input.confidence === "high" ||
      input.confidence === "medium" ||
      input.confidence === "low"
        ? input.confidence
        : undefined;
    const status =
      input.status === "suggestion" ||
      input.status === "auto_confirmed" ||
      input.status === "accepted"
        ? input.status
        : source === "manual"
          ? "accepted"
          : "suggestion";
    result.push({
      id,
      role,
      ...count,
      visibility,
      ...(cleanText(input.action, VD_SUPPORTING_PRESENCE_MAX_ACTION_LENGTH)
        ? {
            action: cleanText(
              input.action,
              VD_SUPPORTING_PRESENCE_MAX_ACTION_LENGTH
            ),
          }
        : {}),
      ...(cleanText(input.evidence, VD_SUPPORTING_PRESENCE_MAX_EVIDENCE_LENGTH)
        ? {
            evidence: cleanText(
              input.evidence,
              VD_SUPPORTING_PRESENCE_MAX_EVIDENCE_LENGTH
            ),
          }
        : {}),
      source,
      ...(confidence ? { confidence } : {}),
      status,
    });
    if (result.length >= VD_SUPPORTING_PRESENCE_MAX_ENTRIES) break;
  }
  return result;
}

function shotTextForSupportingPresence(
  shot: VerticalDramaSupportingPresenceShotText
): string {
  return [
    shot.description,
    shot.action,
    shot.visualDescription ?? shot.visual_description,
    shot.narrativePurpose ?? shot.narrative_purpose,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
}

/**
 * Cheap, no-credit fallback for legacy storyboards generated before the
 * `supporting_presence` field existed. It intentionally requires both a
 * recognizable generic role and an in-frame/group action cue, so a mere
 * mention, phone call, news item, or off-screen person does not add bodies.
 */
export function inferVerticalDramaSupportingPresenceFromShotText(
  shot: VerticalDramaSupportingPresenceShotText,
  options: { idPrefix?: string } = {}
): VerticalDramaSupportingPresence[] {
  const text = shotTextForSupportingPresence(shot);
  if (!text) return [];
  const offscreenOrMediated =
    /(โทรศัพท์|โทรมา|โทรหา|เสียง|นอกเฟรม|อยู่อีกฝั่ง|ผ่านหน้าจอ|ข่าว|ทีวี|phone|call|off[- ]?screen|voice[- ]?only|news|television)/iu.test(
      text
    );
  if (offscreenOrMediated) return [];

  const hasInFrameCue =
    /(พา[^\n]{0,30}(เข้ามา|มาใน|มายัง)|นำ[^\n]{0,30}(เข้ามา|มาใน)|เรียก[^\n]{0,30}(มา|เข้ามา)|รวม[^\n]{0,30}(มา|กัน)|มาร่วม|เข้าร่วม|เข้ามา|มาถึง|ยืน|นั่ง|ฟัง|พูดคุย|รับฟัง|gather|join|arrive|enter|stand|sit|listen|talk|meet|bring)/iu.test(
      text
    );
  if (!hasInFrameCue) return [];

  const evidence = text.slice(0, VD_SUPPORTING_PRESENCE_MAX_EVIDENCE_LENGTH);
  const idPrefix = options.idPrefix ?? "inferred-supporting";
  if (/(ตำรวจ|เจ้าหน้าที่ตำรวจ|police officer|police officers)/iu.test(text)) {
    return [
      {
        id: `${idPrefix}-police`,
        role: "ตำรวจ",
        countMin: 1,
        countMax: 1,
        visibility: "visible",
        action: "เข้ามาในฉากและรับฟังเหตุการณ์",
        evidence,
        source: "auto",
        confidence: "medium",
        status: "suggestion",
      },
    ];
  }
  if (/(ชาวบ้าน|คนในชุมชน|local villagers?|villagers?)/iu.test(text)) {
    return [
      {
        id: `${idPrefix}-villagers`,
        role: "ชาวบ้าน",
        countMin: 3,
        countMax: 8,
        visibility: "background",
        action: "มาร่วมรับฟังปัญหา",
        evidence,
        source: "auto",
        confidence: "medium",
        status: "suggestion",
      },
    ];
  }
  if (
    /(สมาชิกในตึก|สมาชิกในอาคาร|ลูกบ้าน|คนในตึก|คนในอาคาร|building members?|residents?|tenants?)/iu.test(
      text
    )
  ) {
    return [
      {
        id: `${idPrefix}-building-members`,
        role: "สมาชิกในอาคาร",
        countMin: 3,
        countMax: 8,
        visibility: "background",
        action: "มาร่วมพูดคุยกัน",
        evidence,
        source: "auto",
        confidence: "medium",
        status: "suggestion",
      },
    ];
  }
  return [];
}

/** Use authored structured data first, then the legacy-text fallback. */
export function resolveVerticalDramaSupportingPresenceForShot(
  value: unknown,
  shot: VerticalDramaSupportingPresenceShotText,
  options: { idPrefix?: string } = {}
): VerticalDramaSupportingPresence[] {
  const normalized = normalizeVerticalDramaSupportingPresence(value, {
    idPrefix: options.idPrefix,
    source: "auto",
  });
  return normalized.length > 0
    ? normalized
    : inferVerticalDramaSupportingPresenceFromShotText(shot, options);
}

export function supportingPresenceCountLabel(
  entry: Pick<VerticalDramaSupportingPresence, "countMin" | "countMax">
): string {
  return entry.countMin === entry.countMax
    ? String(entry.countMin)
    : `${entry.countMin}-${entry.countMax}`;
}

export function renderSupportingPresencePromptBlock(
  entries: readonly VerticalDramaSupportingPresence[]
): string | null {
  const normalized = normalizeVerticalDramaSupportingPresence(entries, {
    source: "manual",
  });
  if (normalized.length === 0) return null;
  const lines = normalized.map(entry => {
    const count = supportingPresenceCountLabel(entry);
    const visibility =
      entry.visibility === "background" ? "in the background" : "visible";
    const action = entry.action ? `, ${entry.action}` : "";
    return `- ${entry.role} x${count}, ${visibility}${action}`;
  });
  return [
    "SHOT-LOCAL SUPPORTING PRESENCE (generic people only; no portrait identity):",
    ...lines,
    "Include only these supporting people in this shot. Do not add unrelated people or increase the stated counts.",
  ].join("\n");
}
