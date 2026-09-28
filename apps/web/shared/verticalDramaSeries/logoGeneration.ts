import {
  parseSeriesWatermarkConfig,
  VD_WATERMARK_MARGIN_PX_DEFAULT,
  VD_WATERMARK_OPACITY_BOUNDS,
  VD_WATERMARK_SCALE_PCT_BOUNDS,
  type VdSeriesWatermarkConfig,
  type VdSeriesWatermarkSlot,
  type VdSeriesWatermarkSlotId,
} from "./textOverlay";

export const VD_LOGO_SLOT_IDS = ["primary", "secondary"] as const;

export type VerticalDramaLogoSlotId = (typeof VD_LOGO_SLOT_IDS)[number];

export function buildSeriesLogoPrompt(input: {
  slotId: VerticalDramaLogoSlotId;
  seriesTitle?: string;
  channelName?: string;
}): string {
  if (input.slotId === "primary") {
    const title = input.seriesTitle?.trim();
    if (!title) throw new Error("Series title is required");
    return `สร้าง logo แบบพื้นหลังโปร่งใส สำหรับซีรีย์แนวตั้งเรื่อง ${title}`;
  }

  const channelName = input.channelName?.trim();
  if (!channelName) throw new Error("Channel name is required");
  return `สร้าง logo แบบพื้นหลังโปร่งใส สำหรับชื่อช่องเฟสบุค ชื่อ  ${channelName}`;
}

export function defaultLogoWatermarkSlot(
  slotId: VdSeriesWatermarkSlotId = "primary"
): VdSeriesWatermarkSlot {
  return {
    enabled: false,
    type: "text",
    position: slotId === "secondary" ? "bottom_right" : "top_right",
    opacity: VD_WATERMARK_OPACITY_BOUNDS.default,
    scalePct: VD_WATERMARK_SCALE_PCT_BOUNDS.default,
    marginPx: VD_WATERMARK_MARGIN_PX_DEFAULT,
  };
}

export function patchGeneratedLogoSlot(
  config: VdSeriesWatermarkConfig | null | undefined,
  slotId: VerticalDramaLogoSlotId,
  imageUrl: string
): VdSeriesWatermarkConfig {
  const url = imageUrl.trim();
  if (!url) throw new Error("Generated logo URL is required");

  const parsed = parseSeriesWatermarkConfig(config);
  const base: VdSeriesWatermarkConfig = parsed ?? {
    ...defaultLogoWatermarkSlot("primary"),
  };
  const current =
    slotId === "primary"
      ? base
      : (base.secondary ?? defaultLogoWatermarkSlot("secondary"));
  const nextSlot: VdSeriesWatermarkSlot = {
    ...current,
    enabled: true,
    type: "image",
    imageUrl: url,
  };

  return slotId === "primary"
    ? { ...base, ...nextSlot }
    : { ...base, secondary: nextSlot };
}
