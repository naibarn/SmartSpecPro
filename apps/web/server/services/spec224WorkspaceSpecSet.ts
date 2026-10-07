import { createHash } from "node:crypto";
import yauzl from "yauzl";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";

import {
  conversations,
  runnerNodes,
  spec224ConversationWorkspaces,
  spec224WorkspaceSpecSetRevisions,
  spec224WorkspaceSpecSetHeads,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { compileSpec224IncrementalSpecSet } from "./spec224IncrementalSpecCompiler";
import { SPEC224_RUNNER_INPUT_MAX_BYTES } from "./spec224RunnerInputStaging";
import { isRunnerWorkspaceConvergenceState } from "./runnerContracts";

const MAX_ARTIFACTS = 64;
const MAX_RAW_BYTES = 2 * 1024 * 1024;
export const SPEC224_MAX_RAW_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 4 * 1024 * 1024;
// Leave room for PostgreSQL JSONB's canonical separators and formatting,
// which can be slightly larger than JSON.stringify's compact representation.
const MAX_PERSISTED_MANIFEST_BYTES = 4 * 1024 * 1024 - 16 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PATH_LENGTH = 240;
const VALID_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:md|json)$/i;

export class Spec224WorkspaceSpecSetError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec224WorkspaceSpecSetError";
  }
}

export type Spec224WorkspaceArtifactInput = { path: string; contentBase64: string };
export type Spec224WorkspaceSpecFile = { path: string; digest: string; content: string };
export type Spec224TrustedWorkspace = { runnerId: string; displayName: string; status: string; snapshotRevision: string; workspaceId: string; gitHead: string | null; gitBranch: string | null; dirty: boolean | null; contentFingerprint: string | null };
export type Spec224ConversationWorkspace = {
  conversationId: number; tenantId: string; actorId: number; runnerId: string; workspaceId: string;
  snapshotRevision: string; revision: number;
};
export type Spec224WorkspaceSpecSetRevision = {
  id: string; tenantId: string; actorId: number; runnerId: string; workspaceId: string;
  revision: number; parentRevision: number | null; digest: string; requestDigest: string; idempotencyKey: string; files: Spec224WorkspaceSpecFile[]; replacedPaths: string[];
  requirementCount: number; runnableWorkPackageCount: number; blockedWorkPackageCount: number;
};
export type Spec224WorkspaceBindingAvailability = "current" | "stale" | "revoked" | "forbidden";

export interface Spec224WorkspaceSpecSetStore {
  listTrustedWorkspaces(input: { tenantId: string; actorId: number }): Promise<Spec224TrustedWorkspace[]>;
  getConversation(input: { tenantId: string; actorId: number; conversationId: number }): Promise<{ conversationId: number; tenantId: string; actorId: number } | null>;
  upsertBinding(input: Omit<Spec224ConversationWorkspace, "revision">): Promise<Spec224ConversationWorkspace>;
  getBinding(input: { tenantId: string; actorId: number; conversationId: number }): Promise<Spec224ConversationWorkspace | null>;
  getBindingAvailability(binding: Spec224ConversationWorkspace): Promise<Spec224WorkspaceBindingAvailability>;
  getRevisionByIdempotency(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string; idempotencyKey: string }): Promise<Spec224WorkspaceSpecSetRevision | null>;
  createRevision(input: Omit<Spec224WorkspaceSpecSetRevision, "id">): Promise<Spec224WorkspaceSpecSetRevision>;
  getLatestRevision(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string }): Promise<Spec224WorkspaceSpecSetRevision | null>;
  getRevision(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string; revision: number }): Promise<Spec224WorkspaceSpecSetRevision | null>;
}

function fail(code: string): never { throw new Spec224WorkspaceSpecSetError(code); }
function sha(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function validatePath(value: string): string {
  const path = value.trim();
  if (!path || path.length > MAX_PATH_LENGTH || path.startsWith("/") || path.includes("\\") || path.includes("\0") || !VALID_PATH.test(path)) fail("SPEC_SET_PATH_INVALID");
  return path;
}
function decodeBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail("SPEC_SET_BASE64_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_RAW_BYTES) fail("SPEC_SET_RAW_SIZE_INVALID");
  return bytes;
}
function decodeUtf8(bytes: Buffer): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (Buffer.byteLength(text, "utf8") !== bytes.length) fail("SPEC_SET_UTF8_INVALID");
  return text;
}
function normalizeFile(path: string, bytes: Buffer): Spec224WorkspaceSpecFile {
  if (bytes.length > MAX_FILE_BYTES) fail("SPEC_SET_FILE_OVERSIZED");
  const content = decodeUtf8(bytes);
  if (path.toLowerCase().endsWith(".json")) {
    try { JSON.parse(content); } catch { fail("SPEC_SET_JSON_INVALID"); }
  }
  return { path, digest: sha(bytes), content };
}

/** Selects only the Runner's opaque, sanitized workspace identity/display facts. */
export function workspaceFactsFromSnapshot(snapshot: unknown): Array<{ workspaceId: string; projectId: string | null; repositoryId: string | null; displayName: string | null; gitHead: string | null; gitBranch: string | null; dirty: boolean | null; contentFingerprint: string | null; taskId: string | null; convergenceState: string; convergenceCanonicalSha: string | null }> {
  if (!snapshot || typeof snapshot !== "object") return [];
  const source = snapshot as { workspaceIds?: unknown; workspaces?: unknown };
  const facts = new Map<string, { projectId: string | null; repositoryId: string | null; displayName: string | null; gitHead: string | null; gitBranch: string | null; dirty: boolean | null; contentFingerprint: string | null; taskId: string | null; convergenceState: string; convergenceCanonicalSha: string | null }>();
  if (Array.isArray(source.workspaces)) {
    for (const candidate of source.workspaces) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as { workspaceId?: unknown; projectId?: unknown; repositoryId?: unknown; displayName?: unknown; gitHead?: unknown; gitBranch?: unknown; dirty?: unknown; contentFingerprint?: unknown; taskId?: unknown; convergenceState?: unknown; convergenceCanonicalSha?: unknown };
      if (typeof record.workspaceId !== "string" || !record.workspaceId.trim() || record.workspaceId.length > 200) continue;
      const displayName = typeof record.displayName === "string" && record.displayName.trim() ? record.displayName.trim() : null;
      const gitHead = typeof record.gitHead === "string" && /^[a-f0-9]{40,64}$/.test(record.gitHead) ? record.gitHead : null;
      const gitBranch = typeof record.gitBranch === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(record.gitBranch) && !record.gitBranch.includes("..") && !record.gitBranch.includes("//") ? record.gitBranch : null;
      const dirty = typeof record.dirty === "boolean" ? record.dirty : null;
      const contentFingerprint = typeof record.contentFingerprint === "string" && /^[a-f0-9]{64}$/.test(record.contentFingerprint) ? record.contentFingerprint : null;
      const taskId = typeof record.taskId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(record.taskId) ? record.taskId : null;
      const convergenceCanonicalSha = typeof record.convergenceCanonicalSha === "string" && /^[a-f0-9]{40,64}$/.test(record.convergenceCanonicalSha) ? record.convergenceCanonicalSha : null;
      const candidateConvergenceState = isRunnerWorkspaceConvergenceState(record.convergenceState) ? record.convergenceState : "NOT_REPORTED";
      const convergenceState = candidateConvergenceState === "USER_WORKSPACE_CONVERGED" && !convergenceCanonicalSha ? "NOT_REPORTED" : candidateConvergenceState;
      const current = facts.get(record.workspaceId);
      const safeIdentity = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value.trim()) && !value.includes("://") && !value.includes("@") && !value.includes("//") && !value.includes("..") ? value.trim() : null;
      const projectId = safeIdentity(record.projectId);
      const repositoryId = safeIdentity(record.repositoryId);
      if (!current || (current.displayName === null && displayName)) facts.set(record.workspaceId, { projectId, repositoryId, displayName, gitHead, gitBranch, dirty, contentFingerprint, taskId, convergenceState, convergenceCanonicalSha });
    }
  }
  if (Array.isArray(source.workspaceIds)) {
    for (const workspaceId of source.workspaceIds) {
      if (typeof workspaceId === "string" && workspaceId.trim() && workspaceId.length <= 200 && !facts.has(workspaceId)) facts.set(workspaceId, { projectId: null, repositoryId: null, displayName: null, gitHead: null, gitBranch: null, dirty: null, contentFingerprint: null, taskId: null, convergenceState: "NOT_REPORTED", convergenceCanonicalSha: null });
    }
  }
  return [...facts.entries()].map(([workspaceId, facts]) => ({ workspaceId, ...facts })).sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
}
async function unpackZip(bytes: Buffer, remainingBytes: number): Promise<Array<{ path: string; bytes: Buffer }>> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(bytes, { autoClose: false, decodeStrings: true, lazyEntries: true, strictFileNames: true, validateEntrySizes: false });
  } catch { fail("SPEC_SET_ZIP_INVALID"); }
  if (!zip.entryCount || zip.entryCount > MAX_ARTIFACTS) fail("SPEC_SET_ZIP_ENTRY_COUNT_INVALID");
  let expanded = 0;
  const files: Array<{ path: string; bytes: Buffer }> = [];
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName.endsWith("/")) continue;
      if (entry.isEncrypted()) fail("SPEC_SET_ZIP_ENCRYPTED");
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) fail("SPEC_SET_ZIP_COMPRESSION_UNSUPPORTED");
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000) fail("SPEC_SET_ZIP_SYMLINK");
      const path = validatePath(entry.fileName);
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        fileBytes += buffer.length;
        expanded += buffer.length;
        if (fileBytes > MAX_FILE_BYTES) { stream.destroy(); fail("SPEC_SET_FILE_OVERSIZED"); }
        if (expanded > remainingBytes) { stream.destroy(); fail("SPEC_SET_EXPANSION_LIMIT"); }
        chunks.push(buffer);
      }
      files.push({ path, bytes: Buffer.concat(chunks, fileBytes) });
    }
  } catch (error) {
    if (error instanceof Spec224WorkspaceSpecSetError) throw error;
    fail("SPEC_SET_ZIP_INVALID");
  } finally { zip.close(); }
  if (!files.length) fail("SPEC_SET_ZIP_ENTRY_COUNT_INVALID");
  return files;
}

/** Parses untrusted uploads only as bounded data; no text can grant execution capability. */
export async function parseSpec224WorkspaceArtifacts(artifacts: Spec224WorkspaceArtifactInput[]): Promise<{ files: Spec224WorkspaceSpecFile[]; digest: string }> {
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length > MAX_ARTIFACTS) fail("SPEC_SET_ARTIFACT_COUNT_INVALID");
  const expanded: Array<{ path: string; bytes: Buffer }> = [];
  let rawBytes = 0;
  let expandedBytes = 0;
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact.path !== "string" || typeof artifact.contentBase64 !== "string") fail("SPEC_SET_ARTIFACT_INVALID");
    const raw = decodeBase64(artifact.contentBase64);
    rawBytes += raw.length;
    if (rawBytes > SPEC224_MAX_RAW_REQUEST_BYTES) fail("SPEC_SET_RAW_AGGREGATE_LIMIT");
    if (artifact.path.trim().toLowerCase().endsWith(".zip")) {
      const files = await unpackZip(raw, MAX_EXPANDED_BYTES - expandedBytes);
      expandedBytes += files.reduce((total, file) => total + file.bytes.length, 0);
      expanded.push(...files);
    } else {
      expandedBytes += raw.length;
      if (expandedBytes > MAX_EXPANDED_BYTES) fail("SPEC_SET_EXPANSION_LIMIT");
      expanded.push({ path: validatePath(artifact.path), bytes: raw });
    }
  }
  if (!expanded.length || expanded.length > MAX_ARTIFACTS) fail("SPEC_SET_ARTIFACT_COUNT_INVALID");
  let bytes = 0;
  const seen = new Set<string>();
  const files = expanded.map(({ path, bytes: content }) => {
    const folded = path.toLocaleLowerCase("en-US");
    if (seen.has(folded)) fail("SPEC_SET_PATH_DUPLICATE");
    seen.add(folded);
    bytes += content.length;
    if (bytes > MAX_EXPANDED_BYTES) fail("SPEC_SET_EXPANSION_LIMIT");
    return normalizeFile(path, content);
  }).sort((a, b) => a.path.localeCompare(b.path));
  return { files, digest: sha(canonicalJson(files.map(file => ({ path: file.path, digest: file.digest })))) };
}

export function canActorUseRunner(ownerUserId: number | null, actorId: number): boolean {
  return ownerUserId === null || ownerUserId === actorId;
}

export function createSpec224WorkspaceSpecSetService(store: Spec224WorkspaceSpecSetStore) {
  async function requireConversation(input: { tenantId: string; actorId: number; conversationId: number }) {
    if (!Number.isSafeInteger(input.conversationId) || input.conversationId < 1) fail("CONVERSATION_ID_INVALID");
    if (!(await store.getConversation(input))) fail("CONVERSATION_SCOPE_FORBIDDEN");
  }
  async function requirePersistedBinding(input: { tenantId: string; actorId: number; conversationId: number }) {
    await requireConversation(input);
    const binding = await store.getBinding(input);
    if (!binding) fail("WORKSPACE_BINDING_REQUIRED");
    const availability = await store.getBindingAvailability(binding);
    if (availability === "forbidden") fail("WORKSPACE_BINDING_FORBIDDEN");
    if (availability === "revoked") fail("WORKSPACE_BINDING_REVOKED");
    return { binding, availability };
  }
  async function requireCurrentBinding(input: { tenantId: string; actorId: number; conversationId: number }) {
    const persisted = await requirePersistedBinding(input);
    if (persisted.availability !== "current") fail("WORKSPACE_BINDING_STALE");
    return persisted;
  }
  return {
    availableWorkspaces: (input: { tenantId: string; actorId: number }) => store.listTrustedWorkspaces(input),
    async bindConversationWorkspace(input: { tenantId: string; actorId: number; conversationId: number; runnerId: string; workspaceId: string }) {
      await requireConversation(input);
      const workspace = (await store.listTrustedWorkspaces(input)).find(candidate => candidate.runnerId === input.runnerId && candidate.workspaceId === input.workspaceId);
      if (!workspace) fail("WORKSPACE_NOT_TRUSTED_OR_CURRENT");
      const binding = await store.upsertBinding({
        conversationId: input.conversationId, tenantId: input.tenantId, actorId: input.actorId, runnerId: workspace.runnerId, workspaceId: workspace.workspaceId,
        snapshotRevision: workspace.snapshotRevision,
      });
      return { conversationId: binding.conversationId, runnerId: binding.runnerId, workspaceId: binding.workspaceId, revision: binding.revision };
    },
    async getConversationWorkspace(input: { tenantId: string; actorId: number; conversationId: number }) {
      await requireConversation(input);
      const existing = await store.getBinding(input);
      if (!existing) return null;
      const { binding, availability } = await requirePersistedBinding(input);
      const latest = await store.getLatestRevision(binding);
      return { workspace: binding, availability: { status: availability, available: availability === "current" }, specSet: latest ? summary(latest) : null };
    },
    async ingestSpecSet(input: { tenantId: string; actorId: number; conversationId: number; artifacts: Spec224WorkspaceArtifactInput[]; idempotencyKey: string }) {
      if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 160) fail("SPEC_SET_IDEMPOTENCY_KEY_INVALID");
      const { binding } = await requirePersistedBinding(input);
      const parsed = await parseSpec224WorkspaceArtifacts(input.artifacts);
      const existing = await store.getRevisionByIdempotency({ ...binding, idempotencyKey: input.idempotencyKey });
      if (existing) {
        if (existing.requestDigest !== parsed.digest) fail("SPEC_SET_IDEMPOTENCY_CONFLICT");
        return summary(existing);
      }
      const previous = await store.getLatestRevision(binding);
      const merged = new Map(previous?.files.map(file => [file.path, file]) ?? []);
      const replacedPaths = parsed.files.filter(file => merged.has(file.path)).map(file => file.path);
      for (const file of parsed.files) merged.set(file.path, file);
      const files = [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
      if (Buffer.byteLength(JSON.stringify(files), "utf8") > MAX_PERSISTED_MANIFEST_BYTES) fail("SPEC_SET_MANIFEST_OVERSIZED");
      const digest = sha(canonicalJson(files.map(file => ({ path: file.path, digest: file.digest }))));
      const provisional: Spec224WorkspaceSpecSetRevision = {
        id: "pending", tenantId: input.tenantId, actorId: input.actorId, runnerId: binding.runnerId, workspaceId: binding.workspaceId,
        revision: (previous?.revision ?? 0) + 1, parentRevision: previous?.revision ?? null, digest, requestDigest: parsed.digest, idempotencyKey: input.idempotencyKey, files, replacedPaths,
        requirementCount: 0, runnableWorkPackageCount: 0, blockedWorkPackageCount: 0,
      };
      const previousInput = previous ? { ...previous, previousRevision: undefined } : undefined;
      const compiled = compileSpec224IncrementalSpecSet({
        runnerId: provisional.runnerId,
        workspaceId: provisional.workspaceId,
        revision: provisional.revision,
        digest: provisional.digest,
        files: provisional.files,
        ...(previousInput ? { previousRevision: previousInput } : {}),
      });
      provisional.requirementCount = compiled.requirements.length;
      provisional.runnableWorkPackageCount = compiled.runnableWorkPackageIds.length;
      provisional.blockedWorkPackageCount = compiled.workPackages.filter(item => item.readiness === "BLOCKED").length;
      try {
        return summary(await store.createRevision(provisional));
      } catch (error) {
        const code = error instanceof Spec224WorkspaceSpecSetError ? error.code : (error as { code?: unknown })?.code;
        if (code !== "SPEC_SET_REVISION_STALE" && code !== "23505") throw error;
        const replay = await store.getRevisionByIdempotency({ ...binding, idempotencyKey: input.idempotencyKey });
        if (replay?.requestDigest === parsed.digest) return summary(replay);
        fail("SPEC_SET_IDEMPOTENCY_CONFLICT");
      }
    },
    async prepareWorkspaceRun(input: { tenantId: string; actorId: number; conversationId: number; mode: "prompt" | "spec_set"; prompt?: string; specSetRevision?: number }) {
      const { binding } = await requireCurrentBinding(input);
      if (input.mode === "prompt") {
        const prompt = input.prompt?.trim();
        if (!prompt || prompt.length > 4_000) fail("PREPARE_PROMPT_INVALID");
        const current = (await store.listTrustedWorkspaces(input)).find(item => item.runnerId === binding.runnerId && item.workspaceId === binding.workspaceId);
        const blockers = current?.gitHead && current.contentFingerprint ? [] : ["WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE"];
        const contextPackHash = sha(canonicalJson({ conversationId: input.conversationId, workspaceId: binding.workspaceId, mode: input.mode, gitHead: current?.gitHead ?? null, snapshotRevision: current?.snapshotRevision ?? null, prompt }));
        const workPackages = [{ id: "prompt", externalId: "prompt", readiness: blockers.length ? "BLOCKED" as const : "READY" as const, blockers }];
        return { workspace: binding, planId: `plan:${contextPackHash.slice(0, 40)}`, planRevision: binding.revision, contextPackHash, workPackages, requirementCount: 0, runnableWorkPackageIds: blockers.length ? [] : ["prompt"], blockers };
      }
      const revision = input.specSetRevision ? await store.getRevision({ ...binding, revision: input.specSetRevision }) : await store.getLatestRevision(binding);
      if (!revision || revision.runnerId !== binding.runnerId || revision.workspaceId !== binding.workspaceId) fail("SPEC_SET_REVISION_NOT_FOUND");
      const previousRevision = revision.revision > 1
        ? await store.getRevision({ ...binding, revision: revision.revision - 1 })
        : null;
      const compiled = compileSpec224IncrementalSpecSet({
        runnerId: revision.runnerId,
        workspaceId: revision.workspaceId,
        revision: revision.revision,
        digest: revision.digest,
        files: revision.files,
        ...(previousRevision ? { previousRevision: {
          runnerId: previousRevision.runnerId,
          workspaceId: previousRevision.workspaceId,
          revision: previousRevision.revision,
          digest: previousRevision.digest,
          files: previousRevision.files,
        } } : {}),
      });
      const blockers = compiled.runnableWorkPackageIds.length
        ? []
        : revision.requirementCount > 0 ? ["NO_RUNNABLE_WORK_PACKAGES"] : ["REQUIREMENTS_REQUIRED"];
      const current = (await store.listTrustedWorkspaces(input)).find(item => item.runnerId === binding.runnerId && item.workspaceId === binding.workspaceId);
      if (!current?.gitHead || !current.contentFingerprint) blockers.push("WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE");
      const contextPackHash = sha(canonicalJson({ workspaceId: binding.workspaceId, runnerId: binding.runnerId, revision: revision.revision, digest: revision.digest }));
      return { workspace: binding, planId: `plan:${contextPackHash.slice(0, 40)}`, planRevision: revision.revision, contextPackHash, workPackages: compiled.workPackages, requirements: compiled.requirements, runnableWorkPackageIds: compiled.runnableWorkPackageIds, findings: compiled.findings, impact: compiled.impact, requirementCount: compiled.requirements.length, blockers };
    },
    async resolveWorkspaceRunInput(input: {
      tenantId: string;
      actorId: number;
      conversationId: number;
      mode: "prompt" | "spec_set";
      prompt?: string;
      specSetRevision?: number;
      workPackageId?: string;
    }) {
      const { binding } = await requireCurrentBinding(input);
      const workspace = (await store.listTrustedWorkspaces(input)).find(candidate =>
        candidate.runnerId === binding.runnerId && candidate.workspaceId === binding.workspaceId
      );
      if (!workspace?.gitHead || !workspace.contentFingerprint) fail("WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE");

      if (input.mode === "prompt") {
        const prompt = input.prompt?.trim();
        if (!prompt || prompt.length > 4_000) fail("PREPARE_PROMPT_INVALID");
        const contextPackHash = sha(canonicalJson({
          conversationId: input.conversationId,
          workspaceId: binding.workspaceId,
          gitHead: workspace.gitHead,
          snapshotRevision: workspace.snapshotRevision,
          prompt,
        }));
        return {
          workspace: binding,
          runner: { runnerId: workspace.runnerId, snapshotRevision: workspace.snapshotRevision, gitHead: workspace.gitHead, gitBranch: workspace.gitBranch, dirty: workspace.dirty, contentFingerprint: workspace.contentFingerprint },
          goal: `Implement the requested change from the staged prompt.md in this existing workspace. Keep changes scoped to the request and preserve unrelated workspace content.`,
          planId: `plan:${contextPackHash.slice(0, 40)}`,
          planRevision: binding.revision,
          contextPackHash,
          repositoryRef: `runner:${workspace.runnerId}/${workspace.workspaceId}`,
          baseRevision: `git:${workspace.gitHead}`,
          specSetRevision: null,
          workPackageId: null,
          workPackageExternalId: null,
          allowedWriteSet: ["**"],
          inputFiles: [{ path: "prompt.md", contentBase64: Buffer.from(prompt, "utf8").toString("base64") }],
        };
      }

      const revision = input.specSetRevision
        ? await store.getRevision({ ...binding, revision: input.specSetRevision })
        : await store.getLatestRevision(binding);
      if (!revision || revision.runnerId !== binding.runnerId || revision.workspaceId !== binding.workspaceId)
        fail("SPEC_SET_REVISION_NOT_FOUND");
      const previous = revision.revision > 1
        ? await store.getRevision({ ...binding, revision: revision.revision - 1 })
        : null;
      const compiled = compileSpec224IncrementalSpecSet({
        runnerId: revision.runnerId,
        workspaceId: revision.workspaceId,
        revision: revision.revision,
        digest: revision.digest,
        files: revision.files,
        ...(previous ? { previousRevision: {
          runnerId: previous.runnerId,
          workspaceId: previous.workspaceId,
          revision: previous.revision,
          digest: previous.digest,
          files: previous.files,
        } } : {}),
      });
      const workPackage = compiled.workPackages.find(item => item.id === input.workPackageId);
      if (!workPackage || workPackage.readiness !== "READY" || !compiled.runnableWorkPackageIds.includes(workPackage.id))
        fail("SPEC_SET_WORK_PACKAGE_NOT_READY");
      const packageFiles = filesForWorkPackage(workPackage, compiled.workPackages, compiled.requirements, revision.files);
      const packageInputBytes = packageFiles.reduce((total, file) => total + Buffer.byteLength(file.content, "utf8"), 0);
      // Leave bounded room for the server-generated run-context artifact.
      if (packageInputBytes > SPEC224_RUNNER_INPUT_MAX_BYTES - 4_096)
        fail("SPEC_SET_WORK_PACKAGE_INPUT_OVERSIZED");
      const goal = `Implement work package ${workPackage.externalId} from Spec Set revision ${revision.revision}. Follow its declared acceptance criteria and verification obligations. Stay within its declared write set and preserve other workspace changes.`;
      const contextPackHash = sha(canonicalJson({
        workspaceId: binding.workspaceId,
        runnerId: binding.runnerId,
        gitHead: workspace.gitHead,
        snapshotRevision: workspace.snapshotRevision,
        revision: revision.revision,
        digest: revision.digest,
        workPackageId: workPackage.id,
      }));
      return {
        workspace: binding,
        runner: { runnerId: workspace.runnerId, snapshotRevision: workspace.snapshotRevision, gitHead: workspace.gitHead, gitBranch: workspace.gitBranch, dirty: workspace.dirty, contentFingerprint: workspace.contentFingerprint },
        goal,
        planId: `plan:${contextPackHash.slice(0, 40)}`,
        planRevision: revision.revision,
        contextPackHash,
        repositoryRef: `runner:${workspace.runnerId}/${workspace.workspaceId}`,
        baseRevision: `git:${workspace.gitHead}`,
        specSetRevision: revision.revision,
        workPackageId: workPackage.id,
        workPackageExternalId: workPackage.externalId,
        allowedWriteSet: [...workPackage.allowedWriteSet],
        inputFiles: packageFiles.map(file => ({ path: file.path, contentBase64: Buffer.from(file.content, "utf8").toString("base64") })),
      };
    },
  };
}

function filesForWorkPackage(
  root: { id: string; declarationPath: string; requirementIds: readonly string[]; dependsOn: readonly string[] },
  workPackages: readonly { id: string; declarationPath: string; requirementIds: readonly string[]; dependsOn: readonly string[] }[],
  requirements: readonly { id: string; artifactPath: string }[],
  files: readonly Spec224WorkspaceSpecFile[],
): Spec224WorkspaceSpecFile[] {
  const packages = new Map(workPackages.map(item => [item.id, item]));
  const requirementSources = new Map(requirements.map(item => [item.id, item.artifactPath]));
  const paths = new Set<string>();
  const seenPackages = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    if (seenPackages.has(current.id)) continue;
    seenPackages.add(current.id);
    paths.add(current.declarationPath);
    for (const requirementId of current.requirementIds) {
      const sourcePath = requirementSources.get(requirementId);
      if (!sourcePath) fail("SPEC_SET_WORK_PACKAGE_SOURCE_UNAVAILABLE");
      paths.add(sourcePath);
    }
    for (const dependencyId of current.dependsOn) {
      const dependency = packages.get(dependencyId);
      if (!dependency) fail("SPEC_SET_WORK_PACKAGE_SOURCE_UNAVAILABLE");
      pending.push(dependency);
    }
  }
  const byPath = new Map(files.map(file => [file.path, file]));
  return [...paths].sort().map(path => {
    const file = byPath.get(path);
    if (!file) fail("SPEC_SET_WORK_PACKAGE_SOURCE_UNAVAILABLE");
    return file;
  });
}

function summary(revision: Spec224WorkspaceSpecSetRevision) {
  return { revision: revision.revision, digest: revision.digest, files: revision.files.map(file => ({ path: file.path, digest: file.digest })), replacedPaths: revision.replacedPaths, requirementCount: revision.requirementCount, runnableWorkPackageCount: revision.runnableWorkPackageCount, blockedWorkPackageCount: revision.blockedWorkPackageCount };
}

class DrizzleSpec224WorkspaceSpecSetStore implements Spec224WorkspaceSpecSetStore {
  async listTrustedWorkspaces(input: { tenantId: string; actorId: number }): Promise<Spec224TrustedWorkspace[]> {
    const db = getDb();
    const rows = await db.select().from(runnerNodes).where(and(eq(runnerNodes.tenantId, input.tenantId), or(isNull(runnerNodes.ownerUserId), eq(runnerNodes.ownerUserId, input.actorId)), eq(runnerNodes.trustState, "trusted"), eq(runnerNodes.status, "online"), isNull(runnerNodes.revokedAt), gt(runnerNodes.snapshotExpiresAt, new Date())));
    return rows.flatMap(row => {
      const snapshot = row.currentSnapshotJson as { runnerId?: unknown; runnerSessionId?: unknown } | null;
      if (!row.currentSnapshotRevision || !snapshot || snapshot.runnerId !== row.runnerId || (row.activeSessionId && snapshot.runnerSessionId !== row.activeSessionId)) return [];
      return workspaceFactsFromSnapshot(snapshot).map(workspace => ({ runnerId: row.runnerId, displayName: workspace.displayName ?? row.displayName, status: row.status, snapshotRevision: row.currentSnapshotRevision!, workspaceId: workspace.workspaceId, gitHead: workspace.gitHead, gitBranch: workspace.gitBranch, dirty: workspace.dirty, contentFingerprint: workspace.contentFingerprint }));
    });
  }
  async getConversation(input: { tenantId: string; actorId: number; conversationId: number }) {
    const db = getDb(); const [row] = await db.select({ conversationId: conversations.id, tenantId: conversations.tenantId, actorId: conversations.userId }).from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.tenantId, input.tenantId), eq(conversations.userId, input.actorId))).limit(1);
    return row && row.tenantId ? { conversationId: row.conversationId, tenantId: row.tenantId, actorId: row.actorId } : null;
  }
  async upsertBinding(input: Omit<Spec224ConversationWorkspace, "revision">) {
    const db = getDb(); const [row] = await db.insert(spec224ConversationWorkspaces).values(input).onConflictDoUpdate({ target: spec224ConversationWorkspaces.conversationId, set: { tenantId: input.tenantId, actorId: input.actorId, runnerId: input.runnerId, workspaceId: input.workspaceId, snapshotRevision: input.snapshotRevision, revision: sql`${spec224ConversationWorkspaces.revision} + 1`, updatedAt: new Date() } }).returning();
    return bindingRow(row!);
  }
  async getBinding(input: { tenantId: string; actorId: number; conversationId: number }) { const db = getDb(); const [row] = await db.select().from(spec224ConversationWorkspaces).where(and(eq(spec224ConversationWorkspaces.tenantId, input.tenantId), eq(spec224ConversationWorkspaces.actorId, input.actorId), eq(spec224ConversationWorkspaces.conversationId, input.conversationId))).limit(1); return row ? bindingRow(row) : null; }
  async getBindingAvailability(binding: Spec224ConversationWorkspace): Promise<Spec224WorkspaceBindingAvailability> {
    const db = getDb();
    const [runner] = await db.select({ ownerUserId: runnerNodes.ownerUserId, trustState: runnerNodes.trustState, revokedAt: runnerNodes.revokedAt }).from(runnerNodes).where(and(eq(runnerNodes.runnerId, binding.runnerId), eq(runnerNodes.tenantId, binding.tenantId))).limit(1);
    if (!runner || !canActorUseRunner(runner.ownerUserId, binding.actorId)) return "forbidden";
    if (runner.revokedAt || runner.trustState !== "trusted") return "revoked";
    const current = await this.listTrustedWorkspaces({ tenantId: binding.tenantId, actorId: binding.actorId });
    return current.some(workspace => workspace.runnerId === binding.runnerId && workspace.workspaceId === binding.workspaceId) ? "current" : "stale";
  }
  async getRevisionByIdempotency(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string; idempotencyKey: string }) { const db = getDb(); const [row] = await db.select().from(spec224WorkspaceSpecSetRevisions).where(and(eq(spec224WorkspaceSpecSetRevisions.tenantId, input.tenantId), eq(spec224WorkspaceSpecSetRevisions.actorId, input.actorId), eq(spec224WorkspaceSpecSetRevisions.runnerId, input.runnerId), eq(spec224WorkspaceSpecSetRevisions.workspaceId, input.workspaceId), eq(spec224WorkspaceSpecSetRevisions.idempotencyKey, input.idempotencyKey))).limit(1); return row ? revisionRow(row) : null; }
  async createRevision(input: Omit<Spec224WorkspaceSpecSetRevision, "id">) {
    const db = getDb();
    return db.transaction(async tx => {
      await tx.insert(spec224WorkspaceSpecSetHeads).values({ tenantId: input.tenantId, actorId: input.actorId, runnerId: input.runnerId, workspaceId: input.workspaceId }).onConflictDoNothing();
      const [head] = await tx.select().from(spec224WorkspaceSpecSetHeads).where(and(eq(spec224WorkspaceSpecSetHeads.tenantId, input.tenantId), eq(spec224WorkspaceSpecSetHeads.actorId, input.actorId), eq(spec224WorkspaceSpecSetHeads.runnerId, input.runnerId), eq(spec224WorkspaceSpecSetHeads.workspaceId, input.workspaceId))).for("update").limit(1);
      if (!head || head.currentRevision !== (input.parentRevision ?? 0)) fail("SPEC_SET_REVISION_STALE");
      const revision = head.currentRevision + 1;
      const [row] = await tx.insert(spec224WorkspaceSpecSetRevisions).values({ ...input, revision, parentRevision: head.currentRevision || null, filesJson: input.files, replacedPathsJson: input.replacedPaths }).returning();
      await tx.update(spec224WorkspaceSpecSetHeads).set({ currentRevision: revision, updatedAt: new Date() }).where(and(eq(spec224WorkspaceSpecSetHeads.tenantId, input.tenantId), eq(spec224WorkspaceSpecSetHeads.actorId, input.actorId), eq(spec224WorkspaceSpecSetHeads.runnerId, input.runnerId), eq(spec224WorkspaceSpecSetHeads.workspaceId, input.workspaceId)));
      return revisionRow(row!);
    });
  }
  async getLatestRevision(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string }) { const db = getDb(); const [row] = await db.select().from(spec224WorkspaceSpecSetRevisions).where(and(eq(spec224WorkspaceSpecSetRevisions.tenantId, input.tenantId), eq(spec224WorkspaceSpecSetRevisions.actorId, input.actorId), eq(spec224WorkspaceSpecSetRevisions.runnerId, input.runnerId), eq(spec224WorkspaceSpecSetRevisions.workspaceId, input.workspaceId))).orderBy(desc(spec224WorkspaceSpecSetRevisions.revision)).limit(1); return row ? revisionRow(row) : null; }
  async getRevision(input: { tenantId: string; actorId: number; runnerId: string; workspaceId: string; revision: number }) { const db = getDb(); const [row] = await db.select().from(spec224WorkspaceSpecSetRevisions).where(and(eq(spec224WorkspaceSpecSetRevisions.tenantId, input.tenantId), eq(spec224WorkspaceSpecSetRevisions.actorId, input.actorId), eq(spec224WorkspaceSpecSetRevisions.runnerId, input.runnerId), eq(spec224WorkspaceSpecSetRevisions.workspaceId, input.workspaceId), eq(spec224WorkspaceSpecSetRevisions.revision, input.revision))).limit(1); return row ? revisionRow(row) : null; }
}
function bindingRow(row: typeof spec224ConversationWorkspaces.$inferSelect): Spec224ConversationWorkspace { return { conversationId: row.conversationId, tenantId: row.tenantId, actorId: row.actorId, runnerId: row.runnerId, workspaceId: row.workspaceId, snapshotRevision: row.snapshotRevision, revision: row.revision }; }
function revisionRow(row: typeof spec224WorkspaceSpecSetRevisions.$inferSelect): Spec224WorkspaceSpecSetRevision { return { id: row.id, tenantId: row.tenantId, actorId: row.actorId, runnerId: row.runnerId, workspaceId: row.workspaceId, revision: row.revision, parentRevision: row.parentRevision, digest: row.digest, requestDigest: row.requestDigest, idempotencyKey: row.idempotencyKey, files: row.filesJson, replacedPaths: row.replacedPathsJson, requirementCount: row.requirementCount, runnableWorkPackageCount: row.runnableWorkPackageCount, blockedWorkPackageCount: row.blockedWorkPackageCount }; }

export const defaultSpec224WorkspaceSpecSetService = createSpec224WorkspaceSpecSetService(new DrizzleSpec224WorkspaceSpecSetStore());
