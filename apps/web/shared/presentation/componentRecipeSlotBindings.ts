import type {
  PresentationComponentSlotBinding,
} from "./contracts";
import type { BuiltInPresentationComponentId } from "./componentRecipes";

export interface PresentationRecipeNarrativeSection {
  heading: string;
  details: string[];
}

export interface PresentationRecipeNarrativeInput {
  title: string;
  body: string[];
  notes?: string | null;
  sections?: PresentationRecipeNarrativeSection[];
  graphicCategory?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: Array<string | null>;
}

function clampListItems(items: string[], maxItems: number): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= maxItems) {
      break;
    }
  }
  return unique;
}

function resolveIndexedDetailFallback(
  input: PresentationRecipeNarrativeInput,
  sections: PresentationRecipeNarrativeSection[],
  body: string[],
  index: number,
): string {
  const candidates = [
    sections[index]?.details?.[0],
    body[(index * 2) + 1],
    body[index + 1],
    ...body.filter((line, bodyIndex) => bodyIndex !== (index * 2)),
    input.notes ?? "",
    body[0] ?? "",
  ];
  return candidates.find((value) => value?.trim())?.trim() ?? "";
}

function resolveCompactLeadText(
  input: PresentationRecipeNarrativeInput,
  sections: PresentationRecipeNarrativeSection[],
  body: string[],
  maxChars: number,
): string {
  const candidates = [
    sections[0]?.details?.[0],
    body[0],
    body[1],
    sections[1]?.details?.[0],
    input.notes ?? "",
  ];
  const picked = candidates.find((value) => value?.trim())?.trim() ?? "";
  return picked.slice(0, maxChars);
}

function createProfileSummarySlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const highlightItems = clampListItems([
    ...sections.flatMap((section) => [
      section.heading,
      ...section.details,
    ]),
    ...body,
  ], 4);
  const contactItems = clampListItems(
    sections[0]?.details?.length ? sections[0].details : body.slice(0, 3),
    3,
  );
  const role = sections[0]?.heading
    ?? body[0]
    ?? input.graphicCategory
    ?? "";

  return [
    { slotId: "portrait", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Portrait" },
    { slotId: "name", type: "text", text: input.title.slice(0, 200) },
    { slotId: "role", type: "text", text: role.slice(0, 200) },
    { slotId: "contact-title", type: "text", text: sections[0]?.heading?.slice(0, 180) || "Key facts" },
    { slotId: "contact-items", type: "list", items: contactItems },
    { slotId: "about-title", type: "text", text: sections[1]?.heading?.slice(0, 180) || "About" },
    { slotId: "about-body", type: "text", text: (input.notes || body.join(" ")).slice(0, 800) },
    { slotId: "highlights-title", type: "text", text: sections[2]?.heading?.slice(0, 180) || "Highlights" },
    { slotId: "highlights-items", type: "list", items: highlightItems },
  ];
}

function createVideoSpotlightSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const body = clampListItems(input.body, 5);
  const sections = input.sections ?? [];
  const benefits = clampListItems([
    ...sections.flatMap((section) => section.details),
    ...body,
  ], 4);

  return [
    { slotId: "tag", type: "text", text: (sections[0]?.heading || input.graphicCategory || "").slice(0, 80) },
    { slotId: "headline", type: "text", text: input.title.slice(0, 200) },
    { slotId: "body", type: "text", text: (body[0] || input.notes || "").slice(0, 800) },
    { slotId: "clip", type: "video", src: input.mediaUrl ?? "", poster: "", title: input.title.slice(0, 200) || "Promo clip" },
    { slotId: "benefits", type: "list", items: benefits },
  ];
}

function createPosterSpotlightSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const benefits = clampListItems([
    ...sections.flatMap((section) => section.details),
    ...body,
  ], 4);

  return [
    { slotId: "eyebrow", type: "text", text: (sections[0]?.heading || input.graphicCategory || "").slice(0, 80) },
    { slotId: "headline", type: "text", text: input.title.slice(0, 200) },
    { slotId: "subhead", type: "text", text: (input.notes || body[0] || "").slice(0, 800) },
    { slotId: "hero", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Hero visual" },
    { slotId: "benefits", type: "list", items: benefits },
    { slotId: "cta", type: "text", text: (body.at(-1) || sections.at(-1)?.heading || "Learn more").slice(0, 120) },
  ];
}

function createProcessStepsSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 9);
  const resolveStep = (index: number) => {
    const section = sections[index];
    const title = section?.heading || body[index * 2] || `Step ${index + 1}`;
    const detail = resolveIndexedDetailFallback(input, sections, body, index);
    return { title, detail };
  };
  const step1 = resolveStep(0);
  const step2 = resolveStep(1);
  const step3 = resolveStep(2);

  return [
    { slotId: "title", type: "text", text: input.title.slice(0, 200) },
    { slotId: "subtitle", type: "text", text: resolveCompactLeadText(input, sections, body, 180) },
    { slotId: "step1-label", type: "text", text: "Step 01" },
    { slotId: "step1-title", type: "text", text: step1.title.slice(0, 180) },
    { slotId: "step1-body", type: "text", text: step1.detail.slice(0, 260) },
    { slotId: "step2-label", type: "text", text: "Step 02" },
    { slotId: "step2-title", type: "text", text: step2.title.slice(0, 180) },
    { slotId: "step2-body", type: "text", text: step2.detail.slice(0, 260) },
    { slotId: "step3-label", type: "text", text: "Step 03" },
    { slotId: "step3-title", type: "text", text: step3.title.slice(0, 180) },
    { slotId: "step3-body", type: "text", text: step3.detail.slice(0, 260) },
  ];
}

function createTimelineFlowSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 9);
  const resolveMilestone = (index: number) => {
    const section = sections[index];
    const title = section?.heading || body[index * 2] || `Milestone ${index + 1}`;
    const detail = resolveIndexedDetailFallback(input, sections, body, index);
    const date = section?.details?.[1] || `Phase ${index + 1}`;
    return { title, detail, date };
  };
  const first = resolveMilestone(0);
  const second = resolveMilestone(1);
  const third = resolveMilestone(2);

  return [
    { slotId: "eyebrow", type: "text", text: (input.graphicCategory || sections[0]?.heading || "Timeline").slice(0, 80) },
    { slotId: "title", type: "text", text: input.title.slice(0, 200) },
    { slotId: "subtitle", type: "text", text: resolveCompactLeadText(input, sections, body, 180) },
    { slotId: "milestone1-date", type: "text", text: first.date.slice(0, 80) },
    { slotId: "milestone1-title", type: "text", text: first.title.slice(0, 180) },
    { slotId: "milestone1-body", type: "text", text: first.detail.slice(0, 260) },
    { slotId: "milestone2-date", type: "text", text: second.date.slice(0, 80) },
    { slotId: "milestone2-title", type: "text", text: second.title.slice(0, 180) },
    { slotId: "milestone2-body", type: "text", text: second.detail.slice(0, 260) },
    { slotId: "milestone3-date", type: "text", text: third.date.slice(0, 80) },
    { slotId: "milestone3-title", type: "text", text: third.title.slice(0, 180) },
    { slotId: "milestone3-body", type: "text", text: third.detail.slice(0, 260) },
  ];
}

function createFeatureHighlightsSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const resolveFeature = (index: number) => {
    const section = sections[index];
    const title = section?.heading || body[index * 2] || `Highlight ${index + 1}`;
    const detail = resolveIndexedDetailFallback(input, sections, body, index);
    return { title, detail };
  };
  const first = resolveFeature(0);
  const second = resolveFeature(1);
  const third = resolveFeature(2);

  return [
    { slotId: "badge", type: "text", text: (input.graphicCategory || "").slice(0, 80) },
    { slotId: "title", type: "text", text: input.title.slice(0, 200) },
    { slotId: "feature1-title", type: "text", text: first.title.slice(0, 180) },
    { slotId: "feature1-body", type: "text", text: first.detail.slice(0, 260) },
    { slotId: "feature2-title", type: "text", text: second.title.slice(0, 180) },
    { slotId: "feature2-body", type: "text", text: second.detail.slice(0, 260) },
    { slotId: "feature3-title", type: "text", text: third.title.slice(0, 180) },
    { slotId: "feature3-body", type: "text", text: third.detail.slice(0, 260) },
  ];
}

function createInfographicGridSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const resolveItem = (index: number) => {
    const section = sections[index];
    const title = section?.heading || body[index * 2] || `Block ${index + 1}`;
    const detail = resolveIndexedDetailFallback(input, sections, body, index);
    return { title, detail };
  };
  const first = resolveItem(0);
  const second = resolveItem(1);
  const third = resolveItem(2);
  const fourth = resolveItem(3);

  return [
    { slotId: "eyebrow", type: "text", text: (input.graphicCategory || "Infographic").slice(0, 80) },
    { slotId: "title", type: "text", text: input.title.slice(0, 200) },
    { slotId: "summary", type: "text", text: resolveCompactLeadText(input, sections, body, 180) },
    { slotId: "item1-title", type: "text", text: first.title.slice(0, 180) },
    { slotId: "item1-body", type: "text", text: first.detail.slice(0, 220) },
    { slotId: "item2-title", type: "text", text: second.title.slice(0, 180) },
    { slotId: "item2-body", type: "text", text: second.detail.slice(0, 220) },
    { slotId: "item3-title", type: "text", text: third.title.slice(0, 180) },
    { slotId: "item3-body", type: "text", text: third.detail.slice(0, 220) },
    { slotId: "item4-title", type: "text", text: fourth.title.slice(0, 180) },
    { slotId: "item4-body", type: "text", text: fourth.detail.slice(0, 220) },
  ];
}

function splitStatLine(line: string, fallbackIndex: number): { value: string; label: string } {
  const trimmed = line.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    return {
      value: trimmed.slice(0, colonIndex).trim().slice(0, 40) || `Metric ${fallbackIndex + 1}`,
      label: trimmed.slice(colonIndex + 1).trim().slice(0, 120) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  const dashMatch = trimmed.match(/^(.+?)\s+[—-]\s+(.+)$/);
  if (dashMatch) {
    return {
      value: dashMatch[1].trim().slice(0, 40) || `Metric ${fallbackIndex + 1}`,
      label: dashMatch[2].trim().slice(0, 120) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  const valueMatch = trimmed.match(/^([\d.,%+xXkKmM/]+)\s+(.+)$/);
  if (valueMatch) {
    return {
      value: valueMatch[1].trim().slice(0, 40),
      label: valueMatch[2].trim().slice(0, 120) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  return {
    value: trimmed.slice(0, 40) || `Metric ${fallbackIndex + 1}`,
    label: `Key metric ${fallbackIndex + 1}`,
  };
}

function createStatCardsSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const candidateLines = clampListItems([
    ...input.body,
    ...(input.sections ?? []).flatMap((section) => section.details),
  ], 6);
  const [first, second, third] = [0, 1, 2].map((index) => splitStatLine(candidateLines[index] || "", index));

  return [
    { slotId: "eyebrow", type: "text", text: (input.graphicCategory || input.sections?.[0]?.heading || "").slice(0, 80) },
    { slotId: "title", type: "text", text: input.title.slice(0, 200) },
    { slotId: "stat1-value", type: "text", text: first.value },
    { slotId: "stat1-label", type: "text", text: first.label },
    { slotId: "stat2-value", type: "text", text: second.value },
    { slotId: "stat2-label", type: "text", text: second.label },
    { slotId: "stat3-value", type: "text", text: third.value },
    { slotId: "stat3-label", type: "text", text: third.label },
  ];
}

function createQuoteCalloutSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 4);
  return [
    { slotId: "quote", type: "text", text: (body[0] || input.notes || input.title).slice(0, 320) },
    { slotId: "eyebrow", type: "text", text: (sections[0]?.heading || input.graphicCategory || "").slice(0, 80) },
    { slotId: "attribution", type: "text", text: (body[1] || input.title).slice(0, 200) },
  ];
}

function createFramedImageStorySlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const highlights = clampListItems([
    ...sections.flatMap((section) => section.details),
    ...body.slice(1),
  ], 4);

  return [
    { slotId: "kicker", type: "text", text: (sections[0]?.heading || input.graphicCategory || "").slice(0, 80) },
    { slotId: "headline", type: "text", text: input.title.slice(0, 200) },
    { slotId: "story", type: "text", text: (input.notes || body.slice(0, 2).join(" ")).slice(0, 900) },
    { slotId: "photo", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Story image" },
    { slotId: "caption", type: "text", text: (body[0] || sections[1]?.heading || input.graphicCategory || "").slice(0, 160) },
    { slotId: "highlights", type: "list", items: highlights },
  ];
}

function createPhotoCollageSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const [primaryMediaUrl, secondaryMediaUrl] = [
    input.mediaUrls?.[0] ?? input.mediaUrl ?? "",
    input.mediaUrls?.[1] ?? input.mediaUrls?.[0] ?? input.mediaUrl ?? "",
  ];

  return [
    { slotId: "kicker", type: "text", text: (sections[0]?.heading || input.graphicCategory || "").slice(0, 80) },
    { slotId: "headline", type: "text", text: input.title.slice(0, 200) },
    { slotId: "body", type: "text", text: (input.notes || body.slice(0, 2).join(" ")).slice(0, 900) },
    { slotId: "primary-photo", type: "image", src: primaryMediaUrl, alt: input.title.slice(0, 512) || "Primary photo" },
    { slotId: "secondary-photo", type: "image", src: secondaryMediaUrl, alt: input.title.slice(0, 512) || "Secondary photo" },
    { slotId: "caption", type: "text", text: (body[0] || sections[1]?.heading || input.graphicCategory || "").slice(0, 160) },
  ];
}

export function buildPresentationComponentRecipeSlotBindings(
  componentId: BuiltInPresentationComponentId,
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  switch (componentId) {
    case "process-steps":
      return createProcessStepsSlotBindings(input);
    case "timeline-flow":
      return createTimelineFlowSlotBindings(input);
    case "feature-highlights":
      return createFeatureHighlightsSlotBindings(input);
    case "infographic-grid":
      return createInfographicGridSlotBindings(input);
    case "stat-cards":
      return createStatCardsSlotBindings(input);
    case "profile-summary":
      return createProfileSummarySlotBindings(input);
    case "quote-callout":
      return createQuoteCalloutSlotBindings(input);
    case "video-spotlight":
      return createVideoSpotlightSlotBindings(input);
    case "poster-spotlight":
      return createPosterSpotlightSlotBindings(input);
    case "framed-image-story":
      return createFramedImageStorySlotBindings(input);
    case "photo-collage":
      return createPhotoCollageSlotBindings(input);
  }
}
