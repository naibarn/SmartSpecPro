import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";
import { and, eq } from "drizzle-orm";
import type { SkillDefinition } from "@smartspec/skills";

import { createInternalTokenFromAuth } from "../_core/tokens";
import { getDb } from "../db";
import { storageReadText } from "../storage";
import { agencyBridge } from "./agencyBridge";
import { deductCredits, deductCreditsForModel } from "./creditService";
import {
  compileModernEditorialDeck,
  type ModernEditorialPreflightPage,
} from "./modernEditorialSlideCompiler";
import { executeSkill } from "./skillExecutor";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import {
  applyPresentationSkillPayloadAdapter,
  mergePresentationSkillPayloadOverride,
} from "./presentationSkillPayloadAdapters";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import type { SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import { getSkillByIdAsync, syncSingleSkillIfChanged } from "./skillRegistry";
import { getJobArtifactUrls } from "./sandbox/artifactAccess";
import { agencies, agencyConversations, sandboxJobs } from "../../drizzle/schema";
import {
  buildEditorialLayoutPlannerPayload,
  type EditorialPlannerAudiencePreset,
  type EditorialPlannerFitPreset,
  type EditorialPlannerImageAssetInput,
  type EditorialPlannerJsonObject,
  type EditorialPlannerPageCountMode,
  type EditorialPlannerTonePreset,
} from "@shared/presentation/editorialLayoutPlanner";
import {
  hasImportableGeneratedSlides,
  inspectGeneratedSlideImportability,
} from "@shared/presentation/generatedSlideImportability";

type ArticleExecutionSource = "skill" | "agency";
const MAX_PRESENTATION_ARTICLE_CHARS = 19_500;
const MAX_PRESENTATION_SLIDE_JSON_CHARS = 120_000;
const SUPPORTED_SLIDE_CANVAS_RATIOS = ["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"] as const;
const SUPPORTED_SLIDE_OUTPUT_FORMATS = ["json", "md", "pptx", "pdf"] as const;
const MODERN_EDITORIAL_SLIDE_SKILL_ID = "modern-editorial-slide";
const EDITORIAL_LAYOUT_PLANNER_SKILL_ID = "editorial-layout-planner";

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

export interface PresentationEditorialPlannerOptions {
  targetAudience?: EditorialPlannerAudiencePreset;
  tonePreset?: EditorialPlannerTonePreset;
  fitPreset?: EditorialPlannerFitPreset;
  pageCountMode?: EditorialPlannerPageCountMode;
  requestedPageCount?: number;
  globalStylePrompt?: string | null;
  renderSafety?: EditorialPlannerJsonObject | null;
  pageFillRules?: EditorialPlannerJsonObject | null;
  qualityOptimizer?: EditorialPlannerJsonObject | null;
  imageAssets?: EditorialPlannerImageAssetInput[];
}

export interface PresentationArticlePagePlan {
  pageNumber: number;
  titleHint: string;
  text: string;
  pageIntentHint?: string;
  preferredArchetype?: string;
  recommendedImageCount?: number;
  estimatedReadSeconds?: number;
}

export interface PresentationSlideSkillRequestPayload {
  [key: string]: unknown;
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
  editorialPlannerOptions?: PresentationEditorialPlannerOptions;
  existingImageAssets?: PresentationSlideImageAsset[];
}

export interface PreparePresentationSlideBundleResult {
  maxPages: number;
  plannedImageCount: number;
  slideSkillLabel: string;
  article?: string;
  imagePrompts: PresentationSlideImagePrompt[];
  slidePayload: PresentationSlideSkillRequestPayload;
  slidePayloadJson: string;
  modelId?: string;
  preflightPages?: ModernEditorialPreflightPage[];
  preflightWarnings?: string[];
}

export interface GeneratePresentationSlideDraftInput extends PreparePresentationSlideBundleInput {
  tenantId: string;
  imageAssets?: PresentationSlideImageAsset[];
  maxPages: number;
  pageImagePlanOverrides?: Array<{
    pageNumber: number;
    maxImagesOverride: number;
  }>;
  slidePayloadOverrideJson?: string | null;
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
  generatedAt?: string | null;
  selectedSkillId?: string;
  selectedSkillName?: string | null;
  executionSkillId?: string | null;
  executionSkillName?: string | null;
  runtimeBundleSkillId?: string | null;
  runtimeBundleSkillName?: string | null;
  runtimeAliasApplied?: boolean;
  artifactJobId?: string | null;
  artifacts?: PresentationSlideArtifact[];
  downloadUrl?: string | null;
  artifactFailureMessage?: string | null;
  debugTracePath?: string | null;
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

function clampPreparedImageCount(value: number, maxPages: number): number {
  const lowerBound = Math.max(1, maxPages);
  const upperBound = Math.max(lowerBound, maxPages * 3);
  if (!Number.isFinite(value)) {
    return Math.min(upperBound, Math.max(lowerBound, maxPages * 2));
  }
  return Math.max(lowerBound, Math.min(upperBound, Math.round(value)));
}

function isDeterministicEditorialSlideSkill(skillId: string | null | undefined): boolean {
  const normalized = String(skillId ?? "").trim();
  return normalized === MODERN_EDITORIAL_SLIDE_SKILL_ID;
}

function resolveEffectivePresentationSlideMaxPages(params: {
  slideSkillId?: string | null;
  maxPages: number;
  editorialPlannerOptions?: PresentationEditorialPlannerOptions;
}): number {
  const fallbackMaxPages = clampSlideCount(params.maxPages);
  if (String(params.slideSkillId ?? "").trim() !== EDITORIAL_LAYOUT_PLANNER_SKILL_ID) {
    return fallbackMaxPages;
  }
  if (params.editorialPlannerOptions?.pageCountMode !== "fixed") {
    return fallbackMaxPages;
  }
  const requestedPageCount = Number(params.editorialPlannerOptions?.requestedPageCount ?? NaN);
  return Number.isFinite(requestedPageCount) ? clampSlideCount(requestedPageCount) : fallbackMaxPages;
}

function mergeEditorialPlannerReferenceAssets(params: {
  slideSkillId?: string | null;
  imageAssets: PresentationSlideImageAsset[];
  editorialPlannerOptions?: PresentationEditorialPlannerOptions;
}): PresentationSlideImageAsset[] {
  const baseAssets = params.imageAssets
    .map((asset) => ({
      ...asset,
      url: String(asset.url ?? "").trim(),
    }))
    .filter((asset) => asset.url);
  if (String(params.slideSkillId ?? "").trim() !== EDITORIAL_LAYOUT_PLANNER_SKILL_ID) {
    return baseAssets;
  }

  const mergedAssets = baseAssets.slice();
  const seenReferences = new Set(
    mergedAssets.map((asset) => `${asset.pageNumber}:${asset.url.trim().toLowerCase()}`),
  );
  const nextImageIndexByPage = new Map<number, number>();
  for (const asset of mergedAssets) {
    nextImageIndexByPage.set(asset.pageNumber, Math.max(nextImageIndexByPage.get(asset.pageNumber) ?? 1, asset.imageIndex + 1));
  }

  for (const plannerAsset of params.editorialPlannerOptions?.imageAssets ?? []) {
    const reference = String(plannerAsset.reference ?? "").trim();
    if (!reference) {
      continue;
    }
    const pageNumber = clampSlideCount(Number(plannerAsset.page_hint ?? 1));
    const dedupeKey = `${pageNumber}:${reference.toLowerCase()}`;
    if (seenReferences.has(dedupeKey)) {
      continue;
    }
    const imageIndex = nextImageIndexByPage.get(pageNumber) ?? 1;
    nextImageIndexByPage.set(pageNumber, imageIndex + 1);
    seenReferences.add(dedupeKey);
    mergedAssets.push({
      id: `planner-ref-${pageNumber}-${imageIndex}-${mergedAssets.length + 1}`,
      pageNumber,
      imageIndex,
      placementRole: "supporting",
      shortLabel: String(plannerAsset.label ?? "").trim() || `Reference ${mergedAssets.length + 1}`,
      prompt: String(plannerAsset.prompt ?? "").trim(),
      url: reference,
    });
  }

  return mergedAssets;
}

function buildEditorialPlannerImageAssetInputs(params: {
  imageAssets: PresentationSlideImageAsset[];
  plannerImageAssets?: EditorialPlannerImageAssetInput[] | null;
}): EditorialPlannerImageAssetInput[] {
  const combined: EditorialPlannerImageAssetInput[] = [];
  const seen = new Set<string>();

  const pushAsset = (asset: EditorialPlannerImageAssetInput | null | undefined) => {
    if (!asset) {
      return;
    }
    const assetType = asset.asset_type === "uploaded_image" ? "uploaded_image" : "image_prompt";
    const pageHint = Number.isFinite(asset.page_hint) ? clampSlideCount(Number(asset.page_hint)) : undefined;
    const label = String(asset.label ?? "").trim() || (assetType === "uploaded_image" ? "Uploaded image" : "Image prompt");
    const prompt = String(asset.prompt ?? "").trim();
    const reference = String(asset.reference ?? "").trim();
    if (assetType === "uploaded_image" && !reference) {
      return;
    }
    if (assetType === "image_prompt" && !prompt) {
      return;
    }
    const dedupeValue = assetType === "uploaded_image" ? reference.toLowerCase() : prompt.toLowerCase();
    const dedupeKey = `${assetType}:${pageHint ?? "any"}:${dedupeValue}`;
    if (!dedupeValue || seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    combined.push({
      id: String(asset.id ?? "").trim() || undefined,
      asset_type: assetType,
      label,
      ...(typeof pageHint === "number" ? { page_hint: pageHint } : {}),
      ...(prompt ? { prompt } : {}),
      ...(reference ? { reference } : {}),
    });
  };

  for (const plannerAsset of params.plannerImageAssets ?? []) {
    pushAsset(plannerAsset);
  }

  for (const asset of params.imageAssets) {
    pushAsset({
      id: asset.id,
      asset_type: "uploaded_image",
      label: `Page ${asset.pageNumber} · ${asset.shortLabel || `image ${asset.imageIndex}`}`,
      page_hint: asset.pageNumber,
      reference: asset.url,
      prompt: asset.prompt,
    });
  }

  return combined;
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

function estimatePageReadSeconds(text: string, language: "th" | "en"): number {
  const units = language === "th" ? countThaiWordUnits(text) : countEnglishWords(text);
  const unitsPerSecond = language === "th" ? 3 : 3.4;
  return Math.max(1, Math.round(units / unitsPerSecond));
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

function buildPresentationSemanticPagePlanPrompt(input: {
  topic: string;
  article: string;
  preferredLanguage?: "th" | "en";
  maxPages: number;
  exactPageCount?: number;
  canvasRatio: PresentationSlideCanvasRatio;
  slideSkillName: string;
}): string {
  const language = input.preferredLanguage ?? inferArticleLanguage(input.article || input.topic);
  const languageLabel = language === "th" ? "Thai" : "English";
  const textBudget = language === "th"
    ? "18-24 Thai word units or about 120-160 Thai characters"
    : "20-28 English words or about 140-180 characters";

  return [
    "Create a semantic slide-page plan from the source article.",
    `Topic: ${input.topic.trim()}`,
    `Language: ${languageLabel} (${language})`,
    `Canvas ratio: ${input.canvasRatio}`,
    `Slide skill: ${input.slideSkillName}`,
    input.exactPageCount
      ? `Fixed page count: exactly ${clampSlideCount(input.exactPageCount)} pages`
      : `Maximum pages: ${clampSlideCount(input.maxPages)}`,
    "Page duration target: each page should be readable in 7-8 seconds.",
    `Per-page visible text target: ${textBudget}.`,
    input.exactPageCount
      ? "Rewrite the article first so the whole story naturally fits the fixed page count. Keep the rewritten article coherent and complete."
      : "Do not rewrite the whole article; only create coherent page briefs from it.",
    "",
    "Rules:",
    input.exactPageCount
      ? "- Return exactly the fixed page count. Do not return fewer or more pages."
      : "- Choose the natural page count from the article, from 1 up to Maximum pages.",
    "- Keep each page focused on one coherent topic or idea.",
    "- Do not split a sentence or idea across pages in a way that makes it hard to understand.",
    "- If a source section is too long, summarize its key point instead of copying all details.",
    "- Prefer short complete sentences over fragments.",
    "- Preserve factual meaning from the source article; do not invent new claims.",
    "- Page 1 may be a concise cover/lead page.",
    "- The last page may be a closing or summary page only when the article naturally supports it.",
    "",
    "Return strict JSON only with this shape:",
    "{",
    input.exactPageCount ? "  \"rewritten_article\": \"plain text article rewritten to fit the fixed page count\"," : "",
    "  \"pages\": [",
    "    {",
    "      \"page_number\": 1,",
    "      \"title_hint\": \"short headline\",",
    "      \"text\": \"readable page text\",",
    "      \"page_intent_hint\": \"cover | content | summary | closing\",",
    "      \"estimated_read_seconds\": 7",
    "    }",
    "  ]",
    "}",
    "",
    "<article>",
    input.article.trim(),
    "</article>",
  ].join("\n");
}

function normalizeSemanticPagePlans(
  raw: unknown,
  fallbackPlans: PresentationArticlePagePlan[],
  input: {
    maxPages: number;
    exactPageCount?: number;
    preferredLanguage?: "th" | "en";
    fallbackTopic: string;
  },
): { pages: PresentationArticlePagePlan[]; warnings: string[]; usedFallback: boolean; rewrittenArticle?: string } {
  const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawPages = Array.isArray(record.pages) ? record.pages : [];
  const language = input.preferredLanguage ?? inferArticleLanguage(input.fallbackTopic);
  const maxPages = clampSlideCount(input.maxPages);
  const exactPageCount = input.exactPageCount ? clampSlideCount(input.exactPageCount) : null;
  const pages: PresentationArticlePagePlan[] = [];
  const warnings: string[] = [];
  const rewrittenArticle = normalizeGeneratedPresentationArticle(String(record.rewritten_article ?? record.rewrittenArticle ?? "")).trim();

  for (const rawPage of rawPages.slice(0, exactPageCount ?? maxPages)) {
    if (!rawPage || typeof rawPage !== "object") {
      continue;
    }
    const pageRecord = rawPage as Record<string, unknown>;
    const titleHint = String(pageRecord.title_hint ?? pageRecord.titleHint ?? "").trim();
    const text = normalizeGeneratedPresentationArticle(String(pageRecord.text ?? "")).trim();
    if (!titleHint && !text) {
      continue;
    }
    const estimatedReadSeconds = Number.isFinite(Number(pageRecord.estimated_read_seconds))
      ? Math.max(1, Math.min(30, Math.round(Number(pageRecord.estimated_read_seconds))))
      : estimatePageReadSeconds([titleHint, text].filter(Boolean).join("\n\n"), language);
    if (estimatedReadSeconds > 9) {
      warnings.push(`Page ${pages.length + 1} may exceed the 7-8 second reading target.`);
    }
    pages.push({
      pageNumber: pages.length + 1,
      titleHint: titleHint || `${input.fallbackTopic} ${pages.length + 1}`,
      text: [titleHint, text].filter(Boolean).join("\n\n"),
      pageIntentHint: String(pageRecord.page_intent_hint ?? pageRecord.pageIntentHint ?? "").trim() || undefined,
      estimatedReadSeconds,
    });
  }

  if (pages.length === 0) {
    return {
      pages: fallbackPlans.map((page) => ({
        ...page,
        estimatedReadSeconds: estimatePageReadSeconds(page.text, language),
      })),
      warnings: ["Semantic page planning returned no usable pages, so deterministic planning was used."],
      usedFallback: true,
    };
  }

  if (exactPageCount && pages.length !== exactPageCount) {
    warnings.push(`Fixed page planning requested ${exactPageCount} pages but the semantic planner returned ${pages.length}.`);
  }

  return {
    pages,
    warnings,
    usedFallback: false,
    rewrittenArticle: rewrittenArticle || (exactPageCount
      ? [
          input.fallbackTopic,
          "",
          ...pages.map((page) => page.text.trim()).filter(Boolean),
        ].join("\n\n").trim()
      : undefined),
  };
}

async function buildSemanticPresentationPagePlans(input: {
  topic: string;
  article: string;
  slideSkillId: string;
  preferredLanguage?: "th" | "en";
  requiresThinking?: boolean;
  maxPages: number;
  exactPageCount?: number;
  canvasRatio: PresentationSlideCanvasRatio;
  skill: SkillDefinition;
  executionPolicy: SkillExecutionPolicyResult;
  userId: number;
}): Promise<{
  pages: PresentationArticlePagePlan[];
  warnings: string[];
  modelId?: string;
  rewrittenArticle?: string;
}> {
  const fallbackPlans = buildPresentationPagePlans(input.article, input.topic, input.maxPages);
  try {
    const result = await executeSkillLlmWithFallback({
      messages: [
        {
          role: "system",
          content: [
            "You are a senior presentation editor. Your only job is semantic pagination.",
            "Split source articles into coherent page briefs for slide creation.",
            "Return strict JSON only.",
          ].join("\n\n"),
        },
        {
          role: "user",
          content: buildPresentationSemanticPagePlanPrompt({
            topic: input.topic,
            article: input.article,
            preferredLanguage: input.preferredLanguage,
            maxPages: input.maxPages,
            exactPageCount: input.exactPageCount,
            canvasRatio: input.canvasRatio,
            slideSkillName: input.skill.name || input.skill.id || input.slideSkillId,
          }),
        },
      ],
      skillSlug: input.slideSkillId,
      userId: input.userId,
      executionPolicy: input.executionPolicy,
      maxModelAttempts: 1,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: 4_000,
    });

    if (!result.success || !result.content?.trim()) {
      throw new Error(result.error || "Semantic page planning failed");
    }

    const normalized = normalizeSemanticPagePlans(safeJsonParse(result.content), fallbackPlans, {
      maxPages: input.maxPages,
      preferredLanguage: input.preferredLanguage,
      fallbackTopic: input.topic,
      exactPageCount: input.exactPageCount,
    });
    if (!normalized.usedFallback) {
      await chargePresentationSkillLlmUsage({
        userId: input.userId,
        skillSlug: input.slideSkillId,
        operation: "presentation.semantic_page_plan",
        result,
      });
    }
    return {
      pages: normalized.pages,
      warnings: normalized.warnings,
      modelId: result.modelId,
      rewrittenArticle: normalized.rewrittenArticle,
    };
  } catch {
    return {
      pages: fallbackPlans,
      warnings: ["Semantic page planning failed, so deterministic planning was used."],
    };
  }
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
  const normalizedExecutionMode = String(skill.executionMode ?? "").trim().toLowerCase();
  if (
    String(skill.id ?? "").trim() === EDITORIAL_LAYOUT_PLANNER_SKILL_ID
    && (normalizedExecutionMode === "" || normalizedExecutionMode === "llm" || normalizedExecutionMode === "llm-only")
  ) {
    nextRequirements.supportsStructuredOutputs = true;
  }

  const hasRequirements = Object.keys(nextRequirements).length > 0;

  return {
    ...skill,
    executionPolicy: hasRequirements
      ? {
          ...rawPolicy,
          requirements: nextRequirements,
        }
      : rawPolicy,
  };
}

function resolveSkillAdjacentPathCandidates(
  skillFilePath: string,
  relativePath: string,
): string[] {
  const skillDir = path.dirname(skillFilePath);
  const cwd = process.cwd();
  const baseDirs = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ];
  const candidates = [
    ...baseDirs.map((baseDir) => path.resolve(baseDir, skillDir, relativePath)),
    ...baseDirs.map((baseDir) => path.resolve(baseDir, skillFilePath, "..", relativePath)),
    ...baseDirs.map((baseDir) => path.resolve(baseDir, relativePath)),
  ];
  return Array.from(new Set(candidates));
}

async function loadSlideSkillStructuredOutputSchema(params: {
  skill: SkillDefinition;
  expectedOutputFormat?: string | null;
}): Promise<{ name: string; schema: Record<string, unknown>; schemaPath: string } | null> {
  const skillFilePath = String(params.skill.skillFilePath ?? "").trim();
  if (!skillFilePath) {
    return null;
  }

  const schemaCandidates = [
    ...resolveSkillAdjacentPathCandidates(skillFilePath, "output.schema.json"),
    ...resolveSkillAdjacentPathCandidates(skillFilePath, "schemas/output.schema.json"),
  ];

  let resolvedPath: string | null = null;
  let parsedSchema: Record<string, unknown> | null = null;
  for (const candidatePath of schemaCandidates) {
    try {
      const raw = await fs.readFile(candidatePath, "utf8");
      parsedSchema = JSON.parse(raw) as Record<string, unknown>;
      resolvedPath = candidatePath;
      break;
    } catch {
      continue;
    }
  }

  if (!resolvedPath || !parsedSchema) {
    return null;
  }

  const requestedFormat = String(params.expectedOutputFormat ?? "").trim();
  let effectiveSchema: Record<string, unknown> = parsedSchema;
  const oneOf = Array.isArray(parsedSchema.oneOf)
    ? parsedSchema.oneOf.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    : [];

  if (requestedFormat && oneOf.length > 0) {
    const matchingVariant = oneOf.find((entry) => {
      const title = String(entry.title ?? "").trim();
      if (title === requestedFormat) {
        return true;
      }
      const properties = entry.properties;
      if (!properties || typeof properties !== "object") {
        return false;
      }
      const outputFormatRecord = (properties as Record<string, unknown>).output_format;
      if (!outputFormatRecord || typeof outputFormatRecord !== "object") {
        return false;
      }
      return String((outputFormatRecord as Record<string, unknown>).const ?? "").trim() === requestedFormat;
    });
    if (matchingVariant) {
      effectiveSchema = {
        ...(parsedSchema.$schema ? { $schema: parsedSchema.$schema } : {}),
        ...(parsedSchema.$id ? { $id: parsedSchema.$id } : {}),
        ...(parsedSchema.$defs ? { $defs: parsedSchema.$defs } : {}),
        ...matchingVariant,
      };
    }
  }

  const normalizeStrictObjectSchema = (value: unknown): unknown => {
    if (!value || typeof value !== "object") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => normalizeStrictObjectSchema(entry));
    }

    const record = value as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (Array.isArray(entry)) {
        record[key] = entry.map((item) => normalizeStrictObjectSchema(item));
      } else if (entry && typeof entry === "object") {
        record[key] = normalizeStrictObjectSchema(entry);
      }
    }

    if (record.type === "object" && record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
      const propertyKeys = Object.keys(record.properties as Record<string, unknown>);
      if (propertyKeys.length > 0) {
        const required = new Set(
          Array.isArray(record.required)
            ? record.required.map((item) => String(item))
            : [],
        );
        for (const key of propertyKeys) {
          required.add(key);
        }
        record.required = Array.from(required);
      }
    }

    return record;
  };

  const stripUnsupportedCombinators = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((entry) => stripUnsupportedCombinators(entry));
    }
    if (!value || typeof value !== "object") {
      return value;
    }

    const record = { ...(value as Record<string, unknown>) };
    const combinatorKeys = ["oneOf", "anyOf", "allOf"] as const;
    for (const key of combinatorKeys) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      const branches = Array.isArray(record[key])
        ? (record[key] as Array<Record<string, unknown>>).filter((entry) => !!entry && typeof entry === "object")
        : [];
      const hasStructuralShape =
        typeof record.type === "string"
        || record.properties !== undefined
        || record.items !== undefined
        || record.enum !== undefined
        || record.const !== undefined;
      if (!hasStructuralShape && branches.length > 0) {
        return stripUnsupportedCombinators(branches[0]);
      }
      delete record[key];
    }

    if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
      const nextProperties: Record<string, unknown> = {};
      for (const [propKey, propVal] of Object.entries(record.properties as Record<string, unknown>)) {
        nextProperties[propKey] = stripUnsupportedCombinators(propVal);
      }
      record.properties = nextProperties;
    }

    if (record.items !== undefined) {
      record.items = stripUnsupportedCombinators(record.items);
    }

    if (record.$defs && typeof record.$defs === "object" && !Array.isArray(record.$defs)) {
      const nextDefs: Record<string, unknown> = {};
      for (const [defKey, defVal] of Object.entries(record.$defs as Record<string, unknown>)) {
        nextDefs[defKey] = stripUnsupportedCombinators(defVal);
      }
      record.$defs = nextDefs;
    }

    for (const [key, entry] of Object.entries(record)) {
      if (key === "properties" || key === "items" || key === "$defs" || combinatorKeys.includes(key as typeof combinatorKeys[number])) {
        continue;
      }
      if (Array.isArray(entry)) {
        record[key] = entry.map((item) => stripUnsupportedCombinators(item));
      } else if (entry && typeof entry === "object") {
        record[key] = stripUnsupportedCombinators(entry);
      }
    }

    return record;
  };

  effectiveSchema = stripUnsupportedCombinators(normalizeStrictObjectSchema(effectiveSchema)) as Record<string, unknown>;

  const schemaNameBase = String(params.skill.id || params.skill.name || "slide_skill")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "slide_skill";
  const schemaNameSuffix = requestedFormat
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return {
    name: schemaNameSuffix ? `${schemaNameBase}_${schemaNameSuffix}` : schemaNameBase,
    schema: effectiveSchema,
    schemaPath: resolvedPath,
  };
}

export function buildPresentationArticlePrompt(input: Pick<
  GeneratePresentationArticleInput,
  "topic" | "preferredLanguage" | "requiresThinking" | "requiresWebSearch" | "targetImageCount"
>): string {
  const targetWords = 1_200;
  const language = input.preferredLanguage ?? inferArticleLanguage(input.topic);
  const languageLabel = language === "th" ? "Thai" : "English";

  return [
    `Topic: ${input.topic.trim()}`,
    `Preferred language: ${languageLabel}`,
    `Language code: ${language}`,
    `Web search priority: ${input.requiresWebSearch ? "Use current facts when available." : "Use general knowledge unless the topic already includes current facts."}`,
    `Thinking mode: ${input.requiresThinking ? "Use deeper reasoning before writing." : "Keep the reasoning lightweight and direct."}`,
    "Write a finished source article for a future presentation workflow.",
    "The article will later be semantically split into slide pages by a planning model.",
    "Organize the article into coherent numbered sections, but do not optimize around a fixed image count.",
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

function slugifyDebugFragment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "debug";
}

async function writePresentationSlideDebugSnapshot(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const dir = path.join("/tmp", "presentation-slide-debug");
    await fs.mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const userId = Number(payload.userId);
    const skillId = slugifyDebugFragment(String(payload.skillId ?? "slide-skill"));
    const fileName = `${timestamp}-u${Number.isFinite(userId) ? userId : "x"}-${skillId}.json`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return filePath;
  } catch {
    return null;
  }
}

function extractImportableSlideSpec(
  value: unknown,
  referenceLookup?: Map<string, string>,
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = safeJsonParse(value);
    return parsed ? extractImportableSlideSpec(parsed, referenceLookup) : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [];

  if (record.output_format === "render_manifest_json" && Array.isArray(record.pages)) {
    const converted = convertEditorialRenderManifestToSlideSpec(record, referenceLookup);
    if (converted) {
      candidates.push(converted);
    }
  }

  if (Array.isArray(record.slides) && record.slides.length > 0) {
    candidates.push(record);
    const convertedSummarySlides = convertSummarySlidesToSlideSpec(record, referenceLookup);
    if (convertedSummarySlides) {
      candidates.push(convertedSummarySlides);
    }
  }

  if (Array.isArray(record.pages) && record.pages.length > 0) {
    const convertedSummaryPages = convertSummaryEntriesToSlideSpec({
      record,
      entries: record.pages,
      referenceLookup,
    });
    if (convertedSummaryPages) {
      candidates.push(convertedSummaryPages);
    }
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
    const extracted = extractImportableSlideSpec(candidate, referenceLookup);
    if (extracted) {
      candidates.push(extracted);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const scoreCandidate = (candidate: Record<string, unknown>): number => {
    const slides = Array.isArray(candidate.slides) ? candidate.slides : [];
    return slides.filter((slide) => {
      if (!slide || typeof slide !== "object") {
        return false;
      }
      const record = slide as Record<string, unknown>;
      if (record.slideContent && typeof record.slideContent === "object") {
        return true;
      }
      const elements = Array.isArray(record.elements) ? record.elements : [];
      return elements.some((element) => element && typeof element === "object");
    }).length;
  };

  return candidates.reduce<Record<string, unknown> | null>((best, candidate) => {
    if (!best) {
      return candidate;
    }
    return scoreCandidate(candidate) > scoreCandidate(best)
      ? candidate
      : best;
  }, null);
}

function inferCanvasRatioFromDimensions(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "16:9";
  }
  const rounded = `${Math.round(width)}x${Math.round(height)}`;
  if (rounded === "1080x1080" || rounded === "1024x1024") {
    return "1:1";
  }
  if (rounded === "1440x1080" || rounded === "1024x768") {
    return "4:3";
  }
  if (rounded === "1080x1440" || rounded === "768x1024") {
    return "3:4";
  }
  if (rounded === "1080x1350") {
    return "4:5";
  }
  if (rounded === "1350x1080") {
    return "5:4";
  }
  if (rounded === "1080x1920" || rounded === "720x1280") {
    return "9:16";
  }
  if (rounded === "1920x1080" || rounded === "1280x720") {
    return "16:9";
  }
  const ratio = width / height;
  if (Math.abs(ratio - (16 / 9)) < 0.05) {
    return "16:9";
  }
  if (Math.abs(ratio - (9 / 16)) < 0.05) {
    return "9:16";
  }
  if (Math.abs(ratio - (4 / 3)) < 0.05) {
    return "4:3";
  }
  if (Math.abs(ratio - (3 / 4)) < 0.05) {
    return "3:4";
  }
  if (Math.abs(ratio - (4 / 5)) < 0.05) {
    return "4:5";
  }
  if (Math.abs(ratio - (5 / 4)) < 0.05) {
    return "5:4";
  }
  if (Math.abs(ratio - 1) < 0.05) {
    return "1:1";
  }
  return "16:9";
}

function inferCanvasRatioFromSummarySpec(value: unknown): PresentationSlideCanvasRatio {
  if (typeof value !== "string") {
    return "16:9";
  }
  const trimmed = value.trim();
  if ((SUPPORTED_SLIDE_CANVAS_RATIOS as readonly string[]).includes(trimmed)) {
    return trimmed as PresentationSlideCanvasRatio;
  }
  const match = trimmed.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (match) {
    return normalizeSlideCanvasRatio(inferCanvasRatioFromDimensions(Number(match[1]), Number(match[2])));
  }
  return "16:9";
}

function pxToPct(value: unknown, total: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Number(((numeric / total) * 100).toFixed(1))));
}

function containsThaiText(value: string): boolean {
  return /[\u0E00-\u0E7F]/.test(value);
}

function normalizeImportedTextLineHeight(value: unknown, text: string): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 1.2;
  return containsThaiText(text)
    ? Math.max(1.5, numeric)
    : Math.max(1, numeric);
}

function estimateImportedTextHeightPx(input: {
  text: string;
  fontSize: number;
  widthPx: number;
  lineHeight: number;
}): number {
  const text = input.text.replace(/\r/g, "").trim();
  if (!text || !Number.isFinite(input.fontSize) || input.fontSize <= 0 || !Number.isFinite(input.widthPx) || input.widthPx <= 0) {
    return 0;
  }

  const isThai = containsThaiText(text);
  const charWidthFactor = isThai ? 0.75 : 0.55;
  const charsPerLine = Math.max(1, Math.floor(input.widthPx / (input.fontSize * charWidthFactor)));
  const lines = text.split("\n").reduce((sum, line) => {
    const normalizedLine = line.trim();
    if (!normalizedLine) {
      return sum + 1;
    }
    return sum + Math.max(1, Math.ceil(normalizedLine.length / charsPerLine));
  }, 0);
  const thaiPaddingPx = isThai ? Math.round(input.fontSize * 0.68) : 0;
  return Math.round(lines * input.fontSize * input.lineHeight) + 8 + thaiPaddingPx;
}

function fitImportedTextStyle(input: {
  text: string;
  role: string;
  fontSize: number;
  widthPx: number;
  heightPx: number;
  lineHeight: unknown;
}): {
  fontSize: number;
  lineHeight: number;
} {
  const text = input.text.trim();
  const normalizedLineHeight = normalizeImportedTextLineHeight(input.lineHeight, text);
  const requestedFontSize = typeof input.fontSize === "number" && Number.isFinite(input.fontSize)
    ? input.fontSize
    : (input.role === "title" ? 52 : 30);
  const widthPx = Math.max(1, input.widthPx);
  const heightPx = Math.max(24, input.heightPx);
  const role = input.role.trim().toLowerCase();
  const minimumFontSize = role === "title" || role === "headline" || role === "pagetitle"
    ? 24
    : role === "caption"
      ? 12
      : 16;

  let fittedFontSize = Math.max(minimumFontSize, Math.round(requestedFontSize));
  while (
    fittedFontSize > minimumFontSize
    && estimateImportedTextHeightPx({
      text,
      fontSize: fittedFontSize,
      widthPx,
      lineHeight: normalizedLineHeight,
    }) > heightPx
  ) {
    fittedFontSize -= 1;
  }

  return {
    fontSize: fittedFontSize,
    lineHeight: normalizedLineHeight,
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (/^#[0-9A-F]{3,8}$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[0-9A-F]{3,8}$/i.test(trimmed)) {
    return `#${trimmed}`;
  }
  return fallback;
}

function normalizeImageReferenceKey(value: string): string {
  return value.trim().toLowerCase();
}

function resolveImageReference(
  value: unknown,
  referenceLookup?: Map<string, string>,
): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const normalizedKey = normalizeImageReferenceKey(trimmed);
  return referenceLookup?.get(normalizedKey) ?? trimmed;
}

function addImageReferenceLookupEntry(
  referenceLookup: Map<string, string>,
  source: unknown,
  aliases: unknown[],
): void {
  const resolvedSource = typeof source === "string" ? source.trim() : "";
  if (!resolvedSource) {
    return;
  }
  for (const alias of aliases) {
    if (typeof alias !== "string") {
      continue;
    }
    const normalizedAlias = normalizeImageReferenceKey(alias);
    if (!normalizedAlias || referenceLookup.has(normalizedAlias)) {
      continue;
    }
    referenceLookup.set(normalizedAlias, resolvedSource);
  }
}

function expandImageReferenceAliases(aliases: unknown[]): unknown[] {
  const expanded: unknown[] = [];
  for (const alias of aliases) {
    expanded.push(alias);
    if (typeof alias !== "string") {
      continue;
    }
    const trimmedAlias = alias.trim();
    const pageScopedAlias = trimmedAlias.replace(/^page\s*\d+\s*[·:-]\s*/i, "").trim();
    if (pageScopedAlias && pageScopedAlias !== trimmedAlias) {
      expanded.push(pageScopedAlias);
    }
  }
  return expanded;
}

function buildImageReferenceLookup(value: unknown): Map<string, string> {
  const referenceLookup = new Map<string, string>();
  if (!value || typeof value !== "object") {
    return referenceLookup;
  }

  const record = value as Record<string, unknown>;
  const imageAssets = Array.isArray(record.image_assets) ? record.image_assets : [];
  for (const asset of imageAssets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }
    const assetRecord = asset as Record<string, unknown>;
    const source = firstNonEmptyString(assetRecord.reference, assetRecord.source, assetRecord.url);
    addImageReferenceLookupEntry(referenceLookup, source, expandImageReferenceAliases([
      assetRecord.label,
      assetRecord.id,
      assetRecord.reference,
      assetRecord.source,
      assetRecord.url,
    ]));
  }

  const request = parseLooseObject(record.request);
  const content = parseLooseObject(request?.content);
  const sharedImagePool = parseLooseObject(content?.sharedImagePool);
  const sharedImages = Array.isArray(sharedImagePool?.images) ? sharedImagePool.images : [];
  const pages = Array.isArray(content?.pages) ? content.pages : [];

  const registerRequestImages = (items: unknown[]) => {
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const imageRecord = item as Record<string, unknown>;
      const source = firstNonEmptyString(
        imageRecord.source,
        imageRecord.reference,
        imageRecord.url,
      );
      addImageReferenceLookupEntry(referenceLookup, source, [
        imageRecord.id,
        imageRecord.alt,
        imageRecord.label,
        imageRecord.reference,
        imageRecord.source,
        imageRecord.url,
      ]);
    }
  };

  registerRequestImages(sharedImages);
  for (const page of pages) {
    const pageRecord = parseLooseObject(page);
    const pageImages = Array.isArray(pageRecord?.images) ? pageRecord.images : [];
    registerRequestImages(pageImages);
  }

  return referenceLookup;
}

function parseLooseObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const parsed = safeJsonParse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function deriveHeadlineAndBody(text: string): { headline: string; bodyText: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      headline: "",
      bodyText: "",
    };
  }

  const separatorMatch = trimmed.match(/^(.{1,84}?)(?:\s*[:\-]\s+)(.+)$/s);
  if (separatorMatch) {
    return {
      headline: separatorMatch[1]!.trim(),
      bodyText: separatorMatch[2]!.trim(),
    };
  }

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1 && lines[0]!.length <= 84) {
    return {
      headline: lines[0]!,
      bodyText: lines.slice(1).join("\n"),
    };
  }

  if (trimmed.length <= 84) {
    return {
      headline: trimmed,
      bodyText: "",
    };
  }

  return {
    headline: "",
    bodyText: trimmed,
  };
}

function extractImageReferenceFromRecord(
  record: Record<string, unknown>,
  referenceLookup?: Map<string, string>,
): string {
  const directImage = resolveImageReference(firstNonEmptyString(
    record.image_asset,
    record.image_url,
    record.reference,
    record.url,
    record.source,
  ), referenceLookup);
  if (directImage) {
    return directImage;
  }

  const imageRecords = Array.isArray(record.images) ? record.images : [];
  for (const image of imageRecords) {
    const imageRecord = parseLooseObject(image);
    if (!imageRecord) {
      continue;
    }
    const imageReference = resolveImageReference(firstNonEmptyString(
      imageRecord.reference,
      imageRecord.url,
      imageRecord.source,
      imageRecord.image_asset,
      imageRecord.image_url,
      imageRecord.label,
    ), referenceLookup);
    if (imageReference) {
      return imageReference;
    }
  }

  const imageRecord = parseLooseObject(record.image);
  if (!imageRecord) {
    return "";
  }

  return resolveImageReference(firstNonEmptyString(
    imageRecord.reference,
    imageRecord.url,
    imageRecord.source,
    imageRecord.image_asset,
    imageRecord.image_url,
    imageRecord.label,
  ), referenceLookup);
}

function extractSummaryLikeSlideContent(
  record: Record<string, unknown>,
  referenceLookup?: Map<string, string>,
): {
  headline: string;
  bodyText: string;
  imageReference: string;
} {
  const imageReference = extractImageReferenceFromRecord(record, referenceLookup);
  let headline = firstNonEmptyString(record.headline);
  let bodyText = firstNonEmptyString(
    record.body,
    record.body_text,
    record.content,
    record.summary,
    record.text,
    record.description,
  );
  const titledHeadline = firstNonEmptyString(
    record.title,
    record.titleHint,
    record.title_hint,
    record.page_title,
    record.title_text,
  );

  if (!headline && titledHeadline && (bodyText || imageReference)) {
    headline = titledHeadline;
  }

  if (!headline && bodyText) {
    const derived = deriveHeadlineAndBody(bodyText);
    headline = derived.headline;
    bodyText = derived.bodyText;
  } else if (headline && bodyText && headline === bodyText) {
    bodyText = "";
  }

  return {
    headline,
    bodyText,
    imageReference,
  };
}

function buildSimpleSlideElements(input: {
  headline: string;
  bodyText: string;
  imageReference: string;
  ratio: string;
}): Array<Record<string, unknown>> {
  const {
    headline,
    bodyText,
    imageReference,
    ratio,
  } = input;
  const elements: Array<Record<string, unknown>> = [];

  if (headline) {
    const titleStyle = fitImportedTextStyle({
      text: headline,
      role: "title",
      fontSize: ratio === "9:16" ? 38 : 34,
      widthPx: ratio === "9:16" ? 864 : 1024,
      heightPx: ratio === "9:16" ? 230 : 140,
      lineHeight: 1.2,
    });
    elements.push({
      kind: "text",
      role: "title",
      text: headline,
      xPct: 8,
      yPct: 6,
      wPct: 80,
      hPct: 12,
      fontFace: "Noto Serif Thai",
      fontSize: titleStyle.fontSize,
      lineHeight: titleStyle.lineHeight,
      color: "#4A332A",
      align: "left",
      bold: true,
    });
  }
  if (imageReference) {
    elements.push({
      kind: "image",
      role: "hero",
      source: imageReference,
      xPct: 8,
      yPct: 26,
      wPct: 84,
      hPct: bodyText ? 30 : 42,
      fit: "cover",
      cornerRadius: 18,
    });
  }
  if (bodyText) {
    const bodyStyle = fitImportedTextStyle({
      text: bodyText,
      role: "body",
      fontSize: ratio === "9:16" ? 20 : 18,
      widthPx: ratio === "9:16" ? 864 : 1024,
      heightPx: ratio === "9:16" ? (imageReference ? 307 : 499) : (imageReference ? 173 : 281),
      lineHeight: 1.25,
    });
    elements.push({
      kind: "text",
      role: "body",
      text: bodyText,
      xPct: 10,
      yPct: imageReference ? 60 : 24,
      wPct: 80,
      hPct: imageReference ? 16 : 26,
      fontFace: "Noto Sans Thai",
      fontSize: bodyStyle.fontSize,
      lineHeight: bodyStyle.lineHeight,
      color: "#4A332A",
      align: "left",
    });
  }

  return elements;
}

function convertSummaryEntriesToSlideSpec(input: {
  record: Record<string, unknown>;
  entries: unknown[];
  referenceLookup?: Map<string, string>;
}): Record<string, unknown> | null {
  const canvasRatioSource = typeof input.record.page_size_or_ratio === "string"
    ? input.record.page_size_or_ratio
    : (input.record.canvas && typeof input.record.canvas === "object" && typeof (input.record.canvas as Record<string, unknown>).ratio === "string")
      ? String((input.record.canvas as Record<string, unknown>).ratio)
      : "16:9";
  const ratio = inferCanvasRatioFromSummarySpec(canvasRatioSource);
  const convertedSlides = input.entries
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const entryRecord = entry as Record<string, unknown>;
      const { headline, bodyText, imageReference } = extractSummaryLikeSlideContent(entryRecord, input.referenceLookup);
      if (!headline && !bodyText && !imageReference) {
        return null;
      }

      return {
        id: `slide_${String(index + 1).padStart(2, "0")}`,
        background: "#F7F2EC",
        elements: buildSimpleSlideElements({
          headline,
          bodyText,
          imageReference,
          ratio,
        }),
      };
    })
    .filter((slide): slide is NonNullable<typeof slide> => slide !== null);

  if (convertedSlides.length === 0) {
    return null;
  }

  return {
    canvas: {
      ratio,
    },
    theme: {
      background: "#F7F2EC",
      text: "#4A332A",
    },
    slides: convertedSlides,
  };
}

function convertSummarySlidesToSlideSpec(
  record: Record<string, unknown>,
  referenceLookup?: Map<string, string>,
): Record<string, unknown> | null {
  const slides = Array.isArray(record.slides) ? record.slides : [];
  return convertSummaryEntriesToSlideSpec({ record, entries: slides, referenceLookup });
}

function buildDeterministicSlideJsonFromPayload(
  payload: unknown,
  referenceLookup?: Map<string, string>,
): string | null {
  const payloadRecord = parseLooseObject(payload);
  const request = parseLooseObject(payloadRecord?.request);
  const content = parseLooseObject(request?.content);
  const modernPages = Array.isArray(content?.pages) ? content.pages : [];
  const editorialPageBriefs = Array.isArray(payloadRecord?.page_briefs) ? payloadRecord.page_briefs : [];
  const editorialImageAssets = Array.isArray(payloadRecord?.image_assets) ? payloadRecord.image_assets : [];
  const pages = modernPages.length > 0
    ? modernPages
    : editorialPageBriefs.map((pageBrief) => {
        const pageRecord = parseLooseObject(pageBrief);
        if (!pageRecord) {
          return pageBrief;
        }
        const pageNumber = Number(pageRecord.page_number ?? pageRecord.pageNumber ?? NaN);
        const matchingImages = Number.isFinite(pageNumber)
          ? editorialImageAssets.filter((asset) => {
              const assetRecord = parseLooseObject(asset);
              return Number(assetRecord?.page_hint ?? NaN) === pageNumber;
            })
          : [];
        return {
          ...pageRecord,
          images: matchingImages,
        };
      });
  if (pages.length === 0) {
    return null;
  }
  const ratio = firstNonEmptyString(
    request?.canvasRatio,
    payloadRecord?.canvasRatio,
    payloadRecord?.canvas_ratio,
    payloadRecord?.page_size_or_ratio,
    "16:9",
  );
  const convertedSpec = convertSummaryEntriesToSlideSpec({
    record: {
      canvas: { ratio },
    },
    entries: pages,
    referenceLookup,
  });
  if (!convertedSpec) {
    return null;
  }
  const rawJson = JSON.stringify(convertedSpec, null, 2);
  return normalizeImportableSlideJson(rawJson, referenceLookup);
}

function convertRenderManifestBlocksToSlideElements(input: {
  blocks: unknown[];
  widthPx: number;
  heightPx: number;
  referenceLookup?: Map<string, string>;
}): Array<Record<string, unknown>> {
  const elements: Array<Record<string, unknown>> = [];

  for (const block of input.blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const blockRecord = block as Record<string, unknown>;
    const blockType = String(blockRecord.type ?? "").trim().toLowerCase();
    const xPct = pxToPct(blockRecord.x, input.widthPx);
    const yPct = pxToPct(blockRecord.y, input.heightPx);
    const wPct = pxToPct(blockRecord.w, input.widthPx);
    const hPct = pxToPct(blockRecord.h, input.heightPx);

    if (blockType === "image") {
      const source = resolveImageReference(firstNonEmptyString(
        blockRecord.reference,
        blockRecord.source,
        blockRecord.url,
        blockRecord.image_url,
        blockRecord.label,
      ), input.referenceLookup);
      if (!source) {
        continue;
      }
      elements.push({
        kind: "image",
        role: String(blockRecord.role ?? "hero").trim() || "hero",
        source,
        xPct,
        yPct,
        wPct,
        hPct,
        fit: String(blockRecord.fit ?? "cover"),
        cornerRadius: typeof blockRecord.radius === "number" ? blockRecord.radius : 0,
      });
      continue;
    }

    const text = firstNonEmptyString(blockRecord.text, blockRecord.content, blockRecord.value);
    if (!text) {
      continue;
    }
    const rawRole = blockType || String(blockRecord.role ?? "body").trim() || "body";
    const role = rawRole === "headline" ? "title" : rawRole;
    const textValue = text.replace(/\\n/g, "\n");
    const fittedTextStyle = fitImportedTextStyle({
      text: textValue,
      role,
      fontSize: typeof blockRecord.size === "number" ? blockRecord.size : (role === "title" ? 52 : 30),
      widthPx: typeof blockRecord.w === "number" && Number.isFinite(blockRecord.w) ? blockRecord.w : input.widthPx,
      heightPx: typeof blockRecord.h === "number" && Number.isFinite(blockRecord.h) ? blockRecord.h : 160,
      lineHeight: blockRecord.line_height,
    });
    elements.push({
      kind: "text",
      role,
      text: textValue,
      xPct,
      yPct,
      wPct,
      hPct,
      fontFace: role === "title" ? "Noto Serif Thai" : "Noto Sans Thai",
      fontSize: fittedTextStyle.fontSize,
      lineHeight: fittedTextStyle.lineHeight,
      color: normalizeHexColor(blockRecord.color, "#4A332A"),
      align: String(blockRecord.align ?? "left"),
      bold: typeof blockRecord.weight === "number" ? blockRecord.weight >= 600 : role === "title",
    });
  }

  return elements;
}

function convertEditorialRenderManifestToSlideSpec(
  record: Record<string, unknown>,
  referenceLookup?: Map<string, string>,
): Record<string, unknown> | null {
  const canvas = (record.canvas && typeof record.canvas === "object")
    ? record.canvas as Record<string, unknown>
    : null;
  const widthPx = typeof canvas?.width_px === "number" ? canvas.width_px : 1080;
  const heightPx = typeof canvas?.height_px === "number" ? canvas.height_px : 1350;
  const ratio = inferCanvasRatioFromDimensions(widthPx, heightPx);
  const background = (canvas?.background && typeof canvas.background === "object")
    ? canvas.background as Record<string, unknown>
    : null;
  const backgroundColor = normalizeHexColor(background?.color, "#F7F2EC");
  const pages = Array.isArray(record.pages) ? record.pages : [];
  const convertedSlides = pages
    .map((page, index) => {
      const pageRecord = parseLooseObject(page);
      if (!pageRecord) {
        return null;
      }
      const textBlocks = Array.isArray(pageRecord.text_blocks) ? pageRecord.text_blocks : [];
      const imageBlocks = Array.isArray(pageRecord.image_blocks) ? pageRecord.image_blocks : [];
      const elements: Array<Record<string, unknown>> = [];

      for (const block of textBlocks) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const textBlock = block as Record<string, unknown>;
        const bounds = (textBlock.bounds && typeof textBlock.bounds === "object")
          ? textBlock.bounds as Record<string, unknown>
          : {};
        const typography = (textBlock.typography && typeof textBlock.typography === "object")
          ? textBlock.typography as Record<string, unknown>
          : {};
        const role = String(textBlock.role ?? "body").trim() || "body";
        const content = String(textBlock.content ?? "").trim();
        if (!content) {
          continue;
        }
        const fittedTextStyle = fitImportedTextStyle({
          text: content.replace(/\\n/g, "\n"),
          role,
          fontSize: typeof typography.font_size_px === "number" ? typography.font_size_px : (role === "title" ? 52 : 30),
          widthPx: typeof bounds.w === "number" && Number.isFinite(bounds.w) ? bounds.w : widthPx,
          heightPx: typeof bounds.h === "number" && Number.isFinite(bounds.h) ? bounds.h : 160,
          lineHeight: typography.line_height ?? typography.line_height_multiplier,
        });
        elements.push({
          kind: "text",
          role,
          text: content.replace(/\\n/g, "\n"),
          xPct: pxToPct(bounds.x, widthPx),
          yPct: pxToPct(bounds.y, heightPx),
          wPct: pxToPct(bounds.w, widthPx),
          hPct: pxToPct(bounds.h, heightPx),
          fontFace: role === "title" ? "Noto Serif Thai" : "Noto Sans Thai",
          fontSize: fittedTextStyle.fontSize,
          lineHeight: fittedTextStyle.lineHeight,
          color: "#4A332A",
          align: String(typography.align ?? "left"),
          bold: typeof typography.weight === "number" ? typography.weight >= 600 : role === "title",
        });
      }

      for (const block of imageBlocks) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const imageBlock = block as Record<string, unknown>;
        const bounds = (imageBlock.bounds && typeof imageBlock.bounds === "object")
          ? imageBlock.bounds as Record<string, unknown>
          : {};
        const reference = resolveImageReference(firstNonEmptyString(
          imageBlock.reference,
          imageBlock.source,
          imageBlock.url,
          imageBlock.label,
        ), referenceLookup);
        if (!reference) {
          continue;
        }
        elements.push({
          kind: "image",
          role: String(imageBlock.id ?? "hero"),
          source: reference,
          xPct: pxToPct(bounds.x, widthPx),
          yPct: pxToPct(bounds.y, heightPx),
          wPct: pxToPct(bounds.w, widthPx),
          hPct: pxToPct(bounds.h, heightPx),
          fit: String(imageBlock.crop_mode ?? "cover"),
          cornerRadius: typeof imageBlock.corner_radius_px === "number" ? imageBlock.corner_radius_px : 0,
        });
      }

      if (elements.length === 0) {
        const legacyBlocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : [];
        elements.push(...convertRenderManifestBlocksToSlideElements({
          blocks: legacyBlocks,
          widthPx,
          heightPx,
          referenceLookup,
        }));
      }

      if (elements.length === 0) {
        const { headline, bodyText, imageReference } = extractSummaryLikeSlideContent(pageRecord, referenceLookup);
        elements.push(...buildSimpleSlideElements({
          headline,
          bodyText,
          imageReference,
          ratio,
        }));
      }

      if (elements.length === 0) {
        return null;
      }

      const notes = firstNonEmptyString(
        pageRecord.note,
        pageRecord.render_notes,
        pageRecord.page_validation,
        pageRecord.validation,
      );
      const title = firstNonEmptyString(
        pageRecord.title,
        pageRecord.page_role,
        pageRecord.role,
        pageRecord.headline,
        pageRecord.layout_pattern,
        pageRecord.layout,
        pageRecord.template,
        `Page ${index + 1}`,
      );

      return {
        id: `slide_${String(index + 1).padStart(2, "0")}`,
        title,
        background: backgroundColor,
        notes,
        elements,
      };
    })
    .filter((slide): slide is NonNullable<typeof slide> => slide !== null);

  if (convertedSlides.length === 0) {
    return null;
  }

  return {
    canvas: {
      ratio,
    },
    theme: {
      background: backgroundColor,
    },
    slides: convertedSlides,
  };
}

function normalizeImportableSlideJson(
  rawJson: string,
  referenceLookup?: Map<string, string>,
): string | null {
  const parsed = safeJsonParse(rawJson);
  const extracted = extractImportableSlideSpec(parsed, referenceLookup);
  if (!extracted || !hasImportableGeneratedSlides(extracted)) {
    return null;
  }
  return JSON.stringify(extracted, null, 2);
}

function getExpectedEditorialRenderManifestPageCount(
  slidePayload: PresentationSlideSkillRequestPayload,
): number | null {
  const record = slidePayload as Record<string, unknown>;
  const requestedPageCount = Number(record.requested_page_count ?? NaN);
  if (Number.isFinite(requestedPageCount)) {
    return clampSlideCount(requestedPageCount);
  }
  const pageBriefs = Array.isArray(record.page_briefs) ? record.page_briefs : [];
  if (pageBriefs.length > 0) {
    return clampSlideCount(pageBriefs.length);
  }
  return null;
}

function normalizeImportableSlideJsonForCount(
  rawJson: string,
): { totalSlides: number; importableSlides: number } {
  const inspection = inspectGeneratedSlideImportability(rawJson);
  return {
    totalSlides: inspection.totalSlides,
    importableSlides: inspection.importableSlides,
  };
}

function isCompleteEditorialRenderManifestJson(
  normalizedSlideJson: string,
  expectedPageCount: number,
): boolean {
  const inspection = normalizeImportableSlideJsonForCount(normalizedSlideJson);
  return inspection.totalSlides === expectedPageCount
    && inspection.importableSlides === expectedPageCount;
}

function isImportableSlideJson(rawJson: string, referenceLookup?: Map<string, string>): boolean {
  return normalizeImportableSlideJson(rawJson, referenceLookup) !== null;
}

function describeSlideJsonImportFailure(rawJson: string): string {
  const inspection = inspectGeneratedSlideImportability(rawJson);
  const parsed = safeJsonParse(rawJson);
  let detail = `status=${inspection.status}, totalSlides=${inspection.totalSlides}, importableSlides=${inspection.importableSlides}`;

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (record.output_format === "render_manifest_json" && Array.isArray(record.pages)) {
      const pageCount = record.pages.length;
      const blockCount = record.pages.reduce((sum, page) => {
        if (!page || typeof page !== "object") {
          return sum;
        }
        const pageRecord = page as Record<string, unknown>;
        const textBlocks = Array.isArray(pageRecord.text_blocks) ? pageRecord.text_blocks.length : 0;
        const imageBlocks = Array.isArray(pageRecord.image_blocks) ? pageRecord.image_blocks.length : 0;
        const legacyBlocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks.length : 0;
        return sum + textBlocks + imageBlocks + legacyBlocks;
      }, 0);
      detail += `, output_format=render_manifest_json, pages=${pageCount}, convertibleBlocks=${blockCount}`;
    }
  }

  return `Slide skill did not return importable slide JSON (${detail})`;
}

function describeSlideJsonPageCountFailure(
  rawJson: string,
  expectedPageCount: number,
): string {
  const inspection = inspectGeneratedSlideImportability(rawJson);
  return `Slide skill returned ${inspection.totalSlides} pages (${inspection.importableSlides} importable) but expected exactly ${expectedPageCount}.`;
}

async function chargePresentationSkillLlmUsage(params: {
  userId: number;
  tenantId?: string;
  skillSlug: string;
  operation: string;
  result: {
    modelId?: string;
    provider?: { providerName?: string | null } | null;
    inputTokens?: number;
    outputTokens?: number;
    rawData?: Record<string, unknown>;
  };
}): Promise<void> {
  const model = String(params.result.modelId ?? "").trim();
  if (!model) {
    return;
  }

  const usage = params.result.rawData?.usage as { cost?: number } | undefined;
  await deductCreditsForModel({
    userId: params.userId,
    tenantId: params.tenantId,
    model,
    provider: params.result.provider?.providerName ?? undefined,
    inputTokens: params.result.inputTokens ?? 0,
    outputTokens: params.result.outputTokens ?? 0,
    costUsd: usage?.cost,
    skillSlug: params.skillSlug,
    sourceType: "skill",
    description: `Presentation skill usage: ${params.skillSlug}`,
    metadata: {
      operation: params.operation,
      requestType: "skill",
      service: "presentation.article_builder",
    },
  });
}

async function chargePresentationSandboxSkillDispatch(params: {
  userId: number;
  tenantId?: string;
  skill: SkillDefinition;
  outputFormats: PresentationSlideOutputFormat[];
}): Promise<void> {
  const multiplier = Number(params.skill.creditMultiplier ?? 1);
  const estimatedCredits = Math.max(1, Math.ceil((Number.isFinite(multiplier) ? multiplier : 1) * 2));

  await deductCredits({
    userId: params.userId,
    tenantId: params.tenantId,
    amount: estimatedCredits,
    sourceType: "skill",
    skillSlug: params.skill.id,
    description: `Presentation slide skill execution: ${params.skill.id}`,
    metadata: {
      operation: "presentation.generate_slide_draft",
      stage: "sandbox_dispatch",
      requestType: "skill",
      service: "presentation.article_builder",
      outputFormats: params.outputFormats,
      billingBasis: "skill_credit_multiplier",
    },
  });
}

async function resolveSlideJsonFromArtifacts(
  artifacts: PresentationSlideArtifact[],
  fallbackSlideJson: string,
  options?: {
    debugArtifacts?: Array<Record<string, unknown>>;
  },
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
    const debugEntry: Record<string, unknown> = {
      key: jsonArtifact.key,
      format: jsonArtifact.format,
      mimeType: jsonArtifact.mimeType,
      isPrimary: jsonArtifact.isPrimary,
      url: jsonArtifact.url,
    };
    if (!artifactText?.trim()) {
      debugEntry.status = "empty";
      options?.debugArtifacts?.push(debugEntry);
      continue;
    }
    const trimmedArtifactJson = trimSlideJson(stripOuterCodeFences(artifactText));
    const normalizedArtifactJson = normalizeImportableSlideJson(trimmedArtifactJson);
    debugEntry.status = normalizedArtifactJson ? "importable" : "non-importable";
    debugEntry.rawJson = trimmedArtifactJson;
    debugEntry.importability = inspectGeneratedSlideImportability(trimmedArtifactJson);
    if (normalizedArtifactJson) {
      debugEntry.normalizedSlideJson = normalizedArtifactJson;
    }
    options?.debugArtifacts?.push(debugEntry);
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
  pagePlansOverride?: PresentationArticlePagePlan[],
): PresentationSlideImagePrompt[] {
  const pagePlans = pagePlansOverride ?? buildPresentationPagePlans(input.article, input.topic, maxPages);
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
      const guardrail = language === "th"
        ? "ห้ามมีตัวอักษร คำบรรยาย โลโก้ ป้าย ฉลาก ลายน้ำ ส่วนติดต่อผู้ใช้ หรือ typography ใด ๆ อยู่ในภาพ"
        : "No text, letters, captions, subtitles, logos, signage, labels, watermarks, UI, or embedded typography in the image";
      const contextualPrompt = input.imagePromptContext?.trim()
        ? `${promptBase}. ${input.imagePromptContext.trim()}. ${guardrail}.`
        : `${promptBase}. ${guardrail}.`;
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

function buildFallbackImagePromptPlanFromModernEditorialPages(input: {
  preferredLanguage?: "th" | "en";
  imagePromptContext?: string;
  pages: ModernEditorialPreflightPage[];
}): PresentationSlideImagePrompt[] {
  const language = input.preferredLanguage ?? "th";
  const prompts: PresentationSlideImagePrompt[] = [];
  for (const page of input.pages) {
    for (let imageIndex = 1; imageIndex <= page.recommendedImageCount; imageIndex += 1) {
      const placementRole = imageIndex === 1 ? "hero" : imageIndex === 2 ? "supporting" : "detail";
      const roleLabel = placementRole === "hero"
        ? language === "th" ? "ภาพหลักของหน้า" : "hero visual"
        : placementRole === "supporting"
          ? language === "th" ? "ภาพเสริมของหน้า" : "supporting visual"
          : language === "th" ? "ภาพรายละเอียด" : "detail visual";
      const basePrompt = language === "th"
        ? [
            `${roleLabel} สำหรับสไลด์หน้า ${page.pageNumber}`,
            `หัวข้อ "${page.titleHint}"`,
            `บทบาทของหน้า: ${page.pageIntentHint}`,
            `เนื้อหาหลัก: ${page.compiledText.replace(/\n+/g, " ").trim().slice(0, 220)}`,
          ].join(", ")
        : [
            `${roleLabel} for slide ${page.pageNumber}`,
            `title "${page.titleHint}"`,
            `page intent ${page.pageIntentHint}`,
            `core content: ${page.compiledText.replace(/\n+/g, " ").trim().slice(0, 220)}`,
          ].join(", ");
      const guardrail = language === "th"
        ? "ห้ามมีตัวอักษร คำบรรยาย โลโก้ ป้าย ฉลาก ลายน้ำ ส่วนติดต่อผู้ใช้ หรือ typography ใด ๆ อยู่ในภาพ"
        : "No text, letters, captions, subtitles, logos, signage, labels, watermarks, UI, or embedded typography in the image";
      prompts.push({
        id: `img-${page.pageNumber}-${imageIndex}`,
        pageNumber: page.pageNumber,
        imageIndex,
        placementRole,
        shortLabel: `${page.pageNumber}.${imageIndex} ${placementRole}`,
        prompt: input.imagePromptContext?.trim()
          ? `${basePrompt}. ${input.imagePromptContext.trim()}. ${guardrail}.`
          : `${basePrompt}. ${guardrail}.`,
      });
    }
  }
  return prompts;
}

function buildConstrainedImagePromptPlanFromExistingSlots(input: {
  plannedPrompts: PresentationSlideImagePrompt[];
  existingImageAssets: PresentationSlideImageAsset[];
  article: string;
  topic: string;
  preferredLanguage?: "th" | "en";
  maxPages: number;
  pagePlans?: PresentationArticlePagePlan[];
}): PresentationSlideImagePrompt[] {
  const language = input.preferredLanguage ?? inferArticleLanguage(input.article || input.topic);
  const pagePlans = input.pagePlans ?? buildPresentationPagePlans(input.article, input.topic, input.maxPages);
  const pagePlanByPage = new Map(pagePlans.map((page) => [page.pageNumber, page] as const));
  const promptBySlot = new Map<string, PresentationSlideImagePrompt>();

  for (const prompt of input.plannedPrompts) {
    promptBySlot.set(`${prompt.pageNumber}:${prompt.imageIndex}:${prompt.placementRole}`, prompt);
  }

  const normalizedAssets = input.existingImageAssets
    .map((asset) => ({
      ...asset,
      pageNumber: clampSlideCount(asset.pageNumber),
      imageIndex: Math.max(1, Math.min(3, Math.round(asset.imageIndex))),
    }))
    .filter((asset) => asset.url.trim())
    .sort((left, right) => left.pageNumber - right.pageNumber || left.imageIndex - right.imageIndex);

  const uniqueSlots = new Map<string, PresentationSlideImageAsset>();
  for (const asset of normalizedAssets) {
    const key = `${asset.pageNumber}:${asset.imageIndex}:${asset.placementRole}`;
    if (!uniqueSlots.has(key)) {
      uniqueSlots.set(key, asset);
    }
  }

  return Array.from(uniqueSlots.values()).map((asset, index) => {
    const key = `${asset.pageNumber}:${asset.imageIndex}:${asset.placementRole}`;
    const plannedPrompt = promptBySlot.get(key);
    if (plannedPrompt) {
      return {
        ...plannedPrompt,
        id: plannedPrompt.id || `img-${asset.pageNumber}-${asset.imageIndex}-${index + 1}`,
        shortLabel: asset.shortLabel || plannedPrompt.shortLabel,
        prompt: plannedPrompt.prompt || asset.prompt,
      };
    }

    const pagePlan = pagePlanByPage.get(asset.pageNumber);
    const noteExcerpt = (pagePlan?.text ?? input.topic)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);
    const roleLabel = asset.placementRole === "hero"
      ? (language === "th" ? "ภาพหลักของหน้า" : "hero visual")
      : asset.placementRole === "supporting"
        ? (language === "th" ? "ภาพเสริมของหน้า" : "supporting visual")
        : (language === "th" ? "ภาพรายละเอียด" : "detail visual");
    const guardrail = language === "th"
      ? "ห้ามมีตัวอักษร คำบรรยาย โลโก้ ป้าย ฉลาก ลายน้ำ ส่วนติดต่อผู้ใช้ หรือ typography ใด ๆ อยู่ในภาพ"
      : "No text, letters, captions, subtitles, logos, signage, labels, watermarks, UI, or embedded typography in the image";
    const prompt = asset.prompt?.trim()
      || (language === "th"
        ? `${roleLabel} สำหรับสไลด์หน้า ${asset.pageNumber} หัวข้อ "${pagePlan?.titleHint || input.topic}" เนื้อหาหลัก: ${noteExcerpt}. ${guardrail}.`
        : `${roleLabel} for slide ${asset.pageNumber} titled "${pagePlan?.titleHint || input.topic}" based on this page note: ${noteExcerpt}. ${guardrail}.`);
    return {
      id: `img-${asset.pageNumber}-${asset.imageIndex}-${index + 1}`,
      pageNumber: asset.pageNumber,
      imageIndex: asset.imageIndex,
      placementRole: asset.placementRole,
      shortLabel: asset.shortLabel || `${asset.pageNumber}.${asset.imageIndex} ${asset.placementRole}`,
      prompt,
    };
  });
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
  pageBriefs?: Array<{
    pageNumber: number;
    titleHint: string;
    pageIntentHint?: string;
    preferredArchetype?: string;
    recommendedImageCount?: number;
    text: string;
  }>;
}): string {
  const language = input.preferredLanguage ?? inferArticleLanguage(input.article || input.topic);
  const languageLabel = language === "th" ? "Thai" : "English";
  const pagePlans: PresentationArticlePagePlan[] = input.pageBriefs?.length
    ? input.pageBriefs.map((page) => ({
        pageNumber: page.pageNumber,
        titleHint: page.titleHint,
        text: page.text,
        pageIntentHint: page.pageIntentHint,
        preferredArchetype: page.preferredArchetype,
        recommendedImageCount: page.recommendedImageCount,
      }))
    : buildPresentationPagePlans(input.article, input.topic, clampSlideCount(input.maxPages)).map((page) => ({
        pageNumber: page.pageNumber,
        titleHint: page.titleHint,
        text: page.text,
      }));
  return [
    "Create a strict JSON plan for slide-supporting image prompts.",
    `Topic: ${input.topic.trim()}`,
    `Preferred language: ${languageLabel}`,
    `Language code: ${language}`,
    `Target max pages: ${clampSlideCount(input.maxPages)}`,
    `Target image prompts: ${Math.max(1, Math.min(60, Math.round(input.plannedImageCount)))}`,
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
    "- Every prompt must explicitly forbid text, letters, captions, subtitles, logos, signage, labels, watermarks, UI, and embedded typography inside the image.",
    "- Prefer clean photographic compositions rather than poster-like images or images with overlaid wording.",
    "- Avoid markdown, comments, and code fences.",
    "",
    "Authoritative page plan:",
    ...pagePlans.map((page) => (
      [
        `Page ${page.pageNumber}: ${page.titleHint}`,
        page.pageIntentHint ? `Intent: ${page.pageIntentHint}` : "",
        page.preferredArchetype ? `Suggested archetype: ${page.preferredArchetype}` : "",
        Number.isFinite(page.recommendedImageCount) ? `Recommended image prompts: ${page.recommendedImageCount}` : "",
        page.text,
      ].filter(Boolean).join("\n")
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
  slideSkillId?: string;
  preferredLanguage?: "th" | "en";
  canvasRatio: PresentationSlideCanvasRatio;
  outputFormats: PresentationSlideOutputFormat[];
  maxPages: number;
  imageAssets?: PresentationSlideImageAsset[];
  imagePromptContext?: string;
  editorialPlannerOptions?: PresentationEditorialPlannerOptions;
  pagePlans?: PresentationArticlePagePlan[];
  pageImagePlanOverrides?: Array<{
    pageNumber: number;
    maxImagesOverride: number;
  }>;
}): PresentationSlideSkillRequestPayload {
  const normalizedArticle = normalizeGeneratedPresentationArticle(input.article);
  const normalizedSkillId = String(input.slideSkillId ?? "").trim();
  const language = input.preferredLanguage ?? inferArticleLanguage(normalizedArticle || input.topic);
  const title = extractArticleTitle(normalizedArticle, input.topic);
  const imageAssets = mergeEditorialPlannerReferenceAssets({
    slideSkillId: normalizedSkillId,
    imageAssets: input.imageAssets ?? [],
    editorialPlannerOptions: input.editorialPlannerOptions,
  });
  const effectiveMaxPages = resolveEffectivePresentationSlideMaxPages({
    slideSkillId: normalizedSkillId,
    maxPages: input.maxPages,
    editorialPlannerOptions: input.editorialPlannerOptions,
  });
  const pagePlans = input.pagePlans?.length
    ? mergeArticlePagePlansToLimit(input.pagePlans, effectiveMaxPages)
        .map((page, index) => ({ ...page, pageNumber: index + 1 }))
    : buildPresentationPagePlans(normalizedArticle, input.topic, effectiveMaxPages);

  if (normalizedSkillId === EDITORIAL_LAYOUT_PLANNER_SKILL_ID) {
    const requestedPageCount = input.editorialPlannerOptions?.pageCountMode === "fixed"
      ? clampSlideCount(input.editorialPlannerOptions?.requestedPageCount ?? effectiveMaxPages)
      : Math.max(1, pagePlans.length);
    const pageBriefs = pagePlans.slice(0, requestedPageCount).map((page, index) => ({
      page_number: page.pageNumber,
      page_role: index === 0
        ? "cover"
        : index === requestedPageCount - 1
          ? "closing"
          : "content",
      title_hint: page.titleHint,
      text: page.text,
    }));
    return buildEditorialLayoutPlannerPayload({
      articleTitle: title,
      articleBody: normalizedArticle,
      articleLanguage: language,
      canvasRatio: normalizeSlideCanvasRatio(input.canvasRatio),
      imagePromptContext: input.imagePromptContext,
      maxPages: effectiveMaxPages,
      targetAudiencePreset: input.editorialPlannerOptions?.targetAudience,
      tonePreset: input.editorialPlannerOptions?.tonePreset,
      fitPreset: input.editorialPlannerOptions?.fitPreset,
      pageCountMode: input.editorialPlannerOptions?.pageCountMode,
      requestedPageCount: requestedPageCount,
      globalStylePrompt: input.editorialPlannerOptions?.globalStylePrompt,
      renderSafety: input.editorialPlannerOptions?.renderSafety,
      pageFillRules: input.editorialPlannerOptions?.pageFillRules,
      qualityOptimizer: input.editorialPlannerOptions?.qualityOptimizer,
      pageBriefs,
      imageAssets: buildEditorialPlannerImageAssetInputs({
        imageAssets,
        plannerImageAssets: input.editorialPlannerOptions?.imageAssets,
      }),
    });
  }

  const modernEditorialCompilation = isDeterministicEditorialSlideSkill(normalizedSkillId)
    ? compileModernEditorialDeck({
        topic: input.topic,
        canvasRatio: input.canvasRatio,
        maxPages: effectiveMaxPages,
        pages: pagePlans,
      })
    : null;
  const effectivePages = modernEditorialCompilation?.pages ?? pagePlans.map((page) => ({
    pageNumber: page.pageNumber,
    titleHint: page.titleHint,
    compiledText: page.text,
    pageIntentHint: undefined,
    forceArchetype: null,
    recommendedImageCount: undefined,
    maxImagesOverride: undefined,
  }));
  const pageImageOverrideByPage = new Map<number, number>();
  for (const override of input.pageImagePlanOverrides ?? []) {
    const pageNumber = clampSlideCount(override.pageNumber);
    const maxImagesOverride = Math.max(0, Math.min(3, Math.round(override.maxImagesOverride)));
    pageImageOverrideByPage.set(pageNumber, maxImagesOverride);
  }
  const imagesByPage = new Map<number, PresentationSlideImageAsset[]>();
  for (const asset of imageAssets) {
    const clampedPageNumber = Math.max(1, Math.min(effectivePages.length || 1, asset.pageNumber));
    const bucket = imagesByPage.get(clampedPageNumber) ?? [];
    bucket.push(asset);
    imagesByPage.set(clampedPageNumber, bucket);
  }
  const payload: PresentationSlideSkillRequestPayload = {
    request: {
      projectTitle: title,
      language,
      canvasRatio: normalizeSlideCanvasRatio(input.canvasRatio),
      compositionMode: "slide-deck",
      outputFormats: normalizeSlideOutputFormats(input.outputFormats),
      pagination: {
        maxPages: effectiveMaxPages,
        allowFewerPages: true,
        overflowStrategy: "condense",
      },
      content: {
        titleHint: title,
        pages: effectivePages.map((page) => {
          const effectiveMaxImagesOverride = pageImageOverrideByPage.get(page.pageNumber)
            ?? (Number.isFinite(page.maxImagesOverride) ? Number(page.maxImagesOverride) : undefined)
            ?? (Number.isFinite(page.recommendedImageCount) ? Number(page.recommendedImageCount) : undefined);
          const pageImages = (imagesByPage.get(page.pageNumber) ?? [])
            .slice()
            .sort((left, right) => left.imageIndex - right.imageIndex)
            .slice(0, Math.max(0, Math.min(3, Number(effectiveMaxImagesOverride ?? 3))))
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
            text: page.compiledText,
            ...(page.pageIntentHint ? { pageIntentHint: page.pageIntentHint } : {}),
            ...(
              normalizedSkillId === MODERN_EDITORIAL_SLIDE_SKILL_ID && page.forceArchetype
                ? { forceArchetype: page.forceArchetype }
                : {}
            ),
            imageSelectionMode: "manual-only" as const,
            maxImagesOverride: Number.isFinite(effectiveMaxImagesOverride)
              ? Number(effectiveMaxImagesOverride)
              : (pageImages.length > 0 ? pageImages.length : null),
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

  return applyPresentationSkillPayloadAdapter(payload, {
    skillSlug: normalizedSkillId,
    topic: input.topic,
    canvasRatio: input.canvasRatio,
    maxPages: effectiveMaxPages,
  }) as PresentationSlideSkillRequestPayload;
}

async function resolveSlideSkillForPlanning(
  slideSkillId: string,
  options: Pick<PreparePresentationSlideBundleInput, "requiresThinking">,
): Promise<{
  skill: SkillDefinition;
  executionSkill: SkillDefinition;
  runtimeBundleSkill: SkillDefinition;
  executionPolicy: SkillExecutionPolicyResult;
}> {
  const normalizedSlideSkillId = slideSkillId.trim();
  await syncSingleSkillIfChanged(normalizedSlideSkillId);
  const skill = await getSkillByIdAsync(normalizedSlideSkillId);
  if (!skill) {
    throw new Error("Slide skill not found");
  }
  const normalizedSkill = normalizeExecutionPolicy(skill, {
    requiresThinking: options.requiresThinking,
    requiresWebSearch: false,
  });
  const resolvedExecutionPolicy = await resolveSkillExecutionPolicy({ skill: normalizedSkill });
  return {
    skill,
    executionSkill: normalizedSkill,
    runtimeBundleSkill: normalizedSkill,
    executionPolicy: resolvedExecutionPolicy,
  };
}

export async function preparePresentationSlideBundle(
  input: PreparePresentationSlideBundleInput,
): Promise<PreparePresentationSlideBundleResult> {
  const trimmedArticle = normalizeGeneratedPresentationArticle(input.article);
  if (!trimmedArticle) {
    throw new Error("Article is required");
  }
  const existingImageAssets = (input.existingImageAssets ?? [])
    .map((asset) => ({
      ...asset,
      url: String(asset.url ?? "").trim(),
    }))
    .filter((asset) => asset.url);
  const maxPages = resolveEffectivePresentationSlideMaxPages({
    slideSkillId: input.slideSkillId,
    maxPages: estimatePresentationMaxPages(trimmedArticle, input.preferredLanguage),
    editorialPlannerOptions: input.editorialPlannerOptions,
  });
  const { skill, executionSkill, executionPolicy } = await resolveSlideSkillForPlanning(input.slideSkillId, input);
  const semanticPagePlan = await buildSemanticPresentationPagePlans({
    topic: input.topic,
    article: trimmedArticle,
    slideSkillId: input.slideSkillId,
    preferredLanguage: input.preferredLanguage,
    requiresThinking: input.requiresThinking,
    maxPages,
    exactPageCount: input.editorialPlannerOptions?.pageCountMode === "fixed" ? maxPages : undefined,
    canvasRatio: input.canvasRatio,
    skill,
    executionPolicy,
    userId: input.userId,
  });
  const plannedArticle = semanticPagePlan.rewrittenArticle || trimmedArticle;
  const basePagePlans = semanticPagePlan.pages;
  const modernEditorialCompilation = isDeterministicEditorialSlideSkill(input.slideSkillId)
    ? compileModernEditorialDeck({
        topic: input.topic,
        canvasRatio: input.canvasRatio,
        maxPages,
        pages: basePagePlans,
      })
    : null;
  const plannedImageCount = existingImageAssets.length > 0
    ? existingImageAssets.length
    : modernEditorialCompilation
      ? modernEditorialCompilation.plannedImageCount
      : Math.max(1, basePagePlans.length);
  const fallbackPlan = modernEditorialCompilation
    ? buildFallbackImagePromptPlanFromModernEditorialPages({
        preferredLanguage: input.preferredLanguage,
        imagePromptContext: input.imagePromptContext,
        pages: modernEditorialCompilation.pages,
      })
    : buildFallbackImagePromptPlan(
        { ...input, article: plannedArticle },
        maxPages,
        plannedImageCount,
        basePagePlans,
      );
  const constrainedFallbackPlan = existingImageAssets.length > 0
    ? buildConstrainedImagePromptPlanFromExistingSlots({
        plannedPrompts: fallbackPlan,
        existingImageAssets,
        article: plannedArticle,
        topic: input.topic,
        preferredLanguage: input.preferredLanguage,
        maxPages,
        pagePlans: basePagePlans,
      })
    : fallbackPlan;
  let imagePrompts = constrainedFallbackPlan;
  let modelId: string | undefined = semanticPagePlan.modelId;
  try {
    const result = await executeSkillLlmWithFallback({
      messages: [
        {
          role: "system",
          content: [
            "You are a presentation visual director and image-planning assistant.",
            executionSkill.systemPrompt?.trim()
              ? `Downstream slide skill guidance:\n${executionSkill.systemPrompt.trim()}`
              : "",
            "Return strict JSON only.",
          ].filter(Boolean).join("\n\n"),
        },
        {
          role: "user",
          content: buildPresentationImagePromptPlanPrompt({
            topic: input.topic,
            article: plannedArticle,
            preferredLanguage: input.preferredLanguage,
            maxPages,
            plannedImageCount,
            canvasRatio: input.canvasRatio,
            imagePromptContext: input.imagePromptContext,
            slideSkillName: skill.name || skill.id || input.slideSkillId,
            pageBriefs: modernEditorialCompilation
              ? modernEditorialCompilation.pages.map((page) => ({
                  pageNumber: page.pageNumber,
                  titleHint: page.titleHint,
                  pageIntentHint: page.pageIntentHint,
                  preferredArchetype: page.preferredArchetype,
                  recommendedImageCount: page.recommendedImageCount,
                  text: page.compiledText,
                }))
              : basePagePlans.map((page) => ({
                  pageNumber: page.pageNumber,
                  titleHint: page.titleHint,
                  pageIntentHint: page.pageIntentHint,
                  recommendedImageCount: imagePrompts.filter((prompt) => prompt.pageNumber === page.pageNumber).length || 1,
                  text: page.text,
                })),
          }),
        },
      ],
      skillSlug: input.slideSkillId,
      userId: input.userId,
      executionPolicy,
      maxModelAttempts: 1,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: 4_000,
    });

    if (result.success && result.content?.trim()) {
      await chargePresentationSkillLlmUsage({
        userId: input.userId,
        skillSlug: input.slideSkillId,
        operation: "presentation.prepare_slide_bundle",
        result,
      });
      const normalizedPrompts = normalizeImagePromptPlan(
        safeJsonParse(result.content),
        constrainedFallbackPlan,
        maxPages,
        plannedImageCount,
      );
      imagePrompts = existingImageAssets.length > 0
        ? buildConstrainedImagePromptPlanFromExistingSlots({
            plannedPrompts: normalizedPrompts,
            existingImageAssets,
            article: plannedArticle,
            topic: input.topic,
            preferredLanguage: input.preferredLanguage,
            maxPages,
            pagePlans: basePagePlans,
          })
        : normalizedPrompts;
      modelId = result.modelId;
    }
  } catch {
    imagePrompts = constrainedFallbackPlan;
  }

  const pageImagePlanOverrides = Array.from(
    imagePrompts.reduce((map, prompt) => {
      map.set(prompt.pageNumber, (map.get(prompt.pageNumber) ?? 0) + 1);
      return map;
    }, new Map<number, number>()),
  )
    .map(([pageNumber, maxImagesOverride]) => ({
      pageNumber,
      maxImagesOverride,
    }))
    .sort((left, right) => left.pageNumber - right.pageNumber);

  const slidePayload = buildPresentationSlideRequestPayload({
    topic: input.topic,
    article: plannedArticle,
    slideSkillId: input.slideSkillId,
    preferredLanguage: input.preferredLanguage,
    canvasRatio: input.canvasRatio,
    outputFormats: input.outputFormats,
    maxPages,
    pagePlans: basePagePlans,
    imageAssets: existingImageAssets,
    imagePromptContext: input.imagePromptContext,
    editorialPlannerOptions: input.editorialPlannerOptions,
    pageImagePlanOverrides,
  });

  return {
    maxPages,
    plannedImageCount,
    slideSkillLabel: skill.name || skill.id || input.slideSkillId,
    article: semanticPagePlan.rewrittenArticle,
    imagePrompts,
    slidePayload,
    slidePayloadJson: JSON.stringify(slidePayload, null, 2),
    modelId,
    preflightPages: modernEditorialCompilation?.pages ?? basePagePlans.map((page) => ({
      pageNumber: page.pageNumber,
      titleHint: page.titleHint,
      compiledText: page.text,
      pageIntentHint: page.pageIntentHint ?? (page.pageNumber === 1 ? "cover" : "content"),
      preferredArchetype: "text_focus",
      forceArchetype: null,
      archetypeMode: "guided",
      recommendedImageCount: imagePrompts.filter((prompt) => prompt.pageNumber === page.pageNumber).length || 1,
      maxImagesOverride: imagePrompts.filter((prompt) => prompt.pageNumber === page.pageNumber).length || 1,
      warnings: page.estimatedReadSeconds && page.estimatedReadSeconds > 9
        ? [`Estimated read time is ${page.estimatedReadSeconds}s.`]
        : [],
      structure: {
        paragraphCount: page.text.split(/\n{2,}/).filter((part) => part.trim()).length,
        bulletCount: (page.text.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/g) ?? []).length,
        workflowStepCount: 0,
        timelinePhaseCount: 0,
        sectionCount: 1,
      },
    })),
    preflightWarnings: [
      ...semanticPagePlan.warnings,
      ...(modernEditorialCompilation?.warnings ?? []),
    ],
  };
}

export async function generatePresentationSlideDraft(
  input: GeneratePresentationSlideDraftInput,
): Promise<GeneratePresentationSlideDraftResult> {
  const trimmedArticle = normalizeGeneratedPresentationArticle(input.article);
  if (!trimmedArticle) {
    throw new Error("Article is required");
  }
  const imageAssets = (input.imageAssets ?? [])
    .map((asset) => ({
      ...asset,
      url: String(asset.url ?? "").trim(),
    }))
    .filter((asset) => asset.url);

  const { skill, executionSkill, runtimeBundleSkill, executionPolicy } = await resolveSlideSkillForPlanning(input.slideSkillId, input);
  const baseSlidePayload = buildPresentationSlideRequestPayload({
    topic: input.topic,
    article: trimmedArticle,
    slideSkillId: input.slideSkillId,
    preferredLanguage: input.preferredLanguage,
    canvasRatio: input.canvasRatio,
    outputFormats: input.outputFormats,
    maxPages: input.maxPages,
    imageAssets,
    imagePromptContext: input.imagePromptContext,
    editorialPlannerOptions: input.editorialPlannerOptions,
    pageImagePlanOverrides: input.pageImagePlanOverrides,
  });
  const slidePayload = mergePresentationSkillPayloadOverride(
    baseSlidePayload,
    input.slidePayloadOverrideJson,
  ) as PresentationSlideSkillRequestPayload;
  const slidePayloadJson = JSON.stringify(slidePayload, null, 2);
  const imageReferenceLookup = buildImageReferenceLookup(slidePayload);
  const requestedStructuredOutputFormat =
    typeof (slidePayload as Record<string, unknown>)?.output_format === "string"
      ? String((slidePayload as Record<string, unknown>).output_format)
      : null;
  const expectsRenderManifest = requestedStructuredOutputFormat === "render_manifest_json";
  const usesSandboxSkill = String(executionSkill.executionMode ?? "").trim().toLowerCase() === "sandbox-command";
  const runtimeAliasApplied = (
    String(runtimeBundleSkill.id ?? "").trim() !== String(skill.id ?? "").trim()
    || String(runtimeBundleSkill.skillFilePath ?? "").trim() !== String(skill.skillFilePath ?? "").trim()
  );
  const structuredOutputSchema = usesSandboxSkill
    ? null
    : await loadSlideSkillStructuredOutputSchema({
        skill: executionSkill,
        expectedOutputFormat: requestedStructuredOutputFormat,
      });
  const requestedRenderManifestPageCount = expectsRenderManifest
    ? getExpectedEditorialRenderManifestPageCount(slidePayload)
    : null;
  const debugTrace: Record<string, unknown> = {
    createdAt: new Date().toISOString(),
    userId: input.userId,
    tenantId: input.tenantId,
    skillId: input.slideSkillId,
    skillName: skill.name || null,
    executionSkillId: executionSkill.id || null,
    executionSkillName: executionSkill.name || null,
    selectedSkillFilePath: skill.skillFilePath ?? null,
    executionSkillFilePath: executionSkill.skillFilePath ?? null,
    runtimeBundleSkillId: runtimeBundleSkill.id || null,
    runtimeBundleSkillName: runtimeBundleSkill.name || null,
    runtimeBundleSkillFilePath: runtimeBundleSkill.skillFilePath ?? null,
    runtimeAliasApplied,
    usesSandboxSkill,
    request: {
      topic: input.topic,
      article: trimmedArticle,
      preferredLanguage: input.preferredLanguage ?? null,
      canvasRatio: input.canvasRatio,
      outputFormats: input.outputFormats,
      maxPages: input.maxPages,
      targetImageCount: input.targetImageCount,
      requiresThinking: input.requiresThinking ?? false,
      imageAssets,
      imagePromptContext: input.imagePromptContext ?? null,
      editorialPlannerOptions: input.editorialPlannerOptions ?? null,
      pageImagePlanOverrides: input.pageImagePlanOverrides ?? [],
      slidePayloadOverrideJson: input.slidePayloadOverrideJson ?? null,
    },
    executionPolicy,
    slidePayload,
    slidePayloadJson,
    structuredOutputSchema: structuredOutputSchema
      ? {
          name: structuredOutputSchema.name,
          schemaPath: structuredOutputSchema.schemaPath,
          expectedOutputFormat: requestedStructuredOutputFormat,
        }
      : null,
    traces: {},
  };
  let debugTracePath: string | null = null;
  const persistDebugTrace = async (finalState: string, extra?: Record<string, unknown>): Promise<string | null> => {
    debugTrace.finalState = finalState;
    if (extra) {
      Object.assign(debugTrace, extra);
    }
    const nextPath = await writePresentationSlideDebugSnapshot(debugTrace);
    if (nextPath) {
      debugTracePath = nextPath;
      debugTrace.debugTracePath = nextPath;
    }
    return debugTracePath;
  };
  const withDebugTraceMessage = async (
    message: string,
    extra?: Record<string, unknown>,
  ): Promise<string> => {
    const nextPath = await persistDebugTrace("error", extra);
    if (!nextPath || message.includes("[debug trace:")) {
      return message;
    }
    return `${message} [debug trace: ${nextPath}]`;
  };
  const generateSlideJsonViaLlm = async (): Promise<{ slideJson: string; modelId?: string }> => {
    const llmTrace: Record<string, unknown> = {};
    (debugTrace.traces as Record<string, unknown>).llm = llmTrace;
    const renderManifestTokenBudget = expectsRenderManifest
      ? Math.max(
          12_000,
          clampSlideCount(requestedRenderManifestPageCount ?? input.maxPages) * 1_200,
        )
      : 6_000;
    const executeJsonPass = async (
      messages: Array<{ role: "system" | "user"; content: string }>,
      operation: string,
    ) => {
      const result = await executeSkillLlmWithFallback({
        messages,
      skillSlug: input.slideSkillId,
      userId: input.userId,
      executionPolicy,
      maxModelAttempts: 1,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: renderManifestTokenBudget,
      extraBodyParams: structuredOutputSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: structuredOutputSchema.name,
                  schema: structuredOutputSchema.schema,
                  strict: true,
                },
              },
            }
          : undefined,
      });

      if (!result.success || !result.content?.trim()) {
        throw new Error(result.error || "Failed to generate slide JSON");
      }

      await chargePresentationSkillLlmUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        skillSlug: input.slideSkillId,
        operation,
        result,
      });

      return result;
    };

    const systemPrompt = [
      executionSkill.systemPrompt?.trim() || "You are a premium slide layout planner.",
      "Return strict JSON only.",
      "Do not wrap the response in markdown fences.",
      "Use all supplied image URLs as separate image objects, never flatten them into a single bitmap.",
      expectsRenderManifest
        ? [
            "Return the exact skill output contract requested by the payload.",
            "For this request, the output must remain render_manifest_json.",
            requestedRenderManifestPageCount
              ? `The payload includes ${requestedRenderManifestPageCount} authoritative page briefs. Output exactly ${requestedRenderManifestPageCount} pages, one page per brief, in order, without merging or skipping briefs.`
              : "Treat the page briefs as authoritative and do not merge or skip pages.",
            "Do not rewrite the response into a top-level slides array.",
          ].join("\n")
        : "The response must be directly importable by Presentation Editor with a top-level object containing slides as an array.",
    ].join("\n\n");

    const initialResult = await executeJsonPass([
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          "Generate the slide layout JSON for the following request.",
          expectsRenderManifest
            ? [
                "The skill contract is render_manifest_json. Return that format exactly; the server will normalize it for Presentation Editor import after validation.",
                requestedRenderManifestPageCount
                  ? `There are ${requestedRenderManifestPageCount} authoritative page briefs in the payload. Return exactly ${requestedRenderManifestPageCount} pages, one page per brief, in the same order.`
                  : "The page briefs in the payload are authoritative. Return one page per brief in the same order.",
              ].join("\n")
            : "The final consumer is the Presentation Editor, so return JSON layout data only.",
          "Even if outputFormats contains md/pptx/pdf, this immediate response must be JSON.",
          "",
          slidePayloadJson,
        ].join("\n"),
      },
    ], "presentation.generate_slide_json");

    const initialRawJson = trimSlideJson(stripOuterCodeFences(initialResult.content ?? ""));
    const normalizedInitialJson = normalizeImportableSlideJson(initialRawJson, imageReferenceLookup);
    const initialImportability = normalizedInitialJson
      ? normalizeImportableSlideJsonForCount(normalizedInitialJson)
      : null;
    llmTrace.initial = {
      modelId: initialResult.modelId ?? null,
      rawJson: initialRawJson,
      importability: inspectGeneratedSlideImportability(initialRawJson),
      requestedPageCount: requestedRenderManifestPageCount ?? null,
      normalizedImportability: initialImportability,
      pageCountAccepted: !requestedRenderManifestPageCount
        ? true
        : initialImportability?.totalSlides === requestedRenderManifestPageCount
          && initialImportability.importableSlides === requestedRenderManifestPageCount,
      normalizedSlideJson: normalizedInitialJson,
    };
    if (
      normalizedInitialJson
      && (!requestedRenderManifestPageCount
        || (initialImportability?.totalSlides === requestedRenderManifestPageCount
          && initialImportability.importableSlides === requestedRenderManifestPageCount))
    ) {
      llmTrace.selectedPass = "initial";
      return {
        slideJson: normalizedInitialJson,
        modelId: initialResult.modelId,
      };
    }

    const repairResult = await executeJsonPass([
      {
        role: "system",
        content: [
          "You repair malformed slide JSON into Presentation Editor importable JSON.",
          "Return strict JSON only.",
          expectsRenderManifest
            ? [
                "The final JSON must preserve the requested render_manifest_json contract.",
                requestedRenderManifestPageCount
                  ? `The request requires exactly ${requestedRenderManifestPageCount} pages. Output exactly ${requestedRenderManifestPageCount} pages, one page per brief, in the same order, without merging or skipping briefs.`
                  : "The page briefs in the payload are authoritative. Return one page per brief in the same order.",
              ].join("\n")
            : "The final JSON must contain a top-level slides array.",
          "Do not explain anything.",
        ].join("\n\n"),
      },
      {
        role: "user",
        content: [
          "The previous output was not importable by Presentation Editor.",
          expectsRenderManifest
            ? [
                "Rewrite it into valid render_manifest_json that matches the original skill schema.",
                requestedRenderManifestPageCount
                  ? `The request requires exactly ${requestedRenderManifestPageCount} pages. Return exactly ${requestedRenderManifestPageCount} pages, one page per brief, in the same order, and do not merge or skip content.`
                  : "The page briefs in the payload are authoritative. Return one page per brief in the same order.",
              ].join("\n")
            : "Rewrite it into valid importable slide JSON.",
          "Keep the same intended content and use the original request as the source of truth.",
          "",
          "Original request JSON:",
          slidePayloadJson,
          "",
          "Previous invalid output:",
          initialRawJson,
        ].join("\n"),
      },
    ], "presentation.repair_slide_json");

    const repairedRawJson = trimSlideJson(stripOuterCodeFences(repairResult.content ?? ""));
    const normalizedRepairedJson = normalizeImportableSlideJson(repairedRawJson, imageReferenceLookup);
    const repairedImportability = normalizedRepairedJson
      ? normalizeImportableSlideJsonForCount(normalizedRepairedJson)
      : null;
    llmTrace.repair = {
      modelId: repairResult.modelId ?? null,
      rawJson: repairedRawJson,
      importability: inspectGeneratedSlideImportability(repairedRawJson),
      requestedPageCount: requestedRenderManifestPageCount ?? null,
      normalizedImportability: repairedImportability,
      pageCountAccepted: !requestedRenderManifestPageCount
        ? true
        : repairedImportability?.totalSlides === requestedRenderManifestPageCount
          && repairedImportability.importableSlides === requestedRenderManifestPageCount,
      normalizedSlideJson: normalizedRepairedJson,
    };
    if (!normalizedRepairedJson) {
      throw new Error(describeSlideJsonImportFailure(repairedRawJson));
    }
    if (
      requestedRenderManifestPageCount
      && (
        repairedImportability?.totalSlides !== requestedRenderManifestPageCount
        || repairedImportability.importableSlides !== requestedRenderManifestPageCount
      )
    ) {
      throw new Error(describeSlideJsonPageCountFailure(
        normalizedRepairedJson,
        requestedRenderManifestPageCount,
      ));
    }

    llmTrace.selectedPass = "repair";
    return {
      slideJson: normalizedRepairedJson,
      modelId: repairResult.modelId || initialResult.modelId,
    };
  };
  let slideJson = "";
  let modelId: string | undefined;
  let artifactJobId: string | null = null;
  let artifacts: PresentationSlideArtifact[] = [];
  let downloadUrl: string | null = null;
  let artifactFailureMessage: string | null = null;
  const requestedArtifactFormats = input.outputFormats.filter((format) => format === "pptx" || format === "pdf");
  try {
    if (usesSandboxSkill) {
      const sandboxTrace: Record<string, unknown> = {
        requestedArtifactFormats,
      };
      (debugTrace.traces as Record<string, unknown>).sandbox = sandboxTrace;
      try {
        await chargePresentationSandboxSkillDispatch({
          userId: input.userId,
          tenantId: input.tenantId,
          skill: executionSkill,
          outputFormats: input.outputFormats.slice(),
        });
        const dispatchResult = await executeSkill(
          executionSkill,
          {
            prompt: trimmedArticle,
            extraParams: slidePayload as unknown as Record<string, unknown>,
          },
          input.userId,
          createInternalTokenFromAuth({ userId: input.userId, tenantId: input.tenantId }, ["skill:execute"]),
          input.tenantId,
        );

        if (!dispatchResult.success) {
          throw new Error(dispatchResult.error || "Failed to start slide artifact generation");
        }
        sandboxTrace.dispatchResult = {
          success: dispatchResult.success,
          jobId: dispatchResult.jobId ?? null,
          error: dispatchResult.error ?? null,
        };
        artifactJobId = dispatchResult.jobId ?? null;
        if (!artifactJobId) {
          throw new Error("Slide artifact generation did not return a job id");
        }
        artifacts = await waitForSlideArtifacts({
          tenantId: input.tenantId,
          jobId: artifactJobId,
        });
        sandboxTrace.artifacts = artifacts;
        const artifactDebugEntries: Array<Record<string, unknown>> = [];
        sandboxTrace.artifactDebugEntries = artifactDebugEntries;
        slideJson = await resolveSlideJsonFromArtifacts(artifacts, "", {
          debugArtifacts: artifactDebugEntries,
        });
        slideJson = normalizeImportableSlideJson(slideJson, imageReferenceLookup) ?? slideJson;
        sandboxTrace.resolvedSlideJson = slideJson;
        sandboxTrace.resolvedImportability = inspectGeneratedSlideImportability(slideJson);
        if (!isImportableSlideJson(slideJson, imageReferenceLookup)) {
          throw new Error(
            `Sandbox slide skill completed but did not produce importable slide JSON (${describeSlideJsonImportFailure(slideJson)})`,
          );
        }
        downloadUrl = (
          artifacts.find((artifact) => artifact.format === "pptx")
          ?? artifacts.find((artifact) => artifact.format === "pdf")
          ?? artifacts.find((artifact) => artifact.isPrimary)
          ?? artifacts[0]
        )?.url ?? null;
      } catch (error) {
        sandboxTrace.error = error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack ?? null,
        } : { message: String(error) };
        if (requestedArtifactFormats.length > 0 && isImportableSlideJson(slideJson, imageReferenceLookup)) {
          artifactJobId = null;
          artifacts = [];
          downloadUrl = null;
          artifactFailureMessage = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Slide artifact generation failed";
        } else {
          let llmFallbackError: unknown = null;
          try {
            const llmFallback = await generateSlideJsonViaLlm();
            slideJson = llmFallback.slideJson;
            modelId = llmFallback.modelId;
          } catch (fallbackError) {
            llmFallbackError = fallbackError;
          }
          if (!isImportableSlideJson(slideJson, imageReferenceLookup)) {
            const deterministicFallback = buildDeterministicSlideJsonFromPayload(slidePayload, imageReferenceLookup);
            if (!deterministicFallback) {
              if (llmFallbackError) {
                throw llmFallbackError;
              }
              throw error;
            }
            slideJson = deterministicFallback;
            modelId = undefined;
          }
          artifactJobId = null;
          artifacts = [];
          downloadUrl = null;
          artifactFailureMessage = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Slide artifact generation failed";
        }
      }
      if (requestedArtifactFormats.length === 0) {
        artifactJobId = null;
      }
    } else {
      const llmResult = await generateSlideJsonViaLlm();
      slideJson = llmResult.slideJson;
      if (!isImportableSlideJson(slideJson, imageReferenceLookup)) {
        throw new Error(describeSlideJsonImportFailure(slideJson));
      }
      modelId = llmResult.modelId;
    }

    const finalImportability = inspectGeneratedSlideImportability(slideJson);
    const result: GeneratePresentationSlideDraftResult = {
      maxPages: clampSlideCount(input.maxPages),
      slideSkillLabel: skill.name || skill.id || input.slideSkillId,
      slidePayload,
      slidePayloadJson,
      slideJson,
      modelId,
      generatedAt: String(debugTrace.createdAt ?? new Date().toISOString()),
      selectedSkillId: skill.id || input.slideSkillId,
      selectedSkillName: skill.name || null,
      executionSkillId: executionSkill.id || null,
      executionSkillName: executionSkill.name || null,
      runtimeBundleSkillId: runtimeBundleSkill.id || null,
      runtimeBundleSkillName: runtimeBundleSkill.name || null,
      runtimeAliasApplied,
      artifactJobId,
      artifacts,
      downloadUrl,
      artifactFailureMessage,
      debugTracePath: null,
    };
    const nextPath = await persistDebugTrace("success", {
      finalSlideJson: slideJson,
      finalImportability,
      resultSummary: {
        maxPages: result.maxPages,
        slideSkillLabel: result.slideSkillLabel,
        artifactJobId: artifactJobId ?? null,
        artifactCount: artifacts.length,
        downloadUrl: downloadUrl ?? null,
        artifactFailureMessage: artifactFailureMessage ?? null,
      },
    });
    result.debugTracePath = nextPath;
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Failed to generate slide JSON";
    throw new Error(await withDebugTraceMessage(errorMessage, {
      partialResult: {
        slideJson,
        modelId: modelId ?? null,
        artifactJobId: artifactJobId ?? null,
        artifactCount: artifacts.length,
        downloadUrl: downloadUrl ?? null,
        artifactFailureMessage: artifactFailureMessage ?? null,
      },
      finalError: error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
          }
        : { message: String(error) },
    }));
  }
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
      maxModelAttempts: 1,
      enableThinking: input.requiresThinking || undefined,
      maxTokens: 3_200,
    });

  if (!result.success || !result.content?.trim()) {
    throw new Error(result.error || "Failed to generate article from skill");
  }

  await chargePresentationSkillLlmUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: skillId,
    operation: "presentation.generate_article",
    result,
  });

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

  const userToken = createInternalTokenFromAuth({ userId: input.userId, tenantId: input.tenantId }, ["agency:run"]);
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
