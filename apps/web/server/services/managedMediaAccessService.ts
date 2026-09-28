import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";
import type { SignOptions } from "jsonwebtoken";
import { and, eq } from "drizzle-orm";
import { autoTeamArtifactRefs } from "../../drizzle/schema";
import { getDb } from "../db";
import { getUploadsDir, storageStreamFile } from "../storage";
import { signBearerToken, verifyBearerToken } from "../_core/tokens";

const FINAL_MEDIA_ACCESS_TTL = (process.env.WORK_OS_FINAL_MEDIA_TOKEN_TTL ??
  "15m") as SignOptions["expiresIn"];
const FINAL_MEDIA_ACCESS_TYPE = "work_os_final_media";
const FINAL_MEDIA_STORAGE_PREFIX = "auto-team-media/";

export type ManagedMediaRef =
  | { kind: "storage"; key: string }
  | { kind: "upload"; key: string };

export function normalizeManagedMediaKey(rawKey: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawKey);
  } catch {
    return null;
  }
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) return null;
  const stripped = decoded.replace(/^\/+/, "");
  if (!stripped || stripped.includes("..") || path.isAbsolute(stripped)) return null;
  const normalized = path.posix.normalize(stripped.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized !== stripped
  ) {
    return null;
  }
  return normalized;
}

export function parseManagedMediaUrl(value: string | null | undefined): ManagedMediaRef | null {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return null;
  if (url.includes("?") || url.includes("#")) return null;
  if (url.startsWith("/api/storage/files/")) {
    const key = normalizeManagedMediaKey(url.slice("/api/storage/files/".length));
    return key ? { kind: "storage", key } : null;
  }
  if (url.startsWith("/uploads/")) {
    const key = normalizeManagedMediaKey(url.slice("/uploads/".length));
    return key ? { kind: "upload", key } : null;
  }
  return null;
}

export function isProtectedAutoTeamMediaKey(key: string | null | undefined): boolean {
  const normalized = typeof key === "string" ? normalizeManagedMediaKey(key) : null;
  return Boolean(normalized?.startsWith(FINAL_MEDIA_STORAGE_PREFIX));
}

export function isManagedMediaFileKey(key: string | null | undefined): boolean {
  const normalized = typeof key === "string" ? normalizeManagedMediaKey(key) : null;
  if (!normalized) return false;
  return /\.(avif|gif|heic|heif|jpe?g|m4a|mkv|mov|mp3|mp4|oga|ogg|png|svg|wav|webm|webp)$/i.test(normalized);
}

export function resolveUploadsManagedPath(key: string): string | null {
  const normalized = normalizeManagedMediaKey(key);
  if (!normalized) return null;
  const uploadsDir = getUploadsDir();
  const resolved = path.resolve(uploadsDir, normalized);
  if (resolved !== uploadsDir && !resolved.startsWith(`${uploadsDir}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function signManagedMediaAccessUrl(input: {
  ref: ManagedMediaRef;
  tenantId: string;
  userId?: number | null;
  runId?: string | null;
}): string {
  if (input.userId == null) {
    throw new Error("managed_media_access_requires_user_binding");
  }
  const token = signBearerToken(
    {
      sub: String(input.userId),
      type: FINAL_MEDIA_ACCESS_TYPE,
      tenantId: input.tenantId,
      tokenUse: FINAL_MEDIA_ACCESS_TYPE,
      scopes: ["work-os:final-media:read"],
      jti: `wom_${Date.now()}_${crypto.randomBytes(10).toString("hex")}`,
      runtimeType: input.ref.kind,
      externalReference: input.ref.key,
      workerJobId: input.runId ?? undefined,
    },
    FINAL_MEDIA_ACCESS_TTL,
  );
  return `/api/work-os/final-media?token=${encodeURIComponent(token)}`;
}

async function assertFinalMediaTokenCanRead(input: {
  tenantId: string | null | undefined;
  runId: string | null | undefined;
  key: string;
}): Promise<boolean> {
  if (!input.tenantId || !input.runId) return false;
  const expectedPrefix = `${FINAL_MEDIA_STORAGE_PREFIX}${input.tenantId}/${input.runId}/`;
  if (!input.key.startsWith(expectedPrefix)) return false;

  const db = await getDb();
  if (!db) return false;
  const [artifact] = await db
    .select({ id: autoTeamArtifactRefs.id })
    .from(autoTeamArtifactRefs)
    .where(
      and(
        eq(autoTeamArtifactRefs.tenantId, input.tenantId),
        eq(autoTeamArtifactRefs.runId, input.runId),
        eq(autoTeamArtifactRefs.storageRef, input.key),
        eq(autoTeamArtifactRefs.artifactType, "final_result"),
        eq(autoTeamArtifactRefs.artifactRole, "result"),
      ),
    )
    .limit(1);
  return Boolean(artifact);
}

function assertSessionCanUseMediaToken(input: {
  req: Request;
  tokenSubject: unknown;
}): boolean {
  if (typeof input.tokenSubject !== "string" || input.tokenSubject === "work-os-media") {
    return false;
  }
  const sessionUser = (input.req as Request & {
    user?: { id?: unknown; role?: unknown };
  }).user;
  if (!sessionUser?.id) {
    return false;
  }
  return String(sessionUser.id) === input.tokenSubject;
}

export async function streamManagedMediaAccessToken(
  req: Request,
  res: Response,
): Promise<void> {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(401).json({ error: "Missing media access token" });
    return;
  }

  let claims: Awaited<ReturnType<typeof verifyBearerToken>>;
  try {
    claims = await verifyBearerToken(token);
  } catch {
    res.status(401).json({ error: "Invalid media access token" });
    return;
  }

  if (
    claims.type !== FINAL_MEDIA_ACCESS_TYPE ||
    claims.tokenUse !== FINAL_MEDIA_ACCESS_TYPE ||
    !claims.scopes?.includes("work-os:final-media:read") ||
    typeof claims.externalReference !== "string"
  ) {
    res.status(403).json({ error: "Media access token is not scoped for this file" });
    return;
  }

  if (!assertSessionCanUseMediaToken({ req, tokenSubject: claims.sub })) {
    res.status(403).json({ error: "Media access token is not bound to this session" });
    return;
  }

  const key = normalizeManagedMediaKey(claims.externalReference);
  const kind = claims.runtimeType === "upload" ? "upload" : "storage";
  if (!key) {
    res.status(400).json({ error: "Invalid media key" });
    return;
  }
  const runId = typeof claims.workerJobId === "string" ? claims.workerJobId : null;
  const canRead = await assertFinalMediaTokenCanRead({
    tenantId: claims.tenantId,
    runId,
    key,
  });
  if (!canRead) {
    res.status(403).json({ error: "Media access token is not authorized for this file" });
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (kind === "upload") {
    if (isManagedMediaFileKey(key)) {
      res.status(410).json({ error: "Legacy local media playback is disabled; durable R2 media is required" });
      return;
    }
    const filePath = resolveUploadsManagedPath(key);
    if (!filePath) {
      res.status(400).json({ error: "Invalid media path" });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.sendFile(filePath);
    return;
  }

  const result = await storageStreamFile(key, req.headers.range);
  if (!result) {
    res.status(404).json({ error: "File not found or storage not configured" });
    return;
  }

  res.status(result.isPartial ? 206 : 200);
  res.setHeader("Content-Type", result.contentType || "application/octet-stream");
  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (result.isPartial && result.rangeStart != null && result.rangeEnd != null) {
    res.setHeader(
      "Content-Range",
      `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalLength ?? "*"}`,
    );
    res.setHeader("Accept-Ranges", "bytes");
  }

  const nodeStream = result.stream as NodeJS.ReadableStream;
  if (typeof (nodeStream as any).pipe === "function") {
    (nodeStream as any).pipe(res);
    return;
  }
  const reader = (result.stream as ReadableStream).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    res.write(value);
  }
}
