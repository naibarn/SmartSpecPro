import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  llmInferencePolicyHeads,
  llmInferencePolicyEvents,
  llmInferencePolicySnapshots,
  llmInferenceRevocations,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { inferenceRouterPolicySchema } from "./routerPolicy";

const idList = z
  .array(z.string().trim().min(1).max(256))
  .max(512)
  .refine(values => new Set(values).size === values.length);

export const inferencePolicyPayloadSchema = z
  .object({
    ready: z.boolean(),
    allowedProviderIds: idList,
    allowedRegions: idList,
    allowedCredentialOwnerRefs: idList,
    requireZeroDataRetention: z.boolean(),
    routingPolicy: inferenceRouterPolicySchema.optional(),
  })
  .strict();

const scopedInferencePolicyInputSchema = z.discriminatedUnion(
  "scopeType",
  [
    z
      .object({
        scopeType: z.literal("platform"),
        policy: inferencePolicyPayloadSchema,
      })
      .strict(),
    z
      .object({
        scopeType: z.literal("tenant"),
        tenantId: z.string().trim().min(1).max(36),
        policy: inferencePolicyPayloadSchema,
      })
      .strict(),
    z
      .object({
        scopeType: z.literal("principal"),
        tenantId: z.string().trim().min(1).max(36),
        principalRef: z.string().trim().min(1).max(256),
        policy: inferencePolicyPayloadSchema,
      })
      .strict(),
  ]
);

export const publishInferencePolicyInputSchema = scopedInferencePolicyInputSchema.superRefine(
  (input, context) => {
    const hasRoutingPolicy = input.policy.routingPolicy !== undefined;
    if (input.scopeType === "platform" && !hasRoutingPolicy) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["policy", "routingPolicy"],
        message: "Platform policy must define versioned routing weights",
      });
    }
    if (input.scopeType !== "platform" && hasRoutingPolicy) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["policy", "routingPolicy"],
        message: "Routing weights are platform-owned",
      });
    }
  },
);

export const inferencePolicyRevisionScopeSchema = z
  .object({
    scopeType: z.enum(["platform", "tenant", "principal"]),
    scopeKey: z.string().trim().min(1).max(256),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((input, context) => {
    const valid =
      (input.scopeType === "platform" && input.scopeKey === "platform") ||
      (input.scopeType === "tenant" && input.scopeKey.length <= 36 && !input.scopeKey.includes(":")) ||
      (input.scopeType === "principal" && /^[^:]{1,36}:.{1,219}$/.test(input.scopeKey));
    if (!valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeKey"],
        message: "Policy scope key does not match its scope type",
      });
    }
  });

export const rollbackInferencePolicyInputSchema = z
  .object({
    scopeType: z.enum(["platform", "tenant", "principal"]),
    scopeKey: z.string().trim().min(1).max(256),
    revision: z.string().trim().min(1).max(256),
  })
  .strict()
  .superRefine((input, context) => {
    const valid =
      (input.scopeType === "platform" && input.scopeKey === "platform") ||
      (input.scopeType === "tenant" && input.scopeKey.length <= 36 && !input.scopeKey.includes(":")) ||
      (input.scopeType === "principal" && /^[^:]{1,36}:.{1,219}$/.test(input.scopeKey));
    if (!valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeKey"],
        message: "Policy scope key does not match its scope type",
      });
    }
  });

function policyScopeKey(input: PublishInferencePolicyInput): string {
  if (input.scopeType === "platform") return "platform";
  if (input.scopeType === "tenant") return input.tenantId;
  return `${input.tenantId}:${input.principalRef}`;
}

function policyRevision(scopeType: string, scopeKey: string, policy: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`${scopeType}\n${scopeKey}\n${canonicalJson(policy)}`)
    .digest("hex")}`;
}

export type PublishInferencePolicyInput = z.infer<
  typeof publishInferencePolicyInputSchema
>;

export const createInferenceRevocationInputSchema = z
  .object({
    scopeType: z.enum(["tenant", "principal"]),
    tenantId: z.string().trim().min(1).max(36),
    principalRef: z.string().trim().min(1).max(256).optional(),
    targetType: z.enum(["model", "deployment"]),
    targetId: z.string().trim().min(1).max(256),
    reasonCode: z.enum([
      "security_incident",
      "provider_compromise",
      "policy_violation",
      "operator_action",
    ]),
    // Revocations are append-only. Require an expiry so an operator can
    // recover from an accidental emergency fence without mutating history.
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scopeType === "tenant" && value.principalRef !== undefined) {
      context.addIssue({ code: "custom", path: ["principalRef"], message: "Tenant revocations cannot set a principal" });
    }
    if (value.scopeType === "principal" && !value.principalRef) {
      context.addIssue({ code: "custom", path: ["principalRef"], message: "Principal revocations require a principal" });
    }
  });

export type CreateInferenceRevocationInput = z.infer<
  typeof createInferenceRevocationInputSchema
>;

export function parseFutureRevocationExpiry(value: string, now: Date): Date | null {
  const expiresAt = new Date(value);
  return Number.isFinite(expiresAt.getTime()) && expiresAt > now
    ? expiresAt
    : null;
}

export const listInferenceRevocationsInputSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(36),
    principalRef: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export async function listInferenceRevocations(input: {
  tenantId: string;
  principalRef?: string;
}) {
  const db = getDb();
  return db
    .select({
      id: llmInferenceRevocations.id,
      scopeType: llmInferenceRevocations.scopeType,
      principalRef: llmInferenceRevocations.principalRef,
      targetType: llmInferenceRevocations.targetType,
      targetId: llmInferenceRevocations.targetId,
      reasonCode: llmInferenceRevocations.reasonCode,
      createdByUserId: llmInferenceRevocations.createdByUserId,
      createdAt: llmInferenceRevocations.createdAt,
      expiresAt: llmInferenceRevocations.expiresAt,
    })
    .from(llmInferenceRevocations)
    .where(
      and(
        eq(llmInferenceRevocations.tenantId, input.tenantId),
        input.principalRef
          ? or(
              and(
                eq(llmInferenceRevocations.scopeType, "tenant"),
                isNull(llmInferenceRevocations.principalRef)
              ),
              and(
                eq(llmInferenceRevocations.scopeType, "principal"),
                eq(llmInferenceRevocations.principalRef, input.principalRef)
              )
            )
          : and(
              eq(llmInferenceRevocations.scopeType, "tenant"),
              isNull(llmInferenceRevocations.principalRef)
            )
      )
    )
    .orderBy(desc(llmInferenceRevocations.createdAt))
    .limit(50);
}

export async function createInferenceRevocation(input: {
  revocationInput: CreateInferenceRevocationInput;
  actorUserId: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const expiresAt = parseFutureRevocationExpiry(
    input.revocationInput.expiresAt,
    now
  );
  if (!expiresAt) {
    throw new Error("Inference revocation expiry must be in the future");
  }
  const db = getDb();
  const [row] = await db
    .insert(llmInferenceRevocations)
    .values({
      tenantId: input.revocationInput.tenantId,
      scopeType: input.revocationInput.scopeType,
      principalRef: input.revocationInput.principalRef ?? null,
      targetType: input.revocationInput.targetType,
      targetId: input.revocationInput.targetId,
      reasonCode: input.revocationInput.reasonCode,
      createdByUserId: input.actorUserId,
      createdAt: now,
      expiresAt,
    })
    .returning({
      id: llmInferenceRevocations.id,
      tenantId: llmInferenceRevocations.tenantId,
      scopeType: llmInferenceRevocations.scopeType,
      principalRef: llmInferenceRevocations.principalRef,
      targetType: llmInferenceRevocations.targetType,
      targetId: llmInferenceRevocations.targetId,
      reasonCode: llmInferenceRevocations.reasonCode,
      createdByUserId: llmInferenceRevocations.createdByUserId,
      createdAt: llmInferenceRevocations.createdAt,
      expiresAt: llmInferenceRevocations.expiresAt,
    });
  if (!row) throw new Error("Inference revocation write failed");
  return row;
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
            JSON.stringify(key) +
            ":" +
            canonicalJson((value as Record<string, unknown>)[key])
        )
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

export function normalizeInferencePolicy(input: unknown) {
  const parsed = inferencePolicyPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };
  return {
    ok: true as const,
    policy: {
      ...parsed.data,
      allowedProviderIds: [...parsed.data.allowedProviderIds].sort(),
      allowedRegions: [...parsed.data.allowedRegions].sort(),
      allowedCredentialOwnerRefs: [
        ...parsed.data.allowedCredentialOwnerRefs,
      ].sort(),
      ...(parsed.data.routingPolicy
        ? { routingPolicy: parsed.data.routingPolicy }
        : {}),
    },
  };
}

export async function publishInferencePolicy(input: {
  policyInput: PublishInferencePolicyInput;
  actorUserId: number;
}) {
  const normalized = normalizeInferencePolicy(input.policyInput.policy);
  if (!normalized.ok) throw new Error("Invalid inference policy payload");
  const { scopeType } = input.policyInput;
  const tenantId =
    input.policyInput.scopeType === "platform"
      ? null
      : input.policyInput.tenantId;
  const principalRef =
    input.policyInput.scopeType === "principal"
      ? input.policyInput.principalRef
      : null;
  const scopeKey = policyScopeKey(input.policyInput);
  const revision = policyRevision(scopeType, scopeKey, normalized.policy);
  const now = new Date();

  const db = getDb();
  return db.transaction(async tx => {
    const [inserted] = await tx
      .insert(llmInferencePolicySnapshots)
      .values({
        scopeType,
        scopeKey,
        tenantId,
        principalRef,
        revision,
        policyJson: normalized.policy,
        createdByUserId: input.actorUserId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: llmInferencePolicySnapshots.id });

    let snapshotId = inserted?.id;
    if (!snapshotId) {
      const [existing] = await tx
        .select({ id: llmInferencePolicySnapshots.id })
        .from(llmInferencePolicySnapshots)
        .where(
          and(
            eq(llmInferencePolicySnapshots.scopeType, scopeType),
            eq(llmInferencePolicySnapshots.scopeKey, scopeKey),
            eq(llmInferencePolicySnapshots.revision, revision)
          )
        )
        .limit(1);
      snapshotId = existing?.id;
    }
    if (!snapshotId) throw new Error("Inference policy snapshot write failed");

    const [firstHead] = await tx
      .insert(llmInferencePolicyHeads)
      .values({ scopeType, scopeKey, snapshotId, updatedAt: now })
      .onConflictDoNothing()
      .returning({ snapshotId: llmInferencePolicyHeads.snapshotId });

    if (firstHead) {
      await tx.insert(llmInferencePolicyEvents).values({
        scopeType,
        scopeKey,
        action: "publish",
        fromRevision: null,
        toRevision: revision,
        actorUserId: input.actorUserId,
        createdAt: now,
      });
    } else {
      const [current] = await tx
        .select({
          snapshotId: llmInferencePolicySnapshots.id,
          revision: llmInferencePolicySnapshots.revision,
        })
        .from(llmInferencePolicyHeads)
        .innerJoin(
          llmInferencePolicySnapshots,
          eq(llmInferencePolicyHeads.snapshotId, llmInferencePolicySnapshots.id)
        )
        .where(
          and(
            eq(llmInferencePolicyHeads.scopeType, scopeType),
            eq(llmInferencePolicyHeads.scopeKey, scopeKey)
          )
        )
        .for("update");
      if (!current) throw new Error("Inference policy head is unavailable");
      if (current.revision !== revision) {
        await tx
          .update(llmInferencePolicyHeads)
          .set({ snapshotId, updatedAt: now })
          .where(
            and(
              eq(llmInferencePolicyHeads.scopeType, scopeType),
              eq(llmInferencePolicyHeads.scopeKey, scopeKey)
            )
          );
        await tx.insert(llmInferencePolicyEvents).values({
          scopeType,
          scopeKey,
          action: "publish",
          fromRevision: current.revision,
          toRevision: revision,
          actorUserId: input.actorUserId,
          createdAt: now,
        });
      }
    }

    return { scopeType, scopeKey, revision, snapshotId };
  });
}

export async function listInferencePolicyRevisions(input: z.infer<typeof inferencePolicyRevisionScopeSchema>) {
  const db = getDb();
  const [revisions, events] = await Promise.all([
    db
      .select({
        revision: llmInferencePolicySnapshots.revision,
        policyJson: llmInferencePolicySnapshots.policyJson,
        createdByUserId: llmInferencePolicySnapshots.createdByUserId,
        createdAt: llmInferencePolicySnapshots.createdAt,
      })
      .from(llmInferencePolicySnapshots)
      .where(
        and(
          eq(llmInferencePolicySnapshots.scopeType, input.scopeType),
          eq(llmInferencePolicySnapshots.scopeKey, input.scopeKey)
        )
      )
      .orderBy(desc(llmInferencePolicySnapshots.createdAt), desc(llmInferencePolicySnapshots.id))
      .limit(input.limit),
    db
      .select({
        action: llmInferencePolicyEvents.action,
        fromRevision: llmInferencePolicyEvents.fromRevision,
        toRevision: llmInferencePolicyEvents.toRevision,
        actorUserId: llmInferencePolicyEvents.actorUserId,
        createdAt: llmInferencePolicyEvents.createdAt,
      })
      .from(llmInferencePolicyEvents)
      .where(
        and(
          eq(llmInferencePolicyEvents.scopeType, input.scopeType),
          eq(llmInferencePolicyEvents.scopeKey, input.scopeKey)
        )
      )
      .orderBy(desc(llmInferencePolicyEvents.createdAt), desc(llmInferencePolicyEvents.id))
      .limit(input.limit),
  ]);
  return { revisions, events };
}

export async function rollbackInferencePolicy(input: {
  rollbackInput: z.infer<typeof rollbackInferencePolicyInputSchema>;
  actorUserId: number;
}) {
  const { scopeType, scopeKey, revision } = input.rollbackInput;
  const db = getDb();
  const now = new Date();
  return db.transaction(async tx => {
    const [target] = await tx
      .select({
        id: llmInferencePolicySnapshots.id,
        revision: llmInferencePolicySnapshots.revision,
        policyJson: llmInferencePolicySnapshots.policyJson,
      })
      .from(llmInferencePolicySnapshots)
      .where(
        and(
          eq(llmInferencePolicySnapshots.scopeType, scopeType),
          eq(llmInferencePolicySnapshots.scopeKey, scopeKey),
          eq(llmInferencePolicySnapshots.revision, revision)
        )
      )
      .limit(1);
    if (!target) throw new Error("Inference policy revision was not found in this scope");

    const normalized = normalizeInferencePolicy(target.policyJson);
    if (
      !normalized.ok ||
      policyRevision(scopeType, scopeKey, normalized.policy) !== revision
    ) {
      throw new Error("Inference policy revision failed integrity validation");
    }
    const policyInput =
      scopeType === "platform"
        ? { scopeType, policy: normalized.policy }
        : scopeType === "tenant"
          ? { scopeType, tenantId: scopeKey, policy: normalized.policy }
          : {
              scopeType,
              tenantId: scopeKey.slice(0, scopeKey.indexOf(":")),
              principalRef: scopeKey.slice(scopeKey.indexOf(":") + 1),
              policy: normalized.policy,
            };
    if (!publishInferencePolicyInputSchema.safeParse(policyInput).success) {
      throw new Error("Inference policy revision is invalid for this scope");
    }

    const [current] = await tx
      .select({ revision: llmInferencePolicySnapshots.revision })
      .from(llmInferencePolicyHeads)
      .innerJoin(
        llmInferencePolicySnapshots,
        eq(llmInferencePolicyHeads.snapshotId, llmInferencePolicySnapshots.id)
      )
      .where(
        and(
          eq(llmInferencePolicyHeads.scopeType, scopeType),
          eq(llmInferencePolicyHeads.scopeKey, scopeKey)
        )
      )
      .for("update");
    if (!current) throw new Error("Inference policy head is unavailable");
    if (current.revision === revision) {
      return { changed: false, scopeType, scopeKey, revision };
    }

    await tx
      .update(llmInferencePolicyHeads)
      .set({ snapshotId: target.id, updatedAt: now })
      .where(
        and(
          eq(llmInferencePolicyHeads.scopeType, scopeType),
          eq(llmInferencePolicyHeads.scopeKey, scopeKey)
        )
      );
    await tx.insert(llmInferencePolicyEvents).values({
      scopeType,
      scopeKey,
      action: "rollback",
      fromRevision: current.revision,
      toRevision: revision,
      actorUserId: input.actorUserId,
      createdAt: now,
    });
    return {
      changed: true,
      scopeType,
      scopeKey,
      fromRevision: current.revision,
      revision,
    };
  });
}

export async function listInferencePolicyHeads(input?: {
  scopeType?: "platform" | "tenant" | "principal";
  scopeKey?: string;
}) {
  const db = getDb();
  const conditions = [];
  if (input?.scopeType)
    conditions.push(eq(llmInferencePolicyHeads.scopeType, input.scopeType));
  if (input?.scopeKey)
    conditions.push(eq(llmInferencePolicyHeads.scopeKey, input.scopeKey));
  return db
    .select({
      scopeType: llmInferencePolicySnapshots.scopeType,
      scopeKey: llmInferencePolicySnapshots.scopeKey,
      tenantId: llmInferencePolicySnapshots.tenantId,
      principalRef: llmInferencePolicySnapshots.principalRef,
      revision: llmInferencePolicySnapshots.revision,
      policyJson: llmInferencePolicySnapshots.policyJson,
      updatedAt: llmInferencePolicyHeads.updatedAt,
    })
    .from(llmInferencePolicyHeads)
    .innerJoin(
      llmInferencePolicySnapshots,
      eq(llmInferencePolicyHeads.snapshotId, llmInferencePolicySnapshots.id)
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(llmInferencePolicyHeads.updatedAt));
}
