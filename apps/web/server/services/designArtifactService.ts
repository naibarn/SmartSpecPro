import { createHash, randomUUID } from "node:crypto";
import {
  canonicalDesignDigestInput,
  designArtifactVersionSchema,
  designRequestSchema,
  semanticDesignDiffSchema,
  type DesignArtifactVersion,
  type DesignRequest,
} from "../../shared/designIntelligence";
import type { TenantFeatureFlags } from "../../shared/featureFlags";

export type DesignArtifactActor = {
  userId: string;
  tenantId: string;
  projectId: string;
};
export type DesignArtifactAction = "create" | "read" | "append" | "fork" | "compare";

/** Persistence adapters are not registered until the G0 storage-owner gate closes. */
export interface DesignArtifactRepository {
  findIdempotentVersion(input: { idempotencyKey: string; requestFingerprint: string }): Promise<DesignArtifactVersion | null>;
  insertImmutableVersion(input: DesignArtifactVersion & {
    idempotencyKey: string;
    requestFingerprint: string;
    /** Adapter must atomically compare the latest version when provided. */
    expectedLatestVersion?: number;
  }): Promise<DesignArtifactVersion>;
  readVersion(input: DesignArtifactActor & { artifactId: string; version: number }): Promise<DesignArtifactVersion | null>;
  readLatest(input: DesignArtifactActor & { artifactId: string }): Promise<DesignArtifactVersion | null>;
}

export interface DesignArtifactAuthorizationPort {
  authorize(actor: DesignArtifactActor, action: DesignArtifactAction, artifactId?: string): Promise<boolean>;
}

export interface DesignArtifactAuditPort {
  record(input: {
    actor: DesignArtifactActor;
    action: DesignArtifactAction;
    outcome: "attempted" | "replayed";
    artifactId?: string;
    requestId?: string;
    digest?: string;
  }): Promise<void>;
}

export class DesignArtifactServiceError extends Error {
  constructor(public readonly code: "FEATURE_DISABLED" | "VERSION_CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "AUDIT_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "CONTEXT_INCOMPLETE" | "INVALID_REQUEST" | "DIFF_TOO_LARGE") {
    super(code);
    this.name = "DesignArtifactServiceError";
  }
}

export function createDesignArtifactService(input: {
  repository: DesignArtifactRepository;
  authorization: DesignArtifactAuthorizationPort;
  audit: DesignArtifactAuditPort;
  flags: Pick<TenantFeatureFlags, "smartAiHubDesignIntelligence" | "smartAiHubDesignNative">;
  createId?: () => string;
  now?: () => Date;
}) {
  const createId = input.createId ?? randomUUID;
  const now = input.now ?? (() => new Date());

  function assertNativeEnabled() {
    if (!input.flags.smartAiHubDesignIntelligence || !input.flags.smartAiHubDesignNative) {
      throw new DesignArtifactServiceError("FEATURE_DISABLED");
    }
  }

  async function authorize(actor: DesignArtifactActor, action: DesignArtifactAction, artifactId?: string) {
    if (!(await input.authorization.authorize(actor, action, artifactId))) {
      throw new DesignArtifactServiceError("FORBIDDEN");
    }
  }

  async function audit(event: Parameters<DesignArtifactAuditPort["record"]>[0]) {
    try {
      await input.audit.record(event);
    } catch {
      throw new DesignArtifactServiceError("AUDIT_UNAVAILABLE");
    }
  }

  async function withStorage<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DesignArtifactServiceError) throw error;
      throw new DesignArtifactServiceError("STORAGE_UNAVAILABLE");
    }
  }

  function assertReplayScope(version: DesignArtifactVersion, actor: DesignArtifactActor) {
    if (version.tenantId !== actor.tenantId || version.projectId !== actor.projectId) {
      throw new DesignArtifactServiceError("NOT_FOUND");
    }
  }

  async function createDraft(rawRequest: unknown, actor: DesignArtifactActor): Promise<DesignArtifactVersion> {
    assertNativeEnabled();
    const request = designRequestSchema.parse(rawRequest);
    if (
      request.tenantId !== actor.tenantId ||
      request.projectId !== actor.projectId ||
      request.requestedBy !== actor.userId
    ) {
      throw new DesignArtifactServiceError("FORBIDDEN");
    }
    await authorize(actor, "create");
    if (!request.componentCatalogSnapshotId) throw new DesignArtifactServiceError("CONTEXT_INCOMPLETE");

    const fingerprint = `sha256:${createHash("sha256").update(canonicalDesignDigestInput(request)).digest("hex")}`;
    const idempotencyKey = `${request.tenantId}:${request.projectId}:${request.requestId}`;
    const replay = await withStorage(() => input.repository.findIdempotentVersion({ idempotencyKey, requestFingerprint: fingerprint }));
    if (replay) {
      assertReplayScope(replay, actor);
      await audit({ actor, action: "create", outcome: "replayed", artifactId: replay.artifactId, requestId: request.requestId, digest: replay.digest });
      return replay;
    }

    const artifactId = createId();
    const payload = {
      kind: "native-design-intent",
      intent: request.intent,
      prompt: request.prompt,
      locale: request.locale,
    };
    const systemSnapshot = {
      catalogSnapshotId: request.componentCatalogSnapshotId,
      componentVersion: "astryx-0.6.3",
      locale: request.locale,
      theme: "system" as const,
      deviceProfile: "unspecified",
    };
    const digest = `sha256:${createHash("sha256").update(canonicalDesignDigestInput({ payload, systemSnapshot })).digest("hex")}`;
    const version = designArtifactVersionSchema.parse({
      schemaVersion: 1,
      artifactId,
      version: 1,
      digest,
      tenantId: request.tenantId,
      projectId: request.projectId,
      ownerId: actor.userId,
      createdBy: actor.userId,
      status: "draft",
      rights: { ownerId: actor.userId, license: "unknown", assetsCleared: false },
      systemSnapshot,
      actionBindings: [],
      storageRef: `internal:design-artifacts/${artifactId}/1`,
      provenance: {
        source: "native",
        requestId: request.requestId,
        reproducibility: "deterministic",
      },
      payload,
      createdAt: now().toISOString(),
    });
    await audit({ actor, action: "create", outcome: "attempted", artifactId, requestId: request.requestId, digest });
    return withStorage(() => input.repository.insertImmutableVersion({
      ...version,
      idempotencyKey,
      requestFingerprint: fingerprint,
    }));
  }

  async function readVersion(inputRead: DesignArtifactActor & { artifactId: string; version: number }) {
    assertNativeEnabled();
    await authorize(inputRead, "read", inputRead.artifactId);
    await audit({ actor: inputRead, action: "read", outcome: "attempted", artifactId: inputRead.artifactId });
    const result = await withStorage(() => input.repository.readVersion(inputRead));
    if (!result || result.tenantId !== inputRead.tenantId || result.projectId !== inputRead.projectId) {
      throw new DesignArtifactServiceError("NOT_FOUND");
    }
    return result;
  }

  async function appendVersion(inputAppend: {
    actor: DesignArtifactActor;
    artifactId: string;
    expectedLatestVersion: number;
    payload: Record<string, unknown>;
  }): Promise<DesignArtifactVersion> {
    assertNativeEnabled();
    await authorize(inputAppend.actor, "append", inputAppend.artifactId);
    const idempotencyKey = `${inputAppend.actor.tenantId}:${inputAppend.actor.projectId}:${inputAppend.artifactId}:${inputAppend.expectedLatestVersion}:${inputAppend.actor.userId}`;
    const requestFingerprint = `sha256:${createHash("sha256").update(canonicalDesignDigestInput({
      actor: inputAppend.actor,
      artifactId: inputAppend.artifactId,
      expectedLatestVersion: inputAppend.expectedLatestVersion,
      payload: inputAppend.payload,
    })).digest("hex")}`;
    const replay = await withStorage(() => input.repository.findIdempotentVersion({ idempotencyKey, requestFingerprint }));
    if (replay) {
      assertReplayScope(replay, inputAppend.actor);
      await audit({ actor: inputAppend.actor, action: "append", outcome: "replayed", artifactId: replay.artifactId, digest: replay.digest });
      return replay;
    }
    const latest = await withStorage(() => input.repository.readLatest({ ...inputAppend.actor, artifactId: inputAppend.artifactId }));
    if (!latest || latest.tenantId !== inputAppend.actor.tenantId || latest.projectId !== inputAppend.actor.projectId) {
      throw new DesignArtifactServiceError("NOT_FOUND");
    }
    if (latest.ownerId !== inputAppend.actor.userId) throw new DesignArtifactServiceError("FORBIDDEN");
    if (latest.version !== inputAppend.expectedLatestVersion) throw new DesignArtifactServiceError("VERSION_CONFLICT");

    const versionNumber = latest.version + 1;
    const digest = `sha256:${createHash("sha256").update(canonicalDesignDigestInput({
      payload: inputAppend.payload,
      systemSnapshot: latest.systemSnapshot,
    })).digest("hex")}`;
    const version = designArtifactVersionSchema.parse({
      ...latest,
      schemaVersion: 1,
      version: versionNumber,
      parentArtifactId: latest.artifactId,
      parentVersion: latest.version,
      storageRef: `internal:design-artifacts/${latest.artifactId}/${versionNumber}`,
      digest,
      status: "draft",
      rights: { ownerId: latest.ownerId, license: "unknown", assetsCleared: false },
      actionBindings: [],
      payload: inputAppend.payload,
      createdBy: inputAppend.actor.userId,
      createdAt: now().toISOString(),
    });
    await audit({ actor: inputAppend.actor, action: "append", outcome: "attempted", artifactId: version.artifactId, digest });
    return withStorage(() => input.repository.insertImmutableVersion({
      ...version,
      idempotencyKey,
      requestFingerprint,
      expectedLatestVersion: inputAppend.expectedLatestVersion,
    }));
  }

  async function readScopedVersion(
    actor: DesignArtifactActor,
    artifactId: string,
    version: number,
  ): Promise<DesignArtifactVersion> {
    const result = await withStorage(() => input.repository.readVersion({ ...actor, artifactId, version }));
    if (!result || result.tenantId !== actor.tenantId || result.projectId !== actor.projectId) {
      throw new DesignArtifactServiceError("NOT_FOUND");
    }
    return result;
  }

  async function forkVersion(inputFork: {
    actor: DesignArtifactActor;
    sourceArtifactId: string;
    sourceVersion: number;
    operationId: string;
  }): Promise<DesignArtifactVersion> {
    assertNativeEnabled();
    if (
      !inputFork.sourceArtifactId.trim() ||
      !Number.isInteger(inputFork.sourceVersion) || inputFork.sourceVersion < 1 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(inputFork.operationId)
    ) {
      throw new DesignArtifactServiceError("INVALID_REQUEST");
    }
    await authorize(inputFork.actor, "fork", inputFork.sourceArtifactId);
    const source = await readScopedVersion(inputFork.actor, inputFork.sourceArtifactId, inputFork.sourceVersion);
    const idempotencyKey = `${inputFork.actor.tenantId}:${inputFork.actor.projectId}:${inputFork.actor.userId}:fork:${source.artifactId}:${source.version}:${inputFork.operationId}`;
    const requestFingerprint = `sha256:${createHash("sha256").update(canonicalDesignDigestInput({
      actor: inputFork.actor,
      sourceArtifactId: source.artifactId,
      sourceVersion: source.version,
      sourceDigest: source.digest,
      operationId: inputFork.operationId,
    })).digest("hex")}`;
    const replay = await withStorage(() => input.repository.findIdempotentVersion({ idempotencyKey, requestFingerprint }));
    if (replay) {
      assertReplayScope(replay, inputFork.actor);
      await audit({ actor: inputFork.actor, action: "fork", outcome: "replayed", artifactId: replay.artifactId, requestId: inputFork.operationId, digest: replay.digest });
      return replay;
    }

    const artifactId = createId();
    const digest = `sha256:${createHash("sha256").update(canonicalDesignDigestInput({
      payload: source.payload,
      systemSnapshot: source.systemSnapshot,
    })).digest("hex")}`;
    const fork = designArtifactVersionSchema.parse({
      ...source,
      artifactId,
      version: 1,
      digest,
      ownerId: inputFork.actor.userId,
      createdBy: inputFork.actor.userId,
      parentArtifactId: source.artifactId,
      parentVersion: source.version,
      status: "draft",
      rights: { ownerId: inputFork.actor.userId, license: "unknown", assetsCleared: false },
      actionBindings: [],
      storageRef: `internal:design-artifacts/${artifactId}/1`,
      provenance: {
        source: "native",
        requestId: inputFork.operationId,
        branchId: source.artifactId,
        reproducibility: "deterministic",
      },
      createdAt: now().toISOString(),
    });
    await audit({ actor: inputFork.actor, action: "fork", outcome: "attempted", artifactId, requestId: inputFork.operationId, digest });
    return withStorage(() => input.repository.insertImmutableVersion({
      ...fork,
      idempotencyKey,
      requestFingerprint,
    }));
  }

  function diffValues(left: unknown, right: unknown, path: string, changes: Array<{ path: string; kind: "added" | "removed" | "changed"; summary: string }>) {
    if (changes.length > 1_000) throw new DesignArtifactServiceError("DIFF_TOO_LARGE");
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        if (index >= left.length) changes.push({ path: `${path}[${index}]`, kind: "added", summary: "Value added" });
        else if (index >= right.length) changes.push({ path: `${path}[${index}]`, kind: "removed", summary: "Value removed" });
        else diffValues(left[index], right[index], `${path}[${index}]`, changes);
      }
      return;
    }
    const isPlainObject = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    if (isPlainObject(left) && isPlainObject(right)) {
      const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
      for (const key of keys) {
        const childPath = `${path}.${key}`;
        if (!(key in left)) changes.push({ path: childPath, kind: "added", summary: "Value added" });
        else if (!(key in right)) changes.push({ path: childPath, kind: "removed", summary: "Value removed" });
        else diffValues(left[key], right[key], childPath, changes);
      }
      return;
    }
    changes.push({ path, kind: "changed", summary: "Value changed" });
  }

  async function compareVersions(inputCompare: {
    actor: DesignArtifactActor;
    from: { artifactId: string; version: number };
    to: { artifactId: string; version: number };
  }) {
    assertNativeEnabled();
    if (
      !inputCompare.from.artifactId.trim() || !inputCompare.to.artifactId.trim() ||
      !Number.isInteger(inputCompare.from.version) || inputCompare.from.version < 1 ||
      !Number.isInteger(inputCompare.to.version) || inputCompare.to.version < 1
    ) {
      throw new DesignArtifactServiceError("INVALID_REQUEST");
    }
    await authorize(inputCompare.actor, "compare", inputCompare.from.artifactId);
    if (inputCompare.to.artifactId !== inputCompare.from.artifactId) {
      await authorize(inputCompare.actor, "compare", inputCompare.to.artifactId);
    }
    const [from, to] = await Promise.all([
      readScopedVersion(inputCompare.actor, inputCompare.from.artifactId, inputCompare.from.version),
      readScopedVersion(inputCompare.actor, inputCompare.to.artifactId, inputCompare.to.version),
    ]);
    const changes: Array<{ path: string; kind: "added" | "removed" | "changed"; summary: string }> = [];
    diffValues(
      { payload: from.payload, systemSnapshot: from.systemSnapshot },
      { payload: to.payload, systemSnapshot: to.systemSnapshot },
      "$",
      changes,
    );
    if (changes.length > 1_000) throw new DesignArtifactServiceError("DIFF_TOO_LARGE");
    const result = semanticDesignDiffSchema.parse({ fromDigest: from.digest, toDigest: to.digest, changes });
    await audit({ actor: inputCompare.actor, action: "compare", outcome: "attempted", artifactId: from.artifactId, digest: from.digest });
    return result;
  }

  return { createDraft, readVersion, appendVersion, forkVersion, compareVersions };
}
