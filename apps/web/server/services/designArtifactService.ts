import { createHash, randomUUID } from "node:crypto";
import {
  canonicalDesignDigestInput,
  designArtifactVersionSchema,
  designRequestSchema,
  type DesignArtifactVersion,
  type DesignRequest,
} from "../../shared/designIntelligence";
import type { TenantFeatureFlags } from "../../shared/featureFlags";

export type DesignArtifactActor = {
  userId: string;
  tenantId: string;
  projectId: string;
};
export type DesignArtifactAction = "create" | "read" | "append";

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
  constructor(public readonly code: "FEATURE_DISABLED" | "VERSION_CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "AUDIT_UNAVAILABLE" | "STORAGE_UNAVAILABLE" | "CONTEXT_INCOMPLETE") {
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

  return { createDraft, readVersion, appendVersion };
}
