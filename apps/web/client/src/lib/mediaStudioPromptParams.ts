function normalizeAspectRatio(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function applyMediaStudioAspectRatioPromptParams(
  params: Record<string, unknown>,
  aspectRatio: unknown,
): void {
  const requestedAspectRatio = normalizeAspectRatio(aspectRatio);
  if (!requestedAspectRatio || requestedAspectRatio.toLowerCase() === "auto") {
    return;
  }

  params.aspect_ratio = requestedAspectRatio;
  params.aspectRatio = requestedAspectRatio;
}
