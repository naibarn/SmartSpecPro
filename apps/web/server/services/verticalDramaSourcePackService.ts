import { randomBytes } from "crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../db";
import {
  verticalDramaSourceAnalyses,
  verticalDramaSourceAssets,
  verticalDramaSourcePackAuditEvents,
  verticalDramaSourcePackSessions,
  verticalDramaSourcePacks,
  verticalDramaSourceSlots,
  mediaAssets,
  type VerticalDramaSourceAsset,
  type VerticalDramaSourceSlot,
} from "../../drizzle/schema";
import { canReadManagedStorageKey } from "./managedStorageAuthorizationService";
import { normalizeManagedMediaKey } from "./managedMediaAccessService";
import { assertR2StorageActive, storageExists } from "../storage";
import {
  buildSourcePackDigest,
  buildSourcePackBrollManifest,
  evaluateSourcePackReadiness,
  verticalDramaSourceAssetInputSchema,
  verticalDramaSourceSlotInputSchema,
  type VdSourceAssetInput,
  type VdSourceDisclosureStatus,
  type VdSourcePackReadiness,
  type VdSourceRightsStatus,
  type VdSourceSlotInput,
} from "@shared/verticalDramaSeries/sourcePack";
import {
  getSeriesProfile,
  type VdSeriesProfile,
  type VdSeriesProfileId,
} from "@shared/verticalDramaSeries/seriesProfile";
import { getLatestPromptExpansion } from "./verticalDramaPromptExpansionService";

export const sourcePackIdInput = z.object({
  packId: z.number().int().positive(),
});
export const sourcePackSessionInput = z.object({
  draftSessionId: z.string().trim().min(40).max(128),
});

export type SourcePackOwner = { tenantId: string; userId: number };
const MAX_SOURCE_PACK_SLOTS = 500;
const MAX_SOURCE_PACK_ASSETS = 500;

export class VerticalDramaSourcePackNotReadyError extends Error {
  readonly code = "VD_SOURCE_PACK_NOT_READY" as const;
  constructor(readonly readiness: VdSourcePackReadiness) {
    super("Story Sources & Media is not ready for drafting");
    this.name = "VerticalDramaSourcePackNotReadyError";
  }
}

function now() {
  return new Date();
}

function assertOwner(
  row: { tenantId: string; userId: number } | undefined,
  owner: SourcePackOwner
): asserts row {
  if (!row || row.tenantId !== owner.tenantId || row.userId !== owner.userId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source pack not found",
    });
  }
}

function sessionToken(): string {
  return `vdss_${randomBytes(32).toString("base64url")}`;
}

function getErrorField(error: unknown, key: "code" | "message") {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function isSourcePackSchemaUnavailable(error: unknown): boolean {
  const code =
    getErrorField(error, "code") ??
    (error && typeof error === "object"
      ? getErrorField((error as Record<string, unknown>).cause, "code")
      : undefined);
  const message = [
    getErrorField(error, "message"),
    error && typeof error === "object"
      ? getErrorField((error as Record<string, unknown>).cause, "message")
      : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const mentionsSourcePackSchema =
    message.includes("vertical_drama_source_pack") ||
    message.includes("verticaldramasourcepack");

  return (
    code === "42P01" ||
    (code === "42703" && mentionsSourcePackSchema) ||
    (code === "42703" && !message)
  );
}

function throwIfSourcePackMigrationIsMissing(error: unknown): never {
  if (isSourcePackSchemaUnavailable(error)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Story Sources & Media is not available yet because database migration 0239 has not been applied. Run the database migration and retry.",
      cause: error,
    });
  }
  throw error;
}

export async function createDraftSourceSession(owner: SourcePackOwner) {
  const token = sessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let row: { draftSessionId: string; expiresAt: Date } | undefined;
  try {
    const [created] = await db
      .insert(verticalDramaSourcePackSessions)
      .values({ draftSessionId: token, ...owner, expiresAt })
      .returning();
    row = created as { draftSessionId: string; expiresAt: Date } | undefined;
  } catch (error) {
    throwIfSourcePackMigrationIsMissing(error);
  }
  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create a Story Sources & Media session",
    });
  }
  return { draftSessionId: row.draftSessionId, expiresAt: row.expiresAt };
}

async function loadSession(owner: SourcePackOwner, draftSessionId: string) {
  const [session] = await db
    .select()
    .from(verticalDramaSourcePackSessions)
    .where(
      and(
        eq(verticalDramaSourcePackSessions.draftSessionId, draftSessionId),
        eq(verticalDramaSourcePackSessions.tenantId, owner.tenantId),
        eq(verticalDramaSourcePackSessions.userId, owner.userId)
      )
    )
    .limit(1);
  if (
    !session ||
    session.status !== "active" ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Draft source session is expired or invalid",
    });
  }
  return session;
}

export async function getOrCreateStagedSourcePack(
  params: SourcePackOwner & {
    draftSessionId: string;
    profileId: VdSeriesProfileId;
  }
) {
  await loadSession(params, params.draftSessionId);
  const [existing] = await db
    .select()
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.tenantId, params.tenantId),
        eq(verticalDramaSourcePacks.userId, params.userId),
        eq(verticalDramaSourcePacks.draftSessionId, params.draftSessionId),
        isNull(verticalDramaSourcePacks.seriesId),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .limit(1);
  if (existing) {
    if (existing.profileId !== params.profileId) {
      const profile = getSeriesProfile(params.profileId);
      const packId = await db.transaction(async tx => {
        const [current] = await tx
          .select()
          .from(verticalDramaSourcePacks)
          .where(
            and(
              eq(verticalDramaSourcePacks.id, existing.id),
              eq(verticalDramaSourcePacks.tenantId, params.tenantId),
              eq(verticalDramaSourcePacks.userId, params.userId),
              isNull(verticalDramaSourcePacks.deletedAt)
            )
          )
          .limit(1);
        if (!current || current.profileId === params.profileId) {
          return current?.id ?? existing.id;
        }
        const [updated] = await tx
          .update(verticalDramaSourcePacks)
          .set({
            profileId: profile.profileId,
            profileVersion: profile.version,
            visualVersion: profile.visualVersion,
            status: "stale",
            version: sql`${verticalDramaSourcePacks.version} + 1`,
            updatedAt: now(),
          })
          .where(
            and(
              eq(verticalDramaSourcePacks.id, current.id),
              eq(verticalDramaSourcePacks.version, current.version)
            )
          )
          .returning({ id: verticalDramaSourcePacks.id });
        if (!updated)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Source pack changed; reload and retry",
          });
        return updated.id;
      });
      return loadSourcePack(params, Number(packId));
    }
    return loadSourcePack(params, existing.id);
  }

  const profile = getSeriesProfile(params.profileId);
  const pack = await db.transaction(async tx => {
    const [created] = await tx
      .insert(verticalDramaSourcePacks)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        draftSessionId: params.draftSessionId,
        profileId: profile.profileId,
        profileVersion: profile.version,
        visualVersion: profile.visualVersion,
      })
      .returning();
    // Required review/documentary packs receive their slot plan only after
    // prompt expansion is approved. This prevents generic profile defaults
    // from appearing before the system understands the creator's premise.
    if (profile.sourceGatePolicy === "optional" && profile.defaultSlots.length) {
      await tx.insert(verticalDramaSourceSlots).values(
        profile.defaultSlots.map((item, index) => ({
          tenantId: params.tenantId,
          userId: params.userId,
          packId: created.id,
          slotKey: item.key,
          title: item.title,
          narrativeDescription: item.description,
          sourceKind: "custom",
          required: item.required,
          usagePolicy:
            profile.bRollPolicy === "reference_only" ? "reference" : "broll",
          sortOrder: index,
        }))
      );
    }
    await tx.insert(verticalDramaSourcePackAuditEvents).values({
      tenantId: params.tenantId,
      userId: params.userId,
      packId: created.id,
      eventType: "pack_created",
      metadataJson: { profileId: profile.profileId },
    });
    return created;
  });
  return loadSourcePack(params, pack.id);
}

export async function loadSourcePack(owner: SourcePackOwner, packId: number) {
  const [pack] = await db
    .select()
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.id, packId),
        eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
        eq(verticalDramaSourcePacks.userId, owner.userId),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .limit(1);
  assertOwner(pack, owner);
  const [slots, assets, analyses] = await Promise.all([
    db
      .select()
      .from(verticalDramaSourceSlots)
      .where(
        and(
          eq(verticalDramaSourceSlots.packId, packId),
          eq(verticalDramaSourceSlots.tenantId, owner.tenantId),
          isNull(verticalDramaSourceSlots.deletedAt)
        )
      )
      .orderBy(
        asc(verticalDramaSourceSlots.sortOrder),
        asc(verticalDramaSourceSlots.id)
      ),
    db
      .select()
      .from(verticalDramaSourceAssets)
      .where(
        and(
          eq(verticalDramaSourceAssets.packId, packId),
          eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
          isNull(verticalDramaSourceAssets.deletedAt)
        )
      )
      .orderBy(desc(verticalDramaSourceAssets.createdAt)),
    db
      .select()
      .from(verticalDramaSourceAnalyses)
      .where(
        and(
          eq(verticalDramaSourceAnalyses.packId, packId),
          eq(verticalDramaSourceAnalyses.tenantId, owner.tenantId)
        )
      )
      .orderBy(desc(verticalDramaSourceAnalyses.updatedAt)),
  ]);
  const promptExpansionRun = await getLatestPromptExpansion(owner, {
    seriesId: pack.seriesId ?? undefined,
    draftSessionId: pack.draftSessionId ?? undefined,
  });
  const approvedPrompt =
    promptExpansionRun?.approvedJson &&
    typeof promptExpansionRun.approvedJson === "object" &&
    !Array.isArray(promptExpansionRun.approvedJson)
      ? (promptExpansionRun.approvedJson as {
          expandedPrompt?: unknown;
          slots?: unknown;
        })
      : null;
  const approvedSlots = Array.isArray(approvedPrompt?.slots)
    ? approvedPrompt.slots.filter(
        (slot): slot is { slotKey: string; required?: boolean } =>
          Boolean(
            slot &&
              typeof slot === "object" &&
              typeof (slot as Record<string, unknown>).slotKey === "string"
          )
      )
    : [];
  const promptExpansion = promptExpansionRun
    ? {
        status: promptExpansionRun.status,
        runId: Number(promptExpansionRun.id),
        revision: promptExpansionRun.revision,
        originalPromptHash: promptExpansionRun.originalPromptHash,
        expandedPrompt:
          typeof approvedPrompt?.expandedPrompt === "string"
            ? approvedPrompt.expandedPrompt
            : null,
        approvedSlotKeys: approvedSlots.map(slot => slot.slotKey),
      }
    : null;
  const profile = getSeriesProfile(pack.profileId);
  const readiness = evaluateSourcePackReadiness({
    profile,
    slots: slots.map((slot: VerticalDramaSourceSlot) => ({
      slotKey: slot.slotKey,
      required: slot.required,
      narrativeDescription: slot.narrativeDescription,
      sourceAssetId: slot.sourceAssetId,
      status: slot.status,
    })),
    assets: assets.map((asset: VerticalDramaSourceAsset) => ({
      id: asset.id,
      sourceKind: asset.sourceKind,
      mediaAssetId: asset.mediaAssetId,
      rightsStatus: asset.rightsStatus,
      disclosureStatus: asset.disclosureStatus,
      analysisStatus: asset.analysisStatus,
    })),
    promptExpansion:
      profile.sourceGatePolicy === "required"
        ? { approved: promptExpansion?.status === "applied" }
        : undefined,
  });
  return { pack, profile, slots, assets, analyses, readiness, promptExpansion };
}

async function assertPromptExpansionApplied(
  owner: SourcePackOwner,
  pack: { seriesId: number | null; draftSessionId: string | null }
) {
  const run = await getLatestPromptExpansion(owner, {
    seriesId: pack.seriesId ?? undefined,
    draftSessionId: pack.draftSessionId ?? undefined,
  });
  if (!run || run.status !== "applied") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "ขยายโจทย์และยืนยันผลใน dialog ก่อนจึงจะเพิ่มหรือแก้ไข slot และสื่อได้",
    });
  }
}

function getActivePromptSlots(input: {
  slots: VerticalDramaSourceSlot[];
  profile: VdSeriesProfile;
  promptExpansion: {
    status: string;
    approvedSlotKeys: string[];
  } | null;
}) {
  if (input.profile.sourceGatePolicy !== "required") return input.slots;
  if (input.promptExpansion?.status !== "applied") return [];
  const approvedKeys = new Set(input.promptExpansion.approvedSlotKeys);
  const defaultKeys = new Set(input.profile.defaultSlots.map(slot => slot.key));
  return input.slots.filter(
    slot =>
      approvedKeys.has(slot.slotKey) ||
      (slot.sourceKind === "custom" && !defaultKeys.has(slot.slotKey))
  );
}

/**
 * Remove only empty compatibility/default slots after the creator approves a
 * prompt-driven plan. Slots with attached media are preserved so legacy work
 * remains recoverable and is not silently deleted.
 */
export async function pruneUnapprovedPromptSlots(
  owner: SourcePackOwner,
  input: {
    packId: number;
    expectedPackVersion: number;
    approvedSlotKeys: string[];
  }
) {
  const current = await loadSourcePack(owner, input.packId);
  if (current.pack.version !== input.expectedPackVersion) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack changed; reload and retry",
    });
  }
  const approvedKeys = new Set(input.approvedSlotKeys);
  const staleSlotIds = current.slots
    .filter(
      (slot: VerticalDramaSourceSlot) =>
        slot.sourceKind === "custom" &&
        slot.sourceAssetId == null &&
        !approvedKeys.has(slot.slotKey)
    )
    .map((slot: VerticalDramaSourceSlot) => slot.id);
  if (!staleSlotIds.length) return current;

  await db.transaction(async tx => {
    await tx
      .update(verticalDramaSourceSlots)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(
        and(
          eq(verticalDramaSourceSlots.packId, input.packId),
          eq(verticalDramaSourceSlots.tenantId, owner.tenantId),
          inArray(verticalDramaSourceSlots.id, staleSlotIds),
          isNull(verticalDramaSourceSlots.deletedAt)
        )
      );
    const [updatedPack] = await tx
      .update(verticalDramaSourcePacks)
      .set({
        version: sql`${verticalDramaSourcePacks.version} + 1`,
        status: "needs_review",
        updatedAt: now(),
      })
      .where(
        and(
          eq(verticalDramaSourcePacks.id, input.packId),
          eq(verticalDramaSourcePacks.version, input.expectedPackVersion)
        )
      )
      .returning({ id: verticalDramaSourcePacks.id });
    if (!updatedPack) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Source pack changed; reload and retry",
      });
    }
  });
  return loadSourcePack(owner, input.packId);
}

export async function saveSourceSlot(
  owner: SourcePackOwner,
  input: VdSourceSlotInput & { packId: number; expectedPackVersion: number }
) {
  const parsed = verticalDramaSourceSlotInputSchema.parse(input);
  const current = await loadSourcePack(owner, input.packId);
  await assertPromptExpansionApplied(owner, current.pack);
  if (current.pack.version !== input.expectedPackVersion) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack changed; reload and retry",
    });
  }
  if (
    parsed.sourceAssetId &&
    !current.assets.some(
      (asset: VerticalDramaSourceAsset) => asset.id === parsed.sourceAssetId
    )
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source asset does not belong to this source pack",
    });
  }
  const values = {
    tenantId: owner.tenantId,
    userId: owner.userId,
    packId: input.packId,
    slotKey: parsed.slotKey,
    title: parsed.title,
    narrativeDescription: parsed.narrativeDescription ?? null,
    sourceKind: parsed.sourceKind,
    required: parsed.required,
    usagePolicy: parsed.usagePolicy,
    sortOrder: parsed.sortOrder,
    sourceAssetId: parsed.sourceAssetId ?? null,
    updatedAt: now(),
  };
  await db.transaction(async tx => {
    if (parsed.slotId) {
      const [updated] = await tx
        .update(verticalDramaSourceSlots)
        .set({
          ...values,
          version: sql`${verticalDramaSourceSlots.version} + 1`,
        })
        .where(
          and(
            eq(verticalDramaSourceSlots.id, parsed.slotId),
            eq(verticalDramaSourceSlots.packId, input.packId),
            eq(verticalDramaSourceSlots.version, parsed.version ?? 1)
          )
        )
        .returning();
      if (!updated)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Slot changed; reload and retry",
        });
    } else {
      if (current.slots.length >= MAX_SOURCE_PACK_SLOTS) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `A source pack can contain at most ${MAX_SOURCE_PACK_SLOTS} slots`,
        });
      }
      await tx.insert(verticalDramaSourceSlots).values(values);
    }
    const [updatedPack] = await tx
      .update(verticalDramaSourcePacks)
      .set({
        version: sql`${verticalDramaSourcePacks.version} + 1`,
        status: "needs_review",
        updatedAt: now(),
      })
      .where(
        and(
          eq(verticalDramaSourcePacks.id, input.packId),
          eq(verticalDramaSourcePacks.version, input.expectedPackVersion)
        )
      )
      .returning({ id: verticalDramaSourcePacks.id });
    if (!updatedPack) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Source pack changed; reload and retry",
      });
    }
  });
  return loadSourcePack(owner, input.packId);
}

export async function addSourceAsset(
  owner: SourcePackOwner,
  input: VdSourceAssetInput & { packId: number; expectedPackVersion: number }
) {
  const parsed = verticalDramaSourceAssetInputSchema.parse(input);
  const current = await loadSourcePack(owner, input.packId);
  await assertPromptExpansionApplied(owner, current.pack);
  if (current.pack.version !== input.expectedPackVersion)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack changed; reload and retry",
    });
  if (parsed.mediaAssetId) {
    const [mediaAsset] = await db
      .select({
        id: mediaAssets.id,
        storageKey: mediaAssets.storageKey,
        originalUrl: mediaAssets.originalUrl,
        status: mediaAssets.status,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, parsed.mediaAssetId),
          eq(mediaAssets.tenantId, owner.tenantId),
          eq(mediaAssets.userId, owner.userId)
        )
      )
      .limit(1);
    if (!mediaAsset) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Media asset does not belong to this owner",
      });
    }
    if (
      ["upload_image", "upload_video", "generated_reference"].includes(
        parsed.sourceKind,
      )
    ) {
      await assertR2StorageActive();
      const storageKey = normalizeManagedMediaKey(mediaAsset.storageKey);
      const provenanceKey =
        typeof parsed.provenance.storageKey === "string"
          ? normalizeManagedMediaKey(parsed.provenance.storageKey)
          : typeof parsed.provenance.uploadedUrl === "string" &&
              parsed.provenance.uploadedUrl.startsWith("/api/storage/files/")
            ? normalizeManagedMediaKey(
                parsed.provenance.uploadedUrl.slice(
                  "/api/storage/files/".length,
                ),
              )
            : null;
      if (
        mediaAsset.status !== "ready" ||
        !storageKey ||
        storageKey.startsWith("uploads/") ||
        provenanceKey !== storageKey ||
        parsed.provenance.managed !== true ||
        !(await canReadManagedStorageKey(storageKey, owner)) ||
        !(await storageExists(storageKey))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Image/video source media must be present in owner-scoped R2 storage",
        });
      }
    }
  } else if (
    ["upload_image", "upload_video", "generated_reference"].includes(
      parsed.sourceKind,
    )
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Image/video source media must be registered in media_assets before attaching",
    });
  }
  const provenance = parsed.provenance;
  if (provenance.managed === true) {
    const rawStorageKey =
      typeof provenance.storageKey === "string"
        ? provenance.storageKey
        : typeof provenance.uploadedUrl === "string" &&
            provenance.uploadedUrl.startsWith("/api/storage/files/")
          ? provenance.uploadedUrl.slice("/api/storage/files/".length)
          : undefined;
    const storageKey = rawStorageKey
      ? normalizeManagedMediaKey(rawStorageKey)
      : null;
    if (
      !storageKey ||
      !(await canReadManagedStorageKey(storageKey, owner)) ||
      !(await storageExists(storageKey))
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Managed source media could not be verified for this owner",
      });
    }
  }
  const result = await db.transaction(async tx => {
    if (parsed.clientMutationKey) {
      const [existing] = await tx
        .select()
        .from(verticalDramaSourceAssets)
        .where(
          and(
            eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
            eq(verticalDramaSourceAssets.userId, owner.userId),
            eq(verticalDramaSourceAssets.packId, input.packId),
            eq(
              verticalDramaSourceAssets.clientMutationKey,
              parsed.clientMutationKey
            ),
            isNull(verticalDramaSourceAssets.deletedAt)
          )
        )
        .limit(1);
      if (existing) return { asset: existing, reused: true };
    }
    if (current.assets.length >= MAX_SOURCE_PACK_ASSETS) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `A source pack can contain at most ${MAX_SOURCE_PACK_ASSETS} assets`,
      });
    }
    const [created] = await tx
      .insert(verticalDramaSourceAssets)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        packId: input.packId,
        clientMutationKey: parsed.clientMutationKey ?? null,
        sourceKind: parsed.sourceKind,
        title: parsed.title,
        description: parsed.description ?? null,
        mediaAssetId: parsed.mediaAssetId ?? null,
        provenanceJson: parsed.provenance,
        rightsStatus: parsed.rightsStatus,
        disclosureStatus: parsed.disclosureStatus,
        analysisStatus: "not_requested",
      })
      .returning();
    const [updatedPack] = await tx
      .update(verticalDramaSourcePacks)
      .set({
        version: sql`${verticalDramaSourcePacks.version} + 1`,
        status: "needs_review",
        updatedAt: now(),
      })
      .where(
        and(
          eq(verticalDramaSourcePacks.id, input.packId),
          eq(verticalDramaSourcePacks.version, input.expectedPackVersion)
        )
      )
      .returning({ id: verticalDramaSourcePacks.id });
    if (!updatedPack) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Source pack changed; reload and retry",
      });
    }
    return { asset: created, reused: false };
  });
  return {
    asset: result.asset,
    reused: result.reused,
    pack: await loadSourcePack(owner, input.packId),
  };
}

export async function getSourcePackReadiness(
  owner: SourcePackOwner,
  packId: number
) {
  return (await loadSourcePack(owner, packId)).readiness;
}

export async function setSourceAssetRights(
  owner: SourcePackOwner,
  input: {
    packId: number;
    sourceAssetId: number;
    expectedPackVersion: number;
    rightsStatus: VdSourceRightsStatus;
    disclosureStatus: VdSourceDisclosureStatus;
  }
) {
  const current = await loadSourcePack(owner, input.packId);
  if (current.pack.version !== input.expectedPackVersion) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack changed; reload and retry",
    });
  }
  await db.transaction(async tx => {
    const [updated] = await tx
      .update(verticalDramaSourceAssets)
      .set({
        rightsStatus: input.rightsStatus,
        disclosureStatus: input.disclosureStatus,
        updatedAt: now(),
      })
      .where(
        and(
          eq(verticalDramaSourceAssets.id, input.sourceAssetId),
          eq(verticalDramaSourceAssets.packId, input.packId),
          eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
          eq(verticalDramaSourceAssets.userId, owner.userId),
          isNull(verticalDramaSourceAssets.deletedAt)
        )
      )
      .returning();
    if (!updated)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Source asset not found",
      });
    const [pack] = await tx
      .update(verticalDramaSourcePacks)
      .set({
        version: sql`${verticalDramaSourcePacks.version} + 1`,
        status: "needs_review",
        updatedAt: now(),
      })
      .where(
        and(
          eq(verticalDramaSourcePacks.id, input.packId),
          eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
          eq(verticalDramaSourcePacks.userId, owner.userId),
          eq(verticalDramaSourcePacks.version, input.expectedPackVersion)
        )
      )
      .returning();
    if (!pack)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Source pack changed; reload and retry",
      });
  });
  return loadSourcePack(owner, input.packId);
}

export async function findAttachedSourcePackByIdempotencyKey(
  owner: SourcePackOwner,
  idempotencyKey: string
) {
  const [pack] = await db
    .select()
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
        eq(verticalDramaSourcePacks.userId, owner.userId),
        eq(verticalDramaSourcePacks.attachIdempotencyKey, idempotencyKey),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .limit(1);
  return pack ?? null;
}

export async function assertSourcePackDraftReady(
  owner: SourcePackOwner,
  packId: number
) {
  const result = await loadSourcePack(owner, packId);
  if (!result.readiness.textDraftAllowed)
    throw new VerticalDramaSourcePackNotReadyError(result.readiness);
  return result;
}

export async function assertSeriesSourcePackDraftReady(
  owner: SourcePackOwner,
  seriesId: number,
  profileId?: string
) {
  const [pack] = await db
    .select()
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.seriesId, seriesId),
        eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
        eq(verticalDramaSourcePacks.userId, owner.userId),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .limit(1);
  if (!pack) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Complete Story Sources & Media before drafting",
    });
  }
  if (profileId && pack.profileId !== profileId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Story profile and source pack do not match; reload the series",
    });
  }
  return assertSourcePackDraftReady(owner, Number(pack.id));
}

export async function buildStoredSourcePackDigest(
  owner: SourcePackOwner,
  packId: number
) {
  const result = await loadSourcePack(owner, packId);
  const activeSlots = getActivePromptSlots(result);
  return buildSourcePackDigest({
    packId,
    packVersion: result.pack.version,
    profile: result.profile,
    slots: activeSlots.map((slot: VerticalDramaSourceSlot) => ({
      slotKey: slot.slotKey,
      title: slot.title,
      narrativeDescription: slot.narrativeDescription,
      required: slot.required,
      sourceAssetId: slot.sourceAssetId,
      sourceKind: slot.sourceKind,
      usagePolicy: slot.usagePolicy,
    })),
    assets: result.assets.map((asset: VerticalDramaSourceAsset) => ({
      id: asset.id,
      title: asset.title,
      description: asset.description,
      provenance: asset.provenanceJson,
      rightsStatus: asset.rightsStatus,
      disclosureStatus: asset.disclosureStatus,
    })),
  });
}

export async function buildStoredSourcePackBrollManifest(
  owner: SourcePackOwner,
  packId: number
) {
  const result = await loadSourcePack(owner, packId);
  const activeSlots = getActivePromptSlots(result);
  const mediaAssetIds = result.assets
    .map((asset: VerticalDramaSourceAsset) => asset.mediaAssetId)
    .filter(
      (id: number | null): id is number =>
        typeof id === "number" && Number.isInteger(id) && id > 0
    );
  const ownedMediaAssetIds = new Set<number>();
  if (mediaAssetIds.length) {
    const ownedMediaAssets = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(
        and(
          inArray(mediaAssets.id, mediaAssetIds),
          eq(mediaAssets.tenantId, owner.tenantId),
          eq(mediaAssets.userId, owner.userId)
        )
      );
    for (const asset of ownedMediaAssets) ownedMediaAssetIds.add(asset.id);
  }
  const verifiedAssets = await Promise.all(
    result.assets.map(async (asset: VerticalDramaSourceAsset) => {
      const provenance = asset.provenanceJson;
      if (provenance?.managed !== true) {
        return {
          ...asset,
          mediaAssetId:
            asset.mediaAssetId && ownedMediaAssetIds.has(asset.mediaAssetId)
              ? asset.mediaAssetId
              : null,
        };
      }
      const rawStorageKey =
        typeof provenance.storageKey === "string"
          ? provenance.storageKey
          : typeof provenance.uploadedUrl === "string" &&
              provenance.uploadedUrl.startsWith("/api/storage/files/")
            ? provenance.uploadedUrl.slice("/api/storage/files/".length)
            : undefined;
      const storageKey = rawStorageKey
        ? normalizeManagedMediaKey(rawStorageKey)
        : null;
      const managedMediaVerified = Boolean(
        storageKey &&
        (await canReadManagedStorageKey(storageKey, owner)) &&
        (await storageExists(storageKey))
      );
      return {
        ...asset,
        mediaAssetId:
          asset.mediaAssetId && ownedMediaAssetIds.has(asset.mediaAssetId)
            ? asset.mediaAssetId
            : null,
        provenance: managedMediaVerified
          ? provenance
          : { ...provenance, managed: false },
      };
    })
  );
  return buildSourcePackBrollManifest({
    packId,
    packVersion: result.pack.version,
    profile: result.profile,
    slots: activeSlots.map((slot: VerticalDramaSourceSlot) => ({
      slotKey: slot.slotKey,
      title: slot.title,
      narrativeDescription: slot.narrativeDescription,
      sourceAssetId: slot.sourceAssetId,
      usagePolicy: slot.usagePolicy,
      sourceKind: slot.sourceKind,
    })),
    assets: verifiedAssets.map((asset: VerticalDramaSourceAsset) => ({
      id: asset.id,
      title: asset.title,
      mediaAssetId: asset.mediaAssetId,
      provenance: asset.provenanceJson,
      rightsStatus: asset.rightsStatus,
      disclosureStatus: asset.disclosureStatus,
    })),
  });
}

export async function buildStoredSeriesSourcePackBrollManifest(
  owner: SourcePackOwner,
  seriesId: number
) {
  const [pack] = await db
    .select({ id: verticalDramaSourcePacks.id })
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.seriesId, seriesId),
        eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
        eq(verticalDramaSourcePacks.userId, owner.userId),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .limit(1);
  if (!pack) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Series source pack not found",
    });
  }
  return buildStoredSourcePackBrollManifest(owner, Number(pack.id));
}

/**
 * Called inside the existing verticalDramaSeries.create transaction. It only
 * moves ownership and updates rows; it deliberately cannot upload media,
 * call providers, or charge credits.
 */
export async function attachStagedSourcePackInTransaction(
  tx: any,
  params: SourcePackOwner & {
    packId: number;
    draftSessionId: string;
    seriesId: number;
    idempotencyKey: string;
  }
) {
  const [pack] = await tx
    .select()
    .from(verticalDramaSourcePacks)
    .where(
      and(
        eq(verticalDramaSourcePacks.id, params.packId),
        eq(verticalDramaSourcePacks.tenantId, params.tenantId),
        eq(verticalDramaSourcePacks.userId, params.userId)
      )
    )
    .limit(1);
  assertOwner(pack, params);
  // Legacy Draft migration may have attached the pack to this exact Series
  // before the wizard is reopened. Treat that state as idempotent even when
  // the reopened client has a new attach key/session; never detach/reassign a
  // pack that already belongs to the same owner Series.
  if (pack.seriesId === params.seriesId) return pack;
  if (
    pack.attachIdempotencyKey === params.idempotencyKey &&
    pack.seriesId != null
  )
    return pack;
  if (pack.seriesId != null || pack.draftSessionId !== params.draftSessionId)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack is already attached or session does not match",
    });
  const [updated] = await tx
    .update(verticalDramaSourcePacks)
    .set({
      seriesId: params.seriesId,
      draftSessionId: null,
      attachIdempotencyKey: params.idempotencyKey,
      attachedAt: now(),
      status: "draft",
      updatedAt: now(),
    })
    .where(
      and(
        eq(verticalDramaSourcePacks.id, pack.id),
        isNull(verticalDramaSourcePacks.seriesId),
        eq(verticalDramaSourcePacks.draftSessionId, params.draftSessionId),
        isNull(verticalDramaSourcePacks.deletedAt)
      )
    )
    .returning();
  if (!updated)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Source pack attach lost a concurrent update",
    });
  await tx
    .update(verticalDramaSourcePackSessions)
    .set({ status: "claimed", claimedAt: now(), updatedAt: now() })
    .where(
      eq(verticalDramaSourcePackSessions.draftSessionId, params.draftSessionId)
    );
  return updated;
}
