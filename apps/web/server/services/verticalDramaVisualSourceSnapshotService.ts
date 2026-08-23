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
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaVisualSourceSnapshots } from "../../drizzle/schema";

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
