import { smartaihubStaticSitemapPaths } from "../../../shared/smartaihubPublicIndex";

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

const publicPaths = new Set(smartaihubStaticSitemapPaths.map(({ path }) => path));

/** Return a route template only for public pages; never emit tenant/user IDs or origins. */
export function getSafePublicPageViewPath(href: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(href, "https://analytics.invalid").pathname;
  } catch {
    return null;
  }

  if (pathname === "/marketplace/auto-review" || pathname.startsWith("/marketplace/auto-review/")) {
    return null;
  }
  if (publicPaths.has(pathname)) return pathname;
  if (/^\/blog\/[^/]+\/?$/.test(pathname)) return "/blog/[slug]";
  if (/^\/marketplace\/[^/]+\/?$/.test(pathname)) {
    return "/marketplace/[listing]";
  }
  return null;
}
