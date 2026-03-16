import type { PresentationMediaShape } from "./contracts";

export const BUILT_IN_PRESENTATION_COMPONENT_IDS = [
  "process-steps",
  "timeline-flow",
  "timeline-report",
  "feature-highlights",
  "infographic-grid",
  "stat-cards",
  "sectioned-explainer",
  "article-focus",
  "two-column-article",
  "image-top-article",
  "image-bottom-article",
  "image-left-article",
  "image-right-article",
  "faq-stack",
  "profile-board",
  "profile-summary",
  "quote-callout",
  "video-spotlight",
  "poster-spotlight",
  "framed-image-story",
  "photo-collage",
  "a4-photo-grid",
  "landscape-photo-story",
  "fullpage-image",
  "fullpage-image-landscape",
  "fullpage-video",
  "fullpage-video-landscape",
  "wide-hero-article",
  "split-image-article",
  "centered-hero-article",
  "compact-article",
] as const;

export type BuiltInPresentationComponentId =
  (typeof BUILT_IN_PRESENTATION_COMPONENT_IDS)[number];

export type PresentationComponentMediaSlotType = "image" | "video" | "media";
export type PresentationComponentRenderableMediaType = "image" | "video";

export const PRESENTATION_COMPONENT_MEDIA_SLOTS: Partial<
  Record<BuiltInPresentationComponentId, readonly string[]>
> = {
  "sectioned-explainer": ["hero"],
  "article-focus": ["hero"],
  "two-column-article": ["hero"],
  "image-top-article": ["hero"],
  "image-bottom-article": ["hero"],
  "image-left-article": ["hero"],
  "image-right-article": ["hero"],
  "wide-hero-article": ["hero"],
  "split-image-article": ["hero"],
  "centered-hero-article": ["hero"],
  "profile-board": ["portrait"],
  "profile-summary": ["portrait"],
  "video-spotlight": ["clip"],
  "poster-spotlight": ["hero"],
  "framed-image-story": ["photo"],
  "photo-collage": ["primary-photo", "secondary-photo"],
  "a4-photo-grid": ["hero-photo", "detail-photo-1", "detail-photo-2", "detail-photo-3", "detail-photo-4"],
  "landscape-photo-story": ["hero-photo", "detail-photo-1", "detail-photo-2", "detail-photo-3"],
  "fullpage-image": ["fullpage"],
  "fullpage-image-landscape": ["fullpage"],
  "fullpage-video": ["fullpage"],
  "fullpage-video-landscape": ["fullpage"],
};

export const PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES: Partial<
  Record<BuiltInPresentationComponentId, Record<string, PresentationComponentMediaSlotType>>
> = {
  "sectioned-explainer": { hero: "media" },
  "article-focus": { hero: "media" },
  "two-column-article": { hero: "media" },
  "image-top-article": { hero: "media" },
  "image-bottom-article": { hero: "media" },
  "image-left-article": { hero: "media" },
  "image-right-article": { hero: "media" },
  "wide-hero-article": { hero: "media" },
  "split-image-article": { hero: "media" },
  "centered-hero-article": { hero: "media" },
  "profile-board": { portrait: "image" },
  "profile-summary": { portrait: "image" },
  "video-spotlight": { clip: "video" },
  "poster-spotlight": { hero: "media" },
  "framed-image-story": { photo: "media" },
  "photo-collage": { "primary-photo": "media", "secondary-photo": "media" },
  "a4-photo-grid": {
    "hero-photo": "media",
    "detail-photo-1": "media",
    "detail-photo-2": "media",
    "detail-photo-3": "media",
    "detail-photo-4": "media",
  },
  "landscape-photo-story": {
    "hero-photo": "media",
    "detail-photo-1": "media",
    "detail-photo-2": "media",
    "detail-photo-3": "media",
  },
  "fullpage-image": { fullpage: "image" },
  "fullpage-image-landscape": { fullpage: "image" },
  "fullpage-video": { fullpage: "video" },
  "fullpage-video-landscape": { fullpage: "video" },
};

export function presentationMediaSlotSupportsType(
  slotType: PresentationComponentMediaSlotType | undefined,
  mediaType: PresentationComponentRenderableMediaType,
): boolean {
  return slotType === "media" || slotType === mediaType;
}

export interface PresentationComponentMediaFrameStyle {
  mediaShape: PresentationMediaShape;
  mediaCornerRadius?: number;
}

export type PresentationComponentLayoutFamily = "compact" | "long_form";

export interface PresentationComponentSlotBudget {
  maxChars?: number;
  maxItems?: number;
  preferredLines?: number;
}

export interface PresentationComponentSlotTextCapacity {
  maxChars?: number;
  maxItems?: number;
  preferredLines?: number;
  maxTextUnits?: number;
  recommendedEnglishChars?: number;
  recommendedThaiChars?: number;
}

const LATIN_TEXT_UNIT_WEIGHT = 1;
const DIGIT_TEXT_UNIT_WEIGHT = 0.95;
const THAI_TEXT_UNIT_WEIGHT = 1.2;
const PUNCTUATION_TEXT_UNIT_WEIGHT = 0.55;
const WHITESPACE_TEXT_UNIT_WEIGHT = 0.35;
const OTHER_TEXT_UNIT_WEIGHT = 1.05;
const THAI_GRAPHEME_PATTERN = /[\u0E00-\u0E7F]/;
const LATIN_GRAPHEME_PATTERN = /[A-Za-z]/;
const DIGIT_GRAPHEME_PATTERN = /\d/;
const PUNCTUATION_GRAPHEME_PATTERN = /[.,!?;:'"()[\]{}\-_/\\|@#$%^&*+=~`<>]/;

function segmentTextGraphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}

function getTextUnitWeight(grapheme: string): number {
  if (!grapheme) {
    return 0;
  }
  if (/^\s+$/.test(grapheme)) {
    return WHITESPACE_TEXT_UNIT_WEIGHT;
  }
  if (THAI_GRAPHEME_PATTERN.test(grapheme)) {
    return THAI_TEXT_UNIT_WEIGHT;
  }
  if (LATIN_GRAPHEME_PATTERN.test(grapheme)) {
    return LATIN_TEXT_UNIT_WEIGHT;
  }
  if (DIGIT_GRAPHEME_PATTERN.test(grapheme)) {
    return DIGIT_TEXT_UNIT_WEIGHT;
  }
  if (PUNCTUATION_GRAPHEME_PATTERN.test(grapheme)) {
    return PUNCTUATION_TEXT_UNIT_WEIGHT;
  }
  return OTHER_TEXT_UNIT_WEIGHT;
}

function estimateCharsFromUnits(maxUnits: number, weight: number): number {
  return Math.max(1, Math.floor(maxUnits / Math.max(0.0001, weight)));
}

export function measurePresentationTextUnits(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  return segmentTextGraphemes(normalized).reduce((sum, grapheme) => (
    sum + getTextUnitWeight(grapheme)
  ), 0);
}

export function clampPresentationTextToUnits(value: string, maxUnits?: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || !maxUnits || maxUnits <= 0) {
    return normalized;
  }

  let units = 0;
  let clamped = "";
  for (const grapheme of segmentTextGraphemes(normalized)) {
    const nextUnits = units + getTextUnitWeight(grapheme);
    if (nextUnits > maxUnits) {
      break;
    }
    clamped += grapheme;
    units = nextUnits;
  }
  return clamped.trim();
}

export function getPresentationComponentSlotBudget(
  componentId: BuiltInPresentationComponentId,
  slotId: string,
): PresentationComponentSlotBudget {
  return PRESENTATION_COMPONENT_SLOT_BUDGETS[componentId]?.[slotId] ?? {};
}

export function getPresentationComponentSlotTextCapacity(
  componentId: BuiltInPresentationComponentId,
  slotId: string,
): PresentationComponentSlotTextCapacity {
  const budget = getPresentationComponentSlotBudget(componentId, slotId);
  const maxTextUnits = budget.maxChars;
  return {
    ...budget,
    maxTextUnits,
    recommendedEnglishChars: maxTextUnits
      ? estimateCharsFromUnits(maxTextUnits, LATIN_TEXT_UNIT_WEIGHT)
      : undefined,
    recommendedThaiChars: maxTextUnits
      ? estimateCharsFromUnits(maxTextUnits, THAI_TEXT_UNIT_WEIGHT)
      : undefined,
  };
}

export const PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES: Partial<
  Record<BuiltInPresentationComponentId, Record<string, PresentationComponentMediaFrameStyle>>
> = {
  "sectioned-explainer": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 26 },
  },
  "article-focus": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "two-column-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "image-top-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "image-bottom-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "image-left-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "image-right-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "wide-hero-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 16 },
  },
  "split-image-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 20 },
  },
  "centered-hero-article": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 20 },
  },
  "profile-board": {
    portrait: { mediaShape: "rounded", mediaCornerRadius: 16 },
  },
  "profile-summary": {
    portrait: { mediaShape: "circle" },
  },
  "video-spotlight": {
    clip: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "poster-spotlight": {
    hero: { mediaShape: "rounded", mediaCornerRadius: 36 },
  },
  "framed-image-story": {
    photo: { mediaShape: "rounded", mediaCornerRadius: 28 },
  },
  "photo-collage": {
    "primary-photo": { mediaShape: "rounded", mediaCornerRadius: 28 },
    "secondary-photo": { mediaShape: "rounded", mediaCornerRadius: 22 },
  },
  "a4-photo-grid": {
    "hero-photo": { mediaShape: "rounded", mediaCornerRadius: 28 },
    "detail-photo-1": { mediaShape: "rounded", mediaCornerRadius: 22 },
    "detail-photo-2": { mediaShape: "rounded", mediaCornerRadius: 22 },
    "detail-photo-3": { mediaShape: "rounded", mediaCornerRadius: 22 },
    "detail-photo-4": { mediaShape: "rounded", mediaCornerRadius: 22 },
  },
  "landscape-photo-story": {
    "hero-photo": { mediaShape: "rounded", mediaCornerRadius: 24 },
    "detail-photo-1": { mediaShape: "rounded", mediaCornerRadius: 18 },
    "detail-photo-2": { mediaShape: "rounded", mediaCornerRadius: 18 },
    "detail-photo-3": { mediaShape: "rounded", mediaCornerRadius: 18 },
  },
  "fullpage-image": {
    fullpage: { mediaShape: "rect" },
  },
  "fullpage-image-landscape": {
    fullpage: { mediaShape: "rect" },
  },
  "fullpage-video": {
    fullpage: { mediaShape: "rect" },
  },
  "fullpage-video-landscape": {
    fullpage: { mediaShape: "rect" },
  },
};

export const PRESENTATION_COMPONENT_AI_GUIDANCE: Record<
  BuiltInPresentationComponentId,
  {
    label: string;
    useWhen: string;
  }
> = {
  "process-steps": {
    label: "Process Steps",
    useWhen: "Use for numbered workflows, SOPs, timelines, or any slide that explains a sequence of steps.",
  },
  "timeline-flow": {
    label: "Timeline Flow",
    useWhen: "Use for milestones, roadmaps, project phases, history, launch calendars, or any slide that explains change over time.",
  },
  "timeline-report": {
    label: "Timeline Report",
    useWhen: "Use for portrait roadmap or history slides that should read like a full-page document report with longer milestone explanations, context paragraphs, and a short next-step summary.",
  },
  "feature-highlights": {
    label: "Feature Highlights",
    useWhen: "Use for three key differentiators, pillars, or benefit highlights with short supporting copy.",
  },
  "infographic-grid": {
    label: "Infographic Grid",
    useWhen: "Use for frameworks, four-pillar explainers, comparison grids, category overviews, or slides with multiple balanced facts.",
  },
  "stat-cards": {
    label: "Stat Cards",
    useWhen: "Use for KPI snapshots, metric highlights, campaign numbers, or any slide dominated by a few strong numbers.",
  },
  "sectioned-explainer": {
    label: "Sectioned Explainer",
    useWhen: "Use for dense educational copy, article-style explainers, Thai long-form guidance, or any portrait slide that should read like a full-page document explainer.",
  },
  "article-focus": {
    label: "Editorial",
    useWhen: "Use for portrait long-form narrative slides with a single dominant heading, extended body copy, and optional key points. Best when paragraph density is high but section count is low.",
  },
  "two-column-article": {
    label: "Split Article",
    useWhen: "Use for portrait long-form article or report slides with two strong sections, dense paragraph copy, and a short takeaway list that still needs an editable structure.",
  },
  "image-top-article": {
    label: "Image Top + Text",
    useWhen: "Use for portrait slides with a hero image at the top and a large body text area below — ideal for news articles, product features, or editorial content that leads with a visual.",
  },
  "image-bottom-article": {
    label: "Image Bottom + Text",
    useWhen: "Use for portrait slides where text-first narrative comes before a supporting image — good for long-form editorial copy followed by an evidence or showcase image.",
  },
  "image-left-article": {
    label: "Image Left + Text",
    useWhen: "Use for portrait slides with an image panel on the left and a tall text column on the right — good for profile-adjacent stories, case studies, or editorial articles needing a split view.",
  },
  "image-right-article": {
    label: "Image Right + Text",
    useWhen: "Use for portrait slides with a tall text column on the left and an image panel on the right — good for editorial articles where the main narrative is on the left with a visual accent on the right.",
  },
  "wide-hero-article": {
    label: "Wide Hero Article",
    useWhen: "Use for 5:4 or landscape canvases with a wide banner image at top and article body below — ideal for magazine-style headers.",
  },
  "split-image-article": {
    label: "Split Image + Article",
    useWhen: "Use for 5:4 or landscape canvases with a 50/50 split: image on the left, article text on the right — great for editorial stories.",
  },
  "centered-hero-article": {
    label: "Centered Hero Article",
    useWhen: "Use for any canvas ratio with a centered hero image and article text below — a clean, universal layout.",
  },
  "compact-article": {
    label: "Compact Text Article",
    useWhen: "Use when no image is available or text-only content is desired — clean typography with title, body, and optional sidebar highlights.",
  },
  "faq-stack": {
    label: "FAQ Stack",
    useWhen: "Use for portrait question-and-answer slides, myth-vs-fact explainers, support topics, or any long-form copy shaped as a few prominent audience questions.",
  },
  "profile-board": {
    label: "Profile Sheet",
    useWhen: "Use for bio, resume, portfolio, or contact-heavy portrait slides that need structured sections for experience, skills, and contact details in a full-page editable layout.",
  },
  "profile-summary": {
    label: "Profile Summary",
    useWhen: "Use for speaker bios, team intros, founder profiles, resumes, or slides with contact and background details.",
  },
  "quote-callout": {
    label: "Quote Callout",
    useWhen: "Use for testimonials, editorial pull quotes, opinions, short narrative breaks, or slides dominated by one quote.",
  },
  "video-spotlight": {
    label: "Video Spotlight",
    useWhen: "Use when a slide should be driven by one video clip with a short headline and supporting bullets.",
  },
  "poster-spotlight": {
    label: "Poster Spotlight",
    useWhen: "Use for promotional or campaign-style slides with one dominant image, bold headline, short benefits, and a CTA.",
  },
  "framed-image-story": {
    label: "Framed Image Story",
    useWhen: "Use for editorial or story-led slides with one framed image, a narrative body, and a caption or highlight list.",
  },
  "photo-collage": {
    label: "Photo Board",
    useWhen: "Use for portrait editorial collages, moodboards, lookbooks, or photo-first slides that should feel like a full-page poster or flyer.",
  },
  "a4-photo-grid": {
    label: "Multi-Photo Board",
    useWhen: "Use for portrait flyers, lookbooks, moodboards, property sheets, or educational posters that should combine three to five images with a short editorial summary.",
  },
  "landscape-photo-story": {
    label: "Landscape Showcase",
    useWhen: "Use for landscape slides that should feel like a polished poster board with one dominant image, several supporting images, and a concise story plus highlights.",
  },
  "fullpage-image": {
    label: "Full-Page Image",
    useWhen: "Use when the slide should be a single edge-to-edge image with no text — hero shots, full-bleed photography, or visual impact pages.",
  },
  "fullpage-image-landscape": {
    label: "Full-Page Image (Landscape)",
    useWhen: "Use for landscape slides that should be a single edge-to-edge image with no text — hero shots, full-bleed photography, or visual impact pages.",
  },
  "fullpage-video": {
    label: "Full-Page Video",
    useWhen: "Use when the slide should be a single edge-to-edge video with no text — cinematic intros, hero clips, or immersive media pages.",
  },
  "fullpage-video-landscape": {
    label: "Full-Page Video (Landscape)",
    useWhen: "Use for landscape slides that should be a single edge-to-edge video with no text — cinematic intros, hero clips, or immersive media pages.",
  },
};

export const PRESENTATION_COMPONENT_LAYOUT_FAMILIES: Record<
  BuiltInPresentationComponentId,
  PresentationComponentLayoutFamily
> = {
  "process-steps": "compact",
  "timeline-flow": "compact",
  "timeline-report": "long_form",
  "feature-highlights": "compact",
  "infographic-grid": "compact",
  "stat-cards": "compact",
  "sectioned-explainer": "long_form",
  "article-focus": "long_form",
  "two-column-article": "long_form",
  "image-top-article": "long_form",
  "image-bottom-article": "long_form",
  "image-left-article": "long_form",
  "image-right-article": "long_form",
  "wide-hero-article": "long_form",
  "split-image-article": "long_form",
  "centered-hero-article": "long_form",
  "compact-article": "long_form",
  "faq-stack": "long_form",
  "profile-board": "long_form",
  "profile-summary": "compact",
  "quote-callout": "compact",
  "video-spotlight": "compact",
  "poster-spotlight": "compact",
  "framed-image-story": "compact",
  "photo-collage": "compact",
  "a4-photo-grid": "long_form",
  "landscape-photo-story": "long_form",
  "fullpage-image": "compact",
  "fullpage-image-landscape": "compact",
  "fullpage-video": "compact",
  "fullpage-video-landscape": "compact",
};

export const PRESENTATION_COMPONENT_SLOT_BUDGETS: Record<
  BuiltInPresentationComponentId,
  Record<string, PresentationComponentSlotBudget>
> = {
  "process-steps": {
    title: { maxChars: 72, preferredLines: 2 },
    subtitle: { maxChars: 180, preferredLines: 3 },
    "step1-label": { maxChars: 24, preferredLines: 1 },
    "step1-title": { maxChars: 180, preferredLines: 2 },
    "step1-body": { maxChars: 260, preferredLines: 4 },
    "step2-label": { maxChars: 24, preferredLines: 1 },
    "step2-title": { maxChars: 180, preferredLines: 2 },
    "step2-body": { maxChars: 260, preferredLines: 4 },
    "step3-label": { maxChars: 24, preferredLines: 1 },
    "step3-title": { maxChars: 180, preferredLines: 2 },
    "step3-body": { maxChars: 260, preferredLines: 4 },
  },
  "timeline-flow": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    subtitle: { maxChars: 180, preferredLines: 3 },
    "milestone1-date": { maxChars: 80, preferredLines: 1 },
    "milestone1-title": { maxChars: 180, preferredLines: 2 },
    "milestone1-body": { maxChars: 260, preferredLines: 4 },
    "milestone2-date": { maxChars: 80, preferredLines: 1 },
    "milestone2-title": { maxChars: 180, preferredLines: 2 },
    "milestone2-body": { maxChars: 260, preferredLines: 4 },
    "milestone3-date": { maxChars: 80, preferredLines: 1 },
    "milestone3-title": { maxChars: 180, preferredLines: 2 },
    "milestone3-body": { maxChars: 260, preferredLines: 4 },
  },
  "timeline-report": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    summary: { maxChars: 360, preferredLines: 5 },
    "phase1-date": { maxChars: 80, preferredLines: 1 },
    "phase1-title": { maxChars: 140, preferredLines: 2 },
    "phase1-body": { maxChars: 320, preferredLines: 5 },
    "phase2-date": { maxChars: 80, preferredLines: 1 },
    "phase2-title": { maxChars: 140, preferredLines: 2 },
    "phase2-body": { maxChars: 320, preferredLines: 5 },
    "phase3-date": { maxChars: 80, preferredLines: 1 },
    "phase3-title": { maxChars: 140, preferredLines: 2 },
    "phase3-body": { maxChars: 320, preferredLines: 5 },
    "next-steps-title": { maxChars: 80, preferredLines: 1 },
    "next-steps": { maxItems: 4, maxChars: 180, preferredLines: 6 },
  },
  "feature-highlights": {
    badge: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    "feature1-title": { maxChars: 180, preferredLines: 2 },
    "feature1-body": { maxChars: 260, preferredLines: 4 },
    "feature2-title": { maxChars: 180, preferredLines: 2 },
    "feature2-body": { maxChars: 260, preferredLines: 4 },
    "feature3-title": { maxChars: 180, preferredLines: 2 },
    "feature3-body": { maxChars: 260, preferredLines: 4 },
  },
  "infographic-grid": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    summary: { maxChars: 180, preferredLines: 3 },
    "item1-title": { maxChars: 180, preferredLines: 2 },
    "item1-body": { maxChars: 220, preferredLines: 4 },
    "item2-title": { maxChars: 180, preferredLines: 2 },
    "item2-body": { maxChars: 220, preferredLines: 4 },
    "item3-title": { maxChars: 180, preferredLines: 2 },
    "item3-body": { maxChars: 220, preferredLines: 4 },
    "item4-title": { maxChars: 180, preferredLines: 2 },
    "item4-body": { maxChars: 220, preferredLines: 4 },
  },
  "stat-cards": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    "stat1-value": { maxChars: 40, preferredLines: 1 },
    "stat1-label": { maxChars: 120, preferredLines: 2 },
    "stat2-value": { maxChars: 40, preferredLines: 1 },
    "stat2-label": { maxChars: 120, preferredLines: 2 },
    "stat3-value": { maxChars: 40, preferredLines: 1 },
    "stat3-label": { maxChars: 120, preferredLines: 2 },
  },
  "sectioned-explainer": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    hero: {},
    intro: { maxChars: 520, preferredLines: 8 },
    "section1-heading": { maxChars: 120, preferredLines: 2 },
    "section1-body": { maxChars: 420, preferredLines: 8 },
    "section2-heading": { maxChars: 120, preferredLines: 2 },
    "section2-body": { maxChars: 420, preferredLines: 8 },
    "section3-heading": { maxChars: 120, preferredLines: 2 },
    "section3-body": { maxChars: 420, preferredLines: 8 },
    "takeaways-title": { maxChars: 80, preferredLines: 1 },
    takeaways: { maxItems: 4, maxChars: 180, preferredLines: 6 },
  },
  "article-focus": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    hero: {},
    lead: { maxChars: 600, preferredLines: 10 },
    body: { maxChars: 800, preferredLines: 14 },
    "key-points-title": { maxChars: 80, preferredLines: 1 },
    "key-points": { maxItems: 5, maxChars: 200, preferredLines: 8 },
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "two-column-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    hero: {},
    intro: { maxChars: 320, preferredLines: 5 },
    "left-title": { maxChars: 140, preferredLines: 2 },
    "left-body": { maxChars: 520, preferredLines: 10 },
    "right-title": { maxChars: 140, preferredLines: 2 },
    "right-body": { maxChars: 520, preferredLines: 10 },
    "takeaways-title": { maxChars: 100, preferredLines: 1 },
    takeaways: { maxItems: 4, maxChars: 180, preferredLines: 6 },
  },
  "image-top-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    hero: {},
    lead: { maxChars: 400, preferredLines: 6 },
    body: { maxChars: 900, preferredLines: 18 },
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "image-bottom-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    lead: { maxChars: 400, preferredLines: 6 },
    body: { maxChars: 900, preferredLines: 18 },
    hero: {},
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "image-left-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    hero: {},
    lead: { maxChars: 320, preferredLines: 5 },
    body: { maxChars: 700, preferredLines: 14 },
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "image-right-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    lead: { maxChars: 320, preferredLines: 5 },
    body: { maxChars: 700, preferredLines: 14 },
    hero: {},
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "wide-hero-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    lead: { maxChars: 300, preferredLines: 4 },
    body: { maxChars: 600, preferredLines: 12 },
    hero: {},
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "split-image-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 180, preferredLines: 2 },
    lead: { maxChars: 300, preferredLines: 4 },
    body: { maxChars: 600, preferredLines: 12 },
    hero: {},
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "centered-hero-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    lead: { maxChars: 300, preferredLines: 4 },
    body: { maxChars: 600, preferredLines: 12 },
    hero: {},
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "compact-article": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 200, preferredLines: 2 },
    lead: { maxChars: 300, preferredLines: 4 },
    body: { maxChars: 800, preferredLines: 16 },
    sidebar: { maxChars: 400, preferredLines: 8 },
    footnote: { maxChars: 200, preferredLines: 2 },
  },
  "faq-stack": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    title: { maxChars: 220, preferredLines: 2 },
    intro: { maxChars: 320, preferredLines: 5 },
    "faq1-question": { maxChars: 160, preferredLines: 2 },
    "faq1-answer": { maxChars: 320, preferredLines: 5 },
    "faq2-question": { maxChars: 160, preferredLines: 2 },
    "faq2-answer": { maxChars: 320, preferredLines: 5 },
    "faq3-question": { maxChars: 160, preferredLines: 2 },
    "faq3-answer": { maxChars: 320, preferredLines: 5 },
  },
  "profile-board": {
    name: { maxChars: 200, preferredLines: 2 },
    role: { maxChars: 200, preferredLines: 2 },
    portrait: {},
    "bio-title": { maxChars: 120, preferredLines: 1 },
    "bio-body": { maxChars: 600, preferredLines: 8 },
    "experience-title": { maxChars: 120, preferredLines: 1 },
    "experience-items": { maxItems: 4, maxChars: 200, preferredLines: 6 },
    "skills-title": { maxChars: 120, preferredLines: 1 },
    "skills-items": { maxItems: 6, maxChars: 120, preferredLines: 4 },
    "contact-title": { maxChars: 120, preferredLines: 1 },
    "contact-items": { maxItems: 4, maxChars: 160, preferredLines: 4 },
  },
  "profile-summary": {
    portrait: {},
    name: { maxChars: 200, preferredLines: 2 },
    role: { maxChars: 200, preferredLines: 2 },
    "contact-title": { maxChars: 180, preferredLines: 1 },
    "contact-items": { maxItems: 3, maxChars: 160, preferredLines: 4 },
    "about-title": { maxChars: 180, preferredLines: 1 },
    "about-body": { maxChars: 800, preferredLines: 8 },
    "highlights-title": { maxChars: 180, preferredLines: 1 },
    "highlights-items": { maxItems: 4, maxChars: 180, preferredLines: 6 },
  },
  "quote-callout": {
    quote: { maxChars: 320, preferredLines: 5 },
    eyebrow: { maxChars: 80, preferredLines: 1 },
    attribution: { maxChars: 200, preferredLines: 2 },
  },
  "video-spotlight": {
    tag: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 200, preferredLines: 2 },
    body: { maxChars: 800, preferredLines: 6 },
    clip: {},
    benefits: { maxItems: 4, maxChars: 180, preferredLines: 6 },
  },
  "poster-spotlight": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 200, preferredLines: 2 },
    subhead: { maxChars: 800, preferredLines: 6 },
    hero: {},
    benefits: { maxItems: 4, maxChars: 180, preferredLines: 6 },
    cta: { maxChars: 120, preferredLines: 2 },
  },
  "framed-image-story": {
    kicker: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 200, preferredLines: 2 },
    story: { maxChars: 360, preferredLines: 5 },
    photo: {},
    caption: { maxChars: 120, preferredLines: 2 },
    highlights: { maxItems: 3, maxChars: 160, preferredLines: 5 },
  },
  "photo-collage": {
    kicker: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 200, preferredLines: 2 },
    body: { maxChars: 260, preferredLines: 4 },
    "primary-photo": {},
    "secondary-photo": {},
    caption: { maxChars: 120, preferredLines: 2 },
  },
  "a4-photo-grid": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 220, preferredLines: 2 },
    summary: { maxChars: 360, preferredLines: 5 },
    "hero-photo": {},
    "detail-photo-1": {},
    "detail-photo-2": {},
    "detail-photo-3": {},
    "detail-photo-4": {},
    caption: { maxChars: 160, preferredLines: 2 },
  },
  "landscape-photo-story": {
    eyebrow: { maxChars: 80, preferredLines: 1 },
    headline: { maxChars: 180, preferredLines: 2 },
    body: { maxChars: 320, preferredLines: 5 },
    "hero-photo": {},
    "detail-photo-1": {},
    "detail-photo-2": {},
    "detail-photo-3": {},
    "highlights-title": { maxChars: 100, preferredLines: 1 },
    highlights: { maxItems: 4, maxChars: 140, preferredLines: 5 },
  },
  "fullpage-image": {
    fullpage: {},
  },
  "fullpage-image-landscape": {
    fullpage: {},
  },
  "fullpage-video": {
    fullpage: {},
  },
  "fullpage-video-landscape": {
    fullpage: {},
  },
};

export const PRESENTATION_COMPONENT_SLOT_TARGETS: Record<
  BuiltInPresentationComponentId,
  Record<string, readonly string[]>
> = {
  "process-steps": {
    title: ["title"],
    subtitle: ["subtitle"],
    "step1-label": ["card-1-label"],
    "step1-title": ["card-1-title"],
    "step1-body": ["card-1-body"],
    "step2-label": ["card-2-label"],
    "step2-title": ["card-2-title"],
    "step2-body": ["card-2-body"],
    "step3-label": ["card-3-label"],
    "step3-title": ["card-3-title"],
    "step3-body": ["card-3-body"],
  },
  "timeline-flow": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    subtitle: ["subtitle"],
    "milestone1-date": ["milestone-1-date"],
    "milestone1-title": ["milestone-1-title"],
    "milestone1-body": ["milestone-1-body"],
    "milestone2-date": ["milestone-2-date"],
    "milestone2-title": ["milestone-2-title"],
    "milestone2-body": ["milestone-2-body"],
    "milestone3-date": ["milestone-3-date"],
    "milestone3-title": ["milestone-3-title"],
    "milestone3-body": ["milestone-3-body"],
  },
  "timeline-report": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    summary: ["summary"],
    "phase1-date": ["phase-1-date-bg", "phase-1-date"],
    "phase1-title": ["phase-1-title"],
    "phase1-body": ["phase-1-body"],
    "phase2-date": ["phase-2-date-bg", "phase-2-date"],
    "phase2-title": ["phase-2-title"],
    "phase2-body": ["phase-2-body"],
    "phase3-date": ["phase-3-date-bg", "phase-3-date"],
    "phase3-title": ["phase-3-title"],
    "phase3-body": ["phase-3-body"],
    "next-steps-title": ["next-steps-title"],
    "next-steps": ["next-steps-card", "next-steps"],
  },
  "feature-highlights": {
    badge: ["badge-bg", "badge-text"],
    title: ["title"],
    "feature1-title": ["feature-1-title"],
    "feature1-body": ["feature-1-body"],
    "feature2-title": ["feature-2-title"],
    "feature2-body": ["feature-2-body"],
    "feature3-title": ["feature-3-title"],
    "feature3-body": ["feature-3-body"],
  },
  "infographic-grid": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    summary: ["summary"],
    "item1-title": ["item-1-title"],
    "item1-body": ["item-1-body"],
    "item2-title": ["item-2-title"],
    "item2-body": ["item-2-body"],
    "item3-title": ["item-3-title"],
    "item3-body": ["item-3-body"],
    "item4-title": ["item-4-title"],
    "item4-body": ["item-4-body"],
  },
  "stat-cards": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    "stat1-value": ["stat-1-value"],
    "stat1-label": ["stat-1-label"],
    "stat2-value": ["stat-2-value"],
    "stat2-label": ["stat-2-label"],
    "stat3-value": ["stat-3-value"],
    "stat3-label": ["stat-3-label"],
  },
  "sectioned-explainer": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    intro: ["intro"],
    "section1-heading": ["section-1-heading"],
    "section1-body": ["section-1-body"],
    "section2-heading": ["section-2-heading"],
    "section2-body": ["section-2-body"],
    "section3-heading": ["section-3-heading"],
    "section3-body": ["section-3-body"],
    "takeaways-title": ["takeaways-title"],
    takeaways: ["takeaways-card", "takeaways"],
  },
  "article-focus": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    "key-points-title": ["key-points-title"],
    "key-points": ["key-points-card", "key-points"],
    footnote: ["footnote"],
  },
  "two-column-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    intro: ["intro"],
    "left-title": ["left-title"],
    "left-body": ["left-body"],
    "right-title": ["right-title"],
    "right-body": ["right-body"],
    "takeaways-title": ["takeaways-title"],
    takeaways: ["takeaways-card", "takeaways"],
  },
  "image-top-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    footnote: ["footnote"],
  },
  "image-bottom-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    lead: ["lead"],
    body: ["body"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    footnote: ["footnote"],
  },
  "image-left-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    footnote: ["footnote"],
  },
  "image-right-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    lead: ["lead"],
    body: ["body"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    footnote: ["footnote"],
  },
  "wide-hero-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    footnote: ["footnote"],
  },
  "split-image-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    footnote: ["footnote"],
  },
  "centered-hero-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    lead: ["lead"],
    body: ["body"],
    footnote: ["footnote"],
  },
  "compact-article": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    lead: ["lead"],
    body: ["body"],
    sidebar: ["sidebar"],
    footnote: ["footnote"],
  },
  "faq-stack": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    title: ["title"],
    intro: ["intro"],
    "faq1-question": ["faq-1-q-bg", "faq-1-q"],
    "faq1-answer": ["faq-1-a"],
    "faq2-question": ["faq-2-q-bg", "faq-2-q"],
    "faq2-answer": ["faq-2-a"],
    "faq3-question": ["faq-3-q-bg", "faq-3-q"],
    "faq3-answer": ["faq-3-a"],
  },
  "profile-board": {
    name: ["name"],
    role: ["role-bg", "role"],
    portrait: ["portrait-image", "portrait-frame", "portrait-placeholder"],
    "bio-title": ["bio-title"],
    "bio-body": ["bio-body"],
    "experience-title": ["experience-title"],
    "experience-items": ["experience-items"],
    "skills-title": ["skills-title"],
    "skills-items": ["skills-items"],
    "contact-title": ["contact-title"],
    "contact-items": ["contact-items"],
  },
  "profile-summary": {
    portrait: ["portrait-image", "portrait-frame", "portrait-placeholder"],
    name: ["name"],
    role: ["role-bg", "role"],
    "contact-title": ["contact-title"],
    "contact-items": ["contact-items"],
    "about-title": ["about-title"],
    "about-body": ["about-body"],
    "highlights-title": ["highlights-title"],
    "highlights-items": ["highlights-items"],
  },
  "quote-callout": {
    quote: ["quote"],
    eyebrow: ["eyebrow-bg", "eyebrow"],
    attribution: ["attribution"],
  },
  "video-spotlight": {
    tag: ["tag-bg", "tag"],
    headline: ["headline"],
    body: ["body"],
    clip: ["clip-video", "clip-frame", "clip-icon", "clip-placeholder"],
    benefits: ["benefits-bg", "benefits"],
  },
  "poster-spotlight": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    headline: ["headline"],
    subhead: ["subhead"],
    hero: ["hero-image", "hero-frame", "hero-placeholder"],
    benefits: ["benefits-panel", "benefits"],
    cta: ["cta-bg", "cta"],
  },
  "framed-image-story": {
    kicker: ["kicker-bg", "kicker"],
    headline: ["headline"],
    story: ["story"],
    photo: ["photo-image", "photo-frame", "photo-placeholder"],
    caption: ["caption-bg", "caption"],
    highlights: ["highlights-panel", "highlights"],
  },
  "photo-collage": {
    kicker: ["kicker-bg", "kicker"],
    headline: ["headline"],
    body: ["body"],
    "primary-photo": ["primary-image", "primary-frame", "primary-placeholder"],
    "secondary-photo": ["secondary-image", "secondary-frame", "secondary-placeholder"],
    caption: ["caption-bg", "caption"],
  },
  "a4-photo-grid": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    headline: ["headline"],
    summary: ["summary-card", "summary"],
    "hero-photo": ["hero-image", "hero-frame", "hero-placeholder"],
    "detail-photo-1": ["detail-1-image", "detail-1-frame", "detail-1-placeholder"],
    "detail-photo-2": ["detail-2-image", "detail-2-frame", "detail-2-placeholder"],
    "detail-photo-3": ["detail-3-image", "detail-3-frame", "detail-3-placeholder"],
    "detail-photo-4": ["detail-4-image", "detail-4-frame", "detail-4-placeholder"],
    caption: ["caption-bar", "caption"],
  },
  "landscape-photo-story": {
    eyebrow: ["eyebrow-bg", "eyebrow"],
    headline: ["headline"],
    body: ["body"],
    "hero-photo": ["hero-image", "hero-frame", "hero-placeholder"],
    "detail-photo-1": ["detail-1-image", "detail-1-frame", "detail-1-placeholder"],
    "detail-photo-2": ["detail-2-image", "detail-2-frame", "detail-2-placeholder"],
    "detail-photo-3": ["detail-3-image", "detail-3-frame", "detail-3-placeholder"],
    "highlights-title": ["highlights-title"],
    highlights: ["highlights-panel", "highlights"],
  },
  "fullpage-image": {
    fullpage: ["fullpage-image", "fullpage-frame"],
  },
  "fullpage-image-landscape": {
    fullpage: ["fullpage-image", "fullpage-frame"],
  },
  "fullpage-video": {
    fullpage: ["fullpage-video", "fullpage-frame"],
  },
  "fullpage-video-landscape": {
    fullpage: ["fullpage-video", "fullpage-frame"],
  },
};
