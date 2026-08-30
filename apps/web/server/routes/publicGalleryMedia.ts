import { Router } from "express";
import type { Request, Response } from "express";

import { getGalleryItemById } from "../db";
import { storageStreamFile } from "../storage";
import {
  normalizeManagedMediaKey,
  parseManagedMediaUrl,
} from "../services/managedMediaAccessService";
import { normalizeGalleryTenantId } from "../services/galleryTenantScope";
import {
  getProtectedMediaEtag,
  matchesIfNoneMatch,
} from "../services/protectedMediaCache";
import {
  buildMediaContentDisposition,
  buildMediaDownloadFilename,
} from "@shared/mediaDisplayName";

type GalleryMediaVariant = "file" | "thumbnail";

function getRequestTenantId(req: Request): string | null {
  const rawTenantId = (req as Request & { tenantId?: string | number })
    .tenantId;
  const tenantId = String(rawTenantId ?? "").trim();
  return tenantId && tenantId.toLowerCase() !== "nan" ? tenantId : null;
}

function canReadPublishedGalleryItem(
  req: Request,
  item: { isPublished: boolean; tenantId: string | number | null }
): boolean {
  if (!item.isPublished) return false;

  // Null/legacy-NaN tenant gallery items are intentionally global public
  // showcase items. The live database contains legacy rows with tenantId
  // serialized as the string "NaN", so use the shared normalizer here too.
  const itemTenantId = normalizeGalleryTenantId(item.tenantId);
  if (itemTenantId == null) return true;

  return itemTenantId === normalizeGalleryTenantId(getRequestTenantId(req));
}

function getGalleryMediaValue(
  item: {
    fileKey: string | null;
    fileUrl: string | null;
    thumbnailKey: string | null;
    thumbnailUrl: string | null;
  },
  variant: GalleryMediaVariant
): { key: string | null; fallbackUrl: string | null } {
  const key =
    variant === "thumbnail"
      ? item.thumbnailKey || item.fileKey
      : item.fileKey || item.thumbnailKey;
  const storedUrl =
    variant === "thumbnail"
      ? item.thumbnailUrl || item.fileUrl
      : item.fileUrl || item.thumbnailUrl;

  const normalizedKey = key ? normalizeManagedMediaKey(key) : null;
  if (normalizedKey) {
    return { key: normalizedKey, fallbackUrl: null };
  }

  const managedRef = storedUrl ? parseManagedMediaUrl(storedUrl) : null;
  if (managedRef) {
    return { key: managedRef.key, fallbackUrl: null };
  }

  if (storedUrl && /^https?:\/\//i.test(storedUrl)) {
    return { key: null, fallbackUrl: storedUrl };
  }

  return { key: null, fallbackUrl: null };
}

async function pipeGalleryMedia(
  req: Request,
  res: Response,
  key: string,
  item: { title: string; type: string },
  download: boolean,
): Promise<void> {
  const result = await storageStreamFile(key, req.headers.range);
  if (!result) {
    res.status(404).json({ error: "Gallery media not found" });
    return;
  }

  const etag = getProtectedMediaEtag(result);
  if (matchesIfNoneMatch(req.headers["if-none-match"], etag)) {
    res.status(304).end();
    return;
  }

  res.status(result.isPartial ? 206 : 200);
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, stale-while-revalidate=86400"
  );
  res.setHeader("ETag", etag);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Type",
    result.contentType || "application/octet-stream"
  );
  res.setHeader("Accept-Ranges", "bytes");
  if (download) {
    const mediaType = item.type === "video" ? "video" : "image";
    const filename = buildMediaDownloadFilename({
      title: item.title,
      mediaType,
      sourceFilename: key,
    });
    res.setHeader("Content-Disposition", buildMediaContentDisposition(filename));
  }

  if (result.contentLength != null) {
    res.setHeader("Content-Length", String(result.contentLength));
  }
  if (
    result.isPartial &&
    result.rangeStart != null &&
    result.rangeEnd != null
  ) {
    res.setHeader(
      "Content-Range",
      `bytes ${result.rangeStart}-${result.rangeEnd}/${result.totalLength ?? "*"}`
    );
  }

  const stream = result.stream as NodeJS.ReadableStream | ReadableStream;
  if (typeof (stream as NodeJS.ReadableStream).pipe === "function") {
    (stream as NodeJS.ReadableStream).pipe(res);
    return;
  }

  const reader = (stream as ReadableStream).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      return;
    }
    res.write(value);
  }
}

/**
 * Public media delivery for published Gallery entries.
 *
 * The normal storage proxy is intentionally session/tenant protected. Gallery
 * entries are a separate public surface, so this route authorizes against the
 * published gallery row before streaming the referenced object and supports
 * byte ranges required by HTML5 video playback.
 */
export function createPublicGalleryMediaRouter(): Router {
  const router = Router();

  router.get("/:id/:variant", async (req, res) => {
    const id = Number(req.params.id);
    const variant = req.params.variant as GalleryMediaVariant;

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !["file", "thumbnail"].includes(variant)
    ) {
      res.status(400).json({ error: "Invalid gallery media reference" });
      return;
    }

    try {
      const item = await getGalleryItemById(id);
      if (!item || !canReadPublishedGalleryItem(req, item)) {
        res.status(404).json({ error: "Gallery media not found" });
        return;
      }

      const { key, fallbackUrl } = getGalleryMediaValue(item, variant);
      if (key) {
        await pipeGalleryMedia(
          req,
          res,
          key,
          { title: item.title, type: item.type },
          req.query.download === "1" && variant === "file",
        );
        return;
      }
      if (fallbackUrl) {
        res.redirect(302, fallbackUrl);
        return;
      }

      res.status(404).json({ error: "Gallery media not found" });
    } catch (error) {
      console.error(
        "[PublicGalleryMedia] Failed to stream gallery media",
        error
      );
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to load gallery media" });
      }
    }
  });

  return router;
}
