/**
 * Web Asset Resolver
 * Handles uploading files to the server and resolving asset URIs
 * for the web platform (no local filesystem access).
 */

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

const ALLOWED_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "ogg", "flac", "aac",
  "srt", "vtt",
  "jpg", "jpeg", "png", "webp", "gif",
]);

export class WebAssetResolver {
  private cache = new Map<string, string>();

  /**
   * Upload a file to the server and return the assigned asset ID and URI.
   */
  async uploadAsset(file: File): Promise<{ assetId: string; uri: string }> {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`,
      );
    }

    // Validate file extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported file type: .${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
      );
    }

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/media-jobs/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }

    const data = await res.json();
    const { assetId, uri } = data;

    // Cache the resolved URI
    this.cache.set(assetId, uri);

    return { assetId, uri };
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
  }
}
