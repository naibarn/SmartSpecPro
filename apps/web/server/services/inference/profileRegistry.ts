import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  llmInferenceProfileCandidateHeads,
  llmInferenceProfileCertifications,
  llmInferenceProfileHeads,
  llmInferenceProfileVersions,
  llmInferenceProbeRuns,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  logicalModelProfileSchema,
  providerDeploymentProfileSchema,
  type LogicalModelProfile,
  type ProviderDeploymentProfile,
} from "./qualification";

export const inferenceProfilePairSchema = z
  .object({
    model: logicalModelProfileSchema,
    deployment: providerDeploymentProfileSchema,
  })
  .strict()
  .superRefine(({ model, deployment }, context) => {
    if (
      deployment.logicalModelId !== model.logicalModelId ||
      deployment.logicalModelRevision !== model.revision ||
      deployment.resolvedAliasRevision !== model.revision
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deployment", "logicalModelRevision"],
        message: "deployment must pin the exact logical model revision",
      });
    }
  });

export const publishInferenceProfileInputSchema = inferenceProfilePairSchema;

export type InferenceProfilePair = {
  model: LogicalModelProfile;
  deployment: ProviderDeploymentProfile;
};

export type ProfilePublicationValidation =
  | { ok: true; profile: InferenceProfilePair }
  | {
      ok: false;
      code: "PROFILE_INVALID" | "SERVER_PROBE_REQUIRED_FOR_ACTIVATION";
      fields?: string[];
    };

/** Catalog/admin input may register candidates, but may not self-certify them. */
export function validateInferenceProfilePublication(
  input: unknown
): ProfilePublicationValidation {
  const parsed = inferenceProfilePairSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "PROFILE_INVALID",
      fields: [
        ...new Set(
          parsed.error.issues.map(issue => issue.path.join(".") || "profile")
        ),
      ].sort(),
    };
  }
  if (
    parsed.data.model.lifecycle === "ACTIVE" ||
    parsed.data.model.lifecycle === "CANARY" ||
    parsed.data.deployment.status === "ACTIVE" ||
    parsed.data.deployment.probe.source === "live_probe"
  ) {
    return { ok: false, code: "SERVER_PROBE_REQUIRED_FOR_ACTIVATION" };
  }
  return { ok: true, profile: parsed.data };
}

export type ProfileRegistryLoadResult =
  | {
      ok: true;
      profiles: InferenceProfilePair[];
      invalidProfileIds: string[];
      registryRevision: string;
      observedAtMs: number;
    }
  | {
      ok: false;
      code: "PROFILE_REGISTRY_UNAVAILABLE" | "PROFILE_REGISTRY_INVALID";
    };

function registryDigest(
  rows: Array<{ id: number; deploymentRevision: string }>
) {
  const canonical = rows
    .map(row => `${row.id}:${row.deploymentRevision}`)
    .sort()
    .join("\n");
  return `registry:${createHash("sha256").update(canonical).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          key =>
            `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

function profileDigest(profile: unknown): string {
  return createHash("sha256").update(canonicalJson(profile)).digest("hex");
}

type StoredCapabilityProbeEvidence = {
  runId: string;
  profileVersionId: number;
  deploymentId: string;
  deploymentRevision: string;
  logicalModelId: string;
  modelRevision: string;
  providerRecordId: number;
  modelMappingId: number;
  probeKind: string;
  probeSuiteRevision: string;
  status: string;
  resultJson: Record<string, unknown>;
  finishedAt: Date;
};

/** Bind a runtime profile's live claim to the immutable server-written receipt. */
export function matchesStoredCapabilityProbeEvidence(
  profile: InferenceProfilePair,
  evidence: StoredCapabilityProbeEvidence,
  expected?: { profileVersionId: number; runId: string }
): boolean {
  const { model, deployment } = profile;
  const runtimeBinding = deployment.runtimeBinding;
  const result = evidence.resultJson;
  const checks = result.checks;
  const probedCapabilityRefs = result.probedCapabilityRefs;
  if (
    (expected &&
      (evidence.profileVersionId !== expected.profileVersionId ||
        evidence.runId !== expected.runId)) ||
    !runtimeBinding ||
    evidence.deploymentId !== deployment.deploymentId ||
    evidence.deploymentRevision !== deployment.revision ||
    evidence.logicalModelId !== model.logicalModelId ||
    evidence.modelRevision !== model.revision ||
    evidence.providerRecordId !== runtimeBinding.providerRecordId ||
    evidence.modelMappingId !== runtimeBinding.modelMappingId ||
    evidence.probeKind !== "capability_suite" ||
    evidence.probeSuiteRevision !== deployment.probe.probeSuiteRevision ||
    evidence.status !== "passed" ||
    result.qualificationStatus !== "passed" ||
    result.evidenceRef !== deployment.probe.evidenceRef ||
    evidence.finishedAt.getTime() !== deployment.probe.observedAtMs ||
    !checks ||
    typeof checks !== "object" ||
    Array.isArray(checks) ||
    !Array.isArray(probedCapabilityRefs)
  ) {
    return false;
  }
  const storedChecks = checks as Record<string, unknown>;
  return (
    !Object.entries(deployment.probe.checks).some(
      ([name, value]) => storedChecks[name] !== value
    ) && !model.capabilityRefs.some(ref => !probedCapabilityRefs.includes(ref))
  );
}

export async function publishInferenceProfileVersion(input: {
  profileInput: unknown;
  actorUserId: number;
}) {
  const validated = validateInferenceProfilePublication(input.profileInput);
  if (!validated.ok) return validated;
  const { model, deployment } = validated.profile;
  const now = new Date();
  const db = getDb();
  return db.transaction(async tx => {
    const [inserted] = await tx
      .insert(llmInferenceProfileVersions)
      .values({
        deploymentId: deployment.deploymentId,
        deploymentRevision: deployment.revision,
        logicalModelId: model.logicalModelId,
        modelRevision: model.revision,
        providerId: deployment.providerId,
        profileJson: validated.profile,
        createdByUserId: input.actorUserId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: llmInferenceProfileVersions.id });

    let profileVersionId = inserted?.id;
    if (!profileVersionId) {
      const [existing] = await tx
        .select({
          id: llmInferenceProfileVersions.id,
          profileJson: llmInferenceProfileVersions.profileJson,
        })
        .from(llmInferenceProfileVersions)
        .where(
          and(
            eq(
              llmInferenceProfileVersions.deploymentId,
              deployment.deploymentId
            ),
            eq(
              llmInferenceProfileVersions.deploymentRevision,
              deployment.revision
            )
          )
        )
        .limit(1);
      profileVersionId = existing?.id;
      if (
        existing &&
        profileDigest(existing.profileJson) !== profileDigest(validated.profile)
      ) {
        return {
          ok: false as const,
          code: "PROFILE_REVISION_CONFLICT" as const,
        };
      }
    }
    if (!profileVersionId) throw new Error("Inference profile write failed");

    await tx
      .insert(llmInferenceProfileCandidateHeads)
      .values({
        deploymentId: deployment.deploymentId,
        profileVersionId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: llmInferenceProfileCandidateHeads.deploymentId,
        set: { profileVersionId, updatedAt: now },
      });
    return {
      ok: true as const,
      deploymentId: deployment.deploymentId,
      deploymentRevision: deployment.revision,
      modelProfileRevision: model.revision,
      profileVersionId,
    };
  });
}

/** Candidate snapshot for admin qualification; never used by runtime routing. */
export async function loadInferenceProfileCandidates(
  now: Date = new Date()
): Promise<ProfileRegistryLoadResult> {
  const observedAtMs = now.getTime();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    return { ok: false, code: "PROFILE_REGISTRY_INVALID" };
  }
  try {
    const rows = await getDb()
      .select({
        id: llmInferenceProfileVersions.id,
        deploymentId: llmInferenceProfileVersions.deploymentId,
        deploymentRevision: llmInferenceProfileVersions.deploymentRevision,
        logicalModelId: llmInferenceProfileVersions.logicalModelId,
        modelRevision: llmInferenceProfileVersions.modelRevision,
        providerId: llmInferenceProfileVersions.providerId,
        profileJson: llmInferenceProfileVersions.profileJson,
      })
      .from(llmInferenceProfileCandidateHeads)
      .innerJoin(
        llmInferenceProfileVersions,
        eq(
          llmInferenceProfileCandidateHeads.profileVersionId,
          llmInferenceProfileVersions.id
        )
      );
    const profiles: InferenceProfilePair[] = [];
    const invalidProfileIds: string[] = [];
    for (const row of rows) {
      const parsed = inferenceProfilePairSchema.safeParse(row.profileJson);
      if (
        !parsed.success ||
        parsed.data.deployment.deploymentId !== row.deploymentId ||
        parsed.data.deployment.revision !== row.deploymentRevision ||
        parsed.data.deployment.providerId !== row.providerId ||
        parsed.data.model.logicalModelId !== row.logicalModelId ||
        parsed.data.model.revision !== row.modelRevision
      ) {
        invalidProfileIds.push(row.deploymentId);
        continue;
      }
      profiles.push(parsed.data);
    }
    return {
      ok: true,
      profiles,
      invalidProfileIds: invalidProfileIds.sort(),
      registryRevision: registryDigest(rows),
      observedAtMs,
    };
  } catch {
    return { ok: false, code: "PROFILE_REGISTRY_UNAVAILABLE" };
  }
}

/** Loads one consistent, current-head snapshot; malformed profiles are excluded. */
export async function loadInferenceProfileRegistry(
  now: Date = new Date(),
  readTx?: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]
): Promise<ProfileRegistryLoadResult> {
  const observedAtMs = now.getTime();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    return { ok: false, code: "PROFILE_REGISTRY_INVALID" };
  }
  try {
    const load = async (
      tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]
    ) => {
      if (!readTx) {
        await tx.execute(
          sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
        );
      }
      const rows = await tx
        .select({
          id: llmInferenceProfileVersions.id,
          deploymentId: llmInferenceProfileVersions.deploymentId,
          deploymentRevision: llmInferenceProfileVersions.deploymentRevision,
          logicalModelId: llmInferenceProfileVersions.logicalModelId,
          modelRevision: llmInferenceProfileVersions.modelRevision,
          providerId: llmInferenceProfileVersions.providerId,
          profileJson: llmInferenceProfileCertifications.certifiedProfileJson,
          capabilityProbeRunId: llmInferenceProfileCertifications.probeRunId,
        })
        .from(llmInferenceProfileHeads)
        .innerJoin(
          llmInferenceProfileVersions,
          eq(
            llmInferenceProfileHeads.profileVersionId,
            llmInferenceProfileVersions.id
          )
        )
        .innerJoin(
          llmInferenceProfileCertifications,
          eq(
            llmInferenceProfileCertifications.profileVersionId,
            llmInferenceProfileVersions.id
          )
        );
      const hasLiveProbeClaim = rows.some(row => {
        if (!row.profileJson || typeof row.profileJson !== "object")
          return false;
        const deployment = (row.profileJson as { deployment?: unknown })
          .deployment;
        return Boolean(
          deployment &&
          typeof deployment === "object" &&
          (deployment as { probe?: { source?: unknown } }).probe?.source ===
            "live_probe"
        );
      });
      const probeRows = hasLiveProbeClaim
        ? await tx
            .select({
              runId: llmInferenceProbeRuns.runId,
              profileVersionId: llmInferenceProbeRuns.profileVersionId,
              deploymentId: llmInferenceProbeRuns.deploymentId,
              deploymentRevision: llmInferenceProbeRuns.deploymentRevision,
              logicalModelId: llmInferenceProfileVersions.logicalModelId,
              modelRevision: llmInferenceProfileVersions.modelRevision,
              providerRecordId: llmInferenceProbeRuns.providerRecordId,
              modelMappingId: llmInferenceProbeRuns.modelMappingId,
              probeKind: llmInferenceProbeRuns.probeKind,
              probeSuiteRevision: llmInferenceProbeRuns.probeSuiteRevision,
              status: llmInferenceProbeRuns.status,
              resultJson: llmInferenceProbeRuns.resultJson,
              finishedAt: llmInferenceProbeRuns.finishedAt,
            })
            .from(llmInferenceProbeRuns)
            .innerJoin(
              llmInferenceProfileVersions,
              eq(
                llmInferenceProbeRuns.profileVersionId,
                llmInferenceProfileVersions.id
              )
            )
            .where(
              and(
                inArray(
                  llmInferenceProbeRuns.deploymentId,
                  rows.map(row => row.deploymentId)
                ),
                eq(llmInferenceProbeRuns.probeKind, "capability_suite"),
                eq(llmInferenceProbeRuns.status, "passed")
              )
            )
        : [];
      const profiles: InferenceProfilePair[] = [];
      const invalidProfileIds: string[] = [];
      for (const row of rows) {
        const parsed = inferenceProfilePairSchema.safeParse(row.profileJson);
        if (
          !parsed.success ||
          parsed.data.deployment.deploymentId !== row.deploymentId ||
          parsed.data.deployment.revision !== row.deploymentRevision ||
          parsed.data.deployment.providerId !== row.providerId ||
          parsed.data.model.logicalModelId !== row.logicalModelId ||
          parsed.data.model.revision !== row.modelRevision
        ) {
          invalidProfileIds.push(row.deploymentId);
          continue;
        }
        if (
          parsed.data.deployment.probe.source === "live_probe" &&
          !probeRows.some(
            probe =>
              matchesStoredCapabilityProbeEvidence(parsed.data, probe, {
                profileVersionId: row.id,
                runId: row.capabilityProbeRunId,
              })
          )
        ) {
          invalidProfileIds.push(row.deploymentId);
          continue;
        }
        profiles.push(parsed.data);
      }
      return {
        ok: true,
        profiles,
        invalidProfileIds: invalidProfileIds.sort(),
        registryRevision: registryDigest(rows),
        observedAtMs,
      };
    };
    return readTx ? await load(readTx) : await getDb().transaction(load);
  } catch {
    return { ok: false, code: "PROFILE_REGISTRY_UNAVAILABLE" };
  }
}
