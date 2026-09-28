export type VerticalDramaStartFrameDropInput =
  | { kind: "url"; url: string }
  | {
      kind: "upload";
      fileName: string;
      fileType: string;
      fileBase64: string;
    };

export interface VerticalDramaStartFrameUploadResult {
  url: string;
  fileType?: string | null;
}

export function getBase64DataUrlByteLength(dataUrl: string): number | null {
  const match = /^data:[^;,]+;base64,([a-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match) return null;
  const base64 = match[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export async function resolveVerticalDramaStartFrameDrop(
  input: VerticalDramaStartFrameDropInput,
  upload: (payload: {
    fileName: string;
    fileType: string;
    fileBase64: string;
  }) => Promise<VerticalDramaStartFrameUploadResult>
): Promise<{ url: string; mimeType: string }> {
  if (input.kind === "url") {
    return { url: input.url, mimeType: "image/jpeg" };
  }

  const uploaded = await upload({
    fileName: input.fileName,
    fileType: input.fileType,
    fileBase64: input.fileBase64,
  });
  if (!uploaded.url) {
    throw new Error("Image upload did not return a URL");
  }
  return {
    url: uploaded.url,
    mimeType: uploaded.fileType || input.fileType,
  };
}

export async function replaceVerticalDramaStartFrame(
  input: VerticalDramaStartFrameDropInput,
  operations: {
    upload: Parameters<typeof resolveVerticalDramaStartFrameDrop>[1];
    resolveMediaAsset: (input: {
      url: string;
      mimeType: string;
    }) => Promise<{ mediaAssetId: string }>;
    setApprovedMediaAsset: (mediaAssetId: string) => Promise<unknown>;
  }
): Promise<void> {
  const durableImage = await resolveVerticalDramaStartFrameDrop(
    input,
    operations.upload
  );
  const resolved = await operations.resolveMediaAsset(durableImage);
  await operations.setApprovedMediaAsset(resolved.mediaAssetId);
}
