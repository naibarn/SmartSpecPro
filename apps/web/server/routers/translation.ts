/**
 * Translation tRPC Router
 * Translates text between English and user's preferred language using a dedicated LLM model.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { deductCredits, calculateCreditsForLLM } from "../services/creditService";
import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
import { getProviderForModel } from "../services/llmRouter";
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";

const LANGUAGE_NAMES: Record<string, string> = {
  th: "Thai", zh: "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)",
  ja: "Japanese", ko: "Korean", fr: "French", es: "Spanish",
  de: "German", pt: "Portuguese", ar: "Arabic", ru: "Russian",
  hi: "Hindi", vi: "Vietnamese", id: "Indonesian", it: "Italian",
  nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
};

function isLikelyEnglish(text: string): boolean {
  // Check first 300 chars: if >70% ASCII letters, likely English
  const sample = text.substring(0, 300);
  const asciiLetters = (sample.match(/[a-zA-Z]/g) || []).length;
  return asciiLetters / Math.max(sample.length, 1) > 0.5;
}

// Note: getActiveLlmProvider removed — now uses getProviderForModel from llmRouter

function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.includes("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export const translationRouter = router({
  translate: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(10000),
      targetLanguage: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get user preferences
      const [user] = await db
        .select({ userPreferences: users.userPreferences })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const prefs = (user?.userPreferences as Record<string, any>) || {};
      const targetLang = input.targetLanguage || prefs.translationLanguage || "th";
      const langName = LANGUAGE_NAMES[targetLang] || targetLang;

      // Run planner (returns null if disabled — zero overhead)
      const plannerResult = await runPlanner({
        sourceType: "translation",
        userId: ctx.user.id,
        tenantId: ctx.tenantId || "default",
        conversationModel: prefs.translationModel,
      });

      let model: string | null;
      if (plannerResult?.resolvedModel) {
        model = plannerResult.resolvedModel;
      } else {
        model = await resolveEnabledLlmModelId([prefs.translationModel]);
      }
      if (!model) {
        throw new Error("No enabled LLM model available for translation");
      }

      // Detect direction
      const textIsEnglish = isLikelyEnglish(input.text);
      const systemPrompt = textIsEnglish
        ? `You are a professional translator. Translate the following English text to ${langName}. Return ONLY the translated text, no explanations or notes.`
        : `You are a professional translator. Translate the following text to English. Return ONLY the translated text, no explanations or notes.`;

      // Get LLM provider
      const provider = await getProviderForModel(model);
      if (!provider) throw new Error("No LLM provider available");

      // Call LLM (non-streaming)
      const response = await fetch(resolveChatUrl(provider.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.text },
          ],
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("[Translation] LLM error:", err);
        throw new Error("Translation failed");
      }

      const data = await response.json();
      const translatedText = data.choices?.[0]?.message?.content?.trim() || "";
      const usage = data.usage || {};

      // Deduct credits
      const credits = calculateCreditsForLLM(
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        model,
      );

      await deductCredits({
        userId: ctx.user.id,
        amount: credits,
        description: `Translation (${textIsEnglish ? "EN→" + targetLang.toUpperCase() : "→EN"})`,
        sourceType: "translation",
        metadata: { model, provider: provider.providerName, tokens: usage },
      });

      // Record step attempt for planner telemetry
      if (plannerResult) {
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model,
          provider: provider.providerName,
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          snapshot: plannerResult.snapshot,
          creditsUsed: credits,
        }).catch(() => {}); // fire-and-forget
      }

      return {
        translatedText,
        sourceLanguage: textIsEnglish ? "en" : "detected",
        targetLanguage: textIsEnglish ? targetLang : "en",
        creditsUsed: credits,
      };
    }),
});
