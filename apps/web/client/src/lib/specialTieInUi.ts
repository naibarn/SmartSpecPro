export function canAddSpecialReferences(existingCount: number, incomingCount = 1): boolean {
  return existingCount >= 0 && incomingCount >= 0 && existingCount + incomingCount <= 3;
}

export function toggleBoundedSelection(current: readonly string[], id: string, max: number): string[] {
  if (current.includes(id)) return current.filter(value => value !== id);
  return current.length >= max ? [...current] : [...current, id];
}

export function specialEpisodeLabel(sequence: number | null | undefined, lang: "th" | "en"): string {
  return `${lang === "th" ? "ตอนพิเศษ" : "SPECIAL"} ${String(sequence ?? 0).padStart(2, "0")}`;
}
