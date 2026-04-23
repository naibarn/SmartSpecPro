import type { LibraryKnowledgePropertyValue } from "./libraryKnowledgePropertyService";
import {
  extractLibraryKnowledgeAliases,
  extractLibraryKnowledgeTags,
  normalizeLibraryKnowledgeProperties,
} from "./libraryKnowledgePropertyService";
import yaml from "js-yaml";

export type LibraryKnowledgeReferenceKind = "wikilink" | "markdown";
export type LibraryKnowledgeResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "unresolved"
  | "forbidden";

export interface LibraryKnowledgeHeading {
  depth: number;
  text: string;
  slug: string;
}

export interface LibraryKnowledgeReference {
  raw: string;
  target: string;
  displayText: string | null;
  kind: LibraryKnowledgeReferenceKind;
  targetPath: string | null;
  targetHeading: string | null;
}

export interface ExtractedLibraryMarkdownKnowledge {
  frontmatter: Record<string, LibraryKnowledgePropertyValue>;
  aliases: string[];
  tags: string[];
  headings: LibraryKnowledgeHeading[];
  references: LibraryKnowledgeReference[];
}

export interface LibraryKnowledgeCandidate {
  libraryItemId: number;
  title: string;
  logicalPath: string | null;
  aliases?: string[] | null;
  isReadable?: boolean;
}

export interface LibraryKnowledgeResolutionResult {
  status: LibraryKnowledgeResolutionStatus;
  targetLibraryItemId: number | null;
  matchedBy: "logical_path" | "title" | "alias" | null;
  matchedValue: string | null;
  candidateIds: number[];
}

export function normalizeLibraryKnowledgeLogicalPath(value: string): string {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return "";
  }

  const [rawPathPart, rawHeadingPart] = trimmed.split("#", 2);
  const pathPart = rawPathPart
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\.(md|markdown)$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  const headingPart = rawHeadingPart
    ? slugifyKnowledgeToken(rawHeadingPart)
    : "";

  if (pathPart && headingPart) {
    return `${pathPart}#${headingPart}`;
  }

  if (headingPart) {
    return `#${headingPart}`;
  }

  return pathPart;
}

export function extractLibraryMarkdownKnowledge(
  markdown: string,
): ExtractedLibraryMarkdownKnowledge {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const properties = normalizeLibraryKnowledgeProperties(frontmatter);
  const aliases = extractLibraryKnowledgeAliases(properties);
  const frontmatterTags = extractLibraryKnowledgeTags(properties);
  const bodyTags = extractBodyTags(body);
  const headings = extractHeadings(body);

  return {
    frontmatter: properties,
    aliases,
    tags: Array.from(new Set([...frontmatterTags, ...bodyTags])),
    headings,
    references: [
      ...extractWikiReferences(body),
      ...extractMarkdownReferences(body),
    ],
  };
}

export function resolveLibraryKnowledgeReference(
  reference: string,
  candidates: LibraryKnowledgeCandidate[],
): LibraryKnowledgeResolutionResult {
  const normalizedReference = reference.trim();
  const referencePath = normalizeReferencePath(normalizedReference);
  const strategies: Array<{
    matchedBy: LibraryKnowledgeResolutionResult["matchedBy"];
    predicate: (candidate: LibraryKnowledgeCandidate) => boolean;
    matchedValue: string | null;
  }> = [
    ...(referencePath
      ? [{
          matchedBy: "logical_path" as const,
          matchedValue: referencePath,
          predicate: (candidate: LibraryKnowledgeCandidate) =>
            Boolean(candidate.logicalPath)
            && normalizeLibraryKnowledgeLogicalPath(candidate.logicalPath ?? "")
              === referencePath,
        }]
      : []),
    {
      matchedBy: "title",
      matchedValue: normalizedReference.trim().toLowerCase(),
      predicate: (candidate: LibraryKnowledgeCandidate) =>
        candidate.title.trim().toLowerCase() === normalizedReference.trim().toLowerCase(),
    },
    {
      matchedBy: "alias",
      matchedValue: normalizedReference.trim().toLowerCase(),
      predicate: (candidate: LibraryKnowledgeCandidate) =>
        (candidate.aliases ?? []).some(
          (alias) => alias.trim().toLowerCase() === normalizedReference.trim().toLowerCase(),
        ),
    },
  ];

  for (const strategy of strategies) {
    const matches = candidates.filter(strategy.predicate);
    if (matches.length === 0) {
      continue;
    }

    const readableMatches = matches.filter((candidate) => candidate.isReadable !== false);
    if (readableMatches.length === 1) {
      return {
        status: "resolved",
        targetLibraryItemId: readableMatches[0].libraryItemId,
        matchedBy: strategy.matchedBy,
        matchedValue: strategy.matchedValue,
        candidateIds: readableMatches.map((candidate) => candidate.libraryItemId),
      };
    }

    if (readableMatches.length > 1) {
      return {
        status: "ambiguous",
        targetLibraryItemId: null,
        matchedBy: strategy.matchedBy,
        matchedValue: strategy.matchedValue,
        candidateIds: readableMatches.map((candidate) => candidate.libraryItemId),
      };
    }

    return {
      status: "forbidden",
      targetLibraryItemId: null,
      matchedBy: strategy.matchedBy,
      matchedValue: strategy.matchedValue,
      candidateIds: matches.map((candidate) => candidate.libraryItemId),
    };
  }

  return {
    status: "unresolved",
    targetLibraryItemId: null,
    matchedBy: null,
    matchedValue: null,
    candidateIds: [],
  };
}

function splitFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: normalized,
    };
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      frontmatter: {},
      body: normalized,
    };
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const parsed = yaml.load(frontmatterBlock, {
    schema: yaml.JSON_SCHEMA,
  });

  return {
    frontmatter:
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {},
    body: normalized.slice(closingIndex + 5),
  };
}

function extractHeadings(markdownBody: string): LibraryKnowledgeHeading[] {
  const headings: LibraryKnowledgeHeading[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;

  for (const match of markdownBody.matchAll(headingRegex)) {
    const depth = match[1]?.length ?? 1;
    const text = match[2]?.trim() ?? "";
    if (!text) {
      continue;
    }

    headings.push({
      depth,
      text,
      slug: slugifyKnowledgeToken(text),
    });
  }

  return headings;
}

function extractBodyTags(markdownBody: string): string[] {
  const tags = markdownBody.match(/(^|[\s(])#([\p{Letter}\p{Number}_/-]+)/gu) ?? [];
  const normalized = tags
    .map((tag) => tag.trim().replace(/^[^(]*#/, "").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function extractWikiReferences(markdownBody: string): LibraryKnowledgeReference[] {
  const references: LibraryKnowledgeReference[] = [];
  const wikiRegex = /\[\[([^[\]]+)\]\]/g;

  for (const match of markdownBody.matchAll(wikiRegex)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw) {
      continue;
    }

    const [targetPart, displayPart] = raw.split("|", 2);
    const [pathPart, headingPart] = targetPart.trim().split("#", 2);
    references.push({
      raw,
      target: targetPart.trim(),
      displayText: displayPart?.trim() || null,
      kind: "wikilink",
      targetPath: pathPart ? normalizeLibraryKnowledgeLogicalPath(pathPart) : null,
      targetHeading: headingPart ? slugifyKnowledgeToken(headingPart) : null,
    });
  }

  return references;
}

function extractMarkdownReferences(markdownBody: string): LibraryKnowledgeReference[] {
  const references: LibraryKnowledgeReference[] = [];
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const match of markdownBody.matchAll(markdownLinkRegex)) {
    const fullMatch = match[0] ?? "";
    const text = match[1]?.trim() ?? "";
    const href = match[2]?.trim() ?? "";
    const matchIndex = match.index ?? 0;

    if (!href || markdownBody[matchIndex - 1] === "!" || !isLikelyInternalLink(href)) {
      continue;
    }

    const [pathPart, headingPart] = href.split("#", 2);
    references.push({
      raw: fullMatch,
      target: href,
      displayText: text || null,
      kind: "markdown",
      targetPath: normalizeLibraryKnowledgeLogicalPath(pathPart),
      targetHeading: headingPart ? slugifyKnowledgeToken(headingPart) : null,
    });
  }

  return references;
}

function normalizeReferencePath(reference: string): string | null {
  if (/[/.#]/.test(reference)) {
    const normalized = normalizeLibraryKnowledgeLogicalPath(reference);
    return normalized || null;
  }

  return null;
}

function isLikelyInternalLink(href: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
}

function slugifyKnowledgeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
