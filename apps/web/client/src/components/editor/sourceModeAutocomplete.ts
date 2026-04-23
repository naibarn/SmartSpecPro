import {
  autocompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

type SourceModeAutocompleteCatalogs = {
  aliases?: string[];
  propertyKeys?: string[];
  tags?: string[];
};

type FrontmatterCompletionContext =
  | {
      kind: "aliases" | "tags";
      from: number;
      to: number;
      query: string;
    }
  | {
      kind: "keys";
      from: number;
      to: number;
      query: string;
    };

const CORE_FRONTMATTER_KEYS = [
  {
    key: "aliases",
    label: "aliases:",
    detail: "List alternate names for this note",
    apply: "aliases:\n  - ",
  },
  {
    key: "tags",
    label: "tags:",
    detail: "Reuse shared note tags",
    apply: "tags:\n  - ",
  },
  {
    key: "owner",
    label: "owner:",
    detail: "Capture the team or person responsible",
    apply: "owner: ",
  },
  {
    key: "status",
    label: "status:",
    detail: "Track lifecycle or review state",
    apply: "status: ",
  },
];

function normalizeUniqueValues(
  values: Array<string | null | undefined>
): string[] {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    next.push(normalized);
  }

  return next;
}

function getFrontmatterBounds(
  doc: string
): { start: number; end: number } | null {
  const match = /^(---\s*\n)([\s\S]*?)(\n---\s*\n?)/u.exec(doc);
  if (!match) {
    return null;
  }

  return {
    start: match[1].length,
    end: match[1].length + (match[2]?.length ?? 0),
  };
}

function getLineStart(doc: string, pos: number): number {
  return doc.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
}

function getActiveFrontmatterKey(
  doc: string,
  bounds: { start: number; end: number },
  pos: number
): string | null {
  const inspected = doc.slice(bounds.start, Math.min(bounds.end, pos));
  const lines = inspected.split("\n");
  let currentKey: string | null = null;

  for (const line of lines) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):/.exec(line);
    if (match?.[1]) {
      currentKey = match[1];
    }
  }

  return currentKey;
}

export function detectSourceModeCompletionContext(
  doc: string,
  pos: number
): FrontmatterCompletionContext | null {
  const bounds = getFrontmatterBounds(doc);
  if (!bounds || pos < bounds.start || pos > bounds.end) {
    return null;
  }

  const lineStart = getLineStart(doc, pos);
  if (lineStart < bounds.start) {
    return null;
  }

  const linePrefix = doc.slice(lineStart, pos);
  const activeKey = getActiveFrontmatterKey(doc, bounds, pos);

  if (activeKey === "tags") {
    const tagMatch = /^\s*-\s*([A-Za-z0-9/_-]*)$/.exec(linePrefix);
    if (tagMatch) {
      return {
        kind: "tags",
        from: pos - (tagMatch[1]?.length ?? 0),
        to: pos,
        query: tagMatch[1] ?? "",
      };
    }
  }

  if (activeKey === "aliases") {
    const aliasMatch = /^\s*-\s*([^\n]*)$/.exec(linePrefix);
    if (aliasMatch) {
      return {
        kind: "aliases",
        from: pos - (aliasMatch[1]?.length ?? 0),
        to: pos,
        query: aliasMatch[1]?.trimStart() ?? "",
      };
    }
  }

  const keyMatch = /^\s*([A-Za-z][A-Za-z0-9_-]*)?$/.exec(linePrefix);
  if (!keyMatch) {
    return null;
  }

  const query = keyMatch[1] ?? "";
  return {
    kind: "keys",
    from: pos - query.length,
    to: pos,
    query,
  };
}

function buildKeyCompletions(
  query: string,
  propertyKeys: string[]
): Completion[] {
  const normalizedQuery = query.trim().toLowerCase();
  const seenKeys = new Set(CORE_FRONTMATTER_KEYS.map(entry => entry.key));
  const dynamicProperties = normalizeUniqueValues(propertyKeys)
    .filter(key => !seenKeys.has(key.toLowerCase()))
    .map(key => ({
      key,
      label: `${key}:`,
      detail: "Reuse an existing frontmatter property",
      apply: `${key}: `,
    }));

  return [...CORE_FRONTMATTER_KEYS, ...dynamicProperties]
    .filter(
      entry =>
        !normalizedQuery ||
        entry.label.toLowerCase().startsWith(normalizedQuery)
    )
    .slice(0, 10)
    .map(entry => ({
      label: entry.label,
      type: "property",
      detail: entry.detail,
      apply: entry.apply,
    }));
}

function buildValueCompletions(
  values: string[],
  query: string,
  type: "aliases" | "tags"
): Completion[] {
  const normalizedQuery = query.trim().toLowerCase();

  return normalizeUniqueValues(values)
    .filter(
      value => !normalizedQuery || value.toLowerCase().includes(normalizedQuery)
    )
    .slice(0, 12)
    .map(value => ({
      label: value,
      type: type === "tags" ? "keyword" : "text",
      detail:
        type === "tags"
          ? "Reuse an existing knowledge tag"
          : "Reuse a known title or alias",
    }));
}

export function createSourceModeAutocompleteExtension(
  catalogs: SourceModeAutocompleteCatalogs
): Extension {
  const aliasSuggestions = normalizeUniqueValues(catalogs.aliases ?? []);
  const propertyKeys = normalizeUniqueValues(catalogs.propertyKeys ?? []);
  const tagSuggestions = normalizeUniqueValues(catalogs.tags ?? []);

  return autocompletion({
    activateOnTyping: true,
    icons: false,
    maxRenderedOptions: 10,
    override: [
      (context: CompletionContext) => {
        const doc = context.state.doc.toString();
        const completionContext = detectSourceModeCompletionContext(
          doc,
          context.pos
        );
        if (!completionContext) {
          return null;
        }

        let options: Completion[] = [];
        let validFor = /^[A-Za-z0-9/_ -]*$/;

        if (completionContext.kind === "keys") {
          options = buildKeyCompletions(completionContext.query, propertyKeys);
          validFor = /^[A-Za-z0-9_-]*$/;
        } else if (completionContext.kind === "tags") {
          options = buildValueCompletions(
            tagSuggestions,
            completionContext.query,
            "tags"
          );
          validFor = /^[A-Za-z0-9/_-]*$/;
        } else {
          options = buildValueCompletions(
            aliasSuggestions,
            completionContext.query,
            "aliases"
          );
        }

        if (!context.explicit && options.length === 0) {
          return null;
        }

        return {
          from: completionContext.from,
          to: completionContext.to,
          options,
          validFor,
        };
      },
    ],
  });
}
