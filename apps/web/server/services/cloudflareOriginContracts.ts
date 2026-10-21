/** Backend-local copy of the shared origin contract so the standalone Node
 * runtime never imports TypeScript from a workspace package under node_modules. */
export const CLOUDFLARE_PUBLIC_ORIGIN_HEADER = "x-smartaihub-public-origin";

export function isCanonicalWidgetBrowserOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password && url.origin === value;
  } catch {
    return false;
  }
}

export function parseCloudflarePublicOrigin(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (host.includes("*") || host === "localhost" || host.endsWith(".localhost") ||
        host === "host.docker.internal" || host.startsWith("[") || /^\d+(?:\.\d+){3}$/.test(host)) return null;
    return url.protocol === "https:" && !url.username && !url.password &&
      url.pathname === "/" && !url.search && !url.hash && url.origin === value ? url : null;
  } catch {
    return null;
  }
}

export function parseCloudflarePublicOrigins(raw: string | undefined): readonly string[] | null {
  if (!raw || raw.length > 16_384) return null;
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length === 0 || values.length > 32 ||
        values.some(value => !parseCloudflarePublicOrigin(value))) return null;
    return [...new Set(values as string[])];
  } catch {
    return null;
  }
}
