export function normalizeTextForTts(input: string | null | undefined): string {
  let text = String(input ?? "").normalize("NFKC");
  if (!text) {
    return "";
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[`*_~]/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[|¦]/g, ", ")
    .replace(/\s*[•◦●○▪■□◆◇►▸▶·・※★☆✓✔✦✧]\s*/g, ", ")
    .replace(/\s*[+＋]\s*/g, ", ")
    .replace(/\s*[\/／]\s*/g, ", ")
    .replace(/[()[\]{}<>「」『』【】]/g, " ")
    .replace(/[=_]{2,}/g, " ")
    .replace(/\s*[-]{2,}\s*/g, ", ")
    .replace(/[,:;]{2,}/g, ", ")
    .replace(/[!?]{2,}/g, ". ")
    .replace(/…{2,}/g, "…")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/([,.;:!?…])(?=\S)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  return text
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/(?:\.\s*){2,}/g, ". ")
    .replace(/^[,.;:!?…\s]+/g, "")
    .replace(/[,.;:!?…\s]+$/g, "")
    .trim();
}

export function resolveTtsTextFromSlideNote(
  noteText: string | null | undefined,
  fallbackText?: string | null,
): string {
  const preferred = String(noteText ?? "").trim();
  if (preferred) {
    return normalizeTextForTts(preferred);
  }
  return normalizeTextForTts(fallbackText ?? "");
}
