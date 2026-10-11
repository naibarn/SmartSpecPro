import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { validateSpaasPackage } from "../../../../packages/spaas-standard/src/index";
import type { PackageEntry } from "../../../../packages/spaas-standard/src/model";
import { appIdentities, canonicalProjectAppBindings, canonicalProjects, projectWikiPackageCandidates } from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import { storagePutIfAbsent, storageReadBuffer } from "../storage";

export const PROJECT_WIKI_CANDIDATE = Object.freeze({
  appId: "app_project_wiki_pages",
  sourceRevision: "831e6c04b2f13d4686627cf3abf956607fb8a08f",
  packageDigest: "spaas-package-v1:sha256:0f5094b9fded79258095dd1fc8c418729199006ae964d416e621f80b2525c62a",
  archiveSha256: "1b026ea424684619846975c1157ee1c9715a99b1c453d9e39693b967b49abd5b",
  appVersion: "0.1.0",
} as const);

export const PROJECT_WIKI_STAGING_APPROVAL_KIND = "project-wiki-staging-envelope/v1" as const;
export const PROJECT_WIKI_MIGRATION_PLAN = Object.freeze([
  { tag: "0392_spec304_app_identity_and_route_aliases", sha256: "f2069748b46f8024a8cf8d89bd7440803318f46da6871dfb47c7932610ded0fd" },
  { tag: "0393_spec302_canonical_project_identity", sha256: "6e5237357edde02315244dc69cf50ebf450f71d43d8f11927007f50df4c67738" },
  { tag: "0394_project_wiki_pages_mini_app", sha256: "a49d23e221cdd2efac1ed426530e4d8643dc7446224c3959ab1f97ffa792afc7" },
] as const);

export type ProjectWikiCandidateIdentity = Readonly<{
  tenantId: string;
  projectId: string;
  appId: typeof PROJECT_WIKI_CANDIDATE.appId;
}>;

export type ProjectWikiStagingEnvelope = Readonly<{
  schemaVersion: typeof PROJECT_WIKI_STAGING_APPROVAL_KIND;
  environment: "staging";
  provider: "cloudflare";
  identity: ProjectWikiCandidateIdentity;
  candidate: typeof PROJECT_WIKI_CANDIDATE;
  target: Readonly<{ targetId: string; containerApplicationRef: string; hostRevision: string; hostImage: string }>;
  database: Readonly<{
    provider: "postgresql";
    databaseId: string;
    databaseIdentity: string;
    credentialRef: string;
    migrationPlan: ReadonlyArray<{ tag: string; sha256: string }>;
    recoveryStrategyId: string;
    recoveryEvidenceRef: string;
  }>;
  verifiers: Readonly<{ v5VerifierId: string; v6VerifierId: string }>;
  runner: Readonly<{ runnerId: string; workspaceId: string }>;
  execution: Readonly<{
    maxBudgetMinorUnits: number;
    maxDurationSeconds: number;
    currency: string;
    expiresAt: string;
    cleanupAction: string;
    revocationRef: string;
  }>;
}>;

export const projectWikiStagingEnvelopeSchema = z.object({
  schemaVersion: z.literal(PROJECT_WIKI_STAGING_APPROVAL_KIND),
  environment: z.literal("staging"),
  provider: z.literal("cloudflare"),
  identity: z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), appId: z.literal(PROJECT_WIKI_CANDIDATE.appId) }).strict(),
  candidate: z.object({
    appId: z.literal(PROJECT_WIKI_CANDIDATE.appId),
    sourceRevision: z.literal(PROJECT_WIKI_CANDIDATE.sourceRevision),
    packageDigest: z.literal(PROJECT_WIKI_CANDIDATE.packageDigest),
    archiveSha256: z.literal(PROJECT_WIKI_CANDIDATE.archiveSha256),
    appVersion: z.literal(PROJECT_WIKI_CANDIDATE.appVersion),
  }).strict(),
  target: z.object({
    targetId: z.string().trim().min(1).max(160),
    containerApplicationRef: z.string().trim().min(1).max(255),
    hostRevision: z.string().trim().regex(/^[a-f0-9]{40}$/i),
    hostImage: z.string().trim().regex(/^.+@sha256:[a-f0-9]{64}$/i),
  }).strict(),
  database: z.object({
    provider: z.literal("postgresql"),
    databaseId: z.string().trim().min(1).max(160),
    databaseIdentity: z.string().trim().min(1).max(255),
    credentialRef: z.string().trim().min(1).max(255),
    migrationPlan: z.array(z.object({ tag: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(3),
    recoveryStrategyId: z.string().trim().min(1).max(160),
    recoveryEvidenceRef: z.string().trim().min(1).max(512),
  }).strict(),
  verifiers: z.object({ v5VerifierId: z.string().trim().min(1).max(160), v6VerifierId: z.string().trim().min(1).max(160) }).strict(),
  runner: z.object({ runnerId: z.string().trim().min(1).max(160), workspaceId: z.string().trim().min(1).max(160) }).strict(),
  execution: z.object({
    maxBudgetMinorUnits: z.number().int().positive().max(100_000_000),
    maxDurationSeconds: z.number().int().positive().max(7 * 24 * 60 * 60),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    expiresAt: z.string().datetime(),
    cleanupAction: z.string().trim().min(1).max(512),
    revocationRef: z.string().trim().min(1).max(255),
  }).strict(),
}).strict();

export type ProjectWikiApprovalEvidence = Readonly<{
  id: string;
  requestType: string;
  status: string;
  tenantId: string | null;
  projectId: string | null;
  payload: unknown;
  currentApprovals: number;
  requiredApprovers: number;
  expiresAt: string | null;
  revokedAt: string | null;
}>;

export type ProjectWikiCandidateRecord = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  appId: string;
  sourceRevision: string;
  packageDigest: string;
  archiveSha256: string;
  objectKey: string;
  approvalRef: string;
  approvalPayloadSha256: string;
  qualificationStatus: "CANDIDATE_NOT_RELEASED";
  validationStatus: "needs_context";
  provenance: Readonly<{ sourceRevision: string; verificationProfile: "offline-package"; verifiedArchiveSha256: string; inventory: string[] }>;
  createdBy: number;
}>;

export type ProjectWikiCandidateStore = Readonly<{
  putIfAbsent(key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; created: boolean }>;
  readBuffer(key: string): Promise<Uint8Array | null>;
}>;

export type ProjectWikiCandidateRepository = Readonly<{
  isActiveBinding(identity: ProjectWikiCandidateIdentity): Promise<boolean>;
  getByIdentity(identity: ProjectWikiCandidateIdentity & { packageDigest: string }): Promise<ProjectWikiCandidateRecord | null>;
  insert(record: ProjectWikiCandidateRecord): Promise<ProjectWikiCandidateRecord>;
}>;

export class ProjectWikiReleaseCandidateError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProjectWikiReleaseCandidateError";
  }
}

function fail(code: string): never { throw new ProjectWikiReleaseCandidateError(code); }
function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }

function parseOctal(field: Buffer): number {
  const value = field.toString("ascii").replace(/\0.*$/, "").trim();
  if (!value || !/^[0-7]+$/.test(value)) fail("PACKAGE_ARCHIVE_HEADER_INVALID");
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed)) fail("PACKAGE_ARCHIVE_HEADER_INVALID");
  return parsed;
}

function parsePaxPath(data: Buffer): string | null {
  let offset = 0;
  let path: string | null = null;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) fail("PACKAGE_ARCHIVE_PAX_INVALID");
    const length = Number.parseInt(data.toString("ascii", offset, space), 10);
    if (!Number.isSafeInteger(length) || length < space - offset + 3 || offset + length > data.length) fail("PACKAGE_ARCHIVE_PAX_INVALID");
    const record = data.toString("utf8", space + 1, offset + length - 1);
    const equals = record.indexOf("=");
    if (equals < 1) fail("PACKAGE_ARCHIVE_PAX_INVALID");
    const key = record.slice(0, equals);
    const value = record.slice(equals + 1);
    if (key === "path") path = value;
    if (["linkpath", "GNU.sparse.map", "GNU.sparse.size", "size"].includes(key)) fail("PACKAGE_ARCHIVE_ENTRY_UNSUPPORTED");
    offset += length;
  }
  return path;
}

function parseTarGzip(bytes: Uint8Array): PackageEntry[] {
  let tar: Buffer;
  try { tar = gunzipSync(Buffer.from(bytes), { maxOutputLength: 10 * 1024 * 1024 }); }
  catch { return fail("PACKAGE_ARCHIVE_GZIP_INVALID"); }
  const entries: PackageEntry[] = [];
  let offset = 0;
  let nextPath: string | null = null;
  let sawTerminator = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) { sawTerminator = true; break; }
    const claimedChecksum = parseOctal(header.subarray(148, 156));
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (checksum !== claimedChecksum) fail("PACKAGE_ARCHIVE_CHECKSUM_INVALID");
    const size = parseOctal(header.subarray(124, 136));
    const start = offset + 512;
    const end = start + size;
    if (size < 0 || end > tar.length) fail("PACKAGE_ARCHIVE_TRUNCATED");
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]!);
    if (type === "x") {
      nextPath = parsePaxPath(tar.subarray(start, end)) ?? nextPath;
    } else if (type === "0") {
      const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
      const rawPrefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
      const name = nextPath ?? [rawPrefix, rawName].filter(Boolean).join("/");
      nextPath = null;
      if (!name || name.startsWith("/") || name.split("/").some(part => part === ".." || part === "")) fail("PACKAGE_ARCHIVE_PATH_INVALID");
      entries.push({ path: name, kind: "file", bytes: Buffer.from(tar.subarray(start, end)) });
      if (entries.length > 100) fail("PACKAGE_ARCHIVE_ENTRY_LIMIT_EXCEEDED");
    } else {
      return fail("PACKAGE_ARCHIVE_ENTRY_UNSUPPORTED");
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  if (!sawTerminator || nextPath !== null || entries.length === 0) fail("PACKAGE_ARCHIVE_TERMINATOR_MISSING");
  return entries;
}

export function verifyProjectWikiPackageArchive(bytes: Uint8Array): { archiveSha256: string; packageDigest: string; inventory: readonly string[] } {
  if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024) fail("PACKAGE_ARCHIVE_SIZE_INVALID");
  const archiveSha256 = sha256(bytes);
  if (archiveSha256 !== PROJECT_WIKI_CANDIDATE.archiveSha256) fail("PACKAGE_ARCHIVE_DIGEST_MISMATCH");
  const entries = parseTarGzip(bytes);
  const manifest = entries.find(entry => entry.path === "app.manifest.yaml");
  if (!manifest) fail("PACKAGE_MANIFEST_MISSING");
  const report = validateSpaasPackage({
    manifest: manifest.bytes,
    entries,
    support: {
      supportedApiVersions: ["spaas.smartaihub.app/v1"],
      supportedSchemaVersions: ["1.0"],
      supportedRequiredFeatures: [],
      supportedOptionalFeatures: [],
      extensions: [],
    },
    profile: "offline-package",
  });
  if (report.status === "invalid" || !report.digest || report.manifestIdentity !== PROJECT_WIKI_CANDIDATE.appId ||
      report.manifestVersion !== PROJECT_WIKI_CANDIDATE.appVersion || report.digest.value !== PROJECT_WIKI_CANDIDATE.packageDigest) {
    fail("PACKAGE_CONTENT_DIGEST_MISMATCH");
  }
  return { archiveSha256, packageDigest: report.digest.value, inventory: entries.map(entry => entry.path).sort() };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertApprovedProjectWikiStagingEnvelope(input: {
  approval: ProjectWikiApprovalEvidence | null;
  identity: ProjectWikiCandidateIdentity;
  now?: Date;
}): ProjectWikiStagingEnvelope {
  const approval = input.approval;
  if (!approval) fail("STAGING_APPROVAL_NOT_FOUND");
  if (approval.requestType !== "deployment" || approval.status !== "approved" || approval.revokedAt !== null ||
      approval.currentApprovals < approval.requiredApprovers || !Number.isInteger(approval.requiredApprovers) || approval.requiredApprovers < 1) {
    fail("STAGING_APPROVAL_NOT_APPROVED");
  }
  if (approval.tenantId !== input.identity.tenantId || approval.projectId !== input.identity.projectId) fail("STAGING_APPROVAL_SCOPE_MISMATCH");
  const expiresAt = approval.expiresAt ? Date.parse(approval.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) fail("STAGING_APPROVAL_EXPIRED");
  const parsed = projectWikiStagingEnvelopeSchema.safeParse(approval.payload);
  if (!parsed.success) fail("STAGING_APPROVAL_ENVELOPE_INVALID");
  if (canonicalJson(parsed.data.identity) !== canonicalJson(input.identity)) fail("STAGING_APPROVAL_SCOPE_MISMATCH");
  if (parsed.data.database.migrationPlan.some((item, index) => item.tag !== PROJECT_WIKI_MIGRATION_PLAN[index]?.tag || item.sha256 !== PROJECT_WIKI_MIGRATION_PLAN[index]?.sha256)) fail("STAGING_MIGRATION_PLAN_INVALID");
  const envelopeExpiry = Date.parse(parsed.data.execution.expiresAt);
  if (envelopeExpiry <= (input.now ?? new Date()).getTime() || envelopeExpiry > expiresAt) fail("STAGING_APPROVAL_EXPIRED");
  return parsed.data;
}

export async function registerProjectWikiReleaseCandidate(input: {
  identity: ProjectWikiCandidateIdentity;
  approvalRef: string;
  archiveBytes: Uint8Array;
  actorUserId: number;
  now?: Date;
}, deps: {
  repository: ProjectWikiCandidateRepository;
  storage: ProjectWikiCandidateStore;
  resolveApproval(ref: string): Promise<ProjectWikiApprovalEvidence | null>;
  createId(): string;
}) {
  if (input.identity.appId !== PROJECT_WIKI_CANDIDATE.appId) fail("PROJECT_WIKI_APP_ID_INVALID");
  const verified = verifyProjectWikiPackageArchive(input.archiveBytes);
  if (!await deps.repository.isActiveBinding(input.identity)) fail("PROJECT_WIKI_BINDING_NOT_ACTIVE");
  const approval = await deps.resolveApproval(input.approvalRef);
  if (approval?.id !== input.approvalRef) fail("STAGING_APPROVAL_REFERENCE_MISMATCH");
  assertApprovedProjectWikiStagingEnvelope({ approval, identity: input.identity, now: input.now });
  const objectKey = `mini-app-candidates/${input.identity.tenantId}/${input.identity.projectId}/${verified.packageDigest.slice("spaas-package-v1:sha256:".length)}/${verified.archiveSha256}.tar.gz`;
  const stored = await deps.storage.putIfAbsent(objectKey, input.archiveBytes, "application/gzip");
  if (stored.key !== objectKey) fail("CANDIDATE_STORAGE_KEY_MISMATCH");
  const readback = await deps.storage.readBuffer(objectKey);
  if (!readback || sha256(readback) !== verified.archiveSha256 || !Buffer.from(readback).equals(Buffer.from(input.archiveBytes))) fail("CANDIDATE_STORAGE_READBACK_MISMATCH");
  const approvalPayloadSha256 = sha256(Buffer.from(canonicalJson(approval.payload), "utf8"));
  const candidate: ProjectWikiCandidateRecord = {
    id: deps.createId(),
    ...input.identity,
    sourceRevision: PROJECT_WIKI_CANDIDATE.sourceRevision,
    packageDigest: verified.packageDigest,
    archiveSha256: verified.archiveSha256,
    objectKey,
    approvalRef: approval.id,
    approvalPayloadSha256,
    qualificationStatus: "CANDIDATE_NOT_RELEASED",
    validationStatus: "needs_context",
    provenance: { sourceRevision: PROJECT_WIKI_CANDIDATE.sourceRevision, verificationProfile: "offline-package", verifiedArchiveSha256: verified.archiveSha256, inventory: [...verified.inventory] },
    createdBy: input.actorUserId,
  };
  const existing = await deps.repository.getByIdentity({ ...input.identity, packageDigest: verified.packageDigest });
  if (existing) {
    if (existing.archiveSha256 !== candidate.archiveSha256 || existing.objectKey !== candidate.objectKey || existing.approvalRef !== candidate.approvalRef ||
        existing.approvalPayloadSha256 !== candidate.approvalPayloadSha256) fail("CANDIDATE_IDENTITY_CONFLICT");
    return { candidate: existing, created: false, storageCreated: stored.created, inventory: verified.inventory };
  }
  const created = await deps.repository.insert(candidate);
  if (created.archiveSha256 !== verified.archiveSha256 || created.packageDigest !== verified.packageDigest || created.objectKey !== objectKey) fail("CANDIDATE_PERSISTENCE_MISMATCH");
  return { candidate: created, created: true, storageCreated: stored.created, inventory: verified.inventory };
}

export async function readProjectWikiReleaseCandidate(identity: ProjectWikiCandidateIdentity, repository: ProjectWikiCandidateRepository, storage: ProjectWikiCandidateStore) {
  const candidate = await repository.getByIdentity({ ...identity, packageDigest: PROJECT_WIKI_CANDIDATE.packageDigest });
  if (!candidate) return null;
  if (!await repository.isActiveBinding(identity)) fail("PROJECT_WIKI_BINDING_NOT_ACTIVE");
  const bytes = await storage.readBuffer(candidate.objectKey);
  if (!bytes) fail("CANDIDATE_STORAGE_READBACK_MISSING");
  const verified = verifyProjectWikiPackageArchive(bytes);
  if (candidate.sourceRevision !== PROJECT_WIKI_CANDIDATE.sourceRevision || candidate.archiveSha256 !== verified.archiveSha256 ||
      candidate.packageDigest !== verified.packageDigest || candidate.qualificationStatus !== "CANDIDATE_NOT_RELEASED" ||
      candidate.validationStatus !== "needs_context") fail("CANDIDATE_METADATA_CONTENT_MISMATCH");
  return { candidate, inventory: verified.inventory, storedBytesSha256: verified.archiveSha256 };
}

export function createDrizzleProjectWikiCandidateRepository(db: DrizzleDB): ProjectWikiCandidateRepository {
  return {
    async isActiveBinding(identity) {
      const [row] = await db.select({ projectId: canonicalProjects.projectId })
        .from(canonicalProjects)
        .innerJoin(canonicalProjectAppBindings, and(
          eq(canonicalProjectAppBindings.tenantId, canonicalProjects.tenantId),
          eq(canonicalProjectAppBindings.projectId, canonicalProjects.projectId),
        ))
        .innerJoin(appIdentities, and(
          eq(appIdentities.tenantId, canonicalProjectAppBindings.tenantId),
          eq(appIdentities.appId, canonicalProjectAppBindings.appId),
        ))
        .where(and(
          eq(canonicalProjects.tenantId, identity.tenantId),
          eq(canonicalProjects.projectId, identity.projectId),
          eq(canonicalProjects.lifecycle, "ACTIVE"),
          eq(canonicalProjectAppBindings.appId, PROJECT_WIKI_CANDIDATE.appId),
          eq(canonicalProjectAppBindings.lifecycle, "ACTIVE"),
          eq(appIdentities.lifecycle, "active"),
        )).limit(1);
      return Boolean(row);
    },
    async getByIdentity(identity) {
      const [row] = await db.select().from(projectWikiPackageCandidates).where(and(
        eq(projectWikiPackageCandidates.tenantId, identity.tenantId),
        eq(projectWikiPackageCandidates.projectId, identity.projectId),
        eq(projectWikiPackageCandidates.appId, identity.appId),
        eq(projectWikiPackageCandidates.packageDigest, identity.packageDigest),
      )).limit(1);
      return (row as ProjectWikiCandidateRecord | undefined) ?? null;
    },
    async insert(record) {
      const [inserted] = await db.insert(projectWikiPackageCandidates).values({
        id: record.id,
        tenantId: record.tenantId,
        projectId: record.projectId,
        appId: record.appId,
        sourceRevision: record.sourceRevision,
        packageDigest: record.packageDigest,
        archiveSha256: record.archiveSha256,
        objectKey: record.objectKey,
        approvalRef: record.approvalRef,
        approvalPayloadSha256: record.approvalPayloadSha256,
        qualificationStatus: record.qualificationStatus,
        validationStatus: record.validationStatus,
        provenance: record.provenance,
        createdBy: record.createdBy,
      }).onConflictDoNothing({
        target: [projectWikiPackageCandidates.tenantId, projectWikiPackageCandidates.projectId,
          projectWikiPackageCandidates.appId, projectWikiPackageCandidates.packageDigest],
      }).returning();
      if (inserted) return inserted as ProjectWikiCandidateRecord;
      const existing = await this.getByIdentity({
        tenantId: record.tenantId,
        projectId: record.projectId,
        appId: record.appId,
        packageDigest: record.packageDigest,
      });
      if (!existing) fail("CANDIDATE_CONCURRENT_INSERT_UNRESOLVED");
      return existing;
    },
  };
}

export const projectWikiCandidateStorage: ProjectWikiCandidateStore = {
  putIfAbsent: storagePutIfAbsent,
  readBuffer: storageReadBuffer,
};

export function createProjectWikiCandidateRegistry(db: DrizzleDB) {
  return async (input: Omit<Parameters<typeof registerProjectWikiReleaseCandidate>[0], "now">, resolveApproval: (ref: string) => Promise<ProjectWikiApprovalEvidence | null>) =>
    registerProjectWikiReleaseCandidate(input, {
      repository: createDrizzleProjectWikiCandidateRepository(db),
      storage: projectWikiCandidateStorage,
      resolveApproval,
      createId: randomUUID,
    });
}
