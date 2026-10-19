/** Deterministic HTTP metadata for immutable staging bytes; never read secrets. */
export function cloudflareStagingAssetContentType(name: string, supplied: unknown): string {
  const valid = typeof supplied === "string" &&
    /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;[ \t]*[\w=.+-]+)*$/.test(supplied);
  if (valid && supplied.toLowerCase() !== "application/octet-stream") return supplied;
  // Older published manifests downgraded parameterized types containing a
  // space after ';'. Repair the wire metadata without rewriting stored bytes.
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
    js: "application/javascript", mjs: "application/javascript", json: "application/json",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif", ico: "image/x-icon", avif: "image/avif",
    woff: "font/woff", woff2: "font/woff2", txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8", wasm: "application/wasm", pdf: "application/pdf",
    mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav",
    zip: "application/zip",
  };
  return types[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
