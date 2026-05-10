import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Copy,
  Download,
  CheckCircle2,
  ExternalLink,
  FileJson,
  FileText,
  Images,
  Languages,
  LayoutTemplate,
  Loader2,
  Palette,
  Maximize2,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AgencyPickerModal } from "@/components/agency/AgencyPickerModal";
import { ModelInputFieldsPanel } from "@/components/media/ModelInputFieldsPanel";
import { ImageModelCombobox } from "@/components/presentation/ImageModelCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { normalizeMediaSourceUrl } from "@/lib/mediaUrl";
import { cn } from "@/lib/utils";
import {
  hasImportableGeneratedSlides,
  inspectGeneratedSlideImportability,
} from "@shared/presentation/generatedSlideImportability";
import {
  applyModelSyncTargets,
  buildDefaultExtraParamsForModel,
  getMissingRequiredModelFields,
  mergeExtraParams,
  parseModelInputFields,
  pickExtraParamsForModel,
  type MediaModelOption,
} from "@/lib/mediaModelInputs";
import { trpc } from "@/lib/trpc";
import {
  PRESENTATION_CANVAS_PRESETS,
  type PresentationCanvasPresetId,
} from "@/presentation-canvas/constants";
import {
  buildEditorialLayoutPlannerPayload,
  EDITORIAL_LAYOUT_PLANNER_SKILL_ID,
  EDITORIAL_PLANNER_QUICK_PRESETS,
  getEditorialPlannerResolvedDefaults,
  inferRecommendedEditorialPlannerPreset,
  type EditorialPlannerAudiencePreset,
  type EditorialPlannerFitPreset,
  type EditorialPlannerImageAssetInput,
  type EditorialPlannerImageAssetType,
  type EditorialPlannerJsonObject,
  type EditorialPlannerPageCountMode,
  type EditorialPlannerQuickPreset,
  type EditorialPlannerTonePreset,
} from "@shared/presentation/editorialLayoutPlanner";

type ExecutionSource = "skill" | "agency";
type ArticleLanguage = "th" | "en";
type SlideCanvasRatio = PresentationCanvasPresetId;
type SlideOutputFormat = "json" | "md" | "pptx" | "pdf";
type SlideVisualMode = "editable" | "full-slide-image";
type FullSlideImageStyleId = string;

type FullSlideImageStylePreset = {
  id: FullSlideImageStyleId;
  label: string;
  bestFor: string;
  contract: string;
  keywords: string[];
};

type SkillOption = {
  id: string;
  name: string;
  category?: string | null;
  executionMode?: string | null;
};

type RawSkillOption = {
  id: string | number;
  slug?: string | null;
  name: string;
  category?: string | null;
  executionMode?: string | null;
};

type PreparedImagePrompt = {
  id: string;
  pageNumber: number;
  imageIndex: number;
  placementRole: "hero" | "supporting" | "detail";
  shortLabel: string;
  prompt: string;
};

type PreparedSlideBundle = {
  maxPages: number;
  plannedImageCount: number;
  slideSkillLabel: string;
  imagePrompts: PreparedImagePrompt[];
  slidePayloadJson: string;
  modelId?: string;
  preflightPages?: Array<{
    pageNumber: number;
    titleHint: string;
    compiledText: string;
    pageIntentHint: string;
    preferredArchetype: string;
    forceArchetype: string | null;
    archetypeMode: "forced" | "guided";
    recommendedImageCount: number;
    maxImagesOverride: number;
    warnings: string[];
    structure: {
      paragraphCount: number;
      bulletCount: number;
      workflowStepCount: number;
      timelinePhaseCount: number;
      sectionCount: number;
    };
  }>;
  preflightWarnings?: string[];
};

type GeneratedImageAsset = PreparedImagePrompt & {
  url: string;
  canvasRatio?: SlideCanvasRatio;
  updatedAt?: string;
};

type LibraryResultItemLike = {
  id?: number;
  item_id?: number;
  item_type?: string | null;
  title?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  poster_url?: string | null;
  owner_user_id?: number | null;
  access_source?: string | null;
};

type MediaHistoryTaskLike = {
  id?: string;
  taskId?: string;
  mediaType?: string;
  status?: string;
  model?: string | null;
  prompt?: string | null;
  resultUrl?: string | null;
  resultData?: Record<string, unknown> | null;
};

type PickerAsset = {
  id: number;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  sourceType: "library" | "shared" | "history";
};

type SlideArtifact = {
  format: SlideOutputFormat | "unknown";
  url: string;
  key: string;
  mimeType: string;
  isPrimary: boolean;
};

type GeneratedSlideDraft = {
  slideJson: string;
  slidePayloadJson: string;
  modelId?: string;
  generatedAt?: string | null;
  selectedSkillId?: string;
  selectedSkillName?: string | null;
  executionSkillId?: string | null;
  executionSkillName?: string | null;
  runtimeBundleSkillId?: string | null;
  runtimeBundleSkillName?: string | null;
  runtimeAliasApplied?: boolean;
  artifactJobId?: string | null;
  artifacts?: SlideArtifact[];
  downloadUrl?: string | null;
  debugTracePath?: string | null;
  importedSlideJson?: string | null;
  importedAt?: string | null;
  importedFromArtifact?: boolean;
  importedArtifactUrl?: string | null;
};

export type PresentationGeneratedSlideDraft = GeneratedSlideDraft;
export type PresentationInsertSlidesResult = {
  inserted: boolean;
  importedSlideJson?: string | null;
  importedAt?: string | null;
  importedFromArtifact?: boolean;
  importedArtifactUrl?: string | null;
};

type WizardStepStatus = "idle" | "ready" | "running" | "done" | "stale";
type GeneratedSlideDraftSessionSource = "empty" | "fresh-run" | "restored-draft";

const SUPPORTED_SLIDE_RATIOS: SlideCanvasRatio[] = ["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"];
const FULL_SLIDE_IMAGE_FALLBACK_RATIOS: SlideCanvasRatio[] = ["9:16", "16:9"];
const SUPPORTED_OUTPUT_FORMATS: SlideOutputFormat[] = ["json", "md", "pptx", "pdf"];
const ARTICLE_BUILDER_DRAFT_STORAGE_KEY_PREFIX = "presentation-article-builder-draft";
const TASK_POLL_INTERVAL_MS = 2000;
const TASK_POLL_MAX_ATTEMPTS = 120;
const IMAGE_GENERATION_BATCH_CONCURRENCY = 3;
const AUTO_FULL_SLIDE_STYLE_ID = "auto";

const FULL_SLIDE_IMAGE_STYLE_PRESETS: FullSlideImageStylePreset[] = [
  {
    id: "premium-parenting-editorial",
    label: "Premium Parenting Editorial",
    bestFor: "พ่อแม่ เด็ก สุขภาพครอบครัว",
    keywords: ["เด็ก", "แม่", "พ่อ", "ลูก", "baby", "parent", "sleep", "นอน", "นม", "family"],
    contract: "Warm realistic parenting magazine cover. Cream, white, beige, soft brown, pale blue. Large Thai headline, intimate human photo, translucent cream explainer card, soft icons, calm bedtime/editorial healthcare mood.",
  },
  {
    id: "modern-minimal-infographic",
    label: "Modern Minimal Infographic",
    bestFor: "ความรู้ทั่วไป ขั้นตอน สรุปบทความ",
    keywords: ["วิธี", "ขั้นตอน", "how to", "guide", "tips", "สรุป", "เข้าใจ", "ความรู้"],
    contract: "Clean modern infographic with restrained color blocks, crisp Thai sans-serif typography, numbered sections, high whitespace, simple line icons, clear hierarchy, and mobile-first readability.",
  },
  {
    id: "magazine-cover-feature",
    label: "Magazine Cover Feature",
    bestFor: "บทความเปิดเรื่อง เรื่องเล่า ไลฟ์สไตล์",
    keywords: ["cover", "เรื่อง", "ไลฟ์สไตล์", "lifestyle", "feature", "story"],
    contract: "Premium vertical magazine cover. Oversized headline, elegant deck text, strong photo crop, editorial masthead-like spacing without fake logos, refined serif/sans pairing, polished feature article energy.",
  },
  {
    id: "healthcare-clean",
    label: "Healthcare Clean",
    bestFor: "สุขภาพ การแพทย์ Wellness",
    keywords: ["สุขภาพ", "แพทย์", "วัคซีน", "โรค", "health", "medical", "wellness", "doctor"],
    contract: "Clean healthcare explainer with white/blue/teal palette, clinical but warm photography, rounded data cards, trustworthy typography, medical editorial clarity, no scary or graphic imagery.",
  },
  {
    id: "luxury-cream-editorial",
    label: "Luxury Cream Editorial",
    bestFor: "บทความพรีเมียม ความงาม บ้าน ไลฟ์สไตล์",
    keywords: ["luxury", "premium", "beauty", "บ้าน", "ความงาม", "หรู", "minimal"],
    contract: "Luxury cream editorial design. Ivory, champagne, taupe, soft gold accents, refined spacing, elegant headline, translucent glassmorphism cards, premium lifestyle photography.",
  },
  {
    id: "bold-social-carousel",
    label: "Bold Social Carousel",
    bestFor: "โพสต์โซเชียล ข้อความสั้น ดึงดูดเร็ว",
    keywords: ["social", "viral", "โพสต์", "ขาย", "โปรโมท", "hook", "tiktok", "facebook"],
    contract: "Bold social carousel cover. High-contrast headline, punchy accent color, large readable Thai text, cropped dynamic photo, sticker-like callouts used sparingly, energetic but polished.",
  },
  {
    id: "news-explainer",
    label: "News Explainer",
    bestFor: "ข่าว เหตุการณ์ วิเคราะห์ประเด็น",
    keywords: ["ข่าว", "วิเคราะห์", "policy", "เศรษฐกิจ", "news", "report", "เหตุการณ์"],
    contract: "News explainer layout with strong headline bar, documentary image treatment, timeline/fact cards, restrained navy/red/white accents, credible editorial newspaper-inspired hierarchy.",
  },
  {
    id: "photo-documentary",
    label: "Photo Documentary",
    bestFor: "เรื่องจริง สารคดี สังคม การเดินทาง",
    keywords: ["สารคดี", "documentary", "travel", "ชุมชน", "story", "ชีวิต", "สังคม"],
    contract: "Photo documentary poster. Natural light, authentic candid photography, understated text panels, muted earth tones, human-centered composition, cinematic realism with journalistic restraint.",
  },
  {
    id: "corporate-report",
    label: "Corporate Report",
    bestFor: "ธุรกิจ รายงาน กลยุทธ์",
    keywords: ["business", "ธุรกิจ", "รายงาน", "กลยุทธ์", "marketing", "ยอดขาย", "finance"],
    contract: "Corporate report slide. Structured grid, navy/white/graphite palette, sharp section headers, subtle charts or metrics cards, professional photography, boardroom-ready hierarchy.",
  },
  {
    id: "kids-friendly-soft",
    label: "Kids Friendly Soft",
    bestFor: "เด็ก การศึกษา ครอบครัว",
    keywords: ["เด็ก", "นักเรียน", "เรียน", "education", "school", "kids", "นิทาน"],
    contract: "Soft kids-friendly editorial. Pastel accents, playful rounded cards, warm family/learning photography, friendly Thai typography, gentle icons, safe and cheerful without cartooning the whole slide.",
  },
  {
    id: "dark-cinematic",
    label: "Dark Cinematic",
    bestFor: "เทค เกม ภาพยนตร์ เรื่องเข้ม",
    keywords: ["tech", "game", "หนัง", "cinematic", "dark", "ai", "security"],
    contract: "Dark cinematic editorial poster. Deep charcoal background, dramatic rim lighting, neon or metallic accents, bold high-contrast Thai headline, premium tech/movie-poster atmosphere.",
  },
  {
    id: "pastel-wellness",
    label: "Pastel Wellness",
    bestFor: "สุขภาพใจ โยคะ ความสงบ",
    keywords: ["wellness", "mind", "ใจ", "โยคะ", "สมาธิ", "พักผ่อน", "sleep"],
    contract: "Pastel wellness guide. Sage, blush, cream, soft lavender. Calm photography, airy cards, gentle iconography, rounded editorial layout, soothing Thai typography.",
  },
  {
    id: "academic-clean",
    label: "Academic Clean",
    bestFor: "บทเรียน วิจัย อธิบายเชิงลึก",
    keywords: ["เรียน", "วิจัย", "academic", "study", "บทเรียน", "วิทยาศาสตร์", "ข้อมูล"],
    contract: "Academic clean slide. White background, structured headings, evidence cards, small diagrams/icons, blue/gray accents, textbook-quality Thai typography with careful spacing.",
  },
  {
    id: "product-promo",
    label: "Product Promo",
    bestFor: "สินค้า รีวิว โปรโมชัน",
    keywords: ["สินค้า", "รีวิว", "product", "promo", "sale", "ซื้อ", "ราคา"],
    contract: "Premium product promo layout. Hero product/photo focus, bold benefit headline, feature chips, subtle price/CTA-style card without fake buttons, clean commercial editorial polish.",
  },
  {
    id: "step-by-step-guide",
    label: "Step-by-step Guide",
    bestFor: "คู่มือ How-to Checklist",
    keywords: ["step", "ขั้น", "checklist", "คู่มือ", "ทำอย่างไร", "วิธี"],
    contract: "Step-by-step mobile guide. Numbered vertical cards, clear title, concise Thai body text, progress-like visual rhythm, clean icons, practical instructional layout.",
  },
  {
    id: "data-story",
    label: "Data Story",
    bestFor: "ตัวเลข สถิติ เปรียบเทียบ",
    keywords: ["สถิติ", "ตัวเลข", "data", "percent", "เทียบ", "ผลลัพธ์", "analytics"],
    contract: "Data story infographic. Large key number, comparison cards, mini chart-like shapes, clean labels, navy/teal/orange accents, editorial analytics style with high legibility.",
  },
  {
    id: "travel-editorial",
    label: "Travel Editorial",
    bestFor: "ท่องเที่ยว สถานที่ รีวิวเมือง",
    keywords: ["เที่ยว", "travel", "เมือง", "ที่พัก", "ร้านอาหาร", "ทริป"],
    contract: "Travel editorial poster. Immersive destination photo, warm natural color grading, map/tag cards, elegant headline, lifestyle magazine spacing, inviting premium travel tone.",
  },
  {
    id: "food-lifestyle",
    label: "Food Lifestyle",
    bestFor: "อาหาร ร้านอาหาร สูตรอาหาร",
    keywords: ["อาหาร", "food", "ร้าน", "สูตร", "กิน", "คาเฟ่"],
    contract: "Food lifestyle editorial. Appetizing realistic food photography, warm table light, recipe/taste note cards, cream and herb accents, clean Thai typography.",
  },
  {
    id: "tech-product-glass",
    label: "Tech Product Glass",
    bestFor: "AI SaaS เครื่องมือ เทคโนโลยี",
    keywords: ["ai", "เทค", "software", "saas", "app", "tool", "ระบบ"],
    contract: "Modern tech glass editorial. Dark or light glass panels, cyan/blue accents, product-like abstract visuals, crisp UI-inspired cards, premium SaaS presentation energy.",
  },
  {
    id: "finance-premium",
    label: "Finance Premium",
    bestFor: "การเงิน ลงทุน ธุรกิจ",
    keywords: ["เงิน", "ลงทุน", "finance", "stock", "ภาษี", "บัญชี", "รายได้"],
    contract: "Premium finance explainer. Deep green/navy/cream palette, subtle chart motifs, confident headline, metric cards, realistic business imagery, trustworthy and calm.",
  },
  {
    id: "eco-natural",
    label: "Eco Natural",
    bestFor: "สิ่งแวดล้อม เกษตร บ้านและสวน",
    keywords: ["สวน", "เกษตร", "ธรรมชาติ", "eco", "green", "ต้นไม้", "environment"],
    contract: "Eco natural editorial. Botanical greens, warm sunlight, organic paper cards, natural photography, calm explanatory Thai type, sustainable premium feel.",
  },
  {
    id: "fashion-lookbook",
    label: "Fashion Lookbook",
    bestFor: "แฟชั่น เสื้อผ้า สไตล์",
    keywords: ["แฟชั่น", "เสื้อ", "fashion", "style", "lookbook", "แต่งตัว"],
    contract: "Fashion lookbook cover. Sophisticated portrait/product styling, editorial crop, elegant headline, minimal caption cards, premium magazine fashion aesthetic.",
  },
  {
    id: "real-estate-brochure",
    label: "Real Estate Brochure",
    bestFor: "บ้าน คอนโด อสังหา ตกแต่ง",
    keywords: ["บ้าน", "คอนโด", "อสังหา", "interior", "แต่งบ้าน", "property"],
    contract: "Real estate brochure slide. Bright architectural photography, clean listing-style information cards, beige/white/charcoal palette, premium interior magazine layout.",
  },
  {
    id: "sport-energy",
    label: "Sport Energy",
    bestFor: "กีฬา ฟิตเนส กิจกรรม",
    keywords: ["กีฬา", "sport", "fitness", "วิ่ง", "ออกกำลัง", "ทีม"],
    contract: "Sport energy poster. Dynamic action photography, bold condensed headline, energetic accent shapes, stat chips, high-contrast composition, motivational editorial tone.",
  },
];

type EditorialPlannerImageAssetDraft = {
  id: string;
  assetType: EditorialPlannerImageAssetType;
  label: string;
  pageHint: string;
  prompt: string;
  reference: string;
};

type EditorialPlannerClientImageAsset =
  | {
    assetType: "image_prompt";
    label: string;
    pageHint?: number;
    prompt: string;
    reference?: string;
  }
  | {
    assetType: "uploaded_image";
    label: string;
    pageHint?: number;
    prompt?: string;
    reference: string;
  };

type EditorialPlannerOptionsInput = {
  targetAudience?: EditorialPlannerAudiencePreset;
  tonePreset?: EditorialPlannerTonePreset;
  fitPreset?: EditorialPlannerFitPreset;
  pageCountMode?: EditorialPlannerPageCountMode;
  requestedPageCount?: number;
  globalStylePrompt?: string | null;
  renderSafety?: EditorialPlannerJsonObject | null;
  pageFillRules?: EditorialPlannerJsonObject | null;
  qualityOptimizer?: EditorialPlannerJsonObject | null;
  imageAssets?: EditorialPlannerClientImageAsset[];
};

function createEditorialPlannerImageAssetDraft(
  overrides?: Partial<EditorialPlannerImageAssetDraft>,
): EditorialPlannerImageAssetDraft {
  return {
    id: overrides?.id ?? `planner-asset-${Math.random().toString(36).slice(2, 10)}`,
    assetType: overrides?.assetType ?? "image_prompt",
    label: overrides?.label ?? "",
    pageHint: overrides?.pageHint ?? "",
    prompt: overrides?.prompt ?? "",
    reference: overrides?.reference ?? "",
  };
}

function normalizeEditorialPlannerAssetDrafts(
  assets: EditorialPlannerImageAssetDraft[],
): EditorialPlannerImageAssetDraft[] {
  return assets.map((asset) => createEditorialPlannerImageAssetDraft(asset));
}

function parseEditorialPlannerJsonObject(raw: string, label: string): EditorialPlannerJsonObject | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as EditorialPlannerJsonObject;
}

function normalizeEditorialPlannerImageAssets(
  assets: EditorialPlannerImageAssetDraft[],
): EditorialPlannerClientImageAsset[] {
  const normalized: EditorialPlannerClientImageAsset[] = [];
  for (const asset of assets) {
    const label = asset.label.trim();
    const prompt = asset.prompt.trim();
    const reference = asset.reference.trim();
    const parsedPageHint = Number.parseInt(asset.pageHint.trim(), 10);
    const pageHint = Number.isFinite(parsedPageHint)
      ? Math.max(1, Math.min(20, parsedPageHint))
      : undefined;
    if (asset.assetType === "uploaded_image") {
      if (!reference) {
        continue;
      }
      normalized.push({
        assetType: "uploaded_image" as const,
        label: label || "Uploaded image",
        ...(typeof pageHint === "number" ? { pageHint } : {}),
        ...(prompt ? { prompt } : {}),
        reference,
      });
      continue;
    }
    if (!prompt) {
      continue;
    }
    normalized.push({
      assetType: "image_prompt" as const,
      label: label || "Image prompt",
      ...(typeof pageHint === "number" ? { pageHint } : {}),
      prompt,
      ...(reference ? { reference } : {}),
    });
  }
  return normalized;
}

function stringifyPlannerJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeEditorialPlannerImageAssetIssues(
  assets: EditorialPlannerImageAssetDraft[],
): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  assets.forEach((asset, index) => {
    const label = asset.label.trim() || `Asset #${index + 1}`;
    const prompt = asset.prompt.trim();
    const reference = asset.reference.trim();
    const pageHint = asset.pageHint.trim();
    if (pageHint) {
      const parsed = Number.parseInt(pageHint, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
        errors.push(`${label}: page hint must be between 1 and 20.`);
      }
    }
    if (asset.assetType === "uploaded_image") {
      if (!reference) {
        errors.push(`${label}: uploaded_image requires a reference URL.`);
      } else if (!/^https?:\/\//i.test(reference)) {
        errors.push(`${label}: uploaded_image reference must be an http/https URL.`);
      }
      if (prompt && prompt.length < 12) {
        warnings.push(`${label}: optional prompt is very short and may not help the planner much.`);
      }
      return;
    }
    if (!prompt) {
      errors.push(`${label}: image_prompt requires prompt text.`);
      return;
    }
    if (prompt.length < 24) {
      warnings.push(`${label}: prompt is short; adding subject, mood, and setting will improve image planning.`);
    }
  });
  return { errors, warnings };
}

function inferTopicFallbackFromArticle(article: string): string {
  return article
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?? "Presentation";
}

function isArticleFriendlySkill(skill: SkillOption): boolean {
  const category = String(skill.category ?? "").toLowerCase();
  const mode = String(skill.executionMode ?? "").toLowerCase();
  const searchable = `${skill.id} ${skill.name}`.toLowerCase();
  return (
    category === "article_generation"
    || category === "prompt_enhancement"
    || category === "chat_assistant"
    || mode === "enhance-prompt"
    || /\b(article|writer|copywriter|blog|content|research|brief|story)\b/i.test(searchable)
  );
}

function isSlideGenerationSkill(skill: SkillOption): boolean {
  return String(skill.category ?? "").trim().toLowerCase() === "slide_generation";
}

function supportsGeneratedSlideArtifacts(skill: SkillOption | null | undefined): boolean {
  return String(skill?.executionMode ?? "").trim().toLowerCase() === "sandbox-command";
}

function requiresGeneratedSlideArtifact(format: SlideOutputFormat): boolean {
  return format === "pptx" || format === "pdf";
}

function clampImageCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }
  return Math.max(5, Math.min(20, Math.round(value)));
}

function detectArticleLanguage(text: string): ArticleLanguage {
  const thaiMatches = text.match(/[\u0E00-\u0E7F]/g) ?? [];
  const latinMatches = text.match(/[A-Za-z]/g) ?? [];
  if (thaiMatches.length > latinMatches.length) {
    return "th";
  }
  return "en";
}

function normalizeCanvasRatio(value?: string | null): SlideCanvasRatio {
  return SUPPORTED_SLIDE_RATIOS.includes(value as SlideCanvasRatio)
    ? value as SlideCanvasRatio
    : "16:9";
}

function getModelConfigRecord(model: MediaModelOption | null | undefined): Record<string, unknown> {
  return model?.configJson && typeof model.configJson === "object" && !Array.isArray(model.configJson)
    ? model.configJson as Record<string, unknown>
    : {};
}

function normalizeModelStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeModelStringList(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function getSizeRatio(size: string): SlideCanvasRatio | null {
  const match = size.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  const preset = PRESENTATION_CANVAS_PRESETS.find((candidate) => {
    const expected = candidate.width / candidate.height;
    const actual = width / height;
    return Math.abs(expected - actual) < 0.05;
  });
  return preset ? preset.id as SlideCanvasRatio : null;
}

function getSupportedCanvasRatiosForModel(model: MediaModelOption | null | undefined): SlideCanvasRatio[] {
  const config = getModelConfigRecord(model);
  const ratioValues = [
    ...normalizeModelStringList(model?.supportsAspectRatios),
    ...normalizeModelStringList(config.supportedAspectRatios),
    ...normalizeModelStringList(config.aspectRatios),
  ];
  const sizeValues = [
    ...normalizeModelStringList(model?.supportsSizes),
    ...normalizeModelStringList(config.supportedSizes),
    ...normalizeModelStringList(config.sizes),
  ];
  const supported = new Set<SlideCanvasRatio>();
  for (const ratio of ratioValues) {
    const normalized = ratio.toLowerCase();
    if (normalized === "auto") {
      continue;
    }
    if (SUPPORTED_SLIDE_RATIOS.includes(normalized as SlideCanvasRatio)) {
      supported.add(normalized as SlideCanvasRatio);
    }
  }
  for (const size of sizeValues) {
    const ratio = getSizeRatio(size);
    if (ratio) {
      supported.add(ratio);
    }
  }
  return SUPPORTED_SLIDE_RATIOS.filter((ratio) => supported.has(ratio));
}

function getCanvasRatioCss(value: SlideCanvasRatio): string {
  return value.replace(":", " / ");
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";
  if (rawMessage) {
    const normalized = rawMessage.toLowerCase();
    if (
      normalized.includes("unexpected token '<'")
      || normalized.includes("<!doctype")
      || normalized.includes("<html")
      || normalized.includes("is not valid json")
    ) {
      return `${fallback} The server returned HTML instead of JSON.`;
    }
    return rawMessage;
  }
  return fallback;
}

function getRetryAfterSeconds(message: string): number | null {
  const match = message.match(/retry\s+after\s+(\d+)\s*s/i) ?? message.match(/(\d+)\s*seconds?/i);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeTaskStatus(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const rawStatus = (task as { status?: unknown }).status;
  if (typeof rawStatus !== "string") {
    return null;
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "succeeded" || normalized === "ready") {
    return "completed";
  }
  if (normalized === "error") {
    return "failed";
  }
  return normalized;
}

function extractTaskFailureMessage(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const direct = (task as { errorMessage?: unknown }).errorMessage;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  const resultData = (task as { resultData?: unknown }).resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }
  const candidates = ["error", "errorMessage", "message", "detail", "failMsg"] as const;
  for (const key of candidates) {
    const value = (resultData as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isProbablyHtmlDocument(value: string | null | undefined): boolean {
  const trimmed = String(value ?? "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html")
    || trimmed.startsWith("<html")
    || trimmed.startsWith("<body")
    || trimmed.startsWith("<head");
}

function normalizeSlidePayloadJson(
  candidate: string | null | undefined,
  fallback = "",
): string {
  const trimmed = String(candidate ?? "").trim();
  if (!trimmed || isProbablyHtmlDocument(trimmed)) {
    return fallback;
  }
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return fallback;
  }
}

function normalizeSlideArtifact(raw: unknown): SlideArtifact | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim() : "application/octet-stream";
  if (!url || !key) {
    return null;
  }
  const normalizedFormat = String(record.format ?? "").trim().toLowerCase();
  const format: SlideOutputFormat | "unknown" = normalizedFormat === "json"
    || normalizedFormat === "md"
    || normalizedFormat === "pptx"
    || normalizedFormat === "pdf"
    ? normalizedFormat
    : key.toLowerCase().endsWith(".pptx")
      ? "pptx"
      : key.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : key.toLowerCase().endsWith(".md")
          ? "md"
          : key.toLowerCase().endsWith(".json")
            ? "json"
            : "unknown";
  return {
    format,
    url,
    key,
    mimeType,
    isPrimary: Boolean(record.isPrimary),
  };
}

function pickPreferredSlideArtifact(
  artifacts: SlideArtifact[],
  preferredFormat: SlideOutputFormat,
): SlideArtifact | null {
  if (artifacts.length === 0) {
    return null;
  }
  return (
    artifacts.find((artifact) => artifact.format === preferredFormat)
    ?? (preferredFormat === "pptx" ? artifacts.find((artifact) => artifact.format === "pdf") : null)
    ?? artifacts.find((artifact) => artifact.isPrimary)
    ?? artifacts[0]
    ?? null
  );
}

function hasImportableSlidesJson(raw: string): boolean {
  return hasImportableGeneratedSlides(raw);
}

function resolveInspectableSlideJson(draft: GeneratedSlideDraft | null | undefined): string {
  const importedSlideJson = typeof draft?.importedSlideJson === "string"
    ? draft.importedSlideJson.trim()
    : "";
  if (importedSlideJson) {
    return draft?.importedSlideJson ?? "";
  }
  return typeof draft?.slideJson === "string" ? draft.slideJson : "";
}

function formatAuditTimestamp(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}

type PersistedArticleBuilderDraft = {
  topic: string;
  article: string;
  executionSource: ExecutionSource;
  skillId: string;
  agencyId: string;
  agencyName: string;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  targetImageCount: number;
  imageModel: string;
  canvasRatio: SlideCanvasRatio;
  slideVisualMode?: SlideVisualMode;
  fullSlideImageStyleId?: FullSlideImageStyleId;
  advancedMediaOptionsEnabled: boolean;
  mediaModelExtraParams: Record<string, unknown>;
  imagePromptContext: string;
  slideSkillId: string;
  slideOutputFormat: SlideOutputFormat;
  editorialPlannerAudiencePreset: EditorialPlannerAudiencePreset;
  editorialPlannerTonePreset: EditorialPlannerTonePreset;
  editorialPlannerFitPreset: EditorialPlannerFitPreset;
  editorialPlannerPageCountMode: EditorialPlannerPageCountMode;
  editorialPlannerRequestedPageCount: number;
  editorialPlannerGlobalStylePrompt: string;
  editorialPlannerRenderSafetyJson: string;
  editorialPlannerPageFillRulesJson: string;
  editorialPlannerQualityOptimizerJson: string;
  editorialPlannerImageAssets: EditorialPlannerImageAssetDraft[];
  preparedBundle: PreparedSlideBundle | null;
  preparedBundleSkillId?: string;
  generatedImages: GeneratedImageAsset[];
  generatedSlideDraft: GeneratedSlideDraft | null;
  generatedSlideDraftSkillId?: string;
  slidePayloadEditorJson: string;
  slidePayloadEditorDirty: boolean;
};

function sanitizePersistedGeneratedSlideDraft(
  draft: GeneratedSlideDraft | null | undefined,
): GeneratedSlideDraft | null {
  if (!draft) {
    return null;
  }
  return {
    slideJson: typeof draft.slideJson === "string" ? draft.slideJson : "",
    slidePayloadJson: typeof draft.slidePayloadJson === "string" ? draft.slidePayloadJson : "",
    modelId: typeof draft.modelId === "string" && draft.modelId.trim() ? draft.modelId.trim() : undefined,
    generatedAt: typeof draft.generatedAt === "string" && draft.generatedAt.trim()
      ? draft.generatedAt.trim()
      : null,
    selectedSkillId: typeof draft.selectedSkillId === "string" && draft.selectedSkillId.trim()
      ? draft.selectedSkillId.trim()
      : undefined,
    selectedSkillName: typeof draft.selectedSkillName === "string" && draft.selectedSkillName.trim()
      ? draft.selectedSkillName.trim()
      : null,
    executionSkillId: typeof draft.executionSkillId === "string" && draft.executionSkillId.trim()
      ? draft.executionSkillId.trim()
      : null,
    executionSkillName: typeof draft.executionSkillName === "string" && draft.executionSkillName.trim()
      ? draft.executionSkillName.trim()
      : null,
    runtimeBundleSkillId: typeof draft.runtimeBundleSkillId === "string" && draft.runtimeBundleSkillId.trim()
      ? draft.runtimeBundleSkillId.trim()
      : null,
    runtimeBundleSkillName: typeof draft.runtimeBundleSkillName === "string" && draft.runtimeBundleSkillName.trim()
      ? draft.runtimeBundleSkillName.trim()
      : null,
    runtimeAliasApplied: Boolean(draft.runtimeAliasApplied),
    artifactJobId: null,
    artifacts: [],
    downloadUrl: null,
    debugTracePath: typeof draft.debugTracePath === "string" && draft.debugTracePath.trim()
      ? draft.debugTracePath.trim()
      : null,
    importedSlideJson: typeof draft.importedSlideJson === "string" && draft.importedSlideJson.trim()
      ? draft.importedSlideJson
      : null,
    importedAt: typeof draft.importedAt === "string" && draft.importedAt.trim()
      ? draft.importedAt.trim()
      : null,
    importedFromArtifact: Boolean(draft.importedFromArtifact),
    importedArtifactUrl: typeof draft.importedArtifactUrl === "string" && draft.importedArtifactUrl.trim()
      ? draft.importedArtifactUrl.trim()
      : null,
  };
}

function getArticleBuilderDraftStorageKey(deckId: number): string {
  return `${ARTICLE_BUILDER_DRAFT_STORAGE_KEY_PREFIX}:${deckId}`;
}

function loadPersistedArticleBuilderDraft(deckId: number): PersistedArticleBuilderDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getArticleBuilderDraftStorageKey(deckId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedArticleBuilderDraft;
    return {
      ...parsed,
      generatedSlideDraft: sanitizePersistedGeneratedSlideDraft(parsed.generatedSlideDraft),
    };
  } catch {
    return null;
  }
}

function savePersistedArticleBuilderDraft(
  deckId: number,
  draft: PersistedArticleBuilderDraft,
): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getArticleBuilderDraftStorageKey(deckId), JSON.stringify({
      ...draft,
      generatedSlideDraft: sanitizePersistedGeneratedSlideDraft(draft.generatedSlideDraft),
    }));
  } catch {
    // Ignore storage quota or serialization failures and keep the dialog usable.
  }
}

function extractTaskId(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const record = task as { id?: unknown; taskId?: unknown };
  if (typeof record.id === "string" && record.id.trim()) {
    return record.id.trim();
  }
  if (typeof record.taskId === "string" && record.taskId.trim()) {
    return record.taskId.trim();
  }
  return null;
}

function extractTaskResultUrl(task: unknown): string | null {
  if (!task || typeof task !== "object") {
    return null;
  }
  const record = task as Record<string, unknown>;
  const direct = typeof record.resultUrl === "string" ? record.resultUrl.trim() : "";
  if (direct) {
    return direct;
  }
  const outputUrl = typeof record.outputUrl === "string" ? record.outputUrl.trim() : "";
  if (outputUrl) {
    return outputUrl;
  }
  const result = record.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    const nestedUrl = typeof nested.url === "string" ? nested.url.trim() : "";
    if (nestedUrl) {
      return nestedUrl;
    }
  }
  return null;
}

function renderWizardStatusBadge(status: WizardStepStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "done":
      return {
        label: "Done",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    case "running":
      return {
        label: "Running",
        className: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "stale":
      return {
        label: "Needs refresh",
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
    case "ready":
      return {
        label: "Ready",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    default:
      return {
        label: "Waiting",
        className: "border-slate-200 bg-slate-50 text-slate-600",
      };
  }
}

async function pollTaskUntilTerminal(
  taskId: string,
  fetchTask: (taskId: string) => Promise<unknown>,
  options?: {
    mediaLabel?: string;
  },
): Promise<unknown> {
  const mediaLabel = options?.mediaLabel ?? "Image";
  for (let attempt = 0; attempt < TASK_POLL_MAX_ATTEMPTS; attempt += 1) {
    const current = await fetchTask(taskId);
    const status = normalizeTaskStatus(current);
    if (status === "completed") {
      return current;
    }
    if (status === "failed" || status === "cancelled") {
      const errorMessage = extractTaskFailureMessage(current);
      throw new Error(errorMessage || `${mediaLabel} generation ${status}.`);
    }
    await sleepMs(TASK_POLL_INTERVAL_MS);
  }
  throw new Error(`${mediaLabel} generation timeout. Please try again.`);
}

async function copyText(value: string, successMessage: string, errorMessage: string): Promise<void> {
  const trimmed = value.trim();
  if (!trimmed) {
    toast.error(errorMessage);
    return;
  }
  await navigator.clipboard.writeText(trimmed);
  toast.success(successMessage);
}

function formatPromptPlan(prompts: PreparedImagePrompt[]): string {
  if (prompts.length === 0) {
    return "";
  }
  return prompts
    .map((prompt) => (
      `Page ${prompt.pageNumber} · ${prompt.shortLabel}\n${prompt.prompt}`
    ))
    .join("\n\n");
}

function getPreparedImageSlotKey(
  value: Pick<PreparedImagePrompt, "pageNumber" | "imageIndex" | "placementRole">,
): string {
  return `${value.pageNumber}:${value.imageIndex}:${value.placementRole}`;
}

function isSamePreparedImageSlot(
  left: Pick<PreparedImagePrompt, "id" | "pageNumber" | "imageIndex" | "placementRole">,
  right: Pick<PreparedImagePrompt, "id" | "pageNumber" | "imageIndex" | "placementRole">,
): boolean {
  return Boolean(left.id && right.id && left.id === right.id)
    || getPreparedImageSlotKey(left) === getPreparedImageSlotKey(right)
    || (left.pageNumber === right.pageNumber && left.imageIndex === right.imageIndex);
}

function normalizeGeneratedImagesForBundle(
  bundle: PreparedSlideBundle | null,
  assets: GeneratedImageAsset[],
  canvasRatio?: SlideCanvasRatio,
): GeneratedImageAsset[] {
  if (!bundle) {
    return assets.filter((asset) => Boolean(asset.url?.trim()) && (!canvasRatio || asset.canvasRatio === canvasRatio));
  }
  const prompts = Array.isArray(bundle.imagePrompts) ? bundle.imagePrompts : [];
  return normalizeGeneratedImagesForPrompts(prompts, assets, canvasRatio);
}

function normalizeGeneratedImagesForPrompts(
  prompts: PreparedImagePrompt[],
  assets: GeneratedImageAsset[],
  canvasRatio?: SlideCanvasRatio,
): GeneratedImageAsset[] {
  if (prompts.length === 0) {
    return [];
  }
  return prompts.flatMap((prompt) => {
    const matchedAssets = assets.filter((asset) => (
      Boolean(asset.url?.trim())
      && isSamePreparedImageSlot(asset, prompt)
      && (!canvasRatio || asset.canvasRatio === canvasRatio)
    ));
    const matchedAsset = matchedAssets
      .map((asset, index) => ({
        asset,
        index,
        timestamp: Date.parse(asset.updatedAt ?? ""),
      }))
      .sort((left, right) => (
        (Number.isNaN(right.timestamp) ? 0 : right.timestamp)
        - (Number.isNaN(left.timestamp) ? 0 : left.timestamp)
      ) || right.index - left.index)[0]?.asset;
    if (!matchedAsset) {
      return [];
    }
    return [{
      ...prompt,
      url: matchedAsset.url,
      canvasRatio: matchedAsset.canvasRatio,
      updatedAt: matchedAsset.updatedAt,
    }];
  });
}

function generatedImagesMatchPrompts(
  prompts: PreparedImagePrompt[],
  assets: GeneratedImageAsset[],
  canvasRatio?: SlideCanvasRatio,
): boolean {
  if (prompts.length === 0) {
    return true;
  }
  return normalizeGeneratedImagesForPrompts(prompts, assets, canvasRatio).length === prompts.length;
}

function generatedImagesMatchPreparedBundle(
  bundle: PreparedSlideBundle | null,
  assets: GeneratedImageAsset[],
  canvasRatio?: SlideCanvasRatio,
): boolean {
  if (!bundle) {
    return canvasRatio
      ? assets.filter((asset) => asset.canvasRatio === canvasRatio).length === 0
      : assets.length === 0;
  }
  const prompts = Array.isArray(bundle.imagePrompts) ? bundle.imagePrompts : [];
  if (prompts.length === 0) {
    return true;
  }
  return normalizeGeneratedImagesForBundle(bundle, assets, canvasRatio).length === prompts.length;
}

function sanitizeFullSlideVisualDirection(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/(?:no|without)\s+(?:text|letters|captions|typography|words|logos?)/i.test(line))
    .filter((line) => !/(?:ไม่มี|ห้าม|ไม่ใส่).*(?:ข้อความ|ตัวอักษร|แคปชัน|โลโก้)/i.test(line))
    .join("\n");
}

function normalizeFullSlideBodyText(value: string): string {
  const compact = value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
  if (compact.length <= 900) {
    return compact;
  }
  return `${compact.slice(0, 897).trimEnd()}...`;
}

function normalizeFullSlideImageStyleId(value: string | null | undefined): FullSlideImageStyleId {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === AUTO_FULL_SLIDE_STYLE_ID) {
    return AUTO_FULL_SLIDE_STYLE_ID;
  }
  return FULL_SLIDE_IMAGE_STYLE_PRESETS.some((preset) => preset.id === trimmed)
    ? trimmed
    : AUTO_FULL_SLIDE_STYLE_ID;
}

function resolveFullSlideImageStylePreset(input: {
  styleId: FullSlideImageStyleId;
  topic: string;
  article: string;
  bundle: PreparedSlideBundle | null;
}): FullSlideImageStylePreset {
  const normalizedStyleId = normalizeFullSlideImageStyleId(input.styleId);
  const explicitPreset = FULL_SLIDE_IMAGE_STYLE_PRESETS.find((preset) => preset.id === normalizedStyleId);
  if (explicitPreset) {
    return explicitPreset;
  }
  const haystack = [
    input.topic,
    input.article,
    input.bundle?.preflightPages?.map((page) => `${page.titleHint} ${page.compiledText}`).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
  const scoredPresets = FULL_SLIDE_IMAGE_STYLE_PRESETS.map((preset, index) => {
    const score = preset.keywords.reduce((total, keyword) => (
      haystack.includes(keyword.toLowerCase()) ? total + 1 : total
    ), 0);
    return { preset, score, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  return scoredPresets[0]?.score
    ? scoredPresets[0].preset
    : FULL_SLIDE_IMAGE_STYLE_PRESETS[0]!;
}

function buildFullSlideImagePrompt(input: {
  topic: string;
  title: string;
  text: string;
  canvasRatio: SlideCanvasRatio;
  imagePromptContext: string;
  stylePreset: FullSlideImageStylePreset;
  requestedStyleId: FullSlideImageStyleId;
  sourcePrompt?: string;
}): string {
  const title = input.title.trim() || input.topic.trim();
  const bodyText = normalizeFullSlideBodyText(input.text);
  const sanitizedSourcePrompt = sanitizeFullSlideVisualDirection(input.sourcePrompt ?? "");
  const globalRequirements = input.imagePromptContext.trim();
  return [
    `สร้างภาพสไลด์สำเร็จรูปทั้งหน้า อัตราส่วน ${input.canvasRatio} โดยภาพสุดท้ายต้องเป็น poster/infographic editorial slide ไม่ใช่ภาพถ่ายเปล่า`,
    "Style direction: realistic photography + premium parenting/editorial magazine layout + clean luxury infographic. Use cinematic realistic lighting, soft natural shadows, shallow depth of field, warm modern minimal mood, high-resolution details, realistic human expression.",
    "Layout requirements: reserve a clear top area for a large Thai headline; use the photo as an integrated background/focal image; add one translucent white/cream rounded text box in the lower half for explanatory copy; add 2-4 small clean callout chips/cards near the bottom when the content supports it; keep generous spacing and mobile-readable hierarchy.",
    "Typography requirements: render readable Thai modern sans-serif typography inside the image, large bold headline, concise body text, clean magazine spacing, no misspellings, no random extra words, no placeholder text.",
    "Important: the image must visibly contain the title and explanatory Thai text. Do not create a photo-only result. Do not follow any old instruction that says no text or no letters.",
    "Negative requirements: no cartoon, no illustration, no distorted hands, no blurry text, no watermark, no logo, no app UI, no empty text boxes, no unreadable micro text.",
    `Style preset for every slide in this project: ${input.stylePreset.label}${input.requestedStyleId === AUTO_FULL_SLIDE_STYLE_ID ? " (auto-selected)" : ""}. Keep this exact visual system consistent across all pages in the project.`,
    `Style preset contract:\n${input.stylePreset.contract}`,
    input.topic.trim() ? `Presentation topic: ${input.topic.trim()}` : "",
    title ? `หัวข้อใหญ่ที่ต้องอยู่บนภาพ:\n${title}` : "",
    bodyText ? `ข้อความอธิบายที่ต้องจัดวางให้อ่านง่ายบนภาพ:\n${bodyText}` : "",
    sanitizedSourcePrompt ? `Visual subject/background direction:\n${sanitizedSourcePrompt}` : "",
    globalRequirements ? `Additional global visual requirements:\n${globalRequirements}` : "",
    "Composition target: similar to a premium Thai parenting article cover or vertical mobile infographic, with photo realism plus designed text blocks and balanced editorial composition.",
  ].filter(Boolean).join("\n\n");
}

function buildFullSlideImagePrompts(input: {
  bundle: PreparedSlideBundle | null;
  topic: string;
  article: string;
  canvasRatio: SlideCanvasRatio;
  imagePromptContext: string;
  styleId: FullSlideImageStyleId;
}): PreparedImagePrompt[] {
  if (!input.bundle) {
    return [];
  }
  const stylePreset = resolveFullSlideImageStylePreset({
    styleId: input.styleId,
    topic: input.topic,
    article: input.article,
    bundle: input.bundle,
  });
  if (input.bundle.preflightPages?.length) {
    const promptByPage = new Map<number, PreparedImagePrompt[]>();
    for (const prompt of input.bundle.imagePrompts) {
      const bucket = promptByPage.get(prompt.pageNumber) ?? [];
      bucket.push(prompt);
      promptByPage.set(prompt.pageNumber, bucket);
    }
    return input.bundle.preflightPages
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page) => {
        const pagePrompts = (promptByPage.get(page.pageNumber) ?? [])
          .slice()
          .sort((left, right) => left.imageIndex - right.imageIndex);
        return {
          id: `full-slide-${page.pageNumber}`,
          pageNumber: page.pageNumber,
          imageIndex: 1,
          placementRole: "hero",
          shortLabel: page.titleHint || `Slide ${page.pageNumber}`,
          prompt: buildFullSlideImagePrompt({
            topic: input.topic,
            title: page.titleHint,
            text: page.compiledText,
            canvasRatio: input.canvasRatio,
            imagePromptContext: input.imagePromptContext,
            stylePreset,
            requestedStyleId: input.styleId,
            sourcePrompt: pagePrompts.map((prompt) => prompt.prompt).join("\n\n"),
          }),
        };
      });
  }
  const leadPromptsByPage = new Map<number, PreparedImagePrompt>();
  for (const prompt of input.bundle.imagePrompts.slice().sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex)) {
    if (!leadPromptsByPage.has(prompt.pageNumber)) {
      leadPromptsByPage.set(prompt.pageNumber, prompt);
    }
  }
  return Array.from(leadPromptsByPage.values()).map((prompt) => ({
    ...prompt,
    id: `full-slide-${prompt.pageNumber}`,
    shortLabel: prompt.shortLabel || `Slide ${prompt.pageNumber}`,
    prompt: buildFullSlideImagePrompt({
      topic: input.topic,
      title: prompt.shortLabel,
      text: "",
      canvasRatio: input.canvasRatio,
      imagePromptContext: input.imagePromptContext,
      stylePreset,
      requestedStyleId: input.styleId,
      sourcePrompt: prompt.prompt,
    }),
  }));
}

function buildFullSlideImageDeckJson(input: {
  canvasRatio: SlideCanvasRatio;
  assets: GeneratedImageAsset[];
}): string {
  return JSON.stringify({
    canvas: { ratio: input.canvasRatio },
    slides: input.assets
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex)
      .map((asset) => ({
        title: asset.shortLabel || `Slide ${asset.pageNumber}`,
        notes: asset.prompt,
        elements: [
          {
            kind: "image",
            role: "full-slide",
            source: asset.url,
            xPct: 0,
            yPct: 0,
            wPct: 100,
            hPct: 100,
            fit: "cover",
            cornerRadius: 0,
          },
        ],
      })),
  }, null, 2);
}

function normalizeLibraryMediaItems(
  rows: unknown,
  currentUserId: number | null,
): PickerAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const normalized: PickerAsset[] = [];
  for (const rawRow of rows) {
    const row = rawRow as LibraryResultItemLike;
    const id = Number(row.id ?? row.item_id);
    if (!Number.isFinite(id)) {
      continue;
    }
    if (String(row.item_type || "").toLowerCase() !== "image") {
      continue;
    }
    const normalizedSourceUrl = normalizeMediaSourceUrl(String(row.source_url || "").trim());
    if (!normalizedSourceUrl) {
      continue;
    }
    const title = String(row.title || `image #${id}`).trim() || `image #${id}`;
    const thumbnailUrl = normalizeMediaSourceUrl(
      String(row.thumbnail_url || row.preview_url || row.poster_url || normalizedSourceUrl).trim(),
    );
    const ownerUserId = Number(row.owner_user_id);
    const accessSource = String(row.access_source || "").toLowerCase();
    const isSharedByAccessSource = accessSource === "shared_group" || accessSource === "shared_direct";
    const isSharedByOwner = Number.isFinite(ownerUserId)
      && currentUserId !== null
      && ownerUserId !== currentUserId;
    normalized.push({
      id,
      title,
      sourceUrl: normalizedSourceUrl,
      thumbnailUrl,
      sourceType: isSharedByAccessSource || isSharedByOwner ? "shared" : "library",
    });
  }
  return normalized;
}

function readFirstHttpUrl(value: unknown, visited = new WeakSet<object>()): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstHttpUrl(item, visited);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (visited.has(record)) {
    return null;
  }
  visited.add(record);
  for (const key of ["url", "image_url", "imageUrl", "result_url", "resultUrl", "signed_url", "signedUrl", "src"]) {
    const found = readFirstHttpUrl(record[key], visited);
    if (found) {
      return found;
    }
  }
  for (const nestedValue of Object.values(record)) {
    const found = readFirstHttpUrl(nestedValue, visited);
    if (found) {
      return found;
    }
  }
  return null;
}

function extractMediaHistoryResultUrl(task: MediaHistoryTaskLike): string | null {
  const directUrl = String(task.resultUrl || "").trim();
  if (directUrl && /^https?:\/\//i.test(directUrl)) {
    return directUrl;
  }
  const resultData = task.resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }
  const parsedResultJson = typeof resultData.resultJson === "string"
    ? (() => {
      try {
        return JSON.parse(resultData.resultJson);
      } catch {
        return null;
      }
    })()
    : null;
  return (
    readFirstHttpUrl(resultData.output)
    || readFirstHttpUrl(resultData.result)
    || readFirstHttpUrl(resultData.data)
    || readFirstHttpUrl(resultData.response)
    || readFirstHttpUrl(parsedResultJson)
    || readFirstHttpUrl(resultData)
  );
}

function extractMediaHistoryThumbnailUrl(task: MediaHistoryTaskLike): string | null {
  const resultData = task.resultData;
  if (!resultData || typeof resultData !== "object") {
    return null;
  }
  const parsedResultJson = typeof resultData.resultJson === "string"
    ? (() => {
      try {
        return JSON.parse(resultData.resultJson);
      } catch {
        return null;
      }
    })()
    : null;
  return (
    readFirstHttpUrl(resultData.poster)
    || readFirstHttpUrl(resultData.poster_url)
    || readFirstHttpUrl(resultData.posterUrl)
    || readFirstHttpUrl(resultData.thumbnail)
    || readFirstHttpUrl(resultData.thumbnail_url)
    || readFirstHttpUrl(resultData.thumbnailUrl)
    || readFirstHttpUrl(parsedResultJson?.poster)
    || readFirstHttpUrl(parsedResultJson?.thumbnail)
    || null
  );
}

function normalizeMediaHistoryItems(
  rows: unknown,
  query: string,
): PickerAsset[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const normalizedQuery = query.trim().toLowerCase();
  const normalized: PickerAsset[] = [];
  for (const rawRow of rows) {
    const row = rawRow as MediaHistoryTaskLike;
    if (String(row.status || "").toLowerCase() !== "completed") {
      continue;
    }
    if (String(row.mediaType || "").toLowerCase() !== "image") {
      continue;
    }
    const sourceUrl = normalizeMediaSourceUrl(extractMediaHistoryResultUrl(row));
    if (!sourceUrl) {
      continue;
    }
    const title = String(row.prompt || row.model || row.taskId || row.id || "History image").trim();
    const searchable = `${title} ${row.model || ""} ${row.prompt || ""} ${row.id || ""} ${row.taskId || ""}`.toLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) {
      continue;
    }
    const seed = `image:${row.id || row.taskId || ""}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash * 31) + seed.charCodeAt(index)) | 0;
    }
    normalized.push({
      id: -Math.max(1, Math.abs(hash)),
      title,
      sourceUrl,
      thumbnailUrl: normalizeMediaSourceUrl(extractMediaHistoryThumbnailUrl(row) || sourceUrl),
      sourceType: "history",
    });
  }
  return normalized;
}

function mergePickerAssets(first: PickerAsset[], second: PickerAsset[]): PickerAsset[] {
  const merged: PickerAsset[] = [];
  const seen = new Set<string>();
  for (const asset of [...first, ...second]) {
    const key = asset.sourceUrl.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(asset);
  }
  return merged;
}

export interface PresentationArticleGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  deckId: number;
  initialTopic?: string;
  initialArticle?: string;
  initialCanvasRatio?: string;
  onUseArticle: (article: string) => Promise<void> | void;
  onInsertSlides: (
    draft: GeneratedSlideDraft,
    options?: { closeDialog?: boolean; showSuccessToast?: boolean },
  ) => Promise<PresentationInsertSlidesResult> | PresentationInsertSlidesResult;
}

export function PresentationArticleGeneratorDialog({
  open,
  onClose,
  deckId,
  initialTopic,
  initialArticle,
  initialCanvasRatio,
  onUseArticle,
  onInsertSlides,
}: PresentationArticleGeneratorDialogProps) {
  const { t } = useScopedTranslation("presentation");
  const { user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const wasOpenRef = useRef(false);
  const workflowStepRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const workflowPrimaryActionRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const insertSlidesButtonRef = useRef<HTMLButtonElement | null>(null);

  const [topic, setTopic] = useState(initialTopic ?? "");
  const [article, setArticle] = useState(initialArticle ?? "");
  const [executionSource, setExecutionSource] = useState<ExecutionSource>("skill");
  const [skillId, setSkillId] = useState<string>("");
  const [agencyId, setAgencyId] = useState<string>("");
  const [agencyName, setAgencyName] = useState<string>("");
  const [requiresWebSearch, setRequiresWebSearch] = useState(false);
  const [requiresThinking, setRequiresThinking] = useState(false);
  const [targetImageCount, setTargetImageCount] = useState(8);
  const [isAgencyModalOpen, setIsAgencyModalOpen] = useState(false);
  const [imageModel, setImageModel] = useState("");
  const [canvasRatio, setCanvasRatio] = useState<SlideCanvasRatio>(normalizeCanvasRatio(initialCanvasRatio));
  const [slideVisualMode, setSlideVisualMode] = useState<SlideVisualMode>("editable");
  const [fullSlideImageStyleId, setFullSlideImageStyleId] = useState<FullSlideImageStyleId>(AUTO_FULL_SLIDE_STYLE_ID);
  const [advancedMediaOptionsEnabled, setAdvancedMediaOptionsEnabled] = useState(false);
  const [mediaModelExtraParams, setMediaModelExtraParams] = useState<Record<string, unknown>>({});
  const [imagePromptContext, setImagePromptContext] = useState("");
  const [slideSkillId, setSlideSkillId] = useState("");
  const [slideOutputFormat, setSlideOutputFormat] = useState<SlideOutputFormat>("json");
  const [editorialPlannerAudiencePreset, setEditorialPlannerAudiencePreset] = useState<EditorialPlannerAudiencePreset>("parents");
  const [editorialPlannerTonePreset, setEditorialPlannerTonePreset] = useState<EditorialPlannerTonePreset>("warm_parenting");
  const [editorialPlannerFitPreset, setEditorialPlannerFitPreset] = useState<EditorialPlannerFitPreset>("balanced");
  const [editorialPlannerPageCountMode, setEditorialPlannerPageCountMode] = useState<EditorialPlannerPageCountMode>("auto");
  const [editorialPlannerRequestedPageCount, setEditorialPlannerRequestedPageCount] = useState(6);
  const [editorialPlannerGlobalStylePrompt, setEditorialPlannerGlobalStylePrompt] = useState("");
  const [editorialPlannerRenderSafetyJson, setEditorialPlannerRenderSafetyJson] = useState("");
  const [editorialPlannerPageFillRulesJson, setEditorialPlannerPageFillRulesJson] = useState("");
  const [editorialPlannerQualityOptimizerJson, setEditorialPlannerQualityOptimizerJson] = useState("");
  const [editorialPlannerImageAssets, setEditorialPlannerImageAssets] = useState<EditorialPlannerImageAssetDraft[]>([]);
  const [preparedBundle, setPreparedBundle] = useState<PreparedSlideBundle | null>(null);
  const [preparedBundleSkillId, setPreparedBundleSkillId] = useState("");
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageAsset[]>([]);
  const [generatedSlideDraft, setGeneratedSlideDraft] = useState<GeneratedSlideDraft | null>(null);
  const [generatedSlideDraftSkillId, setGeneratedSlideDraftSkillId] = useState("");
  const [generatedSlideDraftSessionSource, setGeneratedSlideDraftSessionSource] = useState<GeneratedSlideDraftSessionSource>("empty");
  const [slidePayloadEditorJson, setSlidePayloadEditorJson] = useState("");
  const [slidePayloadEditorDirty, setSlidePayloadEditorDirty] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState<string>("");
  const [slotPickerKey, setSlotPickerKey] = useState<string | null>(null);
  const [slotPickerTab, setSlotPickerTab] = useState<"library" | "history">("library");
  const [slotPickerSearchQuery, setSlotPickerSearchQuery] = useState("");
  const [regeneratingSlotKey, setRegeneratingSlotKey] = useState<string | null>(null);
  const [previewImageAsset, setPreviewImageAsset] = useState<GeneratedImageAsset | null>(null);
  const [guidedWorkflowStep, setGuidedWorkflowStep] = useState<number | null>(null);
  const [guidedFooterAction, setGuidedFooterAction] = useState<"insert" | null>(null);

  const skillsQuery = trpc.skills.listFromDb.useQuery({ enabledOnly: true, limit: 100 }, { enabled: open });
  const mediaModelsQuery = trpc.media.getModels.useQuery({ type: "image" }, { enabled: open, staleTime: 300_000 });
  const libraryImageListQuery = trpc.library.listDocuments.useQuery(
    {
      limit: 50,
      offset: 0,
      filters: { itemType: "image" },
    },
    { enabled: open },
  );
  const libraryImageSearchQuery = trpc.library.search.useQuery(
    {
      query: slotPickerSearchQuery,
      limit: 50,
      offset: 0,
      filters: { itemType: "image" },
    },
    { enabled: open && slotPickerSearchQuery.trim().length > 0 },
  );
  const mediaHistoryImageQuery = trpc.media.listTasks.useQuery(
    {
      mediaType: "image",
      status: "completed",
      limit: 50,
      offset: 0,
    },
    { enabled: open },
  );
  const generateArticleMutation = trpc.presentation.ai.generateArticle.useMutation();
  const prepareSlideBundleMutation = trpc.presentation.ai.prepareSlideBundle.useMutation();
  const generateSlideDraftMutation = trpc.presentation.ai.generateSlideDraft.useMutation();
  const generateImageAsyncMutation = trpc.media.generateImageAsync.useMutation();
  const sandboxJobStatusQuery = trpc.sandbox.getJobStatus.useQuery(
    { jobId: generatedSlideDraft?.artifactJobId ?? "" },
    {
      enabled: open && Boolean(generatedSlideDraft?.artifactJobId) && !generatedSlideDraft?.downloadUrl,
      refetchInterval: 1500,
    },
  );

  const allSkillOptions = useMemo<SkillOption[]>(
    () => ((skillsQuery.data ?? []) as RawSkillOption[])
      .map((skill) => ({
        id: String(skill.slug ?? skill.id),
        name: String(skill.name ?? skill.slug ?? skill.id),
        category: skill.category ?? null,
        executionMode: skill.executionMode ?? null,
      })),
    [skillsQuery.data],
  );
  const articleSkillOptions = useMemo(
    () => allSkillOptions.filter(isArticleFriendlySkill),
    [allSkillOptions],
  );
  const slideSkillOptions = useMemo(
    () => allSkillOptions.filter(isSlideGenerationSkill),
    [allSkillOptions],
  );
  const imageModels = useMemo(
    () => ((mediaModelsQuery.data?.models ?? []) as MediaModelOption[]),
    [mediaModelsQuery.data?.models],
  );
  const defaultImageModelId = useMemo(
    () => String(mediaModelsQuery.data?.defaults?.image ?? imageModels[0]?.id ?? ""),
    [imageModels, mediaModelsQuery.data?.defaults?.image],
  );
  const selectedImageModelId = imageModel.trim() || defaultImageModelId;
  const selectedImageModelConfig = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId),
    [imageModels, selectedImageModelId],
  );
  const selectedMediaModelFields = useMemo(
    () => parseModelInputFields(selectedImageModelConfig),
    [selectedImageModelConfig],
  );
  const detectedLanguage = useMemo<ArticleLanguage>(() => detectArticleLanguage(topic), [topic]);
  const detectedLanguageLabel = detectedLanguage === "th"
    ? t("dialog.articleBuilder.languageThai")
    : t("dialog.articleBuilder.languageEnglish");
  const selectedArticleSkill = useMemo(
    () => articleSkillOptions.find((skill) => skill.id === skillId) ?? null,
    [articleSkillOptions, skillId],
  );
  const selectedSlideSkill = useMemo(
    () => slideSkillOptions.find((skill) => skill.id === slideSkillId) ?? null,
    [slideSkillId, slideSkillOptions],
  );
  const selectedSlideSkillLabel = selectedSlideSkill?.name?.trim().toLowerCase() ?? "";
  const isEditorialLayoutPlannerSelected = selectedSlideSkill?.id === EDITORIAL_LAYOUT_PLANNER_SKILL_ID;
  const preparedBundleMatchesSelectedSkill = useMemo(() => {
    if (!preparedBundle) {
      return false;
    }
    if (preparedBundleSkillId.trim() && slideSkillId.trim()) {
      return preparedBundleSkillId.trim() === slideSkillId.trim();
    }
    return preparedBundle.slideSkillLabel.trim().toLowerCase() === selectedSlideSkillLabel;
  }, [preparedBundle, preparedBundleSkillId, selectedSlideSkillLabel, slideSkillId]);
  const generatedSlideDraftMatchesSelectedSkill = useMemo(() => {
    if (!generatedSlideDraft) {
      return false;
    }
    if (generatedSlideDraftSkillId.trim() && slideSkillId.trim()) {
      return generatedSlideDraftSkillId.trim() === slideSkillId.trim();
    }
    return preparedBundleMatchesSelectedSkill;
  }, [generatedSlideDraft, generatedSlideDraftSkillId, preparedBundleMatchesSelectedSkill, slideSkillId]);
  const bundleNeedsRefreshAfterSkillChange = Boolean(preparedBundle) && !preparedBundleMatchesSelectedSkill;
  const slideDraftNeedsRefreshAfterSkillChange = Boolean(generatedSlideDraft) && !generatedSlideDraftMatchesSelectedSkill;
  const activeEditorialPlannerQuickPresetId = useMemo(
    () => EDITORIAL_PLANNER_QUICK_PRESETS.find((preset) => (
      preset.audience === editorialPlannerAudiencePreset
      && preset.tone === editorialPlannerTonePreset
      && preset.fit === editorialPlannerFitPreset
    ))?.id ?? null,
    [editorialPlannerAudiencePreset, editorialPlannerFitPreset, editorialPlannerTonePreset],
  );
  const recommendedEditorialPlannerPreset = useMemo(
    () => inferRecommendedEditorialPlannerPreset({
      canvasRatio,
      language: detectedLanguage,
      topic,
    }),
    [canvasRatio, detectedLanguage, topic],
  );
  const editorialPlannerJsonError = useMemo(() => {
    try {
      parseEditorialPlannerJsonObject(editorialPlannerRenderSafetyJson, "Render safety JSON");
      parseEditorialPlannerJsonObject(editorialPlannerPageFillRulesJson, "Page fill rules JSON");
      parseEditorialPlannerJsonObject(editorialPlannerQualityOptimizerJson, "Quality optimizer JSON");
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Planner JSON is invalid.";
    }
  }, [
    editorialPlannerPageFillRulesJson,
    editorialPlannerQualityOptimizerJson,
    editorialPlannerRenderSafetyJson,
  ]);
  const editorialPlannerAssetValidation = useMemo(
    () => summarizeEditorialPlannerImageAssetIssues(editorialPlannerImageAssets),
    [editorialPlannerImageAssets],
  );
  const editorialPlannerResolvedDefaults = useMemo(() => getEditorialPlannerResolvedDefaults({
    canvasRatio,
    language: detectedLanguage,
    imagePromptContext,
    targetAudiencePreset: editorialPlannerAudiencePreset,
    tonePreset: editorialPlannerTonePreset,
    fitPreset: editorialPlannerFitPreset,
    globalStylePrompt: editorialPlannerGlobalStylePrompt,
    renderSafety: (() => {
      try {
        return parseEditorialPlannerJsonObject(editorialPlannerRenderSafetyJson, "Render safety JSON");
      } catch {
        return null;
      }
    })(),
    pageFillRules: (() => {
      try {
        return parseEditorialPlannerJsonObject(editorialPlannerPageFillRulesJson, "Page fill rules JSON");
      } catch {
        return null;
      }
    })(),
    qualityOptimizer: (() => {
      try {
        return parseEditorialPlannerJsonObject(editorialPlannerQualityOptimizerJson, "Quality optimizer JSON");
      } catch {
        return null;
      }
    })(),
  }), [
    canvasRatio,
    detectedLanguage,
    editorialPlannerAudiencePreset,
    editorialPlannerFitPreset,
    editorialPlannerGlobalStylePrompt,
    editorialPlannerPageFillRulesJson,
    editorialPlannerQualityOptimizerJson,
    editorialPlannerRenderSafetyJson,
    editorialPlannerTonePreset,
    imagePromptContext,
  ]);
  const editorialPlannerPresetPreview = useMemo(() => ({
    target_audience: editorialPlannerResolvedDefaults.target_audience,
    tone: editorialPlannerResolvedDefaults.tone,
    global_style_prompt: editorialPlannerResolvedDefaults.global_style_prompt,
    render_safety: editorialPlannerResolvedDefaults.render_safety,
    page_fill_rules: editorialPlannerResolvedDefaults.page_fill_rules,
    quality_optimizer: editorialPlannerResolvedDefaults.quality_optimizer,
  }), [editorialPlannerResolvedDefaults]);
  const editorialPlannerPayloadPreviewJson = useMemo(() => {
    if (editorialPlannerJsonError) {
      return editorialPlannerJsonError;
    }
    return JSON.stringify(buildEditorialLayoutPlannerPayload({
      articleTitle: topic.trim() || "Untitled article",
      articleBody: article.trim(),
      articleLanguage: detectedLanguage,
      canvasRatio,
      imagePromptContext,
      maxPages: preparedBundle?.maxPages ?? 6,
      targetAudiencePreset: editorialPlannerAudiencePreset,
      tonePreset: editorialPlannerTonePreset,
      fitPreset: editorialPlannerFitPreset,
      pageCountMode: editorialPlannerPageCountMode,
      requestedPageCount: editorialPlannerRequestedPageCount,
      globalStylePrompt: editorialPlannerGlobalStylePrompt,
      renderSafety: parseEditorialPlannerJsonObject(editorialPlannerRenderSafetyJson, "Render safety JSON"),
      pageFillRules: parseEditorialPlannerJsonObject(editorialPlannerPageFillRulesJson, "Page fill rules JSON"),
      qualityOptimizer: parseEditorialPlannerJsonObject(editorialPlannerQualityOptimizerJson, "Quality optimizer JSON"),
      imageAssets: normalizeEditorialPlannerImageAssets(editorialPlannerImageAssets).map((asset) => ({
        asset_type: asset.assetType,
        label: asset.label,
        page_hint: asset.pageHint,
        prompt: asset.prompt,
        reference: asset.reference,
      })) as EditorialPlannerImageAssetInput[],
    }), null, 2);
  }, [
    article,
    canvasRatio,
    detectedLanguage,
    editorialPlannerAudiencePreset,
    editorialPlannerFitPreset,
    editorialPlannerGlobalStylePrompt,
    editorialPlannerImageAssets,
    editorialPlannerJsonError,
    editorialPlannerPageCountMode,
    editorialPlannerPageFillRulesJson,
    editorialPlannerQualityOptimizerJson,
    editorialPlannerRenderSafetyJson,
    editorialPlannerRequestedPageCount,
    editorialPlannerTonePreset,
    imagePromptContext,
    preparedBundle?.maxPages,
    topic,
  ]);
  const artifactCapableSlideSkillOptions = useMemo(
    () => slideSkillOptions.filter((skill) => supportsGeneratedSlideArtifacts(skill)),
    [slideSkillOptions],
  );
  const selectedSlideSkillSupportsArtifacts = supportsGeneratedSlideArtifacts(selectedSlideSkill);
  const artifactRequiredForSelectedOutput = requiresGeneratedSlideArtifact(slideOutputFormat);
  const isFullSlideImageMode = slideVisualMode === "full-slide-image";
  const activeFullSlideImageStylePreset = useMemo(
    () => resolveFullSlideImageStylePreset({
      styleId: fullSlideImageStyleId,
      topic,
      article,
      bundle: preparedBundle,
    }),
    [article, fullSlideImageStyleId, preparedBundle, topic],
  );
  const supportedCanvasRatioIds = useMemo<SlideCanvasRatio[]>(() => {
    const modelRatios = getSupportedCanvasRatiosForModel(selectedImageModelConfig);
    if (modelRatios.length > 0) {
      return modelRatios;
    }
    return isFullSlideImageMode ? FULL_SLIDE_IMAGE_FALLBACK_RATIOS : SUPPORTED_SLIDE_RATIOS;
  }, [isFullSlideImageMode, selectedImageModelConfig]);
  const supportedCanvasOptions = useMemo(
    () => PRESENTATION_CANVAS_PRESETS.filter((preset) => supportedCanvasRatioIds.includes(preset.id as SlideCanvasRatio)),
    [supportedCanvasRatioIds],
  );
  const slideOutputFormats = useMemo(
    () => Array.from(new Set<SlideOutputFormat>(["json", slideOutputFormat])),
    [slideOutputFormat],
  );
  const selectableSlideOutputFormats = useMemo<SlideOutputFormat[]>(
    () => (isEditorialLayoutPlannerSelected ? ["json"] : SUPPORTED_OUTPUT_FORMATS),
    [isEditorialLayoutPlannerSelected],
  );
  const fullSlideImagePrompts = useMemo(
    () => buildFullSlideImagePrompts({
      bundle: preparedBundle,
      topic,
      article,
      canvasRatio,
      imagePromptContext,
      styleId: fullSlideImageStyleId,
    }),
    [article, canvasRatio, fullSlideImageStyleId, imagePromptContext, preparedBundle, topic],
  );
  const activeImagePrompts = useMemo(
    () => (isFullSlideImageMode ? fullSlideImagePrompts : (preparedBundle?.imagePrompts ?? [])),
    [fullSlideImagePrompts, isFullSlideImageMode, preparedBundle?.imagePrompts],
  );
  const normalizedGeneratedImages = useMemo(
    () => normalizeGeneratedImagesForPrompts(activeImagePrompts, generatedImages, canvasRatio),
    [activeImagePrompts, canvasRatio, generatedImages],
  );
  const missingImagePrompts = useMemo(() => {
    const prompts = activeImagePrompts;
    if (prompts.length === 0) {
      return [] as PreparedImagePrompt[];
    }
    const availableSlots = new Set(normalizedGeneratedImages.map((asset) => getPreparedImageSlotKey(asset)));
    return prompts.filter((prompt) => !availableSlots.has(getPreparedImageSlotKey(prompt)));
  }, [activeImagePrompts, normalizedGeneratedImages]);
  const generatedImagesAreCurrentForBundle = useMemo(
    () => generatedImagesMatchPrompts(activeImagePrompts, normalizedGeneratedImages, canvasRatio),
    [activeImagePrompts, canvasRatio, normalizedGeneratedImages],
  );
  const articleStepStatus = useMemo<WizardStepStatus>(() => {
    if (generateArticleMutation.isPending) {
      return "running";
    }
    if (article.trim()) {
      return "done";
    }
    return topic.trim() ? "ready" : "idle";
  }, [article, generateArticleMutation.isPending, topic]);
  const bundleStepStatus = useMemo<WizardStepStatus>(() => {
    if (prepareSlideBundleMutation.isPending) {
      return "running";
    }
    if (bundleNeedsRefreshAfterSkillChange) {
      return "stale";
    }
    if (preparedBundle) {
      return "done";
    }
    return article.trim() ? "ready" : "idle";
  }, [article, bundleNeedsRefreshAfterSkillChange, prepareSlideBundleMutation.isPending, preparedBundle]);
  const imageStepStatus = useMemo<WizardStepStatus>(() => {
    if (isGeneratingImages || generateImageAsyncMutation.isPending) {
      return "running";
    }
    if (bundleNeedsRefreshAfterSkillChange) {
      return "stale";
    }
    if (preparedBundle && generatedImagesAreCurrentForBundle) {
      return "done";
    }
    return preparedBundle ? "ready" : "idle";
  }, [bundleNeedsRefreshAfterSkillChange, generateImageAsyncMutation.isPending, generatedImagesAreCurrentForBundle, isGeneratingImages, preparedBundle]);
  const availableSlideArtifacts = useMemo(
    () => (generatedSlideDraft?.artifacts ?? []).map(normalizeSlideArtifact).filter((artifact): artifact is SlideArtifact => Boolean(artifact)),
    [generatedSlideDraft?.artifacts],
  );
  const inspectableSlideJson = useMemo(
    () => resolveInspectableSlideJson(generatedSlideDraft),
    [generatedSlideDraft],
  );
  const hasImportableSlides = useMemo(
    () => hasImportableSlidesJson(inspectableSlideJson)
    || availableSlideArtifacts.some((artifact) => artifact.format === "json"),
    [availableSlideArtifacts, inspectableSlideJson],
  );
  const generatedSlideImportability = useMemo(
    () => inspectGeneratedSlideImportability(inspectableSlideJson),
    [inspectableSlideJson],
  );
  const generatedSlideRunTimestamp = useMemo(
    () => formatAuditTimestamp(generatedSlideDraft?.generatedAt),
    [generatedSlideDraft?.generatedAt],
  );
  const generatedSlideImportedTimestamp = useMemo(
    () => formatAuditTimestamp(generatedSlideDraft?.importedAt),
    [generatedSlideDraft?.importedAt],
  );
  const generatedSlideSelectedSkillId = useMemo(() => {
    const selectedSkillIdFromDraft = typeof generatedSlideDraft?.selectedSkillId === "string"
      ? generatedSlideDraft.selectedSkillId.trim()
      : "";
    if (selectedSkillIdFromDraft) {
      return selectedSkillIdFromDraft;
    }
    return generatedSlideDraftSkillId.trim() || slideSkillId.trim() || null;
  }, [generatedSlideDraft?.selectedSkillId, generatedSlideDraftSkillId, slideSkillId]);
  const generatedSlideSelectedSkillLabel = useMemo(() => {
    const selectedSkillNameFromDraft = typeof generatedSlideDraft?.selectedSkillName === "string"
      ? generatedSlideDraft.selectedSkillName.trim()
      : "";
    if (selectedSkillNameFromDraft) {
      return selectedSkillNameFromDraft;
    }
    return selectedSlideSkillLabel.trim() || null;
  }, [generatedSlideDraft?.selectedSkillName, selectedSlideSkillLabel]);
  const generatedSlideRuntimeBundleId = useMemo(() => {
    const runtimeBundleId = typeof generatedSlideDraft?.runtimeBundleSkillId === "string"
      ? generatedSlideDraft.runtimeBundleSkillId.trim()
      : "";
    return runtimeBundleId || null;
  }, [generatedSlideDraft?.runtimeBundleSkillId]);
  const generatedSlideRuntimeBundleLabel = useMemo(() => {
    const runtimeBundleName = typeof generatedSlideDraft?.runtimeBundleSkillName === "string"
      ? generatedSlideDraft.runtimeBundleSkillName.trim()
      : "";
    return runtimeBundleName || null;
  }, [generatedSlideDraft?.runtimeBundleSkillName]);
  const generatedSlidePayloadSourceLabel = useMemo(() => {
    if (generatedSlideDraft?.importedSlideJson?.trim()) {
      return generatedSlideDraft.importedFromArtifact
        ? "Payload shown: JSON artifact that was actually imported into this deck."
        : "Payload shown: Slide JSON that was actually imported into this deck.";
    }
    return "Payload shown: Latest generated slide JSON.";
  }, [generatedSlideDraft?.importedFromArtifact, generatedSlideDraft?.importedSlideJson]);
  const generatedSlideSnapshotSourceLabel = useMemo(() => {
    switch (generatedSlideDraftSessionSource) {
      case "restored-draft":
        return "Snapshot source: restored from the saved draft for this project.";
      case "fresh-run":
        return "Snapshot source: generated in this session.";
      case "empty":
      default:
        return null;
    }
  }, [generatedSlideDraftSessionSource]);
  const generatedSlideImportabilityBadge = useMemo(() => {
    switch (generatedSlideImportability.status) {
      case "importable":
        return {
          label: `Importable ${generatedSlideImportability.importableSlides}/${generatedSlideImportability.totalSlides}`,
          className: "border-emerald-200 bg-emerald-50 text-emerald-700",
          hint: "Slide JSON นี้มี slides ที่นำเข้าได้จริง",
        };
      case "empty-slides":
        return {
          label: `Empty slides ${generatedSlideImportability.totalSlides}`,
          className: "border-amber-200 bg-amber-50 text-amber-700",
          hint: "พบ slides แต่ทุกหน้าว่างหรือไม่มี element ที่นำเข้าได้",
        };
      case "missing-slides":
        return {
          label: "Missing slides[]",
          className: "border-rose-200 bg-rose-50 text-rose-700",
          hint: "JSON นี้ไม่มี top-level slides[] หรือไม่มี layoutSpec.slides[]",
        };
      case "malformed":
        return {
          label: "Malformed JSON",
          className: "border-rose-200 bg-rose-50 text-rose-700",
          hint: "JSON parse ไม่ได้หรือมี envelope ที่อ่านไม่ออก",
        };
      default:
        return {
          label: "No slide JSON",
          className: "border-slate-200 bg-slate-50 text-slate-600",
          hint: "ยังไม่มี draft ล่าสุดสำหรับตรวจ importability",
        };
    }
  }, [generatedSlideImportability]);
  const slideStepStatus = useMemo<WizardStepStatus>(() => {
    if (generateSlideDraftMutation.isPending) {
      return "running";
    }
    if (bundleNeedsRefreshAfterSkillChange || slideDraftNeedsRefreshAfterSkillChange) {
      return "stale";
    }
    if (hasImportableSlides) {
      return "done";
    }
    return preparedBundle ? "ready" : "idle";
  }, [bundleNeedsRefreshAfterSkillChange, generateSlideDraftMutation.isPending, hasImportableSlides, preparedBundle, slideDraftNeedsRefreshAfterSkillChange]);
  const bundleRefreshHint = bundleNeedsRefreshAfterSkillChange
    ? "เปลี่ยน slide skill แล้ว Bundle เดิมไม่ตรงกับ skill ปัจจุบัน กรุณา Prepare Bundle ใหม่"
    : null;
  const imageRefreshHint = bundleNeedsRefreshAfterSkillChange
    ? "รูปเดิมจะ reuse ได้เท่าที่ slot ยังตรงกัน แต่ควร Prepare Bundle ใหม่ก่อน"
    : null;
  const slideRefreshHint = bundleNeedsRefreshAfterSkillChange || slideDraftNeedsRefreshAfterSkillChange
    ? "Slide JSON เดิมมาจาก skill ก่อนหน้า กรุณา Generate Slide JSON ใหม่ก่อนนำเข้า"
    : null;
  const missingImagesBeforeSlideDraft = preparedBundle && activeImagePrompts.length > normalizedGeneratedImages.length
    ? {
        current: normalizedGeneratedImages.length,
        total: activeImagePrompts.length,
      }
    : null;
  const slideGenerationBlockedHint = missingImagesBeforeSlideDraft
    ? `กรุณาสร้างรูปภาพประกอบให้ครบก่อน Generate Slide JSON (${missingImagesBeforeSlideDraft.current}/${missingImagesBeforeSlideDraft.total}) เพื่อป้องกัน slide ไม่มีภาพ`
    : slideRefreshHint;
  const canInsertGeneratedSlides = hasImportableSlides && !slideGenerationBlockedHint && !generateSlideDraftMutation.isPending;
  const guidedWorkflowMessage = guidedWorkflowStep === 2
    ? "Recommended next step: Refresh bundle เพื่อให้ layout plan และ payload ตรงกับ slide skill ใหม่"
    : guidedWorkflowStep === 4
      ? "Recommended next step: Generate Slide JSON ใหม่จาก bundle ล่าสุดก่อนนำเข้า"
      : guidedFooterAction === "insert"
        ? "Recommended next step: Insert Slides เพื่อใช้งานผลลัพธ์ล่าสุดใน Presentation Editor"
        : null;
  useEffect(() => {
    if (!open) {
      return;
    }
    if (guidedFooterAction === "insert") {
      const timer = window.setTimeout(() => {
        insertSlidesButtonRef.current?.focus();
      }, 220);
      return () => window.clearTimeout(timer);
    }
    if (!guidedWorkflowStep) {
      return;
    }
    const node = workflowStepRefs.current[guidedWorkflowStep];
    const primaryAction = workflowPrimaryActionRefs.current[guidedWorkflowStep];
    if (!node) {
      return;
    }
    if (typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const timer = window.setTimeout(() => {
      primaryAction?.focus();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [guidedWorkflowStep, open]);
  const generatedImageCards = useMemo(() => {
    const assetBySlot = new Map(normalizedGeneratedImages.map((asset) => [getPreparedImageSlotKey(asset), asset] as const));
    const fallbackAssetBySlot = new Map<string, GeneratedImageAsset>();
    for (const asset of generatedImages) {
      if (!asset.url) {
        continue;
      }
      const slotKey = getPreparedImageSlotKey(asset);
      if (assetBySlot.has(slotKey)) {
        continue;
      }
      const previous = fallbackAssetBySlot.get(slotKey);
      const previousTime = previous?.updatedAt ? Date.parse(previous.updatedAt) : 0;
      const assetTime = asset.updatedAt ? Date.parse(asset.updatedAt) : 0;
      if (!previous || assetTime >= previousTime) {
        fallbackAssetBySlot.set(slotKey, asset);
      }
    }
    const plannedPrompts = activeImagePrompts;
    if (plannedPrompts.length > 0) {
      return plannedPrompts.map((prompt) => {
        const slotKey = getPreparedImageSlotKey(prompt);
        return {
          prompt,
          asset: assetBySlot.get(slotKey) ?? null,
          fallbackAsset: fallbackAssetBySlot.get(slotKey) ?? null,
        };
      });
    }
    return normalizedGeneratedImages.map((asset) => ({
      prompt: asset,
      asset,
      fallbackAsset: null,
    }));
  }, [activeImagePrompts, generatedImages, normalizedGeneratedImages]);
  const pageSlotCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const prompt of preparedBundle?.imagePrompts ?? []) {
      counts.set(prompt.pageNumber, (counts.get(prompt.pageNumber) ?? 0) + 1);
    }
    return counts;
  }, [preparedBundle?.imagePrompts]);
  const leadPromptByPage = useMemo(() => {
    const nextMap = new Map<number, PreparedImagePrompt>();
    const sortedPrompts = [...activeImagePrompts]
      .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex);
    for (const prompt of sortedPrompts) {
      if (!nextMap.has(prompt.pageNumber)) {
        nextMap.set(prompt.pageNumber, prompt);
      }
    }
    return nextMap;
  }, [activeImagePrompts]);
  const pageImagePlanOverrides = useMemo(
    () => (preparedBundle?.preflightPages ?? []).map((page) => ({
      pageNumber: page.pageNumber,
      maxImagesOverride: pageSlotCounts.get(page.pageNumber) ?? 0,
    }))
      .sort((left, right) => left.pageNumber - right.pageNumber),
    [pageSlotCounts, preparedBundle?.preflightPages],
  );
  const libraryPickerAssets = useMemo(
    () => {
      const parsedUserId = Number(user?.id);
      return normalizeLibraryMediaItems(
        (slotPickerSearchQuery.trim().length > 0
          ? libraryImageSearchQuery.data?.results
          : libraryImageListQuery.data?.results) ?? [],
        Number.isFinite(parsedUserId) ? parsedUserId : null,
      );
    },
    [
      libraryImageListQuery.data?.results,
      libraryImageSearchQuery.data?.results,
      slotPickerSearchQuery,
      user?.id,
    ],
  );
  const historyPickerAssets = useMemo(
    () => normalizeMediaHistoryItems(mediaHistoryImageQuery.data?.tasks ?? [], slotPickerSearchQuery),
    [mediaHistoryImageQuery.data?.tasks, slotPickerSearchQuery],
  );
  const pickerAssets = useMemo(
    () => mergePickerAssets(
      slotPickerTab === "history" ? historyPickerAssets : libraryPickerAssets,
      [],
    ),
    [historyPickerAssets, libraryPickerAssets, slotPickerTab],
  );
  const downloadableSlideArtifact = useMemo(
    () => {
      if (generatedSlideDraft?.downloadUrl) {
        return {
          format: slideOutputFormat,
          url: generatedSlideDraft.downloadUrl,
          key: generatedSlideDraft.downloadUrl,
          mimeType: "application/octet-stream",
          isPrimary: true,
        } satisfies SlideArtifact;
      }
      return pickPreferredSlideArtifact(availableSlideArtifacts, slideOutputFormat);
    },
    [availableSlideArtifacts, generatedSlideDraft?.downloadUrl, slideOutputFormat],
  );
  const syncedMediaModelExtraParams = useMemo(
    () => applyModelSyncTargets(
      selectedImageModelConfig,
      mergeExtraParams(
        buildDefaultExtraParamsForModel(selectedImageModelConfig),
        pickExtraParamsForModel(selectedImageModelConfig, mediaModelExtraParams),
      ),
      {
        prompt: "__auto_prompt__",
        aspectRatio: canvasRatio,
      },
    ) ?? {},
    [canvasRatio, mediaModelExtraParams, selectedImageModelConfig],
  );

  useEffect(() => {
    if (supportedCanvasRatioIds.includes(canvasRatio)) {
      return;
    }
    setCanvasRatio(supportedCanvasRatioIds[0] ?? "16:9");
    setGeneratedImages([]);
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
  }, [canvasRatio, supportedCanvasRatioIds]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) {
      return;
    }
    const persistedDraft = loadPersistedArticleBuilderDraft(deckId);
    if (persistedDraft) {
      const preparedPayloadJson = normalizeSlidePayloadJson(persistedDraft.preparedBundle?.slidePayloadJson);
      const generatedPayloadJson = normalizeSlidePayloadJson(
        persistedDraft.generatedSlideDraft?.slidePayloadJson,
        preparedPayloadJson,
      );
      const editorPayloadJson = normalizeSlidePayloadJson(
        persistedDraft.slidePayloadEditorJson,
        generatedPayloadJson,
      );
      setTopic(persistedDraft.topic);
      setArticle(persistedDraft.article);
      setExecutionSource(persistedDraft.executionSource);
      setSkillId(persistedDraft.skillId);
      setAgencyId(persistedDraft.agencyId);
      setAgencyName(persistedDraft.agencyName);
      setRequiresWebSearch(Boolean(persistedDraft.requiresWebSearch));
      setRequiresThinking(Boolean(persistedDraft.requiresThinking));
      setTargetImageCount(clampImageCount(persistedDraft.targetImageCount));
      setImageModel(persistedDraft.imageModel);
      setCanvasRatio(normalizeCanvasRatio(persistedDraft.canvasRatio));
      setSlideVisualMode(persistedDraft.slideVisualMode === "full-slide-image" ? "full-slide-image" : "editable");
      setFullSlideImageStyleId(normalizeFullSlideImageStyleId(persistedDraft.fullSlideImageStyleId));
      setAdvancedMediaOptionsEnabled(Boolean(persistedDraft.advancedMediaOptionsEnabled));
      setMediaModelExtraParams(persistedDraft.mediaModelExtraParams ?? {});
      setImagePromptContext(persistedDraft.imagePromptContext);
      setSlideSkillId(persistedDraft.slideSkillId);
      setSlideOutputFormat(persistedDraft.slideOutputFormat);
      setEditorialPlannerAudiencePreset(persistedDraft.editorialPlannerAudiencePreset ?? "parents");
      setEditorialPlannerTonePreset(persistedDraft.editorialPlannerTonePreset ?? "warm_parenting");
      setEditorialPlannerFitPreset(persistedDraft.editorialPlannerFitPreset ?? "balanced");
      setEditorialPlannerPageCountMode(persistedDraft.editorialPlannerPageCountMode ?? "auto");
      setEditorialPlannerRequestedPageCount(
        Number.isFinite(persistedDraft.editorialPlannerRequestedPageCount)
          ? Math.max(1, Math.min(20, Math.round(persistedDraft.editorialPlannerRequestedPageCount)))
          : 6,
      );
      setEditorialPlannerGlobalStylePrompt(persistedDraft.editorialPlannerGlobalStylePrompt ?? "");
      setEditorialPlannerRenderSafetyJson(persistedDraft.editorialPlannerRenderSafetyJson ?? "");
      setEditorialPlannerPageFillRulesJson(persistedDraft.editorialPlannerPageFillRulesJson ?? "");
      setEditorialPlannerQualityOptimizerJson(persistedDraft.editorialPlannerQualityOptimizerJson ?? "");
      setEditorialPlannerImageAssets(normalizeEditorialPlannerAssetDrafts(persistedDraft.editorialPlannerImageAssets ?? []));
      setPreparedBundle(persistedDraft.preparedBundle);
      setPreparedBundleSkillId(
        persistedDraft.preparedBundle
          ? (persistedDraft.preparedBundleSkillId?.trim() || persistedDraft.slideSkillId || "")
          : "",
      );
      const persistedCanvasRatio = normalizeCanvasRatio(persistedDraft.canvasRatio);
      setGeneratedImages((persistedDraft.generatedImages ?? []).map((asset) => ({
        ...asset,
        canvasRatio: asset.canvasRatio ?? persistedCanvasRatio,
      })));
      setGeneratedSlideDraft(persistedDraft.generatedSlideDraft);
      setGeneratedSlideDraftSkillId(
        persistedDraft.generatedSlideDraft
          ? (persistedDraft.generatedSlideDraftSkillId?.trim() || persistedDraft.slideSkillId || "")
          : ""
      );
      setGeneratedSlideDraftSessionSource(persistedDraft.generatedSlideDraft ? "restored-draft" : "empty");
      setSlidePayloadEditorJson(editorPayloadJson);
      setSlidePayloadEditorDirty(Boolean(
        persistedDraft.slidePayloadEditorDirty
        && editorPayloadJson
        && editorPayloadJson === normalizeSlidePayloadJson(persistedDraft.slidePayloadEditorJson)
      ));
      setImageGenerationProgress("");
      setSlotPickerKey(null);
      setSlotPickerSearchQuery("");
      setSlotPickerTab("library");
      setRegeneratingSlotKey(null);
      return;
    }
    setTopic(initialTopic ?? "");
    setArticle(initialArticle ?? "");
    setExecutionSource("skill");
    setSkillId("");
    setAgencyId("");
    setAgencyName("");
    setRequiresWebSearch(false);
    setRequiresThinking(false);
    setTargetImageCount(8);
    setImageModel("");
    setCanvasRatio(normalizeCanvasRatio(initialCanvasRatio));
    setSlideVisualMode("editable");
    setFullSlideImageStyleId(AUTO_FULL_SLIDE_STYLE_ID);
    setAdvancedMediaOptionsEnabled(false);
    setMediaModelExtraParams({});
    setImagePromptContext("");
    setSlideSkillId("");
    setSlideOutputFormat("json");
    setEditorialPlannerAudiencePreset("parents");
    setEditorialPlannerTonePreset("warm_parenting");
    setEditorialPlannerFitPreset("balanced");
    setEditorialPlannerPageCountMode("auto");
    setEditorialPlannerRequestedPageCount(6);
    setEditorialPlannerGlobalStylePrompt("");
    setEditorialPlannerRenderSafetyJson("");
    setEditorialPlannerPageFillRulesJson("");
    setEditorialPlannerQualityOptimizerJson("");
    setEditorialPlannerImageAssets([]);
    setPreparedBundle(null);
    setPreparedBundleSkillId("");
    setGeneratedImages([]);
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
    setGeneratedSlideDraftSessionSource("empty");
    setSlidePayloadEditorJson("");
    setSlidePayloadEditorDirty(false);
    setImageGenerationProgress("");
    setSlotPickerKey(null);
    setSlotPickerSearchQuery("");
    setSlotPickerTab("library");
    setRegeneratingSlotKey(null);
  }, [deckId, initialArticle, initialCanvasRatio, initialTopic, open]);

  useEffect(() => {
    if (!generatedSlideDraft) {
      setGeneratedSlideDraftSessionSource("empty");
    }
  }, [generatedSlideDraft]);

  useEffect(() => {
    if (!open) {
      return;
    }
    savePersistedArticleBuilderDraft(deckId, {
      topic,
      article,
      executionSource,
      skillId,
      agencyId,
      agencyName,
      requiresWebSearch,
      requiresThinking,
      targetImageCount: clampImageCount(targetImageCount),
      imageModel,
      canvasRatio,
      slideVisualMode,
      fullSlideImageStyleId,
      advancedMediaOptionsEnabled,
      mediaModelExtraParams,
      imagePromptContext,
      slideSkillId,
      slideOutputFormat,
      editorialPlannerAudiencePreset,
      editorialPlannerTonePreset,
      editorialPlannerFitPreset,
      editorialPlannerPageCountMode,
      editorialPlannerRequestedPageCount,
      editorialPlannerGlobalStylePrompt,
      editorialPlannerRenderSafetyJson,
      editorialPlannerPageFillRulesJson,
      editorialPlannerQualityOptimizerJson,
      editorialPlannerImageAssets,
      preparedBundle,
      preparedBundleSkillId,
      generatedImages,
      generatedSlideDraft,
      generatedSlideDraftSkillId,
      slidePayloadEditorJson,
      slidePayloadEditorDirty,
    });
  }, [
    advancedMediaOptionsEnabled,
    agencyId,
    agencyName,
    article,
    canvasRatio,
    deckId,
    executionSource,
    fullSlideImageStyleId,
    generatedImages,
    generatedSlideDraft,
    imageModel,
    imagePromptContext,
    mediaModelExtraParams,
    open,
    editorialPlannerAudiencePreset,
    editorialPlannerTonePreset,
    editorialPlannerFitPreset,
    editorialPlannerPageCountMode,
    editorialPlannerRequestedPageCount,
    editorialPlannerGlobalStylePrompt,
    editorialPlannerRenderSafetyJson,
    editorialPlannerPageFillRulesJson,
    editorialPlannerQualityOptimizerJson,
    editorialPlannerImageAssets,
    preparedBundle,
    preparedBundleSkillId,
    requiresThinking,
    requiresWebSearch,
    skillId,
    slidePayloadEditorJson,
    slidePayloadEditorDirty,
    slideOutputFormat,
    slideVisualMode,
    slideSkillId,
    generatedSlideDraftSkillId,
    targetImageCount,
    topic,
  ]);

  useEffect(() => {
    if (!open || executionSource !== "skill" || skillId || articleSkillOptions.length === 0) {
      return;
    }
    setSkillId(articleSkillOptions[0]!.id);
  }, [articleSkillOptions, executionSource, open, skillId]);

  useEffect(() => {
    if (!open || slideSkillId || slideSkillOptions.length === 0) {
      return;
    }
    const preferredSkill = artifactRequiredForSelectedOutput
      ? artifactCapableSlideSkillOptions[0] ?? slideSkillOptions[0]
      : slideSkillOptions[0];
    if (preferredSkill) {
      setSlideSkillId(preferredSkill.id);
    }
  }, [artifactCapableSlideSkillOptions, artifactRequiredForSelectedOutput, open, slideSkillId, slideSkillOptions]);

  useEffect(() => {
    if (!open || !isEditorialLayoutPlannerSelected) {
      return;
    }
    if (slideOutputFormat !== "json") {
      setSlideOutputFormat("json");
    }
    if (
      editorialPlannerGlobalStylePrompt.trim()
      || editorialPlannerRenderSafetyJson.trim()
      || editorialPlannerPageFillRulesJson.trim()
      || editorialPlannerQualityOptimizerJson.trim()
    ) {
      return;
    }
    applyEditorialPlannerQuickPreset(recommendedEditorialPlannerPreset);
  }, [
    editorialPlannerGlobalStylePrompt,
    editorialPlannerPageFillRulesJson,
    editorialPlannerQualityOptimizerJson,
    editorialPlannerRenderSafetyJson,
    isEditorialLayoutPlannerSelected,
    open,
    recommendedEditorialPlannerPreset,
    slideOutputFormat,
  ]);

  useEffect(() => {
    if (!open) {
      setSlotPickerKey(null);
      setSlotPickerSearchQuery("");
      setRegeneratingSlotKey(null);
    }
  }, [open]);

  useEffect(() => {
    if (!generatedSlideDraft || slideGenerationBlockedHint || !hasImportableSlides) {
      setGuidedFooterAction(null);
    }
  }, [generatedSlideDraft, hasImportableSlides, slideGenerationBlockedHint]);

  useEffect(() => {
    const artifacts = (sandboxJobStatusQuery.data?.artifacts ?? [])
      .map(normalizeSlideArtifact)
      .filter((artifact): artifact is SlideArtifact => Boolean(artifact));
    if (!generatedSlideDraft?.artifactJobId || artifacts.length === 0) {
      return;
    }
    const nextDownloadUrl = pickPreferredSlideArtifact(artifacts, slideOutputFormat)?.url ?? null;
    setGeneratedSlideDraft((previous) => {
      if (!previous || previous.artifactJobId !== generatedSlideDraft.artifactJobId) {
        return previous;
      }
      return {
        ...previous,
        artifacts,
        downloadUrl: previous.downloadUrl ?? nextDownloadUrl,
      };
    });
  }, [generatedSlideDraft?.artifactJobId, sandboxJobStatusQuery.data?.artifacts, slideOutputFormat]);

  useEffect(() => {
    const activeArtifactJobId = generatedSlideDraft?.artifactJobId?.trim();
    if (!activeArtifactJobId) {
      return;
    }
    const status = String(sandboxJobStatusQuery.data?.status ?? "").trim().toLowerCase();
    const queriedArtifacts = Array.isArray(sandboxJobStatusQuery.data?.artifacts)
      ? sandboxJobStatusQuery.data.artifacts
      : [];
    const shouldClearPendingArtifactState = Boolean(sandboxJobStatusQuery.error)
      || status === "failed"
      || status === "error"
      || status === "cancelled"
      || (status === "completed" && queriedArtifacts.length === 0 && !generatedSlideDraft?.downloadUrl);
    if (!shouldClearPendingArtifactState) {
      return;
    }
    setGeneratedSlideDraft((previous) => {
      if (!previous || previous.artifactJobId !== activeArtifactJobId) {
        return previous;
      }
      return {
        ...previous,
        artifactJobId: null,
        artifacts: previous.artifacts ?? [],
        downloadUrl: previous.downloadUrl ?? null,
      };
    });
  }, [
    generatedSlideDraft?.artifactJobId,
    generatedSlideDraft?.downloadUrl,
    sandboxJobStatusQuery.data?.artifacts,
    sandboxJobStatusQuery.data?.status,
    sandboxJobStatusQuery.error,
  ]);

  const applyNextImageModel = (nextModelId: string) => {
    setImageModel(nextModelId);
    const resolvedModelId = nextModelId.trim() || defaultImageModelId;
    const nextModel = imageModels.find((model) => model.id === resolvedModelId);
    setMediaModelExtraParams(
      mergeExtraParams(
        buildDefaultExtraParamsForModel(nextModel),
        pickExtraParamsForModel(nextModel, mediaModelExtraParams),
      ) ?? {},
    );
  };

  const handleSlideSkillChange = (nextSkillId: string) => {
    const nextSkill = slideSkillOptions.find((skill) => skill.id === nextSkillId) ?? null;
    const nextSkillLabel = nextSkill?.name?.trim().toLowerCase() ?? "";
    const preparedBundleSkillLabel = preparedBundle?.slideSkillLabel.trim().toLowerCase() ?? "";
    const bundleWillBecomeStale = Boolean(preparedBundle) && (
      (preparedBundleSkillId.trim() && preparedBundleSkillId !== nextSkillId)
      || (!preparedBundleSkillId.trim() && preparedBundleSkillLabel !== nextSkillLabel)
    );
    const slideDraftWillBecomeStale = Boolean(generatedSlideDraft) && (
      (generatedSlideDraftSkillId.trim() && generatedSlideDraftSkillId !== nextSkillId)
      || (!generatedSlideDraftSkillId.trim() && bundleWillBecomeStale)
    );
    setSlideSkillId(nextSkillId);
    if (nextSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID) {
      const recommendedPreset = inferRecommendedEditorialPlannerPreset({
        canvasRatio,
        language: detectedLanguage,
        topic,
      });
      applyEditorialPlannerQuickPreset(recommendedPreset);
      setSlideOutputFormat("json");
    }
    if (requiresGeneratedSlideArtifact(slideOutputFormat) && !supportsGeneratedSlideArtifacts(nextSkill)) {
      setSlideOutputFormat("json");
      toast.info(t("dialog.articleBuilder.slideOutputFormatDowngraded", {
        format: slideOutputFormat.toUpperCase(),
      }));
    }
    if (bundleWillBecomeStale || slideDraftWillBecomeStale) {
      setGuidedWorkflowStep(2);
      setGuidedFooterAction(null);
      toast.info("เปลี่ยน slide skill แล้ว: ควร Prepare Bundle ใหม่ และ Generate Slide JSON ใหม่ ส่วนรูปจะ reuse ให้เท่าที่ slot เดิมยังตรงกัน");
    }
  };

  const applyEditorialPlannerQuickPreset = (preset: EditorialPlannerQuickPreset) => {
    setEditorialPlannerAudiencePreset(preset.audience);
    setEditorialPlannerTonePreset(preset.tone);
    setEditorialPlannerFitPreset(preset.fit);
    const defaults = getEditorialPlannerResolvedDefaults({
      canvasRatio,
      language: detectedLanguage,
      imagePromptContext,
      targetAudiencePreset: preset.audience,
      tonePreset: preset.tone,
      fitPreset: preset.fit,
    });
    setEditorialPlannerPageCountMode("auto");
    setEditorialPlannerRequestedPageCount(preparedBundle?.maxPages ?? 6);
    setEditorialPlannerGlobalStylePrompt(defaults.global_style_prompt);
    setEditorialPlannerRenderSafetyJson(stringifyPlannerJson(defaults.render_safety));
    setEditorialPlannerPageFillRulesJson(stringifyPlannerJson(defaults.page_fill_rules));
    setEditorialPlannerQualityOptimizerJson(stringifyPlannerJson(defaults.quality_optimizer));
  };

  const resolveEditorialPlannerOptionsOrToast = (): EditorialPlannerOptionsInput | null | undefined => {
    if (!isEditorialLayoutPlannerSelected) {
      return undefined;
    }
    if (editorialPlannerAssetValidation.errors.length > 0) {
      toast.error(editorialPlannerAssetValidation.errors[0]!);
      return null;
    }
    if (editorialPlannerAssetValidation.warnings.length > 0) {
      toast.info(editorialPlannerAssetValidation.warnings[0]!);
    }
    try {
      return {
        targetAudience: editorialPlannerAudiencePreset,
        tonePreset: editorialPlannerTonePreset,
        fitPreset: editorialPlannerFitPreset,
        pageCountMode: editorialPlannerPageCountMode,
        requestedPageCount: editorialPlannerPageCountMode === "fixed"
          ? Math.max(1, Math.min(20, Math.round(editorialPlannerRequestedPageCount)))
          : undefined,
        globalStylePrompt: editorialPlannerGlobalStylePrompt.trim() || null,
        renderSafety: parseEditorialPlannerJsonObject(editorialPlannerRenderSafetyJson, "Render safety JSON"),
        pageFillRules: parseEditorialPlannerJsonObject(editorialPlannerPageFillRulesJson, "Page fill rules JSON"),
        qualityOptimizer: parseEditorialPlannerJsonObject(editorialPlannerQualityOptimizerJson, "Quality optimizer JSON"),
        imageAssets: normalizeEditorialPlannerImageAssets(editorialPlannerImageAssets),
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Planner input is invalid.");
      return null;
    }
  };

  const resolveRequestedSlideGenerationPlan = (): {
    slideSkillId: string;
    outputFormats: SlideOutputFormat[];
  } | null => {
    if (!slideSkillId) {
      toast.error(t("dialog.articleBuilder.slideSkillRequired"));
      return null;
    }
    if (!artifactRequiredForSelectedOutput) {
      return {
        slideSkillId,
        outputFormats: slideOutputFormats,
      };
    }
    if (selectedSlideSkillSupportsArtifacts) {
      return {
        slideSkillId,
        outputFormats: slideOutputFormats,
      };
    }
    setSlideOutputFormat("json");
    toast.info(t("dialog.articleBuilder.slideOutputFormatDowngraded", {
      format: slideOutputFormat.toUpperCase(),
    }));
    return {
      slideSkillId,
      outputFormats: ["json"],
    };
  };

  const handlePrepareSlideBundle = async (options?: {
    articleOverride?: string;
    topicOverride?: string;
    successMessage?: string;
    preserveExistingImages?: boolean;
  }): Promise<PreparedSlideBundle | null> => {
    const trimmedArticle = (options?.articleOverride ?? article).trim();
    const fallbackTopic = inferTopicFallbackFromArticle(trimmedArticle);
    const trimmedTopic = ((options?.topicOverride ?? topic).trim() || (
      slideSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID ? fallbackTopic : ""
    )).trim();
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return null;
    }
    if (!trimmedArticle) {
      toast.error(t("dialog.articleBuilder.articleRequired"));
      return null;
    }
    const generationPlan = resolveRequestedSlideGenerationPlan();
    if (!generationPlan) {
      return null;
    }
    const editorialPlannerOptions = generationPlan.slideSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID
      ? resolveEditorialPlannerOptionsOrToast()
      : undefined;
    if (editorialPlannerOptions === null) {
      return null;
    }

    try {
      const result = await prepareSlideBundleMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        article: trimmedArticle,
        preferredLanguage: detectedLanguage,
        slideSkillId: generationPlan.slideSkillId,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
        canvasRatio,
        outputFormats: generationPlan.outputFormats,
        imagePromptContext: imagePromptContext.trim() || null,
        editorialPlannerOptions,
        existingImageAssets: options?.preserveExistingImages && generatedImages.length > 0
          ? generatedImages
          : undefined,
      });
      const nextGeneratedImages = options?.preserveExistingImages
        ? normalizeGeneratedImagesForBundle(result, generatedImages, canvasRatio)
        : [];
      const nextPayloadJson = normalizeSlidePayloadJson(
        result.slidePayloadJson,
        normalizeSlidePayloadJson(preparedBundle?.slidePayloadJson, normalizeSlidePayloadJson(slidePayloadEditorJson)),
      );
      setPreparedBundle(result);
      setPreparedBundleSkillId(generationPlan.slideSkillId);
      setSlidePayloadEditorJson(nextPayloadJson);
      setSlidePayloadEditorDirty(false);
      setGeneratedImages(nextGeneratedImages);
      setGeneratedSlideDraft(null);
      setGeneratedSlideDraftSkillId("");
      setGuidedWorkflowStep(4);
      setGuidedFooterAction(null);
      if (result.slidePayloadJson && nextPayloadJson !== result.slidePayloadJson.trim()) {
        toast.error("Skill input JSON response was invalid. Kept the previous valid JSON instead.");
      }
      if (options?.successMessage) {
        if (options?.preserveExistingImages && generatedImages.length > 0) {
          toast.success(t("dialog.articleBuilder.prepareBundleReuseSuccess", {
            count: nextGeneratedImages.length,
            total: result.imagePrompts.length,
          }));
        } else {
          toast.success(options.successMessage);
        }
      }
      return result;
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.prepareBundleError")));
      return null;
    }
  };

  const upsertGeneratedImageForPrompt = (prompt: PreparedImagePrompt, url: string) => {
    const normalizedUrl = normalizeMediaSourceUrl(url);
    if (!normalizedUrl) {
      return;
    }
    const updatedAt = new Date().toISOString();
    setGeneratedImages((previous) => {
      const nextAsset: GeneratedImageAsset = { ...prompt, url: normalizedUrl, canvasRatio, updatedAt };
      const withoutCurrentSlot = previous.filter((candidate) => !isSamePreparedImageSlot(candidate, prompt));
      return [...withoutCurrentSlot, nextAsset]
        .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex);
    });
    setPreviewImageAsset((current) => (
      current && isSamePreparedImageSlot(current, prompt)
        ? { ...prompt, url: normalizedUrl, canvasRatio, updatedAt }
        : current
    ));
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
  };

  const removePreparedImageSlot = (prompt: PreparedImagePrompt) => {
    const slotKey = getPreparedImageSlotKey(prompt);
    setPreparedBundle((previous) => {
      if (!previous) {
        return previous;
      }
      const nextPrompts = previous.imagePrompts.filter(
        (candidate) => getPreparedImageSlotKey(candidate) !== slotKey,
      );
      const nextPageSlotCounts = new Map<number, number>();
      nextPrompts.forEach((candidate) => {
        nextPageSlotCounts.set(candidate.pageNumber, (nextPageSlotCounts.get(candidate.pageNumber) ?? 0) + 1);
      });
      return {
        ...previous,
        imagePrompts: nextPrompts,
        plannedImageCount: nextPrompts.length,
        preflightPages: previous.preflightPages?.map((page) => ({
          ...page,
          maxImagesOverride: nextPageSlotCounts.get(page.pageNumber) ?? 0,
        })),
      };
    });
    setGeneratedImages((previous) => previous.filter(
      (candidate) => getPreparedImageSlotKey(candidate) !== slotKey,
    ));
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
    if (slotPickerKey === slotKey) {
      setSlotPickerKey(null);
    }
  };

  const handleAssignAssetToSlot = (prompt: PreparedImagePrompt, asset: PickerAsset) => {
    upsertGeneratedImageForPrompt(prompt, asset.sourceUrl);
    setSlotPickerKey(null);
    toast.success(t("dialog.articleBuilder.replaceSlotImageSuccess"));
  };

  const openSlotPickerForPrompt = (prompt: PreparedImagePrompt) => {
    setSlotPickerTab("library");
    setSlotPickerSearchQuery("");
    setSlotPickerKey((current) => current === getPreparedImageSlotKey(prompt) ? null : getPreparedImageSlotKey(prompt));
  };

  const handleRegenerateSlot = async (prompt: PreparedImagePrompt) => {
    const missingRequiredFields = getMissingRequiredModelFields(
      selectedMediaModelFields,
      {
        extraParams: syncedMediaModelExtraParams,
        prompt: "__auto_prompt__",
        aspectRatio: canvasRatio,
      },
      {
        treatPromptSyncAsAuto: true,
      },
    );
    if (missingRequiredFields.length > 0) {
      toast.error(`${t("dialog.articleBuilder.mediaFieldsRequired")}: ${missingRequiredFields.join(", ")}`);
      return;
    }
    const slotKey = getPreparedImageSlotKey(prompt);
    setRegeneratingSlotKey(slotKey);
    try {
      const extraParams = applyModelSyncTargets(
        selectedImageModelConfig,
        syncedMediaModelExtraParams,
        {
          prompt: prompt.prompt,
          aspectRatio: canvasRatio,
        },
      );
      const requestPayload = {
        prompt: prompt.prompt,
        model: imageModel.trim() || undefined,
        aspectRatio: canvasRatio,
        numImages: 1 as const,
        ...(extraParams ? { extraParams } : {}),
      };
      let taskResult;
      try {
        taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
      } catch (initialError) {
        const initialMessage = getErrorMessage(initialError, t("dialog.articleBuilder.generateImagesError"));
        const retryAfterSeconds = getRetryAfterSeconds(initialMessage);
        const isBurstAnomalyError = initialMessage.toLowerCase().includes("burst_anomaly");
        if (!isBurstAnomalyError || !retryAfterSeconds) {
          throw initialError;
        }
        toast.info(`Rate limit reached, retrying in ${retryAfterSeconds}s...`);
        await sleepMs((retryAfterSeconds + 1) * 1000);
        taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
      }
      let resultUrl = extractTaskResultUrl(taskResult);
      if (!resultUrl) {
        const taskId = extractTaskId(taskResult);
        if (!taskId) {
          throw new Error("Image generation started but task ID was not returned.");
        }
        const terminalTask = await pollTaskUntilTerminal(
          taskId,
          async (id) => trpcUtils.media.getTask.fetch({ taskId: id }),
          { mediaLabel: "Image" },
        );
        resultUrl = extractTaskResultUrl(terminalTask);
      }
      if (!resultUrl) {
        throw new Error("Image provider returned no URL");
      }
      upsertGeneratedImageForPrompt(prompt, resultUrl);
      toast.success(t("dialog.articleBuilder.regenerateSlotSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateImagesError")));
    } finally {
      setRegeneratingSlotKey(null);
    }
  };

  const handleAddPreparedImageSlot = (pageNumber: number) => {
    const existingPagePromptCount = (preparedBundle?.imagePrompts ?? []).filter(
      (prompt) => prompt.pageNumber === pageNumber,
    ).length;
    if (existingPagePromptCount >= 3) {
      toast.info(t("dialog.articleBuilder.addImageSlotLimit"));
      return;
    }
    setPreparedBundle((previous) => {
      if (!previous) {
        return previous;
      }
      const pagePrompts = previous.imagePrompts.filter((prompt) => prompt.pageNumber === pageNumber);
      const pagePreflight = previous.preflightPages?.find((page) => page.pageNumber === pageNumber);
      const nextImageIndex = Math.max(0, ...pagePrompts.map((prompt) => prompt.imageIndex)) + 1;
      const placementRole = nextImageIndex === 1
        ? "hero"
        : (nextImageIndex === 2 ? "supporting" : "detail");
      const shortLabel = placementRole === "hero"
        ? "hero"
        : (placementRole === "supporting" ? "supporting" : "detail");
      const promptSource = pagePreflight?.compiledText?.trim() || pagePreflight?.titleHint?.trim() || topic.trim();
      const nextPrompt: PreparedImagePrompt = {
        id: `slot-${pageNumber}-${nextImageIndex}-${placementRole}`,
        pageNumber,
        imageIndex: nextImageIndex,
        placementRole,
        shortLabel,
        prompt: [
          `${pagePreflight?.titleHint || `Page ${pageNumber}`} - ${shortLabel} image`,
          promptSource,
          imagePromptContext.trim() || null,
          "No text, letters, captions, or logos.",
        ].filter(Boolean).join("\n\n"),
      };
      const nextPrompts = [...previous.imagePrompts, nextPrompt]
        .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex);
      return {
        ...previous,
        imagePrompts: nextPrompts,
        plannedImageCount: nextPrompts.length,
        preflightPages: previous.preflightPages?.map((page) => (
          page.pageNumber === pageNumber
            ? { ...page, maxImagesOverride: Math.min(3, pagePrompts.length + 1) }
            : page
        )),
      };
    });
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
    toast.success(t("dialog.articleBuilder.addImageSlotSuccess"));
  };

  const handleGenerateSlideDraft = async (options?: {
    imageAssetsOverride?: GeneratedImageAsset[];
    successMessage?: string;
  }): Promise<GeneratedSlideDraft | null> => {
    const trimmedArticle = article.trim();
    const fallbackTopic = inferTopicFallbackFromArticle(trimmedArticle);
    const trimmedTopic = (topic.trim() || (
      slideSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID ? fallbackTopic : ""
    )).trim();
    const requiredPrompts = isFullSlideImageMode
      ? buildFullSlideImagePrompts({
          bundle: preparedBundle,
          topic: trimmedTopic,
          article: trimmedArticle,
          canvasRatio,
          imagePromptContext,
          styleId: fullSlideImageStyleId,
        })
      : (preparedBundle?.imagePrompts ?? []);
    const imageAssets = normalizeGeneratedImagesForPrompts(
      requiredPrompts,
      options?.imageAssetsOverride ?? generatedImages,
      canvasRatio,
    );
    const activeMaxPages = preparedBundle?.maxPages ?? null;
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return null;
    }
    if (!trimmedArticle) {
      toast.error(t("dialog.articleBuilder.articleRequired"));
      return null;
    }
    const generationPlan = resolveRequestedSlideGenerationPlan();
    if (!generationPlan) {
      return null;
    }
    const editorialPlannerOptions = generationPlan.slideSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID
      ? resolveEditorialPlannerOptionsOrToast()
      : undefined;
    if (editorialPlannerOptions === null) {
      return null;
    }
    if (!activeMaxPages) {
      toast.error(t("dialog.articleBuilder.prepareBundleFirst"));
      return null;
    }
    const plannedImageCount = preparedBundle?.imagePrompts?.length ?? 0;
    const requiredImageCount = requiredPrompts.length || plannedImageCount;
    if (requiredImageCount > 0 && imageAssets.length < requiredImageCount) {
      toast.error(t("dialog.articleBuilder.imagesRequired"));
      setGuidedWorkflowStep(3);
      return null;
    }
    if (isFullSlideImageMode) {
      const slideJson = buildFullSlideImageDeckJson({
        canvasRatio,
        assets: imageAssets,
      });
      const slidePayloadJson = JSON.stringify({
        mode: "full-slide-image",
        topic: trimmedTopic,
        canvasRatio,
        style: {
          requested: fullSlideImageStyleId,
          resolved: activeFullSlideImageStylePreset.id,
          label: activeFullSlideImageStylePreset.label,
          contract: activeFullSlideImageStylePreset.contract,
        },
        pages: imageAssets.map((asset) => ({
          pageNumber: asset.pageNumber,
          title: asset.shortLabel,
          prompt: asset.prompt,
          imageUrl: asset.url,
        })),
      }, null, 2);
      const nextDraft: GeneratedSlideDraft = {
        slideJson,
        slidePayloadJson,
        modelId: imageModel.trim() || undefined,
        generatedAt: new Date().toISOString(),
        selectedSkillId: "full-slide-image",
        selectedSkillName: t("dialog.articleBuilder.fullSlideImageMode"),
        executionSkillId: "media-generate-full-slide-image",
        executionSkillName: (selectedImageModelConfig?.name ?? imageModel.trim()) || t("dialog.articleBuilder.mediaModelLabel"),
        runtimeBundleSkillId: null,
        runtimeBundleSkillName: null,
        runtimeAliasApplied: false,
        artifactJobId: null,
        artifacts: [],
        downloadUrl: null,
        debugTracePath: null,
        importedSlideJson: null,
        importedAt: null,
        importedFromArtifact: false,
        importedArtifactUrl: null,
      };
      const nextDraftHasImportableSlides = hasImportableSlidesJson(slideJson);
      setGeneratedSlideDraft(nextDraft);
      setGeneratedSlideDraftSkillId(slideSkillId.trim() || "full-slide-image");
      setGeneratedSlideDraftSessionSource("fresh-run");
      setSlidePayloadEditorJson(slidePayloadJson);
      setSlidePayloadEditorDirty(false);
      setGuidedWorkflowStep(null);
      setGuidedFooterAction(nextDraftHasImportableSlides ? "insert" : null);
      if (options?.successMessage) {
        toast.success(`${options.successMessage} ขั้นถัดไป: นำเข้า Slides ล่าสุดได้เลย`);
      }
      return nextDraft;
    }
    const trimmedPayloadOverrideJson = slidePayloadEditorDirty ? slidePayloadEditorJson.trim() : "";
    if (trimmedPayloadOverrideJson) {
      if (isProbablyHtmlDocument(trimmedPayloadOverrideJson)) {
        toast.error("Skill input JSON contains HTML instead of JSON. Please reset or prepare the slide bundle again.");
        return null;
      }
      try {
        JSON.parse(trimmedPayloadOverrideJson);
      } catch {
        toast.error("Skill input JSON must be valid JSON before generating slides.");
        return null;
      }
    }

    try {
      const result = await generateSlideDraftMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        article: trimmedArticle,
        preferredLanguage: detectedLanguage,
        slideSkillId: generationPlan.slideSkillId,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
        canvasRatio,
        outputFormats: generationPlan.outputFormats,
        maxPages: activeMaxPages,
        imagePromptContext: imagePromptContext.trim() || null,
        editorialPlannerOptions,
        pageImagePlanOverrides,
        slidePayloadOverrideJson: trimmedPayloadOverrideJson || null,
        imageAssets,
      });
      const nextDraft = {
        slideJson: result.slideJson,
        slidePayloadJson: result.slidePayloadJson,
        modelId: result.modelId,
        generatedAt: typeof result.generatedAt === "string" && result.generatedAt.trim()
          ? result.generatedAt.trim()
          : new Date().toISOString(),
        selectedSkillId: typeof result.selectedSkillId === "string" && result.selectedSkillId.trim()
          ? result.selectedSkillId.trim()
          : generationPlan.slideSkillId,
        selectedSkillName: typeof result.selectedSkillName === "string" && result.selectedSkillName.trim()
          ? result.selectedSkillName.trim()
          : result.slideSkillLabel,
        executionSkillId: typeof result.executionSkillId === "string" && result.executionSkillId.trim()
          ? result.executionSkillId.trim()
          : null,
        executionSkillName: typeof result.executionSkillName === "string" && result.executionSkillName.trim()
          ? result.executionSkillName.trim()
          : null,
        runtimeBundleSkillId: typeof result.runtimeBundleSkillId === "string" && result.runtimeBundleSkillId.trim()
          ? result.runtimeBundleSkillId.trim()
          : null,
        runtimeBundleSkillName: typeof result.runtimeBundleSkillName === "string" && result.runtimeBundleSkillName.trim()
          ? result.runtimeBundleSkillName.trim()
          : null,
        runtimeAliasApplied: Boolean(result.runtimeAliasApplied),
        artifactJobId: result.artifactJobId ?? null,
        artifacts: (result.artifacts ?? []).map(normalizeSlideArtifact).filter((artifact): artifact is SlideArtifact => Boolean(artifact)),
        downloadUrl: result.downloadUrl ?? null,
        debugTracePath: result.debugTracePath ?? null,
        importedSlideJson: null,
        importedAt: null,
        importedFromArtifact: false,
        importedArtifactUrl: null,
      };
      const nextPayloadJson = normalizeSlidePayloadJson(
        result.slidePayloadJson,
        normalizeSlidePayloadJson(
          nextDraft.slidePayloadJson,
          normalizeSlidePayloadJson(preparedBundle?.slidePayloadJson, normalizeSlidePayloadJson(slidePayloadEditorJson)),
        ),
      );
      const nextDraftHasImportableSlides = hasImportableSlidesJson(nextDraft.slideJson);
      setGeneratedSlideDraft(nextDraft);
      setGeneratedSlideDraftSkillId(generationPlan.slideSkillId);
      setGeneratedSlideDraftSessionSource("fresh-run");
      setSlidePayloadEditorJson(nextPayloadJson);
      setSlidePayloadEditorDirty(Boolean(trimmedPayloadOverrideJson));
      setGuidedWorkflowStep(null);
      setGuidedFooterAction(nextDraftHasImportableSlides ? "insert" : null);
      if (result.slidePayloadJson && nextPayloadJson !== result.slidePayloadJson.trim()) {
        toast.error("Skill input JSON response was invalid. Kept the previous valid JSON instead.");
      }
      const hasDownloadableArtifact = Boolean(
        nextDraft.downloadUrl
        || pickPreferredSlideArtifact(nextDraft.artifacts ?? [], slideOutputFormat),
      );
      if (options?.successMessage) {
        toast.success(
          nextDraftHasImportableSlides || hasDownloadableArtifact
            ? `${options.successMessage} ขั้นถัดไป: นำเข้า Slides ล่าสุดได้เลย`
            : options.successMessage,
        );
      }
      if (typeof result.artifactFailureMessage === "string" && result.artifactFailureMessage.trim()) {
        toast.error(result.artifactFailureMessage.trim());
      }
      return nextDraft;
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateSlideJsonError")));
      return null;
    }
  };

  const handleGenerate = async () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      toast.error(t("dialog.articleBuilder.topicRequired"));
      return;
    }
    if (executionSource === "skill" && !skillId) {
      toast.error(t("dialog.articleBuilder.skillRequired"));
      return;
    }
    if (executionSource === "agency" && !agencyId) {
      toast.error(t("dialog.articleBuilder.agencyRequired"));
      return;
    }

    try {
      const result = await generateArticleMutation.mutateAsync({
        deckId,
        topic: trimmedTopic,
        preferredLanguage: detectedLanguage,
        executionSource,
        skillId: executionSource === "skill" ? skillId : null,
        agencyId: executionSource === "agency" ? agencyId : null,
        requiresWebSearch,
        requiresThinking,
        targetImageCount: clampImageCount(targetImageCount),
      });
      setArticle(result.article);
      toast.success(t("dialog.articleBuilder.generateSuccess"));
      void handlePrepareSlideBundle({
        articleOverride: result.article,
        topicOverride: trimmedTopic,
        successMessage: t("dialog.articleBuilder.prepareBundleSuccess"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateError")));
    }
  };

  const handleGenerateImages = async () => {
    const bundle = preparedBundle ?? await handlePrepareSlideBundle();
    if (!bundle) {
      return;
    }
    const missingRequiredFields = getMissingRequiredModelFields(
      selectedMediaModelFields,
      {
        extraParams: syncedMediaModelExtraParams,
        prompt: "__auto_prompt__",
        aspectRatio: canvasRatio,
      },
      {
        treatPromptSyncAsAuto: true,
      },
    );
    if (missingRequiredFields.length > 0) {
      toast.error(`${t("dialog.articleBuilder.mediaFieldsRequired")}: ${missingRequiredFields.join(", ")}`);
      return;
    }

    setIsGeneratingImages(true);
    const promptsForGeneration = isFullSlideImageMode
      ? buildFullSlideImagePrompts({
          bundle,
          topic,
          article,
          canvasRatio,
          imagePromptContext,
          styleId: fullSlideImageStyleId,
        })
      : bundle.imagePrompts;
    const reusableAssets = normalizeGeneratedImagesForPrompts(promptsForGeneration, generatedImages, canvasRatio);
    setGeneratedImages(reusableAssets);
    setGeneratedSlideDraft(null);
    setGeneratedSlideDraftSkillId("");
    try {
      const reusableSlotKeys = new Set(reusableAssets.map((asset) => getPreparedImageSlotKey(asset)));
      const promptsToGenerate = promptsForGeneration.filter(
        (prompt) => !reusableSlotKeys.has(getPreparedImageSlotKey(prompt)),
      );
      const nextAssets: GeneratedImageAsset[] = [...reusableAssets];
      if (promptsToGenerate.length === 0) {
        setImageGenerationProgress("");
        await handleGenerateSlideDraft({
          imageAssetsOverride: nextAssets,
          successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess"),
        });
        return;
      }
      let nextPromptIndex = 0;
      let completedCount = reusableAssets.length;
      const generatedByPromptIndex: Array<GeneratedImageAsset | null> = Array.from(
        { length: promptsToGenerate.length },
        () => null,
      );
      const updateGeneratedImageProgress = () => {
        const orderedGeneratedAssets = generatedByPromptIndex.filter(
          (asset): asset is GeneratedImageAsset => Boolean(asset),
        );
        setGeneratedImages([...reusableAssets, ...orderedGeneratedAssets]);
        setImageGenerationProgress(`${completedCount}/${promptsForGeneration.length}`);
      };
      setImageGenerationProgress(`${completedCount}/${promptsForGeneration.length}`);

      const generatePromptImage = async (promptPlan: PreparedImagePrompt): Promise<GeneratedImageAsset> => {
        const extraParams = applyModelSyncTargets(
          selectedImageModelConfig,
          syncedMediaModelExtraParams,
          {
            prompt: promptPlan.prompt,
            aspectRatio: canvasRatio,
          },
        );
        const requestPayload = {
          prompt: promptPlan.prompt,
          model: imageModel.trim() || undefined,
          aspectRatio: canvasRatio,
          numImages: 1 as const,
          ...(extraParams ? { extraParams } : {}),
        };
        let taskResult;
        try {
          taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
        } catch (initialError) {
          const initialMessage = getErrorMessage(initialError, t("dialog.articleBuilder.generateImagesError"));
          const retryAfterSeconds = getRetryAfterSeconds(initialMessage);
          const isBurstAnomalyError = initialMessage.toLowerCase().includes("burst_anomaly");
          if (!isBurstAnomalyError || !retryAfterSeconds) {
            throw initialError;
          }
          toast.info(`Rate limit reached, retrying in ${retryAfterSeconds}s...`);
          await sleepMs((retryAfterSeconds + 1) * 1000);
          taskResult = await generateImageAsyncMutation.mutateAsync(requestPayload);
        }
        let resultUrl = extractTaskResultUrl(taskResult);
        if (!resultUrl) {
          const taskId = extractTaskId(taskResult);
          if (!taskId) {
            throw new Error("Image generation started but task ID was not returned.");
          }
          const terminalTask = await pollTaskUntilTerminal(
            taskId,
            async (id) => trpcUtils.media.getTask.fetch({ taskId: id }),
            { mediaLabel: "Image" },
          );
          resultUrl = extractTaskResultUrl(terminalTask);
        }
        if (!resultUrl) {
          throw new Error("Image provider returned no URL");
        }
        const nextAsset: GeneratedImageAsset = {
          ...promptPlan,
          url: resultUrl,
          canvasRatio,
          updatedAt: new Date().toISOString(),
        };
        return nextAsset;
      };

      const workerCount = Math.min(IMAGE_GENERATION_BATCH_CONCURRENCY, promptsToGenerate.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (nextPromptIndex < promptsToGenerate.length) {
          const currentIndex = nextPromptIndex;
          nextPromptIndex += 1;
          const promptPlan = promptsToGenerate[currentIndex]!;
          const nextAsset = await generatePromptImage(promptPlan);
          generatedByPromptIndex[currentIndex] = nextAsset;
          completedCount += 1;
          updateGeneratedImageProgress();
        }
      });
      const workerResults = await Promise.allSettled(workers);
      const failedWorker = workerResults.find((result) => result.status === "rejected");
      if (failedWorker?.status === "rejected") {
        throw failedWorker.reason;
      }
      nextAssets.push(...generatedByPromptIndex.filter(
        (asset): asset is GeneratedImageAsset => Boolean(asset),
      ));
      setImageGenerationProgress("");
      toast.success(t("dialog.articleBuilder.generateImagesSuccess"));
      await handleGenerateSlideDraft({
        imageAssetsOverride: nextAssets,
        successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess"),
      });
    } catch (error) {
      toast.error(getErrorMessage(error, t("dialog.articleBuilder.generateImagesError")));
    } finally {
      setIsGeneratingImages(false);
      setImageGenerationProgress("");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[96vw]">
          <div className="flex h-full flex-col">
            <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t("dialog.articleBuilder.title")}
              </DialogTitle>
              <DialogDescription>
                {t("dialog.articleBuilder.description")}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:overflow-hidden">
              <div className="grid gap-6 lg:grid-cols-[minmax(440px,520px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(500px,580px)_minmax(0,1fr)]">
                <section className="min-h-0 lg:flex lg:h-[calc(92vh-13rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-background/60 lg:p-3">
                  <div className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                  <div className="space-y-2">
                    <Label htmlFor="presentation-article-topic">{t("dialog.articleBuilder.topicLabel")}</Label>
                    <Textarea
                      id="presentation-article-topic"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder={t("dialog.articleBuilder.topicPlaceholder")}
                      rows={5}
                    />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Languages className="h-3.5 w-3.5" />
                      <span>{t("dialog.articleBuilder.detectedLanguage")}</span>
                      <Badge variant="outline">{detectedLanguageLabel}</Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("dialog.articleBuilder.sourceLabel")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={executionSource === "skill" ? "default" : "outline"}
                        className="justify-start gap-2"
                        onClick={() => setExecutionSource("skill")}
                      >
                        <Sparkles className="h-4 w-4" />
                        {t("dialog.articleBuilder.sourceSkill")}
                      </Button>
                      <Button
                        type="button"
                        variant={executionSource === "agency" ? "default" : "outline"}
                        className="justify-start gap-2"
                        onClick={() => setExecutionSource("agency")}
                      >
                        <Bot className="h-4 w-4" />
                        {t("dialog.articleBuilder.sourceAgency")}
                      </Button>
                    </div>
                  </div>

                  {executionSource === "skill" ? (
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.skillLabel")}</Label>
                      <Select
                        value={skillId}
                        onValueChange={setSkillId}
                        disabled={skillsQuery.isLoading || articleSkillOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.skillPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {articleSkillOptions.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              {skill.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedArticleSkill?.category ? (
                        <Badge variant="outline">{selectedArticleSkill.category}</Badge>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{t("dialog.articleBuilder.agencyLabel")}</div>
                          <div className="text-xs text-muted-foreground">
                            {agencyId ? (agencyName || agencyId) : t("dialog.articleBuilder.agencyPlaceholder")}
                          </div>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsAgencyModalOpen(true)}>
                          <Bot className="mr-2 h-4 w-4" />
                          {agencyId
                            ? t("dialog.articleBuilder.changeAgency")
                            : t("dialog.articleBuilder.pickAgency")}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-xl border p-4">
                    <div>
                      <div className="text-sm font-medium">{t("dialog.articleBuilder.futureImageLabel")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.futureImageHint")}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="presentation-article-image-count">{t("dialog.articleBuilder.imageCountLabel")}</Label>
                      <Input
                        id="presentation-article-image-count"
                        type="number"
                        min={5}
                        max={20}
                        value={targetImageCount}
                        onChange={(event) => setTargetImageCount(clampImageCount(Number(event.target.value)))}
                      />
                    </div>
                  </div>

                  <fieldset className="space-y-3 rounded-xl border p-4">
                    <legend className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Images className="h-3.5 w-3.5 text-teal-500" />
                      {t("dialog.articleBuilder.mediaOutputLegend")}
                    </legend>

                    <div className="space-y-1.5">
                      <Label>{t("dialog.articleBuilder.mediaModelLabel")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.mediaModelHint")}
                      </p>
                      <ImageModelCombobox
                        value={imageModel}
                        mediaType="image"
                        onValueChange={applyNextImageModel}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t("dialog.articleBuilder.slideVisualModeLabel")}</Label>
                      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("dialog.articleBuilder.slideVisualModeLabel")}>
                        {(["editable", "full-slide-image"] as SlideVisualMode[]).map((mode) => (
                          <Button
                            key={mode}
                            type="button"
                            variant={slideVisualMode === mode ? "default" : "outline"}
                            size="sm"
                            aria-pressed={slideVisualMode === mode}
                            onClick={() => {
                              if (slideVisualMode === mode) {
                                return;
                              }
                              setSlideVisualMode(mode);
                              setGeneratedImages([]);
                              setGeneratedSlideDraft(null);
                              setGeneratedSlideDraftSkillId("");
                            }}
                          >
                            {mode === "full-slide-image"
                              ? t("dialog.articleBuilder.fullSlideImageMode")
                              : t("dialog.articleBuilder.editableSlideMode")}
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {slideVisualMode === "full-slide-image"
                          ? t("dialog.articleBuilder.fullSlideImageModeHint")
                          : t("dialog.articleBuilder.editableSlideModeHint")}
                      </p>
                    </div>

                    {isFullSlideImageMode ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="presentation-article-full-slide-style">{t("dialog.articleBuilder.fullSlideStyleLabel")}</Label>
                        <select
                          id="presentation-article-full-slide-style"
                          aria-label={t("dialog.articleBuilder.fullSlideStyleLabel")}
                          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                          value={fullSlideImageStyleId}
                          onChange={(event) => {
                            const nextStyleId = normalizeFullSlideImageStyleId(event.target.value);
                            if (nextStyleId === fullSlideImageStyleId) {
                              return;
                            }
                            setFullSlideImageStyleId(nextStyleId);
                            setGeneratedImages([]);
                            setGeneratedSlideDraft(null);
                            setGeneratedSlideDraftSkillId("");
                          }}
                        >
                          <option value={AUTO_FULL_SLIDE_STYLE_ID}>{t("dialog.articleBuilder.fullSlideStyleAuto")}</option>
                          {FULL_SLIDE_IMAGE_STYLE_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.label} - {preset.bestFor}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          {fullSlideImageStyleId === AUTO_FULL_SLIDE_STYLE_ID
                            ? t("dialog.articleBuilder.fullSlideStyleAutoHint", { style: activeFullSlideImageStylePreset.label })
                            : t("dialog.articleBuilder.fullSlideStyleHint")}
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label htmlFor="presentation-article-aspect-ratio">{t("dialog.articleBuilder.aspectRatioLabel")}</Label>
                      <select
                        id="presentation-article-aspect-ratio"
                        aria-label={t("dialog.articleBuilder.aspectRatioLabel")}
                        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                        value={canvasRatio}
                        onChange={(event) => setCanvasRatio(normalizeCanvasRatio(event.target.value))}
                      >
                        {supportedCanvasOptions.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {isFullSlideImageMode
                          ? t("dialog.articleBuilder.fullSlideAspectRatioHint")
                          : t("dialog.articleBuilder.aspectRatioHint")}
                      </p>
                    </div>

                    <div className="space-y-2 rounded-md border border-muted bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label className="text-sm">{t("dialog.articleBuilder.advancedMediaLabel")}</Label>
                          <p className="text-xs text-muted-foreground">
                            {t("dialog.articleBuilder.advancedMediaHint")}
                          </p>
                        </div>
                        <Switch
                          aria-label={t("dialog.articleBuilder.advancedMediaLabel")}
                          checked={advancedMediaOptionsEnabled}
                          onCheckedChange={setAdvancedMediaOptionsEnabled}
                        />
                      </div>
                      {advancedMediaOptionsEnabled ? (
                        <ModelInputFieldsPanel
                          enabled
                          model={selectedImageModelConfig}
                          fields={selectedMediaModelFields}
                          extraParams={mediaModelExtraParams}
                          onChange={(key, value) => {
                            setMediaModelExtraParams((prev) => ({ ...prev, [key]: value }));
                          }}
                          promptPreview="Auto from slide image prompts"
                          aspectRatioPreview={canvasRatio}
                          panelTestId="article-builder-advanced-media-model-inputs"
                          emptyTestId="article-builder-advanced-media-model-inputs-empty"
                        />
                      ) : null}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-3 rounded-xl border p-4">
                    <legend className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      <Palette className="h-3.5 w-3.5 text-teal-500" />
                      {t("dialog.articleBuilder.visualReferencesLegend")}
                    </legend>
                    <div className="space-y-1.5">
                      <Label htmlFor="presentation-image-prompt-context">{t("dialog.articleBuilder.imagePromptContextLabel")}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.imagePromptContextHint")}
                      </p>
                      <Textarea
                        id="presentation-image-prompt-context"
                        value={imagePromptContext}
                        onChange={(event) => setImagePromptContext(event.target.value)}
                        placeholder={t("dialog.articleBuilder.imagePromptContextPlaceholder")}
                        rows={4}
                      />
                    </div>
                  </fieldset>

                  <div className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LayoutTemplate className="h-4 w-4" />
                      {t("dialog.articleBuilder.slideSkillSectionTitle")}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.slideSkillLabel")}</Label>
                      <Select
                        value={slideSkillId}
                        onValueChange={handleSlideSkillChange}
                        disabled={skillsQuery.isLoading || slideSkillOptions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.slideSkillPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {slideSkillOptions.map((skill) => (
                            <SelectItem key={skill.id} value={skill.id}>
                              {skill.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    {selectedSlideSkill?.category ? (
                      <Badge variant="outline">{selectedSlideSkill.category}</Badge>
                    ) : null}
                    {bundleNeedsRefreshAfterSkillChange || slideDraftNeedsRefreshAfterSkillChange ? (
                      <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-800">
                        <div>
                          เปลี่ยน slide skill แล้ว: ทำ `Prepare Bundle` ใหม่ และ `Generate Slide JSON` ใหม่ก่อนนำเข้า ส่วนรูปจะพยายาม reuse ให้เท่าที่ slot เดิมยังตรงกัน
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-rose-300 bg-white text-rose-900 hover:bg-rose-100"
                            onClick={() => void handlePrepareSlideBundle({
                              successMessage: t("dialog.articleBuilder.prepareBundleSuccess"),
                              preserveExistingImages: true,
                            })}
                            disabled={!article.trim() || prepareSlideBundleMutation.isPending}
                          >
                            {prepareSlideBundleMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <LayoutTemplate className="mr-2 h-4 w-4" />
                            )}
                            Refresh bundle now
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-rose-300 bg-white text-rose-900 hover:bg-rose-100"
                            onClick={() => void handleGenerateSlideDraft({
                              successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess"),
                            })}
                            disabled={
                              !article.trim()
                              || !preparedBundle
                              || bundleNeedsRefreshAfterSkillChange
                              || generateSlideDraftMutation.isPending
                            }
                          >
                            {generateSlideDraftMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <FileJson className="mr-2 h-4 w-4" />
                            )}
                            Regenerate slides now
                          </Button>
                        </div>
                        <div className="text-[11px] text-rose-700/90">
                          ถ้าเพิ่งเปลี่ยน skill มาใหม่ แนะนำให้กด `Refresh bundle now` ก่อน แล้วค่อย `Regenerate slides now`
                        </div>
                      </div>
                    ) : null}
                  </div>
                    {isEditorialLayoutPlannerSelected ? (
                      <div className="space-y-4 rounded-xl border border-dashed bg-muted/10 p-3 sm:p-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">Editorial Layout Planner Options</div>
                          <p className="text-xs text-muted-foreground">
                            ตัวเลือกชุดนี้จะถูกส่งเฉพาะตอนใช้ `editorial-layout-planner` เท่านั้น
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Quick Presets</Label>
                          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => applyEditorialPlannerQuickPreset(recommendedEditorialPlannerPreset)}
                            >
                              Apply recommended defaults
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Recommended: {recommendedEditorialPlannerPreset.label}
                              {" · "}
                              {recommendedEditorialPlannerPreset.description}
                            </span>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {EDITORIAL_PLANNER_QUICK_PRESETS.map((preset) => {
                              const isActive = activeEditorialPlannerQuickPresetId === preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  aria-pressed={isActive}
                                  className={cn(
                                    "rounded-2xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
                                    isActive
                                      ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary shadow-sm shadow-primary/10"
                                      : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
                                  )}
                                  onClick={() => applyEditorialPlannerQuickPreset(preset)}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="text-sm font-semibold leading-6">{preset.label}</div>
                                    {isActive ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
                                  </div>
                                  <div className={cn("mt-1 text-xs leading-5", isActive ? "text-foreground/80" : "text-muted-foreground")}>
                                    {preset.description}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Audience</Label>
                            <Select
                              value={editorialPlannerAudiencePreset}
                              onValueChange={(value) => setEditorialPlannerAudiencePreset(value as EditorialPlannerAudiencePreset)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="parents">Parents</SelectItem>
                                <SelectItem value="educators">Educators</SelectItem>
                                <SelectItem value="healthcare">Healthcare</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Tone</Label>
                            <Select
                              value={editorialPlannerTonePreset}
                              onValueChange={(value) => setEditorialPlannerTonePreset(value as EditorialPlannerTonePreset)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="warm_parenting">Warm Parenting</SelectItem>
                                <SelectItem value="premium_editorial">Premium Editorial</SelectItem>
                                <SelectItem value="clinical_guidance">Clinical Guidance</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Layout Priority</Label>
                            <Select
                              value={editorialPlannerFitPreset}
                              onValueChange={(value) => setEditorialPlannerFitPreset(value as EditorialPlannerFitPreset)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="balanced">Balanced</SelectItem>
                                <SelectItem value="image_forward">Image Forward</SelectItem>
                                <SelectItem value="text_safe">Text Safe</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <p className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          `Image Forward` จะดันภาพให้เด่นขึ้น, `Text Safe` จะคุมการอ่านและ repaginate เข้มขึ้น, `Balanced` จะสมดุลระหว่างสองฝั่ง
                        </p>
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Page Count Mode</Label>
                            <Select
                              value={editorialPlannerPageCountMode}
                              onValueChange={(value) => setEditorialPlannerPageCountMode(value as EditorialPlannerPageCountMode)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">Auto</SelectItem>
                                <SelectItem value="fixed">Fixed</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              `Auto` ให้ skill คำนวณจำนวนหน้าเอง, `Fixed` จะบังคับตามจำนวนหน้าที่กำหนด
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label>Requested Page Count</Label>
                            <Input
                              type="number"
                              min={1}
                              max={20}
                              disabled={editorialPlannerPageCountMode !== "fixed"}
                              value={editorialPlannerRequestedPageCount}
                              onChange={(event) => setEditorialPlannerRequestedPageCount(Number(event.target.value || 1))}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Global Style Prompt</Label>
                          <Textarea
                            value={editorialPlannerGlobalStylePrompt}
                            onChange={(event) => setEditorialPlannerGlobalStylePrompt(event.target.value)}
                            rows={5}
                            className="text-sm leading-6"
                            placeholder="Warm editorial photography, soft warm daylight, cozy nursery..."
                          />
                        </div>
                        <div className="grid gap-3 2xl:grid-cols-3 xl:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Render Safety JSON</Label>
                            <Textarea
                              value={editorialPlannerRenderSafetyJson}
                              onChange={(event) => setEditorialPlannerRenderSafetyJson(event.target.value)}
                              rows={9}
                              className="font-mono text-xs leading-5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Page Fill Rules JSON</Label>
                            <Textarea
                              value={editorialPlannerPageFillRulesJson}
                              onChange={(event) => setEditorialPlannerPageFillRulesJson(event.target.value)}
                              rows={9}
                              className="font-mono text-xs leading-5"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Quality Optimizer JSON</Label>
                            <Textarea
                              value={editorialPlannerQualityOptimizerJson}
                              onChange={(event) => setEditorialPlannerQualityOptimizerJson(event.target.value)}
                              rows={9}
                              className="font-mono text-xs leading-5"
                            />
                          </div>
                        </div>
                        {editorialPlannerJsonError ? (
                          <p className="text-xs text-destructive">{editorialPlannerJsonError}</p>
                        ) : null}
                        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="text-sm font-semibold">Image Assets</div>
                              <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                                รองรับทั้ง `image_prompt` และ `uploaded_image` สำหรับ `editorial-layout-planner`
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditorialPlannerImageAssets((previous) => [
                                  ...previous,
                                  createEditorialPlannerImageAssetDraft(),
                                ]);
                              }}
                            >
                              เพิ่ม image asset
                            </Button>
                          </div>
                          {editorialPlannerImageAssets.length === 0 ? (
                            <p className="text-xs text-muted-foreground">ตอนนี้จะส่ง `image_assets: []` ถ้าไม่เพิ่มรายการ</p>
                          ) : null}
                          {editorialPlannerAssetValidation.errors.length > 0 ? (
                            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                              {editorialPlannerAssetValidation.errors.map((message) => (
                                <p key={message} className="text-xs text-destructive">{message}</p>
                              ))}
                            </div>
                          ) : null}
                          {editorialPlannerAssetValidation.warnings.length > 0 ? (
                            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2">
                              {editorialPlannerAssetValidation.warnings.map((message) => (
                                <p key={message} className="text-xs text-amber-800">{message}</p>
                              ))}
                            </div>
                          ) : null}
                          <div className="space-y-3">
                            {editorialPlannerImageAssets.map((asset, index) => (
                              <div key={asset.id} className="space-y-3 rounded-xl border bg-background p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="text-sm font-medium">Asset #{index + 1}</div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditorialPlannerImageAssets((previous) => previous.filter((entry) => entry.id !== asset.id));
                                    }}
                                  >
                                    ลบ
                                  </Button>
                                </div>
                                <div className="grid gap-3 xl:grid-cols-3">
                                  <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select
                                      value={asset.assetType}
                                      onValueChange={(value) => {
                                        setEditorialPlannerImageAssets((previous) => previous.map((entry) => (
                                          entry.id === asset.id
                                            ? {
                                                ...entry,
                                                assetType: value as EditorialPlannerImageAssetType,
                                              }
                                            : entry
                                        )));
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="image_prompt">image_prompt</SelectItem>
                                        <SelectItem value="uploaded_image">uploaded_image</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Label</Label>
                                    <Input
                                      value={asset.label}
                                      onChange={(event) => {
                                        setEditorialPlannerImageAssets((previous) => previous.map((entry) => (
                                          entry.id === asset.id ? { ...entry, label: event.target.value } : entry
                                        )));
                                      }}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Page Hint</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      max={20}
                                      value={asset.pageHint}
                                      onChange={(event) => {
                                        setEditorialPlannerImageAssets((previous) => previous.map((entry) => (
                                          entry.id === asset.id ? { ...entry, pageHint: event.target.value } : entry
                                        )));
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 xl:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>{asset.assetType === "uploaded_image" ? "Reference URL" : "Prompt"}</Label>
                                    <Textarea
                                      value={asset.assetType === "uploaded_image" ? asset.reference : asset.prompt}
                                      onChange={(event) => {
                                        setEditorialPlannerImageAssets((previous) => previous.map((entry) => (
                                          entry.id === asset.id
                                            ? (
                                              asset.assetType === "uploaded_image"
                                                ? { ...entry, reference: event.target.value }
                                                : { ...entry, prompt: event.target.value }
                                            )
                                            : entry
                                        )));
                                      }}
                                      rows={4}
                                      className="text-sm leading-6"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{asset.assetType === "uploaded_image" ? "Optional Prompt" : "Optional Reference"}</Label>
                                    <Textarea
                                      value={asset.assetType === "uploaded_image" ? asset.prompt : asset.reference}
                                      onChange={(event) => {
                                        setEditorialPlannerImageAssets((previous) => previous.map((entry) => (
                                          entry.id === asset.id
                                            ? (
                                              asset.assetType === "uploaded_image"
                                                ? { ...entry, prompt: event.target.value }
                                                : { ...entry, reference: event.target.value }
                                            )
                                            : entry
                                        )));
                                      }}
                                      rows={4}
                                      className="text-sm leading-6"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                          <div className="text-sm font-semibold">Resolved Defaults Preview</div>
                          <p className="text-xs text-muted-foreground">
                            ค่าตั้งต้นหลังรวม preset กับ advanced options
                          </p>
                          <Textarea
                            value={JSON.stringify(editorialPlannerPresetPreview, null, 2)}
                            readOnly
                            rows={14}
                            className="bg-background font-mono text-xs leading-5"
                          />
                        </div>
                        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                          <div className="text-sm font-semibold">Actual Payload Preview</div>
                          <p className="text-xs text-muted-foreground">
                            preview นี้สร้างจาก payload builder ตัวเดียวกับฝั่ง server
                          </p>
                          <Textarea
                            value={editorialPlannerPayloadPreviewJson}
                            readOnly
                            rows={18}
                            className="bg-background font-mono text-xs leading-5"
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>{t("dialog.articleBuilder.slideOutputFormatLabel")}</Label>
                      <Select
                        value={slideOutputFormat}
                        onValueChange={(value) => setSlideOutputFormat(value as SlideOutputFormat)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("dialog.articleBuilder.slideOutputFormatPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectableSlideOutputFormats.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.slideOutputFormatHint")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="presentation-article-web-search">{t("dialog.articleBuilder.webSearchLabel")}</Label>
                      <Switch
                        id="presentation-article-web-search"
                        checked={requiresWebSearch}
                        onCheckedChange={setRequiresWebSearch}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="presentation-article-thinking">{t("dialog.articleBuilder.thinkingLabel")}</Label>
                      <Switch
                        id="presentation-article-thinking"
                        checked={requiresThinking}
                        onCheckedChange={setRequiresThinking}
                      />
                    </div>
                  </div>
                  </div>
                </section>

                <section className="min-h-0 lg:flex lg:h-[calc(92vh-13rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-2xl lg:border lg:bg-background/60 lg:p-3">
                  <div className="flex min-h-0 flex-col space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                    <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                        <div className="text-sm font-semibold">{t("dialog.articleBuilder.workflowTitle")}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("dialog.articleBuilder.workflowDescription")}
                        </div>
                        </div>
                      <Badge variant="outline">{slideOutputFormats.join(", ").toUpperCase()}</Badge>
                    </div>
                    {guidedWorkflowMessage ? (
                      <div className="sticky top-0 z-10 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-medium text-primary shadow-sm">
                        {guidedWorkflowMessage}
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      {[
                        {
                          step: 1,
                          title: t("dialog.articleBuilder.workflowStep1Title"),
                          description: t("dialog.articleBuilder.workflowStep1Description"),
                          status: articleStepStatus,
                          action: (
                            <Button
                              type="button"
                              className="w-full"
                              ref={(node) => {
                                workflowPrimaryActionRefs.current[1] = node;
                              }}
                              onClick={() => void handleGenerate()}
                              disabled={generateArticleMutation.isPending}
                            >
                              {generateArticleMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("dialog.articleBuilder.generating")}
                                </>
                              ) : (
                                <>
                                  <WandSparkles className="mr-2 h-4 w-4" />
                                  {article.trim()
                                    ? t("dialog.articleBuilder.regenerate")
                                    : t("dialog.articleBuilder.generate")}
                                </>
                              )}
                            </Button>
                          ),
                        },
                        {
                          step: 2,
                          title: t("dialog.articleBuilder.workflowStep2Title"),
                          description: t("dialog.articleBuilder.workflowStep2Description"),
                          status: bundleStepStatus,
                          hint: bundleRefreshHint,
                          action: (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              ref={(node) => {
                                workflowPrimaryActionRefs.current[2] = node;
                              }}
                              onClick={() => void handlePrepareSlideBundle({
                                successMessage: t("dialog.articleBuilder.prepareBundleSuccess"),
                                preserveExistingImages: true,
                              })}
                              disabled={!article.trim() || prepareSlideBundleMutation.isPending}
                            >
                              {prepareSlideBundleMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <LayoutTemplate className="mr-2 h-4 w-4" />
                              )}
                              {t("dialog.articleBuilder.prepareBundle")}
                            </Button>
                          ),
                        },
                        {
                          step: 3,
                          title: t("dialog.articleBuilder.workflowStep3Title"),
                          description: isFullSlideImageMode
                            ? t("dialog.articleBuilder.workflowStep3FullSlideDescription")
                            : t("dialog.articleBuilder.workflowStep3Description"),
                          status: imageStepStatus,
                          hint: imageRefreshHint,
                          action: (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              ref={(node) => {
                                workflowPrimaryActionRefs.current[3] = node;
                              }}
                              onClick={() => void handleGenerateImages()}
                              disabled={!article.trim() || isGeneratingImages || generateImageAsyncMutation.isPending}
                            >
                              {isGeneratingImages ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Images className="mr-2 h-4 w-4" />
                              )}
                              {missingImagePrompts.length > 0 && normalizedGeneratedImages.length > 0
                                ? t("dialog.articleBuilder.generateMissingImages")
                                : isFullSlideImageMode
                                  ? t("dialog.articleBuilder.generateFullSlideImages")
                                  : t("dialog.articleBuilder.generateImages")}
                              {imageGenerationProgress ? ` ${imageGenerationProgress}` : ""}
                            </Button>
                          ),
                        },
                        {
                          step: 4,
                          title: t("dialog.articleBuilder.workflowStep4Title"),
                          description: t("dialog.articleBuilder.workflowStep4Description"),
                          status: slideStepStatus,
                          hint: slideGenerationBlockedHint,
                          action: (
                            <div className="flex flex-col gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                ref={(node) => {
                                  workflowPrimaryActionRefs.current[4] = node;
                                }}
                                onClick={() => void handleGenerateSlideDraft({ successMessage: t("dialog.articleBuilder.generateSlideJsonSuccess") })}
                                disabled={
                                  !article.trim()
                                  || !preparedBundle
                                  || generateSlideDraftMutation.isPending
                                  || Boolean(slideGenerationBlockedHint)
                                }
                              >
                                {generateSlideDraftMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <FileJson className="mr-2 h-4 w-4" />
                                )}
                                {t("dialog.articleBuilder.generateSlideJson")}
                              </Button>
                              {downloadableSlideArtifact ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => window.open(downloadableSlideArtifact.url, "_blank", "noopener,noreferrer")}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  {t("dialog.articleBuilder.downloadFormat", {
                                    format: downloadableSlideArtifact.format.toUpperCase(),
                                  })}
                                </Button>
                              ) : generatedSlideDraft?.artifactJobId ? (
                                <Button type="button" variant="outline" className="w-full" disabled>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {t("dialog.articleBuilder.preparingFormat", {
                                    format: slideOutputFormat.toUpperCase(),
                                  })}
                                </Button>
                              ) : null}
                            </div>
                          ),
                        },
                      ].map((stepCard) => {
                        const statusBadge = renderWizardStatusBadge(stepCard.status);
                        const isGuidedStep = guidedWorkflowStep === stepCard.step;
                        return (
                          <div
                            key={stepCard.step}
                            ref={(node) => {
                              workflowStepRefs.current[stepCard.step] = node;
                            }}
                            className={cn(
                              "rounded-2xl border bg-background p-4 shadow-sm transition-all",
                              isGuidedStep && "ring-2 ring-primary/50 shadow-md shadow-primary/10",
                            )}
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                                  stepCard.status === "done"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : stepCard.status === "running"
                                      ? "border-sky-200 bg-sky-50 text-sky-700"
                                      : stepCard.status === "stale"
                                        ? "border-rose-200 bg-rose-50 text-rose-700"
                                      : stepCard.status === "ready"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                }`}
                                >
                                  {stepCard.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : stepCard.step}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold">{stepCard.title}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {t("dialog.articleBuilder.workflowStepLabel", { step: stepCard.step })}
                                  </div>
                                </div>
                              </div>
                              <Badge variant="outline" className={statusBadge.className}>
                                {statusBadge.label}
                              </Badge>
                            </div>
                            <p className="mb-4 text-xs leading-5 text-muted-foreground">
                              {stepCard.description}
                            </p>
                            {stepCard.hint ? (
                              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                                {stepCard.hint}
                              </div>
                            ) : null}
                            {isGuidedStep ? (
                              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium leading-5 text-primary">
                                ขั้นตอนถัดไปที่แนะนำสำหรับตอนนี้
                              </div>
                            ) : null}
                            {stepCard.action}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Textarea
                    value={article}
                    onChange={(event) => setArticle(event.target.value)}
                    placeholder={t("dialog.articleBuilder.articlePlaceholder")}
                    rows={18}
                    className="h-[42vh] min-h-[320px] resize-none overflow-y-auto font-medium"
                  />

                  <div className="grid min-h-0 gap-4 xl:grid-cols-2">
                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.bundleSummaryLabel")}</div>
                        {preparedBundle?.modelId ? <Badge variant="secondary">{preparedBundle.modelId}</Badge> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.maxPagesLabel")}</div>
                          <div className="text-lg font-semibold">{preparedBundle?.maxPages ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.plannedImagesLabel")}</div>
                          <div className="text-lg font-semibold">{preparedBundle?.plannedImageCount ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.slideSkillLabel")}</div>
                          <div className="font-medium">{preparedBundle?.slideSkillLabel ?? selectedSlideSkill?.name ?? "-"}</div>
                        </div>
                        <div className="rounded-lg bg-muted/40 p-3">
                          <div className="text-xs text-muted-foreground">{t("dialog.articleBuilder.slideOutputFormatLabel")}</div>
                          <div className="font-medium">{slideOutputFormats.join(", ").toUpperCase()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.promptPlanLabel")}</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void copyText(
                            formatPromptPlan(preparedBundle?.imagePrompts ?? []),
                            t("dialog.articleBuilder.copyPromptPlanSuccess"),
                            t("dialog.articleBuilder.copyPromptPlanEmpty"),
                          )}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {t("dialog.articleBuilder.copyPromptPlan")}
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={formatPromptPlan(preparedBundle?.imagePrompts ?? [])}
                        placeholder={t("dialog.articleBuilder.promptPlanPlaceholder")}
                        rows={10}
                        className="min-h-[220px] resize-none"
                      />
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.generatedImagesLabel")}</div>
                        <Badge variant="outline">
                          {t("dialog.articleBuilder.generatedImagesCoverage", {
                            current: normalizedGeneratedImages.length,
                            total: preparedBundle?.imagePrompts?.length ?? normalizedGeneratedImages.length,
                          })}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("dialog.articleBuilder.generatedImagesHint")}
                      </p>
                      <div className="grid min-h-[220px] gap-3 sm:grid-cols-2">
                        {generatedImageCards.length > 0 ? generatedImageCards.map(({ prompt, asset, fallbackAsset }) => {
                          const imageLabel = `Page ${prompt.pageNumber} · ${prompt.shortLabel}`;
                          const slotKey = getPreparedImageSlotKey(prompt);
                          const isSlotRegenerating = regeneratingSlotKey === slotKey;
                          const isPickerOpen = slotPickerKey === slotKey;
                          const previewAspectRatio = isFullSlideImageMode ? getCanvasRatioCss(canvasRatio) : undefined;
                          const displayAsset = asset ?? fallbackAsset;
                          const isFallbackAsset = !asset && Boolean(fallbackAsset);
                          const isPageLeadSlot = (preparedBundle?.imagePrompts ?? [])
                            .filter((candidate) => candidate.pageNumber === prompt.pageNumber)
                            .sort((left, right) => left.imageIndex - right.imageIndex)[0]?.id === prompt.id;
                          return (
                            <div key={slotKey} className="rounded-xl border bg-muted/20 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium">{imageLabel}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {prompt.placementRole} · #{prompt.imageIndex}
                                  </div>
                                </div>
                                <Badge variant={isSlotRegenerating ? "default" : asset ? "secondary" : "outline"}>
                                  {isSlotRegenerating
                                    ? t("dialog.articleBuilder.generating")
                                    : asset
                                      ? t("dialog.articleBuilder.generatedImageReady")
                                      : isFallbackAsset
                                        ? t("dialog.articleBuilder.generatedImageOldSize")
                                        : t("dialog.articleBuilder.generatedImageMissing")}
                                </Badge>
                              </div>
                              {displayAsset ? (
                                <div className="mt-3 space-y-3">
                                  <button
                                    type="button"
                                    className={`group relative block w-full overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary${isFullSlideImageMode ? "" : " h-40"}`}
                                    style={previewAspectRatio ? { aspectRatio: previewAspectRatio } : undefined}
                                    onClick={() => setPreviewImageAsset(displayAsset)}
                                    aria-label={`${t("dialog.articleBuilder.previewImage")} ${imageLabel}`}
                                  >
                                    <img
                                      src={displayAsset.url}
                                      alt={imageLabel}
                                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                      loading="lazy"
                                    />
                                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                      <Maximize2 className="h-3.5 w-3.5" />
                                      {t("dialog.articleBuilder.previewImage")}
                                    </span>
                                    {isSlotRegenerating ? (
                                      <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-medium text-foreground backdrop-blur-[1px]">
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("dialog.articleBuilder.generating")}
                                      </span>
                                    ) : null}
                                    {isFallbackAsset ? (
                                      <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-full bg-amber-100/95 px-2 py-1 text-xs font-medium text-amber-900 shadow-sm">
                                        {t("dialog.articleBuilder.generatedImageOldSizeHint", {
                                          ratio: fallbackAsset?.canvasRatio ?? "-",
                                          currentRatio: canvasRatio,
                                        })}
                                      </span>
                                    ) : null}
                                  </button>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setPreviewImageAsset(displayAsset)}
                                    >
                                      <Maximize2 className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.previewImage")}
                                    </Button>
                                    <a
                                      href={displayAsset.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex"
                                    >
                                      <Button type="button" variant="outline" size="sm">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        {t("dialog.articleBuilder.openImage")}
                                      </Button>
                                    </a>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void copyText(
                                        displayAsset.url,
                                        t("dialog.articleBuilder.copyImageUrlSuccess"),
                                        t("dialog.articleBuilder.copyImageUrlEmpty"),
                                      )}
                                    >
                                      <Copy className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.copyImageUrl")}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setGeneratedImages((previous) => previous.filter(
                                          (candidate) => getPreparedImageSlotKey(candidate) !== slotKey,
                                        ));
                                        setGeneratedSlideDraft(null);
                                        setGeneratedSlideDraftSkillId("");
                                      }}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.removeImage")}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleRegenerateSlot(prompt)}
                                      disabled={isSlotRegenerating}
                                    >
                                      {isSlotRegenerating ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <WandSparkles className="mr-2 h-4 w-4" />
                                      )}
                                      {isSlotRegenerating
                                        ? t("dialog.articleBuilder.generating")
                                        : t("dialog.articleBuilder.regenerateSlot")}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openSlotPickerForPrompt(prompt)}
                                    >
                                      <Images className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.pickSlotImage")}
                                    </Button>
                                    {!isFullSlideImageMode ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => removePreparedImageSlot(prompt)}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        {t("dialog.articleBuilder.removeImageSlot")}
                                      </Button>
                                    ) : null}
                                    {!isFullSlideImageMode && isPageLeadSlot ? (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleAddPreparedImageSlot(prompt.pageNumber)}
                                      >
                                        <Images className="mr-2 h-4 w-4" />
                                        {t("dialog.articleBuilder.addImageSlot")}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  <div className="rounded-lg border border-dashed bg-background/70 p-3">
                                    <div className="text-xs font-medium text-muted-foreground">
                                      {t("dialog.articleBuilder.generatedImagePromptLabel")}
                                    </div>
                                    <p className="mt-2 line-clamp-5 text-sm text-muted-foreground">
                                      {prompt.prompt}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleRegenerateSlot(prompt)}
                                    disabled={isSlotRegenerating}
                                  >
                                    {isSlotRegenerating ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <WandSparkles className="mr-2 h-4 w-4" />
                                    )}
                                    {isSlotRegenerating
                                      ? t("dialog.articleBuilder.generating")
                                      : t("dialog.articleBuilder.regenerateSlot")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openSlotPickerForPrompt(prompt)}
                                  >
                                    <Images className="mr-2 h-4 w-4" />
                                    {t("dialog.articleBuilder.pickSlotImage")}
                                  </Button>
                                  {!isFullSlideImageMode ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => removePreparedImageSlot(prompt)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.removeImageSlot")}
                                    </Button>
                                  ) : null}
                                  {!isFullSlideImageMode && isPageLeadSlot ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAddPreparedImageSlot(prompt.pageNumber)}
                                    >
                                      <Images className="mr-2 h-4 w-4" />
                                      {t("dialog.articleBuilder.addImageSlot")}
                                    </Button>
                                  ) : null}
                                </div>
                              )}
                              {isPickerOpen ? (
                                <div className="mt-3 space-y-3 rounded-lg border bg-background/80 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={slotPickerTab === "library" ? "default" : "outline"}
                                      onClick={() => setSlotPickerTab("library")}
                                    >
                                      {t("dialog.articleBuilder.assetPickerLibrary")}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={slotPickerTab === "history" ? "default" : "outline"}
                                      onClick={() => setSlotPickerTab("history")}
                                    >
                                      {t("dialog.articleBuilder.assetPickerHistory")}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setSlotPickerKey(null)}
                                    >
                                      {t("dialog.articleBuilder.close")}
                                    </Button>
                                  </div>
                                  <Input
                                    value={slotPickerSearchQuery}
                                    onChange={(event) => setSlotPickerSearchQuery(event.target.value)}
                                    placeholder={t("dialog.articleBuilder.assetPickerSearchPlaceholder")}
                                  />
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {pickerAssets.length > 0 ? pickerAssets.map((pickerAsset) => (
                                      <div key={`${pickerAsset.sourceType}:${pickerAsset.id}:${pickerAsset.sourceUrl}`} className="rounded-lg border p-2">
                                        {pickerAsset.thumbnailUrl ? (
                                          <img
                                            src={pickerAsset.thumbnailUrl}
                                            alt={pickerAsset.title}
                                            className="h-28 w-full rounded-md border object-cover"
                                            loading="lazy"
                                          />
                                        ) : null}
                                        <div className="mt-2 line-clamp-2 text-xs font-medium">{pickerAsset.title}</div>
                                        <div className="mt-1 text-[11px] text-muted-foreground">{pickerAsset.sourceType}</div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="mt-2 w-full"
                                          onClick={() => handleAssignAssetToSlot(prompt, pickerAsset)}
                                        >
                                          {t("dialog.articleBuilder.useThisImage")}
                                        </Button>
                                      </div>
                                    )) : (
                                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground sm:col-span-2">
                                        {t("dialog.articleBuilder.assetPickerEmpty")}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        }) : (
                          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground sm:col-span-2">
                            {t("dialog.articleBuilder.generatedImagesPlaceholder")}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-xl border p-4 xl:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Skill Preflight</div>
                        <Badge variant="outline">{preparedBundle?.preflightPages?.length ?? 0} pages</Badge>
                      </div>
                      {preparedBundle?.preflightWarnings?.length ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          {preparedBundle.preflightWarnings.join(" ")}
                        </div>
                      ) : null}
                      <div className="grid gap-3 lg:grid-cols-2">
                        {(preparedBundle?.preflightPages ?? []).map((page) => {
                          const leadPrompt = leadPromptByPage.get(page.pageNumber) ?? null;
                          const leadSlotKey = leadPrompt ? getPreparedImageSlotKey(leadPrompt) : null;
                          const isLeadSlotRegenerating = leadSlotKey !== null && regeneratingSlotKey === leadSlotKey;
                          return (
                          <div key={page.pageNumber} className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">Page {page.pageNumber}</Badge>
                              <Badge variant="outline">{page.pageIntentHint}</Badge>
                              <Badge variant={page.archetypeMode === "forced" ? "default" : "secondary"}>
                                {page.archetypeMode === "forced" ? "Forced" : "Guided"}: {page.forceArchetype ?? page.preferredArchetype}
                              </Badge>
                              <Badge variant="outline">{pageSlotCounts.get(page.pageNumber) ?? page.recommendedImageCount} images</Badge>
                              {leadPrompt ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleRegenerateSlot(leadPrompt)}
                                  disabled={isLeadSlotRegenerating}
                                >
                                  {isLeadSlotRegenerating ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <WandSparkles className="mr-2 h-4 w-4" />
                                  )}
                                  {isLeadSlotRegenerating
                                    ? t("dialog.articleBuilder.generating")
                                    : t("dialog.articleBuilder.regenerateSlot")}
                                </Button>
                              ) : null}
                              {leadPrompt ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openSlotPickerForPrompt(leadPrompt)}
                                >
                                  <Images className="mr-2 h-4 w-4" />
                                  {t("dialog.articleBuilder.pickSlotImage")}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddPreparedImageSlot(page.pageNumber)}
                                disabled={(pageSlotCounts.get(page.pageNumber) ?? 0) >= 3}
                              >
                                <Images className="mr-2 h-4 w-4" />
                                {t("dialog.articleBuilder.addImageSlot")}
                              </Button>
                            </div>
                            <div className="mt-2 text-sm font-medium">{page.titleHint}</div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Structure: {page.structure.paragraphCount} paragraphs, {page.structure.bulletCount} bullets, {page.structure.workflowStepCount} steps, {page.structure.timelinePhaseCount} phases
                            </div>
                            <Textarea
                              readOnly
                              value={page.compiledText}
                              rows={7}
                              className="mt-3 min-h-[150px] resize-none font-mono text-xs"
                            />
                            {page.warnings.length ? (
                              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                {page.warnings.join(" ")}
                              </div>
                            ) : null}
                          </div>
                        );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Skill Input JSON</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSlidePayloadEditorJson(normalizeSlidePayloadJson(
                                generatedSlideDraft?.slidePayloadJson,
                                normalizeSlidePayloadJson(preparedBundle?.slidePayloadJson),
                              ));
                              setSlidePayloadEditorDirty(false);
                            }}
                          >
                            <WandSparkles className="mr-2 h-4 w-4" />
                            Reset
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyText(
                              slidePayloadEditorJson,
                              "Copied skill input JSON.",
                              "No skill input JSON to copy.",
                            )}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={slidePayloadEditorJson}
                        onChange={(event) => {
                          setSlidePayloadEditorJson(event.target.value);
                          setSlidePayloadEditorDirty(true);
                        }}
                        placeholder="Resolved input that will be sent to the selected slide skill."
                        aria-label="Skill Input JSON"
                        rows={12}
                        className="min-h-[260px] resize-y font-mono text-xs"
                      />
                    </div>

                    <div className="space-y-2 rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{t("dialog.articleBuilder.slideJsonLabel")}</div>
                        <div className="flex items-center gap-2">
                          {generatedSlideDraft?.modelId ? <Badge variant="secondary">{generatedSlideDraft.modelId}</Badge> : null}
                          <Badge variant="outline" className={generatedSlideImportabilityBadge.className}>
                            {generatedSlideImportabilityBadge.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        <div>{generatedSlideImportabilityBadge.hint}</div>
                        <div className="mt-1">{generatedSlidePayloadSourceLabel}</div>
                        {generatedSlideSnapshotSourceLabel ? (
                          <div className="mt-1">{generatedSlideSnapshotSourceLabel}</div>
                        ) : null}
                        {generatedSlideRunTimestamp ? (
                          <div className="mt-1">Generated run: <code>{generatedSlideRunTimestamp}</code></div>
                        ) : null}
                        {generatedSlideImportedTimestamp ? (
                          <div className="mt-1">Imported payload recorded: <code>{generatedSlideImportedTimestamp}</code></div>
                        ) : null}
                        {generatedSlideSelectedSkillId ? (
                          <div className="mt-1">
                            Selected skill run:{" "}
                            <code>
                              {generatedSlideSelectedSkillLabel
                                ? `${generatedSlideSelectedSkillLabel} (${generatedSlideSelectedSkillId})`
                                : generatedSlideSelectedSkillId}
                            </code>
                          </div>
                        ) : null}
                        {generatedSlideRuntimeBundleId ? (
                          <div className="mt-1">
                            Runtime bundle:{" "}
                            <code>
                              {generatedSlideRuntimeBundleLabel
                                ? `${generatedSlideRuntimeBundleLabel} (${generatedSlideRuntimeBundleId})`
                                : generatedSlideRuntimeBundleId}
                            </code>
                            {generatedSlideDraft?.runtimeAliasApplied ? " [runtime alias applied]" : ""}
                          </div>
                        ) : null}
                        {generatedSlideDraft?.importedArtifactUrl ? (
                          <div className="mt-1 break-all">
                            Imported JSON artifact: <code>{generatedSlideDraft.importedArtifactUrl}</code>
                          </div>
                        ) : null}
                        <div className="mt-1">
                          Debug trace: total slides = {generatedSlideImportability.totalSlides}, importable slides = {generatedSlideImportability.importableSlides}
                        </div>
                        {generatedSlideDraft?.debugTracePath ? (
                          <div className="mt-1 break-all">
                            Server debug snapshot: <code>{generatedSlideDraft.debugTracePath}</code>
                          </div>
                        ) : null}
                      </div>
                      {slideGenerationBlockedHint ? (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                          {slideGenerationBlockedHint}
                        </div>
                      ) : null}
                      <Textarea
                        readOnly
                        value={inspectableSlideJson}
                        placeholder={t("dialog.articleBuilder.slideJsonPlaceholder")}
                        aria-label={t("dialog.articleBuilder.slideJsonLabel")}
                        rows={10}
                        className="min-h-[220px] resize-none font-mono text-xs"
                      />
                    </div>
                  </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyText(
                  article,
                  t("dialog.articleBuilder.copySuccess"),
                  t("dialog.articleBuilder.copyEmpty"),
                )}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.copy")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("dialog.articleBuilder.close")}
              </Button>
              <Button
                type="button"
                variant="outline"
                ref={insertSlidesButtonRef}
                onClick={() => {
                  if (!generatedSlideDraft || !canInsertGeneratedSlides) {
                    toast.error("ยังไม่มี slides ที่นำเข้าได้ กรุณา Generate Slide JSON ใหม่อีกครั้ง");
                    return;
                  }
                  const activeDraft = generatedSlideDraft;
                  void (async () => {
                    const insertResult = await onInsertSlides(activeDraft, { closeDialog: false });
                    if (!insertResult.inserted || !insertResult.importedSlideJson?.trim()) {
                      return;
                    }
                    setGeneratedSlideDraft((previous) => {
                      if (!previous) {
                        return previous;
                      }
                      const previousGeneratedAt = typeof previous.generatedAt === "string" ? previous.generatedAt.trim() : "";
                      const activeGeneratedAt = typeof activeDraft.generatedAt === "string" ? activeDraft.generatedAt.trim() : "";
                      const matchesActiveDraft = (
                        (previousGeneratedAt && activeGeneratedAt && previousGeneratedAt === activeGeneratedAt)
                        || previous.slideJson === activeDraft.slideJson
                      );
                      if (!matchesActiveDraft) {
                        return previous;
                      }
                      return {
                        ...previous,
                        importedSlideJson: insertResult.importedSlideJson ?? previous.importedSlideJson ?? null,
                        importedAt: insertResult.importedAt ?? new Date().toISOString(),
                        importedFromArtifact: Boolean(insertResult.importedFromArtifact),
                        importedArtifactUrl: insertResult.importedArtifactUrl ?? null,
                      };
                    });
                  })();
                }}
                disabled={!generatedSlideDraft || !canInsertGeneratedSlides}
              >
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.insertSlides")}
              </Button>
              <Button
                type="button"
                onClick={() => void onUseArticle(article)}
                disabled={!article.trim() || generateArticleMutation.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                {t("dialog.articleBuilder.useAsPresentationNote")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewImageAsset)} onOpenChange={(nextOpen) => !nextOpen && setPreviewImageAsset(null)}>
        <DialogContent className="max-h-[92vh] w-[92vw] max-w-5xl overflow-hidden p-0">
          {previewImageAsset ? (
            <div className="flex max-h-[92vh] flex-col">
              <DialogHeader className="shrink-0 border-b px-5 py-4">
                <DialogTitle className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4" />
                  {t("dialog.articleBuilder.imagePreviewTitle")}
                </DialogTitle>
                <DialogDescription>
                  {`Page ${previewImageAsset.pageNumber} · ${previewImageAsset.shortLabel} · #${previewImageAsset.imageIndex}`}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
                <img
                  src={previewImageAsset.url}
                  alt={`Page ${previewImageAsset.pageNumber} · ${previewImageAsset.shortLabel}`}
                  className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border bg-background object-contain shadow-sm"
                />
              </div>
              <DialogFooter className="shrink-0 border-t px-5 py-4">
                <a
                  href={previewImageAsset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button type="button" variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("dialog.articleBuilder.openImage")}
                  </Button>
                </a>
                <Button type="button" onClick={() => setPreviewImageAsset(null)}>
                  {t("dialog.articleBuilder.close")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AgencyPickerModal
        open={isAgencyModalOpen}
        onClose={() => setIsAgencyModalOpen(false)}
        currentUserId={user?.id ?? null}
        requireRunnable
        onSelect={(agency) => {
          setAgencyId(agency.id);
          setAgencyName(agency.name);
          setIsAgencyModalOpen(false);
        }}
      />
    </>
  );
}
