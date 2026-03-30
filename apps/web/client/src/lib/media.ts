export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  const value = url.trim().toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/.test(value) || value.includes("video");
}
