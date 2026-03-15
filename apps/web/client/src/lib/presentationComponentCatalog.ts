import type { PresentationCanvasSize } from "@/presentation-canvas/constants";
import {
  PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES,
  PRESENTATION_COMPONENT_SLOT_TARGETS,
  type BuiltInPresentationComponentId,
} from "@shared/presentation/componentRecipes";
import {
  buildPresentationComponentRecipeSlotBindings,
  type PresentationRecipeNarrativeInput,
} from "@shared/presentation/componentRecipeSlotBindings";
import type {
  PresentationComponentImageSlotBinding,
  PresentationComponentInstance,
  PresentationComponentListSlotBinding,
  PresentationComponentSlotBinding,
  PresentationComponentTextSlotBinding,
  PresentationComponentVideoSlotBinding,
  PresentationSlideElement,
} from "@shared/presentation/contracts";
import { SVG_GRAPHICS } from "@shared/presentation/svgGraphicsCatalog";

const BASE_CANVAS_WIDTH = 1280;
const BASE_CANVAS_HEIGHT = 720;
const BUILT_IN_COMPONENT_REVISION = 1;
const SVG_BY_ID = new Map(SVG_GRAPHICS.map((graphic) => [graphic.id, graphic.svg]));

type ComponentCategory = "Process" | "Marketing" | "Data" | "Profile" | "Storytelling" | "Long-form";

interface LayoutFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export type BuiltInPresentationComponentSlotDefinition =
  | {
    id: string;
    label: string;
    type: "text";
    multiline?: boolean;
    placeholder?: string;
  }
  | {
    id: string;
    label: string;
    type: "image";
    placeholder?: string;
    altLabel?: string;
  }
  | {
    id: string;
    label: string;
    type: "video";
    placeholder?: string;
    posterLabel?: string;
    titleLabel?: string;
  }
  | {
    id: string;
    label: string;
    type: "list";
    placeholder?: string;
  };

export interface BuiltInPresentationComponentDefinition {
  id: BuiltInPresentationComponentId;
  label: string;
  category: ComponentCategory;
  description: string;
  accentColor: string;
  previewSvg: string;
  slotDefinitions: readonly BuiltInPresentationComponentSlotDefinition[];
}

export interface PresentationComponentCanvasSlotArea {
  slotId: string;
  label: string;
  type: BuiltInPresentationComponentSlotDefinition["type"];
  multiline?: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface BuildComponentInstanceOptions {
  canvas: PresentationCanvasSize;
  instanceId: string;
}

function cloneSlotBinding(binding: PresentationComponentSlotBinding): PresentationComponentSlotBinding {
  if (binding.type === "list") {
    return {
      ...binding,
      items: [...binding.items],
    };
  }
  return {
    ...binding,
  };
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

function componentElementId(componentInstanceId: string, suffix: string): string {
  return `${componentInstanceId}::${suffix}`;
}

function textBinding(slotBindings: PresentationComponentSlotBinding[], slotId: string, fallback: string): string {
  const binding = slotBindings.find((slot): slot is PresentationComponentTextSlotBinding => (
    slot.slotId === slotId && slot.type === "text"
  ));
  return binding?.text ?? fallback;
}

function imageBinding(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: { src: string; alt: string },
): { src: string; alt: string } {
  const binding = slotBindings.find((slot): slot is PresentationComponentImageSlotBinding => (
    slot.slotId === slotId && slot.type === "image"
  ));
  return {
    src: binding?.src ?? fallback.src,
    alt: binding?.alt ?? fallback.alt,
  };
}

function videoBinding(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: { src: string; poster?: string; title: string },
): { src: string; poster?: string; title: string } {
  const binding = slotBindings.find((slot): slot is PresentationComponentVideoSlotBinding => (
    slot.slotId === slotId && slot.type === "video"
  ));
  return {
    src: binding?.src ?? fallback.src,
    poster: binding?.poster ?? fallback.poster,
    title: binding?.title ?? fallback.title,
  };
}

function listBinding(
  slotBindings: PresentationComponentSlotBinding[],
  slotId: string,
  fallback: string[],
): string[] {
  const binding = slotBindings.find((slot): slot is PresentationComponentListSlotBinding => (
    slot.slotId === slotId && slot.type === "list"
  ));
  return binding?.items ?? fallback;
}

function makeText(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
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
): Extract<PresentationSlideElement, { type: "text" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
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
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  },
): Extract<PresentationSlideElement, { type: "rect" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
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
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    size: number;
    graphicId: string;
    alt: string;
    color: string;
  },
): Extract<PresentationSlideElement, { type: "image" }> {
  const svgContent = SVG_BY_ID.get(config.graphicId);
  if (!svgContent) {
    throw new Error(`Unknown SVG graphic: ${config.graphicId}`);
  }

  const size = ps(frame, config.size);
  return {
    id: componentElementId(componentInstanceId, config.suffix),
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

function makeImage(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    alt: string;
    imageFit?: "cover" | "contain" | "fill";
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
  },
): Extract<PresentationSlideElement, { type: "image" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
    type: "image",
    x: px(frame, config.x),
    y: py(frame, config.y),
    width: ps(frame, config.width),
    height: ps(frame, config.height),
    rotation: 0,
    src: config.src,
    alt: config.alt,
    imageFit: config.imageFit ?? "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
    imagePrompt: "",
    imageReferenceUrls: [],
  };
}

function makeVideo(
  frame: LayoutFrame,
  componentInstanceId: string,
  config: {
    suffix: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
    poster?: string;
    title?: string;
    videoFit?: "cover" | "contain" | "fill";
    mediaShape?: "rect" | "rounded" | "circle" | "ellipse" | "diamond" | "star";
    mediaCornerRadius?: number;
  },
): Extract<PresentationSlideElement, { type: "video" }> {
  return {
    id: componentElementId(componentInstanceId, config.suffix),
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
    videoFit: config.videoFit ?? "cover",
    mediaShape: config.mediaShape,
    mediaCornerRadius: config.mediaCornerRadius,
    videoPositionX: 50,
    videoPositionY: 50,
    videoZoom: 1,
  };
}

function defaultSlotBindingsFor(componentId: BuiltInPresentationComponentId): PresentationComponentSlotBinding[] {
  switch (componentId) {
    case "process-steps":
      return [
        { slotId: "title", type: "text", text: "3-Step Process" },
        { slotId: "subtitle", type: "text", text: "A reusable block for tutorials, explainers, and standard operating flows." },
        { slotId: "step1-label", type: "text", text: "Step 01" },
        { slotId: "step1-title", type: "text", text: "Prepare inputs" },
        { slotId: "step1-body", type: "text", text: "Collect the brief, assets, and target outcome before arranging the slide story." },
        { slotId: "step2-label", type: "text", text: "Step 02" },
        { slotId: "step2-title", type: "text", text: "Structure the story" },
        { slotId: "step2-body", type: "text", text: "Split the message into short beats so each slide carries one clear decision or takeaway." },
        { slotId: "step3-label", type: "text", text: "Step 03" },
        { slotId: "step3-title", type: "text", text: "Ship the message" },
        { slotId: "step3-body", type: "text", text: "Use strong visual anchors, then tighten the copy until the sequence feels effortless." },
      ];
    case "timeline-flow":
      return [
        { slotId: "eyebrow", type: "text", text: "Timeline" },
        { slotId: "title", type: "text", text: "Show milestones, launches, or roadmap phases in one balanced flow." },
        { slotId: "subtitle", type: "text", text: "Useful for quarter plans, transformation journeys, product roadmaps, and before-to-after narratives." },
        { slotId: "milestone1-date", type: "text", text: "Q1" },
        { slotId: "milestone1-title", type: "text", text: "Align the brief" },
        { slotId: "milestone1-body", type: "text", text: "Clarify audience, scope, and launch conditions before committing the story." },
        { slotId: "milestone2-date", type: "text", text: "Q2" },
        { slotId: "milestone2-title", type: "text", text: "Build the proof" },
        { slotId: "milestone2-body", type: "text", text: "Create assets, validate the message, and package the strongest evidence." },
        { slotId: "milestone3-date", type: "text", text: "Q3" },
        { slotId: "milestone3-title", type: "text", text: "Scale the rollout" },
        { slotId: "milestone3-body", type: "text", text: "Launch the system, monitor adoption, and tune the narrative around outcomes." },
      ];
    case "feature-highlights":
      return [
        { slotId: "badge", type: "text", text: "Feature Highlights" },
        { slotId: "title", type: "text", text: "A simple block for marketing points, differentiators, or service pillars." },
        { slotId: "feature1-title", type: "text", text: "Metrics first" },
        { slotId: "feature1-body", type: "text", text: "Show impact using one concrete metric and one supporting sentence." },
        { slotId: "feature2-title", type: "text", text: "Human proof" },
        { slotId: "feature2-body", type: "text", text: "Pair the claim with the audience, customer, or team it helps most." },
        { slotId: "feature3-title", type: "text", text: "Fast action" },
        { slotId: "feature3-body", type: "text", text: "End with a clear next move so the slide pushes toward a decision." },
      ];
    case "infographic-grid":
      return [
        { slotId: "eyebrow", type: "text", text: "Framework" },
        { slotId: "title", type: "text", text: "Turn four related ideas into one infographic-style grid." },
        { slotId: "summary", type: "text", text: "Best when each block carries one concept, category, or short explanation with equal weight." },
        { slotId: "item1-title", type: "text", text: "Discover" },
        { slotId: "item1-body", type: "text", text: "Start with the audience problem, constraint, or signal that matters most." },
        { slotId: "item2-title", type: "text", text: "Design" },
        { slotId: "item2-body", type: "text", text: "Convert the insight into a simple system the audience can quickly read." },
        { slotId: "item3-title", type: "text", text: "Deliver" },
        { slotId: "item3-body", type: "text", text: "Package the message into a repeatable slide, workflow, or campaign unit." },
        { slotId: "item4-title", type: "text", text: "Measure" },
        { slotId: "item4-body", type: "text", text: "Finish with the signal that proves the framework is working in practice." },
      ];
    case "stat-cards":
      return [
        { slotId: "eyebrow", type: "text", text: "KPI Snapshot" },
        { slotId: "title", type: "text", text: "Show a few strong numbers before the audience reads the rest of the story." },
        { slotId: "stat1-value", type: "text", text: "42%" },
        { slotId: "stat1-label", type: "text", text: "Conversion lift after launch" },
        { slotId: "stat2-value", type: "text", text: "12d" },
        { slotId: "stat2-label", type: "text", text: "Average time to first win" },
        { slotId: "stat3-value", type: "text", text: "3.1x" },
        { slotId: "stat3-label", type: "text", text: "Return on campaign spend" },
      ];
    case "sectioned-explainer":
      return [
        { slotId: "eyebrow", type: "text", text: "Sectioned Explainer" },
        { slotId: "title", type: "text", text: "Use this long-form layout when one slide still needs structured explanation, not compact cards." },
        { slotId: "intro", type: "text", text: "The intro panel can carry a longer setup paragraph, context, or reader framing before the audience moves into the section-by-section detail.", },
        { slotId: "section1-heading", type: "text", text: "What usually goes wrong" },
        { slotId: "section1-body", type: "text", text: "Use the first section for the most important explanation, common mistake, or audience concern that needs nuance." },
        { slotId: "section2-heading", type: "text", text: "Who this applies to" },
        { slotId: "section2-body", type: "text", text: "Use the second section for audience scope, criteria, or the context readers need before acting on the advice." },
        { slotId: "section3-heading", type: "text", text: "What to do next" },
        { slotId: "section3-body", type: "text", text: "Finish with the practical recommendation, checklist, or interpretation that turns the dense copy into a usable decision." },
        { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
        { slotId: "takeaways", type: "list", items: [
          "Supports longer Thai and English explanatory copy without squeezing it into three-card marketing layouts",
          "Keeps the copy editable as structured slots instead of flattening everything into one text box",
          "Works for guides, article-style explainers, FAQ summaries, and educational slides",
        ] },
      ];
    case "profile-summary":
      return [
        { slotId: "portrait", type: "image", src: "", alt: "Portrait" },
        { slotId: "name", type: "text", text: "Adora Montminy" },
        { slotId: "role", type: "text", text: "Marketing / Digital" },
        { slotId: "contact-title", type: "text", text: "CONTACT" },
        { slotId: "contact-items", type: "list", items: ["123 Anywhere St.", "hello@company.com", "+66 123 456 789"] },
        { slotId: "about-title", type: "text", text: "About This Speaker" },
        { slotId: "about-body", type: "text", text: "Use this block for bio slides, speaker intros, team profiles, or resume-style summaries." },
        { slotId: "highlights-title", type: "text", text: "Highlights" },
        { slotId: "highlights-items", type: "list", items: [
          "Bilingual communicator with cross-channel campaign experience",
          "Strong fit for speaker, mentor, or candidate overview slides",
          "Works well with contact details, achievements, and CTA rows",
        ] },
      ];
    case "quote-callout":
      return [
        { slotId: "quote", type: "text", text: "\"Lead with one idea per slide and let the visual support the sentence, not fight it.\"" },
        { slotId: "eyebrow", type: "text", text: "Editorial Callout" },
        { slotId: "attribution", type: "text", text: "Use for testimonials, opinion slides, quotes, or narrative breaks." },
      ];
    case "video-spotlight":
      return [
        { slotId: "tag", type: "text", text: "Video Spotlight" },
        { slotId: "headline", type: "text", text: "Pair one short message with one strong clip." },
        { slotId: "body", type: "text", text: "Use this for promos, feature reveals, product demos, or narrative slides where motion is the primary proof." },
        { slotId: "clip", type: "video", src: "", poster: "", title: "Promo clip" },
        { slotId: "benefits", type: "list", items: [
          "Keep the headline short so the clip stays dominant",
          "Use the supporting list for benefits, cues, or CTA bullets",
          "Works with autoplay muted preview and exported motion",
        ] },
      ];
    case "poster-spotlight":
      return [
        { slotId: "eyebrow", type: "text", text: "Campaign Spotlight" },
        { slotId: "headline", type: "text", text: "Make one strong promise and let the image carry the emotion." },
        { slotId: "subhead", type: "text", text: "This layout works well for launches, promos, membership offers, and bold announcement slides." },
        { slotId: "hero", type: "image", src: "", alt: "Hero visual" },
        { slotId: "benefits", type: "list", items: [
          "Lead with one audience-facing benefit",
          "Keep the copy short enough to feel poster-like",
          "Use the CTA badge for the next step or offer",
        ] },
        { slotId: "cta", type: "text", text: "Book a free consult" },
      ];
    case "framed-image-story":
      return [
        { slotId: "kicker", type: "text", text: "Editorial Story" },
        { slotId: "headline", type: "text", text: "Combine one framed image with a short story and a crisp takeaway." },
        { slotId: "story", type: "text", text: "Use this for explainers, case studies, campaign retrospectives, or slides where the visual sets context before the details." },
        { slotId: "photo", type: "image", src: "", alt: "Story image" },
        { slotId: "caption", type: "text", text: "Caption or source line" },
        { slotId: "highlights", type: "list", items: [
          "Editorial feel with stronger visual framing",
          "Works well for explainers and case studies",
          "Keeps one image and one narrative block in balance",
        ] },
      ];
    case "photo-collage":
      return [
        { slotId: "kicker", type: "text", text: "Photo Story" },
        { slotId: "headline", type: "text", text: "Pair two related visuals with a short editorial-style narrative." },
        { slotId: "body", type: "text", text: "Use this for lookbooks, campaign moodboards, event recaps, or slides where one supporting detail image changes the story." },
        { slotId: "primary-photo", type: "image", src: "", alt: "Primary photo" },
        { slotId: "secondary-photo", type: "image", src: "", alt: "Secondary photo" },
        { slotId: "caption", type: "text", text: "Caption, source line, or supporting detail" },
      ];
  }
}

function buildProcessStepsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const cards = [
    { y: 188, icon: "briefcase", labelSlot: "step1-label", titleSlot: "step1-title", bodySlot: "step1-body", color: "#f59e0b" },
    { y: 314, icon: "presentation-chart", labelSlot: "step2-label", titleSlot: "step2-title", bodySlot: "step2-body", color: "#0ea5e9" },
    { y: 440, icon: "rocket-launch", labelSlot: "step3-label", titleSlot: "step3-title", bodySlot: "step3-body", color: "#ef4444" },
  ] as const;

  return [
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 168,
      y: 72,
      width: 760,
      height: 76,
      text: textBinding(slotBindings, "title", "3-Step Process"),
      color: "#102a43",
      fontSize: 50,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "subtitle",
      x: 168,
      y: 132,
      width: 780,
      height: 40,
      text: textBinding(slotBindings, "subtitle", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
    }),
    ...cards.flatMap((card, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `card-${index + 1}-bg`,
        x: 168,
        y: card.y,
        width: 944,
        height: 108,
        fill: "rgba(255,248,235,0.96)",
        stroke: "#d6b58d",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `card-${index + 1}-icon`,
        x: 196,
        y: card.y + 20,
        size: 56,
        graphicId: card.icon,
        alt: textBinding(slotBindings, card.titleSlot, ""),
        color: card.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-label`,
        x: 278,
        y: card.y + 18,
        width: 180,
        height: 30,
        text: textBinding(slotBindings, card.labelSlot, ""),
        color: card.color,
        fontSize: 24,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-title`,
        x: 278,
        y: card.y + 42,
        width: 320,
        height: 40,
        text: textBinding(slotBindings, card.titleSlot, ""),
        color: "#102a43",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `card-${index + 1}-body`,
        x: 612,
        y: card.y + 22,
        width: 460,
        height: 60,
        text: textBinding(slotBindings, card.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildTimelineFlowComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const milestones = [
    { x: 140, color: "#0ea5e9", dateSlot: "milestone1-date", titleSlot: "milestone1-title", bodySlot: "milestone1-body" },
    { x: 470, color: "#14b8a6", dateSlot: "milestone2-date", titleSlot: "milestone2-title", bodySlot: "milestone2-body" },
    { x: 800, color: "#8b5cf6", dateSlot: "milestone3-date", titleSlot: "milestone3-title", bodySlot: "milestone3-body" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 180,
      height: 40,
      fill: "#e0f2fe",
      stroke: "#7dd3fc",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 160,
      y: 96,
      width: 140,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#0369a1",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 70,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "subtitle",
      x: 140,
      y: 224,
      width: 760,
      height: 46,
      text: textBinding(slotBindings, "subtitle", ""),
      color: "#475569",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "timeline-line",
      x: 210,
      y: 356,
      width: 700,
      height: 6,
      fill: "#cbd5e1",
    }),
    ...milestones.flatMap((milestone, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-marker`,
        x: milestone.x + 44,
        y: 338,
        width: 20,
        height: 20,
        fill: milestone.color,
      }),
      makeRect(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-date-pill`,
        x: milestone.x,
        y: 386,
        width: 108,
        height: 34,
        fill: "#ffffff",
        stroke: milestone.color,
        strokeWidth: 2,
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-date`,
        x: milestone.x + 12,
        y: 394,
        width: 84,
        height: 18,
        text: textBinding(slotBindings, milestone.dateSlot, ""),
        color: milestone.color,
        fontSize: 18,
        fontWeight: "700",
        textAlign: "center",
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-title`,
        x: milestone.x,
        y: 434,
        width: 230,
        height: 40,
        text: textBinding(slotBindings, milestone.titleSlot, ""),
        color: "#0f172a",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `milestone-${index + 1}-body`,
        x: milestone.x,
        y: 480,
        width: 240,
        height: 58,
        text: textBinding(slotBindings, milestone.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildFeatureHighlightsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const features = [
    { x: 140, icon: "chart-bar", titleSlot: "feature1-title", bodySlot: "feature1-body", color: "#0f766e" },
    { x: 455, icon: "users", titleSlot: "feature2-title", bodySlot: "feature2-body", color: "#2563eb" },
    { x: 770, icon: "rocket-launch", titleSlot: "feature3-title", bodySlot: "feature3-body", color: "#7c3aed" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "badge-bg",
      x: 140,
      y: 92,
      width: 208,
      height: 40,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "badge-text",
      x: 160,
      y: 100,
      width: 180,
      height: 24,
      text: textBinding(slotBindings, "badge", ""),
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 158,
      width: 820,
      height: 104,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    ...features.flatMap((feature, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `feature-${index + 1}-bg`,
        x: feature.x,
        y: 292,
        width: 260,
        height: 252,
        fill: "rgba(255,255,255,0.94)",
        stroke: "#cbd5e1",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `feature-${index + 1}-icon`,
        x: feature.x + 28,
        y: 324,
        size: 52,
        graphicId: feature.icon,
        alt: textBinding(slotBindings, feature.titleSlot, ""),
        color: feature.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `feature-${index + 1}-title`,
        x: feature.x + 28,
        y: 396,
        width: 200,
        height: 40,
        text: textBinding(slotBindings, feature.titleSlot, ""),
        color: "#0f172a",
        fontSize: 28,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `feature-${index + 1}-body`,
        x: feature.x + 28,
        y: 440,
        width: 204,
        height: 76,
        text: textBinding(slotBindings, feature.bodySlot, ""),
        color: "#475569",
        fontSize: 19,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildInfographicGridComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const items = [
    { x: 140, y: 306, color: "#f59e0b", titleSlot: "item1-title", bodySlot: "item1-body" },
    { x: 498, y: 306, color: "#0ea5e9", titleSlot: "item2-title", bodySlot: "item2-body" },
    { x: 140, y: 474, color: "#10b981", titleSlot: "item3-title", bodySlot: "item3-body" },
    { x: 498, y: 474, color: "#8b5cf6", titleSlot: "item4-title", bodySlot: "item4-body" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 88,
      width: 168,
      height: 40,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 158,
      y: 96,
      width: 132,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#6d28d9",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 140,
      y: 150,
      width: 760,
      height: 72,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "summary",
      x: 140,
      y: 226,
      width: 780,
      height: 44,
      text: textBinding(slotBindings, "summary", ""),
      color: "#475569",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    ...items.flatMap((item, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `item-${index + 1}-card`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 132,
        fill: "rgba(255,255,255,0.96)",
        stroke: item.color,
        strokeWidth: 3,
      }),
      makeRect(frame, options.instanceId, {
        suffix: `item-${index + 1}-accent`,
        x: item.x,
        y: item.y,
        width: 302,
        height: 12,
        fill: item.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `item-${index + 1}-title`,
        x: item.x + 26,
        y: item.y + 30,
        width: 220,
        height: 34,
        text: textBinding(slotBindings, item.titleSlot, ""),
        color: "#0f172a",
        fontSize: 26,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `item-${index + 1}-body`,
        x: item.x + 26,
        y: item.y + 72,
        width: 236,
        height: 42,
        text: textBinding(slotBindings, item.bodySlot, ""),
        color: "#475569",
        fontSize: 18,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildStatCardsComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const stats = [
    { x: 132, valueSlot: "stat1-value", labelSlot: "stat1-label", color: "#2563eb", icon: "chart-bar" },
    { x: 435, valueSlot: "stat2-value", labelSlot: "stat2-label", color: "#0f766e", icon: "presentation-chart" },
    { x: 738, valueSlot: "stat3-value", labelSlot: "stat3-label", color: "#7c3aed", icon: "rocket-launch" },
  ] as const;

  return [
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 132,
      y: 92,
      width: 216,
      height: 40,
      fill: "#eff6ff",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 152,
      y: 100,
      width: 176,
      height: 24,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#1d4ed8",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 132,
      y: 156,
      width: 820,
      height: 88,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    ...stats.flatMap((stat, index) => ([
      makeRect(frame, options.instanceId, {
        suffix: `stat-${index + 1}-card`,
        x: stat.x,
        y: 306,
        width: 248,
        height: 224,
        fill: "rgba(255,255,255,0.95)",
        stroke: "#cbd5e1",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: `stat-${index + 1}-icon`,
        x: stat.x + 28,
        y: 330,
        size: 44,
        graphicId: stat.icon,
        alt: textBinding(slotBindings, stat.labelSlot, ""),
        color: stat.color,
      }),
      makeText(frame, options.instanceId, {
        suffix: `stat-${index + 1}-value`,
        x: stat.x + 28,
        y: 394,
        width: 192,
        height: 52,
        text: textBinding(slotBindings, stat.valueSlot, ""),
        color: stat.color,
        fontSize: 46,
        fontWeight: "700",
      }),
      makeText(frame, options.instanceId, {
        suffix: `stat-${index + 1}-label`,
        x: stat.x + 28,
        y: 460,
        width: 192,
        height: 44,
        text: textBinding(slotBindings, stat.labelSlot, ""),
        color: "#475569",
        fontSize: 20,
        fontWeight: "500",
        lineHeight: 1.35,
      }),
    ])),
  ];
}

function buildProfileSummaryComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const portrait = imageBinding(slotBindings, "portrait", { src: "", alt: "Portrait" });
  const contactItems = listBinding(slotBindings, "contact-items", []);
  const highlightItems = listBinding(slotBindings, "highlights-items", []);
  const portraitFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["profile-summary"]?.portrait;

  const portraitElements = portrait.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "portrait-image",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        src: portrait.src,
        alt: portrait.alt,
        imageFit: "cover",
        mediaShape: portraitFrameStyle?.mediaShape,
        mediaCornerRadius: portraitFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "portrait-frame",
        x: 180,
        y: 140,
        width: 200,
        height: 180,
        fill: "#27476c",
        stroke: "#7dd3fc",
        strokeWidth: 2,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: "portrait-placeholder",
        x: 214,
        y: 166,
        size: 128,
        graphicId: "users",
        alt: portrait.alt,
        color: "#f8fafc",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "sidebar-bg",
      x: 126,
      y: 104,
      width: 304,
      height: 500,
      fill: "#1e3a5f",
      stroke: "#4b6b8b",
      strokeWidth: 3,
    }),
    ...portraitElements,
    makeText(frame, options.instanceId, {
      suffix: "name",
      x: 158,
      y: 332,
      width: 240,
      height: 42,
      text: textBinding(slotBindings, "name", ""),
      color: "#f8fafc",
      fontSize: 32,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "role-bg",
      x: 168,
      y: 388,
      width: 220,
      height: 40,
      fill: "#f4d58d",
      stroke: "#eab308",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "role",
      x: 180,
      y: 396,
      width: 196,
      height: 24,
      text: textBinding(slotBindings, "role", ""),
      color: "#334155",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "contact-title",
      x: 168,
      y: 454,
      width: 220,
      height: 24,
      text: textBinding(slotBindings, "contact-title", ""),
      color: "#bfdbfe",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "contact-items",
      x: 166,
      y: 486,
      width: 224,
      height: 88,
      text: contactItems.join("\n"),
      color: "#e2e8f0",
      fontSize: 18,
      fontWeight: "500",
      textAlign: "center",
      lineHeight: 1.45,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "about-bg",
      x: 478,
      y: 104,
      width: 676,
      height: 180,
      fill: "rgba(255,255,255,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.instanceId, {
      suffix: "about-title",
      x: 522,
      y: 138,
      width: 580,
      height: 48,
      text: textBinding(slotBindings, "about-title", ""),
      color: "#0f172a",
      fontSize: 36,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "about-body",
      x: 522,
      y: 190,
      width: 574,
      height: 62,
      text: textBinding(slotBindings, "about-body", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.32,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "highlights-bg",
      x: 478,
      y: 314,
      width: 676,
      height: 290,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights-title",
      x: 522,
      y: 346,
      width: 260,
      height: 34,
      text: textBinding(slotBindings, "highlights-title", ""),
      color: "#1d4ed8",
      fontSize: 28,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights-items",
      x: 522,
      y: 398,
      width: 560,
      height: 120,
      text: highlightItems.map((item) => `• ${item}`).join("\n"),
      color: "#334155",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
  ];
}

function buildQuoteCalloutComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);

  return [
    makeRect(frame, options.instanceId, {
      suffix: "quote-bg",
      x: 150,
      y: 176,
      width: 980,
      height: 344,
      fill: "rgba(15,23,42,0.88)",
      stroke: "#475569",
      strokeWidth: 3,
    }),
    makeSvgGraphic(frame, options.instanceId, {
      suffix: "quote-icon",
      x: 198,
      y: 232,
      size: 72,
      graphicId: "chat-bubble",
      alt: "Quote",
      color: "#c084fc",
    }),
    makeText(frame, options.instanceId, {
      suffix: "quote",
      x: 300,
      y: 224,
      width: 740,
      height: 160,
      text: textBinding(slotBindings, "quote", ""),
      color: "#f8fafc",
      fontSize: 42,
      fontWeight: "700",
      lineHeight: 1.14,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 300,
      y: 398,
      width: 228,
      height: 42,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 320,
      y: 406,
      width: 188,
      height: 28,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#6d28d9",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "attribution",
      x: 300,
      y: 462,
      width: 520,
      height: 48,
      text: textBinding(slotBindings, "attribution", ""),
      color: "#cbd5e1",
      fontSize: 20,
      fontWeight: "500",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "accent-line",
      x: 840,
      y: 458,
      width: 184,
      height: 8,
      fill: "#a855f7",
    }),
  ];
}

function buildVideoSpotlightComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const clip = videoBinding(slotBindings, "clip", { src: "", poster: "", title: "Promo clip" });
  const benefits = listBinding(slotBindings, "benefits", []);
  const clipFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["video-spotlight"]?.clip;

  const mediaElements = clip.src.trim()
    ? [
      makeVideo(frame, options.instanceId, {
        suffix: "clip-video",
        x: 676,
        y: 118,
        width: 438,
        height: 484,
        src: clip.src,
        poster: clip.poster,
        title: clip.title,
        videoFit: "cover",
        mediaShape: clipFrameStyle?.mediaShape,
        mediaCornerRadius: clipFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "clip-frame",
        x: 676,
        y: 118,
        width: 438,
        height: 484,
        fill: "rgba(15,23,42,0.94)",
        stroke: "#38bdf8",
        strokeWidth: 3,
      }),
      makeSvgGraphic(frame, options.instanceId, {
        suffix: "clip-icon",
        x: 838,
        y: 288,
        size: 88,
        graphicId: "presentation-chart",
        alt: clip.title,
        color: "#38bdf8",
      }),
      makeText(frame, options.instanceId, {
        suffix: "clip-placeholder",
        x: 750,
        y: 404,
        width: 286,
        height: 32,
        text: "Drop or pick a video clip",
        color: "#e0f2fe",
        fontSize: 22,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 124,
      y: 102,
      width: 1032,
      height: 516,
      fill: "rgba(248,250,252,0.96)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "tag-bg",
      x: 174,
      y: 146,
      width: 180,
      height: 40,
      fill: "#082f49",
      stroke: "#0ea5e9",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "tag",
      x: 192,
      y: 154,
      width: 144,
      height: 24,
      text: textBinding(slotBindings, "tag", ""),
      color: "#e0f2fe",
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 174,
      y: 218,
      width: 432,
      height: 108,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.12,
    }),
    makeText(frame, options.instanceId, {
      suffix: "body",
      x: 174,
      y: 330,
      width: 414,
      height: 96,
      text: textBinding(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.35,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "benefits-bg",
      x: 174,
      y: 448,
      width: 418,
      height: 144,
      fill: "#eff6ff",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "benefits",
      x: 198,
      y: 472,
      width: 360,
      height: 102,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: "#1e3a8a",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    ...mediaElements,
  ];
}

function buildPosterSpotlightComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const hero = imageBinding(slotBindings, "hero", { src: "", alt: "Hero visual" });
  const benefits = listBinding(slotBindings, "benefits", []);
  const heroFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["poster-spotlight"]?.hero;

  const mediaElements = hero.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "hero-image",
        x: 728,
        y: 84,
        width: 384,
        height: 552,
        src: hero.src,
        alt: hero.alt,
        imageFit: "cover",
        mediaShape: heroFrameStyle?.mediaShape,
        mediaCornerRadius: heroFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "hero-frame",
        x: 728,
        y: 84,
        width: 384,
        height: 552,
        fill: "rgba(15,23,42,0.92)",
        stroke: "#7dd3fc",
        strokeWidth: 3,
      }),
      makeText(frame, options.instanceId, {
        suffix: "hero-placeholder",
        x: 788,
        y: 332,
        width: 264,
        height: 42,
        text: "Drop or pick a hero image",
        color: "#e0f2fe",
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 96,
      y: 64,
      width: 1088,
      height: 592,
      fill: "rgba(239,246,255,0.96)",
      stroke: "#93c5fd",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 140,
      y: 108,
      width: 208,
      height: 38,
      fill: "#0f766e",
      stroke: "#34d399",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 156,
      y: 116,
      width: 176,
      height: 22,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#ecfeff",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 140,
      y: 180,
      width: 506,
      height: 140,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 50,
      fontWeight: "700",
      lineHeight: 1.05,
    }),
    makeText(frame, options.instanceId, {
      suffix: "subhead",
      x: 140,
      y: 336,
      width: 492,
      height: 82,
      text: textBinding(slotBindings, "subhead", ""),
      color: "#475569",
      fontSize: 22,
      fontWeight: "500",
      lineHeight: 1.34,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "benefits-panel",
      x: 140,
      y: 452,
      width: 456,
      height: 126,
      fill: "rgba(255,255,255,0.9)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "benefits",
      x: 168,
      y: 478,
      width: 404,
      height: 76,
      text: benefits.map((item) => `• ${item}`).join("\n"),
      color: "#1e293b",
      fontSize: 20,
      fontWeight: "500",
      lineHeight: 1.36,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "cta-bg",
      x: 140,
      y: 596,
      width: 286,
      height: 40,
      fill: "#1d4ed8",
      stroke: "#60a5fa",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "cta",
      x: 164,
      y: 604,
      width: 238,
      height: 22,
      text: textBinding(slotBindings, "cta", ""),
      color: "#eff6ff",
      fontSize: 18,
      fontWeight: "700",
      textAlign: "center",
    }),
    ...mediaElements,
  ];
}

function buildFramedImageStoryComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const photo = imageBinding(slotBindings, "photo", { src: "", alt: "Story image" });
  const highlights = listBinding(slotBindings, "highlights", []);
  const photoFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["framed-image-story"]?.photo;

  const photoElements = photo.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "photo-image",
        x: 120,
        y: 112,
        width: 424,
        height: 420,
        src: photo.src,
        alt: photo.alt,
        imageFit: "cover",
        mediaShape: photoFrameStyle?.mediaShape,
        mediaCornerRadius: photoFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "photo-frame",
        x: 120,
        y: 112,
        width: 424,
        height: 420,
        fill: "rgba(226,232,240,0.92)",
        stroke: "#64748b",
        strokeWidth: 4,
      }),
      makeText(frame, options.instanceId, {
        suffix: "photo-placeholder",
        x: 184,
        y: 300,
        width: 296,
        height: 40,
        text: "Drop or pick a story image",
        color: "#334155",
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 88,
      y: 78,
      width: 1104,
      height: 564,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    ...photoElements,
    makeRect(frame, options.instanceId, {
      suffix: "kicker-bg",
      x: 606,
      y: 118,
      width: 204,
      height: 36,
      fill: "#ede9fe",
      stroke: "#c4b5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "kicker",
      x: 626,
      y: 126,
      width: 164,
      height: 20,
      text: textBinding(slotBindings, "kicker", ""),
      color: "#6d28d9",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 606,
      y: 178,
      width: 470,
      height: 114,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 44,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, options.instanceId, {
      suffix: "story",
      x: 606,
      y: 308,
      width: 470,
      height: 114,
      text: textBinding(slotBindings, "story", ""),
      color: "#475569",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.4,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "caption-bg",
      x: 120,
      y: 552,
      width: 424,
      height: 42,
      fill: "#0f172a",
      stroke: "#334155",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "caption",
      x: 146,
      y: 562,
      width: 372,
      height: 22,
      text: textBinding(slotBindings, "caption", ""),
      color: "#e2e8f0",
      fontSize: 17,
      fontWeight: "600",
      textAlign: "center",
    }),
    makeRect(frame, options.instanceId, {
      suffix: "highlights-panel",
      x: 606,
      y: 452,
      width: 470,
      height: 142,
      fill: "rgba(255,255,255,0.92)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "highlights",
      x: 634,
      y: 480,
      width: 414,
      height: 86,
      text: highlights.map((item) => `• ${item}`).join("\n"),
      color: "#334155",
      fontSize: 19,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
  ];
}

function buildPhotoCollageComponent(options: BuildComponentInstanceOptions, slotBindings: PresentationComponentSlotBinding[]): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const primaryPhoto = imageBinding(slotBindings, "primary-photo", { src: "", alt: "Primary photo" });
  const secondaryPhoto = imageBinding(slotBindings, "secondary-photo", { src: "", alt: "Secondary photo" });
  const primaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["primary-photo"];
  const secondaryFrameStyle = PRESENTATION_COMPONENT_MEDIA_FRAME_STYLES["photo-collage"]?.["secondary-photo"];

  const primaryElements = primaryPhoto.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "primary-image",
        x: 112,
        y: 152,
        width: 494,
        height: 360,
        src: primaryPhoto.src,
        alt: primaryPhoto.alt,
        imageFit: "cover",
        mediaShape: primaryFrameStyle?.mediaShape,
        mediaCornerRadius: primaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "primary-frame",
        x: 112,
        y: 152,
        width: 494,
        height: 360,
        fill: "rgba(226,232,240,0.92)",
        stroke: "#64748b",
        strokeWidth: 4,
      }),
      makeText(frame, options.instanceId, {
        suffix: "primary-placeholder",
        x: 216,
        y: 318,
        width: 286,
        height: 40,
        text: "Drop a primary image",
        color: "#334155",
        fontSize: 24,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  const secondaryElements = secondaryPhoto.src.trim()
    ? [
      makeImage(frame, options.instanceId, {
        suffix: "secondary-image",
        x: 864,
        y: 108,
        width: 248,
        height: 198,
        src: secondaryPhoto.src,
        alt: secondaryPhoto.alt,
        imageFit: "cover",
        mediaShape: secondaryFrameStyle?.mediaShape,
        mediaCornerRadius: secondaryFrameStyle?.mediaCornerRadius,
      }),
    ]
    : [
      makeRect(frame, options.instanceId, {
        suffix: "secondary-frame",
        x: 864,
        y: 108,
        width: 248,
        height: 198,
        fill: "rgba(224,231,255,0.9)",
        stroke: "#8b5cf6",
        strokeWidth: 3,
      }),
      makeText(frame, options.instanceId, {
        suffix: "secondary-placeholder",
        x: 900,
        y: 190,
        width: 176,
        height: 34,
        text: "Detail image",
        color: "#6d28d9",
        fontSize: 20,
        fontWeight: "700",
        textAlign: "center",
      }),
    ];

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 72,
      y: 78,
      width: 1136,
      height: 564,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 3,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "kicker-bg",
      x: 112,
      y: 96,
      width: 188,
      height: 36,
      fill: "#dbeafe",
      stroke: "#93c5fd",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "kicker",
      x: 130,
      y: 104,
      width: 152,
      height: 20,
      text: textBinding(slotBindings, "kicker", ""),
      color: "#1d4ed8",
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "headline",
      x: 112,
      y: 530,
      width: 520,
      height: 72,
      text: textBinding(slotBindings, "headline", ""),
      color: "#0f172a",
      fontSize: 40,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeText(frame, options.instanceId, {
      suffix: "body",
      x: 656,
      y: 346,
      width: 456,
      height: 126,
      text: textBinding(slotBindings, "body", ""),
      color: "#475569",
      fontSize: 21,
      fontWeight: "500",
      lineHeight: 1.38,
    }),
    ...primaryElements,
    ...secondaryElements,
    makeRect(frame, options.instanceId, {
      suffix: "caption-bg",
      x: 864,
      y: 524,
      width: 248,
      height: 44,
      fill: "#0f172a",
      stroke: "#334155",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "caption",
      x: 888,
      y: 534,
      width: 200,
      height: 22,
      text: textBinding(slotBindings, "caption", ""),
      color: "#e2e8f0",
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    }),
  ];
}

function buildSectionedExplainerComponent(
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  const frame = getLayoutFrame(options.canvas);
  const takeaways = listBinding(slotBindings, "takeaways", [])
    .map((item) => `• ${item}`)
    .join("\n");

  return [
    makeRect(frame, options.instanceId, {
      suffix: "canvas-bg",
      x: 72,
      y: 64,
      width: 1136,
      height: 592,
      fill: "rgba(248,250,252,0.98)",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "eyebrow-bg",
      x: 96,
      y: 90,
      width: 200,
      height: 34,
      fill: "#dbeafe",
      stroke: "#60a5fa",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "eyebrow",
      x: 116,
      y: 98,
      width: 160,
      height: 18,
      text: textBinding(slotBindings, "eyebrow", ""),
      color: "#1d4ed8",
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    }),
    makeText(frame, options.instanceId, {
      suffix: "title",
      x: 96,
      y: 140,
      width: 1030,
      height: 58,
      text: textBinding(slotBindings, "title", ""),
      color: "#0f172a",
      fontSize: 42,
      fontWeight: "700",
      lineHeight: 1.1,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "intro-card",
      x: 96,
      y: 214,
      width: 330,
      height: 212,
      fill: "#e0f2fe",
      stroke: "#7dd3fc",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "intro",
      x: 120,
      y: 236,
      width: 282,
      height: 168,
      text: textBinding(slotBindings, "intro", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.5,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "takeaways-card",
      x: 96,
      y: 444,
      width: 330,
      height: 176,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "takeaways-title",
      x: 120,
      y: 464,
      width: 184,
      height: 24,
      text: textBinding(slotBindings, "takeaways-title", ""),
      color: "#2563eb",
      fontSize: 19,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "takeaways",
      x: 120,
      y: 498,
      width: 282,
      height: 108,
      text: takeaways,
      color: "#0f172a",
      fontSize: 16,
      fontWeight: "500",
      lineHeight: 1.42,
    }),
    makeRect(frame, options.instanceId, {
      suffix: "sections-card",
      x: 458,
      y: 214,
      width: 654,
      height: 406,
      fill: "#ffffff",
      stroke: "#cbd5e1",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-1-heading",
      x: 486,
      y: 240,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section1-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-1-body",
      x: 486,
      y: 272,
      width: 590,
      height: 94,
      text: textBinding(slotBindings, "section1-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeLine(frame, options.instanceId, {
      suffix: "section-1-divider",
      x: 486,
      y: 380,
      width: 590,
      height: 0,
      stroke: "#e2e8f0",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-2-heading",
      x: 486,
      y: 398,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section2-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-2-body",
      x: 486,
      y: 430,
      width: 590,
      height: 94,
      text: textBinding(slotBindings, "section2-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.46,
    }),
    makeLine(frame, options.instanceId, {
      suffix: "section-2-divider",
      x: 486,
      y: 538,
      width: 590,
      height: 0,
      stroke: "#e2e8f0",
      strokeWidth: 2,
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-3-heading",
      x: 486,
      y: 556,
      width: 590,
      height: 24,
      text: textBinding(slotBindings, "section3-heading", ""),
      color: "#2563eb",
      fontSize: 24,
      fontWeight: "700",
    }),
    makeText(frame, options.instanceId, {
      suffix: "section-3-body",
      x: 486,
      y: 588,
      width: 590,
      height: 72,
      text: textBinding(slotBindings, "section3-body", ""),
      color: "#0f172a",
      fontSize: 18,
      fontWeight: "500",
      lineHeight: 1.44,
    }),
  ];
}

function buildFallbackElementsForComponent(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions,
  slotBindings: PresentationComponentSlotBinding[],
): PresentationSlideElement[] {
  switch (componentId) {
    case "process-steps":
      return buildProcessStepsComponent(options, slotBindings);
    case "timeline-flow":
      return buildTimelineFlowComponent(options, slotBindings);
    case "feature-highlights":
      return buildFeatureHighlightsComponent(options, slotBindings);
    case "infographic-grid":
      return buildInfographicGridComponent(options, slotBindings);
    case "stat-cards":
      return buildStatCardsComponent(options, slotBindings);
    case "sectioned-explainer":
      return buildSectionedExplainerComponent(options, slotBindings);
    case "profile-summary":
      return buildProfileSummaryComponent(options, slotBindings);
    case "quote-callout":
      return buildQuoteCalloutComponent(options, slotBindings);
    case "video-spotlight":
      return buildVideoSpotlightComponent(options, slotBindings);
    case "poster-spotlight":
      return buildPosterSpotlightComponent(options, slotBindings);
    case "framed-image-story":
      return buildFramedImageStoryComponent(options, slotBindings);
    case "photo-collage":
      return buildPhotoCollageComponent(options, slotBindings);
  }
}

const COMPONENT_SLOT_DEFINITIONS: Record<BuiltInPresentationComponentId, readonly BuiltInPresentationComponentSlotDefinition[]> = {
  "process-steps": [
    { id: "title", label: "Title", type: "text" },
    { id: "subtitle", label: "Subtitle", type: "text", multiline: true },
    { id: "step1-label", label: "Step 1 Label", type: "text" },
    { id: "step1-title", label: "Step 1 Title", type: "text" },
    { id: "step1-body", label: "Step 1 Body", type: "text", multiline: true },
    { id: "step2-label", label: "Step 2 Label", type: "text" },
    { id: "step2-title", label: "Step 2 Title", type: "text" },
    { id: "step2-body", label: "Step 2 Body", type: "text", multiline: true },
    { id: "step3-label", label: "Step 3 Label", type: "text" },
    { id: "step3-title", label: "Step 3 Title", type: "text" },
    { id: "step3-body", label: "Step 3 Body", type: "text", multiline: true },
  ],
  "timeline-flow": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Title", type: "text", multiline: true },
    { id: "subtitle", label: "Subtitle", type: "text", multiline: true },
    { id: "milestone1-date", label: "Milestone 1 Date", type: "text" },
    { id: "milestone1-title", label: "Milestone 1 Title", type: "text" },
    { id: "milestone1-body", label: "Milestone 1 Body", type: "text", multiline: true },
    { id: "milestone2-date", label: "Milestone 2 Date", type: "text" },
    { id: "milestone2-title", label: "Milestone 2 Title", type: "text" },
    { id: "milestone2-body", label: "Milestone 2 Body", type: "text", multiline: true },
    { id: "milestone3-date", label: "Milestone 3 Date", type: "text" },
    { id: "milestone3-title", label: "Milestone 3 Title", type: "text" },
    { id: "milestone3-body", label: "Milestone 3 Body", type: "text", multiline: true },
  ],
  "feature-highlights": [
    { id: "badge", label: "Badge", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "feature1-title", label: "Feature 1 Title", type: "text" },
    { id: "feature1-body", label: "Feature 1 Body", type: "text", multiline: true },
    { id: "feature2-title", label: "Feature 2 Title", type: "text" },
    { id: "feature2-body", label: "Feature 2 Body", type: "text", multiline: true },
    { id: "feature3-title", label: "Feature 3 Title", type: "text" },
    { id: "feature3-body", label: "Feature 3 Body", type: "text", multiline: true },
  ],
  "infographic-grid": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "summary", label: "Summary", type: "text", multiline: true },
    { id: "item1-title", label: "Item 1 Title", type: "text" },
    { id: "item1-body", label: "Item 1 Body", type: "text", multiline: true },
    { id: "item2-title", label: "Item 2 Title", type: "text" },
    { id: "item2-body", label: "Item 2 Body", type: "text", multiline: true },
    { id: "item3-title", label: "Item 3 Title", type: "text" },
    { id: "item3-body", label: "Item 3 Body", type: "text", multiline: true },
    { id: "item4-title", label: "Item 4 Title", type: "text" },
    { id: "item4-body", label: "Item 4 Body", type: "text", multiline: true },
  ],
  "stat-cards": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "stat1-value", label: "Stat 1 Value", type: "text" },
    { id: "stat1-label", label: "Stat 1 Label", type: "text", multiline: true },
    { id: "stat2-value", label: "Stat 2 Value", type: "text" },
    { id: "stat2-label", label: "Stat 2 Label", type: "text", multiline: true },
    { id: "stat3-value", label: "Stat 3 Value", type: "text" },
    { id: "stat3-label", label: "Stat 3 Label", type: "text", multiline: true },
  ],
  "sectioned-explainer": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "title", label: "Headline", type: "text", multiline: true },
    { id: "intro", label: "Intro", type: "text", multiline: true },
    { id: "section1-heading", label: "Section 1 Heading", type: "text" },
    { id: "section1-body", label: "Section 1 Body", type: "text", multiline: true },
    { id: "section2-heading", label: "Section 2 Heading", type: "text" },
    { id: "section2-body", label: "Section 2 Body", type: "text", multiline: true },
    { id: "section3-heading", label: "Section 3 Heading", type: "text" },
    { id: "section3-body", label: "Section 3 Body", type: "text", multiline: true },
    { id: "takeaways-title", label: "Takeaways Title", type: "text" },
    { id: "takeaways", label: "Takeaways", type: "list", placeholder: "One bullet per line" },
  ],
  "profile-summary": [
    { id: "portrait", label: "Portrait Image", type: "image", placeholder: "https://..." },
    { id: "name", label: "Name", type: "text" },
    { id: "role", label: "Role", type: "text" },
    { id: "contact-title", label: "Contact Heading", type: "text" },
    { id: "contact-items", label: "Contact Items", type: "list", placeholder: "One item per line" },
    { id: "about-title", label: "About Title", type: "text" },
    { id: "about-body", label: "About Body", type: "text", multiline: true },
    { id: "highlights-title", label: "Highlights Title", type: "text" },
    { id: "highlights-items", label: "Highlights", type: "list", placeholder: "One bullet per line" },
  ],
  "quote-callout": [
    { id: "quote", label: "Quote", type: "text", multiline: true },
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "attribution", label: "Supporting Line", type: "text", multiline: true },
  ],
  "video-spotlight": [
    { id: "tag", label: "Tag", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "clip", label: "Video Clip", type: "video", placeholder: "https://..." },
    { id: "benefits", label: "Benefit List", type: "list", placeholder: "One bullet per line" },
  ],
  "poster-spotlight": [
    { id: "eyebrow", label: "Eyebrow", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "subhead", label: "Subhead", type: "text", multiline: true },
    { id: "hero", label: "Hero Image", type: "image", placeholder: "https://..." },
    { id: "benefits", label: "Benefits", type: "list", placeholder: "One bullet per line" },
    { id: "cta", label: "CTA", type: "text" },
  ],
  "framed-image-story": [
    { id: "kicker", label: "Kicker", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "story", label: "Story Body", type: "text", multiline: true },
    { id: "photo", label: "Photo", type: "image", placeholder: "https://..." },
    { id: "caption", label: "Caption", type: "text" },
    { id: "highlights", label: "Highlights", type: "list", placeholder: "One bullet per line" },
  ],
  "photo-collage": [
    { id: "kicker", label: "Kicker", type: "text" },
    { id: "headline", label: "Headline", type: "text", multiline: true },
    { id: "body", label: "Body", type: "text", multiline: true },
    { id: "primary-photo", label: "Primary Photo", type: "image", placeholder: "https://..." },
    { id: "secondary-photo", label: "Secondary Photo", type: "image", placeholder: "https://..." },
    { id: "caption", label: "Caption", type: "text" },
  ],
};

function getComponentElementSuffix(elementId: string): string {
  const delimiter = elementId.indexOf("::");
  return delimiter >= 0 ? elementId.slice(delimiter + 2) : elementId;
}

function unionElementBounds(elements: PresentationSlideElement[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!elements.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + Math.max(2, element.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(16, maxX - minX),
    height: Math.max(16, maxY - minY),
  };
}

const COMPONENT_PREVIEWS: Record<BuiltInPresentationComponentId, string> = {
  "process-steps": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#FFF9ED"/>
      <rect x="28" y="22" width="168" height="14" rx="7" fill="#102A43"/>
      <rect x="28" y="44" width="196" height="8" rx="4" fill="#94A3B8"/>
      <rect x="28" y="70" width="264" height="28" rx="12" fill="#FFF4DD" stroke="#D6B58D"/>
      <circle cx="50" cy="84" r="10" fill="#F59E0B"/>
      <rect x="68" y="78" width="70" height="8" rx="4" fill="#102A43"/>
      <rect x="164" y="78" width="104" height="8" rx="4" fill="#64748B"/>
      <rect x="28" y="108" width="264" height="28" rx="12" fill="#F0F9FF" stroke="#7DD3FC"/>
      <circle cx="50" cy="122" r="10" fill="#0EA5E9"/>
      <rect x="68" y="116" width="74" height="8" rx="4" fill="#102A43"/>
      <rect x="164" y="116" width="98" height="8" rx="4" fill="#64748B"/>
      <rect x="28" y="146" width="264" height="22" rx="11" fill="#FEF2F2" stroke="#FECACA"/>
      <circle cx="50" cy="157" r="8" fill="#EF4444"/>
      <rect x="68" y="153" width="150" height="8" rx="4" fill="#102A43"/>
    </svg>
  `,
  "timeline-flow": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="72" height="18" rx="9" fill="#E0F2FE"/>
      <rect x="34" y="26" width="48" height="6" rx="3" fill="#0284C7"/>
      <rect x="22" y="48" width="180" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="200" height="8" rx="4" fill="#64748B"/>
      <rect x="56" y="104" width="208" height="6" rx="3" fill="#CBD5E1"/>
      <circle cx="74" cy="107" r="10" fill="#0EA5E9"/>
      <circle cx="160" cy="107" r="10" fill="#14B8A6"/>
      <circle cx="246" cy="107" r="10" fill="#8B5CF6"/>
      <rect x="34" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#7DD3FC"/>
      <rect x="42" y="130" width="52" height="6" rx="3" fill="#0284C7"/>
      <rect x="126" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#5EEAD4"/>
      <rect x="134" y="130" width="52" height="6" rx="3" fill="#0F766E"/>
      <rect x="218" y="126" width="68" height="14" rx="7" fill="#FFFFFF" stroke="#C4B5FD"/>
      <rect x="226" y="130" width="52" height="6" rx="3" fill="#7C3AED"/>
    </svg>
  `,
  "feature-highlights": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="86" height="18" rx="9" fill="#DBEAFE"/>
      <rect x="32" y="26" width="66" height="6" rx="3" fill="#2563EB"/>
      <rect x="22" y="48" width="196" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="48" cy="94" r="10" fill="#0F766E"/>
      <rect x="64" y="88" width="30" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="108" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="120" width="42" height="6" rx="3" fill="#64748B"/>
      <rect x="118" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="144" cy="94" r="10" fill="#2563EB"/>
      <rect x="160" y="88" width="26" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="130" y="108" width="56" height="6" rx="3" fill="#64748B"/>
      <rect x="130" y="120" width="44" height="6" rx="3" fill="#64748B"/>
      <rect x="214" y="72" width="84" height="74" rx="14" fill="white" stroke="#CBD5E1"/>
      <circle cx="240" cy="94" r="10" fill="#7C3AED"/>
      <rect x="256" y="88" width="24" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="226" y="108" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="226" y="120" width="42" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
  "infographic-grid": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="22" y="20" width="82" height="18" rx="9" fill="#EDE9FE"/>
      <rect x="34" y="26" width="58" height="6" rx="3" fill="#7C3AED"/>
      <rect x="22" y="48" width="204" height="16" rx="8" fill="#0F172A"/>
      <rect x="22" y="72" width="196" height="8" rx="4" fill="#64748B"/>
      <rect x="22" y="94" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#F59E0B"/>
      <rect x="34" y="104" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="116" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="170" y="94" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#0EA5E9"/>
      <rect x="182" y="104" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="182" y="116" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="22" y="132" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#10B981"/>
      <rect x="34" y="142" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="34" y="154" width="82" height="5" rx="2.5" fill="#64748B"/>
      <rect x="170" y="132" width="128" height="30" rx="10" fill="#FFFFFF" stroke="#8B5CF6"/>
      <rect x="182" y="142" width="68" height="7" rx="3.5" fill="#0F172A"/>
      <rect x="182" y="154" width="82" height="5" rx="2.5" fill="#64748B"/>
    </svg>
  `,
  "stat-cards": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="20" y="20" width="90" height="18" rx="9" fill="#DBEAFE"/>
      <rect x="32" y="26" width="66" height="6" rx="3" fill="#2563EB"/>
      <rect x="20" y="50" width="196" height="16" rx="8" fill="#0F172A"/>
      <rect x="20" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="46" cy="98" r="10" fill="#2563EB"/>
      <rect x="34" y="118" width="42" height="12" rx="6" fill="#2563EB"/>
      <rect x="34" y="136" width="52" height="6" rx="3" fill="#64748B"/>
      <rect x="118" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="144" cy="98" r="10" fill="#0F766E"/>
      <rect x="132" y="118" width="38" height="12" rx="6" fill="#0F766E"/>
      <rect x="132" y="136" width="54" height="6" rx="3" fill="#64748B"/>
      <rect x="216" y="78" width="84" height="76" rx="14" fill="#FFFFFF" stroke="#CBD5E1"/>
      <circle cx="242" cy="98" r="10" fill="#7C3AED"/>
      <rect x="230" y="118" width="40" height="12" rx="6" fill="#7C3AED"/>
      <rect x="230" y="136" width="52" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
  "sectioned-explainer": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="86" height="16" rx="8" fill="#DBEAFE"/>
      <rect x="42" y="35" width="62" height="6" rx="3" fill="#2563EB"/>
      <rect x="30" y="56" width="204" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="72" width="188" height="10" rx="5" fill="#0F172A"/>
      <rect x="30" y="92" width="92" height="64" rx="12" fill="#E0F2FE" stroke="#7DD3FC"/>
      <rect x="42" y="104" width="64" height="6" rx="3" fill="#334155"/>
      <rect x="42" y="116" width="70" height="6" rx="3" fill="#334155"/>
      <rect x="42" y="128" width="62" height="6" rx="3" fill="#334155"/>
      <rect x="132" y="92" width="156" height="64" rx="12" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="146" y="104" width="74" height="7" rx="3.5" fill="#2563EB"/>
      <rect x="146" y="118" width="126" height="6" rx="3" fill="#334155"/>
      <rect x="146" y="130" width="120" height="6" rx="3" fill="#334155"/>
      <rect x="146" y="142" width="112" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "profile-summary": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="16" width="92" height="148" rx="18" fill="#1E3A5F"/>
      <rect x="34" y="28" width="60" height="52" rx="14" fill="#27476C" stroke="#7DD3FC"/>
      <circle cx="64" cy="54" r="14" fill="#E2E8F0"/>
      <rect x="34" y="92" width="60" height="8" rx="4" fill="#F8FAFC"/>
      <rect x="42" y="108" width="44" height="12" rx="6" fill="#F4D58D"/>
      <rect x="34" y="130" width="56" height="6" rx="3" fill="#BFDBFE"/>
      <rect x="34" y="142" width="46" height="6" rx="3" fill="#94A3B8"/>
      <rect x="122" y="20" width="180" height="52" rx="16" fill="white" stroke="#CBD5E1"/>
      <rect x="138" y="34" width="104" height="8" rx="4" fill="#0F172A"/>
      <rect x="138" y="48" width="132" height="6" rx="3" fill="#64748B"/>
      <rect x="122" y="84" width="180" height="80" rx="16" fill="white" stroke="#CBD5E1"/>
      <rect x="138" y="98" width="74" height="8" rx="4" fill="#2563EB"/>
      <rect x="138" y="116" width="134" height="6" rx="3" fill="#334155"/>
      <rect x="138" y="128" width="126" height="6" rx="3" fill="#334155"/>
      <rect x="138" y="140" width="118" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "quote-callout": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="26" y="42" width="268" height="96" rx="18" fill="#0F172A" fill-opacity=".92"/>
      <circle cx="58" cy="74" r="14" fill="#C084FC"/>
      <rect x="82" y="62" width="154" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="78" width="170" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="94" width="132" height="10" rx="5" fill="#F8FAFC"/>
      <rect x="82" y="114" width="82" height="16" rx="8" fill="#EDE9FE"/>
      <rect x="186" y="118" width="76" height="6" rx="3" fill="#A855F7"/>
    </svg>
  `,
  "video-spotlight": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="34" y="34" width="72" height="16" rx="8" fill="#082F49"/>
      <rect x="44" y="39" width="52" height="6" rx="3" fill="#E0F2FE"/>
      <rect x="34" y="62" width="118" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="78" width="132" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="98" width="110" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="110" width="100" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="126" width="120" height="24" rx="10" fill="#EFF6FF" stroke="#93C5FD"/>
      <rect x="184" y="34" width="100" height="116" rx="14" fill="#0F172A"/>
      <polygon points="224,76 224,108 252,92" fill="#38BDF8"/>
    </svg>
  `,
  "poster-spotlight": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#EFF6FF"/>
      <rect x="16" y="16" width="288" height="148" rx="18" fill="#F8FAFC" stroke="#93C5FD"/>
      <rect x="34" y="32" width="84" height="16" rx="8" fill="#0F766E"/>
      <rect x="46" y="37" width="60" height="6" rx="3" fill="#ECFEFF"/>
      <rect x="34" y="60" width="122" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="76" width="130" height="10" rx="5" fill="#0F172A"/>
      <rect x="34" y="96" width="110" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="108" width="96" height="6" rx="3" fill="#64748B"/>
      <rect x="34" y="126" width="116" height="20" rx="10" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="34" y="152" width="92" height="12" rx="6" fill="#2563EB"/>
      <rect x="190" y="26" width="98" height="128" rx="14" fill="#0F172A"/>
      <rect x="204" y="40" width="70" height="96" rx="10" fill="#38BDF8" fill-opacity=".45"/>
      <rect x="214" y="146" width="50" height="4" rx="2" fill="#E0F2FE"/>
    </svg>
  `,
  "framed-image-story": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="106" height="102" rx="12" fill="#E2E8F0" stroke="#64748B"/>
      <rect x="40" y="40" width="86" height="82" rx="8" fill="#CBD5E1"/>
      <rect x="30" y="140" width="106" height="12" rx="6" fill="#0F172A"/>
      <rect x="164" y="30" width="72" height="16" rx="8" fill="#EDE9FE"/>
      <rect x="176" y="35" width="48" height="6" rx="3" fill="#7C3AED"/>
      <rect x="164" y="56" width="108" height="9" rx="4.5" fill="#0F172A"/>
      <rect x="164" y="71" width="120" height="9" rx="4.5" fill="#0F172A"/>
      <rect x="164" y="90" width="112" height="6" rx="3" fill="#64748B"/>
      <rect x="164" y="102" width="104" height="6" rx="3" fill="#64748B"/>
      <rect x="164" y="126" width="116" height="28" rx="12" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="178" y="136" width="86" height="6" rx="3" fill="#334155"/>
      <rect x="178" y="146" width="78" height="6" rx="3" fill="#334155"/>
    </svg>
  `,
  "photo-collage": `
    <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect width="320" height="180" rx="18" fill="#F8FAFC"/>
      <rect x="18" y="18" width="284" height="144" rx="18" fill="#FFFFFF" stroke="#CBD5E1"/>
      <rect x="30" y="30" width="80" height="16" rx="8" fill="#DBEAFE"/>
      <rect x="42" y="35" width="56" height="6" rx="3" fill="#2563EB"/>
      <rect x="30" y="56" width="154" height="84" rx="14" fill="#CBD5E1" stroke="#64748B"/>
      <rect x="194" y="38" width="92" height="66" rx="12" fill="#E9D5FF" stroke="#8B5CF6"/>
      <rect x="194" y="116" width="92" height="18" rx="9" fill="#0F172A"/>
      <rect x="46" y="146" width="148" height="8" rx="4" fill="#0F172A"/>
      <rect x="194" y="146" width="82" height="6" rx="3" fill="#64748B"/>
    </svg>
  `,
};

export const BUILT_IN_PRESENTATION_COMPONENTS: readonly BuiltInPresentationComponentDefinition[] = [
  {
    id: "process-steps",
    label: "Process Steps",
    category: "Process",
    description: "Stacked cards for tutorials, SOPs, or explainers.",
    accentColor: "#f59e0b",
    previewSvg: COMPONENT_PREVIEWS["process-steps"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["process-steps"],
  },
  {
    id: "timeline-flow",
    label: "Timeline Flow",
    category: "Process",
    description: "Milestone timeline for roadmaps, phase plans, and chronological stories.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["timeline-flow"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["timeline-flow"],
  },
  {
    id: "feature-highlights",
    label: "Feature Highlights",
    category: "Marketing",
    description: "Three-column value props with icons and supporting copy.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["feature-highlights"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["feature-highlights"],
  },
  {
    id: "infographic-grid",
    label: "Infographic Grid",
    category: "Data",
    description: "Four-cell framework layout for comparisons, pillars, and balanced explainers.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["infographic-grid"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["infographic-grid"],
  },
  {
    id: "stat-cards",
    label: "Stat Cards",
    category: "Data",
    description: "Three up metric cards for KPIs, campaign numbers, or proof points.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["stat-cards"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["stat-cards"],
  },
  {
    id: "sectioned-explainer",
    label: "Sectioned Explainer",
    category: "Long-form",
    description: "Text-heavy explanatory board for dense multi-section slides that still need editable structure.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["sectioned-explainer"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["sectioned-explainer"],
  },
  {
    id: "profile-summary",
    label: "Profile Summary",
    category: "Profile",
    description: "Speaker, team member, or resume-style intro block with editable portrait slot.",
    accentColor: "#334155",
    previewSvg: COMPONENT_PREVIEWS["profile-summary"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["profile-summary"],
  },
  {
    id: "quote-callout",
    label: "Quote Callout",
    category: "Storytelling",
    description: "Editorial pull-quote with attribution and accent line.",
    accentColor: "#8b5cf6",
    previewSvg: COMPONENT_PREVIEWS["quote-callout"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["quote-callout"],
  },
  {
    id: "video-spotlight",
    label: "Video Spotlight",
    category: "Storytelling",
    description: "Headline plus autoplay-ready video slot for promos, demos, or motion-led slides.",
    accentColor: "#0ea5e9",
    previewSvg: COMPONENT_PREVIEWS["video-spotlight"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["video-spotlight"],
  },
  {
    id: "poster-spotlight",
    label: "Poster Spotlight",
    category: "Marketing",
    description: "Campaign-style hero block with one dominant image, short benefits, and a CTA.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["poster-spotlight"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["poster-spotlight"],
  },
  {
    id: "framed-image-story",
    label: "Framed Image Story",
    category: "Storytelling",
    description: "Editorial image-and-copy block with framed photo, caption, and narrative highlights.",
    accentColor: "#7c3aed",
    previewSvg: COMPONENT_PREVIEWS["framed-image-story"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["framed-image-story"],
  },
  {
    id: "photo-collage",
    label: "Photo Collage",
    category: "Storytelling",
    description: "Two-photo editorial collage with narrative copy and a supporting caption.",
    accentColor: "#2563eb",
    previewSvg: COMPONENT_PREVIEWS["photo-collage"],
    slotDefinitions: COMPONENT_SLOT_DEFINITIONS["photo-collage"],
  },
] as const;

export function getBuiltInPresentationComponentDefinition(
  componentId: string,
): BuiltInPresentationComponentDefinition | null {
  return BUILT_IN_PRESENTATION_COMPONENTS.find((component) => component.id === componentId) ?? null;
}

export function buildBuiltInPresentationComponentInstance(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions,
): PresentationComponentInstance {
  const slotBindings = defaultSlotBindingsFor(componentId);
  return {
    id: options.instanceId,
    componentId,
    componentType: componentId,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    slotBindings,
    fallbackElements: buildFallbackElementsForComponent(componentId, options, slotBindings),
  };
}

export function buildBuiltInPresentationComponentInstanceFromSlotBindings(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions & {
    slotBindings: PresentationComponentSlotBinding[];
  },
): PresentationComponentInstance {
  const slotBindings = options.slotBindings.map(cloneSlotBinding);
  return {
    id: options.instanceId,
    componentId,
    componentType: componentId,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    slotBindings,
    fallbackElements: buildFallbackElementsForComponent(componentId, options, slotBindings),
  };
}

export function rebuildBuiltInPresentationComponentInstance(
  component: PresentationComponentInstance,
  canvas: PresentationCanvasSize,
): PresentationComponentInstance {
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  if (!definition) {
    return component;
  }

  const rebuiltFallbackElements = buildFallbackElementsForComponent(definition.id, {
    canvas,
    instanceId: component.id,
  }, component.slotBindings);
  const previousById = new Map(component.fallbackElements.map((element) => [element.id, element] as const));

  return {
    ...component,
    definitionRevision: BUILT_IN_COMPONENT_REVISION,
    fallbackElements: rebuiltFallbackElements.map((element) => {
      const previous = previousById.get(element.id);
      if (!previous) {
        return element;
      }
      return {
        ...element,
        x: previous.x,
        y: previous.y,
        width: previous.width,
        height: previous.height,
        rotation: previous.rotation,
      };
    }),
  };
}

export function buildBuiltInPresentationComponentInstanceFromNarrative(
  componentId: BuiltInPresentationComponentId,
  options: BuildComponentInstanceOptions & {
    narrative: PresentationRecipeNarrativeInput;
  },
): PresentationComponentInstance {
  return buildBuiltInPresentationComponentInstanceFromSlotBindings(componentId, {
    ...options,
    slotBindings: buildPresentationComponentRecipeSlotBindings(componentId, options.narrative),
  });
}

export function getPresentationComponentCanvasSlotAreas(
  component: PresentationComponentInstance,
): PresentationComponentCanvasSlotArea[] {
  const definition = getBuiltInPresentationComponentDefinition(component.componentId);
  if (!definition) {
    return [];
  }

  const slotTargets = PRESENTATION_COMPONENT_SLOT_TARGETS[definition.id];
  const fallbackBySuffix = new Map(
    component.fallbackElements.map((element) => [getComponentElementSuffix(element.id), element] as const),
  );

  return definition.slotDefinitions.flatMap((slot) => {
    const suffixes = slotTargets[slot.id] ?? [];
    const matched = suffixes
      .map((suffix) => fallbackBySuffix.get(suffix))
      .filter((element): element is PresentationSlideElement => Boolean(element));
    const bounds = unionElementBounds(matched);
    if (!bounds) {
      return [];
    }
    return [{
      slotId: slot.id,
      label: slot.label,
      type: slot.type,
      multiline: slot.type === "text" ? slot.multiline : undefined,
      bounds,
    }];
  });
}
