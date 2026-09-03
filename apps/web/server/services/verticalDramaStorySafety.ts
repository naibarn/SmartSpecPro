/**
 * Deterministic story-level safety signals for Vertical Drama.
 *
 * This is a conservative preflight, not a provider-policy emulator. It never
 * claims to know the provider's exact category; it only identifies risky
 * combinations for the caller to handle. Image/story authoring may still use
 * the result as a hard gate, while video-prompt authoring records it as an
 * advisory after an approved start-frame image exists.
 */

export type VerticalDramaStorySafetyLevel = "low" | "medium" | "high";

export type VerticalDramaStorySafetyFinding = {
  code:
    | "minor_distress"
    | "minor_threat_or_surveillance"
    | "sexual_or_nudity"
    | "graphic_violence"
    | "abuse_or_coercion"
    | "oversized_or_malformed_input";
  level: "medium" | "high";
  message: string;
};

export type VerticalDramaStorySafetyResult = {
  level: VerticalDramaStorySafetyLevel;
  findings: VerticalDramaStorySafetyFinding[];
  instruction: string;
};

export class VerticalDramaStorySafetyError extends Error {
  readonly code = "VD_STORY_POLICY_RISK";
  constructor(
    message: string,
    readonly safety: VerticalDramaStorySafetyResult
  ) {
    super(message);
    this.name = "VerticalDramaStorySafetyError";
  }
}

const MINOR_MARKERS = [
  "child",
  "children",
  "kid",
  "infant",
  "baby",
  "toddler",
  "minor",
  "newborn",
  "เด็ก",
  "ทารก",
  "ลูกน้อย",
  "เด็กเล็ก",
];

const DISTRESS_MARKERS = [
  "crying",
  "cries",
  "tearful",
  "tears",
  "red eyes",
  "distress",
  "panic",
  "ร้องไห้",
  "น้ำตา",
  "ตาแดง",
  "หวาดกลัว",
];

const THREAT_MARKERS = [
  "danger",
  "threat",
  "threatening",
  "unaware",
  "surveillance",
  "secretly photographed",
  "taken inside the house",
  // Do not use the bare Thai substring "ภัย": it also matches the benign
  // word "ปลอดภัย" (safe), which is common in character/location metadata.
  "ภัยคุกคาม",
  "อันตราย",
  "ข่มขู่",
  "แอบถ่าย",
  "ไม่รู้ว่ามีภัย",
];

const SEXUAL_MARKERS = [
  "porn",
  "explicit sex",
  "sexual intercourse",
  "genitals",
  "nude",
  "naked",
  "ภาพโป๊",
  "เปลือย",
  "อวัยวะเพศ",
];

const GRAPHIC_VIOLENCE_MARKERS = [
  "gore",
  "graphic injury",
  "blood pooling",
  "dismember",
  "ศพ",
  "เลือดสาด",
  "แผลฉกรรจ์",
];

const COERCION_MARKERS = [
  "abuse",
  "assault",
  "hostage",
  "kidnap",
  "forced",
  "ทำร้ายเด็ก",
  "ทารุณ",
  "จับตัว",
  "บังคับ",
];

// Prompt authors routinely describe prohibited motion as a negative
// constraint (for example, "no forced movement"). Those instructions are
// not an authored coercion event and must not be combined with a child/minor
// marker to block an otherwise safe shot. Remove only a bounded negated
// phrase; a positive marker elsewhere in the same story segment must remain
// detectable.
const NEGATED_ENGLISH_COERCION_PATTERN =
  /\b(?:no|not|never|without|avoid|do\s+not|don't)\b(?:\s+[a-z0-9_-]+){0,4}\s+\b(?:abuse|assault|hostage|kidnap|forced)\b/gi;
const NEGATED_THAI_COERCION_PATTERN =
  /(?:ห้าม|อย่า|ไม่ต้อง|ไม่ให้|โดยไม่|ยังไม่|ไม่ได้|มิได้|ไม่)(?:\s*[^\s,.;:()]+){0,4}\s*(?:ทำร้ายเด็ก|ทารุณ|จับตัว|บังคับ)/g;

const CONTEXTUAL_RESTRAINT_PATTERNS = [
  /\b(?:physically|tightly|forcibly|securely)\s+restrained\b/i,
  /\brestrained\s+(?:by|with|to|inside|in)\b/i,
  /\b(?:child|children|kid|infant|baby|toddler|minor)\b[^.\n]{0,40}\b(?:is|was|being|kept)\s+(?:restrained|tied|bound)\b/i,
  /\b(?:restrained|tied|bound)\b[^.\n]{0,40}\b(?:child|children|kid|infant|baby|toddler|minor)\b/i,
];

const MAX_SAFETY_SCAN_CHARS = 48_000;

// Negative prompts and policy instructions describe what must NOT appear in a
// generated image. They are not authored story events; scanning them makes a
// safe phrase such as "no nudity" look like an unsafe scene.
const SAFETY_METADATA_KEYS = new Set([
  "negative_prompt",
  "negativePrompt",
  "safety_instruction",
  "safetyInstruction",
  "policy_safety_contract",
  "policySafetyContract",
]);

function flattenStoryText(
  input: unknown,
  depth = 0,
  state: { remaining: number; truncated: boolean } = {
    remaining: MAX_SAFETY_SCAN_CHARS,
    truncated: false,
  }
): string {
  if (state.remaining <= 0 || depth > 8) {
    state.truncated = true;
    return "";
  }
  if (typeof input === "string") {
    const value = input.slice(0, state.remaining);
    state.remaining -= value.length;
    return value;
  }
  if (Array.isArray(input)) {
    return input
      .map(value => flattenStoryText(value, depth + 1, state))
      .join("\n");
  }
  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, unknown>)
      .filter(([key]) => !SAFETY_METADATA_KEYS.has(key))
      .map(
        ([key, value]) => `${key}: ${flattenStoryText(value, depth + 1, state)}`
      )
      .join("\n");
  }
  return "";
}

function containsAny(text: string, markers: string[]): boolean {
  return markers.some(marker => {
    // English markers should be whole words so that a harmless compound or
    // identifier does not accidentally become a policy signal. Thai has no
    // whitespace word boundaries, so its markers remain substring matches.
    if (/^[\x00-\x7F]+$/.test(marker)) {
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }
    return text.includes(marker);
  });
}

function containsCoercionMarker(text: string): boolean {
  const storyText = text
    .replace(NEGATED_ENGLISH_COERCION_PATTERN, " ")
    .replace(NEGATED_THAI_COERCION_PATTERN, " ");
  return (
    containsAny(storyText, COERCION_MARKERS) ||
    CONTEXTUAL_RESTRAINT_PATTERNS.some(pattern => pattern.test(storyText))
  );
}

/**
 * Build the safety input for one video-prompt shot from story-bearing facts.
 *
 * Character identity maps, continuity locks, camera contracts, and reference
 * labels are visual/pipeline metadata. They must not be treated as authored
 * story events: a character may be described as caring for a child or creating
 * a safe place without the current shot depicting a minor in danger.
 */
export function buildVerticalDramaVideoPromptSafetyInput(params: {
  imagePrompt?: unknown;
  shotContext?: unknown;
  subShotWindows?: unknown;
}): Record<string, unknown> {
  const context =
    params.shotContext && typeof params.shotContext === "object"
      ? (params.shotContext as Record<string, unknown>)
      : {};

  const storyContext: Record<string, unknown> = {};
  for (const key of [
    "canonicalShotSummary",
    "description",
    "emotion",
    "dialogueLines",
    "productContext",
  ]) {
    if (context[key] !== undefined && context[key] !== null) {
      storyContext[key] = context[key];
    }
  }

  const safetyInput: Record<string, unknown> = {
    imagePrompt: params.imagePrompt,
    shotContext: storyContext,
  };
  if (params.subShotWindows !== undefined) {
    safetyInput.subShotWindows = params.subShotWindows;
  }
  return safetyInput;
}

/**
 * Keep combination checks local to a story unit (normally one scene/shot).
 * The previous implementation flattened the entire episode first, so a
 * harmless mention of a child in shot 1 plus an unrelated threat in shot 8
 * was treated as one dangerous context. Arrays are the natural boundary for
 * scene_dialogue_summary/shots; scalar fields on each item stay together so
 * the check still catches a genuinely risky shot.
 */
function collectSafetySegments(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.flatMap(item => [
      flattenStoryText(item).toLocaleLowerCase(),
      ...collectSafetySegments(item),
    ]);
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const scalarText = Object.entries(record)
      .filter(([key]) => !SAFETY_METADATA_KEYS.has(key))
      .filter(([, value]) => value == null || typeof value !== "object")
      .map(([key, value]) => `${key}: ${flattenStoryText(value)}`)
      .join("\n");
    return [
      ...(scalarText ? [scalarText.toLocaleLowerCase()] : []),
      ...Object.values(record)
        .filter((value, index) => {
          const key = Object.keys(record)[index];
          return (
            !SAFETY_METADATA_KEYS.has(key ?? "") &&
            value &&
            typeof value === "object"
          );
        })
        .flatMap(value => collectSafetySegments(value)),
    ];
  }
  return typeof input === "string" ? [input.toLocaleLowerCase()] : [];
}

export function analyzeVerticalDramaStorySafety(
  input: unknown
): VerticalDramaStorySafetyResult {
  const scanState = { remaining: MAX_SAFETY_SCAN_CHARS, truncated: false };
  const text = flattenStoryText(input, 0, scanState).toLocaleLowerCase();
  const safetySegments = collectSafetySegments(input);
  const findings: VerticalDramaStorySafetyFinding[] = [];

  if (scanState.truncated) {
    findings.push({
      code: "oversized_or_malformed_input",
      level: "high",
      message: "ข้อมูลเนื้อเรื่องยาวหรือซับซ้อนเกินขอบเขตการตรวจสอบความปลอดภัย",
    });
  }

  if (containsAny(text, SEXUAL_MARKERS)) {
    findings.push({
      code: "sexual_or_nudity",
      level: "high",
      message: "พบถ้อยคำทางเพศหรือการเปลือยในเนื้อเรื่อง",
    });
  }
  if (containsAny(text, GRAPHIC_VIOLENCE_MARKERS)) {
    findings.push({
      code: "graphic_violence",
      level: "high",
      message: "พบถ้อยคำความรุนแรงเชิงกราฟิกในเนื้อเรื่อง",
    });
  }
  const hasMinorWithCoercion = safetySegments.some(
    segment =>
      containsAny(segment, MINOR_MARKERS) &&
      containsCoercionMarker(segment)
  );
  const hasMinorWithThreat = safetySegments.some(
    segment =>
      containsAny(segment, MINOR_MARKERS) &&
      containsAny(segment, THREAT_MARKERS)
  );
  const hasMinorWithDistress = safetySegments.some(
    segment =>
      containsAny(segment, MINOR_MARKERS) &&
      containsAny(segment, DISTRESS_MARKERS)
  );

  if (hasMinorWithCoercion) {
    findings.push({
      code: "abuse_or_coercion",
      level: "high",
      message: "พบเด็ก/ผู้เยาว์ร่วมกับบริบทการบังคับหรือการทำร้าย",
    });
  }
  if (
    hasMinorWithThreat &&
    !findings.some(f => f.code === "abuse_or_coercion")
  ) {
    findings.push({
      code: "minor_threat_or_surveillance",
      level: "high",
      message: "พบเด็ก/ผู้เยาว์ร่วมกับภัยคุกคามหรือการเฝ้าระวัง",
    });
  }
  if (hasMinorWithDistress) {
    findings.push({
      code: "minor_distress",
      level: "medium",
      message: "พบเด็ก/ผู้เยาว์ร่วมกับรายละเอียดความทุกข์หรือร้องไห้",
    });
  }

  const level = findings.some(f => f.level === "high")
    ? "high"
    : findings.length > 0
      ? "medium"
      : "low";

  const instruction = findings.length
    ? [
        "POLICY-SAFE STORY CONSTRAINTS:",
        "Keep all children fully clothed and in ordinary, non-graphic care contexts.",
        "Do not depict sexual content, nudity, abuse, graphic injury, or coercion.",
        "For a threat involving a child, express tension through an adult's reaction, a neutral object, or an unanswered question; do not frame the child as a threatened, surveilled, or helpless subject.",
        "Avoid concentrated crying, bodily distress, explicit danger wording, and secret-photography framing in the same shot.",
        "Preserve the plot purpose with neutral, cinematic, non-graphic actions and dialogue.",
      ].join(" ")
    : "POLICY-SAFE STORY CONSTRAINTS: Keep scenes non-graphic, fully clothed, and suitable for the selected audience rating; preserve the story purpose without adding sexual, nude, abusive, or graphic-violence detail.";

  return { level, findings, instruction };
}

export function isBlockingVerticalDramaStorySafety(
  result: VerticalDramaStorySafetyResult
): boolean {
  return result.level === "high";
}

/**
 * Video prompt authoring is allowed to complete after image approval. These
 * human-readable advisories are retained for audit/UI review and must never
 * be converted into a generation exception by the video-prompt pipeline.
 */
export function formatVerticalDramaStorySafetyWarnings(
  result: VerticalDramaStorySafetyResult,
  shotNumber?: number,
): string[] {
  const prefix =
    typeof shotNumber === "number"
      ? `Shot ${shotNumber}: video prompt safety advisory`
      : "Video prompt safety advisory";
  return result.findings.map(finding => `${prefix} [${finding.code}]: ${finding.message}`);
}

export function assertVerticalDramaStorySafety(
  input: unknown,
  message = "Story contains a high-risk policy context; rewrite before media generation."
): VerticalDramaStorySafetyResult {
  const result = analyzeVerticalDramaStorySafety(input);
  if (isBlockingVerticalDramaStorySafety(result)) {
    throw new VerticalDramaStorySafetyError(message, result);
  }
  return result;
}
