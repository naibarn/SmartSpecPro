import { z } from "zod";

const credentialPatterns = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/i,
  /\b(?:sk_live|rk_live|whsec|gsk|hf)[_-][A-Za-z0-9_-]{12,}\b/i,
  /\bxai[-_][A-Za-z0-9_-]{12,}\b/i,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bya29\.[A-Za-z0-9._-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:ghp|gho|ghs|github_pat|glpat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b[A-Za-z0-9+/]{48,}={0,2}\b/,
  /\b[A-Za-z0-9_-]{64,}\b/,
];
const safePromptText = (value: string) =>
  !/<\s*\/?\s*[a-z][^>]*>/i.test(value) &&
  !/(?:sk_live_|Bearer\s+|Basic\s+[A-Za-z0-9+/=]{8,}|(?:^|[\s_-])(?:x[-_])?(?:api[-_]?key|authorization|cookie|set-cookie|access[-_]?token|client[-_]?secret|secret|token|password|credential)\s*[:=])/i.test(value) &&
  !/(?:javascript|data|vbscript)\s*:/i.test(value) &&
  !/\bon[a-z]+\s*=/i.test(value) &&
  !credentialPatterns.some((pattern) => pattern.test(value));
export const isSafeDesignText = safePromptText;
const identifierSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).refine(safePromptText);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

function isSafeCanonicalPayload(value: unknown, depth = 0, nodes = { count: 0 }): boolean {
  nodes.count += 1;
  if (depth > 32 || nodes.count > 10_000) return false;
  if (typeof value === "string") return value.length <= 20_000 && safePromptText(value);
  if (Array.isArray(value)) return value.every((entry) => isSafeCanonicalPayload(entry, depth + 1, nodes));
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const credentialKeys = new Set([
      "key", "apikey", "xapikey", "password", "passphrase", "cookie", "setcookie",
      "session", "credential", "credentials", "auth", "authorization", "accesskey",
      "accesstoken", "clientsecret", "privatekey", "signature", "headers", "authheader",
    ]);
    return Object.entries(value as Record<string, unknown>).every(([key, child]) => {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return (
        !credentialKeys.has(normalizedKey) &&
        !/(?:secret|token|authorization|rawHtml|sourceCode)/i.test(key) &&
        isSafeCanonicalPayload(child, depth + 1, nodes)
      );
    });
  }
  return value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

export const designPromptEnvelopeSchema = z.object({
  text: z.string().min(1).max(20_000).refine(safePromptText, {
    message: "Prompt contains markup or credential-like content",
  }),
  trust: z.enum(["user-authored", "imported-untrusted"]),
  sourceRef: identifierSchema.optional(),
}).strict();

export const designRequestSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: identifierSchema,
  projectId: identifierSchema,
  requestId: identifierSchema,
  requestedBy: identifierSchema,
  intent: z.enum(["mini-app-screen", "product-screen", "portable-app-screen"]),
  prompt: designPromptEnvelopeSchema,
  locale: z.string().trim().min(2).max(35),
  componentCatalogSnapshotId: identifierSchema.optional(),
}).strict();

export const designArtifactVersionSchema = z.object({
  artifactId: identifierSchema,
  version: z.number().int().positive(),
  digest: sha256Schema,
  tenantId: identifierSchema,
  projectId: identifierSchema,
  ownerId: identifierSchema,
  createdBy: identifierSchema,
  parentArtifactId: identifierSchema.optional(),
  parentVersion: z.number().int().positive().optional(),
  status: z.enum(["draft", "selected", "implemented", "reviewed", "approved", "superseded", "withdrawn"]),
  rights: z.object({
    ownerId: identifierSchema,
    license: z.string().min(1).max(200),
    assetsCleared: z.boolean(),
  }).strict(),
  systemSnapshot: z.object({
    catalogSnapshotId: identifierSchema,
    componentVersion: identifierSchema,
    locale: z.string().min(2).max(35),
    theme: z.enum(["light", "dark", "system", "high-contrast"]),
    deviceProfile: identifierSchema,
  }).strict(),
  actionBindings: z.array(z.object({
    actionId: identifierSchema,
    capabilityId: identifierSchema,
    permissionEvidenceRef: identifierSchema,
  }).strict()).max(100),
  storageRef: z.string().regex(/^internal:[A-Za-z0-9._/-]{1,500}$/).refine((value) =>
    value.slice("internal:".length).split("/").every((segment) => segment && segment !== "." && segment !== ".."),
  ),
  provenance: z.object({
    source: z.enum(["native", "external-provider", "import"]),
    requestId: identifierSchema,
    providerId: identifierSchema.optional(),
    providerVersion: identifierSchema.optional(),
    policyDecisionRef: identifierSchema.optional(),
    branchId: identifierSchema.optional(),
    reproducibility: z.enum(["deterministic", "provider-nondeterministic", "unknown"]),
  }).strict(),
  payload: z.record(z.string(), z.unknown()).refine(isSafeCanonicalPayload, {
    message: "Design payload contains unsafe or oversized content",
  }),
  createdAt: z.string().datetime().optional(),
}).strict().refine(
  (artifact) => Boolean(artifact.parentArtifactId) === Boolean(artifact.parentVersion),
  { message: "Artifact lineage must include both parent artifact and version" },
);

export const designContextBundleSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: identifierSchema,
  projectId: identifierSchema,
  locale: z.string().trim().min(2).max(35),
  theme: z.enum(["light", "dark", "system", "high-contrast"]),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  componentCatalogSnapshotId: identifierSchema,
  content: z.array(z.object({
    sourceRef: identifierSchema,
    trust: z.enum(["trusted", "imported-untrusted"]),
    summary: z.string().max(4_000).refine(safePromptText),
  }).strict()).max(100),
}).strict();

export const designBriefSchema = z.object({
  requestId: identifierSchema,
  objective: z.string().min(1).max(4_000).refine(safePromptText),
  audience: z.string().max(1_000).refine(safePromptText),
  constraints: z.array(z.string().max(1_000).refine(safePromptText)).max(100),
  contextBundleId: identifierSchema,
}).strict();

export const designVariantSetSchema = z.object({
  variantSetId: identifierSchema,
  artifactId: identifierSchema,
  tenantId: identifierSchema,
  projectId: identifierSchema,
  artifactVersion: z.number().int().positive(),
  variants: z.array(z.object({
    variantId: identifierSchema,
    title: z.string().min(1).max(200),
    summary: z.string().max(1_000).refine(safePromptText),
    digest: sha256Schema,
  }).strict()).min(1).max(20),
}).strict();

export const designDecisionSchema = z.object({
  decisionId: identifierSchema,
  tenantId: identifierSchema,
  projectId: identifierSchema,
  artifactId: identifierSchema,
  artifactVersion: z.number().int().positive(),
  selectedVariantId: identifierSchema,
  decidedBy: identifierSchema,
  decidedAt: z.string().datetime(),
  sourceDigest: sha256Schema,
  rationale: z.string().min(1).max(2_000).refine(safePromptText),
}).strict();

export const componentIntentSchema = z.object({
  intentId: identifierSchema,
  role: z.string().min(1).max(100),
  density: z.enum(["comfortable", "compact", "spacious"]),
  capabilities: z.array(identifierSchema).max(50),
  theme: z.enum(["light", "dark", "system", "high-contrast"]),
  catalogSnapshotId: identifierSchema,
  catalogDigest: sha256Schema,
  componentVersion: identifierSchema,
  locale: z.string().min(2).max(35),
  direction: z.enum(["ltr", "rtl"]),
  deviceProfile: z.enum(["mobile", "tablet", "desktop"]),
  safeAreaRequired: z.boolean(),
  reducedMotion: z.boolean(),
  permissionScope: z.enum(["public", "member", "admin"]),
  props: z.record(z.string().max(100), z.unknown()),
}).strict();

export const componentResolutionSchema = z.object({
  status: z.enum(["resolved", "unsupported", "review-needed"]),
  intentId: identifierSchema,
  componentId: identifierSchema.nullable(),
  source: z.enum(["smartspec", "astryx", "pattern", "template", "primitive"]).nullable(),
  catalogSnapshotId: identifierSchema,
  catalogDigest: sha256Schema,
  componentVersion: identifierSchema,
  compatibility: z.object({ minVersion: z.string(), maxExclusiveVersion: z.string() }).strict().optional(),
  props: z.record(z.string(), z.unknown()),
  unsupportedProps: z.array(z.string().max(100)),
  missingCapabilities: z.array(identifierSchema),
  rationale: z.string().min(1).max(1_000).refine(safePromptText),
  fallback: z.boolean(),
  context: z.object({
    locale: z.string().min(2).max(35),
    density: z.enum(["comfortable", "compact", "spacious"]),
    direction: z.enum(["ltr", "rtl"]),
    deviceProfile: z.enum(["mobile", "tablet", "desktop"]),
    theme: z.enum(["light", "dark", "system", "high-contrast"]),
    safeAreaRequired: z.boolean(),
    reducedMotion: z.boolean(),
    permissionScope: z.enum(["public", "member", "admin"]),
  }).strict(),
}).strict();

export const semanticDesignDiffSchema = z.object({
  fromDigest: sha256Schema,
  toDigest: sha256Schema,
  changes: z.array(z.object({
    path: z.string().min(1).max(500),
    kind: z.enum(["added", "removed", "changed"]),
    summary: z.string().max(1_000).refine(safePromptText),
  }).strict()).max(1_000),
}).strict();

export const visualVerificationEvidenceSchema = z.object({
  artifactDigest: sha256Schema,
  tenantId: identifierSchema,
  projectId: identifierSchema,
  catalogSnapshotId: identifierSchema,
  viewportProfile: identifierSchema,
  locale: z.string().min(2).max(35),
  theme: z.enum(["light", "dark", "system", "high-contrast"]),
  checks: z.array(z.object({
    id: identifierSchema,
    status: z.enum(["passed", "failed", "not-run"]),
    evidenceRef: identifierSchema.optional(),
  }).strict()).min(1).max(200),
  capturedAt: z.string().datetime(),
}).strict();

export type DesignRequest = z.infer<typeof designRequestSchema>;
export type DesignArtifactVersion = z.infer<typeof designArtifactVersionSchema>;

export const designG0ReconciliationSchema = z.object({
  specNumberUnique: z.enum(["verified", "unresolved"]),
  schemaOwner: z.enum(["verified", "unresolved"]),
  recoveryClosure: z.enum(["verified", "unresolved"]),
  contractAuthorities: z.enum(["verified", "unresolved"]),
  secretBinding: z.enum(["verified", "unresolved"]),
  providerCertification: z.enum(["verified", "unresolved"]),
  flagsDefaultOff: z.literal(true),
}).strict();

export function isDesignG0CoreReady(record: z.infer<typeof designG0ReconciliationSchema>): boolean {
  return (
    record.specNumberUnique === "verified" &&
    record.schemaOwner === "verified" &&
    record.recoveryClosure === "verified" &&
    record.contractAuthorities === "verified" &&
    record.secretBinding === "verified"
  );
}

function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Cannot canonicalize cyclic design data");
    seen.add(value);
    const result = value.map((item) => canonicalize(item, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Design digest input must use plain JSON objects");
    }
    if (seen.has(value)) throw new TypeError("Cannot canonicalize cyclic design data");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = Object.fromEntries(
      Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => [key, canonicalize(record[key], seen)]),
    );
    seen.delete(value);
    return result;
  }
  throw new TypeError("Design digest input must contain only JSON values");
}

/** Stable serialization input; digest computation belongs to the owning service. */
export function canonicalDesignDigestInput(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}
