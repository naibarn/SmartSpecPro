export interface ChatAttachmentReference {
  url: string;
  fileType?: string | null;
  type?: string | null;
}

const ATTACHED_IMAGE_REFERENCE_RE =
  /(?:ภาพที่แนบ|รูปที่แนบ|ไฟล์ภาพที่แนบ|ภาพแนบ|รูปแนบ|attached\s+image|uploaded\s+image|image\s+attached|แนบรูป|แนบภาพ)/i;

export function isImageAttachment(attachment: ChatAttachmentReference): boolean {
  const mime = attachment.fileType ?? attachment.type ?? "";
  return (
    mime.toLowerCase().startsWith("image/") ||
    /\.(?:png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(attachment.url)
  );
}

export function collectImageAttachmentUrls(
  attachments: ChatAttachmentReference[],
  limit = 5
): string[] {
  return attachments
    .filter(isImageAttachment)
    .map((attachment) => attachment.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .slice(0, limit);
}

export function shouldUseAttachedImagesAsReference(text: string): boolean {
  return ATTACHED_IMAGE_REFERENCE_RE.test(text);
}

export function mergeReferenceImagesIntoParams(
  params: Record<string, unknown>,
  referenceImageUrls: string[]
): Record<string, unknown> {
  if (referenceImageUrls.length === 0) {
    return params;
  }
  return {
    ...params,
    referenceImageUrls,
    reference_images: Array.isArray(params.reference_images)
      ? params.reference_images
      : referenceImageUrls,
  };
}
