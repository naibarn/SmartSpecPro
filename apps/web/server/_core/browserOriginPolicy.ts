/** Shared by the actual CORS and CSRF middleware; no application startup. */
export function createAllowedBrowserOrigin(input: {
  production: boolean;
  allowedOrigins?: string;
  appUrl?: string;
  publicAppUrl?: string;
}): (origin: string | undefined) => boolean {
  const configured = [
    ...(input.allowedOrigins ?? "").split(","), input.appUrl ?? "", input.publicAppUrl ?? "",
  ].map(origin => origin.trim().replace(/\/+$/, "")).filter(Boolean);
  const suffixes = configured.length > 0 && input.production ? [] : [
    ".smartaihub.app", ".smartspec.pro", ...(!input.production ? [".smartspec.local", ".localhost"] : []),
  ];
  const exact = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", ...configured]);
  return origin => {
    if (!origin) return false;
    if (exact.has(origin)) return true;
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) return false;
      return url.hostname === "localhost" ||
        (!input.production && /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)) ||
        suffixes.some(suffix => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix));
    } catch {
      return false;
    }
  };
}
