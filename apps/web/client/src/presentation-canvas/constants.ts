export interface PresentationCanvasPreset {
  id: PresentationCanvasPresetId;
  label: string;
  width: number;
  height: number;
}

export interface PresentationCanvasSize {
  preset: PresentationCanvasPresetId;
  width: number;
  height: number;
}

export type PresentationCanvasPresetId =
  | "9:16"
  | "16:9"
  | "4:3"
  | "3:4"
  | "4:5"
  | "5:4"
  | "1:1";

export const PRESENTATION_CANVAS_PRESETS: PresentationCanvasPreset[] = [
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
  { id: "4:5", label: "4:5", width: 960, height: 1200 },
  { id: "5:4", label: "5:4", width: 1250, height: 1000 },
  { id: "1:1", label: "1:1", width: 1080, height: 1080 },
];

export const DEFAULT_PRESENTATION_CANVAS_PRESET = PRESENTATION_CANVAS_PRESETS[0];
export const PRESENTATION_STAGE_WIDTH = DEFAULT_PRESENTATION_CANVAS_PRESET.width;
export const PRESENTATION_STAGE_HEIGHT = DEFAULT_PRESENTATION_CANVAS_PRESET.height;
export const DEFAULT_PRESENTATION_CANVAS_SIZE: PresentationCanvasSize = {
  preset: DEFAULT_PRESENTATION_CANVAS_PRESET.id,
  width: DEFAULT_PRESENTATION_CANVAS_PRESET.width,
  height: DEFAULT_PRESENTATION_CANVAS_PRESET.height,
};

export function getCanvasPresetById(id: string | undefined): PresentationCanvasPreset | null {
  if (!id) {
    return null;
  }
  return PRESENTATION_CANVAS_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function getCanvasPresetBySize(width: number, height: number): PresentationCanvasPreset | null {
  return PRESENTATION_CANVAS_PRESETS.find(
    (preset) => preset.width === width && preset.height === height,
  ) ?? null;
}

export function normalizeCanvasSize(input: unknown): PresentationCanvasSize {
  if (!input || typeof input !== "object") {
    return DEFAULT_PRESENTATION_CANVAS_SIZE;
  }

  const raw = input as Partial<PresentationCanvasSize>;
  const preset = getCanvasPresetById(raw.preset);
  const width = Number(raw.width);
  const height = Number(raw.height);

  const hasValidSize =
    Number.isFinite(width)
    && Number.isFinite(height)
    && width > 0
    && height > 0;

  if (hasValidSize) {
    const normalizedWidth = Math.round(width);
    const normalizedHeight = Math.round(height);
    const matchedPreset = getCanvasPresetBySize(normalizedWidth, normalizedHeight);
    return {
      preset: matchedPreset?.id ?? preset?.id ?? DEFAULT_PRESENTATION_CANVAS_SIZE.preset,
      width: normalizedWidth,
      height: normalizedHeight,
    };
  }

  if (preset) {
    return {
      preset: preset.id,
      width: preset.width,
      height: preset.height,
    };
  }

  return DEFAULT_PRESENTATION_CANVAS_SIZE;
}
