import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TARGET_ACCOUNT_GATES = [
  "target_account_binding_and_capability_probe",
  "hyperdrive_connectivity_cache_and_pool_probe",
  "deployment_rollback_and_restart_evidence",
  "provider_recovery_and_pitr_restore_rehearsal",
  "vectorize_index_schema_and_rebuild_evidence",
] as const;

export const REQUIRED_VECTORIZE_INDEX_NAMES = [
  "library-index",
  "docs-index-prod",
  "images-index-prod",
  "drama-media-index-prod",
] as const;

export const REQUIRED_VECTOR_SOURCE_NAMES = [
  "library_chunks",
  "web_documents",
  "web_images",
  "vertical_drama_media",
  "conversation_message_chunks",
  "scoped_memories",
  "agency_agent_memories",
  "agency_memory_chunks",
  "episodic_memory_collections",
  "social_conversation_archive",
  "generic_vector_documents",
  "multimodal_memory_vectors",
  "kilo_memory_embeddings",
] as const;

type TargetEvidence = {
  evidenceVersion?: unknown;
  accountIdentity?: unknown;
  releaseIdentity?: unknown;
  bindings?: Record<string, unknown>;
  hyperdrive?: Record<string, unknown>;
  deployment?: Record<string, unknown>;
  recovery?: Record<string, unknown>;
  vectorize?: Record<string, unknown>;
  evidenceRefs?: unknown;
};

const TARGET_EVIDENCE_FIELDS = new Set([
  "evidenceVersion",
  "accountIdentity",
  "releaseIdentity",
  "bindings",
  "hyperdrive",
  "deployment",
  "recovery",
  "vectorize",
  "evidenceRefs",
]);

export type TargetReadinessResult = {
  ok: boolean;
  mode: "local" | "target";
  targetAccountProof: boolean;
  productionProof: false;
  blockedGates: string[];
  evidenceFilePresent: boolean;
  safeReason: string;
};

const root = join(import.meta.dirname, "..", "..", "..");

function truthy(value: unknown): boolean {
  return value === true;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 255;
}

function validApprovalReference(value: unknown): boolean {
  return nonEmpty(value)
    && !/^approval:\/\//i.test(String(value).trim())
    && !/^(?:todo|tbd|placeholder|pending)(?:$|[:/_-])/i.test(String(value).trim());
}

function validVectorizeIndexName(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 64
    && new TextEncoder().encode(value).byteLength <= 64
    && /^[A-Za-z0-9_-]+$/.test(value);
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    (key !== "workersAiVectorizeCredentialSeparationVerified"
      && /(?:secret|token|password|credential|authorization|private.?key|database.?url)/i.test(key))
    || containsSensitiveField(child),
  );
}

function containsSensitiveValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveValue);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return false;
    return /(?:postgres(?:ql)?|redis|mysql|mongodb):\/\/|Bearer\s+[A-Za-z0-9._~+/=-]+|-----BEGIN [A-Z ]+-----|https?:\/\/[^\s?]+\?(?:[^\s]*)(?:token|signature|sig|x-amz-|expires|secret|credential|private.?key)=/i.test(value);
  }
  return Object.values(value).some(containsSensitiveValue);
}

function validateEvidence(evidence: TargetEvidence): string[] {
  const blocked: string[] = [];
  if (containsSensitiveField(evidence)) blocked.push("evidence_contains_sensitive_field");
  if (containsSensitiveValue(evidence)) blocked.push("evidence_contains_sensitive_value");
  if (evidence && typeof evidence === "object") {
    const unknownFields = Object.keys(evidence as Record<string, unknown>).filter(key => !TARGET_EVIDENCE_FIELDS.has(key));
    if (unknownFields.length > 0) blocked.push("evidence_unknown_field");
  }
  if (evidence.evidenceVersion !== 1) blocked.push("evidence_schema_version");
  if (!nonEmpty(evidence.accountIdentity)) blocked.push("target_account_identity");
  if (!nonEmpty(evidence.releaseIdentity)) blocked.push("release_identity");
  const requiredBindings = ["HYPERDRIVE", "JOB_QUEUE", "JOB_WORKFLOW", "JOB_CONTAINERS", "WORKER_APP", "MEDIA_BUCKET", "VECTOR_INDEX"];
  for (const binding of requiredBindings) {
    if (!truthy(evidence.bindings?.[binding])) blocked.push(`binding:${binding}`);
  }
  if (!truthy(evidence.hyperdrive?.reachable) || !truthy(evidence.hyperdrive?.cacheSafe) || !truthy(evidence.hyperdrive?.poolCapacityVerified)) {
    blocked.push(TARGET_ACCOUNT_GATES[1]);
  }
  if (!truthy(evidence.deployment?.rollbackVerified) || !truthy(evidence.deployment?.restartVerified)) {
    blocked.push(TARGET_ACCOUNT_GATES[2]);
  }
  if (!truthy(evidence.recovery?.providerRecoveryVerified) || !truthy(evidence.recovery?.pitrRestoreVerified)) {
    blocked.push(TARGET_ACCOUNT_GATES[3]);
  }
  const vectorize = evidence.vectorize;
  const indexes = Array.isArray(vectorize?.indexes) ? vectorize.indexes : [];
  const sourceInventory = Array.isArray(vectorize?.sourceInventory) ? vectorize.sourceInventory : [];
  const sourceNames = new Set(sourceInventory.flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const name = (source as Record<string, unknown>).name;
    return typeof name === "string" ? [name] : [];
  }));
  const sourceInventoryValid = sourceInventory.length === REQUIRED_VECTOR_SOURCE_NAMES.length
    && sourceNames.size === REQUIRED_VECTOR_SOURCE_NAMES.length
    && REQUIRED_VECTOR_SOURCE_NAMES.every((name) => sourceNames.has(name))
    && sourceInventory.every((source) => {
      if (!source || typeof source !== "object") return false;
      const item = source as Record<string, unknown>;
      const disposition = item.disposition;
      if (disposition === "migrated_to_vectorize") {
        return item.embeddingParityVerified === true
          && item.readPathParityVerified === true
          && item.privacyDeletionVerified === true
          && item.rebuildCheckpointVerified === true;
      }
      return disposition === "legacy_explicitly_approved"
        && validApprovalReference(item.approvalRef);
    });
  const validVectorize = vectorize?.sourceOfTruth === "postgresql"
    && vectorize?.embeddingModel === "@cf/baai/bge-base-en-v1.5"
    && vectorize?.dimensions === 768
    && vectorize?.metric === "cosine"
    && vectorize?.workersAiVectorizeCredentialSeparationVerified === true
    && vectorize?.tenantIsolationVerified === true
    && vectorize?.rebuildVerified === true
    && vectorize?.mutationRecoveryVerified === true
    && vectorize?.embeddingParityVerified === true
    && vectorize?.applicationVectorSourceInventoryVerified === true
    && vectorize?.readPathParityVerified === true
    && vectorize?.legacyVectorSourcesMigratedOrExplicitlyApproved === true
    && sourceInventoryValid
    && indexes.length === REQUIRED_VECTORIZE_INDEX_NAMES.length
    && indexes.every((index) => {
      if (!index || typeof index !== "object") return false;
      const item = index as Record<string, unknown>;
      const metadataIndexes = Array.isArray(item.metadataIndexes) ? item.metadataIndexes : [];
      return validVectorizeIndexName(item.name)
        && item.dimensions === 768
        && item.metric === "cosine"
        && metadataIndexes.includes("tenantId")
        && metadataIndexes.includes("type")
        && item.bindingVerified === true
        && item.writeQueryDeleteVerified === true
        && item.reindexCoverageVerified === true;
    });
  const indexNames = new Set(indexes.flatMap((index) => {
    if (!index || typeof index !== "object") return [];
    const name = (index as Record<string, unknown>).name;
    return typeof name === "string" ? [name] : [];
  }));
  if (
    indexNames.size !== REQUIRED_VECTORIZE_INDEX_NAMES.length
    || REQUIRED_VECTORIZE_INDEX_NAMES.some((name) => !indexNames.has(name))
  ) {
    blocked.push("vectorize_required_index_missing");
  }
  if (!validVectorize) blocked.push(TARGET_ACCOUNT_GATES[4]);
  if (!Array.isArray(evidence.evidenceRefs) || evidence.evidenceRefs.length === 0 || evidence.evidenceRefs.some(ref => !nonEmpty(ref))) {
    blocked.push("evidence_references");
  }
  return [...new Set(blocked)];
}

export function evaluateCloudflareTargetReadiness(input: {
  mode?: "local" | "target";
  evidence?: unknown;
  evidenceFilePresent?: boolean;
} = {}): TargetReadinessResult {
  const mode = input.mode ?? "local";
  if (mode === "local") {
    return {
      ok: true,
      mode,
      targetAccountProof: false,
      productionProof: false,
      blockedGates: [...TARGET_ACCOUNT_GATES],
      evidenceFilePresent: false,
      safeReason: "Local contract mode does not claim target-account or production proof",
    };
  }
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence as TargetEvidence : null;
  const blockedGates = evidence ? validateEvidence(evidence) : ["target_evidence_file"];
  if (!input.evidenceFilePresent) blockedGates.push("target_evidence_file");
  const uniqueBlockedGates = [...new Set(blockedGates)];
  return {
    ok: uniqueBlockedGates.length === 0,
    mode,
    targetAccountProof: uniqueBlockedGates.length === 0,
    productionProof: false,
    blockedGates: uniqueBlockedGates,
    evidenceFilePresent: input.evidenceFilePresent === true,
    safeReason: uniqueBlockedGates.length === 0
      ? "Target evidence is structurally complete; production proof still requires an approved deployment and recovery record"
      : "Target-account evidence is incomplete",
  };
}

function readEvidenceFile(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modeArg = process.argv.indexOf("--mode");
  const mode = modeArg >= 0 && process.argv[modeArg + 1] === "target" ? "target" : "local";
  const evidencePath = process.env.CLOUDFLARE_TARGET_EVIDENCE_FILE?.trim();
  const evidence = mode === "target" && evidencePath ? readEvidenceFile(evidencePath) : undefined;
  const result = evaluateCloudflareTargetReadiness({ mode, evidence, evidenceFilePresent: Boolean(evidencePath && existsSync(evidencePath)) });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
