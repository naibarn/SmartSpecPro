function normalizeSpeakerName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function parseSpeakerPrefix(
  value: string
): { speakerName: string; line: string } | null {
  const match = value.match(/^([^:：\n]{1,100})\s*[:：]\s*([\s\S]*)$/);
  const speakerName = match?.[1]?.trim();
  if (!speakerName || match?.[2] === undefined) return null;
  return { speakerName, line: match[2].trim() };
}

/** Remove speaker labels accidentally included in the spoken line itself. */
export function normalizeStagedSpeakerLine(
  speakerName: string,
  value: string
): string {
  const expectedSpeaker = normalizeSpeakerName(speakerName);
  let line = value.trim();

  while (line) {
    const prefix = parseSpeakerPrefix(line);
    if (
      !prefix ||
      normalizeSpeakerName(prefix.speakerName) !== expectedSpeaker ||
      !prefix.line
    ) {
      break;
    }
    line = prefix.line;
  }

  return line;
}

/** Collapse repeated leading labels in a persisted `Name: line` transcript. */
export function normalizeStagedDialogueTranscript(value: string): string {
  return value.replace(/[^\r\n]+/g, rawLine => {
    const prefix = parseSpeakerPrefix(rawLine.trim());
    if (!prefix || !prefix.line) return rawLine;
    const spokenLine = normalizeStagedSpeakerLine(
      prefix.speakerName,
      prefix.line
    );
    if (!spokenLine || spokenLine === prefix.line) return rawLine;
    const leadingWhitespace = rawLine.match(/^\s*/)?.[0] ?? "";
    return `${leadingWhitespace}${prefix.speakerName}: ${spokenLine}`;
  });
}
