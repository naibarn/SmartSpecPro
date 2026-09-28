import {
  sourceMediaSegmentSchema,
  visualCoverageRequirementSchema,
  visualSourceSlotSchema,
  visualSourceSnapshotSchema,
  type SourceMediaSegment,
  type VisualCoverageRequirement,
  type VisualSourceSlot,
  type VisualSourceSnapshot,
} from "@shared/verticalDramaSeries/visualSource";
import { visualSourceFingerprint } from "./verticalDramaVisualSourceCore";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaSourceMediaSegments,
  verticalDramaSourcePacks,
  verticalDramaVisualSourceSnapshots,
} from "../../drizzle/schema";
import { loadSourcePack } from "./verticalDramaSourcePackService";

export type VisualSnapshotOwner = { tenantId: string; userId: number };

export function createVisualSourceSnapshot(input: {
  snapshotId: string;
  revision: number;
  packId: number;
  seriesId?: number | null;
  profileId: string;
  profileVersion: number;
  slots: VisualSourceSlot[];
  segments: SourceMediaSegment[];
  coverage: VisualCoverageRequirement[];
  capturedAt?: string;
}): VisualSourceSnapshot {
  const slots = input.slots.map(slot => visualSourceSlotSchema.parse(slot));
  const segments = input.segments.map(segment => sourceMediaSegmentSchema.parse(segment));
  const coverage = input.coverage.map(requirement => visualCoverageRequirementSchema.parse(requirement));
  const identity = { packId: input.packId, seriesId: input.seriesId ?? null, profileId: input.profileId, profileVersion: input.profileVersion, slots, segments, coverage };
  return visualSourceSnapshotSchema.parse({
    ...identity,
    snapshotId: input.snapshotId,
    revision: input.revision,
    fingerprint: visualSourceFingerprint(identity),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  });
}

export function validateSnapshotForRun(snapshot: VisualSourceSnapshot, expected: { revision: number; fingerprint: string }): { ok: true } | { ok: false; code: "STALE_SOURCE_SNAPSHOT"; message: string } {
  if (snapshot.revision !== expected.revision || snapshot.fingerprint !== expected.fingerprint) {
    return { ok: false, code: "STALE_SOURCE_SNAPSHOT", message: "Visual source snapshot changed; restart this generation run" };
  }
  return { ok: true };
}

export function snapshotStaleReason(previous: VisualSourceSnapshot, current: VisualSourceSnapshot): string | null {
  if (previous.packId !== current.packId || previous.profileId !== current.profileId || previous.profileVersion !== current.profileVersion) return "source_pack_or_profile_changed";
  return previous.fingerprint === current.fingerprint ? null : "source_media_or_coverage_changed";
}

export async function persistVisualSourceSnapshot(owner: VisualSnapshotOwner, snapshot: VisualSourceSnapshot) {
  const [existing] = await db.select().from(verticalDramaVisualSourceSnapshots).where(and(
    eq(verticalDramaVisualSourceSnapshots.tenantId, owner.tenantId),
    eq(verticalDramaVisualSourceSnapshots.snapshotId, snapshot.snapshotId),
  )).limit(1);
  if (existing) {
    if (existing.fingerprint !== snapshot.fingerprint || Number(existing.revision) !== snapshot.revision) {
      throw new Error("Visual source snapshot identity is immutable");
    }
    return existing;
  }
  const [row] = await db.insert(verticalDramaVisualSourceSnapshots).values({
    snapshotId: snapshot.snapshotId,
    tenantId: owner.tenantId,
    userId: owner.userId,
    packId: snapshot.packId,
    seriesId: snapshot.seriesId,
    profileId: snapshot.profileId,
    profileVersion: snapshot.profileVersion,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
    snapshotJson: snapshot,
    coverageJson: snapshot.coverage,
    status: "approved",
  }).returning();
  if (!row) throw new Error("Could not persist visual source snapshot");
  return row;
}

function slotRole(slot: { usagePolicy: string; sourceKind: string }) {
  if (slot.usagePolicy === "broll") {
    return slot.sourceKind === "upload_video" ? "b_roll_footage" : "b_roll_still";
  }
  if (slot.sourceKind === "known_place" || slot.sourceKind === "coordinates") return "scene_anchor";
  return "reference";
}

function slotOrigin(slot: { sourceKind: string; mediaAssetId: number | null }) {
  if (slot.sourceKind === "generated_reference") return "ai_generated" as const;
  if (slot.sourceKind === "upload_image" || slot.sourceKind === "upload_video") return "user_upload" as const;
  return slot.mediaAssetId ? "existing_managed" as const : "web_import" as const;
}

/** Capture the current source pack as the immutable visual canon used by all
 * assurance callers. Optional profiles return null when no pack is attached;
 * required profiles fail through their existing source-pack gate instead. */
export async function captureSeriesVisualSourceSnapshot(
  owner: VisualSnapshotOwner,
  seriesId: number,
): Promise<VisualSourceSnapshot | null> {
  const [packRow] = await db
    .select({ id: verticalDramaSourcePacks.id })
    .from(verticalDramaSourcePacks)
    .where(and(
      eq(verticalDramaSourcePacks.seriesId, seriesId),
      eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
      eq(verticalDramaSourcePacks.userId, owner.userId),
      isNull(verticalDramaSourcePacks.deletedAt),
    ))
    .limit(1);
  if (!packRow) return null;
  const pack = await loadSourcePack(owner, Number(packRow.id));
  const segmentRows = (await db
    .select()
    .from(verticalDramaSourceMediaSegments)
    .where(and(
      eq(verticalDramaSourceMediaSegments.tenantId, owner.tenantId),
      eq(verticalDramaSourceMediaSegments.userId, owner.userId),
      eq(verticalDramaSourceMediaSegments.packId, Number(pack.pack.id)),
    ))
    .orderBy(desc(verticalDramaSourceMediaSegments.createdAt))) as Array<{
      sourceAssetId: number;
      segmentKey: string;
      revision: number;
      mediaType: string;
      inSeconds: number | null;
      outSeconds: number | null;
      displayDurationSeconds: number | null;
      label: string;
      description: string | null;
      evidenceScopeJson: string[];
      captureAt: Date | null;
      locationLabel: string | null;
      sourceLabel: string | null;
      audioPolicy: string;
      status: string;
    }>;
  const assets = pack.assets as Array<{
    id: number;
    sourceKind: string;
    mediaAssetId: number | null;
    rightsStatus: string;
    disclosureStatus: string;
  }>;
  const sourceSlots = pack.slots as Array<{
    id: number;
    slotKey: string;
    title: string;
    narrativeDescription: string | null;
    sourceKind: string;
    required: boolean;
    usagePolicy: string;
    sortOrder: number;
    sourceAssetId: number | null;
  }>;
  const assetById = new Map(assets.map(asset => [Number(asset.id), asset]));
  const slots = sourceSlots.map(slot => {
    const asset = slot.sourceAssetId ? assetById.get(Number(slot.sourceAssetId)) : undefined;
    const role = slotRole(slot);
    const mediaType = slot.sourceKind === "upload_video" ? "video" as const : "image" as const;
    return visualSourceSlotSchema.parse({
      slotId: String(slot.id),
      slotKey: slot.slotKey,
      title: slot.title,
      description: slot.narrativeDescription,
      semanticRole: role,
      mediaType,
      origin: slotOrigin({ sourceKind: asset?.sourceKind ?? slot.sourceKind, mediaAssetId: asset?.mediaAssetId ?? null }),
      evidenceStatus: slot.sourceKind === "generated_reference" ? "illustrative" : "needs_verification",
      sourceAssetId: asset?.id ?? null,
      mediaAssetId: asset?.mediaAssetId ?? null,
      segmentIds: segmentRows.filter(segment => Number(segment.sourceAssetId) === Number(asset?.id)).map(segment => segment.segmentKey),
      rightsStatus: asset?.rightsStatus ?? "pending",
      disclosureStatus: asset?.disclosureStatus ?? "not_required",
      required: slot.required,
      sortOrder: slot.sortOrder,
    });
  });
  const segments = segmentRows.map(segment => sourceMediaSegmentSchema.parse({
    segmentId: segment.segmentKey,
    sourceAssetId: Number(segment.sourceAssetId),
    revision: segment.revision,
    mediaType: segment.mediaType,
    inSeconds: segment.inSeconds,
    outSeconds: segment.outSeconds,
    displayDurationSeconds: segment.displayDurationSeconds,
    label: segment.label,
    description: segment.description,
    evidenceScope: segment.evidenceScopeJson ?? [],
    captureAt: segment.captureAt?.toISOString() ?? null,
    locationLabel: segment.locationLabel,
    sourceLabel: segment.sourceLabel,
    audioPolicy: segment.audioPolicy,
    status: segment.status,
  }));
  const coverage = sourceSlots.filter(slot => slot.required).map(slot => {
    const source = slots.find(candidate => candidate.slotKey === slot.slotKey);
    return visualCoverageRequirementSchema.parse({
      requirementId: `slot:${slot.slotKey}`,
      scope: "series",
      scopeKey: String(seriesId),
      description: slot.narrativeDescription || slot.title,
      allowedRoles: [source?.semanticRole ?? "reference"],
      allowedMediaTypes: [source?.mediaType ?? "image"],
      requiredEvidence: pack.profile.factPolicy === "required_sources" ? "needs_verification" : "none",
      required: true,
      fulfilledBySlotIds: source?.sourceAssetId ? [source.slotId] : [],
    });
  });
  const [latest] = await db.select().from(verticalDramaVisualSourceSnapshots).where(and(
    eq(verticalDramaVisualSourceSnapshots.tenantId, owner.tenantId),
    eq(verticalDramaVisualSourceSnapshots.userId, owner.userId),
    eq(verticalDramaVisualSourceSnapshots.packId, Number(pack.pack.id)),
  )).orderBy(desc(verticalDramaVisualSourceSnapshots.revision)).limit(1);
  const nextRevision = latest ? Number(latest.revision) + 1 : 1;
  const candidate = createVisualSourceSnapshot({
    snapshotId: `vdvs-${pack.pack.id}-${nextRevision}`,
    revision: nextRevision,
    packId: Number(pack.pack.id),
    seriesId,
    profileId: pack.profile.profileId,
    profileVersion: pack.profile.visualVersion,
    slots,
    segments,
    coverage,
  });
  if (latest && latest.fingerprint === candidate.fingerprint) {
    return visualSourceSnapshotSchema.parse(latest.snapshotJson);
  }
  await persistVisualSourceSnapshot(owner, candidate);
  return candidate;
}
