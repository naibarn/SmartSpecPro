export function hasTauriRuntime(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

export function getSmartSpecWebEndpoint(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!hasTauriRuntime()) {
    return normalizedPath;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") {
      return normalizedPath;
    }
  }

  const baseUrl = (import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app").replace(/\/+$/, "");
  return `${baseUrl}${normalizedPath}`;
}
