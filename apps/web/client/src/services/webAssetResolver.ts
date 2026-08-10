/**
 * Web Asset Resolver
 * Handles uploading files to the server and resolving asset URIs
 * for the web platform (no local filesystem access).
 *
 * Upload strategy:
 * 1. Request presigned PUT URL from server (tiny JSON, passes through Cloudflare)
 * 2. If R2/S3: upload directly to storage via presigned URL (bypasses Cloudflare size limit)
 * 3. If local storage: fall back to multipart upload through server
 */

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

const ALLOWED_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "ogg", "flac", "aac",
  "srt", "vtt",
  "jpg", "jpeg", "png", "webp", "gif",
]);

type RemoteAssetMediaType = "audio" | "video" | "image";
type ResolvedAsset = { assetId: string; uri: string; mediaAssetId?: string };

export class WebAssetResolver {
  private cache = new Map<string, string>();
  private remoteImportCache = new Map<string, Promise<ResolvedAsset>>();

  /**
   * Upload a file to the server and return the assigned asset ID and URI.
   * @param file - File to upload
   * @param onProgress - Optional progress callback (percent: 0-100)
   * @returns Object with promise and abort function
   */
  uploadAsset(
    file: File,
    onProgress?: (percent: number) => void
  ): { promise: Promise<ResolvedAsset>; abort: () => void } {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `❌ File too large: ${(file.size / (1024 * 1024 * 1024)).toFixed(1)}GB exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`
      );
    }

    // Validate file extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `❌ Unsupported file type: .${ext}\nAllowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`
      );
    }

    let abortFn: (() => void) | null = null;

    const promise = (async () => {
      // Phase 1: Ask server for upload method
      const initRes = await fetch("/api/media-jobs/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({ error: initRes.statusText }));
        throw new Error(
          `❌ Upload init failed (${initRes.status}): ${err.error || initRes.statusText}`
        );
      }

      const initData = await initRes.json();

      if (initData.method === "multipart") {
        // Fallback: use multipart upload through server (for local storage)
        return this._uploadMultipart(file, onProgress, (abort) => {
          abortFn = abort;
        });
      }

      // Phase 2: Direct upload to presigned URL (bypasses Cloudflare)
      const { assetId, key, uploadUrl } = initData as {
        assetId: string;
        key: string;
        uploadUrl: string;
      };

      await this._uploadToPresignedUrl(file, uploadUrl, onProgress, (abort) => {
        abortFn = abort;
      });

      // Phase 3: Confirm upload and get public URI
      const completeRes = await fetch("/api/media-jobs/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assetId,
          key,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });

      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({ error: completeRes.statusText }));
        throw new Error(
          `❌ Upload complete failed (${completeRes.status}): ${err.error || completeRes.statusText}`
        );
      }

      const result = await completeRes.json();
      this.cache.set(result.assetId, result.uri);
      return {
        assetId: result.assetId,
        uri: result.uri,
        ...(result.mediaAssetId ? { mediaAssetId: String(result.mediaAssetId) } : {}),
      };
    })();

    return {
      promise,
      abort: () => {
        if (abortFn) abortFn();
      },
    };
  }

  importRemoteAsset(
    url: string,
    options: { mediaType: RemoteAssetMediaType },
  ): Promise<ResolvedAsset> {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      return Promise.reject(new Error("Missing remote asset URL"));
    }
    const cacheKey = `${options.mediaType}:${normalizedUrl}`;
    const cached = this.remoteImportCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
      const response = await fetch("/api/media-jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: normalizedUrl,
          mediaType: options.mediaType,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`❌ Remote asset import failed (${response.status}): ${err.error || response.statusText}`);
      }

      const result = await response.json();
      this.cache.set(result.assetId, result.uri);
      return {
        assetId: result.assetId,
        uri: result.uri,
        ...(result.mediaAssetId ? { mediaAssetId: String(result.mediaAssetId) } : {}),
      };
    })();

    this.remoteImportCache.set(cacheKey, promise);
    promise.catch(() => {
      this.remoteImportCache.delete(cacheKey);
    });
    return promise;
  }

  /**
   * Fallback: multipart upload through the server (for local storage).
   */
  private _uploadMultipart(
    file: File,
    onProgress?: (percent: number) => void,
    onAbortReady?: (abort: () => void) => void,
  ): Promise<ResolvedAsset> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      if (onAbortReady) onAbortReady(() => xhr.abort());

      const UPLOAD_TIMEOUT = 10 * 60 * 1000;
      const timeoutId = setTimeout(() => {
        xhr.abort();
        reject(
          new Error(
            `⏱️ Upload timeout: File too large or network too slow\n` +
              `File size: ${(file.size / (1024 * 1024)).toFixed(0)}MB\n` +
              `Tip: Try a smaller file or check your internet connection`
          )
        );
      }, UPLOAD_TIMEOUT);

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener("load", () => {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            this.cache.set(data.assetId, data.uri);
            resolve({
              assetId: data.assetId,
              uri: data.uri,
              ...(data.mediaAssetId ? { mediaAssetId: String(data.mediaAssetId) } : {}),
            });
          } catch {
            reject(new Error(`❌ Invalid server response: ${xhr.responseText}`));
          }
        } else {
          let errorMsg = "";
          try {
            errorMsg = JSON.parse(xhr.responseText).error || xhr.statusText;
          } catch {
            errorMsg = xhr.statusText;
          }

          if (xhr.status === 413) {
            reject(
              new Error(
                `❌ File too large (${(file.size / (1024 * 1024)).toFixed(0)}MB)\n` +
                  `Server rejected the upload. Maximum allowed: 2GB\n` +
                  `Error: ${errorMsg}`
              )
            );
          } else {
            reject(new Error(`❌ Upload failed (${xhr.status}): ${errorMsg}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `🔌 Network error: Failed to connect to server\n` +
              `Check your internet connection and try again`
          )
        );
      });

      xhr.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error(`⛔ Upload cancelled`));
      });

      xhr.open("POST", "/api/media-jobs/upload");
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  }

  /**
   * Direct upload to R2/S3 via presigned PUT URL.
   * Bypasses Cloudflare proxy entirely.
   */
  private _uploadToPresignedUrl(
    file: File,
    uploadUrl: string,
    onProgress?: (percent: number) => void,
    onAbortReady?: (abort: () => void) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (onAbortReady) onAbortReady(() => xhr.abort());

      // 30-minute timeout for very large files
      const UPLOAD_TIMEOUT = 30 * 60 * 1000;
      const timeoutId = setTimeout(() => {
        xhr.abort();
        reject(
          new Error(
            `⏱️ Upload timeout: File too large or network too slow\n` +
              `File size: ${(file.size / (1024 * 1024)).toFixed(0)}MB`
          )
        );
      }, UPLOAD_TIMEOUT);

      if (onProgress) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener("load", () => {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `❌ Direct upload failed (${xhr.status}): ${xhr.statusText}\n` +
                `The presigned URL may have expired. Try again.`
            )
          );
        }
      });

      xhr.addEventListener("error", () => {
        clearTimeout(timeoutId);
        reject(
          new Error(
            `🔌 Network error during direct upload to storage.\n` +
              `Check your internet connection and try again.`
          )
        );
      });

      xhr.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new Error(`⛔ Upload cancelled`));
      });

      // PUT raw file directly to R2/S3 (do NOT set withCredentials for cross-origin)
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.send(file);
    });
  }

  /**
   * Resolve a previously uploaded asset ID to its URI.
   * Returns undefined if not cached.
   */
  resolveAsset(assetId: string): string | undefined {
    return this.cache.get(assetId);
  }

  /**
   * Clear the in-memory URI cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.remoteImportCache.clear();
  }
}
