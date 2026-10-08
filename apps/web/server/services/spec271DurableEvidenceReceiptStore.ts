import { createHash } from "node:crypto";

import { storagePutIfAbsent, storageReadBuffer } from "../storage";
import { digestSpec224EvidenceManifest } from "./spec224VerificationProvenance";
import {
  createSpec271PortableEvidenceReceipt,
  Spec271PortableReceiptError,
  verifySpec271PortableEvidenceReceipt,
  type Spec271PortableEvidenceReceipt,
  type Spec271PortableReceiptDependencies,
  type Spec271ReceiptScope,
} from "./spec271PortableEvidenceReceipt";

const RECEIPT_OBJECT_PREFIX = "spec271/receipts/v1";

export type Spec271ReceiptPersistenceIdentity = Readonly<Pick<
  Spec271ReceiptScope,
  | "requirementId"
  | "sourceSha"
  | "tenantId"
  | "projectId"
  | "uatRunId"
  | "attemptId"
  | "scenarioId"
  | "scenarioRevision"
  | "schemaRevision"
  | "environmentFingerprint"
>>;

export type Spec271ReceiptRetentionGrant = Readonly<{
  policyRef: string;
  /** True only when the policy authority confirms lifecycle/retention for this object key. */
  immutableStorageConfirmed: boolean;
}>;

export type Spec271ReceiptObjectStorage = Readonly<{
  putIfAbsent(
    key: string,
    bytes: Uint8Array,
    contentType: string
  ): Promise<{ key: string; created: boolean }>;
  readBuffer(key: string): Promise<Uint8Array | null>;
}>;

export type Spec271DurableReceiptStoreDependencies = Readonly<{
  /** Resolve identity from the canonical UAT/run authority, never from a caller-created scope. */
  resolveScope(identity: Spec271ReceiptPersistenceIdentity): Promise<Spec271ReceiptScope | null>;
  /** Bound to the authenticated actor and existing tenant/project policy by the caller. */
  authorizeScope(scope: Spec271ReceiptScope, access: "READ" | "WRITE"): Promise<boolean>;
  /** Must confirm the existing storage lifecycle policy for this exact immutable key. */
  resolveRetention(
    scope: Spec271ReceiptScope,
    storageKey: string,
    expectedPolicyRef?: string
  ): Promise<Spec271ReceiptRetentionGrant | null>;
  /** Existing WP2A oracle/artifact authorities used again during independent replay. */
  receipt: Omit<Spec271PortableReceiptDependencies, "authorizeScope">;
  storage?: Spec271ReceiptObjectStorage;
}>;

export type Spec271PersistedEvidenceReceipt = Readonly<{
  /** This wrapper records verified durable bytes; the embedded WP2A receipt remains VALIDATED_UNPERSISTED. */
  status: "PERSISTED_VERIFIED";
  receipt: Spec271PortableEvidenceReceipt;
  storageKey: string;
  storedContentSha256: string;
  retentionPolicyRef: string;
  created: boolean;
}>;

type StoredReceiptRecord = Readonly<{
  schemaVersion: "spec271.durable-receipt-object.v1";
  receipt: Spec271PortableEvidenceReceipt;
  retentionPolicyRef: string;
}>;

export class Spec271DurableReceiptError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "Spec271DurableReceiptError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function fail(code: string): never {
  throw new Spec271DurableReceiptError(code);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("STORED_RECEIPT_ENCODING_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") fail("STORED_RECEIPT_ENCODING_INVALID");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function identityForReceipt(receipt: Spec271PortableEvidenceReceipt): Spec271ReceiptPersistenceIdentity {
  return {
    requirementId: receipt.requirementId,
    sourceSha: receipt.sourceSha,
    tenantId: receipt.tenantId,
    projectId: receipt.projectId,
    uatRunId: receipt.uatRunId,
    attemptId: receipt.attemptId,
    scenarioId: receipt.scenarioId,
    scenarioRevision: receipt.scenarioRevision,
    schemaRevision: receipt.schemaRevision,
    environmentFingerprint: receipt.environmentFingerprint,
  };
}

function matchesIdentity(scope: Spec271ReceiptScope, identity: Spec271ReceiptPersistenceIdentity): boolean {
  return Object.keys(identity).every(key =>
    scope[key as keyof Spec271ReceiptPersistenceIdentity] === identity[key as keyof Spec271ReceiptPersistenceIdentity]
  );
}

function objectKey(identity: Spec271ReceiptPersistenceIdentity): string {
  return `${RECEIPT_OBJECT_PREFIX}/${digestSpec224EvidenceManifest(identity)}.json`;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseRecord(bytes: Uint8Array): StoredReceiptRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return fail("STORED_RECEIPT_ENCODING_INVALID");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("STORED_RECEIPT_ENCODING_INVALID");
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== "spec271.durable-receipt-object.v1" ||
      typeof record.retentionPolicyRef !== "string" || !record.retentionPolicyRef ||
      !record.receipt || typeof record.receipt !== "object" || Array.isArray(record.receipt)) {
    fail("STORED_RECEIPT_ENCODING_INVALID");
  }
  if (canonicalJson(record) !== Buffer.from(bytes).toString("utf8")) fail("STORED_RECEIPT_ENCODING_INVALID");
  const receipt = record.receipt as Spec271PortableEvidenceReceipt;
  if (!verifySpec271PortableEvidenceReceipt(receipt)) fail("STORED_RECEIPT_INTEGRITY_INVALID");
  return record as unknown as StoredReceiptRecord;
}

function storageAdapter(storage?: Spec271ReceiptObjectStorage): Spec271ReceiptObjectStorage {
  return storage ?? {
    putIfAbsent: storagePutIfAbsent,
    readBuffer: storageReadBuffer,
  };
}

function assertRetentionGrant(
  grant: Spec271ReceiptRetentionGrant | null,
  expectedPolicyRef?: string
): asserts grant is Spec271ReceiptRetentionGrant {
  if (!grant || typeof grant.policyRef !== "string" || !grant.policyRef.trim()) fail("RETENTION_POLICY_UNAVAILABLE");
  if (!grant.immutableStorageConfirmed) fail("RETENTION_POLICY_NOT_ENFORCED");
  if (expectedPolicyRef && grant.policyRef !== expectedPolicyRef) fail("RETENTION_POLICY_CHANGED");
}

export function createSpec271DurableEvidenceReceiptStore(
  dependencies: Spec271DurableReceiptStoreDependencies
) {
  const storage = storageAdapter(dependencies.storage);

  async function resolveAuthorizedScope(identity: Spec271ReceiptPersistenceIdentity, access?: "READ" | "WRITE") {
    let scope: Spec271ReceiptScope | null;
    try {
      scope = await dependencies.resolveScope(identity);
    } catch {
      return fail("RUN_SCOPE_AUTHORITY_UNAVAILABLE");
    }
    if (!scope) fail("RUN_SCOPE_NOT_FOUND");
    if (!matchesIdentity(scope, identity)) fail("RUN_SCOPE_MISMATCH");
    if (access) {
      let authorized = false;
      try {
        authorized = await dependencies.authorizeScope(scope, access);
      } catch {
        fail("SCOPE_AUTHORIZATION_UNAVAILABLE");
      }
      if (!authorized) fail("SCOPE_ACCESS_DENIED");
    }
    return scope;
  }

  async function revalidate(
    scope: Spec271ReceiptScope,
    receipt: Spec271PortableEvidenceReceipt
  ): Promise<void> {
    let current: Spec271PortableEvidenceReceipt;
    try {
      current = await createSpec271PortableEvidenceReceipt({
        scope,
        artifactRefs: receipt.evidenceArtifacts.map(artifact => ({
          artifactId: artifact.artifactId,
          contentSha256: artifact.contentSha256,
        })),
        verifiedAt: receipt.verifiedAt,
        ...(receipt.provenance.attestationRef
          ? { attestationRef: receipt.provenance.attestationRef }
          : {}),
      }, {
        ...dependencies.receipt,
        authorizeScope: async () => true,
      });
    } catch (error) {
      if (error instanceof Spec271PortableReceiptError) fail(error.code);
      fail("RECEIPT_REVALIDATION_FAILED");
    }
    if (current.receiptDigest !== receipt.receiptDigest || current.receiptId !== receipt.receiptId) {
      fail("RECEIPT_AUTHORITY_OR_EVIDENCE_CHANGED");
    }
  }

  async function loadResolved(
    scope: Spec271ReceiptScope,
    identity: Spec271ReceiptPersistenceIdentity,
    expectedPolicyRef?: string,
    created = false
  ): Promise<Spec271PersistedEvidenceReceipt> {
    let authorized = false;
    try {
      authorized = await dependencies.authorizeScope(scope, "READ");
    } catch {
      fail("SCOPE_AUTHORIZATION_UNAVAILABLE");
    }
    if (!authorized) fail("SCOPE_ACCESS_DENIED");
    const key = objectKey(identity);
    let bytes: Uint8Array | null;
    try {
      bytes = await storage.readBuffer(key);
    } catch {
      fail("STORED_RECEIPT_READ_FAILED");
    }
    if (!bytes) fail("STORED_RECEIPT_NOT_FOUND");
    const record = parseRecord(bytes);
    if (!matchesIdentity(scope, identity) ||
        digestSpec224EvidenceManifest(identityForReceipt(record.receipt)) !== digestSpec224EvidenceManifest(identity)) {
      fail("STORED_RECEIPT_SCOPE_MISMATCH");
    }
    let retention: Spec271ReceiptRetentionGrant | null;
    try {
      retention = await dependencies.resolveRetention(scope, key, expectedPolicyRef ?? record.retentionPolicyRef);
    } catch {
      fail("RETENTION_POLICY_UNAVAILABLE");
    }
    assertRetentionGrant(retention, expectedPolicyRef ?? record.retentionPolicyRef);
    await revalidate(scope, record.receipt);
    return Object.freeze({
      status: "PERSISTED_VERIFIED",
      receipt: record.receipt,
      storageKey: key,
      storedContentSha256: sha256(bytes),
      retentionPolicyRef: record.retentionPolicyRef,
      created,
    });
  }

  return {
    async persist(receipt: Spec271PortableEvidenceReceipt): Promise<Spec271PersistedEvidenceReceipt> {
      if (!verifySpec271PortableEvidenceReceipt(receipt)) fail("RECEIPT_INTEGRITY_INVALID");
      const identity = identityForReceipt(receipt);
      const scope = await resolveAuthorizedScope(identity, "WRITE");
      const key = objectKey(identity);
      let retention: Spec271ReceiptRetentionGrant | null;
      try {
        retention = await dependencies.resolveRetention(scope, key);
      } catch {
        fail("RETENTION_POLICY_UNAVAILABLE");
      }
      assertRetentionGrant(retention);
      await revalidate(scope, receipt);

      const storedRecord: StoredReceiptRecord = {
        schemaVersion: "spec271.durable-receipt-object.v1",
        receipt,
        retentionPolicyRef: retention.policyRef,
      };
      const bytes = Buffer.from(canonicalJson(storedRecord), "utf8");
      let put: { key: string; created: boolean };
      try {
        put = await storage.putIfAbsent(key, bytes, "application/json");
      } catch (error) {
        if (error instanceof Error && error.message.includes("STORAGE_OBJECT_CONTENT_CONFLICT")) {
          fail("RECEIPT_CONFLICT");
        }
        fail("IMMUTABLE_STORAGE_WRITE_FAILED");
      }
      if (put.key !== key) fail("STORAGE_OBJECT_KEY_MISMATCH");
      return loadResolved(scope, identity, retention.policyRef, put.created);
    },

    async load(identity: Spec271ReceiptPersistenceIdentity): Promise<Spec271PersistedEvidenceReceipt> {
      const scope = await resolveAuthorizedScope(identity, "READ");
      return loadResolved(scope, identity);
    },
  };
}
