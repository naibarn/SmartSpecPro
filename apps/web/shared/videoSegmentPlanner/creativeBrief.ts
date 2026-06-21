import {
  VideoSegmentCreativeBriefSchema,
  type VideoSegmentCreativeBrief,
  type VideoSegmentPlanWarning,
} from "./contracts";

const forbiddenPatterns = [
  /\b(change|replace|redesign)\s+(the\s+)?product\b/i,
  /\b(add|invent)\s+(new\s+)?claims?\b/i,
  /\bchange\s+(the\s+)?character\b/i,
  /\bchange\s+(reference|frame)\s+roles?\b/i,
  /\bforce\s+native\s+thai\s+(speech|audio)\b/i,
  /เปลี่ยนสินค้า|เปลี่ยนตัวละคร|เพิ่มคำกล่าวอ้าง|เสียงไทยในวิดีโอ/i,
];

const CREATIVE_BRIEF_MAX_LENGTH = 2_000;

function truncateCreativeBriefText(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= CREATIVE_BRIEF_MAX_LENGTH) {
    return { text, truncated: false };
  }

  return {
    text: text.slice(0, CREATIVE_BRIEF_MAX_LENGTH).trimEnd(),
    truncated: true,
  };
}

export function normalizeVideoSegmentCreativeBrief(
  input?: string | VideoSegmentCreativeBrief | null
): VideoSegmentCreativeBrief | undefined {
  const raw =
    typeof input === "string"
      ? input
      : typeof input?.text === "string"
        ? input.text
        : "";
  const compactedText = raw.replace(/\s+/g, " ").trim();
  if (!compactedText) return undefined;

  const warnings: VideoSegmentPlanWarning[] = [];
  const truncatedText = truncateCreativeBriefText(compactedText);
  const text = truncatedText.text;
  if (truncatedText.truncated) {
    warnings.push({
      code: "creative_brief_truncated_to_2000",
      message:
        "Creative brief is longer than 2,000 characters and was truncated before prompt generation.",
      severity: "warning",
      source: "creative_brief",
    });
  }

  const normalizedText = forbiddenPatterns.reduce((current, pattern) => {
    if (!pattern.test(current)) return current;
    warnings.push({
      code: "creative_brief_lock_conflict",
      message:
        "Creative brief contains guidance that conflicts with product, character, reference, claim, or Thai audio locks; locked parts must be ignored.",
      severity: "warning",
      source: "creative_brief",
    });
    return current.replace(pattern, "[locked instruction removed]");
  }, text);
  const normalizedTextForSchema = truncateCreativeBriefText(normalizedText).text;

  return VideoSegmentCreativeBriefSchema.parse({
    text,
    normalizedText: normalizedTextForSchema,
    warnings,
  });
}
