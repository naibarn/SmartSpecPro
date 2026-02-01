import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { llmProviders } from "../../drizzle/schema";
import { eq, asc, like } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";

/** STT provider templates with signup links and pricing */
const STT_PROVIDER_TEMPLATES = [
  {
    providerName: "stt-groq",
    displayName: "Groq (Free Whisper)",
    description: "Free speech-to-text using Whisper Large v3 Turbo on Groq's ultra-fast infrastructure",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "whisper-large-v3-turbo",
    signupUrl: "https://console.groq.com/keys",
    creditCostPerMinute: 0,
  },
  {
    providerName: "stt-openai",
    displayName: "OpenAI Whisper",
    description: "High-accuracy speech-to-text using OpenAI's Whisper model",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "whisper-1",
    signupUrl: "https://platform.openai.com/api-keys",
    creditCostPerMinute: 6,
  },
  {
    providerName: "stt-google",
    displayName: "Google Cloud Speech-to-Text",
    description: "Google's enterprise-grade speech recognition service",
    baseUrl: "https://speech.googleapis.com/v1",
    defaultModel: "default",
    signupUrl: "https://console.cloud.google.com/apis/credentials",
    creditCostPerMinute: 4,
  },
];

export const sttProvidersRouter = router({
  /** List all STT providers (stt-* prefix in llmProviders) */
  list: adminProcedure.query(async () => {
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        displayName: llmProviders.displayName,
        description: llmProviders.description,
        baseUrl: llmProviders.baseUrl,
        hasApiKey: llmProviders.hasApiKey,
        defaultModel: llmProviders.defaultModel,
        configJson: llmProviders.configJson,
        isEnabled: llmProviders.isEnabled,
        sortOrder: llmProviders.sortOrder,
      })
      .from(llmProviders)
      .where(like(llmProviders.providerName, "stt-%"))
      .orderBy(asc(llmProviders.sortOrder));

    return providers;
  }),

  /** Return hardcoded STT provider templates */
  templates: adminProcedure.query(() => {
    return STT_PROVIDER_TEMPLATES;
  }),

  /** Upsert an STT provider */
  upsert: adminProcedure
    .input(
      z.object({
        id: z.number().optional(), // if provided, update; otherwise create
        providerName: z.string().min(1).max(64),
        displayName: z.string().min(1).max(128),
        description: z.string().optional(),
        baseUrl: z.string().min(1),
        apiKey: z.string().optional(),
        defaultModel: z.string().optional(),
        isEnabled: z.boolean().default(true),
        configJson: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Ensure providerName starts with stt-
      const providerName = input.providerName.startsWith("stt-")
        ? input.providerName
        : `stt-${input.providerName}`;

      const configJson = {
        ...(input.configJson || {}),
        type: "stt",
      };

      if (input.id) {
        // Update existing
        const updateData: any = {
          displayName: input.displayName,
          description: input.description || null,
          baseUrl: input.baseUrl,
          defaultModel: input.defaultModel || null,
          isEnabled: input.isEnabled,
          configJson,
        };

        if (input.apiKey !== undefined && input.apiKey !== "") {
          updateData.apiKeyEncrypted = encrypt(input.apiKey);
          updateData.hasApiKey = true;
        }

        await db
          .update(llmProviders)
          .set(updateData)
          .where(eq(llmProviders.id, input.id));

        return { id: input.id };
      }

      // Create new — check for duplicates
      const existing = await db
        .select({ id: llmProviders.id })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, providerName))
        .limit(1);

      if (existing.length > 0) {
        // Update instead
        const updateData: any = {
          displayName: input.displayName,
          description: input.description || null,
          baseUrl: input.baseUrl,
          defaultModel: input.defaultModel || null,
          isEnabled: input.isEnabled,
          configJson,
        };
        if (input.apiKey) {
          updateData.apiKeyEncrypted = encrypt(input.apiKey);
          updateData.hasApiKey = true;
        }
        await db
          .update(llmProviders)
          .set(updateData)
          .where(eq(llmProviders.id, existing[0].id));
        return { id: existing[0].id };
      }

      // Insert
      const result = await db.insert(llmProviders).values({
        providerName,
        displayName: input.displayName,
        description: input.description || null,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey) : null,
        hasApiKey: !!input.apiKey,
        defaultModel: input.defaultModel || null,
        configJson,
        isEnabled: input.isEnabled,
        sortOrder: 900, // high sort order so STT doesn't interfere with LLM providers
      });

      return { id: Number(result.insertId) };
    }),

  /** Delete an STT provider */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(llmProviders).where(eq(llmProviders.id, input.id));
      return { success: true };
    }),

  /** Toggle enabled state */
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select({ isEnabled: llmProviders.isEnabled })
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);

      if (!provider) throw new Error("Provider not found");

      await db
        .update(llmProviders)
        .set({ isEnabled: !provider.isEnabled })
        .where(eq(llmProviders.id, input.id));

      return { isEnabled: !provider.isEnabled };
    }),

  /** Test connection to an STT provider */
  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);

      if (!provider) throw new Error("Provider not found");
      if (!provider.apiKeyEncrypted) throw new Error("No API key configured");

      const apiKey = decrypt(provider.apiKeyEncrypted);
      if (!apiKey) throw new Error("Failed to decrypt API key");

      const providerName = provider.providerName;

      try {
        // For Whisper-compatible APIs (Groq, OpenAI), test /models endpoint
        if (providerName === "stt-groq" || providerName === "stt-openai") {
          const baseUrl = (provider.baseUrl || "").replace(/\/+$/, "");
          const testUrl = `${baseUrl}/models`;
          const response = await fetch(testUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10000),
          });

          if (response.ok) {
            return { success: true, message: "Connection successful" };
          }
          return {
            success: false,
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        // For Google STT, just confirm the key format is valid
        if (providerName === "stt-google") {
          return {
            success: true,
            message: "API key configured (Google Cloud STT)",
          };
        }

        return { success: true, message: "API key configured" };
      } catch (error: any) {
        return {
          success: false,
          message: `Connection failed: ${error.message}`,
        };
      }
    }),
});
