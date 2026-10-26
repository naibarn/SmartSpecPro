/** Immutable artifact observed failing the real Container boot in canonical
 * Job 95f057d7-19d7-4bad-823d-157770eae7d9 (SIN). Its signed-in registry receipt
 * is valid, but the baked Node 22.22.3 cannot satisfy the app's 22.23.4 floor.
 * This identifies a known failure; an unknown digest is NOT runtime acceptance.
 * Future builds run the canonical version guard before publication. */
export function knownHttpNodeImageFailure(image: unknown) {
  if (typeof image !== "string" || !/^registry\.cloudflare\.com\/[a-f0-9]{32}\/smartspec-staging-[a-f0-9]{12}-node-http@sha256:d8d5b38fca643300119684f11576b4b94c5bfa6e043f75e6a3bf7f471690140f$/.test(image)) return null;
  return { code: "HTTP_IMAGE_NODE_RUNTIME_UNSUPPORTED" as const, image, observedVersion: "22.22.3", requiredVersion: ">=22.23.4 <23" };
}
