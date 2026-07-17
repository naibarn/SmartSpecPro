const BARE_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Users habitually paste the page URL into the feedback Title field, which
 * tells the admin nothing and makes title-prefix dedup collide across every
 * report from the same page. When the title is a bare URL and a description
 * exists, promote the description's first line to the title and keep the URL
 * as context at the end of the description instead.
 */
export function deriveTitleFromDescription(
  title: string,
  description?: string | null,
): { title: string; description: string | null } {
  const trimmedTitle = title.trim();
  const desc = description?.trim() || null;

  if (!BARE_URL_RE.test(trimmedTitle) || !desc) {
    return { title: trimmedTitle, description: desc };
  }

  const firstLine = (desc.split("\n")[0] ?? "").trim().slice(0, 120);
  if (firstLine.length < 3) {
    return { title: trimmedTitle, description: desc };
  }

  const description2 = desc.includes(trimmedTitle)
    ? desc
    : `${desc}\n\nPage: ${trimmedTitle}`;
  return { title: firstLine, description: description2 };
}
