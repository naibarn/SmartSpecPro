/**
 * Lightweight browser fingerprint collector.
 * Hashes device signals into a SHA-256 fingerprint stored in __fp cookie.
 * No external dependencies.
 */

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCanvasHash(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 25);
    ctx.fillStyle = "#069";
    ctx.fillText("fp:test", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("fp:test", 4, 17);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function getWebGLRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "";
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "";
  } catch {
    return "";
  }
}

function collectComponents(): string[] {
  return [
    `screen:${screen.width}x${screen.height}x${screen.colorDepth}`,
    `tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `lang:${navigator.language}`,
    `cores:${navigator.hardwareConcurrency || 0}`,
    `platform:${navigator.platform}`,
    `touch:${navigator.maxTouchPoints || 0}`,
    `canvas:${getCanvasHash()}`,
    `webgl:${getWebGLRenderer()}`,
  ];
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? match[1] : null;
}

/**
 * Generate and store browser fingerprint.
 * Returns the SHA-256 hash string.
 */
export async function generateFingerprint(): Promise<string> {
  const existing = getCookie("__fp");
  if (existing) return existing;

  const components = collectComponents();
  const hash = await sha256(components.join("|"));
  setCookie("__fp", hash, 365);
  return hash;
}
