type JsonRecord = Record<string, unknown>;

type PresentationSkillPayload = {
  request?: JsonRecord & {
    content?: JsonRecord & {
      pages?: Array<JsonRecord>;
    };
    pagination?: JsonRecord;
    renderOptions?: JsonRecord;
    theme?: JsonRecord;
  };
};

const EDITORIAL_LAYOUT_PLANNER_OVERRIDE_KEYS = new Set([
  "article_title",
  "article_body",
  "article_language",
  "target_audience",
  "tone",
  "page_size_or_ratio",
  "page_count_mode",
  "requested_page_count",
  "page_briefs",
  "global_style_prompt",
  "render_safety",
  "page_fill_rules",
  "quality_optimizer",
  "image_assets",
  "output_format",
]);

type AdapterContext = {
  skillSlug: string;
  topic: string;
  canvasRatio: string;
  maxPages: number;
};

const MODERN_EDITORIAL_SKILLS = new Set(["modern-editorial-slide"]);
const EDITORIAL_LAYOUT_PLANNER_SKILLS = new Set(["editorial-layout-planner"]);

function clonePayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugifySeed(input: string): string {
  return String(input ?? "presentation")
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "presentation";
}

function countListItems(text: string): number {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-•*]\s|[0-9]+[).\s-]+)/.test(line)).length;
}

function inferModernEditorialIntent(text: string, pageIndex: number, totalPages: number): string {
  const normalized = String(text ?? "").toLowerCase();
  const listItems = countListItems(text);

  if (pageIndex === 0) {
    return "editorial_cover";
  }
  if (pageIndex === totalPages - 1 && totalPages > 1) {
    return "executive_summary";
  }
  if (/\b(?:timeline|phase|roadmap|planning|development|evaluation|review|ไทม์ไลน์|แผน|ระยะ|ทบทวน)\b/i.test(text)) {
    return "project_timeline";
  }
  if (/\b(?:overview|key points?|summary)\b/i.test(normalized) || /(?:ภาพรวม|สรุป|ประเด็นสำคัญ)/i.test(text)) {
    return "strategy_overview";
  }
  if (listItems >= 3) {
    return "workflow_infographic";
  }
  if (/\b(?:warning|caution|consider)\b/i.test(normalized) || /(?:ข้อควรระวัง|ข้อพิจารณา)/i.test(text)) {
    return "case_study";
  }
  return pageIndex % 3 === 1 ? "report_page" : pageIndex % 3 === 2 ? "product_summary" : "healthcare_steps";
}

function inferModernEditorialArchetype(intent: string, pageIndex: number, totalPages: number): string {
  if (pageIndex === 0) {
    return "editorial_cover_split";
  }
  if (pageIndex === totalPages - 1 && totalPages > 1) {
    return "executive_summary_dashboard";
  }
  switch (intent) {
    case "project_timeline":
      return "project_timeline_bands";
    case "workflow_infographic":
      return "vertical_workflow_steps";
    case "strategy_overview":
      return "executive_summary_dashboard";
    case "product_summary":
      return "product_overview_report";
    case "case_study":
      return "feature_story_panels";
    case "healthcare_steps":
      return pageIndex % 2 === 0 ? "title_hero_split" : "stat_card_with_image";
    case "report_page":
    default:
      return pageIndex % 2 === 0 ? "two_column_editorial" : "stat_card_with_image";
  }
}

function shouldForceModernEditorialArchetype(params: {
  intent: string;
  pageIndex: number;
  totalPages: number;
  text: string;
}): boolean {
  if (params.pageIndex === 0 || (params.pageIndex === params.totalPages - 1 && params.totalPages > 1)) {
    return true;
  }
  if (params.intent === "project_timeline" || params.intent === "strategy_overview") {
    return true;
  }
  if (params.intent === "workflow_infographic" && countListItems(params.text) >= 4) {
    return true;
  }
  return false;
}

function applyModernEditorialAdapter(
  payload: PresentationSkillPayload,
  context: AdapterContext,
): PresentationSkillPayload {
  const next = clonePayload(payload);
  const request = (next.request ??= {});
  const pagination = (request.pagination ??= {});
  const content = (request.content ??= {});
  const pages = Array.isArray(content.pages) ? content.pages : [];

  request.compositionMode = request.compositionMode ?? "slide-deck";
  request.designStyle = request.designStyle ?? "soft-wellness";
  request.density = request.density ?? "balanced";
  request.randomizeLayouts = request.randomizeLayouts ?? false;
  request.seed = request.seed ?? `${slugifySeed(context.topic)}-${context.canvasRatio.replace(":", "x")}-${context.maxPages}`;
  pagination.allowFewerPages = pagination.allowFewerPages ?? true;
  pagination.overflowStrategy = pagination.overflowStrategy ?? "condense";
  request.theme = {
    paletteMode: "soft-pastel",
    roundedCorners: true,
    ...(request.theme ?? {}),
  };
  request.renderOptions = {
    pptxFileName: `${slugifySeed(context.topic)}.pptx`,
    jsonFileName: `${slugifySeed(context.topic)}.layout.json`,
    mdFileName: `${slugifySeed(context.topic)}.md`,
    pdfFileName: `${slugifySeed(context.topic)}.pdf`,
    pdfEngine: "libreoffice",
    ...(request.renderOptions ?? {}),
  };

  content.pages = pages.map((page, index) => {
    const text = String(page.text ?? "");
    const hasPrecomputedIntent = typeof page.pageIntentHint === "string" && page.pageIntentHint.trim().length > 0;
    const intent = hasPrecomputedIntent
      ? page.pageIntentHint
      : inferModernEditorialIntent(text, index, pages.length);
    const explicitForceArchetype = typeof page.forceArchetype === "string" && page.forceArchetype.trim()
      ? page.forceArchetype
      : null;
    const shouldForce = explicitForceArchetype
      ? true
      : hasPrecomputedIntent
        ? false
        : shouldForceModernEditorialArchetype({
          intent,
          pageIndex: index,
          totalPages: pages.length,
          text,
        });
    const nextPage: JsonRecord = {
      ...page,
      pageIntentHint: intent,
    };
    if (explicitForceArchetype) {
      nextPage.forceArchetype = explicitForceArchetype;
    } else if (shouldForce) {
      nextPage.forceArchetype = inferModernEditorialArchetype(intent, index, pages.length);
    }
    return nextPage;
  });

  return next;
}

function applyEditorialLayoutPlannerAdapter(
  payload: PresentationSkillPayload,
  context: AdapterContext,
): PresentationSkillPayload {
  const next = clonePayload(payload);
  const request = (next.request ??= {});
  const pagination = (request.pagination ??= {});
  const content = (request.content ??= {});
  const pages = Array.isArray(content.pages) ? content.pages : [];

  request.compositionMode = request.compositionMode ?? "slide-deck";
  request.designStyle = request.designStyle ?? "family-editorial";
  request.density = request.density ?? "balanced";
  request.randomizeLayouts = request.randomizeLayouts ?? false;
  request.seed = request.seed ?? `${slugifySeed(context.topic)}-${context.canvasRatio.replace(":", "x")}-${context.maxPages}-editorial`;
  pagination.allowFewerPages = pagination.allowFewerPages ?? true;
  pagination.overflowStrategy = pagination.overflowStrategy ?? "condense";
  request.theme = {
    paletteMode: "editorial-paper",
    roundedCorners: false,
    ...(request.theme ?? {}),
  };
  request.renderOptions = {
    pptxFileName: `${slugifySeed(context.topic)}-editorial.pptx`,
    jsonFileName: `${slugifySeed(context.topic)}-editorial.layout.json`,
    mdFileName: `${slugifySeed(context.topic)}-editorial.md`,
    pdfFileName: `${slugifySeed(context.topic)}-editorial.pdf`,
    pdfEngine: "libreoffice",
    ...(request.renderOptions ?? {}),
  };

  content.pages = pages.map((page, index) => {
    const text = String(page.text ?? "");
    const intent = typeof page.pageIntentHint === "string" && page.pageIntentHint.trim().length > 0
      ? page.pageIntentHint
      : inferModernEditorialIntent(text, index, pages.length);
    const explicitForceArchetype = typeof page.forceArchetype === "string" && page.forceArchetype.trim()
      ? page.forceArchetype
      : null;
    return {
      ...page,
      pageIntentHint: intent,
      ...(explicitForceArchetype ? { forceArchetype: explicitForceArchetype } : {}),
    };
  });

  return next;
}

export function applyPresentationSkillPayloadAdapter(
  payload: PresentationSkillPayload,
  context: AdapterContext,
): PresentationSkillPayload {
  if (MODERN_EDITORIAL_SKILLS.has(context.skillSlug)) {
    return applyModernEditorialAdapter(payload, context);
  }
  if (EDITORIAL_LAYOUT_PLANNER_SKILLS.has(context.skillSlug)) {
    return applyEditorialLayoutPlannerAdapter(payload, context);
  }
  return clonePayload(payload);
}

function mergePage(basePage: JsonRecord, overridePage: JsonRecord | undefined): JsonRecord {
  if (!overridePage) {
    return basePage;
  }
  const overrideImages = Array.isArray(overridePage.images) ? overridePage.images : null;
  return {
    ...basePage,
    ...overridePage,
    images: overrideImages && overrideImages.length > 0 ? overrideImages : basePage.images,
  };
}

export function mergePresentationSkillPayloadOverride(
  basePayload: PresentationSkillPayload,
  overrideJson?: string | null,
): PresentationSkillPayload {
  const trimmed = String(overrideJson ?? "").trim();
  if (!trimmed) {
    return clonePayload(basePayload);
  }

  const parsed = JSON.parse(trimmed) as PresentationSkillPayload;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Skill input override must be a JSON object");
  }

  if (!parsed.request || typeof parsed.request !== "object") {
    const baseClone = clonePayload(basePayload) as Record<string, unknown>;
    const topLevelOverride = parsed as Record<string, unknown>;
    const topLevelKeys = Object.keys(topLevelOverride);
    const isEditorialLayoutPlannerPayload = !("request" in baseClone)
      && typeof baseClone.output_format === "string"
      && typeof baseClone.article_body === "string";
    if (isEditorialLayoutPlannerPayload) {
      const unknownKeys = topLevelKeys.filter((key) => !EDITORIAL_LAYOUT_PLANNER_OVERRIDE_KEYS.has(key));
      if (unknownKeys.length > 0) {
        throw new Error(`Unsupported override keys for editorial-layout-planner: ${unknownKeys.join(", ")}`);
      }
      if (
        "output_format" in topLevelOverride
        && String(topLevelOverride.output_format ?? "").trim() !== "render_manifest_json"
      ) {
        throw new Error("editorial-layout-planner override must keep output_format as render_manifest_json");
      }
      if (
        "page_count_mode" in topLevelOverride
        && !["auto", "fixed"].includes(String(topLevelOverride.page_count_mode ?? "").trim())
      ) {
        throw new Error("editorial-layout-planner override page_count_mode must be auto or fixed");
      }
      return {
        ...baseClone,
        ...topLevelOverride,
      };
    }
    return {
      ...baseClone,
      ...topLevelOverride,
    };
  }

  const base = clonePayload(basePayload);
  const overrideRequest = parsed.request ?? {};
  const baseRequest = (base.request ??= {});
  const baseContent = (baseRequest.content ??= {});
  const overrideContent = (overrideRequest.content ?? {}) as JsonRecord;

  const mergedPages = Array.isArray(baseContent.pages)
    ? baseContent.pages.map((page, index) => mergePage(page, Array.isArray(overrideContent.pages) ? overrideContent.pages[index] as JsonRecord | undefined : undefined))
    : baseContent.pages;

  base.request = {
    ...baseRequest,
    ...overrideRequest,
    content: {
      ...baseContent,
      ...overrideContent,
      ...(mergedPages ? { pages: mergedPages } : {}),
    },
  };

  return base;
}
