import type { PresentationCanvasSize } from "@/presentation-canvas/constants";
import {
  buildBuiltInPresentationComponentInstance,
  COMPONENT_CANVAS_INTENTS,
  type BuiltInPresentationComponentCanvasIntent,
  type BuiltInPresentationComponentId,
} from "@/lib/presentationComponentCatalog";
import type { PresentationElement, PresentationElementType } from "@/lib/presentationEditorState";
import { SVG_GRAPHICS } from "@shared/presentation/svgGraphicsCatalog";

const BASE_CANVAS_WIDTH = 1280;
const BASE_CANVAS_HEIGHT = 720;

const SVG_BY_ID = new Map(SVG_GRAPHICS.map((graphic) => [graphic.id, graphic.svg]));

export interface PresentationBlockPresetDefinition {
  id: BuiltInPresentationComponentId;
  label: string;
  category: "Process" | "Marketing" | "Data" | "Profile" | "Storytelling" | "Long-form" | "Document";
  /** Additional category tags for multi-category filtering (e.g., adaptive blocks that suit document pages) */
  tags?: readonly string[];
  description: string;
  accentColor: string;
  canvasIntent: BuiltInPresentationComponentCanvasIntent;
}

export type PresentationBlockPresetId = PresentationBlockPresetDefinition["id"];

export const PRESENTATION_BLOCK_PRESETS: readonly PresentationBlockPresetDefinition[] = [
  {
    id: "process-steps",
    label: "Process Steps",
    category: "Process",
    tags: ["Document"],
    description: "Stacked cards for tutorials, SOPs, or explainers.",
    accentColor: "#f59e0b",
    canvasIntent: COMPONENT_CANVAS_INTENTS["process-steps"],
  },
  {
    id: "timeline-flow",
    label: "Timeline Flow",
    category: "Process",
    tags: ["Document"],
    description: "Milestone roadmap layout for launches, phases, and chronological narratives.",
    accentColor: "#0ea5e9",
    canvasIntent: COMPONENT_CANVAS_INTENTS["timeline-flow"],
  },
  {
    id: "timeline-report",
    label: "Timeline Report",
    category: "Document",
    description: "Full-page roadmap board for milestones that still need explanatory copy and next steps.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["timeline-report"],
  },
  {
    id: "feature-highlights",
    label: "Feature Highlights",
    category: "Marketing",
    tags: ["Document"],
    description: "Three-column value props with icons and supporting copy.",
    accentColor: "#0ea5e9",
    canvasIntent: COMPONENT_CANVAS_INTENTS["feature-highlights"],
  },
  {
    id: "infographic-grid",
    label: "Infographic Grid",
    category: "Data",
    tags: ["Document"],
    description: "Four-cell framework block for comparisons, pillars, and balanced explainers.",
    accentColor: "#7c3aed",
    canvasIntent: COMPONENT_CANVAS_INTENTS["infographic-grid"],
  },
  {
    id: "stat-cards",
    label: "Stat Cards",
    category: "Data",
    tags: ["Document"],
    description: "Three-up metric cards for KPI snapshots, campaign numbers, and proof points.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["stat-cards"],
  },
  {
    id: "sectioned-explainer",
    label: "Sectioned Explainer",
    category: "Document",
    description: "Full-page explainer for dense multi-section educational or article-style slides.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["sectioned-explainer"],
  },
  {
    id: "article-focus",
    label: "Editorial",
    category: "Document",
    description: "Full-page editorial layout with large visual area, long body copy, and key points.",
    accentColor: "#059669",
    canvasIntent: COMPONENT_CANVAS_INTENTS["article-focus"],
  },
  {
    id: "two-column-article",
    label: "Split Article",
    category: "Document",
    description: "Full-page editorial/report layout for two strong sections with longer copy and a takeaway strip.",
    accentColor: "#4338ca",
    canvasIntent: COMPONENT_CANVAS_INTENTS["two-column-article"],
  },
  {
    id: "faq-stack",
    label: "FAQ Stack",
    category: "Document",
    description: "Full-page question-and-answer stack for dense support topics and educational FAQs.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["faq-stack"],
  },
  {
    id: "profile-board",
    label: "Profile Sheet",
    category: "Document",
    description: "Full-page bio/resume sheet with experience, skills, and contact sections.",
    accentColor: "#334155",
    canvasIntent: COMPONENT_CANVAS_INTENTS["profile-board"],
  },
  {
    id: "profile-summary",
    label: "Profile Summary",
    category: "Profile",
    tags: ["Document"],
    description: "Speaker, team member, or resume-style intro block.",
    accentColor: "#334155",
    canvasIntent: COMPONENT_CANVAS_INTENTS["profile-summary"],
  },
  {
    id: "quote-callout",
    label: "Quote Callout",
    category: "Storytelling",
    tags: ["Document"],
    description: "Editorial pull-quote with attribution and accent line.",
    accentColor: "#8b5cf6",
    canvasIntent: COMPONENT_CANVAS_INTENTS["quote-callout"],
  },
  {
    id: "video-spotlight",
    label: "Video Spotlight",
    category: "Storytelling",
    description: "Promo-ready copy block with a featured video frame.",
    accentColor: "#0ea5e9",
    canvasIntent: COMPONENT_CANVAS_INTENTS["video-spotlight"],
  },
  {
    id: "poster-spotlight",
    label: "Poster Spotlight",
    category: "Marketing",
    description: "Campaign-style hero with image frame, short benefits, and CTA.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["poster-spotlight"],
  },
  {
    id: "framed-image-story",
    label: "Framed Image Story",
    category: "Storytelling",
    tags: ["Document"],
    description: "Editorial image-and-copy block with framed visual and highlights.",
    accentColor: "#7c3aed",
    canvasIntent: COMPONENT_CANVAS_INTENTS["framed-image-story"],
  },
  {
    id: "photo-collage",
    label: "Photo Board",
    category: "Document",
    description: "Full-page photo-first board with editorial copy and support for multiple visual areas.",
    accentColor: "#2563eb",
    canvasIntent: COMPONENT_CANVAS_INTENTS["photo-collage"],
  },
  {
    id: "a4-photo-grid",
    label: "Multi-Photo Board",
    category: "Document",
    description: "Full-page portrait board with one hero photo, four supporting images, and a short editorial summary.",
    accentColor: "#4338ca",
    canvasIntent: COMPONENT_CANVAS_INTENTS["a4-photo-grid"],
  },
  {
    id: "landscape-photo-story",
    label: "Landscape Showcase",
    category: "Document",
    description: "Landscape editorial board with one dominant image, three supporting frames, and a concise highlights panel.",
    accentColor: "#0f766e",
    canvasIntent: COMPONENT_CANVAS_INTENTS["landscape-photo-story"],
  },
  {
    id: "fullpage-image",
    label: "Full-Page Image",
    category: "Document",
    description: "Edge-to-edge image covering the entire page — no text, no overlay.",
    accentColor: "#0284c7",
    canvasIntent: COMPONENT_CANVAS_INTENTS["fullpage-image"],
  },
  {
    id: "fullpage-image-landscape",
    label: "Full-Page Image (Landscape)",
    category: "Document",
    description: "Landscape edge-to-edge image covering the entire page — no text, no overlay.",
    accentColor: "#0284c7",
    canvasIntent: COMPONENT_CANVAS_INTENTS["fullpage-image-landscape"],
  },
  {
    id: "fullpage-video",
    label: "Full-Page Video",
    category: "Document",
    description: "Edge-to-edge video covering the entire page — no text, no overlay.",
    accentColor: "#7c3aed",
    canvasIntent: COMPONENT_CANVAS_INTENTS["fullpage-video"],
  },
  {
    id: "fullpage-video-landscape",
    label: "Full-Page Video (Landscape)",
    category: "Document",
    description: "Landscape edge-to-edge video covering the entire page — no text, no overlay.",
    accentColor: "#7c3aed",
    canvasIntent: COMPONENT_CANVAS_INTENTS["fullpage-video-landscape"],
  },
  {
    id: "image-top-article",
    label: "Image Top + Article",
    category: "Long-form",
    tags: ["Document"],
    description: "Full-width image at the top, with a long article body below — classic editorial layout for visual openers.",
    accentColor: "#2563EB",
    canvasIntent: COMPONENT_CANVAS_INTENTS["image-top-article"],
  },
  {
    id: "image-bottom-article",
    label: "Article + Image Bottom",
    category: "Long-form",
    tags: ["Document"],
    description: "Long article text at the top, concluding with a full-width image at the bottom.",
    accentColor: "#2563EB",
    canvasIntent: COMPONENT_CANVAS_INTENTS["image-bottom-article"],
  },
  {
    id: "image-left-article",
    label: "Image Left + Article",
    category: "Long-form",
    tags: ["Document"],
    description: "Image on the left half, long article body on the right — a classic portrait split for editorial content.",
    accentColor: "#2563EB",
    canvasIntent: COMPONENT_CANVAS_INTENTS["image-left-article"],
  },
  {
    id: "image-right-article",
    label: "Article + Image Right",
    category: "Long-form",
    tags: ["Document"],
    description: "Long article text on the left, image on the right — classic portrait split layout.",
    accentColor: "#2563EB",
    canvasIntent: COMPONENT_CANVAS_INTENTS["image-right-article"],
  },
  {
    id: "wide-hero-article",
    label: "Wide Hero Article",
    category: "Long-form",
    tags: ["Document"],
    description: "Full-width banner image at top with title and body below — optimized for 5:4 and wider canvases.",
    accentColor: "#0284C7",
    canvasIntent: COMPONENT_CANVAS_INTENTS["wide-hero-article"],
  },
  {
    id: "split-image-article",
    label: "Split Image + Article",
    category: "Long-form",
    tags: ["Document"],
    description: "50/50 split: image fills the left half, article text on the right — great for 5:4 landscape.",
    accentColor: "#059669",
    canvasIntent: COMPONENT_CANVAS_INTENTS["split-image-article"],
  },
  {
    id: "centered-hero-article",
    label: "Centered Hero Article",
    category: "Long-form",
    tags: ["Document"],
    description: "Centered hero image with title and body text below — works well on any canvas ratio.",
    accentColor: "#7C3AED",
    canvasIntent: COMPONENT_CANVAS_INTENTS["centered-hero-article"],
  },
  {
    id: "compact-article",
    label: "Compact Text Article",
    category: "Long-form",
    tags: ["Document"],
    description: "Clean text-only article with title, body, and sidebar highlights — no image required.",
    accentColor: "#334155",
    canvasIntent: COMPONENT_CANVAS_INTENTS["compact-article"],
  },
] as const;

interface BuildPresetOptions {
  canvas: PresentationCanvasSize;
  makeId: (type: PresentationElementType) => string;
}

interface LayoutFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function getLayoutFrame(canvas: PresentationCanvasSize): LayoutFrame {
  const scale = Math.min(canvas.width / BASE_CANVAS_WIDTH, canvas.height / BASE_CANVAS_HEIGHT);
  return {
    scale,
    offsetX: Math.round((canvas.width - (BASE_CANVAS_WIDTH * scale)) / 2),
    offsetY: Math.round((canvas.height - (BASE_CANVAS_HEIGHT * scale)) / 2),
  };
}

function px(frame: LayoutFrame, x: number): number {
  return frame.offsetX + Math.round(x * frame.scale);
}

function py(frame: LayoutFrame, y: number): number {
  return frame.offsetY + Math.round(y * frame.scale);
}

function ps(frame: LayoutFrame, value: number, min: number = 1): number {
  return Math.max(min, Math.round(value * frame.scale));
}

function makeText(
  frame: LayoutFrame,
  makeId: BuildPresetOptions["makeId"],
  config: {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    color: string;
    fontSize: number;
    fontWeight?: "normal" | "500" | "600" | "700";
    textAlign?: "left" | "center" | "right" | "justify";
    lineHeight?: number;
    backgroundColor?: string;
  },
): Extract<PresentationElement, { type: "text" }> {
  return {
    id: makeId("text"),
    type: "text",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: ps(frame, config.height),
    rotation: 0,
    text: config.text,
    color: config.color,
    fontSize: ps(frame, config.fontSize, 8),
    fontWeight: config.fontWeight,
    textAlign: config.textAlign,
    lineHeight: config.lineHeight,
    backgroundColor: config.backgroundColor,
  };
}

function makeRect(
  frame: LayoutFrame,
  makeId: BuildPresetOptions["makeId"],
  config: {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  },
): Extract<PresentationElement, { type: "rect" }> {
  return {
    id: makeId("rect"),
    type: "rect",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: ps(frame, config.height),
    rotation: 0,
    fill: config.fill,
    stroke: config.stroke,
    strokeWidth: config.strokeWidth === undefined ? undefined : ps(frame, config.strokeWidth),
  };
}

function makeSvgGraphic(
  frame: LayoutFrame,
  makeId: BuildPresetOptions["makeId"],
  config: {
    x: number;
    y: number;
    size: number;
    graphicId: string;
    alt: string;
    color: string;
  },
): Extract<PresentationElement, { type: "image" }> {
  const svgContent = SVG_BY_ID.get(config.graphicId);
  if (!svgContent) {
    throw new Error(`Unknown SVG graphic: ${config.graphicId}`);
  }

  const size = ps(frame, config.size);
  return {
    id: makeId("image"),
    type: "image",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: size,
    height: size,
    rotation: 0,
    src: "",
    alt: config.alt,
    svgContent,
    svgColor: config.color,
    imageFit: "contain",
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    imagePrompt: "",
    imageReferenceUrls: [],
  };
}

function makeVideo(
  frame: LayoutFrame,
  makeId: BuildPresetOptions["makeId"],
  config: {
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    poster?: string;
    title?: string;
  },
): Extract<PresentationElement, { type: "video" }> {
  return {
    id: makeId("video"),
    type: "video",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: ps(frame, config.height),
    rotation: 0,
    src: config.src,
    poster: config.poster,
    title: config.title,
    muted: true,
    loop: true,
    videoFit: "cover",
    videoPositionX: 50,
    videoPositionY: 50,
    videoZoom: 1,
  };
}

function buildProcessStepsPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas);
  const cards = [
    {
      y: 188,
      icon: "briefcase",
      title: "Step 01",
      detail: "Prepare inputs",
      body: "Collect the brief, assets, and target outcome before arranging the slide story.",
      color: "#f59e0b",
    },
    {
      y: 314,
      icon: "presentation-chart",
      title: "Step 02",
      detail: "Structure the story",
      body: "Split the message into short beats so each slide carries one clear decision or takeaway.",
      color: "#0ea5e9",
    },
    {
      y: 440,
      icon: "rocket-launch",
      title: "Step 03",
      detail: "Ship the message",
      body: "Use strong visual anchors, then tighten the copy until the sequence feels effortless.",
      color: "#ef4444",
    },
  ] as const;

  return [
    makeText(frame, options.makeId, {
      x: 168,
      y: 72,
      width: 760,
      height: 76,
      text: "3-Step Process",
      color: "#102a43",
      fontSize: 50,
      fontWeight: "700",
    }),
    makeText(frame, options.makeId, {
      x: 168,
      y: 132,
      width: 780,
      height: 40,
      text: "A reusable block for tutorials, explainers, and standard operating flows.",
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
    }),
    ...cards.flatMap((card) => ([
      makeRect(frame, options.makeId, {
        x: 168,
        y: card.y,
        width: 944,
        height: 108,
        fill: "rgba(255,248,235,0.96)",
        stroke: "#d6b58d",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.makeId, {
        x: 196,
        y: card.y + 20,
        size: 56,
        graphicId: card.icon,
        alt: card.detail,
        color: card.color,
      }),
      makeText(frame, options.makeId, {
        x: 278,
        y: card.y + 18,
        width: 180,
        height: 30,
        text: card.title,
        color: card.color,
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.makeId, {
        x: 278,
        y: card.y + 42,
        width: 320,
        height: 40,
        text: card.detail,
        color: "#102a43",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.makeId, {
        x: 612,
        y: card.y + 22,
        width: 460,
        height: 60,
        text: card.body,
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildFeatureHighlightsPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas);
  const features = [
    {
      x: 140,
      icon: "chart-bar",
      title: "Metrics first",
      body: "Show impact using one concrete metric and one supporting sentence.",
      color: "#0f766e",
    },
    {
      x: 455,
      icon: "users",
      title: "Human proof",
      body: "Pair the claim with the audience, customer, or team it helps most.",
      color: "#2563eb",
    },
    {
      x: 770,
      icon: "rocket-launch",
      title: "Fast action",
      body: "End with a clear next move so the slide pushes toward a decision.",
      color: "#7c3aed",
    },
  ] as const;

  return [
    makeRect(frame, options.makeId, {
      x: 140,
      y: 92,
      width: 208,
      height: 40,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.makeId, {
      x: 160,
      y: 100,
      width: 180,
      height: 24,
      text: "Feature Highlights",
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.makeId, {
      x: 140,
      y: 158,
      width: 820,
      height: 104,
      text: "A simple block for marketing points, differentiators, or service pillars.",
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    ...features.flatMap((feature) => ([
      makeRect(frame, options.makeId, {
        x: feature.x,
        y: 292,
        width: 260,
        height: 252,
        fill: "rgba(255,255,255,0.94)",
        stroke: "#cbd5e1",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.makeId, {
        x: feature.x + 28,
        y: 324,
        size: 52,
        graphicId: feature.icon,
        alt: feature.title,
        color: feature.color,
      }),
      makeText(frame, options.makeId, {
        x: feature.x + 28,
        y: 396,
        width: 200,
        height: 40,
        text: feature.title,
        color: "#0f172a",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.makeId, {
        x: feature.x + 28,
        y: 440,
        width: 204,
        height: 76,
        text: feature.body,
        color: "#475569",
        fontSize: 19,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildProfileSummaryPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas);

  return [
    makeRect(frame, options.makeId, {
      x: 126,
      y: 104,
      width: 304,
      height: 500,
      fill: "#1e3a5f",
      stroke: "#4b6b8b",
      strokeWidth: 3,
    }),
    makeSvgGraphic(frame, options.makeId, {
      x: 214,
      y: 146,
      size: 128,
      graphicId: "users",
      alt: "Profile",
      color: "#f8fafc",
    }),
    makeText(frame, options.makeId, {
      x: 158,
      y: 308,
      width: 240,
      height: 42,
      text: "Adora Montminy",
      color: "#f8fafc",
      fontSize: 32,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, options.makeId, {
      x: 168,
      y: 364,
      width: 220,
      height: 40,
      fill: "#f4d58d",
      stroke: "#eab308",
      strokeWidth: 2,
    }),
    makeText(frame, options.makeId, {
      x: 180,
      y: 372,
      width: 196,
      height: 24,
      text: "Marketing / Digital",
      color: "#334155",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.makeId, {
      x: 168,
      y: 436,
      width: 220,
      height: 24,
      text: "CONTACT",
      color: "#bfdbfe",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.makeId, {
      x: 166,
      y: 470,
      width: 224,
      height: 88,
      text: "123 Anywhere St.\nhello@company.com\n+66 123 456 789",
      color: "#e2e8f0",
      fontSize: 18,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: 1.45,
    }),
    makeRect(frame, options.makeId, {
      x: 478,
      y: 104,
      width: 676,
      height: 180,
      fill: "rgba(255,255,255,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.makeId, {
      x: 522,
      y: 138,
      width: 580,
      height: 48,
      text: "About This Speaker",
      color: "#0f172a",
      fontSize: 36,
      fontWeight: "700",
    }),
    makeText(frame, options.makeId, {
      x: 522,
      y: 190,
      width: 574,
      height: 62,
      text: "Use this block for bio slides, speaker intros, team profiles, or resume-style summaries.",
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
    makeRect(frame, options.makeId, {
      x: 478,
      y: 314,
      width: 676,
      height: 290,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.makeId, {
      x: 522,
      y: 346,
      width: 260,
      height: 34,
      text: "Highlights",
      color: "#1d4ed8",
      fontSize: 28,
      fontWeight: "700",
    }),
    makeText(frame, options.makeId, {
      x: 522,
      y: 398,
      width: 560,
      height: 120,
      text: "• Bilingual communicator with cross-channel campaign experience\n• Strong fit for speaker, mentor, or candidate overview slides\n• Works well with contact details, achievements, and CTA rows",
      color: "#334155",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
  ];
}

function buildQuoteCalloutPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas);

  return [
    makeRect(frame, options.makeId, {
      x: 150,
      y: 176,
      width: 980,
      height: 344,
      fill: "rgba(15,23,42,0.88)",
      stroke: "#475569",
      strokeWidth: 3,
    }),
    makeSvgGraphic(frame, options.makeId, {
      x: 198,
      y: 232,
      size: 72,
      graphicId: "chat-bubble",
      alt: "Quote",
      color: "#c084fc",
    }),
    makeText(frame, options.makeId, {
      x: 300,
      y: 224,
      width: 740,
      height: 160,
      text: "\"Lead with one idea per slide and let the visual support the sentence, not fight it.\"",
      color: "#f8fafc",
      fontSize: 42,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeRect(frame, options.makeId, {
      x: 300,
      y: 398,
      width: 228,
      height: 42,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.makeId, {
      x: 320,
      y: 406,
      width: 188,
      height: 28,
      text: "Editorial Callout",
      color: "#6d28d9",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.makeId, {
      x: 300,
      y: 462,
      width: 520,
      height: 48,
      text: "Use for testimonials, opinion slides, quotes, or narrative breaks.",
      color: "#cbd5e1",
      fontSize: 20,
      fontWeight: "500",
    }),
    makeRect(frame, options.makeId, {
      x: 840,
      y: 458,
      width: 184,
      height: 8,
      fill: "#a855f7",
    }),
  ];
}

function buildVideoSpotlightPreset(options: BuildPresetOptions): PresentationElement[] {
  const frame = getLayoutFrame(options.canvas);

  return [
    makeRect(frame, options.makeId, {
      x: 124,
      y: 102,
      width: 1032,
      height: 516,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeRect(frame, options.makeId, {
      x: 174,
      y: 146,
      width: 180,
      height: 40,
      fill: "#082f49",
      stroke: "#0ea5e9",
      strokeWidth: 2,
    }),
    makeText(frame, options.makeId, {
      x: 192,
      y: 154,
      width: 144,
      height: 24,
      text: "Video Spotlight",
      color: "#e0f2fe",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.makeId, {
      x: 174,
      y: 218,
      width: 432,
      height: 108,
      text: "Pair one short message with one strong clip.",
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.makeId, {
      x: 174,
      y: 330,
      width: 414,
      height: 96,
      text: "Use this for promos, feature reveals, product demos, or narrative slides where motion is the primary proof.",
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, options.makeId, {
      x: 174,
      y: 448,
      width: 418,
      height: 144,
      fill: "#eff6ff",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.makeId, {
      x: 198,
      y: 472,
      width: 360,
      height: 102,
      text: [
        "• Keep the headline short so the clip stays dominant",
        "• Use the supporting list for benefits, cues, or CTA bullets",
        "• Works with autoplay muted preview and exported motion",
      ].join("\n"),
      color: "#1e3a8a",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    makeVideo(frame, options.makeId, {
      x: 676,
      y: 118,
      width: 438,
      height: 484,
      src: "",
      poster: "",
      title: "Promo clip",
    }),
  ];
}

export function buildPresentationBlockPreset(
  presetId: PresentationBlockPresetId,
  options: BuildPresetOptions,
): PresentationElement[] {
  return buildBuiltInPresentationComponentInstance(presetId, {
    canvas: options.canvas,
    instanceId: options.makeId("rect"),
  }).fallbackElements;
}
