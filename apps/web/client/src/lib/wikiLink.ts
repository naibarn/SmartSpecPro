export interface ParsedWikiLinkTarget {
  reference: string;
  label: string;
}

const MARKDOWN_TITLE_EXTENSION_PATTERN = /\.(md|markdown)$/i;

export function normalizeWikiLinkToken(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripMarkdownTitleExtension(title: string): string {
  return title.replace(MARKDOWN_TITLE_EXTENSION_PATTERN, "").trim();
}

export function parseWikiLinkTarget(
  rawValue: string,
): ParsedWikiLinkTarget | null {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.includes("[") || trimmed.includes("]")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("|");
  const reference =
    separatorIndex >= 0
      ? normalizeWikiLinkToken(trimmed.slice(0, separatorIndex))
      : normalizeWikiLinkToken(trimmed);
  const label =
    separatorIndex >= 0
      ? normalizeWikiLinkToken(trimmed.slice(separatorIndex + 1))
      : reference;

  if (!reference) {
    return null;
  }

  return {
    reference,
    label: label || reference,
  };
}

export function serializeWikiLinkTarget(target: {
  reference: string;
  label?: string | null;
}): string {
  const reference = normalizeWikiLinkToken(target.reference);
  const label = normalizeWikiLinkToken(target.label ?? "");

  if (!reference) {
    return "";
  }

  if (!label || label === reference) {
    return `[[${reference}]]`;
  }

  return `[[${reference}|${label}]]`;
}

export function resolveWikiLinkTargetFromNote(note: {
  title: string;
  logicalPath?: string | null;
}): ParsedWikiLinkTarget {
  const label = stripMarkdownTitleExtension(note.title) || note.title.trim();
  const reference = normalizeWikiLinkToken(note.logicalPath ?? label);

  return {
    reference,
    label: label || reference,
  };
}

export function matchesWikiLinkReference(
  reference: string,
  note: {
    title: string;
    logicalPath?: string | null;
  },
): boolean {
  const normalizedReference = normalizeWikiLinkToken(reference).toLowerCase();
  if (!normalizedReference) {
    return false;
  }

  const normalizedLogicalPath = normalizeWikiLinkToken(
    note.logicalPath ?? "",
  ).toLowerCase();
  const normalizedTitle = normalizeWikiLinkToken(note.title).toLowerCase();
  const normalizedTitleWithoutExtension = stripMarkdownTitleExtension(
    note.title,
  ).toLowerCase();

  return (
    normalizedReference === normalizedLogicalPath
    || normalizedReference === normalizedTitle
    || normalizedReference === normalizedTitleWithoutExtension
  );
}
