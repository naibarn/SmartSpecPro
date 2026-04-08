export type EditorialPlannerAudiencePreset = "parents" | "educators" | "healthcare";
export type EditorialPlannerTonePreset = "warm_parenting" | "premium_editorial" | "clinical_guidance";
export type EditorialPlannerFitPreset = "balanced" | "image_forward" | "text_safe";
export type EditorialPlannerPageCountMode = "auto" | "fixed";
export type EditorialPlannerCanvasRatio = "16:9" | "9:16" | "4:5" | "5:4";
export type EditorialPlannerLanguage = "th" | "en";
export type EditorialPlannerOutputFormat = "render_manifest_json";
export type EditorialPlannerImageAssetType = "image_prompt" | "uploaded_image";

export type EditorialPlannerJsonObject = Record<string, unknown>;

export interface EditorialPlannerQuickPreset {
  id: string;
  label: string;
  description: string;
  audience: EditorialPlannerAudiencePreset;
  tone: EditorialPlannerTonePreset;
  fit: EditorialPlannerFitPreset;
}

export interface EditorialPlannerImageAssetInput {
  asset_type: EditorialPlannerImageAssetType;
  label: string;
  page_hint?: number;
  prompt?: string;
  reference?: string;
}

export interface EditorialPlannerPageBriefInput {
  page_number: number;
  title_hint: string;
  text: string;
  page_role?: string;
}

export interface EditorialPlannerResolvedDefaults {
  target_audience: string;
  tone: string;
  global_style_prompt: string;
  render_safety: EditorialPlannerJsonObject;
  page_fill_rules: EditorialPlannerJsonObject;
  quality_optimizer: EditorialPlannerJsonObject;
}

export interface EditorialLayoutPlannerPayloadInput {
  articleTitle: string;
  articleBody: string;
  articleLanguage: EditorialPlannerLanguage;
  canvasRatio: EditorialPlannerCanvasRatio;
  imagePromptContext?: string | null;
  maxPages?: number;
  targetAudiencePreset?: EditorialPlannerAudiencePreset;
  tonePreset?: EditorialPlannerTonePreset;
  fitPreset?: EditorialPlannerFitPreset;
  pageCountMode?: EditorialPlannerPageCountMode;
  requestedPageCount?: number | null;
  globalStylePrompt?: string | null;
  renderSafety?: EditorialPlannerJsonObject | null;
  pageFillRules?: EditorialPlannerJsonObject | null;
  qualityOptimizer?: EditorialPlannerJsonObject | null;
  imageAssets?: EditorialPlannerImageAssetInput[];
  pageBriefs?: EditorialPlannerPageBriefInput[];
}

export const EDITORIAL_LAYOUT_PLANNER_SKILL_ID = "editorial-layout-planner";

export const EDITORIAL_PLANNER_QUICK_PRESETS: EditorialPlannerQuickPreset[] = [
  {
    id: "parenting_carousel",
    label: "คารูเซลเลี้ยงลูก",
    description: "โทนอุ่น อ่านง่าย สมดุลภาพกับข้อความ",
    audience: "parents",
    tone: "warm_parenting",
    fit: "balanced",
  },
  {
    id: "image_led_story",
    label: "ภาพเด่นข้อความน้อย",
    description: "ดันภาพให้เด่น เหมาะกับงานแนว editorial",
    audience: "parents",
    tone: "premium_editorial",
    fit: "image_forward",
  },
  {
    id: "mobile_story_9x16",
    label: "9:16 มือถือเต็มจอ",
    description: "เหมาะกับสไลด์แนวมือถือ ภาพเด่น พื้นที่แนวตั้งชัดเจน",
    audience: "parents",
    tone: "premium_editorial",
    fit: "image_forward",
  },
  {
    id: "pediatric_post",
    label: "โพสต์หมอเด็ก",
    description: "เหมาะกับคำแนะนำกุมารแพทย์หรือข้อมูลสุขภาพเด็ก",
    audience: "healthcare",
    tone: "clinical_guidance",
    fit: "text_safe",
  },
  {
    id: "mother_baby_lifestyle",
    label: "แม่และเด็ก lifestyle",
    description: "เน้นภาพและอารมณ์อบอุ่นสำหรับงานแม่และเด็ก",
    audience: "parents",
    tone: "premium_editorial",
    fit: "image_forward",
  },
  {
    id: "short_knowledge_cards",
    label: "คารูเซลความรู้สั้น",
    description: "เหมาะกับโพสต์สรุปประเด็นสั้น กระชับ อ่านง่าย",
    audience: "educators",
    tone: "warm_parenting",
    fit: "balanced",
  },
  {
    id: "longform_article",
    label: "บทความยาวหลายหน้า",
    description: "คุมการอ่านและการไหลของเนื้อหาให้เสถียรขึ้น",
    audience: "educators",
    tone: "premium_editorial",
    fit: "text_safe",
  },
  {
    id: "clinical_guide",
    label: "บทความเชิงแพทย์",
    description: "เน้นความชัดเจน ความน่าเชื่อถือ และการอ่าน",
    audience: "healthcare",
    tone: "clinical_guidance",
    fit: "text_safe",
  },
  {
    id: "educator_notes",
    label: "โพสต์ความรู้",
    description: "เหมาะกับครู ผู้ดูแล หรือสรุปความรู้แบบเป็นระบบ",
    audience: "educators",
    tone: "premium_editorial",
    fit: "balanced",
  },
];

function clampPageCount(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return 6;
  }
  return Math.max(1, Math.min(20, Math.round(Number(value))));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConfigObject(
  defaults: EditorialPlannerJsonObject,
  overrides?: EditorialPlannerJsonObject | null,
): EditorialPlannerJsonObject {
  if (!isPlainObject(overrides)) {
    return { ...defaults };
  }
  return {
    ...defaults,
    ...overrides,
  };
}

export function getEditorialPlannerPageSizeOrRatio(
  canvasRatio: EditorialPlannerCanvasRatio,
): string {
  switch (canvasRatio) {
    case "16:9":
      return "1920x1080";
    case "9:16":
      return "1080x1920";
    case "5:4":
      return "1350x1080";
    case "4:5":
    default:
      return "1080x1350";
  }
}

export function inferRecommendedEditorialPlannerPreset(params: {
  canvasRatio: EditorialPlannerCanvasRatio;
  language: EditorialPlannerLanguage;
  topic: string;
}): EditorialPlannerQuickPreset {
  const normalizedTopic = params.topic.toLowerCase();

  if (/(หมอเด็ก|กุมาร|กุมารแพทย์|วัคซีน|ไข้|โรค|อาการ|แนวทางรักษา|medical|doctor|pediatric|clinic|healthcare)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "pediatric_post")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[3]!;
  }

  if (/(doctor|medical|clinic|health|hospital|แพทย์|หมอ|คลินิก|สุขภาพ|การแพทย์)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "clinical_guide")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[7]!;
  }

  if (/(teacher|school|lesson|classroom|educat|ครู|โรงเรียน|บทเรียน|การสอน|ความรู้)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "educator_notes")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[8]!;
  }

  if (params.canvasRatio === "9:16") {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "mobile_story_9x16")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[2]!;
  }

  if (/(แม่และเด็ก|คุณแม่|ลูกน้อย|ทารก|เด็กเล็ก|nursery|mother|baby|parenting)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "mother_baby_lifestyle")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[4]!;
  }

  if (/(สรุป|เช็กลิสต์|ข้อควรรู้|ประเด็น|quick tips|tips|summary|carousel)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "short_knowledge_cards")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[5]!;
  }

  if (/(คู่มือ|แนวทาง|ฉบับเต็ม|ละเอียด|หลายหน้า|คู่มือฉบับยาว|longform|guide|handbook)/i.test(params.topic)) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "longform_article")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[6]!;
  }

  if (
    params.canvasRatio === "4:5"
    || /(editorial|lifestyle|story|เล่าเรื่อง|ภาพ|คารูเซล|โพสต์)/i.test(normalizedTopic)
  ) {
    return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "image_led_story")
      ?? EDITORIAL_PLANNER_QUICK_PRESETS[1]!;
  }

  return EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => preset.id === "parenting_carousel")
    ?? EDITORIAL_PLANNER_QUICK_PRESETS[0]!;
}

export function getEditorialPlannerResolvedDefaults(input: {
  canvasRatio: EditorialPlannerCanvasRatio;
  language: EditorialPlannerLanguage;
  imagePromptContext?: string | null;
  targetAudiencePreset?: EditorialPlannerAudiencePreset;
  tonePreset?: EditorialPlannerTonePreset;
  fitPreset?: EditorialPlannerFitPreset;
  globalStylePrompt?: string | null;
  renderSafety?: EditorialPlannerJsonObject | null;
  pageFillRules?: EditorialPlannerJsonObject | null;
  qualityOptimizer?: EditorialPlannerJsonObject | null;
}): EditorialPlannerResolvedDefaults {
  const targetAudiencePreset = input.targetAudiencePreset ?? "parents";
  const tonePreset = input.tonePreset ?? "warm_parenting";
  const fitPreset = input.fitPreset ?? "balanced";
  const targetAudience = targetAudiencePreset === "educators"
    ? input.language === "th" ? "ครูและผู้ดูแลเด็ก" : "educators and caregivers"
    : targetAudiencePreset === "healthcare"
      ? input.language === "th" ? "บุคลากรทางการแพทย์และครอบครัว" : "healthcare professionals and families"
      : input.language === "th" ? "พ่อแม่มือใหม่" : "new parents";
  const tone = tonePreset === "premium_editorial"
    ? "premium editorial, calm, polished, lifestyle-led parenting"
    : tonePreset === "clinical_guidance"
      ? "clear, trustworthy, calm, evidence-aware parenting guidance"
      : "warm, calm, premium parenting editorial";
  const toneStylePrompt = tonePreset === "premium_editorial"
    ? "Premium editorial photography, elegant natural light, refined parenting lifestyle, soft neutral palette, no text, no logos, no watermark."
    : tonePreset === "clinical_guidance"
      ? "Trustworthy healthcare editorial photography, calm daylight, clean nursery or clinic-like setting, reassuring parenting guidance mood, no text, no logos, no watermark."
      : "Warm editorial photography, soft warm daylight, cozy nursery, calm nurturing mood, no text, no logos, no watermark.";
  const globalStylePrompt = String(input.globalStylePrompt ?? "").trim()
    || [toneStylePrompt, String(input.imagePromptContext ?? "").trim()].filter(Boolean).join(" ");

  const renderSafetyDefaults = fitPreset === "image_forward"
    ? {
        safe_margin_px: input.canvasRatio === "9:16" ? 52 : 44,
        min_body_font_px: input.canvasRatio === "9:16" ? 28 : 26,
        max_body_font_px: input.canvasRatio === "9:16" ? 36 : 34,
        min_headline_font_px: input.canvasRatio === "9:16" ? 54 : 50,
        max_headline_font_px: input.canvasRatio === "9:16" ? 86 : 82,
        max_chars_per_line: input.language === "th" ? 24 : 26,
        strict_no_overlap: true,
        allow_repaginate: true,
        allow_reduce_image_area: false,
        fit_strategy: "reduce_image_first",
      }
    : fitPreset === "text_safe"
      ? {
          safe_margin_px: input.canvasRatio === "9:16" ? 60 : 52,
          min_body_font_px: input.canvasRatio === "9:16" ? 30 : 28,
          max_body_font_px: input.canvasRatio === "9:16" ? 38 : 36,
          min_headline_font_px: input.canvasRatio === "9:16" ? 58 : 54,
          max_headline_font_px: input.canvasRatio === "9:16" ? 88 : 84,
          max_chars_per_line: input.language === "th" ? 24 : 26,
          strict_no_overlap: true,
          allow_repaginate: true,
          allow_reduce_image_area: true,
          fit_strategy: "repaginate_first",
        }
      : {
          safe_margin_px: input.canvasRatio === "9:16" ? 56 : 48,
          min_body_font_px: input.canvasRatio === "9:16" ? 30 : 28,
          max_body_font_px: input.canvasRatio === "9:16" ? 38 : 36,
          min_headline_font_px: input.canvasRatio === "9:16" ? 56 : 52,
          max_headline_font_px: input.canvasRatio === "9:16" ? 88 : 84,
          max_chars_per_line: input.language === "th" ? 26 : 28,
          strict_no_overlap: true,
          allow_repaginate: true,
          allow_reduce_image_area: true,
          fit_strategy: "balanced",
        };

  const pageFillDefaults = fitPreset === "image_forward"
    ? {
        target_occupancy_min: 0.84,
        target_occupancy_max: 0.94,
        whitespace_ceiling: 0.12,
        cover_whitespace_ceiling: 0.2,
        closing_whitespace_ceiling: 0.18,
        allow_callout_injection: true,
        allow_keypoint_box_injection: true,
      }
    : fitPreset === "text_safe"
      ? {
          target_occupancy_min: 0.74,
          target_occupancy_max: 0.88,
          whitespace_ceiling: 0.2,
          cover_whitespace_ceiling: 0.26,
          closing_whitespace_ceiling: 0.22,
          allow_callout_injection: true,
          allow_keypoint_box_injection: true,
        }
      : {
          target_occupancy_min: input.canvasRatio === "9:16" ? 0.82 : 0.78,
          target_occupancy_max: 0.92,
          whitespace_ceiling: input.canvasRatio === "9:16" ? 0.14 : 0.18,
          cover_whitespace_ceiling: 0.24,
          closing_whitespace_ceiling: 0.22,
          allow_callout_injection: true,
          allow_keypoint_box_injection: true,
        };

  const qualityOptimizerDefaults = fitPreset === "image_forward"
    ? {
        enable_layout_fitness_scoring: true,
        enable_auto_template_switch: true,
        enable_post_layout_optimizer: true,
        underfill_action_priority: ["expand_image", "switch_template", "expand_text", "inject_keypoints"],
        overfill_action_priority: ["wrap_text", "continue_to_next_page", "repaginate", "reduce_image_area"],
      }
    : fitPreset === "text_safe"
      ? {
          enable_layout_fitness_scoring: true,
          enable_auto_template_switch: true,
          enable_post_layout_optimizer: true,
          underfill_action_priority: ["expand_text", "expand_image", "inject_keypoints", "switch_template"],
          overfill_action_priority: ["continue_to_next_page", "repaginate", "wrap_text", "reduce_image_area"],
        }
      : {
          enable_layout_fitness_scoring: true,
          enable_auto_template_switch: true,
          enable_post_layout_optimizer: true,
          underfill_action_priority: ["expand_image", "expand_text", "inject_keypoints", "switch_template"],
          overfill_action_priority: ["wrap_text", "reduce_image_area", "continue_to_next_page", "repaginate"],
        };

  return {
    target_audience: targetAudience,
    tone,
    global_style_prompt: globalStylePrompt,
    render_safety: mergeConfigObject(renderSafetyDefaults, input.renderSafety),
    page_fill_rules: mergeConfigObject(pageFillDefaults, input.pageFillRules),
    quality_optimizer: mergeConfigObject(qualityOptimizerDefaults, input.qualityOptimizer),
  };
}

export function normalizeEditorialPlannerImageAssets(
  assets: EditorialPlannerImageAssetInput[] | null | undefined,
): EditorialPlannerImageAssetInput[] {
  if (!Array.isArray(assets)) {
    return [];
  }
  const normalized: EditorialPlannerImageAssetInput[] = [];
  for (const asset of assets) {
    const assetType = asset?.asset_type === "uploaded_image" ? "uploaded_image" : "image_prompt";
    const label = String(asset?.label ?? "").trim();
    const prompt = String(asset?.prompt ?? "").trim();
    const reference = String(asset?.reference ?? "").trim();
    const pageHint = Number.isFinite(asset?.page_hint) ? clampPageCount(Number(asset.page_hint)) : undefined;
    if (assetType === "uploaded_image") {
      if (!reference) {
        continue;
      }
      normalized.push({
        asset_type: "uploaded_image",
        label: label || "Uploaded image",
        ...(typeof pageHint === "number" ? { page_hint: pageHint } : {}),
        reference,
        ...(prompt ? { prompt } : {}),
      });
      continue;
    }
    if (!prompt) {
      continue;
    }
    normalized.push({
      asset_type: "image_prompt",
      label: label || "Image prompt",
      ...(typeof pageHint === "number" ? { page_hint: pageHint } : {}),
      prompt,
      ...(reference ? { reference } : {}),
    });
  }
  return normalized;
}

export function buildEditorialLayoutPlannerPayload(
  input: EditorialLayoutPlannerPayloadInput,
): Record<string, unknown> {
  const pageBriefs = Array.isArray(input.pageBriefs)
    ? input.pageBriefs.flatMap((brief) => {
        const pageNumber = clampPageCount(Number(brief?.page_number ?? NaN));
        const titleHint = String(brief?.title_hint ?? "").trim();
        const text = String(brief?.text ?? "").trim();
        if (!titleHint && !text) {
          return [];
        }
        const normalizedBrief: Record<string, unknown> = {
          page_number: pageNumber,
          title_hint: titleHint || `Page ${pageNumber}`,
          text,
        };
        const pageRole = String(brief?.page_role ?? "").trim();
        if (pageRole) {
          normalizedBrief.page_role = pageRole;
        }
        return [normalizedBrief];
      })
    : [];
  const requestedPageCount = clampPageCount(
    input.requestedPageCount
      ?? (pageBriefs.length > 0 ? pageBriefs.length : input.maxPages)
      ?? 6,
  );
  const pageCountMode = input.pageCountMode === "fixed" || pageBriefs.length > 0
    ? "fixed"
    : "auto";
  const defaults = getEditorialPlannerResolvedDefaults({
    canvasRatio: input.canvasRatio,
    language: input.articleLanguage,
    imagePromptContext: input.imagePromptContext,
    targetAudiencePreset: input.targetAudiencePreset,
    tonePreset: input.tonePreset,
    fitPreset: input.fitPreset,
    globalStylePrompt: input.globalStylePrompt,
    renderSafety: input.renderSafety,
    pageFillRules: input.pageFillRules,
    qualityOptimizer: input.qualityOptimizer,
  });
  const payload: Record<string, unknown> = {
    article_title: String(input.articleTitle ?? "").trim(),
    article_body: String(input.articleBody ?? "").trim(),
    article_language: input.articleLanguage,
    target_audience: defaults.target_audience,
    tone: defaults.tone,
    page_size_or_ratio: getEditorialPlannerPageSizeOrRatio(input.canvasRatio),
    page_count_mode: pageCountMode,
    global_style_prompt: defaults.global_style_prompt,
    render_safety: defaults.render_safety,
    page_fill_rules: defaults.page_fill_rules,
    quality_optimizer: defaults.quality_optimizer,
    image_assets: normalizeEditorialPlannerImageAssets(input.imageAssets),
    ...(pageBriefs.length > 0
      ? {
          page_briefs: pageBriefs,
        }
      : {}),
    output_format: "render_manifest_json" satisfies EditorialPlannerOutputFormat,
  };
  if (pageCountMode === "fixed") {
    payload.requested_page_count = requestedPageCount;
  }
  return payload;
}
