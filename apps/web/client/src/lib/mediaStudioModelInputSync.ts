export function inferMediaStudioModelInputSyncTarget(field: Record<string, any> | null | undefined): string {
  if (!field || typeof field !== "object") {
    return "none";
  }

  const rawSyncWith = String(field.syncWith ?? "").trim();
  if (rawSyncWith) {
    return rawSyncWith;
  }

  const type = String(field.type ?? "").trim().toLowerCase();
  if (type === "image_urls" || type === "audio_urls") {
    return "reference_images";
  }
  if (type === "video_urls") {
    return "reference_videos";
  }

  const normalizedKey = String(field.key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (
    normalizedKey === "negativeprompt"
    || normalizedKey === "negative"
    || normalizedKey.includes("negativeprompt")
  ) {
    return "none";
  }
  if (normalizedKey === "prompt" || normalizedKey.endsWith("prompt")) {
    return "prompt";
  }
  if (normalizedKey.includes("aspect") && normalizedKey.includes("ratio")) {
    return "aspect_ratio";
  }
  if (
    normalizedKey.includes("imageurls")
    || normalizedKey.includes("imageurl")
    || normalizedKey.includes("referenceimages")
    || normalizedKey.includes("referenceimage")
  ) {
    return "reference_images";
  }
  if (
    normalizedKey.includes("videourls")
    || normalizedKey.includes("videourl")
    || normalizedKey.includes("referencevideos")
    || normalizedKey.includes("referencevideo")
  ) {
    return "reference_videos";
  }

  return "none";
}
