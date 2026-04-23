function splitFrontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
} {
  const match = /^(---\s*\n[\s\S]*?\n---\s*\n?)([\s\S]*)$/u.exec(markdown);
  if (!match) {
    return {
      frontmatter: null,
      body: markdown,
    };
  }

  return {
    frontmatter: match[1],
    body: match[2] ?? "",
  };
}

function injectIntoFrontmatter(markdown: string, snippet: string): string {
  const { frontmatter, body } = splitFrontmatter(markdown);
  if (!frontmatter) {
    const normalizedBody = body.trimStart();
    return `---\n${snippet}\n---\n\n${normalizedBody}`.trimEnd();
  }

  const frontmatterBody = frontmatter
    .replace(/^---\s*\n/u, "")
    .replace(/\n---\s*\n?$/u, "");
  const existingKeys = new Set(
    Array.from(frontmatterBody.matchAll(/^([A-Za-z][A-Za-z0-9_-]*):/gm), (match) => match[1]),
  );
  const snippetKey = /^([A-Za-z][A-Za-z0-9_-]*):/m.exec(snippet)?.[1] ?? null;

  if (snippetKey && existingKeys.has(snippetKey)) {
    return markdown;
  }

  const mergedFrontmatter = `---\n${frontmatterBody.trimEnd()}\n${frontmatterBody.trim() ? "\n" : ""}${snippet}\n---\n`;
  return `${mergedFrontmatter}${body}`.trimEnd();
}

export function ensureKnowledgeFrontmatter(markdown: string): string {
  let next = ensureFrontmatterAliases(markdown);
  next = ensureFrontmatterTags(next);
  next = ensureFrontmatterProperty(next, "owner");
  next = ensureFrontmatterProperty(next, "status");
  return next;
}

export function ensureFrontmatterAliases(markdown: string): string {
  return injectIntoFrontmatter(markdown, "aliases:\n  - ");
}

export function ensureFrontmatterTags(markdown: string): string {
  return injectIntoFrontmatter(markdown, "tags:\n  - ");
}

export function ensureFrontmatterProperty(
  markdown: string,
  propertyName = "owner",
): string {
  return injectIntoFrontmatter(markdown, `${propertyName}: `);
}
