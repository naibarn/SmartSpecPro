/**
 * Conservative routing inventory for HTTP requests entering the Cloudflare
 * Worker. Keep this explicit: routes absent from this inventory fail closed to
 * the native runtime and must never be dispatched to Worker business logic.
 *
 * Worker-native routes must execute a registered Fetch handler; health checks
 * and public verification-key metadata do not proxy to the Linux runtime.
 * Auth, tRPC, provider APIs, uploads, and application APIs remain origin-owned.
 */
export type ApiRouteClassification =
  | "WORKER_NATIVE"
  | "WORKER_COMPATIBLE_WITH_CHANGES"
  | "ORIGIN_PROXY"
  | "NATIVE_RUNTIME_ONLY";

export type ApiRouteMatchKind = "exact" | "prefix";

export interface ApiRouteManifestEntry {
  readonly id: string;
  readonly path: string;
  readonly match: ApiRouteMatchKind;
  readonly methods: readonly string[] | "*";
  readonly classification: ApiRouteClassification;
  readonly reason: string;
}

/**
 * Entries are ordered from most specific to broadest. Prefix matches require
 * a path segment boundary, so `/api` does not capture `/apiary`.
 */
export const API_ROUTE_MANIFEST: readonly ApiRouteManifestEntry[] = [
  {
    id: "health.liveness",
    path: "/healthz",
    match: "exact",
    methods: ["GET", "HEAD"],
    classification: "WORKER_NATIVE",
    reason: "Express returns a static JSON liveness response without service or database access.",
  },
  {
    id: "health.readiness",
    path: "/readyz",
    match: "exact",
    methods: ["GET", "HEAD"],
    classification: "WORKER_NATIVE",
    reason: "Reports Cloudflare Worker binding/job readiness only; it does not assert Linux app or PostgreSQL readiness.",
  },
  {
    id: "content-protection.public-keys",
    path: "/.well-known/smartaihub-evidence-keys.json",
    match: "exact",
    methods: ["GET", "HEAD"],
    classification: "WORKER_NATIVE",
    reason: "Public verification-key metadata is stateless and uses the shared content-protection contract.",
  },
  {
    id: "ops.metrics",
    path: "/metrics",
    match: "exact",
    methods: ["GET", "HEAD"],
    classification: "NATIVE_RUNTIME_ONLY",
    reason: "Metrics depend on Node process registries and runtime-local instrumentation.",
  },
  {
    id: "ops.virtual-admin-health",
    path: "/api/virtual-admin/health",
    match: "exact",
    methods: ["GET", "HEAD"],
    classification: "NATIVE_RUNTIME_ONLY",
    reason: "The handler dynamically imports the native guardian scheduler.",
  },
  {
    id: "stream.virtual-admin-events",
    path: "/api/virtual-admin/events",
    match: "prefix",
    methods: "*",
    classification: "NATIVE_RUNTIME_ONLY",
    reason: "The route is an SSE stream backed by the native guardian runtime.",
  },
  {
    id: "uploads",
    path: "/uploads",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "Existing upload/download handlers enforce authorization and stream object storage through the origin.",
  },
  {
    id: "auth",
    path: "/api/auth",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "Session authority, cookies, CSRF, and auth rate limits remain on the existing origin.",
  },
  {
    id: "oauth",
    path: "/oauth",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "OAuth callbacks and token/session state remain owned by the existing origin.",
  },
  {
    id: "trpc",
    path: "/trpc",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "The tRPC router uses the shared application context and is not yet Worker-adapted.",
  },
  {
    id: "api",
    path: "/api",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "Express API routes retain their current business logic and authorization at the origin.",
  },
  {
    id: "v1",
    path: "/v1",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "Public API routes include provider, job, and database-backed handlers owned by the origin.",
  },
  {
    id: "auth-pages",
    path: "/auth",
    match: "prefix",
    methods: "*",
    classification: "ORIGIN_PROXY",
    reason: "Browser auth redirects and callbacks must retain the established origin authority.",
  },
  {
    id: "websocket.widget-origin",
    path: "/widget/v1/ws",
    match: "exact",
    methods: ["GET"],
    classification: "ORIGIN_PROXY",
    reason: "The exact widget upgrade retains Access, origin attestation, and the native widget token/origin authority.",
  },
  {
    id: "websocket",
    path: "/socket.io",
    match: "prefix",
    methods: "*",
    classification: "NATIVE_RUNTIME_ONLY",
    reason: "Socket.IO upgrade handling is not part of the Worker HTTP proxy contract.",
  },
  {
    id: "websocket.ws",
    path: "/ws",
    match: "prefix",
    methods: "*",
    classification: "NATIVE_RUNTIME_ONLY",
    reason: "WebSocket upgrade routes remain attached to the native server runtime.",
  },
] as const;

const FAIL_CLOSED_MATCH: ApiRouteManifestEntry = {
  id: "unmatched",
  path: "*",
  match: "exact",
  methods: "*",
  classification: "NATIVE_RUNTIME_ONLY",
  reason: "No explicit Worker routing policy exists for this path and method.",
};

function pathMatches(entry: ApiRouteManifestEntry, pathname: string): boolean {
  if (entry.match === "exact") return pathname === entry.path;
  return pathname === entry.path || pathname.startsWith(`${entry.path}/`);
}

/** Resolve a URL path and HTTP method to its explicit runtime owner. */
export function classifyApiRoute(method: string, pathname: string): ApiRouteManifestEntry {
  const normalizedMethod = method.toUpperCase();
  // URL.pathname is expected at call sites; reject query strings/fragments here
  // too, so callers cannot accidentally classify a different URL component.
  const cleanPath = pathname.split(/[?#]/, 1)[0] || "/";
  const entry = API_ROUTE_MANIFEST.find(candidate =>
    pathMatches(candidate, cleanPath) &&
    (candidate.methods === "*" || candidate.methods.includes(normalizedMethod)),
  );
  return entry ?? FAIL_CLOSED_MATCH;
}
