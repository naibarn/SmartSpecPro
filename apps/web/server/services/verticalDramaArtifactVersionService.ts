import { and, eq } from "drizzle-orm";

import { db } from "../db";
import {
  verticalDramaArtifactVersions,
  type VerticalDramaArtifactVersion,
} from "../../drizzle/schema";

export const VERTICAL_DRAMA_ARTIFACT_KINDS = [
  "raw_render",
  "protected_render",
] as const;
export type VerticalDramaArtifactKind =
  (typeof VERTICAL_DRAMA_ARTIFACT_KINDS)[number];

export const VERTICAL_DRAMA_ARTIFACT_STATUSES = [
  "processing",
  "available",
  "failed",
] as const;
export type VerticalDramaArtifactStatus =
  (typeof VERTICAL_DRAMA_ARTIFACT_STATUSES)[number];

export type UpsertVerticalDramaArtifactVersionInput = {
  tenantId: string;
  ownerUserId: number;
  seriesId: number;
  episodeId: number;
  renderJobId: string;
  sourceArtifactId?: string | null;
  protectionJobId?: string | null;
  protectionAssetId?: string | null;
  versionNumber: number;
  artifactKind: VerticalDramaArtifactKind;
  status: VerticalDramaArtifactStatus;
  storageRef: string;
  checksumSha256?: string | null;
  contentType?: string;
  durationSeconds?: number | null;
  shotCount?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type VerticalDramaArtifactVersionProjection = {
  id: string;
  versionNumber: number;
  artifactKind: VerticalDramaArtifactKind;
  status: VerticalDramaArtifactStatus;
  videoUrl?: string;
  protectionJobId?: string;
  protectionAssetId?: string;
  durationSeconds?: number;
  shotCount?: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
};

function toPlaybackUrl(storageRef: string): string {
  if (/^(https?:\/\/|\/)/i.test(storageRef)) return storageRef;
  return `/api/storage/files/${encodeURI(storageRef)}`;
}

export async function upsertVerticalDramaArtifactVersion(
  input: UpsertVerticalDramaArtifactVersionInput,
): Promise<VerticalDramaArtifactVersion> {
  const now = new Date();
  const availableAt = input.status === "available" ? now : null;
  const [row] = await db
    .insert(verticalDramaArtifactVersions)
    .values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      renderJobId: input.renderJobId,
      sourceArtifactId: input.sourceArtifactId ?? null,
      protectionJobId: input.protectionJobId ?? null,
      protectionAssetId: input.protectionAssetId ?? null,
      versionNumber: input.versionNumber,
      artifactKind: input.artifactKind,
      status: input.status,
      storageRef: input.storageRef,
      checksumSha256: input.checksumSha256 ?? null,
      contentType: input.contentType ?? "video/mp4",
      durationSeconds: input.durationSeconds ?? null,
      shotCount: input.shotCount ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
      availableAt,
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaArtifactVersions.tenantId,
        verticalDramaArtifactVersions.renderJobId,
        verticalDramaArtifactVersions.artifactKind,
      ],
      set: {
        sourceArtifactId: input.sourceArtifactId ?? null,
        protectionJobId: input.protectionJobId ?? null,
        protectionAssetId: input.protectionAssetId ?? null,
        status: input.status,
        storageRef: input.storageRef,
        checksumSha256: input.checksumSha256 ?? null,
        contentType: input.contentType ?? "video/mp4",
        durationSeconds: input.durationSeconds ?? null,
        shotCount: input.shotCount ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        updatedAt: now,
        ...(input.status === "available" ? { availableAt } : {}),
      },
    })
    .returning();
  if (!row) throw new Error("VERTICAL_DRAMA_ARTIFACT_VERSION_UPSERT_FAILED");
  return row;
}

export async function listVerticalDramaArtifactVersionProjections(input: {
  tenantId: string;
  ownerUserId: number;
  seriesId: number;
  episodeId: number;
  renderJobId: string;
}): Promise<VerticalDramaArtifactVersionProjection[]> {
  const rows = await db
    .select()
    .from(verticalDramaArtifactVersions)
    .where(and(
      eq(verticalDramaArtifactVersions.tenantId, input.tenantId),
      eq(verticalDramaArtifactVersions.ownerUserId, input.ownerUserId),
      eq(verticalDramaArtifactVersions.seriesId, input.seriesId),
      eq(verticalDramaArtifactVersions.episodeId, input.episodeId),
      eq(verticalDramaArtifactVersions.renderJobId, input.renderJobId),
    ));
  return rows
    .sort((left, right) => left.versionNumber - right.versionNumber)
    .map(row => ({
      id: row.id,
      versionNumber: row.versionNumber,
      artifactKind: row.artifactKind as VerticalDramaArtifactKind,
      status: row.status as VerticalDramaArtifactStatus,
      ...(row.status === "available" ? { videoUrl: toPlaybackUrl(row.storageRef) } : {}),
      ...(row.protectionJobId ? { protectionJobId: row.protectionJobId } : {}),
      ...(row.protectionAssetId ? { protectionAssetId: row.protectionAssetId } : {}),
      ...(row.durationSeconds != null ? { durationSeconds: row.durationSeconds } : {}),
      ...(row.shotCount != null ? { shotCount: row.shotCount } : {}),
      ...(row.errorCode ? { errorCode: row.errorCode } : {}),
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
      createdAt: row.createdAt.toISOString(),
    }));
}
