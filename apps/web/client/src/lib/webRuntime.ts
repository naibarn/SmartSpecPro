export function hasTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const tauriGlobal = (window as any).__TAURI__ ?? (window as any).__TAURI_INTERNALS__ ?? (window as any).__TAURI_METADATA__;
  if (tauriGlobal != null) {
    return true;
  }
  const protocol = window.location?.protocol ?? "";
  if (protocol === "tauri:" || window.location?.origin?.startsWith("tauri://")) {
    return true;
  }
  const userAgent = window.navigator?.userAgent ?? "";
  return /tauri/i.test(userAgent);
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
