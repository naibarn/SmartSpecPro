import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { and, eq } from "drizzle-orm";
import type { SkillDefinition } from "@smartspec/skills";

import { createInternalTokenFromAuth } from "../_core/tokens";
import { getDb } from "../db";
import { storageReadText } from "../storage";
import { agencyBridge } from "./agencyBridge";
import { executeSkill } from "./skillExecutor";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import type { SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import { getSkillByIdAsync } from "./skillRegistry";
import { getJobArtifactUrls } from "./sandbox/artifactAccess";
import { agencies, agencyConversations, sandboxJobs } from "../../drizzle/schema";

type ArticleExecutionSource = "skill" | "agency";
const MAX_PRESENTATION_ARTICLE_CHARS = 19_500;
const MAX_PRESENTATION_SLIDE_JSON_CHARS = 120_000;
const SUPPORTED_SLIDE_CANVAS_RATIOS = ["16:9", "9:16", "4:5", "5:4"] as const;
const SUPPORTED_SLIDE_OUTPUT_FORMATS = ["json", "md", "pptx", "pdf"] as const;

export type PresentationSlideCanvasRatio = typeof SUPPORTED_SLIDE_CANVAS_RATIOS[number];
export type PresentationSlideOutputFormat = typeof SUPPORTED_SLIDE_OUTPUT_FORMATS[number];

export interface PresentationSlideImagePrompt {
  id: string;
  pageNumber: number;
  imageIndex: number;
  placementRole: "hero" | "supporting" | "detail";
  shortLabel: string;
  prompt: string;
}

export interface PresentationSlideImageAsset extends PresentationSlideImagePrompt {
  url: string;
}

interface PresentationArticlePagePlan {
  pageNumber: number;
  titleHint: string;
  text: string;
}

type PresentationSlideArchetype =
  | "editorial_cover_split"
  | "title_hero_split"
  | "two_column_editorial"
  | "executive_summary_dashboard"
  | "product_overview_report"
  | "stat_card_with_image"
  | "vertical_workflow_steps"
  | "project_timeline_bands"
  | "feature_story_panels";

export interface PresentationSlideSkillRequestPayload {
  request: {
    projectTitle: string;
    language: "th" | "en";
    canvasRatio: PresentationSlideCanvasRatio;
    randomizeLayouts?: boolean;
    compositionMode: "slide-deck";
    outputFormats: PresentationSlideOutputFormat[];
    pagination: {
      maxPages: number;
      allowFewerPages: true;
      overflowStrategy: "condense";
    };
    content: {
      titleHint?: string;
      rawText?: string;
      pages?: Array<{
        titleHint: string;
        text: string;
        pageIntentHint?: string;
        forceArchetype?: PresentationSlideArchetype | "auto";
        imageSelectionMode?: "manual-only";
        maxImagesOverride?: number | null;
        images?: Array<{
          id: string;
          source: string;
          alt?: string;
          caption?: string;
          tags?: string[];
          roleHint: "hero" | "supporting" | "module";
          priority: number;
        }>;
      }>;
      sharedImagePool?: {
        images: Array<{
          id: string;
          source: string;
          alt?: string;
          caption?: string;
          tags?: string[];
          roleHint: "hero" | "supporting" | "module";
          priority: number;
        }>;
      };
      imagePool?: {
        images: Array<{
          id: string;
          source: string;
          alt?: string;
          caption?: string;
          tags?: string[];
          roleHint: "hero" | "supporting" | "module";
          priority: number;
        }>;
        minImagesPerPage: 1;
        maxImagesPerPage: 3;
        reusePolicy: "avoid-repeat-until-used";
        selectionStrategy: "semantic-hero";
        coverPageImagePolicy: "prefer-hero";
        allowUnusedImages: true;
      };
    };
  };
}

export interface GeneratePresentationArticleInput {
  tenantId: string;
  userId: number;
  topic: string;
  preferredLanguage?: "th" | "en";
  executionSource: ArticleExecutionSource;
  skillId?: string | null;
  agencyId?: string | null;
  requiresWebSearch?: boolean;
  requiresThinking?: boolean;
  targetImageCount: number;
}

export interface GeneratePresentationArticleResult {
  article: string;
  sourceLabel: string;
  modelId?: string;
}

export interface PreparePresentationSlideBundleInput {
  userId: number;
  topic: string;
  article: string;
  slideSkillId: string;
  preferredLanguage?: "th" | "en";
  requiresThinking?: boolean;
  targetImageCount: number;
  canvasRatio: PresentationSlideCanvasRatio;
  outputFormats: PresentationSlideOutputFormat[];
  imagePromptContext?: string;
}

export interface PreparePresentationSlideBundleResult {
  maxPages: number;
  plannedImageCount: number;
  slideSkillLabel: string;
  imagePrompts: PresentationSlideImagePrompt[];
  slidePayload: PresentationSlideSkillRequestPayload;
  slidePayloadJson: string;
  modelId?: string;
}

export interface GeneratePresentationSlideDraftInput extends PreparePresentationSlideBundleInput {
  tenantId: string;
  imageAssets: PresentationSlideImageAsset[];
  maxPages: number;
}

export interface PresentationSlideArtifact {
  format: PresentationSlideOutputFormat | "unknown";
  url: string;
  key: string;
  mimeType: string;
  isPrimary: boolean;
}

export interface GeneratePresentationSlideDraftResult {
  maxPages: number;
  slideSkillLabel: string;
  slidePayload: PresentationSlideSkillRequestPayload;
  slidePayloadJson: string;
  slideJson: string;
  modelId?: string;
  artifactJobId?: string | null;
  artifacts?: PresentationSlideArtifact[];
  downloadUrl?: string | null;
  artifactFailureMessage?: string | null;
}

function inferArticleLanguage(topic: string): "th" | "en" {
  return /[\u0E00-\u0E7F]/.test(topic) ? "th" : "en";
}

function clampSlideCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 6;
  }
  return Math.max(1, Math.min(20, Math.round(value)));
}

function clampTargetImageCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }
  return Math.min(20, Math.max(5, Math.round(value)));
}

function clampPreparedImageCount(value: number, maxPages: number): number {
  const lowerBound = Math.max(1, maxPages);
  const upperBound = Math.max(lowerBound, maxPages * 3);
  if (!Number.isFinite(value)) {
    return Math.min(upperBound, Math.max(lowerBound, maxPages * 2));
  }
  return Math.max(lowerBound, Math.min(upperBound, Math.round(value)));
}

function inferArtifactFormatFromRecord(input: { key: string; mimeType: string }): PresentationSlideOutputFormat | "unknown" {
  const key = input.key.toLowerCase();
  const mimeType = input.mimeType.toLowerCase();
  if (key.endsWith(".pptx") || mimeType.includes("presentationml.presentation")) {
    return "pptx";
  }
  if (key.endsWith(".pdf") || mimeType.includes("pdf")) {
    return "pdf";
  }
  if (key.endsWith(".md") || mimeType.includes("markdown")) {
    return "md";
  }
  if (key.endsWith(".json") || mimeType.includes("json")) {
    return "json";
  }
  return "unknown";
}

async function waitForSlideArtifacts(params: {
  tenantId: string;
  jobId: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<PresentationSlideArtifact[]> {
  const maxAttempts = params.maxAttempts ?? 20;
  const delayMs = params.delayMs ?? 1_500;
  const db = await getDb();
  if (!db) {
    return [];
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rows = await db
      .select({
        status: sandboxJobs.status,
      })
      .from(sandboxJobs)
      .where(and(eq(sandboxJobs.id, params.jobId), eq(sandboxJobs.tenantId, params.tenantId)))
      .limit(1);

    const status = String(rows[0]?.status ?? "").trim().toLowerCase();
    if (status === "completed") {
      const artifacts = await getJobArtifactUrls({
        jobId: params.jobId,
        tenantId: params.tenantId,
      });
      return artifacts.map((artifact) => ({
        ...artifact,
        format: inferArtifactFormatFromRecord(artifact),
      }));
    }
    if (status === "failed" || status === "error" || status === "cancelled") {
      throw new Error(`Slide artifact generation failed (${status || "unknown"})`);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return [];
}

function stripOuterCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function stripJsonEnvelope(raw: string): string {
  const stripped = stripOuterCodeFences(raw).trim();
  if (!stripped) {
    return "";
  }
  const objectStart = stripped.indexOf("{");
  const objectEnd = stripped.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return stripped.slice(objectStart, objectEnd + 1).trim();
  }
  const arrayStart = stripped.indexOf("[");
  const arrayEnd = stripped.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return stripped.slice(arrayStart, arrayEnd + 1).trim();
  }
  return stripped;
}

function safeJsonParse(raw: string): unknown {
  const candidate = stripJsonEnvelope(raw);
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractArticleTitle(article: string, fallbackTopic: string): string {
  const firstLine = article
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine || fallbackTopic.trim() || "Presentation";
}

function countEnglishWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function countThaiWordUnits(text: string): number {
  const spacedTokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean).length;
  if (spacedTokens > 0) {
    return spacedTokens;
  }
  const thaiChars = text.match(/[\u0E00-\u0E7F]/g)?.length ?? 0;
  return Math.ceil(thaiChars / 6);
}

function listArticleSections(article: string): string[] {
  const numberedSections = article
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+[\).\s-]+/.test(line));
  if (numberedSections.length > 0) {
    return numberedSections;
  }
  return article
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 40)
    .slice(0, 20);
}

function parseStructuredArticle(article: string, fallbackTopic: string): {
  title: string;
  introParagraphs: string[];
  sections: Array<{ order: number; heading: string; body: string }>;
} {
  const normalized = normalizeGeneratedPresentationArticle(article);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const title = extractArticleTitle(normalized, fallbackTopic);
  const contentParagraphs = paragraphs[0] === title ? paragraphs.slice(1) : paragraphs;
  const introParagraphs: string[] = [];
  const sections: Array<{ order: number; heading: string; body: string }> = [];
  let activeSection: { order: number; heading: string; bodyParts: string[] } | null = null;

  for (const paragraph of contentParagraphs) {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const firstLine = lines[0] ?? "";
    const sectionMatch = firstLine.match(/^(\d+)[).\s-]+(.+)$/);

    if (sectionMatch) {
      if (activeSection) {
        sections.push({
          order: activeSection.order,
          heading: activeSection.heading,
          body: activeSection.bodyParts.join("\n\n").trim(),
        });
      }
      const bodyFromRemainingLines = lines.slice(1).join(" ").trim();
      activeSection = {
        order: Number(sectionMatch[1]) || (sections.length + 1),
        heading: sectionMatch[2].trim(),
        bodyParts: bodyFromRemainingLines ? [bodyFromRemainingLines] : [],
      };
      continue;
    }

    if (activeSection) {
      activeSection.bodyParts.push(paragraph);
    } else {
      introParagraphs.push(paragraph);
    }
  }

  if (activeSection) {
    sections.push({
      order: activeSection.order,
      heading: activeSection.heading,
      body: activeSection.bodyParts.join("\n\n").trim(),
    });
  }

  return {
    title,
    introParagraphs,
    sections,
  };
}

function mergeArticlePagePlansToLimit(
  pages: PresentationArticlePagePlan[],
  maxPages: number,
): PresentationArticlePagePlan[] {
  if (pages.length <= maxPages) {
    return pages;
  }

  const head = pages.slice(0, Math.max(0, maxPages - 1));
  const tail = pages.slice(Math.max(0, maxPages - 1));
  const mergedTitleHint = tail
    .map((page) => page.titleHint.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ")
    .slice(0, 120);

  return [
    ...head,
    {
      pageNumber: head.length + 1,
      titleHint: mergedTitleHint || tail[0]?.titleHint || `Page ${head.length + 1}`,
      text: tail.map((page) => page.text.trim()).filter(Boolean).join("\n\n"),
    },
  ];
}

function chunkParagraphsIntoPagePlans(
  article: string,
  fallbackTopic: string,
  maxPages: number,
): PresentationArticlePagePlan[] {
  const normalized = normalizeGeneratedPresentationArticle(article);
  const title = extractArticleTitle(normalized, fallbackTopic);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const contentParagraphs = paragraphs[0] === title ? paragraphs.slice(1) : paragraphs;
  if (contentParagraphs.length === 0) {
    return [{
      pageNumber: 1,
      titleHint: title,
      text: title,
    }];
  }

  const targetPageCount = Math.max(1, Math.min(maxPages, contentParagraphs.length));
  const bucketSize = Math.max(1, Math.ceil(contentParagraphs.length / targetPageCount));
  const pages: PresentationArticlePagePlan[] = [];

  for (let index = 0; index < contentParagraphs.length; index += bucketSize) {
    const chunk = contentParagraphs.slice(index, index + bucketSize);
    const titleHint = chunk[0]?.split("\n")[0]?.trim() || `${title} ${pages.length + 1}`;
    pages.push({
      pageNumber: pages.length + 1,
      titleHint,
      text: [titleHint, ...chunk].filter(Boolean).join("\n\n"),
    });
  }

  return mergeArticlePagePlansToLimit(pages, maxPages)
    .map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

function buildPresentationPagePlans(
  article: string,
  fallbackTopic: string,
  maxPages: number,
): PresentationArticlePagePlan[] {
  const parsed = parseStructuredArticle(article, fallbackTopic);
  const pages: PresentationArticlePagePlan[] = [];

  if (parsed.introParagraphs.length > 0) {
    pages.push({
      pageNumber: 1,
      titleHint: parsed.title,
      text: [parsed.title, ...parsed.introParagraphs].filter(Boolean).join("\n\n"),
    });
  }

  for (const section of parsed.sections) {
    pages.push({
      pageNumber: pages.length + 1,
      titleHint: section.heading || `${parsed.title} ${pages.length + 1}`,
      text: [section.heading, section.body].filter(Boolean).join("\n\n"),
    });
  }

  if (pages.length === 0) {
    return chunkParagraphsIntoPagePlans(article, fallbackTopic, maxPages);
  }

  return mergeArticlePagePlansToLimit(pages, maxPages)
    .map((page, index) => ({ ...page, pageNumber: index + 1 }));
}

function distributePromptCountsByPage(
  pagePlans: PresentationArticlePagePlan[],
  plannedImageCount: number,
): number[] {
  if (pagePlans.length === 0) {
    return [];
  }

  const counts = pagePlans.map(() => 1);
  let remaining = Math.max(0, plannedImageCount - counts.length);
  const rankedPages = pagePlans
    .map((page, index) => ({
      index,
      score: page.text.length + (index === 0 ? 20 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  while (remaining > 0) {
    let allocated = false;
    for (const page of rankedPages) {
      if (remaining <= 0) {
        break;
      }
      if (counts[page.index]! >= 3) {
        continue;
      }
      counts[page.index] = counts[page.index]! + 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) {
      break;
    }
  }

  return counts;
}

function countPageListItems(text: string): number {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-•*]\s|[0-9]+[).\s-]+)/.test(line)).length;
}

function resolveForcedPageArchetype(input: {
  page: PresentationArticlePagePlan;
  pageIndex: number;
  totalPages: number;
  canvasRatio: PresentationSlideCanvasRatio;
}): PresentationSlideArchetype {
  const { page, pageIndex, totalPages, canvasRatio } = input;
  const normalizedText = page.text.toLowerCase();
  const listItemCount = countPageListItems(page.text);

  if (listItemCount >= 3) {
    return /\b(?:phase|timeline|milestone|roadmap|ระยะ|ไทม์ไลน์|ช่วงเวลา)\b/i.test(page.text)
      ? "project_timeline_bands"
      : "vertical_workflow_steps";
  }

  if (pageIndex === 0 && totalPages > 1) {
    return "editorial_cover_split";
  }

  const ratioSequence: Record<PresentationSlideCanvasRatio, PresentationSlideArchetype[]> = {
    "16:9": [
      "editorial_cover_split",
      "two_column_editorial",
      "product_overview_report",
      "stat_card_with_image",
      "feature_story_panels",
      "title_hero_split",
    ],
    "9:16": [
      "editorial_cover_split",
      "title_hero_split",
      "feature_story_panels",
      "vertical_workflow_steps",
      "project_timeline_bands",
    ],
    "4:5": [
      "editorial_cover_split",
      "product_overview_report",
      "title_hero_split",
      "two_column_editorial",
      "feature_story_panels",
      "stat_card_with_image",
    ],
    "5:4": [
      "executive_summary_dashboard",
      "product_overview_report",
      "two_column_editorial",
      "stat_card_with_image",
      "title_hero_split",
      "feature_story_panels",
    ],
  };

  if (/\b(?:summary|overview|key point|ภาพรวม|สรุป)\b/i.test(normalizedText)) {
    return canvasRatio === "5:4" ? "executive_summary_dashboard" : "product_overview_report";
  }

  const sequence = ratioSequence[canvasRatio];
  return sequence[pageIndex % sequence.length] ?? "title_hero_split";
}

function resolvePageIntentHint(pageText: string, pageIndex: number): string {
  const listItemCount = countPageListItems(pageText);
  if (listItemCount >= 3) {
    return /\b(?:phase|timeline|milestone|roadmap|ระยะ|ไทม์ไลน์|ช่วงเวลา)\b/i.test(pageText)
      ? "project_timeline"
      : "workflow_infographic";
  }
  if (pageIndex === 0) {
    return "editorial_cover";
  }
  return pageIndex % 2 === 0 ? "report_page" : "case_study";
}

export function estimatePresentationMaxPages(
  article: string,
  preferredLanguage?: "th" | "en",
): number {
  const normalized = normalizeGeneratedPresentationArticle(article);
  if (!normalized) {
    return 5;
  }
  const language = preferredLanguage ?? inferArticleLanguage(normalized);
  const lengthEstimate = language === "th"
    ? Math.ceil(countThaiWordUnits(normalized) / 110)
    : Math.ceil(countEnglishWords(normalized) / 120);
  const sectionEstimate = listArticleSections(normalized).length;
  const paragraphEstimate = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 30).length;
  const estimated = Math.max(3, lengthEstimate, sectionEstimate + 1, Math.ceil(paragraphEstimate * 0.8));
  return clampSlideCount(estimated);
}

function normalizeSlideOutputFormats(
  outputFormats: PresentationSlideOutputFormat[],
): PresentationSlideOutputFormat[] {
  const unique = new Set<PresentationSlideOutputFormat>(["json"]);
  for (const format of outputFormats) {
    if ((SUPPORTED_SLIDE_OUTPUT_FORMATS as readonly string[]).includes(format)) {
      unique.add(format);
    }
  }
  return Array.from(unique);
}

function normalizeSlideCanvasRatio(
  ratio: PresentationSlideCanvasRatio | string,
): PresentationSlideCanvasRatio {
  if ((SUPPORTED_SLIDE_CANVAS_RATIOS as readonly string[]).includes(ratio)) {
    return ratio as PresentationSlideCanvasRatio;
  }
  return "16:9";
}

function normalizeExecutionPolicy(
  skill: SkillDefinition,
  options: Pick<GeneratePresentationArticleInput, "requiresThinking" | "requiresWebSearch">,
): SkillDefinition {
  const rawPolicy = (
    typeof skill.executionPolicy === "object" && skill.executionPolicy
      ? skill.executionPolicy
      : {}
  ) as Record<string, unknown>;
  const rawRequirements = (
    rawPolicy.requirements && typeof rawPolicy.requirements === "object"
      ? rawPolicy.requirements
      : {}
  ) as Record<string, unknown>;

  const nextRequirements: Record<string, unknown> = {
    ...rawRequirements,
  };

  if (options.requiresWebSearch) {
    nextRequirements.supportsWebSearch = true;
  }
  if (options.requiresThinking) {
    nextRequirements.supportsThinking = true;
  }

  const hasRequirements = Object.keys(nextRequirements).length > 0;

  return {
    ...skill,
    executionPolicy: hasRequirements
      ? {
          ...rawPolicy,
          mode: rawPolicy.mode ?? "requirements",
          requirements: nextRequirements,
        }
      : rawPolicy,
  };
}

export function buildPresentationArticlePrompt(input: Pick<
  GeneratePresentationArticleInput,
  "topic" | "preferredLanguage" | "requiresThinking" | "requiresWebSearch" | "targetImageCount"
>): string {
  const targetImageCount = clampTargetImageCount(input.targetImageCount);
  const targetWords = Math.min(2400, Math.max(800, targetImageCount * 150));
  const language = input.preferredLanguage ?? inferArticleLanguage(input.topic);
  const languageLabel = language === "th" ? "Thai" : "English";

  return [
    `Topic: ${input.topic.trim()}`,
    `Preferred language: ${languageLabel}`,
    `Language code: ${language}`,
    `Supporting image plan: ${targetImageCount} images`,
    `Web search priority: ${input.requiresWebSearch ? "Use current facts when available." : "Use general knowledge unless the topic already includes current facts."}`,
    `Thinking mode: ${input.requiresThinking ? "Use deeper reasoning before writing." : "Keep the reasoning lightweight and direct."}`,
    "Write a finished source article for a future presentation workflow.",
    "The article will later be turned into 5-20 supporting images and then converted into a new slide deck.",
    `Organize the article into ${targetImageCount} numbered sections so each section can later guide one supporting image.`,
    `Aim for about ${targetWords} words total.`,
    `Write the entire article in ${languageLabel}.`,
    "Start with the article title on the first line.",
    "After the title, write one short lead paragraph.",
    "Then write the numbered sections with rich but concise detail.",
    "Output plain text only.",
    "Do not output HTML, markdown tables, JSON, XML, or code fences.",
    "Do not include notes to the AI, placeholders, or meta commentary.",
  ].join("\n\n");
}

export function normalizeGeneratedPresentationArticle(rawText: string): string {
  const stripped = stripOuterCodeFences(rawText);
  const flattened = /<\/?[a-z][\s\S]*>/i.test(stripped)
    ? sanitizeHtml(stripped, {
        allowedTags: [],
        allowedAttributes: {},
      })
    : stripped;

  return flattened
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimArticleForDeckNotes(article: string): string {
  return article.slice(0, MAX_PRESENTATION_ARTICLE_CHARS).trim();
}

function trimSlideJson(rawJson: string): string {
  return rawJson.slice(0, MAX_PRESENTATION_SLIDE_JSON_CHARS).trim();
}

function extractImportableSlideSpec(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = safeJsonParse(value);
    return parsed ? extractImportableSlideSpec(parsed) : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.slides) && record.slides.length > 0) {
    return record;
  }

  const nestedCandidates = [
    record.layoutSpec,
    record.layout_spec,
    record.result,
    record.output,
    record.data,
    record.payload,
  ];

  for (const candidate of nestedCandidates) {
    const extracted = extractImportableSlideSpec(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

function normalizeImportableSlideJson(rawJson: string): string | null {
  const parsed = safeJsonParse(rawJson);
  const extracted = extractImportableSlideSpec(parsed);
  return extracted ? JSON.stringify(extracted, null, 2) : null;
}

function isImportableSlideJson(rawJson: string): boolean {
  return normalizeImportableSlideJson(rawJson) !== null;
}

async function resolveSlideJsonFromArtifacts(
  artifacts: PresentationSlideArtifact[],
  fallbackSlideJson: string,
): Promise<string> {
  const jsonArtifacts = artifacts
    .filter((artifact) => artifact.format === "json" && artifact.key.trim())
    .sort((left, right) => {
      const leftKey = left.key.trim().toLowerCase();
      const rightKey = right.key.trim().toLowerCase();
      const leftScore = leftKey.endsWith("manifest.json") ? 10 : 0;
      const rightScore = rightKey.endsWith("manifest.json") ? 10 : 0;
      return leftScore - rightScore;
    });
  for (const jsonArtifact of jsonArtifacts) {
    const artifactText = await storageReadText(jsonArtifact.key);
    if (!artifactText?.trim()) {
      continue;
    }
    const trimmedArtifactJson = trimSlideJson(stripOuterCodeFences(artifactText));
    const normalizedArtifactJson = normalizeImportableSlideJson(trimmedArtifactJson);
    if (normalizedArtifactJson) {
      return normalizedArtifactJson;
    }
  }
  return fallbackSlideJson;
}

function buildFallbackImagePromptPlan(
  input: PreparePresentationSlideBundleInput,
  maxPages: number,
  plannedImageCount: number,
): PresentationSlideImagePrompt[] {
  const pagePlans = buildPresentationPagePlans(input.article, input.topic, maxPages);
  const title = extractArticleTitle(input.article, input.topic);
  const prompts: PresentationSlideImagePrompt[] = [];
  const language = input.preferredLanguage ?? inferArticleLanguage(input.article);
  const promptCounts = distributePromptCountsByPage(pagePlans, plannedImageCount);

  pagePlans.forEach((page, pageIndex) => {
    const count = promptCounts[pageIndex] ?? 1;
    const noteExcerpt = page.text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    for (let imageIndex = 1; imageIndex <= count; imageIndex += 1) {
      const placementRole = imageIndex === 1
        ? "hero"
        : imageIndex === 2
          ? "supporting"
          : "detail";
      const promptBase = language === "th"
        ? `ภาพประกอบสำหรับสไลด์หน้า ${page.pageNumber} หัวข้อ "${page.titleHint || title}" ใช้กับเนื้อหานี้เป็นหลัก: ${noteExcerpt}`
        : `Supporting image for slide ${page.pageNumber} titled "${page.titleHint || title}" based on this page note: ${noteExcerpt}`;
      const contextualPrompt = input.imagePromptContext?.trim()
        ? `${promptBase}. ${input.imagePromptContext.trim()}`
        : promptBase;
      prompts.push({
        id: `img-${page.pageNumber}-${imageIndex}`,
        pageNumber: page.pageNumber,
        imageIndex,
        placementRole,
        shortLabel: `${page.pageNumber}.${imageIndex} ${placementRole}`,
        prompt: contextualPrompt,
      });
    }
  });

  const promptSeed = prompts.slice();
  let seedIndex = 0;
  while (prompts.length < plannedImageCount && promptSeed.length > 0) {
    const fallback = promptSeed[seedIndex % promptSeed.length] ?? promptSeed[0]!;
    prompts.push({
      ...fallback,
      id: `img-${fallback.pageNumber}-${fallback.imageIndex}-${prompts.length + 1}`,
    });
    seedIndex += 1;
  }

  return prompts.slice(0, plannedImageCount);
}

export function buildPresentationImagePromptPlanPrompt(input: {
  topic: string;
  article: string;
  preferredLanguage?: "th" | "en";
  maxPages: number;
  plannedImageCount: number;
  canvasRatio: PresentationSlideCanvasRatio;
  imagePromptContext?: string;
  slideSkillName?: string;
}): string {
  const language = input.preferredLanguage ?? inferArticleLanguage(input.article || input.topic);
  const languageLabel = language === "th" ? "Thai" : "English";
  const pagePlans = buildPresentationPagePlans(input.article, input.topic, clampSlideCount(input.maxPages));
  return [
    "Create a strict JSON plan for slide-supporting image prompts.",
    `Topic: ${input.topic.trim()}`,
    `Preferred language: ${languageLabel}`,
    `Language code: ${language}`,
    `Target max pages: ${clampSlideCount(input.maxPages)}`,
    `Target image prompts: ${clampPreparedImageCount(input.plannedImageCount, input.maxPages)}`,
    `Canvas ratio: ${normalizeSlideCanvasRatio(input.canvasRatio)}`,
    `Slide skill: ${input.slideSkillName?.trim() || "Not specified"}`,
    input.imagePromptContext?.trim()
      ? `Visual context to apply to every prompt: ${input.imagePromptContext.trim()}`
      : "Visual context to apply to every prompt: none",
    "Use the article below to decide how many images belong on each page, with 1-3 images per page.",
    "Return JSON only with this shape:",
    '{"prompts":[{"pageNumber":1,"imageIndex":1,"placementRole":"hero","shortLabel":"cover hero","prompt":"..."}]}',
    "Rules:",
    "- Return exactly the requested number of prompts.",
    "- Keep pageNumber within 1..maxPages.",
    "- imageIndex starts at 1 for each page and must stay within 1..3.",
    "- Treat the page plan below as authoritative. Do not invent different page boundaries.",
    "- Every page in the page plan must receive at least 1 image prompt.",
    "- placementRole must be one of hero, supporting, detail.",
    `- Write every shortLabel and prompt in ${languageLabel}.`,
    "- Make each prompt production-ready for text-to-image generation.",
    "- Avoid markdown, comments, and code fences.",
    "",
    "Authoritative page plan:",
    ...pagePlans.map((page) => (
      `Page ${page.pageNumber}: ${page.titleHint}\n${page.text}`
    )),
    "",
    "Article:",
    input.article.trim(),
  ].join("\n\n");
}

function normalizeImagePromptPlan(
  raw: unknown,
  fallbackPlan: PresentationSlideImagePrompt[],
  maxPages: number,
  plannedImageCount: number,
): PresentationSlideImagePrompt[] {
  const rawItems = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object" && Array.isArray((raw as { prompts?: unknown[] }).prompts)
      ? (raw as { prompts: unknown[] }).prompts
      : []);
  const normalized: PresentationSlideImagePrompt[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const pageNumber = clampSlideCount(Number(record.pageNumber ?? 1));
    const imageIndex = Math.max(1, Math.min(3, Math.round(Number(record.imageIndex ?? 1))));
    const prompt = String(record.prompt ?? "").trim();
    const shortLabel = String(record.shortLabel ?? "").trim();
    const rawPlacementRole = String(record.placementRole ?? "").trim().toLowerCase();
    const placementRole = rawPlacementRole === "detail" || rawPlacementRole === "supporting"
      ? rawPlacementRole
      : "hero";
    if (!prompt) {
      continue;
    }
    normalized.push({
      id: `img-${pageNumber}-${imageIndex}-${normalized.length + 1}`,
      pageNumber: Math.min(maxPages, pageNumber),
      imageIndex,
      placementRole,
      shortLabel: shortLabel || `${pageNumber}.${imageIndex} ${placementRole}`,
      prompt,
    });
  }

  if (normalized.length === 0) {
    return fallbackPlan;
  }

  const fallbackByPage = new Map<number, PresentationSlideImagePrompt[]>();
  for (const prompt of fallbackPlan) {
    const bucket = fallbackByPage.get(prompt.pageNumber) ?? [];
    bucket.push(prompt);
    fallbackByPage.set(prompt.pageNumber, bucket);
  }

  const usedKeys = new Set<string>();
  const reconciled: PresentationSlideImagePrompt[] = [];
  const normalizedByPage = new Map<number, PresentationSlideImagePrompt[]>();
  for (const prompt of normalized) {
    const bucket = normalizedByPage.get(prompt.pageNumber) ?? [];
    bucket.push(prompt);
    normalizedByPage.set(prompt.pageNumber, bucket);
  }

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pagePrompts = (normalizedByPage.get(pageNumber) ?? [])
      .slice()
      .sort((left, right) => left.imageIndex - right.imageIndex);
    if (pagePrompts.length === 0) {
      const fallbackPrompt = fallbackByPage.get(pageNumber)?.[0];
      if (fallbackPrompt) {
        const key = `${fallbackPrompt.pageNumber}:${fallbackPrompt.imageIndex}`;
        usedKeys.add(key);
        reconciled.push(fallbackPrompt);
      }
      continue;
    }
    for (const prompt of pagePrompts) {
      const key = `${prompt.pageNumber}:${prompt.imageIndex}`;
      if (usedKeys.has(key)) {
        continue;
      }
      usedKeys.add(key);
      reconciled.push(prompt);
    }
  }

  for (const prompt of normalized) {
    if (reconciled.length >= plannedImageCount) {
      break;
    }
    const key = `${prompt.pageNumber}:${prompt.imageIndex}`;
    if (usedKeys.has(key)) {
      continue;
    }
    usedKeys.add(key);
    reconciled.push(prompt);
  }

  for (const prompt of fallbackPlan) {
    if (reconciled.length >= plannedImageCount) {
      break;
    }
    const key = `${prompt.pageNumber}:${prompt.imageIndex}`;
    if (usedKeys.has(key)) {
      continue;
    }
    usedKeys.add(key);
    reconciled.push({
      ...prompt,
      id: `fallback-${reconciled.length + 1}`,
    });
  }

  return reconciled
    .slice(0, plannedImageCount)
    .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex);
}

export function buildPresentationSlideRequestPayload(input: {
  topic: string;
  article: string;
  preferredLanguage?: "th" | "en";
  canvasRatio: PresentationSlideCanvasRatio;
  outputFormats: PresentationSlideOutputFormat[];
  maxPages: number;
  imageAssets?: PresentationSlideImageAsset[];
}): PresentationSlideSkillRequestPayload {
  const normalizedArticle = normalizeGeneratedPresentationArticle(input.article);
  const language = input.preferredLanguage ?? inferArticleLanguage(normalizedArticle || input.topic);
  const title = extractArticleTitle(normalizedArticle, input.topic);
  const imageAssets = (input.imageAssets ?? []).filter((asset) => asset.url.trim());
  const pagePlans = buildPresentationPagePlans(normalizedArticle, input.topic, clampSlideCount(input.maxPages));
  const imagesByPage = new Map<number, PresentationSlideImageAsset[]>();
  for (const asset of imageAssets) {
    const clampedPageNumber = Math.max(1, Math.min(pagePlans.length || 1, asset.pageNumber));
    const bucket = imagesByPage.get(clampedPageNumber) ?? [];
    bucket.push(asset);
    imagesByPage.set(clampedPageNumber, bucket);
  }

  return {
    request: {
      projectTitle: title,
      language,
      canvasRatio: normalizeSlideCanvasRatio(input.canvasRatio),
      randomizeLayouts: false,
      compositionMode: "slide-deck",
      outputFormats: normalizeSlideOutputFormats(input.outputFormats),
      pagination: {
        maxPages: clampSlideCount(input.maxPages),
        allowFewerPages: true,
        overflowStrategy: "condense",
      },
      content: {
        titleHint: title,
        pages: pagePlans.map((page, pageIndex) => {
          const pageImages = (imagesByPage.get(page.pageNumber) ?? [])
            .slice()
            .sort((left, right) => left.imageIndex - right.imageIndex)
            .slice(0, 3)
            .map((asset) => ({
              id: asset.id,
              source: asset.url,
              alt: asset.shortLabel,
              caption: asset.prompt,
              tags: [asset.placementRole, `page-${asset.pageNumber}`],
              roleHint: asset.placementRole === "detail" ? "module" as const : asset.placementRole,
              priority: asset.placementRole === "hero" ? 5 : (asset.placementRole === "supporting" ? 4 : 3),
            }));
          return {
            titleHint: page.titleHint,
            text: page.text,
            pageIntentHint: resolvePageIntentHint(page.text, pageIndex),
            forceArchetype: resolveForcedPageArchetype({
              page,
              pageIndex,
              totalPages: pagePlans.length,
              canvasRatio: input.canvasRatio,
            }),
            imageSelectionMode: "manual-only" as const,
            maxImagesOverride: pageImages.length > 0 ? pageImages.length : null,
            images: pageImages,
          };
        }),
        ...(imageAssets.length > 0
          ? {
              sharedImagePool: {
                images: imageAssets.map((asset) => ({
                  id: asset.id,
                  source: asset.url,
                  alt: asset.shortLabel,
                  caption: asset.prompt,
                  tags: [asset.placementRole, `page-${asset.pageNumber}`],
                  roleHint: asset.placementRole === "detail" ? "module" as const : asset.placementRole,
                  priority: asset.placementRole === "hero" ? 5 : (asset.placementRole === "supporting" ? 4 : 3),
                })),
              },
            }
          : {}),
      },
    },
  };
}

async function resolveSlideSkillForPlanning(
  slideSkillId: string,
  options: Pick<PreparePresentationSlideBundleInput, "requiresThinking">,
): Promise<{ skill: SkillDefinition; executionPolicy: SkillExecutionPolicyResult }> {
  const skill = await getSkillByIdAsync(slideSkillId.trim());
  if (!skill) {
    throw new Error("Slide skill not found");
  }
  const normalizedSkill = normalizeExecutionPolicy(skill, {
    requiresThinking: options.requiresThinking,
    requiresWebSearch: false,
  });
  const executionPolicy = await resolveSkillExecutionPolicy({ skill: normalizedSkill });
  return { skill, executionPolicy };
}

export async function preparePresentationSlideBundle(
  input: PreparePresentationSlideBundleInput,
): Promise<PreparePresentationSlideBundleResult> {
  const trimmedArticle = normalizeGeneratedPresentationArticle(input.article);
  if (!trimmedArticle) {
    throw new Error("Article is required");
  }
  const maxPages = estimatePresentationMaxPages(trimmedArticle, input.preferredLanguage);
  const plannedImageCount = clampPreparedImageCount(input.targetImageCount, maxPages);
  const fallbackPlan = buildFallbackImagePromptPlan(
    { ...input, article: trimmedArticle },
    maxPages,
    plannedImageCount,
  );
  const { skill, executionPolicy } = await resolveSlideSkillForPlanning(input.slideSkillId, input);

  let imagePrompts = fallbackPlan;
  let modelId: string | undefined;
  try {
    const result = await executeSkillLlmWithFallback({
      messages: [
        {
          role: "system",
          content: [
            "You are a presentation visual director and image-planning assistant.",
            skill.systemPrompt?.trim()
              ? `Downstream slide skill guidance:\n${skill.systemPrompt.trim()}`
              : "",
            "Return strict JSON only.",
          ].filter(Boolean).join("\n\n"),
        },
        {
          role: "user",
          content: buildPresentationImagePromptPlanPrompt({
            topic: input.topic,
            article: trimmedArticle,
            preferredLanguage: input.preferredLanguage,
            maxPages,
            plannedImageCount,
            canvasRatio: input.canvasRatio,
            imagePromptContext: input.imagePromptContext,
            slideSkillName: skill.name || skill.id || input.slideSkillId,
          }),
        },
      ],
      skillSlug: input.slideSkillId,
      userId: input.userId,
      executionPolicy,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: 4_000,
    });

    if (result.success && result.content?.trim()) {
      imagePrompts = normalizeImagePromptPlan(
        safeJsonParse(result.content),
        fallbackPlan,
        maxPages,
        plannedImageCount,
      );
      modelId = result.modelId;
    }
  } catch {
    imagePrompts = fallbackPlan;
  }

  const slidePayload = buildPresentationSlideRequestPayload({
    topic: input.topic,
    article: trimmedArticle,
    preferredLanguage: input.preferredLanguage,
    canvasRatio: input.canvasRatio,
    outputFormats: input.outputFormats,
    maxPages,
  });

  return {
    maxPages,
    plannedImageCount,
    slideSkillLabel: skill.name || skill.id || input.slideSkillId,
    imagePrompts,
    slidePayload,
    slidePayloadJson: JSON.stringify(slidePayload, null, 2),
    modelId,
  };
}

export async function generatePresentationSlideDraft(
  input: GeneratePresentationSlideDraftInput,
): Promise<GeneratePresentationSlideDraftResult> {
  const trimmedArticle = normalizeGeneratedPresentationArticle(input.article);
  if (!trimmedArticle) {
    throw new Error("Article is required");
  }
  const imageAssets = input.imageAssets
    .map((asset) => ({
      ...asset,
      url: String(asset.url ?? "").trim(),
    }))
    .filter((asset) => asset.url);
  if (imageAssets.length === 0) {
    throw new Error("Generate slide images first");
  }

  const { skill, executionPolicy } = await resolveSlideSkillForPlanning(input.slideSkillId, input);
  const slidePayload = buildPresentationSlideRequestPayload({
    topic: input.topic,
    article: trimmedArticle,
    preferredLanguage: input.preferredLanguage,
    canvasRatio: input.canvasRatio,
    outputFormats: input.outputFormats,
    maxPages: input.maxPages,
    imageAssets,
  });
  const slidePayloadJson = JSON.stringify(slidePayload, null, 2);
  const usesSandboxSkill = String(skill.executionMode ?? "").trim().toLowerCase() === "sandbox-command";
  const generateSlideJsonViaLlm = async (): Promise<{ slideJson: string; modelId?: string }> => {
    const result = await executeSkillLlmWithFallback({
      messages: [
        {
          role: "system",
          content: [
            skill.systemPrompt?.trim() || "You are a premium slide layout planner.",
            "Return strict JSON only.",
            "Do not wrap the response in markdown fences.",
            "Use all supplied image URLs as separate image objects, never flatten them into a single bitmap.",
          ].join("\n\n"),
        },
        {
          role: "user",
          content: [
            "Generate the slide layout JSON for the following request.",
            "The final consumer is the Presentation Editor, so return JSON layout data only.",
            "Even if outputFormats contains md/pptx/pdf, this immediate response must be JSON.",
            "",
            slidePayloadJson,
          ].join("\n"),
        },
      ],
      skillSlug: input.slideSkillId,
      userId: input.userId,
      executionPolicy,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: 6_000,
    });

    if (!result.success || !result.content?.trim()) {
      throw new Error(result.error || "Failed to generate slide JSON");
    }

    const normalizedJson = normalizeImportableSlideJson(
      trimSlideJson(stripOuterCodeFences(result.content)),
    );
    return {
      slideJson: normalizedJson ?? trimSlideJson(stripOuterCodeFences(result.content)),
      modelId: result.modelId,
    };
  };
  let slideJson = "";
  let modelId: string | undefined;
  let artifactJobId: string | null = null;
  let artifacts: PresentationSlideArtifact[] = [];
  let downloadUrl: string | null = null;
  let artifactFailureMessage: string | null = null;
  const requestedArtifactFormats = input.outputFormats.filter((format) => format === "pptx" || format === "pdf");

  if (usesSandboxSkill) {
    try {
      const dispatchResult = await executeSkill(
        skill,
        {
          prompt: trimmedArticle,
          extraParams: slidePayload as unknown as Record<string, unknown>,
        },
        input.userId,
        createInternalTokenFromAuth({ userId: input.userId }, ["skill:execute"]),
        input.tenantId,
      );

      if (!dispatchResult.success) {
        throw new Error(dispatchResult.error || "Failed to start slide artifact generation");
      }
      artifactJobId = dispatchResult.jobId ?? null;
      if (!artifactJobId) {
        throw new Error("Slide artifact generation did not return a job id");
      }
      artifacts = await waitForSlideArtifacts({
        tenantId: input.tenantId,
        jobId: artifactJobId,
      });
      slideJson = await resolveSlideJsonFromArtifacts(artifacts, "");
      slideJson = normalizeImportableSlideJson(slideJson) ?? slideJson;
      if (!isImportableSlideJson(slideJson)) {
        throw new Error("Sandbox slide skill completed but did not produce importable slide JSON");
      }
      downloadUrl = (
        artifacts.find((artifact) => artifact.format === "pptx")
        ?? artifacts.find((artifact) => artifact.format === "pdf")
        ?? artifacts.find((artifact) => artifact.isPrimary)
        ?? artifacts[0]
      )?.url ?? null;
    } catch (error) {
      if (requestedArtifactFormats.length > 0 && isImportableSlideJson(slideJson)) {
        artifactJobId = null;
        artifacts = [];
        downloadUrl = null;
        artifactFailureMessage = error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Slide artifact generation failed";
      } else {
        if (requestedArtifactFormats.length > 0) {
          const llmFallback = await generateSlideJsonViaLlm();
          slideJson = llmFallback.slideJson;
          if (!isImportableSlideJson(slideJson)) {
            throw error;
          }
          modelId = llmFallback.modelId;
          artifactJobId = null;
          artifacts = [];
          downloadUrl = null;
          artifactFailureMessage = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Slide artifact generation failed";
        } else {
          throw error;
        }
      }
    }
    if (requestedArtifactFormats.length === 0) {
      artifactJobId = null;
    }
  } else {
    const llmResult = await generateSlideJsonViaLlm();
    slideJson = llmResult.slideJson;
    modelId = llmResult.modelId;
  }

  return {
    maxPages: clampSlideCount(input.maxPages),
    slideSkillLabel: skill.name || skill.id || input.slideSkillId,
    slidePayload,
    slidePayloadJson,
    slideJson,
    modelId,
    artifactJobId,
    artifacts,
    downloadUrl,
    artifactFailureMessage,
  };
}

async function generateArticleWithSkill(
  input: GeneratePresentationArticleInput,
): Promise<GeneratePresentationArticleResult> {
  const skillId = input.skillId?.trim();
  if (!skillId) {
    throw new Error("Skill must be selected");
  }

  const skill = await getSkillByIdAsync(skillId);
  if (!skill) {
    throw new Error("Skill not found");
  }

  const articleSkill = normalizeExecutionPolicy(skill, input);
  const executionPolicy = await resolveSkillExecutionPolicy({ skill: articleSkill });
  const systemPrompt = [
    skill.systemPrompt?.trim() || "You are a senior presentation writer.",
    "Always return a polished article in plain text.",
    "Never return HTML, markdown fences, JSON, or tool chatter.",
  ].join("\n\n");

  const result = await executeSkillLlmWithFallback({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildPresentationArticlePrompt(input) },
    ],
    skillSlug: skillId,
    userId: input.userId,
    executionPolicy,
    enableThinking: input.requiresThinking || undefined,
    maxTokens: 3_200,
  });

  if (!result.success || !result.content?.trim()) {
    throw new Error(result.error || "Failed to generate article from skill");
  }

  const article = trimArticleForDeckNotes(normalizeGeneratedPresentationArticle(result.content));
  if (!article) {
    throw new Error("Skill returned an empty article");
  }

  return {
    article,
    sourceLabel: skill.name || skill.id || skillId,
    modelId: result.modelId,
  };
}

async function generateArticleWithAgency(
  input: GeneratePresentationArticleInput,
): Promise<GeneratePresentationArticleResult> {
  const agencyId = input.agencyId?.trim();
  if (!agencyId) {
    throw new Error("Agency must be selected");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [agency] = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      description: agencies.description,
      systemPrompt: agencies.systemPrompt,
      status: agencies.status,
      visibility: agencies.visibility,
      createdBy: agencies.createdBy,
    })
    .from(agencies)
    .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, input.tenantId)))
    .limit(1);

  if (!agency) {
    throw new Error("Agency not found");
  }

  const isTemplate = agency.visibility === "template";
  const isOwnAgency = agency.createdBy === input.userId;
  const isRunnable = agency.status === "published" || isTemplate || isOwnAgency;
  if (!isRunnable || agency.status === "archived") {
    throw new Error("Agency is not ready to run yet");
  }

  const conversationId = crypto.randomUUID();
  await db.insert(agencyConversations).values({
    id: conversationId,
    agencyId: agency.id,
    tenantId: input.tenantId,
    userId: input.userId,
    title: `Presentation Article: ${input.topic.slice(0, 120) || "Article"}`,
    source: "web",
  });

  const userToken = createInternalTokenFromAuth({ userId: input.userId }, ["agency:run"]);
  const result = await agencyBridge.executeRun({
    agencyId: agency.id,
    conversationId,
    message: buildPresentationArticlePrompt(input),
    userToken,
    tenantId: input.tenantId,
    userId: input.userId,
    additionalInstructions: [
      `Selected agency: ${agency.name}`,
      agency.systemPrompt?.trim() ? `Agency system prompt:\n${agency.systemPrompt.trim()}` : "",
      "Return only the final plain-text article.",
    ].filter(Boolean).join("\n\n"),
  });

  const article = trimArticleForDeckNotes(normalizeGeneratedPresentationArticle(result.response || ""));
  if (!article) {
    throw new Error("Agency returned an empty article");
  }

  return {
    article,
    sourceLabel: agency.name,
  };
}

export async function generatePresentationArticle(
  input: GeneratePresentationArticleInput,
): Promise<GeneratePresentationArticleResult> {
  if (input.executionSource === "agency") {
    return generateArticleWithAgency(input);
  }
  return generateArticleWithSkill(input);
}
