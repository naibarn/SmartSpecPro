const KEY = "smartspec_py_proxy_token";

let cached = "";

/**
 * Desktop security:
 * - Prefer OS keychain (Tauri Rust keyring) when available.
 * - Fallback to localStorage for web/dev.
 */
async function tauriInvoke<T>(cmd: string, args?: any): Promise<T> {
  // Dynamic import to avoid breaking web build
  const mod = await import("@tauri-apps/api/core");
  // @ts-ignore
  return mod.invoke<T>(cmd, args);
}

function hasTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

export async function loadProxyToken(): Promise<string> {
  try {
    if (hasTauri()) {
      const v = await tauriInvoke<string | null>("get_proxy_token");
      cached = v || "";
      return cached;
    }
  } catch {
    // ignore
  }
  try {
    cached = localStorage.getItem(KEY) || "";
  } catch {
    cached = "";
  }
  return cached;
}

export function getProxyToken(): string {
  return cached;
}

export async function setProxyToken(token: string) {
  cached = token || "";
  try {
    if (hasTauri()) {
      if (!token) {
        await tauriInvoke("delete_proxy_token");
      } else {
        await tauriInvoke("set_proxy_token", { token });
      }
      return;
    }
  } catch {
    // ignore
  }
  try {
    if (!token) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, token);
  } catch {
    // ignore
  }
}

export function getProxyTokenHint(): string {
  const t = getProxyToken();
  if (!t) return "";
  return t.length <= 8 ? "********" : `${t.slice(0, 4)}…${t.slice(-4)}`;
}
