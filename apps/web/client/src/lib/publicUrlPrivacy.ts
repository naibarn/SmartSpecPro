/** Keep query strings, fragments, and bearer tokens out of page-view analytics. */
export function redactShareTokenFromUrl(href: string): string {
  let pathname: string;
  try {
    pathname = new URL(href, "https://analytics.invalid").pathname;
  } catch {
    pathname = "/";
  }
  return pathname
    .replace(/(\/share\/vd\/)[^/?#]+/, "$1[redacted]")
    .replace(/(\/share\/)(?!vd\/)[^/?#]+/, "$1[redacted]");
}
