import type { PresentationMediaShape } from "./contracts";

export const BUILT_IN_PRESENTATION_COMPONENT_IDS = [
  "process-steps",
  "timeline-flow",
  "feature-highlights",
  "infographic-grid",
  "stat-cards",
  "sectioned-explainer",
  "profile-summary",
  "quote-callout",
  "video-spotlight",
  "poster-spotlight",
  "framed-image-story",
  "photo-collage",
] as const;

export type BuiltInPresentationComponentId =
  (typeof BUILT_IN_PRESENTATION_COMPONENT_IDS)[number];

export const PRESENTATION_COMPONENT_MEDIA_SLOTS: Partial<
  Record<BuiltInPresentationComponentId, readonly string[]>
> = {
  "profile-summary": ["portrait"],
  "video-spotlight": ["clip"],
  "poster-spotlight": ["hero"],
  "framed-image-story": ["photo"],
  "photo-collage": ["primary-photo", "secondary-photo"],
};

export const PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES: Partial<
  Record<BuiltInPresentationComponentId, Record<string, "image" | "video">>
> = {
  "profile-summary": { portrait: "image" },
  "video-spotlight": { clip: "video" },
  "poster-spotlight": { hero: "image" },
  "framed-image-story": { photo: "image" },
  "photo-collage": { "primary-photo": "image", "secondary-photo": "image" },
};

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

export const PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES: Partial<
  Record<BuiltInPresentationComponentId, Record<string, PresentationComponentMediaFrameStyle>>
> = {
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
    useWhen: "Use for dense educational copy, article-style explainers, Thai long-form guidance, or any slide with multiple text-heavy sections that must stay editable.",
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
    label: "Photo Collage",
    useWhen: "Use for editorial collages, moodboards, campaign lookbooks, or slides that pair two related images with short supporting copy.",
  },
};

export const PRESENTATION_COMPONENT_LAYOUT_FAMILIES: Record<
  BuiltInPresentationComponentId,
  PresentationComponentLayoutFamily
> = {
  "process-steps": "compact",
  "timeline-flow": "compact",
  "feature-highlights": "compact",
  "infographic-grid": "compact",
  "stat-cards": "compact",
  "sectioned-explainer": "long_form",
  "profile-summary": "compact",
  "quote-callout": "compact",
  "video-spotlight": "compact",
  "poster-spotlight": "compact",
  "framed-image-story": "compact",
  "photo-collage": "compact",
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
};
