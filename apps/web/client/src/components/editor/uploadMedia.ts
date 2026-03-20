/**
 * Shared media upload helper.
 * Converts a File to base64 and returns the data needed for tRPC uploadFile mutation.
 * This is a plain async function (not a hook) so it can be used from editor callbacks.
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ACCEPTED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"],
};

export interface UploadMediaResult {
  fileName: string;
  fileType: string;
  fileBase64: string;
}

export function validateMediaFile(
  file: File,
  mediaType: "image" | "video" | "audio",
): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File is too large (max 50MB).";
  }
  const accepted = ACCEPTED_TYPES[mediaType];
  if (accepted && !accepted.includes(file.type)) {
    return "Invalid file type.";
  }
  return null;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function getAcceptString(mediaType: "image" | "video" | "audio"): string {
  return (ACCEPTED_TYPES[mediaType] || []).join(",");
}
