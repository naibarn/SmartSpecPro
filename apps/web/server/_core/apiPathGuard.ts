const API_REQUEST_PREFIX = /^\/(?:trpc|api)(?:\/|$)/i;

export function isApiRequestPath(url: string): boolean {
  try {
    const parsed = new URL(url, "http://localhost");
    return API_REQUEST_PREFIX.test(parsed.pathname);
  } catch {
    return API_REQUEST_PREFIX.test(url);
  }
}
