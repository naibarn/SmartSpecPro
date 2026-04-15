import crypto from "crypto";
import fs from "fs";
import path from "path";

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "../db";
import { storageDelete, storagePutFromPath } from "../storage";
import { desktopInstallerReleases, users } from "../../drizzle/schema";
import {
  desktopReleaseAssetSchema,
  desktopReleaseCatalogResponseSchema,
  type DesktopReleaseAsset,
  type DesktopReleaseCatalogResponse,
  type DesktopReleaseChannel,
  type DesktopReleaseInstallerFormat,
  type DesktopReleasePlatform,
} from "../../shared/desktopReleases";

type DesktopReleasePublicRow = {
  id: number;
  version: string;
  platform: string;
  channel: string;
  installerFormat: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number | bigint;
  fileSha256: string;
  releaseNotes: string | null;
  isPublished: boolean;
  publishedAt: Date | string | null;
  uploadedAt: Date | string;
  updatedAt: Date | string;
  uploadedByUserId: number | null;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
};

type DesktopReleaseStorageRow = {
  id: number;
  storageKey: string;
  fileName: string;
  contentType: string;
  isPublished: boolean;
};

const desktopReleaseSchemaStatements = [
  sql`
    CREATE TABLE IF NOT EXISTS "desktop_installer_releases" (
      "id" serial PRIMARY KEY NOT NULL,
      "version" varchar(64) NOT NULL,
      "platform" text NOT NULL,
      "channel" text NOT NULL DEFAULT 'stable',
      "installerFormat" text NOT NULL,
      "fileName" varchar(255) NOT NULL,
      "contentType" varchar(255) NOT NULL DEFAULT 'application/octet-stream',
      "storageKey" text NOT NULL,
      "fileSizeBytes" bigint NOT NULL,
      "fileSha256" varchar(64) NOT NULL,
      "releaseNotes" text,
      "isPublished" boolean NOT NULL DEFAULT true,
      "publishedAt" timestamp with time zone,
      "uploadedBy" integer,
      "uploadedAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "desktop_installer_releases_uploadedBy_users_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
    );
  `,
  sql`
    CREATE INDEX IF NOT EXISTS "idx_desktop_installer_releases_platform_published"
    ON "desktop_installer_releases" USING btree ("platform","isPublished","publishedAt");
  `,
  sql`
    CREATE INDEX IF NOT EXISTS "idx_desktop_installer_releases_version"
    ON "desktop_installer_releases" USING btree ("version");
  `,
  sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "desktop_installer_releases_storage_key_unique"
    ON "desktop_installer_releases" USING btree ("storageKey");
  `,
] as const;

let desktopReleaseSchemaReady = false;
let desktopReleaseSchemaReadyPromise: Promise<void> | null = null;

function isMissingDesktopReleaseTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /desktop_installer_releases/i.test(message) && /Failed query|does not exist|relation/i.test(message);
}

async function ensureDesktopReleaseSchema(): Promise<void> {
  if (desktopReleaseSchemaReady) {
    return;
  }

  if (!desktopReleaseSchemaReadyPromise) {
    desktopReleaseSchemaReadyPromise = (async () => {
      const drizzle = getDb();
      for (const statement of desktopReleaseSchemaStatements) {
        await drizzle.execute(statement);
      }
      desktopReleaseSchemaReady = true;
    })().finally(() => {
      desktopReleaseSchemaReadyPromise = null;
    });
  }

  await desktopReleaseSchemaReadyPromise;
}

export interface DesktopReleaseUploadInput {
  version: string;
  platform: DesktopReleasePlatform;
  channel?: DesktopReleaseChannel;
  installerFormat?: DesktopReleaseInstallerFormat;
  releaseNotes?: string | null;
  publish?: boolean;
  uploadedByUserId: number | null;
  filePath: string;
  fileName: string;
  contentType: string;
}

export interface DesktopReleaseUpdateInput {
  version?: string;
  platform?: DesktopReleasePlatform;
  channel?: DesktopReleaseChannel;
  installerFormat?: DesktopReleaseInstallerFormat;
  releaseNotes?: string | null;
  isPublished?: boolean;
}

function parseVersionSegments(version: string): string[] {
  return version
    .trim()
    .split(/[.+-]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function compareDesktopReleaseVersions(left: string, right: string): number {
  const leftSegments = parseVersionSegments(left);
  const rightSegments = parseVersionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index] ?? "0";
    const rightSegment = rightSegments[index] ?? "0";
    const leftNumeric = /^\d+$/.test(leftSegment);
    const rightNumeric = /^\d+$/.test(rightSegment);

    if (leftNumeric && rightNumeric) {
      const leftNumber = Number.parseInt(leftSegment, 10);
      const rightNumber = Number.parseInt(rightSegment, 10);
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }
      continue;
    }

    if (leftSegment !== rightSegment) {
      return leftSegment.localeCompare(rightSegment);
    }
  }

  return 0;
}

function sanitizeReleasePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 96) || "release";
}

function sanitizeReleaseFileName(value: string): string {
  const fileName = path.basename(value).trim();
  return fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 160) || "installer.bin";
}

export function createDesktopReleaseStorageKey(input: {
  version: string;
  platform: DesktopReleasePlatform;
  channel: DesktopReleaseChannel;
  fileName: string;
}): string {
  return [
    "desktop-releases",
    sanitizeReleasePathSegment(input.platform),
    sanitizeReleasePathSegment(input.channel),
    sanitizeReleasePathSegment(input.version),
    `${Date.now()}-${nanoid(10)}-${sanitizeReleaseFileName(input.fileName)}`,
  ].join("/");
}

function inferInstallerFormat(fileName: string): DesktopReleaseInstallerFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar_gz";
  if (lower.endsWith(".exe")) return "exe";
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".dmg")) return "dmg";
  if (lower.endsWith(".pkg")) return "pkg";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  if (lower.endsWith(".appimage")) return "appimage";
  if (lower.endsWith(".zip")) return "zip";
  return "other";
}

function toIsoDateString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function buildDownloadUrl(id: number): string {
  return `/api/desktop-releases/${id}/download`;
}

function mapPublicRow(row: DesktopReleasePublicRow): DesktopReleaseAsset {
  return desktopReleaseAssetSchema.parse({
    id: row.id,
    version: row.version,
    platform: row.platform,
    channel: row.channel,
    installerFormat: row.installerFormat,
    fileName: row.fileName,
    contentType: row.contentType,
    fileSizeBytes: toNumber(row.fileSizeBytes),
    fileSha256: row.fileSha256,
    releaseNotes: row.releaseNotes ?? null,
    isPublished: row.isPublished,
    publishedAt: toIsoDateString(row.publishedAt),
    uploadedAt: toIsoDateString(row.uploadedAt) ?? new Date().toISOString(),
    updatedAt: toIsoDateString(row.updatedAt) ?? new Date().toISOString(),
    uploadedByUserId: row.uploadedByUserId,
    uploadedByName: row.uploadedByName ?? row.uploadedByEmail ?? null,
    downloadUrl: buildDownloadUrl(row.id),
  });
}

function createEmptyDesktopReleaseCatalog(): DesktopReleaseCatalogResponse {
  return desktopReleaseCatalogResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    releases: [],
    latestByPlatform: {
      windows: null,
      macos: null,
      linux: null,
    },
  });
}

function sortReleasesDescending(left: DesktopReleaseAsset, right: DesktopReleaseAsset): number {
  const versionComparison = compareDesktopReleaseVersions(right.version, left.version);
  if (versionComparison !== 0) {
    return versionComparison;
  }

  const leftPublished = left.publishedAt ?? left.uploadedAt;
  const rightPublished = right.publishedAt ?? right.uploadedAt;
  const dateComparison = rightPublished.localeCompare(leftPublished);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  return right.id - left.id;
}

async function hashFileSha256(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function selectPublicRows(includeUnpublished: boolean): Promise<DesktopReleasePublicRow[]> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const query = drizzle
    .select({
      id: desktopInstallerReleases.id,
      version: desktopInstallerReleases.version,
      platform: desktopInstallerReleases.platform,
      channel: desktopInstallerReleases.channel,
      installerFormat: desktopInstallerReleases.installerFormat,
      fileName: desktopInstallerReleases.fileName,
      contentType: desktopInstallerReleases.contentType,
      fileSizeBytes: desktopInstallerReleases.fileSizeBytes,
      fileSha256: desktopInstallerReleases.fileSha256,
      releaseNotes: desktopInstallerReleases.releaseNotes,
      isPublished: desktopInstallerReleases.isPublished,
      publishedAt: desktopInstallerReleases.publishedAt,
      uploadedAt: desktopInstallerReleases.uploadedAt,
      updatedAt: desktopInstallerReleases.updatedAt,
      uploadedByUserId: desktopInstallerReleases.uploadedBy,
      uploadedByName: users.name,
      uploadedByEmail: users.email,
    })
    .from(desktopInstallerReleases)
    .leftJoin(users, eq(desktopInstallerReleases.uploadedBy, users.id));

  const rows = includeUnpublished
    ? await query
    : await query.where(eq(desktopInstallerReleases.isPublished, true));

  return rows as DesktopReleasePublicRow[];
}

async function selectStorageRow(id: number): Promise<DesktopReleaseStorageRow | null> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const [row] = await drizzle
    .select({
      id: desktopInstallerReleases.id,
      storageKey: desktopInstallerReleases.storageKey,
      fileName: desktopInstallerReleases.fileName,
      contentType: desktopInstallerReleases.contentType,
      isPublished: desktopInstallerReleases.isPublished,
    })
    .from(desktopInstallerReleases)
    .where(eq(desktopInstallerReleases.id, id))
    .limit(1);

  return row ? (row as DesktopReleaseStorageRow) : null;
}

export async function getDesktopReleaseAssetById(id: number): Promise<DesktopReleaseAsset | null> {
  const rows = await selectPublicRows(true);
  const match = rows.find((row) => row.id === id);
  return match ? mapPublicRow(match) : null;
}

export async function listDesktopReleaseCatalog(input: {
  includeUnpublished?: boolean;
  platform?: DesktopReleasePlatform | null;
} = {}): Promise<DesktopReleaseCatalogResponse> {
  let rows: DesktopReleasePublicRow[] = [];
  try {
    rows = await selectPublicRows(Boolean(input.includeUnpublished));
  } catch (error) {
    if (!isMissingDesktopReleaseTableError(error)) {
      console.warn("[desktop-releases] Falling back to empty catalog after query failure", error);
    }
    return createEmptyDesktopReleaseCatalog();
  }
  const mapped = rows
    .map(mapPublicRow)
    .filter((release) => !input.platform || release.platform === input.platform)
    .sort(sortReleasesDescending);

  const latestByPlatform: DesktopReleaseCatalogResponse["latestByPlatform"] = {
    windows: null,
    macos: null,
    linux: null,
  };

  for (const release of mapped) {
    if (latestByPlatform[release.platform] == null) {
      latestByPlatform[release.platform] = release;
    }
  }

  return desktopReleaseCatalogResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    releases: mapped,
    latestByPlatform,
  });
}

export async function persistDesktopReleaseUpload(input: DesktopReleaseUploadInput): Promise<DesktopReleaseAsset> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const fileSizeBytes = fs.statSync(input.filePath).size;
  const fileSha256 = await hashFileSha256(input.filePath);
  const channel = input.channel ?? "stable";
  const installerFormat = input.installerFormat ?? inferInstallerFormat(input.fileName);
  const publish = input.publish ?? true;
  const storageKey = createDesktopReleaseStorageKey({
    version: input.version,
    platform: input.platform,
    channel,
    fileName: input.fileName,
  });

  const stored = await storagePutFromPath(storageKey, input.filePath, input.contentType);

  try {
    const [created] = await drizzle
      .insert(desktopInstallerReleases)
      .values({
        version: input.version,
        platform: input.platform,
        channel,
        installerFormat,
        fileName: input.fileName,
        contentType: input.contentType,
        storageKey: stored.key,
        fileSizeBytes,
        fileSha256,
        releaseNotes: input.releaseNotes?.trim() ? input.releaseNotes.trim() : null,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
        uploadedBy: input.uploadedByUserId,
        uploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: desktopInstallerReleases.id });

    if (!created) {
      throw new Error("failed_to_create_desktop_release_record");
    }

    const loaded = await getDesktopReleaseAssetById(created.id);
    if (!loaded) {
      throw new Error("failed_to_load_desktop_release_record");
    }

    return loaded;
  } catch (error) {
    await storageDelete(stored.key).catch(() => undefined);
    throw error;
  }
}

export async function persistDesktopReleaseUploadFromStorage(input: {
  version: string;
  platform: DesktopReleasePlatform;
  channel?: DesktopReleaseChannel;
  installerFormat?: DesktopReleaseInstallerFormat;
  releaseNotes?: string | null;
  publish?: boolean;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  fileSha256: string;
  storageKey: string;
  uploadedByUserId: number | null;
}): Promise<DesktopReleaseAsset> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const channel = input.channel ?? "stable";
  const installerFormat = input.installerFormat ?? inferInstallerFormat(input.fileName);
  const publish = input.publish ?? true;

  if (!input.storageKey.startsWith("desktop-releases/")) {
    throw new Error("desktop_release_storage_key_invalid");
  }

  const [created] = await drizzle
    .insert(desktopInstallerReleases)
    .values({
      version: input.version,
      platform: input.platform,
      channel,
      installerFormat,
      fileName: input.fileName,
      contentType: input.contentType,
      storageKey: input.storageKey,
      fileSizeBytes: input.fileSizeBytes,
      fileSha256: input.fileSha256,
      releaseNotes: input.releaseNotes?.trim() ? input.releaseNotes.trim() : null,
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
      uploadedBy: input.uploadedByUserId,
      uploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: desktopInstallerReleases.id });

  if (!created) {
    throw new Error("failed_to_create_desktop_release_record");
  }

  const loaded = await getDesktopReleaseAssetById(created.id);
  if (!loaded) {
    throw new Error("failed_to_load_desktop_release_record");
  }

  return loaded;
}

export async function updateDesktopReleaseRecord(
  id: number,
  input: DesktopReleaseUpdateInput,
): Promise<DesktopReleaseAsset | null> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const current = await getDesktopReleaseAssetById(id);
  if (!current) {
    return null;
  }

  const nextPublished = input.isPublished === undefined ? current.isPublished : input.isPublished;

  await drizzle
    .update(desktopInstallerReleases)
    .set({
      version: input.version ?? current.version,
      platform: input.platform ?? current.platform,
      channel: input.channel ?? current.channel,
      installerFormat: input.installerFormat ?? current.installerFormat,
      releaseNotes:
        input.releaseNotes === undefined
          ? current.releaseNotes
          : input.releaseNotes?.trim() || null,
      isPublished: nextPublished,
      publishedAt:
        input.isPublished === undefined
          ? (current.publishedAt ? new Date(current.publishedAt) : null)
          : nextPublished
            ? new Date()
            : null,
      updatedAt: new Date(),
    })
    .where(eq(desktopInstallerReleases.id, id));

  return getDesktopReleaseAssetById(id);
}

export async function deleteDesktopReleaseRecord(id: number): Promise<boolean> {
  await ensureDesktopReleaseSchema();
  const drizzle = getDb();
  const current = await selectStorageRow(id);
  if (!current) {
    return false;
  }

  await drizzle
    .delete(desktopInstallerReleases)
    .where(eq(desktopInstallerReleases.id, id));

  await storageDelete(current.storageKey).catch(() => undefined);
  return true;
}

export async function getDesktopReleaseStorageInfo(
  id: number,
): Promise<DesktopReleaseStorageRow | null> {
  return selectStorageRow(id);
}
