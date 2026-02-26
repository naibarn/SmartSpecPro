import type {
  GenerateAIDraftInput,
  AIPresentationSlide,
  AIDraftProgress,
} from "@shared/presentation/aiTypes";
import {
  AIPresentationSchema,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_SVG_CATEGORIES,
} from "@shared/presentation/aiTypes";
import { getBuiltInPreset } from "@shared/presentation/aiStylePresets";
import { pickRandomSvgFromCategory } from "@shared/presentation/svgGraphicsCatalog";
import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import { invokeLLM } from "../_core/llm";
import { callLLMStructured } from "./callLLMStructured";
import { getSkillByIdAsync } from "./skillRegistry";
import { mediaGenerationService } from "./mediaGenerationService";
import { addSlideToDeck, type PresentationActor } from "./presentationService";
import { hasEnoughCredits } from "./creditService";
import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";
import { getDb } from "../db";
import { generateSlide } from "./aiPresentationLayoutEngine";

// ── Constants ──────────────────────────────────────────────

const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_POLL_TIMEOUT_MS = 15000;
const LOCK_TTL_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_IMAGE_CONCURRENCY = 3;

const CREDIT_ARTICLE = 30;
const CREDIT_SPLIT = 10;
const CREDIT_IMAGE_SKILL = 75;
const CREDIT_IMAGE_GEN = 40;
const CREDIT_BUFFER_MULTIPLIER = 1.2;

// ── Slide Split System Prompt ──────────────────────────────

const SLIDE_SPLIT_SYSTEM_PROMPT = `You are a presentation content structurer. Your job is to split an article into individual presentation slides.

For each slide, produce a JSON object with these fields:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)}
- title: a short, compelling title for the slide (max 200 chars)
- body: an array of 1-10 bullet point strings summarizing the key points
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} - pick the most relevant category for a decorative SVG icon
- imagePromptKeywords: a descriptive prompt (max 500 chars) for generating a relevant background/hero image

Output ONLY a valid JSON array. No markdown code fences, no explanatory text.

The first slide MUST use templateId "hero_center" as the title/intro slide.
Distribute remaining slides among "split_left_image", "split_right_image", and "feature_boxes_right" for visual variety.`;

// ── Public Functions ───────────────────────────────────────

export function estimateCreditCost(numSlides: number): number {
  const base = CREDIT_ARTICLE + CREDIT_SPLIT + (CREDIT_IMAGE_SKILL + CREDIT_IMAGE_GEN) * numSlides;
  return Math.round(base * CREDIT_BUFFER_MULTIPLIER);
}

export function buildArticlePrompt(
  topic: string,
  language: string,
  numSlides: number,
): string {
  const langInstruction =
    language === "auto"
      ? "Write in the same language as the topic. If the topic is in Thai, write in Thai. If in English, write in English."
      : language === "th"
        ? "Write the entire article in Thai."
        : "Write the entire article in English.";

  return `Write a well-structured article about: ${topic}

${langInstruction}

The article will be split into approximately ${numSlides} presentation slides, so organize the content into ${numSlides} clearly numbered sections. Each section should cover one main idea and be 2-4 sentences long.

Include a clear, descriptive title at the top.`;
}

// ── Main Pipeline ──────────────────────────────────────────

export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void> {
  const redis = getRedisClient();
  const progressKey = `ai_draft_progress:${taskId}`;
  const lockKey = `ai_draft_lock:${actor.userId}`;
  const cancelKey = `ai_draft_cancel:${taskId}`;
  const warnings: string[] = [];

  async function updateProgress(partial: Partial<AIDraftProgress>): Promise<void> {
    const progress: AIDraftProgress = {
      phase: 0,
      phaseLabel: "Initializing...",
      slidesCompleted: 0,
      totalSlides: input.numSlides,
      slidePreview: [],
      completed: false,
      ...partial,
    };
    await redis.set(progressKey, JSON.stringify(progress), "EX", LOCK_TTL_SECONDS);
  }

  async function isCancelled(): Promise<boolean> {
    const val = await redis.get(cancelKey);
    return val !== null;
  }

  async function setCancelled(): Promise<void> {
    await updateProgress({
      completed: true,
      cancelled: true,
      phaseLabel: "Cancelled",
    });
  }

  // ── Credit pre-check ──────────────────────────────────
  const estimatedCost = estimateCreditCost(input.numSlides);
  const hasCredits = await hasEnoughCredits(actor.userId, estimatedCost);
  if (!hasCredits) {
    await updateProgress({
      completed: true,
      error: {
        code: PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS,
        message: "Insufficient credits for AI presentation generation",
      },
    });
    return;
  }

  // ── Redis lock acquisition ────────────────────────────
  const lockResult = await redis.set(lockKey, taskId, "NX", "EX", LOCK_TTL_SECONDS);
  if (lockResult === null) {
    await updateProgress({
      completed: true,
      error: {
        code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
        message: "A draft generation is already in progress",
      },
    });
    return;
  }

  // ── Heartbeat ─────────────────────────────────────────
  const heartbeat = setInterval(() => {
    redis.expire(lockKey, LOCK_TTL_SECONDS).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // ── Phase 1: Article Generation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 1, phaseLabel: "Writing article..." });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      requestPayload: { phase: 1, skillId: input.articleSkillId, topic: input.prompt },
    });

    const articleSkill = await getSkillByIdAsync(input.articleSkillId);
    if (!articleSkill?.systemPrompt) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article skill not found: ${input.articleSkillId}`,
        },
      });
      return;
    }

    let articleText: string;
    try {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: articleSkill.systemPrompt },
          { role: "user", content: buildArticlePrompt(input.prompt, input.language, input.numSlides) },
        ],
      });
      const content = result.choices[0]?.message?.content;
      articleText = typeof content === "string" ? content : JSON.stringify(content);
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article generation failed: ${(err as Error).message}`,
        },
      });
      return;
    }

    // ── Phase 2: Article to Slide Split ───────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 2, phaseLabel: "Splitting into slides..." });

    // Truncate article to prevent token overflow
    const truncatedArticle = articleText.split(/\s+/).slice(0, 2000).join(" ");

    let slides: AIPresentationSlide[];
    try {
      const splitResult = await callLLMStructured({
        systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT,
        userMessage: truncatedArticle,
        zodSchema: AIPresentationSchema,
        userId: actor.userId,
        tenantId: actor.tenantId,
      });
      slides = splitResult.data;
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
          message: `Article split failed: ${(err as Error).message}`,
        },
      });
      return;
    }

    // Force slide 1 to hero_center
    if (slides.length > 0 && slides[0].templateId !== "hero_center") {
      slides[0] = { ...slides[0], templateId: "hero_center" };
    }

    // Build slide preview
    const slidePreview = slides.map((s) => ({
      title: s.title,
      imageStatus: "pending" as const,
    }));

    await updateProgress({
      phase: 2,
      phaseLabel: "Slides structured",
      totalSlides: slides.length,
      slidePreview,
    });

    // ── Phase 3+4: Image Enhancement + Generation ─────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 3, phaseLabel: "Generating images..." });

    // Load image skill if provided
    let imageSkillSystemPrompt: string | null = null;
    if (input.imageSkillId) {
      const imageSkill = await getSkillByIdAsync(input.imageSkillId);
      imageSkillSystemPrompt = imageSkill?.systemPrompt ?? null;
    }

    const imageUrls: (string | null)[] = [];

    // Process slides with bounded concurrency
    await mapWithConcurrency(
      slides,
      async (slide, index) => {
        if (await isCancelled()) {
          imageUrls[index] = null;
          return;
        }

        // Phase 3: Image prompt enhancement
        let imagePrompt = slide.imagePromptKeywords;
        if (imageSkillSystemPrompt) {
          try {
            const enhanceResult = await invokeLLM({
              messages: [
                { role: "system", content: imageSkillSystemPrompt },
                { role: "user", content: slide.imagePromptKeywords },
              ],
            });
            const content = enhanceResult.choices[0]?.message?.content;
            imagePrompt = typeof content === "string" ? content : slide.imagePromptKeywords;
          } catch {
            warnings.push(`Slide ${index + 1}: image prompt enhancement failed, using raw keywords`);
          }
        }

        // Phase 4: Image generation
        let imageUrl: string | null = null;
        try {
          const mediaTask = await mediaGenerationService.generateImageAsync(
            { prompt: imagePrompt, model: input.imageModel || "flux-2.0", aspectRatio: "16:9" },
            userToken,
          );
          imageUrl = await pollMediaTask(mediaTask.id, userToken, IMAGE_POLL_TIMEOUT_MS);
        } catch {
          warnings.push(`Slide ${index + 1}: image generation failed`);
        }

        imageUrls[index] = imageUrl;

        // Update slide preview
        slidePreview[index] = {
          ...slidePreview[index],
          imageStatus: imageUrl ? "done" : "placeholder",
        };

        await updateProgress({
          phase: 4,
          phaseLabel: `Images: ${index + 1}/${slides.length}`,
          slidesCompleted: index + 1,
          totalSlides: slides.length,
          slidePreview,
        });
      },
      MAX_IMAGE_CONCURRENCY,
    );

    // ── Phase 5: Layout Compilation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 5, phaseLabel: "Compiling layouts..." });

    const preset = getBuiltInPreset(input.stylePresetId);
    if (!preset) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Unknown style preset: ${input.stylePresetId}`,
        },
      });
      return;
    }

    // Override footer text if provided
    const presetCopy = JSON.parse(JSON.stringify(preset));
    if (input.footerCustomText && presetCopy.footer) {
      presetCopy.footer.customText = input.footerCustomText;
      presetCopy.footer.showCustomText = true;
    }

    const compiledSlides: unknown[] = [];
    for (let i = 0; i < slides.length; i++) {
      const svg = pickRandomSvgFromCategory(slides[i].graphicCategory);
      const { slideContent, warnings: layoutWarnings } = generateSlide({
        slideData: slides[i],
        imageUrl: imageUrls[i] ?? null,
        svgGraphic: svg,
        stylePreset: presetCopy,
        deckTitle: input.prompt.slice(0, 50),
        slideIndex: i,
        totalSlides: slides.length,
      });
      compiledSlides.push(slideContent);
      warnings.push(...layoutWarnings);
    }

    // ── Phase 6: Deck Insertion ───────────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 6, phaseLabel: "Saving slides..." });

    const db = getDb();
    if (!db) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: "Database not available",
        },
      });
      return;
    }

    try {
      await db.transaction(async (tx: unknown) => {
        let expectedVersion = input.expectedVersion;
        for (const slideContent of compiledSlides) {
          await addSlideToDeck(
            { deckId: input.deckId, expectedVersion, slideContent },
            actor,
            tx as never,
          );
          expectedVersion++;
        }
      });
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Slide insertion failed: ${(err as Error).message}`,
        },
      });
      return;
    }

    // ── Success ─────────────────────────────────────────
    await updateProgress({
      phase: 6,
      phaseLabel: "Complete",
      completed: true,
      slidesCompleted: compiledSlides.length,
      totalSlides: compiledSlides.length,
      slidePreview,
      result: {
        slidesAdded: compiledSlides.length,
        newDeckVersion: input.expectedVersion + compiledSlides.length,
        articlePreview: articleText.slice(0, 200),
        warnings,
      },
    });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      responsePayload: {
        phase: "complete",
        slidesAdded: compiledSlides.length,
        warnings: warnings.length,
      },
    });
  } catch (err) {
    // Unexpected error — catch-all
    await updateProgress({
      completed: true,
      error: {
        code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
        message: `Unexpected error: ${(err as Error).message}`,
      },
    }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    await redis.del(lockKey).catch(() => {});
  }
}

// ── Helpers ────────────────────────────────────────────────

async function pollMediaTask(
  mediaTaskId: string,
  userToken: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await mediaGenerationService.getTask(mediaTaskId, userToken);
    if (task.status === "completed" && task.resultUrl) {
      return task.resultUrl;
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return null;
    }
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  return null; // timeout
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
