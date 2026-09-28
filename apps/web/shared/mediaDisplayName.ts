export type MediaDisplayType = "image" | "video" | "audio";

export interface MediaDisplayNameInput {
  mediaType: MediaDisplayType;
  prompt?: unknown;
  explicitTitle?: unknown;
  sourceFilename?: unknown;
  seriesTitle?: unknown;
  episodeNumber?: unknown;
  shotNumber?: unknown;
  clipNumber?: unknown;
  parameters?: unknown;
  resultData?: unknown;
}

export interface MediaDisplayNameResult {
  title: string;
  filename: string;
  extension: string;
}

const MAX_TITLE_LENGTH = 255;
const MAX_FILENAME_STEM_LENGTH = 150;
const MAX_METADATA_DEPTH = 7;

const TECHNICAL_NAME_PATTERN = /^(?:remotion[_-]render|remotion[_-]render[_-]mp4|media[_-]result|output)[\s._-]*/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function findFirstValue(
  sources: unknown[],
  keys: string[],
): string {
  const wanted = new Set(keys.map(normalizeKey));
  const visit = (value: unknown, depth: number): string => {
    if (depth > MAX_METADATA_DEPTH || value == null) return "";
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return "";
    }
    if (!isRecord(value)) return "";
    for (const [key, nested] of Object.entries(value)) {
      if (wanted.has(normalizeKey(key))) {
        const found = scalarText(nested);
        if (found) return found;
      }
    }
    for (const nested of Object.values(value)) {
      const found = visit(nested, depth + 1);
      if (found) return found;
    }
    return "";
  };

  for (const source of sources) {
    const found = visit(source, 0);
    if (found) return found;
  }
  return "";
}

function normalizeNumber(value: unknown): string {
  const text = scalarText(value);
  if (!text) return "";
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : text;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

function removeKnownExtension(value: string): string {
  return value.replace(/\.(?:avif|bmp|gif|jpe?g|m4a|mov|mp3|mp4|png|svg|wav|webm|webp)$/i, "");
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function promptTitle(prompt: string): string {
  const firstMeaningfulLine = prompt
    .split(/[\n.!?。！？]/, 1)[0]
    ?.replace(TECHNICAL_NAME_PATTERN, "")
    .trim();
  return normalizeTitle(firstMeaningfulLine || prompt);
}

function safeFilenameStem(value: string): string {
  const stem = removeKnownExtension(basename(value))
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "-")
    .replace(/[\\/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_FILENAME_STEM_LENGTH)
    .replace(/^-|-$/g, "");
  return stem || "media";
}

function extensionFromFilename(value: string): string {
  const match = basename(value).match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function defaultExtension(mediaType: MediaDisplayType): string {
  if (mediaType === "video") return "mp4";
  if (mediaType === "audio") return "mp3";
  return "png";
}

function resolveTitle(input: MediaDisplayNameInput): string {
  const sources = [input.parameters, input.resultData];
  const explicit =
    cleanText(input.explicitTitle) ||
    findFirstValue(sources, [
      "__media_display_title",
      "media_display_title",
      "mediaDisplayTitle",
      "displayTitle",
      "displayName",
    ]);
  if (explicit && !TECHNICAL_NAME_PATTERN.test(explicit)) {
    return normalizeTitle(explicit);
  }

  const seriesTitle =
    cleanText(input.seriesTitle) ||
    findFirstValue(sources, [
      "__media_series_title",
      "media_series_title",
      "mediaSeriesTitle",
      "seriesTitle",
      "series_title",
      "showTitle",
    ]);
  const episodeNumber =
    normalizeNumber(input.episodeNumber) ||
    normalizeNumber(
      findFirstValue(sources, [
        "__media_episode_number",
        "media_episode_number",
        "mediaEpisodeNumber",
        "episodeNumber",
        "episode_number",
      ]),
    );
  const shotNumber =
    normalizeNumber(input.shotNumber) ||
    normalizeNumber(
      findFirstValue(sources, [
        "__media_shot_number",
        "media_shot_number",
        "mediaShotNumber",
        "shotNumber",
        "shot_number",
        "__vd_shot_number",
      ]),
    );
  const clipNumber =
    normalizeNumber(input.clipNumber) ||
    normalizeNumber(
      findFirstValue(sources, [
        "__media_clip_number",
        "media_clip_number",
        "mediaClipNumber",
        "clipNumber",
        "clip_number",
        "__vd_clip_number",
      ]),
    );

  if (seriesTitle) {
    const episode = episodeNumber ? ` ตอนที่ ${episodeNumber}` : "";
    const shot = shotNumber ? `-${shotNumber}` : "";
    const clip = clipNumber ? ` คลิป ${clipNumber}` : "";
    return normalizeTitle(`${seriesTitle}${episode}${shot}${clip}`);
  }

  const sourceFilename =
    cleanText(input.sourceFilename) ||
    findFirstValue(sources, [
      "sourceFilename",
      "source_filename",
      "originalFilename",
      "original_filename",
      "fileName",
      "file_name",
      "filename",
    ]);
  if (sourceFilename && !TECHNICAL_NAME_PATTERN.test(sourceFilename)) {
    return normalizeTitle(removeKnownExtension(basename(sourceFilename)));
  }

  const prompt = cleanText(input.prompt);
  if (prompt && !TECHNICAL_NAME_PATTERN.test(prompt)) {
    return promptTitle(prompt);
  }

  return input.mediaType === "video"
    ? "วิดีโอที่สร้างใหม่"
    : input.mediaType === "audio"
      ? "เสียงที่สร้างใหม่"
      : "ภาพที่สร้างใหม่";
}

export function resolveMediaDisplayName(
  input: MediaDisplayNameInput,
): MediaDisplayNameResult {
  const title = resolveTitle(input);
  const sourceFilename =
    cleanText(input.sourceFilename) ||
    findFirstValue([input.parameters, input.resultData], [
      "sourceFilename",
      "source_filename",
      "originalFilename",
      "original_filename",
      "fileName",
      "file_name",
      "filename",
    ]);
  const extension =
    extensionFromFilename(sourceFilename) || defaultExtension(input.mediaType);
  return {
    title,
    filename: `${safeFilenameStem(title)}.${extension}`,
    extension,
  };
}

export function buildMediaDownloadFilename(input: {
  title: string;
  mediaType: MediaDisplayType;
  sourceFilename?: string | null;
}): string {
  const extension =
    extensionFromFilename(input.sourceFilename ?? "") ||
    defaultExtension(input.mediaType);
  return `${safeFilenameStem(normalizeTitle(input.title))}.${extension}`;
}

export function buildMediaContentDisposition(filename: string): string {
  const safeFilename = basename(filename)
    .replace(/[\u0000-\u001f\u007f"\\/]/g, "-")
    .replace(/-+/g, "-") || "download";
  const asciiFallback =
    safeFilename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "download";
  const encoded = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
