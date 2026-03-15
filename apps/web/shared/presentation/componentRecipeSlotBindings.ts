import type {
  PresentationComponentSlotBinding,
} from "./contracts";
import {
  clampPresentationTextToUnits,
  getPresentationComponentSlotBudget,
  measurePresentationTextUnits,
  type BuiltInPresentationComponentId,
} from "./componentRecipes";

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

function budgetFor(componentId: BuiltInPresentationComponentId, slotId: string): { maxChars?: number; maxItems?: number } {
  return getPresentationComponentSlotBudget(componentId, slotId);
}

function clampTextToBudget(componentId: BuiltInPresentationComponentId, slotId: string, value: string): string {
  const normalized = value.trim();
  const maxChars = budgetFor(componentId, slotId).maxChars;
  if (!maxChars) {
    return normalized;
  }
  return clampPresentationTextToUnits(normalized, maxChars);
}

function clampListSlotItems(
  componentId: BuiltInPresentationComponentId,
  slotId: string,
  items: string[],
): string[] {
  const maxItems = budgetFor(componentId, slotId).maxItems;
  const clamped = items
    .map((item) => clampTextToBudget(componentId, slotId, item))
    .filter(Boolean);
  return typeof maxItems === "number" ? clamped.slice(0, maxItems) : clamped;
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
  return clampPresentationTextToUnits(picked, maxChars);
}

function normalizeNarrativeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildUniqueNarrativeCandidates(
  input: PresentationRecipeNarrativeInput,
  sections: PresentationRecipeNarrativeSection[],
  body: string[],
): string[] {
  const blocked = new Set<string>([
    normalizeNarrativeKey(input.title),
    ...sections.map((section) => normalizeNarrativeKey(section.heading)),
  ]);
  const rawNoteLines = String(input.notes ?? "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  const candidates = [
    ...body,
    ...sections.flatMap((section) => section.details),
    ...rawNoteLines,
  ];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    const key = normalizeNarrativeKey(normalized);
    if (!normalized || seen.has(key) || blocked.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
  }
  return unique;
}

function resolveCompactStoryText(
  input: PresentationRecipeNarrativeInput,
  sections: PresentationRecipeNarrativeSection[],
  body: string[],
  maxChars: number,
): string {
  const candidates = buildUniqueNarrativeCandidates(input, sections, body);
  const parts: string[] = [];
  let total = 0;
  for (const candidate of candidates) {
    const candidateUnits = measurePresentationTextUnits(candidate);
    const joinerUnits = parts.length > 0 ? measurePresentationTextUnits(" ") : 0;
    const nextLength = total + candidateUnits + joinerUnits;
    if (nextLength > maxChars) {
      break;
    }
    parts.push(candidate);
    total = nextLength;
    if (parts.length >= 3) {
      break;
    }
  }
  return clampPresentationTextToUnits(parts.join(" "), maxChars);
}

function resolveCaptionText(
  input: PresentationRecipeNarrativeInput,
  sections: PresentationRecipeNarrativeSection[],
  body: string[],
): string {
  const titleKey = normalizeNarrativeKey(input.title);
  const candidates = [
    sections[1]?.heading,
    sections[0]?.details?.[0],
    body[0],
    input.graphicCategory,
  ];
  const picked = candidates.find((value) => {
    const normalized = normalizeNarrativeKey(value);
    return normalized.length > 0 && normalized !== titleKey;
  })?.trim() ?? "";
  return clampPresentationTextToUnits(picked, 120);
}

function looksLikeQuestion(text: string): boolean {
  const normalized = normalizeNarrativeKey(text);
  return normalized.endsWith("?")
    || normalized.includes("คำถาม")
    || normalized.includes("ถาม")
    || normalized.startsWith("how ")
    || normalized.startsWith("what ")
    || normalized.startsWith("why ")
    || normalized.startsWith("when ")
    || normalized.startsWith("who ")
    || normalized.startsWith("where ")
    || normalized.startsWith("should ")
    || normalized.startsWith("can ");
}

function ensureQuestionText(text: string, fallbackIndex: number): string {
  const normalized = text.trim();
  if (!normalized) {
    return `Question ${fallbackIndex + 1}`;
  }
  if (looksLikeQuestion(normalized)) {
    return normalized;
  }
  return `${normalized}?`;
}

function extractTimelineMarker(text: string, fallbackIndex: number): string {
  const normalized = text.trim();
  if (!normalized) {
    return `Phase ${fallbackIndex + 1}`;
  }
  const match = normalized.match(/\b(?:q[1-4]\s*\d{0,4}|20\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|phase\s+\d+|step\s+\d+)\b/i);
  return match?.[0]?.trim() || `Phase ${fallbackIndex + 1}`;
}

function stripTimelineMarker(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    return normalized;
  }
  return normalized
    .replace(/^\s*(?:q[1-4]\s*\d{0,4}|20\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|phase\s+\d+|step\s+\d+)\s*[:\-–]?\s*/i, "")
    .trim();
}

function createSectionedExplainerSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const narrativeCandidates = buildUniqueNarrativeCandidates(input, sections, body);
  const bodyIntro = body.slice(0, 2).join(" ");
  const introText = clampTextToBudget(
    "sectioned-explainer",
    "intro",
    input.notes?.trim() || bodyIntro || narrativeCandidates[0] || "",
  );
  const resolveSection = (index: number) => {
    const section = sections[index];
    const heading = clampTextToBudget(
      "sectioned-explainer",
      `section${index + 1}-heading`,
      section?.heading || body[index] || `Section ${index + 1}`,
    );
    const detailSource = section?.details?.join(" ") || narrativeCandidates[index + 1] || body[index + 1] || "";
    const detail = clampTextToBudget(
      "sectioned-explainer",
      `section${index + 1}-body`,
      detailSource,
    );
    return { heading, detail };
  };
  const section1 = resolveSection(0);
  const section2 = resolveSection(1);
  const section3 = resolveSection(2);
  const takeawayCandidates = clampListItems([
    ...body,
    ...sections.flatMap((section) => section.details),
  ], budgetFor("sectioned-explainer", "takeaways").maxItems ?? 4)
    .filter((line) => ![
      section1.detail,
      section2.detail,
      section3.detail,
    ].includes(line.trim()))
    .map((line) => clampTextToBudget("sectioned-explainer", "takeaways", line));

  return [
    {
      slotId: "eyebrow",
      type: "text",
      text: clampTextToBudget("sectioned-explainer", "eyebrow", sections[0]?.heading || input.graphicCategory || "Explainer"),
    },
    { slotId: "title", type: "text", text: clampTextToBudget("sectioned-explainer", "title", input.title) },
    { slotId: "hero", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Hero visual" },
    { slotId: "intro", type: "text", text: introText },
    { slotId: "section1-heading", type: "text", text: section1.heading },
    { slotId: "section1-body", type: "text", text: section1.detail },
    { slotId: "section2-heading", type: "text", text: section2.heading },
    { slotId: "section2-body", type: "text", text: section2.detail },
    { slotId: "section3-heading", type: "text", text: section3.heading },
    { slotId: "section3-body", type: "text", text: section3.detail },
    { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
    { slotId: "takeaways", type: "list", items: clampListSlotItems("sectioned-explainer", "takeaways", takeawayCandidates) },
  ];
}

function createTimelineReportSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const narrativeCandidates = buildUniqueNarrativeCandidates(input, sections, body);
  const resolvePhase = (index: number) => {
    const section = sections[index];
    const headingSource = section?.heading?.trim() || body[index] || `Phase ${index + 1}`;
    const date = clampTextToBudget(
      "timeline-report",
      `phase${index + 1}-date`,
      extractTimelineMarker([
        section?.heading,
        body[index],
        body[index + 1],
        section?.details?.[0],
      ].find((value) => value?.trim()) || "", index),
    );
    const cleanedHeading = stripTimelineMarker(headingSource);
    const title = clampTextToBudget(
      "timeline-report",
      `phase${index + 1}-title`,
      cleanedHeading || `Phase ${index + 1}`,
    );
    const detailSource = [
      section?.details?.join(" "),
      narrativeCandidates[index + 1],
      resolveIndexedDetailFallback(input, sections, body, index),
    ].find((value) => value?.trim()) || "";
    const detail = clampTextToBudget(
      "timeline-report",
      `phase${index + 1}-body`,
      detailSource,
    );
    return { date, title, detail };
  };

  const phase1 = resolvePhase(0);
  const phase2 = resolvePhase(1);
  const phase3 = resolvePhase(2);
  const nextSteps = clampListItems([
    ...body,
    ...sections.flatMap((section) => section.details),
    ...(input.notes ? input.notes.split(/\n+/) : []),
  ], budgetFor("timeline-report", "next-steps").maxItems ?? 4)
    .filter((line) => ![
      phase1.detail,
      phase2.detail,
      phase3.detail,
    ].includes(line.trim()))
    .map((line) => clampTextToBudget("timeline-report", "next-steps", line));

  return [
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("timeline-report", "eyebrow", input.graphicCategory || "Timeline Report") },
    { slotId: "title", type: "text", text: clampTextToBudget("timeline-report", "title", input.title) },
    {
      slotId: "summary",
      type: "text",
      text: clampTextToBudget(
        "timeline-report",
        "summary",
        input.notes?.trim() || body.slice(0, 2).join(" ") || narrativeCandidates[0] || "",
      ),
    },
    { slotId: "phase1-date", type: "text", text: phase1.date },
    { slotId: "phase1-title", type: "text", text: phase1.title },
    { slotId: "phase1-body", type: "text", text: phase1.detail },
    { slotId: "phase2-date", type: "text", text: phase2.date },
    { slotId: "phase2-title", type: "text", text: phase2.title },
    { slotId: "phase2-body", type: "text", text: phase2.detail },
    { slotId: "phase3-date", type: "text", text: phase3.date },
    { slotId: "phase3-title", type: "text", text: phase3.title },
    { slotId: "phase3-body", type: "text", text: phase3.detail },
    { slotId: "next-steps-title", type: "text", text: clampTextToBudget("timeline-report", "next-steps-title", "Next Steps") },
    {
      slotId: "next-steps",
      type: "list",
      items: clampListSlotItems("timeline-report", "next-steps", nextSteps),
    },
  ];
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
    { slotId: "name", type: "text", text: clampTextToBudget("profile-summary", "name", input.title) },
    { slotId: "role", type: "text", text: clampTextToBudget("profile-summary", "role", role) },
    { slotId: "contact-title", type: "text", text: clampTextToBudget("profile-summary", "contact-title", sections[0]?.heading || "Key facts") },
    { slotId: "contact-items", type: "list", items: clampListSlotItems("profile-summary", "contact-items", contactItems) },
    { slotId: "about-title", type: "text", text: clampTextToBudget("profile-summary", "about-title", sections[1]?.heading || "About") },
    { slotId: "about-body", type: "text", text: clampTextToBudget("profile-summary", "about-body", input.notes || body.join(" ")) },
    { slotId: "highlights-title", type: "text", text: clampTextToBudget("profile-summary", "highlights-title", sections[2]?.heading || "Highlights") },
    { slotId: "highlights-items", type: "list", items: clampListSlotItems("profile-summary", "highlights-items", highlightItems) },
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
    { slotId: "tag", type: "text", text: clampTextToBudget("video-spotlight", "tag", sections[0]?.heading || input.graphicCategory || "") },
    { slotId: "headline", type: "text", text: clampTextToBudget("video-spotlight", "headline", input.title) },
    { slotId: "body", type: "text", text: clampTextToBudget("video-spotlight", "body", body[0] || input.notes || "") },
    { slotId: "clip", type: "video", src: input.mediaUrl ?? "", poster: "", title: input.title.slice(0, 200) || "Promo clip" },
    { slotId: "benefits", type: "list", items: clampListSlotItems("video-spotlight", "benefits", benefits) },
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
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("poster-spotlight", "eyebrow", sections[0]?.heading || input.graphicCategory || "") },
    { slotId: "headline", type: "text", text: clampTextToBudget("poster-spotlight", "headline", input.title) },
    { slotId: "subhead", type: "text", text: clampTextToBudget("poster-spotlight", "subhead", input.notes || body[0] || "") },
    { slotId: "hero", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Hero visual" },
    { slotId: "benefits", type: "list", items: clampListSlotItems("poster-spotlight", "benefits", benefits) },
    { slotId: "cta", type: "text", text: clampTextToBudget("poster-spotlight", "cta", body.at(-1) || sections.at(-1)?.heading || "Learn more") },
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
    { slotId: "title", type: "text", text: clampTextToBudget("process-steps", "title", input.title) },
    { slotId: "subtitle", type: "text", text: clampTextToBudget("process-steps", "subtitle", resolveCompactLeadText(input, sections, body, 180)) },
    { slotId: "step1-label", type: "text", text: "Step 01" },
    { slotId: "step1-title", type: "text", text: clampTextToBudget("process-steps", "step1-title", step1.title) },
    { slotId: "step1-body", type: "text", text: clampTextToBudget("process-steps", "step1-body", step1.detail) },
    { slotId: "step2-label", type: "text", text: "Step 02" },
    { slotId: "step2-title", type: "text", text: clampTextToBudget("process-steps", "step2-title", step2.title) },
    { slotId: "step2-body", type: "text", text: clampTextToBudget("process-steps", "step2-body", step2.detail) },
    { slotId: "step3-label", type: "text", text: "Step 03" },
    { slotId: "step3-title", type: "text", text: clampTextToBudget("process-steps", "step3-title", step3.title) },
    { slotId: "step3-body", type: "text", text: clampTextToBudget("process-steps", "step3-body", step3.detail) },
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
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("timeline-flow", "eyebrow", input.graphicCategory || sections[0]?.heading || "Timeline") },
    { slotId: "title", type: "text", text: clampTextToBudget("timeline-flow", "title", input.title) },
    { slotId: "subtitle", type: "text", text: clampTextToBudget("timeline-flow", "subtitle", resolveCompactLeadText(input, sections, body, 180)) },
    { slotId: "milestone1-date", type: "text", text: clampTextToBudget("timeline-flow", "milestone1-date", first.date) },
    { slotId: "milestone1-title", type: "text", text: clampTextToBudget("timeline-flow", "milestone1-title", first.title) },
    { slotId: "milestone1-body", type: "text", text: clampTextToBudget("timeline-flow", "milestone1-body", first.detail) },
    { slotId: "milestone2-date", type: "text", text: clampTextToBudget("timeline-flow", "milestone2-date", second.date) },
    { slotId: "milestone2-title", type: "text", text: clampTextToBudget("timeline-flow", "milestone2-title", second.title) },
    { slotId: "milestone2-body", type: "text", text: clampTextToBudget("timeline-flow", "milestone2-body", second.detail) },
    { slotId: "milestone3-date", type: "text", text: clampTextToBudget("timeline-flow", "milestone3-date", third.date) },
    { slotId: "milestone3-title", type: "text", text: clampTextToBudget("timeline-flow", "milestone3-title", third.title) },
    { slotId: "milestone3-body", type: "text", text: clampTextToBudget("timeline-flow", "milestone3-body", third.detail) },
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
    { slotId: "badge", type: "text", text: clampTextToBudget("feature-highlights", "badge", input.graphicCategory || "") },
    { slotId: "title", type: "text", text: clampTextToBudget("feature-highlights", "title", input.title) },
    { slotId: "feature1-title", type: "text", text: clampTextToBudget("feature-highlights", "feature1-title", first.title) },
    { slotId: "feature1-body", type: "text", text: clampTextToBudget("feature-highlights", "feature1-body", first.detail) },
    { slotId: "feature2-title", type: "text", text: clampTextToBudget("feature-highlights", "feature2-title", second.title) },
    { slotId: "feature2-body", type: "text", text: clampTextToBudget("feature-highlights", "feature2-body", second.detail) },
    { slotId: "feature3-title", type: "text", text: clampTextToBudget("feature-highlights", "feature3-title", third.title) },
    { slotId: "feature3-body", type: "text", text: clampTextToBudget("feature-highlights", "feature3-body", third.detail) },
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
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("infographic-grid", "eyebrow", input.graphicCategory || "Infographic") },
    { slotId: "title", type: "text", text: clampTextToBudget("infographic-grid", "title", input.title) },
    { slotId: "summary", type: "text", text: clampTextToBudget("infographic-grid", "summary", resolveCompactLeadText(input, sections, body, 180)) },
    { slotId: "item1-title", type: "text", text: clampTextToBudget("infographic-grid", "item1-title", first.title) },
    { slotId: "item1-body", type: "text", text: clampTextToBudget("infographic-grid", "item1-body", first.detail) },
    { slotId: "item2-title", type: "text", text: clampTextToBudget("infographic-grid", "item2-title", second.title) },
    { slotId: "item2-body", type: "text", text: clampTextToBudget("infographic-grid", "item2-body", second.detail) },
    { slotId: "item3-title", type: "text", text: clampTextToBudget("infographic-grid", "item3-title", third.title) },
    { slotId: "item3-body", type: "text", text: clampTextToBudget("infographic-grid", "item3-body", third.detail) },
    { slotId: "item4-title", type: "text", text: clampTextToBudget("infographic-grid", "item4-title", fourth.title) },
    { slotId: "item4-body", type: "text", text: clampTextToBudget("infographic-grid", "item4-body", fourth.detail) },
  ];
}

function splitStatLine(line: string, fallbackIndex: number): { value: string; label: string } {
  const trimmed = line.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    return {
      value: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-value`, trimmed.slice(0, colonIndex).trim()) || `Metric ${fallbackIndex + 1}`,
      label: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-label`, trimmed.slice(colonIndex + 1).trim()) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  const dashMatch = trimmed.match(/^(.+?)\s+[—-]\s+(.+)$/);
  if (dashMatch) {
    return {
      value: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-value`, dashMatch[1].trim()) || `Metric ${fallbackIndex + 1}`,
      label: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-label`, dashMatch[2].trim()) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  const valueMatch = trimmed.match(/^([\d.,%+xXkKmM/]+)\s+(.+)$/);
  if (valueMatch) {
    return {
      value: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-value`, valueMatch[1].trim()),
      label: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-label`, valueMatch[2].trim()) || `Key metric ${fallbackIndex + 1}`,
    };
  }
  return {
    value: clampTextToBudget("stat-cards", `stat${fallbackIndex + 1}-value`, trimmed) || `Metric ${fallbackIndex + 1}`,
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
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("stat-cards", "eyebrow", input.graphicCategory || input.sections?.[0]?.heading || "") },
    { slotId: "title", type: "text", text: clampTextToBudget("stat-cards", "title", input.title) },
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
    { slotId: "quote", type: "text", text: clampTextToBudget("quote-callout", "quote", body[0] || input.notes || input.title) },
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("quote-callout", "eyebrow", sections[0]?.heading || input.graphicCategory || "") },
    { slotId: "attribution", type: "text", text: clampTextToBudget("quote-callout", "attribution", body[1] || input.title) },
  ];
}

function createFramedImageStorySlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const compactStory = resolveCompactStoryText(input, sections, body, 360);
  const highlights = clampListItems(
    buildUniqueNarrativeCandidates(input, sections, body).filter((line) => line !== compactStory).slice(0, 4),
    3,
  );

  return [
    { slotId: "kicker", type: "text", text: clampTextToBudget("framed-image-story", "kicker", sections[0]?.heading || input.graphicCategory || "") },
    { slotId: "headline", type: "text", text: clampTextToBudget("framed-image-story", "headline", input.title) },
    { slotId: "story", type: "text", text: clampTextToBudget("framed-image-story", "story", compactStory || resolveCompactLeadText(input, sections, body, 220)) },
    { slotId: "photo", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Story image" },
    { slotId: "caption", type: "text", text: clampTextToBudget("framed-image-story", "caption", resolveCaptionText(input, sections, body)) },
    { slotId: "highlights", type: "list", items: clampListSlotItems("framed-image-story", "highlights", highlights) },
  ];
}

function createPhotoCollageSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 6);
  const compactStory = resolveCompactStoryText(input, sections, body, 260);
  const [primaryMediaUrl, secondaryMediaUrl] = [
    input.mediaUrls?.[0] ?? input.mediaUrl ?? "",
    input.mediaUrls?.[1] ?? input.mediaUrls?.[0] ?? input.mediaUrl ?? "",
  ];

  return [
    { slotId: "kicker", type: "text", text: clampTextToBudget("photo-collage", "kicker", sections[0]?.heading || input.graphicCategory || "") },
    { slotId: "headline", type: "text", text: clampTextToBudget("photo-collage", "headline", input.title) },
    { slotId: "body", type: "text", text: clampTextToBudget("photo-collage", "body", compactStory || resolveCompactLeadText(input, sections, body, 180)) },
    { slotId: "primary-photo", type: "image", src: primaryMediaUrl, alt: input.title.slice(0, 512) || "Primary photo" },
    { slotId: "secondary-photo", type: "image", src: secondaryMediaUrl, alt: input.title.slice(0, 512) || "Secondary photo" },
    { slotId: "caption", type: "text", text: clampTextToBudget("photo-collage", "caption", resolveCaptionText(input, sections, body)) },
  ];
}

function createA4PhotoGridSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const summary = clampTextToBudget(
    "a4-photo-grid",
    "summary",
    resolveCompactStoryText(input, sections, body, 320)
    || resolveCompactLeadText(input, sections, body, 240),
  );
  const mediaUrls = Array.from({ length: 5 }, (_, index) => (
    input.mediaUrls?.[index]
    ?? input.mediaUrls?.[0]
    ?? input.mediaUrl
    ?? ""
  ));

  return [
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("a4-photo-grid", "eyebrow", sections[0]?.heading || input.graphicCategory || "Photo Board") },
    { slotId: "headline", type: "text", text: clampTextToBudget("a4-photo-grid", "headline", input.title) },
    { slotId: "summary", type: "text", text: summary },
    { slotId: "hero-photo", type: "image", src: mediaUrls[0] ?? "", alt: input.title.slice(0, 512) || "Hero photo" },
    { slotId: "detail-photo-1", type: "image", src: mediaUrls[1] ?? "", alt: input.title.slice(0, 512) || "Detail photo 1" },
    { slotId: "detail-photo-2", type: "image", src: mediaUrls[2] ?? "", alt: input.title.slice(0, 512) || "Detail photo 2" },
    { slotId: "detail-photo-3", type: "image", src: mediaUrls[3] ?? "", alt: input.title.slice(0, 512) || "Detail photo 3" },
    { slotId: "detail-photo-4", type: "image", src: mediaUrls[4] ?? "", alt: input.title.slice(0, 512) || "Detail photo 4" },
    { slotId: "caption", type: "text", text: clampTextToBudget("a4-photo-grid", "caption", resolveCaptionText(input, sections, body)) },
  ];
}

function createLandscapePhotoStorySlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const mediaUrls = Array.from({ length: 4 }, (_, index) => (
    input.mediaUrls?.[index]
    ?? input.mediaUrls?.[0]
    ?? input.mediaUrl
    ?? ""
  ));
  const highlightCandidates = clampListItems([
    ...sections.map((section) => section.heading),
    ...body.filter((line) => line.length <= 140),
  ], budgetFor("landscape-photo-story", "highlights").maxItems ?? 4);

  return [
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("landscape-photo-story", "eyebrow", input.graphicCategory || sections[0]?.heading || "Showcase") },
    { slotId: "headline", type: "text", text: clampTextToBudget("landscape-photo-story", "headline", input.title) },
    {
      slotId: "body",
      type: "text",
      text: clampTextToBudget(
        "landscape-photo-story",
        "body",
        resolveCompactStoryText(input, sections, body, 300)
        || resolveCompactLeadText(input, sections, body, 220),
      ),
    },
    { slotId: "hero-photo", type: "image", src: mediaUrls[0] ?? "", alt: input.title.slice(0, 512) || "Hero photo" },
    { slotId: "detail-photo-1", type: "image", src: mediaUrls[1] ?? "", alt: input.title.slice(0, 512) || "Supporting photo 1" },
    { slotId: "detail-photo-2", type: "image", src: mediaUrls[2] ?? "", alt: input.title.slice(0, 512) || "Supporting photo 2" },
    { slotId: "detail-photo-3", type: "image", src: mediaUrls[3] ?? "", alt: input.title.slice(0, 512) || "Supporting photo 3" },
    { slotId: "highlights-title", type: "text", text: clampTextToBudget("landscape-photo-story", "highlights-title", "Highlights") },
    { slotId: "highlights", type: "list", items: clampListSlotItems("landscape-photo-story", "highlights", highlightCandidates) },
  ];
}

function createArticleFocusSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 10);
  const leadText = clampTextToBudget(
    "article-focus",
    "lead",
    input.notes?.trim() || body.slice(0, 3).join(" ") || sections[0]?.details?.join(" ") || "",
  );
  const bodyText = clampTextToBudget(
    "article-focus",
    "body",
    [...body.slice(3), ...sections.flatMap((s) => s.details)].join(" ") || body.join(" "),
  );
  const keyPointCandidates = clampListItems([
    ...sections.map((s) => s.heading),
    ...body.filter((line) => line.length <= 120),
  ], budgetFor("article-focus", "key-points").maxItems ?? 5);

  return [
    { slotId: "eyebrow", type: "text", text: clampTextToBudget("article-focus", "eyebrow", input.graphicCategory || sections[0]?.heading || "Article") },
    { slotId: "title", type: "text", text: clampTextToBudget("article-focus", "title", input.title) },
    { slotId: "hero", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Hero visual" },
    { slotId: "lead", type: "text", text: leadText },
    { slotId: "body", type: "text", text: bodyText },
    { slotId: "key-points-title", type: "text", text: "Key Points" },
    { slotId: "key-points", type: "list", items: clampListSlotItems("article-focus", "key-points", keyPointCandidates) },
    { slotId: "footnote", type: "text", text: clampTextToBudget("article-focus", "footnote", "") },
  ];
}

function createTwoColumnArticleSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 10);
  const intro = clampTextToBudget(
    "two-column-article",
    "intro",
    input.notes?.trim() || body.slice(0, 2).join(" ") || sections[0]?.details?.join(" ") || "",
  );
  const leftSection = sections[0];
  const rightSection = sections[1] ?? sections[0];
  const fallbackBody = [...body.slice(2), ...sections.flatMap((section) => section.details)];
  const leftBody = clampTextToBudget(
    "two-column-article",
    "left-body",
    leftSection?.details?.join(" ") || fallbackBody.slice(0, 4).join(" "),
  );
  const rightBody = clampTextToBudget(
    "two-column-article",
    "right-body",
    rightSection?.details?.join(" ") || fallbackBody.slice(4).join(" ") || fallbackBody.join(" "),
  );
  const takeaways = clampListItems([
    ...sections.slice(2).map((section) => section.heading),
    ...body.filter((line) => line.length <= 140),
  ], budgetFor("two-column-article", "takeaways").maxItems ?? 4)
    .map((line) => clampTextToBudget("two-column-article", "takeaways", line));

  return [
    {
      slotId: "eyebrow",
      type: "text",
      text: clampTextToBudget("two-column-article", "eyebrow", input.graphicCategory || "Article"),
    },
    { slotId: "title", type: "text", text: clampTextToBudget("two-column-article", "title", input.title) },
    { slotId: "hero", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Hero visual" },
    { slotId: "intro", type: "text", text: intro },
    {
      slotId: "left-title",
      type: "text",
      text: clampTextToBudget("two-column-article", "left-title", leftSection?.heading || "Section One"),
    },
    { slotId: "left-body", type: "text", text: leftBody },
    {
      slotId: "right-title",
      type: "text",
      text: clampTextToBudget("two-column-article", "right-title", rightSection?.heading || "Section Two"),
    },
    { slotId: "right-body", type: "text", text: rightBody },
    { slotId: "takeaways-title", type: "text", text: "Key Takeaways" },
    { slotId: "takeaways", type: "list", items: clampListSlotItems("two-column-article", "takeaways", takeaways) },
  ];
}

function createFaqStackSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 10);
  const introText = clampTextToBudget(
    "faq-stack",
    "intro",
    input.notes?.trim() || body[0] || sections[0]?.details?.[0] || "",
  );
  const faqPairs = clampListItems([
    ...sections.map((section) => section.heading),
    ...body.filter((line) => looksLikeQuestion(line)),
  ], 3).map((question, index) => {
    const matchingSection = sections.find((section) => normalizeNarrativeKey(section.heading) === normalizeNarrativeKey(question));
    const answerSource = matchingSection?.details?.join(" ")
      || sections[index]?.details?.join(" ")
      || body[index + 1]
      || body[index + 2]
      || "";
    return {
      question: clampTextToBudget("faq-stack", `faq${index + 1}-question`, ensureQuestionText(question, index)),
      answer: clampTextToBudget("faq-stack", `faq${index + 1}-answer`, answerSource),
    };
  });

  while (faqPairs.length < 3) {
    const index = faqPairs.length;
    const fallbackQuestion = sections[index]?.heading || body[index] || `Key question ${index + 1}`;
    const fallbackAnswer = sections[index]?.details?.join(" ") || body[index + 1] || input.notes || "";
    faqPairs.push({
      question: clampTextToBudget("faq-stack", `faq${index + 1}-question`, ensureQuestionText(fallbackQuestion, index)),
      answer: clampTextToBudget("faq-stack", `faq${index + 1}-answer`, fallbackAnswer),
    });
  }

  return [
    {
      slotId: "eyebrow",
      type: "text",
      text: clampTextToBudget("faq-stack", "eyebrow", input.graphicCategory || "FAQ"),
    },
    { slotId: "title", type: "text", text: clampTextToBudget("faq-stack", "title", input.title) },
    { slotId: "intro", type: "text", text: introText },
    { slotId: "faq1-question", type: "text", text: faqPairs[0]?.question ?? "Question 1" },
    { slotId: "faq1-answer", type: "text", text: faqPairs[0]?.answer ?? "" },
    { slotId: "faq2-question", type: "text", text: faqPairs[1]?.question ?? "Question 2" },
    { slotId: "faq2-answer", type: "text", text: faqPairs[1]?.answer ?? "" },
    { slotId: "faq3-question", type: "text", text: faqPairs[2]?.question ?? "Question 3" },
    { slotId: "faq3-answer", type: "text", text: faqPairs[2]?.answer ?? "" },
  ];
}

function createProfileBoardSlotBindings(
  input: PresentationRecipeNarrativeInput,
): PresentationComponentSlotBinding[] {
  const sections = input.sections ?? [];
  const body = clampListItems(input.body, 8);
  const experienceItems = clampListItems(
    sections[1]?.details ?? body.slice(0, 4),
    budgetFor("profile-board", "experience-items").maxItems ?? 4,
  );
  const skillItems = clampListItems(
    sections[2]?.details ?? sections.flatMap((s) => s.details).slice(0, 6),
    budgetFor("profile-board", "skills-items").maxItems ?? 6,
  );
  const contactItems = clampListItems(
    sections[0]?.details ?? body.slice(0, 3),
    budgetFor("profile-board", "contact-items").maxItems ?? 4,
  );

  return [
    { slotId: "name", type: "text", text: clampTextToBudget("profile-board", "name", input.title) },
    { slotId: "role", type: "text", text: clampTextToBudget("profile-board", "role", sections[0]?.heading || body[0] || "") },
    { slotId: "portrait", type: "image", src: input.mediaUrl ?? "", alt: input.title.slice(0, 512) || "Portrait" },
    { slotId: "bio-title", type: "text", text: clampTextToBudget("profile-board", "bio-title", "About") },
    { slotId: "bio-body", type: "text", text: clampTextToBudget("profile-board", "bio-body", input.notes || body.join(" ")) },
    { slotId: "experience-title", type: "text", text: clampTextToBudget("profile-board", "experience-title", sections[1]?.heading || "Experience") },
    { slotId: "experience-items", type: "list", items: clampListSlotItems("profile-board", "experience-items", experienceItems) },
    { slotId: "skills-title", type: "text", text: clampTextToBudget("profile-board", "skills-title", sections[2]?.heading || "Skills") },
    { slotId: "skills-items", type: "list", items: clampListSlotItems("profile-board", "skills-items", skillItems) },
    { slotId: "contact-title", type: "text", text: clampTextToBudget("profile-board", "contact-title", "Contact") },
    { slotId: "contact-items", type: "list", items: clampListSlotItems("profile-board", "contact-items", contactItems) },
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
    case "timeline-report":
      return createTimelineReportSlotBindings(input);
    case "feature-highlights":
      return createFeatureHighlightsSlotBindings(input);
    case "infographic-grid":
      return createInfographicGridSlotBindings(input);
    case "stat-cards":
      return createStatCardsSlotBindings(input);
    case "sectioned-explainer":
      return createSectionedExplainerSlotBindings(input);
    case "article-focus":
      return createArticleFocusSlotBindings(input);
    case "two-column-article":
      return createTwoColumnArticleSlotBindings(input);
    case "faq-stack":
      return createFaqStackSlotBindings(input);
    case "profile-board":
      return createProfileBoardSlotBindings(input);
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
    case "a4-photo-grid":
      return createA4PhotoGridSlotBindings(input);
    case "landscape-photo-story":
      return createLandscapePhotoStorySlotBindings(input);
    case "fullpage-image":
    case "fullpage-image-landscape":
      return [{ slotId: "fullpage", type: "image", src: input.mediaUrl ?? "", alt: input.title || "Full-page image" }];
    case "fullpage-video":
    case "fullpage-video-landscape":
      return [{ slotId: "fullpage", type: "video", src: input.mediaUrl ?? "", alt: input.title || "Full-page video" }];
  }
}
