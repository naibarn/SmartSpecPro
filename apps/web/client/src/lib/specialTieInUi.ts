export type SpecialTieInStartMode = "fresh" | "resume";

function stableBriefText(value: unknown, maxLength = 360): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (/(ราคา|price|฿|\$|€|£|¥|บาท|\bthb\b|\busd\b|ส่วนลด|discount|coupon|voucher|โปรโมชั่น|promotion)/i.test(text)) {
    return "";
  }
  return text.slice(0, maxLength);
}

function stableBriefList(value: unknown, maxItems = 4): string[] {
  return Array.isArray(value)
    ? value
        .map(item => stableBriefText(item, 220))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

/** Builds a compact, price-free creative brief from a captured product and its saved AI insights. */
export function buildSpecialTieInMarketplaceProductBrief(
  value: unknown
): string {
  const product = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const supporting = product.supportingInsights && typeof product.supportingInsights === "object"
    ? product.supportingInsights as Record<string, unknown>
    : {};
  const summary = supporting.summary && typeof supporting.summary === "object"
    ? supporting.summary as Record<string, unknown>
    : {};
  const storytelling = supporting.storytelling && typeof supporting.storytelling === "object"
    ? supporting.storytelling as Record<string, unknown>
    : {};
  const storyOptions = Array.isArray(storytelling.storyOptions)
    ? storytelling.storyOptions.filter(option => option && typeof option === "object") as Record<string, unknown>[]
    : [];
  const recommendedStory = storyOptions.find(option => option.autoSelected === true || option.recommended === true)
    ?? storyOptions[0];
  const recommendedVideoBrief = recommendedStory?.videoBrief && typeof recommendedStory.videoBrief === "object"
    ? recommendedStory.videoBrief as Record<string, unknown>
    : {};
  const sceneTimeline = Array.isArray(recommendedVideoBrief.scenes)
    ? recommendedVideoBrief.scenes.map(scene => {
        const record = scene && typeof scene === "object" ? scene as Record<string, unknown> : {};
        return stableBriefText(record.sceneGoal ?? record.visualSuggestion ?? record.onScreenText, 140);
      }).filter(Boolean).slice(0, 3)
    : [];
  const productName = stableBriefText(product.productName, 240);
  const brand = stableBriefText(product.brand, 100);
  const category = stableBriefText(product.productCategory, 140);
  const shortSummary = stableBriefText(summary.shortSummary ?? product.descriptionText, 420);
  const recommendedStoryLine = recommendedStory
    ? [
        stableBriefText(recommendedStory.title, 140),
        stableBriefText(recommendedStory.hook, 180),
        stableBriefText(recommendedStory.useCase, 180),
      ].filter(Boolean).join(" — ")
    : "";
  const lines = [
    "โจทย์สร้างวิดีโอจากข้อมูลสินค้า (ข้อมูลสินค้าเป็นหลัก; ไม่ใช้ราคา/โปรโมชัน)",
    productName ? `สินค้า: ${productName}` : "",
    brand ? `แบรนด์: ${brand}` : "",
    category ? `หมวดสินค้า: ${category}` : "",
    shortSummary ? `สรุปสินค้า: ${shortSummary}` : "",
    ...stableBriefList(summary.sellingPoints).map(item => `จุดเด่นที่มีข้อมูลรองรับ: ${item}`),
    ...stableBriefList(summary.audiences, 2).map(item => `กลุ่มผู้ชม: ${item}`),
    ...stableBriefList(summary.contentAngles, 3).map(item => `แนววิดีโอ: ${item}`),
    ...stableBriefList(summary.hooks, 2).map(item => `แนวเปิดเรื่อง: ${item}`),
    recommendedStoryLine ? `แนวคิด AI ที่แนะนำ: ${recommendedStoryLine}` : "",
    ...sceneTimeline.map(item => `จังหวะวิดีโอ: ${item}`),
    "สร้างแนวคิดเรื่อง/วิดีโอที่ต่างกัน 3 แบบ ใช้ข้อมูลสินค้าและ AI insight เป็นเพียงทิศทางเสริม ห้ามเพิ่มข้อเท็จจริงที่ไม่มีหลักฐาน",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 2_000);
}

export function shouldLoadSpecialTieInHistory(input: {
  open: boolean;
  initialInput?: unknown;
  initialMode: SpecialTieInStartMode;
}): boolean {
  return (
    input.open && (input.initialInput != null || input.initialMode === "resume")
  );
}

export function canAddSpecialReferences(
  existingCount: number,
  incomingCount = 1
): boolean {
  return (
    existingCount >= 0 &&
    incomingCount >= 0 &&
    existingCount + incomingCount <= 3
  );
}

export function toggleBoundedSelection(
  current: readonly string[],
  id: string,
  max: number
): string[] {
  if (current.includes(id)) return current.filter(value => value !== id);
  return current.length >= max ? [...current] : [...current, id];
}

export function resolveSpecialTieInCharacterId(character: {
  characterId?: string | number;
  id?: string | number;
}): string {
  return String(character.characterId ?? character.id ?? "");
}

export function specialEpisodeLabel(
  sequence: number | null | undefined,
  lang: "th" | "en"
): string {
  return `${lang === "th" ? "ตอนพิเศษ" : "SPECIAL"} ${String(sequence ?? 0).padStart(2, "0")}`;
}
