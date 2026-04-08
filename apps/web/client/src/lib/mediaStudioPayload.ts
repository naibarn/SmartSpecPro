export interface MediaStudioReferenceImage {
  url: string;
  name?: string;
}

export interface MediaStudioReferenceVideo {
  url: string;
  name?: string;
}

export interface BuildMediaStudioCommonPayloadParams {
  prompt: string;
  model?: string;
  aspectRatio: string;
  referenceImages: MediaStudioReferenceImage[];
  referenceVideos?: MediaStudioReferenceVideo[];
  extraParams?: Record<string, unknown>;
  apiConfig?: Record<string, string>;
  resolution?: string;
}

export function buildMediaStudioCommonPayload(
  params: BuildMediaStudioCommonPayloadParams,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || undefined,
    originSurface: "media_studio",
    aspectRatio: params.aspectRatio,
    referenceImageUrls: params.referenceImages.length > 0
      ? params.referenceImages.map((image) => image.url)
      : undefined,
    referenceVideoUrls: params.referenceVideos && params.referenceVideos.length > 0
      ? params.referenceVideos.map((video) => video.url)
      : undefined,
    ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
    ...(params.apiConfig && Object.keys(params.apiConfig).length > 0 ? { apiConfig: params.apiConfig } : {}),
    ...(params.resolution ? { resolution: params.resolution } : {}),
  };

  return payload;
}
