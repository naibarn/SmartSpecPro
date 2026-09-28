import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  llmInferenceRolloutBundleHeads,
  llmInferenceRolloutBundleEvents,
  llmInferenceRolloutBundles,
  llmInferencePolicyHeads,
  llmInferencePolicySnapshots,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { loadInferenceProfileRegistry } from "./profileRegistry";
import { assessInferenceCapabilityRecheck } from "./capabilityRecheck";

const id = z.string().trim().min(1).max(256);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const inferenceRolloutBundlePayloadSchema = z
  .object({
    contract: z.literal("SAH-INFERENCE-ROLLOUT-1"),
    bundleId: id,
    sequence: z.number().int().safe().min(1),
    createdAt: z.string().datetime(),
    createdBy: id,
    routerPolicyRevision: id,
    logicalModelRegistryRevision: id,
    deploymentCredentialBindingRevision: id,
    surfaceCertificationRevision: id,
    gatewayRouteManifestHashes: z.array(sha256).min(1).max(64),
    billingPricingSnapshotRefs: z.array(id).min(1).max(128),
    fxPolicyRevision: id,
    guardrailPolicyRevision: id,
    rollbackBundleHash: sha256,
    contractVersions: z.tuple([
      z.literal("SAH-INFERENCE-2"),
      z.literal("SAH-RETRIEVAL-2"),
    ]),
    providerCapabilityRecheckRef: id,
    environmentReadinessRef: id,
  })
  .strict();

export const publishInferenceRolloutBundleInputSchema = z
  .object({
    bundleId: id,
    sequence: z.number().int().safe().min(1),
    routerPolicyRevision: id,
    logicalModelRegistryRevision: id,
    deploymentCredentialBindingRevision: id,
    surfaceCertificationRevision: id,
    gatewayRouteManifestHashes: z.array(sha256).min(1).max(64),
    billingPricingSnapshotRefs: z.array(id).min(1).max(128),
    fxPolicyRevision: id,
    guardrailPolicyRevision: id,
    rollbackBundleHash: sha256,
    providerCapabilityRecheckRef: id,
    environmentReadinessRef: id,
  })
  .strict();

export const activateInferenceRolloutBundleInputSchema = z
  .object({ bundleHash: sha256 })
  .strict();

export type InferenceRolloutBundlePayload = z.infer<
  typeof inferenceRolloutBundlePayloadSchema
>;

export type SignedInferenceRolloutBundle = {
  payload: InferenceRolloutBundlePayload;
  bundleHash: string;
  signingKeyId: string;
  signature: string;
};

export type InferenceRolloutBundleSummary = {
  bundleHash: string;
  bundleId: string;
  sequence: number;
  createdAt: Date;
  payload: InferenceRolloutBundlePayload | null;
  signatureStatus: "valid" | "invalid" | "unavailable";
  active: boolean;
};

export type InferenceRolloutBundleStatus = {
  keyringStatus:
    "ready" | "KEYRING_MISSING" | "KEYRING_INVALID" | "ACTIVE_KEY_MISSING";
  activeBundle: InferenceRolloutBundleSummary | null;
  recentBundles: InferenceRolloutBundleSummary[];
};

export type InferenceRolloutKeyring = ReadonlyMap<string, Uint8Array>;

export type RolloutBundleVerification =
  | { ok: true; payload: InferenceRolloutBundlePayload; bundleHash: string }
  | {
      ok: false;
      reason:
        | "INVALID_BUNDLE"
        | "UNKNOWN_SIGNING_KEY"
        | "BUNDLE_HASH_MISMATCH"
        | "SIGNATURE_INVALID";
    };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hashPayload(payload: InferenceRolloutBundlePayload): string {
  return `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

function signBundleHash(
  bundleHash: string,
  keyId: string,
  key: Uint8Array
): string {
  return createHmac("sha256", key)
    .update(`smartaihub-inference-rollout-v1\n${keyId}\n${bundleHash}`)
    .digest("hex");
}

export function loadInferenceRolloutKeyringFromEnv():
  | { ok: true; keyring: InferenceRolloutKeyring; activeKeyId: string }
  | {
      ok: false;
      reason: "KEYRING_MISSING" | "KEYRING_INVALID" | "ACTIVE_KEY_MISSING";
    } {
  const raw = process.env.INFERENCE_ROLLOUT_KEYS_JSON;
  const activeKeyId = process.env.INFERENCE_ROLLOUT_ACTIVE_KEY_ID?.trim();
  if (!raw) return { ok: false, reason: "KEYRING_MISSING" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "KEYRING_INVALID" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "KEYRING_INVALID" };
  }
  const keyring = new Map<string, Uint8Array>();
  for (const [keyId, encoded] of Object.entries(parsed)) {
    if (!keyId.trim() || typeof encoded !== "string") {
      return { ok: false, reason: "KEYRING_INVALID" };
    }
    const key = Buffer.from(encoded, "base64");
    if (key.length < 32 || key.toString("base64") !== encoded) {
      return { ok: false, reason: "KEYRING_INVALID" };
    }
    keyring.set(keyId, key);
  }
  if (keyring.size === 0) return { ok: false, reason: "KEYRING_INVALID" };
  if (!activeKeyId || !keyring.has(activeKeyId)) {
    return { ok: false, reason: "ACTIVE_KEY_MISSING" };
  }
  return { ok: true, keyring, activeKeyId };
}

/** Signs only a fully specified §84 bundle; no default evidence is invented. */
export function signInferenceRolloutBundle(input: {
  payload: unknown;
  signingKeyId: string;
  keyring: InferenceRolloutKeyring;
}): SignedInferenceRolloutBundle {
  const parsed = inferenceRolloutBundlePayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new Error("Inference rollout bundle payload is invalid");
  }
  const key = input.keyring.get(input.signingKeyId);
  if (!key || key.length < 32) {
    throw new Error("Inference rollout signing key is unavailable");
  }
  const bundleHash = hashPayload(parsed.data);
  return {
    payload: parsed.data,
    bundleHash,
    signingKeyId: input.signingKeyId,
    signature: signBundleHash(bundleHash, input.signingKeyId, key),
  };
}

/** Verifies canonical payload integrity and signer identity without fallback. */
export function verifyInferenceRolloutBundle(
  input: unknown,
  keyring: InferenceRolloutKeyring
): RolloutBundleVerification {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "INVALID_BUNDLE" };
  }
  const envelope = input as Record<string, unknown>;
  const payload = inferenceRolloutBundlePayloadSchema.safeParse(
    envelope.payload
  );
  if (
    !payload.success ||
    typeof envelope.bundleHash !== "string" ||
    typeof envelope.signingKeyId !== "string" ||
    typeof envelope.signature !== "string" ||
    !/^[a-f0-9]{64}$/.test(envelope.signature)
  ) {
    return { ok: false, reason: "INVALID_BUNDLE" };
  }
  const key = keyring.get(envelope.signingKeyId);
  if (!key || key.length < 32) {
    return { ok: false, reason: "UNKNOWN_SIGNING_KEY" };
  }
  const actualHash = hashPayload(payload.data);
  if (envelope.bundleHash !== actualHash) {
    return { ok: false, reason: "BUNDLE_HASH_MISMATCH" };
  }
  const expected = Buffer.from(
    signBundleHash(actualHash, envelope.signingKeyId, key),
    "hex"
  );
  const supplied = Buffer.from(envelope.signature, "hex");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  ) {
    return { ok: false, reason: "SIGNATURE_INVALID" };
  }
  return { ok: true, payload: payload.data, bundleHash: actualHash };
}

/** Creates an immutable signed artifact using only the configured server keyring. */
export async function publishInferenceRolloutBundle(input: {
  bundle: unknown;
  actorUserId: number;
}): Promise<SignedInferenceRolloutBundle> {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) {
    throw new Error("Inference rollout bundle actor is invalid");
  }
  const parsed = publishInferenceRolloutBundleInputSchema.safeParse(
    input.bundle
  );
  if (!parsed.success) {
    throw new Error("Inference rollout bundle input is invalid");
  }
  const configured = loadInferenceRolloutKeyringFromEnv();
  if (!configured.ok) {
    throw new Error("Inference rollout signing keyring is not ready");
  }
  const payload: InferenceRolloutBundlePayload = {
    contract: "SAH-INFERENCE-ROLLOUT-1",
    ...parsed.data,
    createdAt: new Date().toISOString(),
    createdBy: `admin:${input.actorUserId}`,
    contractVersions: ["SAH-INFERENCE-2", "SAH-RETRIEVAL-2"],
  };
  const signed = signInferenceRolloutBundle({
    payload,
    signingKeyId: configured.activeKeyId,
    keyring: configured.keyring,
  });
  const db = getDb();
  try {
    await db.insert(llmInferenceRolloutBundles).values({
      bundleHash: signed.bundleHash,
      bundleId: signed.payload.bundleId,
      sequence: signed.payload.sequence,
      payloadJson: signed.payload,
      signingKeyId: signed.signingKeyId,
      signature: signed.signature,
      createdByUserId: input.actorUserId,
    });
  } catch (error) {
    const candidate = error as {
      code?: string;
      cause?: { code?: string };
    };
    if ((candidate.code ?? candidate.cause?.code) !== "23505") {
      throw new Error("Inference rollout bundle persistence failed");
    }
    // Treat a repeated exact publication as idempotent, but do not reveal DB
    // details or accept an ID/sequence collision with different content.
    const [existing] = await db
      .select()
      .from(llmInferenceRolloutBundles)
      .where(eq(llmInferenceRolloutBundles.bundleHash, signed.bundleHash))
      .limit(1);
    if (
      !existing ||
      existing.signingKeyId !== signed.signingKeyId ||
      existing.signature !== signed.signature ||
      canonicalJson(existing.payloadJson) !== canonicalJson(signed.payload)
    ) {
      throw new Error(
        "Inference rollout bundle conflicts with an existing artifact"
      );
    }
  }
  return signed;
}

/** Loads and verifies an immutable persisted bundle; missing keyring fails closed. */
export async function loadVerifiedInferenceRolloutBundle(
  bundleHash: string
): Promise<SignedInferenceRolloutBundle | null> {
  if (!/^sha256:[a-f0-9]{64}$/.test(bundleHash)) return null;
  const configured = loadInferenceRolloutKeyringFromEnv();
  if (!configured.ok) return null;
  const persisted = await loadPersistedSignedInferenceRolloutBundle(
    bundleHash,
    configured.keyring
  );
  if (!persisted) return null;
  const [activeHead] = await getDb()
    .select({ bundleHash: llmInferenceRolloutBundleHeads.bundleHash })
    .from(llmInferenceRolloutBundleHeads)
    .where(
      and(
        eq(llmInferenceRolloutBundleHeads.slotKey, "platform"),
        eq(llmInferenceRolloutBundleHeads.bundleHash, bundleHash)
      )
    )
    .limit(1);
  return activeHead ? persisted : null;
}

/** Admin-safe rollout inventory. Signing secrets and HMAC signatures are never returned. */
export async function getInferenceRolloutBundleStatus(): Promise<InferenceRolloutBundleStatus> {
  const configured = loadInferenceRolloutKeyringFromEnv();
  const keyringStatus = configured.ok ? "ready" : configured.reason;
  const db = getDb();
  const [head] = await db
    .select({ bundleHash: llmInferenceRolloutBundleHeads.bundleHash })
    .from(llmInferenceRolloutBundleHeads)
    .where(eq(llmInferenceRolloutBundleHeads.slotKey, "platform"))
    .limit(1);
  const recentRows = await db
    .select({
      bundleHash: llmInferenceRolloutBundles.bundleHash,
      bundleId: llmInferenceRolloutBundles.bundleId,
      sequence: llmInferenceRolloutBundles.sequence,
      payloadJson: llmInferenceRolloutBundles.payloadJson,
      signingKeyId: llmInferenceRolloutBundles.signingKeyId,
      signature: llmInferenceRolloutBundles.signature,
      createdAt: llmInferenceRolloutBundles.createdAt,
    })
    .from(llmInferenceRolloutBundles)
    .orderBy(desc(llmInferenceRolloutBundles.createdAt))
    .limit(10);

  const activeRow =
    head && !recentRows.some(row => row.bundleHash === head.bundleHash)
      ? ((
          await db
            .select({
              bundleHash: llmInferenceRolloutBundles.bundleHash,
              bundleId: llmInferenceRolloutBundles.bundleId,
              sequence: llmInferenceRolloutBundles.sequence,
              payloadJson: llmInferenceRolloutBundles.payloadJson,
              signingKeyId: llmInferenceRolloutBundles.signingKeyId,
              signature: llmInferenceRolloutBundles.signature,
              createdAt: llmInferenceRolloutBundles.createdAt,
            })
            .from(llmInferenceRolloutBundles)
            .where(eq(llmInferenceRolloutBundles.bundleHash, head.bundleHash))
            .limit(1)
        )[0] ?? null)
      : null;
  const rows = activeRow ? [...recentRows, activeRow] : recentRows;

  const summarize = (
    row: (typeof rows)[number]
  ): InferenceRolloutBundleSummary => {
    const payload = inferenceRolloutBundlePayloadSchema.safeParse(
      row.payloadJson
    );
    const verification = configured.ok
      ? verifyInferenceRolloutBundle(
          {
            payload: row.payloadJson,
            bundleHash: row.bundleHash,
            signingKeyId: row.signingKeyId,
            signature: row.signature,
          },
          configured.keyring
        )
      : null;
    return {
      bundleHash: row.bundleHash,
      bundleId: row.bundleId,
      sequence: row.sequence,
      createdAt: row.createdAt,
      payload: payload.success ? payload.data : null,
      signatureStatus: verification
        ? verification.ok
          ? "valid"
          : "invalid"
        : "unavailable",
      active: row.bundleHash === head?.bundleHash,
    };
  };
  const recentBundles = rows.map(summarize);
  return {
    keyringStatus,
    activeBundle: recentBundles.find(bundle => bundle.active) ?? null,
    recentBundles,
  };
}

async function loadPersistedSignedInferenceRolloutBundle(
  bundleHash: string,
  keyring: InferenceRolloutKeyring
): Promise<SignedInferenceRolloutBundle | null> {
  const [row] = await getDb()
    .select({
      bundleHash: llmInferenceRolloutBundles.bundleHash,
      payloadJson: llmInferenceRolloutBundles.payloadJson,
      signingKeyId: llmInferenceRolloutBundles.signingKeyId,
      signature: llmInferenceRolloutBundles.signature,
    })
    .from(llmInferenceRolloutBundles)
    .where(eq(llmInferenceRolloutBundles.bundleHash, bundleHash))
    .limit(1);
  if (!row) return null;
  const envelope = {
    payload: row.payloadJson,
    bundleHash: row.bundleHash,
    signingKeyId: row.signingKeyId,
    signature: row.signature,
  };
  const verified = verifyInferenceRolloutBundle(envelope, keyring);
  return verified.ok ? envelope : null;
}

export type InferenceChatRolloutState =
  | { state: "no_active_bundle" }
  | { state: "active_bundle_verified"; bundleHash: string }
  | { state: "active_bundle_invalid"; reason: string };

/** Distinguish an intentionally empty platform slot from a corrupt active head. */
export async function getInferenceChatRolloutState(): Promise<InferenceChatRolloutState> {
  const db = getDb();
  const [head] = await db
    .select({ bundleHash: llmInferenceRolloutBundleHeads.bundleHash })
    .from(llmInferenceRolloutBundleHeads)
    .where(eq(llmInferenceRolloutBundleHeads.slotKey, "platform"))
    .limit(1);
  if (!head) return { state: "no_active_bundle" };

  const configured = loadInferenceRolloutKeyringFromEnv();
  if (!configured.ok) {
    return { state: "active_bundle_invalid", reason: configured.reason };
  }
  const bundle = await loadPersistedSignedInferenceRolloutBundle(
    head.bundleHash,
    configured.keyring
  );
  if (!bundle) {
    return { state: "active_bundle_invalid", reason: "ACTIVE_BUNDLE_SIGNATURE_INVALID" };
  }
  return { state: "active_bundle_verified", bundleHash: head.bundleHash };
}

export type RolloutBundleActivationResult =
  | { ok: true; bundleHash: string; action: "activate" | "rollback" }
  | {
      ok: false;
      reason:
        | "BUNDLE_NOT_SIGNED_OR_PERSISTED"
        | "PROVIDER_CAPABILITY_RECHECK_UNAVAILABLE"
        | "ENVIRONMENT_READINESS_UNAVAILABLE"
        | "PLATFORM_POLICY_REVISION_MISMATCH"
        | "PROFILE_REGISTRY_REVISION_MISMATCH"
        | "ACTIVATION_PERSISTENCE_FAILED";
    };

export type RolloutBundleActivationDependencies = {
  verifyProviderCapabilityRecheck?: (
    payload: InferenceRolloutBundlePayload
  ) => Promise<boolean>;
  verifyEnvironmentReadiness?: (
    payload: InferenceRolloutBundlePayload
  ) => Promise<boolean>;
};

/**
 * Atomically activates only a signed bundle pinned to current platform policy
 * and profile registry. Readiness verifiers default to deny because the live
 * capability/environment owners must be wired before Production activation.
 */
export async function activateInferenceRolloutBundle(
  input: {
    bundleHash: string;
    actorUserId: number;
  },
  dependencies: RolloutBundleActivationDependencies = {}
): Promise<RolloutBundleActivationResult> {
  const configured = loadInferenceRolloutKeyringFromEnv();
  if (!configured.ok) {
    return { ok: false, reason: "BUNDLE_NOT_SIGNED_OR_PERSISTED" };
  }
  const bundle = await loadPersistedSignedInferenceRolloutBundle(
    input.bundleHash,
    configured.keyring
  );
  if (
    !bundle ||
    !Number.isSafeInteger(input.actorUserId) ||
    input.actorUserId <= 0
  ) {
    return { ok: false, reason: "BUNDLE_NOT_SIGNED_OR_PERSISTED" };
  }
  let capabilityReady: boolean;
  if (dependencies.verifyProviderCapabilityRecheck) {
    capabilityReady = await dependencies.verifyProviderCapabilityRecheck(
      bundle.payload
    );
  } else {
    const registry = await loadInferenceProfileRegistry();
    const assessment = assessInferenceCapabilityRecheck(registry, Date.now());
    capabilityReady = Boolean(
      assessment.ready &&
      assessment.registryRevision ===
        bundle.payload.logicalModelRegistryRevision &&
      assessment.reference === bundle.payload.providerCapabilityRecheckRef
    );
  }
  if (!capabilityReady) {
    return { ok: false, reason: "PROVIDER_CAPABILITY_RECHECK_UNAVAILABLE" };
  }
  const environmentReady = await (
    dependencies.verifyEnvironmentReadiness ?? (async () => false)
  )(bundle.payload);
  if (!environmentReady) {
    return { ok: false, reason: "ENVIRONMENT_READINESS_UNAVAILABLE" };
  }

  try {
    return await getDb().transaction(async tx => {
      const [platformHead] = await tx
        .select({ revision: llmInferencePolicySnapshots.revision })
        .from(llmInferencePolicyHeads)
        .innerJoin(
          llmInferencePolicySnapshots,
          eq(llmInferencePolicyHeads.snapshotId, llmInferencePolicySnapshots.id)
        )
        .where(
          and(
            eq(llmInferencePolicyHeads.scopeType, "platform"),
            eq(llmInferencePolicyHeads.scopeKey, "platform")
          )
        )
        .for("update")
        .limit(1);
      if (platformHead?.revision !== bundle.payload.routerPolicyRevision) {
        return {
          ok: false as const,
          reason: "PLATFORM_POLICY_REVISION_MISMATCH" as const,
        };
      }
      const registry = await loadInferenceProfileRegistry(new Date(), tx);
      if (
        !registry.ok ||
        registry.registryRevision !==
          bundle.payload.logicalModelRegistryRevision
      ) {
        return {
          ok: false as const,
          reason: "PROFILE_REGISTRY_REVISION_MISMATCH" as const,
        };
      }
      if (!dependencies.verifyProviderCapabilityRecheck) {
        const currentAssessment = assessInferenceCapabilityRecheck(
          registry,
          Date.now()
        );
        if (
          !currentAssessment.ready ||
          currentAssessment.reference !==
            bundle.payload.providerCapabilityRecheckRef
        ) {
          return {
            ok: false as const,
            reason: "PROVIDER_CAPABILITY_RECHECK_UNAVAILABLE" as const,
          };
        }
      }
      const [currentHead] = await tx
        .select({ bundleHash: llmInferenceRolloutBundleHeads.bundleHash })
        .from(llmInferenceRolloutBundleHeads)
        .where(eq(llmInferenceRolloutBundleHeads.slotKey, "platform"))
        .for("update")
        .limit(1);
      const previousBundleHash = currentHead?.bundleHash ?? null;
      if (previousBundleHash === bundle.bundleHash) {
        return {
          ok: true as const,
          bundleHash: bundle.bundleHash,
          action: "activate" as const,
        };
      }
      const action =
        previousBundleHash &&
        bundle.payload.rollbackBundleHash === previousBundleHash
          ? "rollback"
          : "activate";
      const now = new Date();
      const readinessEvidenceJson = {
        providerCapabilityRecheckRef:
          bundle.payload.providerCapabilityRecheckRef,
        environmentReadinessRef: bundle.payload.environmentReadinessRef,
        verifiedAt: now.toISOString(),
        capabilityVerifierPassed: true,
        environmentVerifierPassed: true,
      };
      await tx
        .insert(llmInferenceRolloutBundleHeads)
        .values({
          slotKey: "platform",
          bundleHash: bundle.bundleHash,
          activatedByUserId: input.actorUserId,
          readinessEvidenceJson,
          activatedAt: now,
        })
        .onConflictDoUpdate({
          target: llmInferenceRolloutBundleHeads.slotKey,
          set: {
            bundleHash: bundle.bundleHash,
            activatedByUserId: input.actorUserId,
            readinessEvidenceJson,
            activatedAt: now,
          },
        });
      await tx.insert(llmInferenceRolloutBundleEvents).values({
        slotKey: "platform",
        action,
        fromBundleHash: previousBundleHash,
        toBundleHash: bundle.bundleHash,
        actorUserId: input.actorUserId,
        readinessEvidenceJson,
        createdAt: now,
      });
      return { ok: true as const, bundleHash: bundle.bundleHash, action };
    });
  } catch {
    return { ok: false, reason: "ACTIVATION_PERSISTENCE_FAILED" };
  }
}
