/** Translate the browser's same-origin API path to the Python backend route. */
export function toPythonBackendPath(requestUrl: string): string {
  if (!requestUrl.startsWith("/api/v1/")) {
    throw new Error("Unsupported Python backend API path");
  }

  // Only the OpenAI-compatible router is mounted at /v1. Other Python APIs
  // retain their existing /api/v1 paths.
  if (/^\/api\/v1\/(?:models|chat\/completions|rate-limit\/status)(?:\?|$)/.test(requestUrl)) {
    return requestUrl.replace(/^\/api(?=\/v1\/)/, "");
  }
  return requestUrl;
}
