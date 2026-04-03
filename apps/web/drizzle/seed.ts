/**
 * Seed script for multi-provider model mappings
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING)
 */

import { getDb } from "../server/db";
import { llmProviders, modelProviderMap, routingRules, personaTemplates, assistantTeamTemplates } from "./schema";
import { eq } from "drizzle-orm";
import { encrypt } from "../server/services/crypto";
import {
  buildKieLlmAvailableModels,
  canonicalModelIdForCatalogModel,
  KIE_PROVIDER_NAME,
} from "../server/services/llmProviderCatalog";

interface ModelMapping {
  modelId: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;  // per 1M tokens
  pricingOutput: string; // per 1M tokens
  isFree: boolean;
  contextLength: number;
  priority: number;
}

function encryptSeedApiKey(apiKey: string): string | null {
  if (!apiKey) {
    return null;
  }
  return encrypt(apiKey);
}

export async function seedKieAiProvider(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  const apiKey = process.env.KIE_AI_API_KEY || "";
  const hasKey = !!apiKey;
  const encryptedApiKey = encryptSeedApiKey(apiKey);
  const kieAvailableModels = buildKieLlmAvailableModels();

  await db
    .insert(llmProviders)
    .values({
      providerName: KIE_PROVIDER_NAME,
      displayName: "Kie AI",
      description: "Kie AI marketplace gateway for GPT, Claude, Gemini, and Codex chat models",
      baseUrl: "https://api.kie.ai",
      apiKeyEncrypted: encryptedApiKey,
      hasApiKey: hasKey,
      isEnabled: hasKey,
      sortOrder: 15,
      providerType: "secondary",
      healthStatus: "healthy",
      failureCount: 0,
      successCount: 0,
      availableModels: kieAvailableModels,
      defaultModel: "gpt-5-4",
    })
    .onConflictDoNothing({ target: llmProviders.providerName });

  await db
    .update(llmProviders)
    .set({
      description: "Kie AI marketplace gateway for GPT, Claude, Gemini, and Codex chat models",
      baseUrl: "https://api.kie.ai",
      apiKeyEncrypted: encryptedApiKey,
      hasApiKey: hasKey,
      isEnabled: hasKey,
      availableModels: kieAvailableModels,
      defaultModel: "gpt-5-4",
    })
    .where(eq(llmProviders.providerName, KIE_PROVIDER_NAME));

  const [kieProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, KIE_PROVIDER_NAME))
    .limit(1);

  if (!kieProvider) {
    console.warn("[Seed] Failed to find Kie AI provider after insert");
    return;
  }

  for (const model of kieAvailableModels) {
    const pricingInput = model.pricing?.input ?? 0;
    const pricingOutput = model.pricing?.output ?? 0;

    await db
      .insert(modelProviderMap)
      .values({
        modelId: canonicalModelIdForCatalogModel(KIE_PROVIDER_NAME, model.id),
        providerId: kieProvider.id,
        modelName: model.name,
        providerModelId: model.id,
        pricingInput: String(pricingInput),
        pricingOutput: String(pricingOutput),
        isFree: pricingInput === 0 && pricingOutput === 0,
        contextLength: model.contextLength ?? null,
        isEnabled: true,
        priority: 0,
        apiStyle: model.apiStyle ?? "chat-completions",
        supportsVision: !!model.supportsVision,
        supportsThinking: !!model.supportsThinking,
        supportsWebSearch: !!model.supportsWebSearch,
        supportsFunctionTools: !!model.supportsFunctionTools,
        supportsStructuredOutputs: !!model.supportsStructuredOutputs,
        supportsCodeExecution: !!model.supportsCodeExecution,
        supportsComputerUse: !!model.supportsComputerUse,
        supportsBackground: !!model.supportsBackground,
        supportsResponses: !!model.supportsResponses,
      })
      .onConflictDoUpdate({
        target: [modelProviderMap.modelId, modelProviderMap.providerId],
        set: {
          modelName: model.name,
          providerModelId: model.id,
          pricingInput: String(pricingInput),
          pricingOutput: String(pricingOutput),
          isFree: pricingInput === 0 && pricingOutput === 0,
          contextLength: model.contextLength ?? null,
          isEnabled: true,
          apiStyle: model.apiStyle ?? "chat-completions",
          supportsVision: !!model.supportsVision,
          supportsThinking: !!model.supportsThinking,
          supportsWebSearch: !!model.supportsWebSearch,
          supportsFunctionTools: !!model.supportsFunctionTools,
          supportsStructuredOutputs: !!model.supportsStructuredOutputs,
          supportsCodeExecution: !!model.supportsCodeExecution,
          supportsComputerUse: !!model.supportsComputerUse,
          supportsBackground: !!model.supportsBackground,
          supportsResponses: !!model.supportsResponses,
        },
      });
  }

  if (!hasKey) {
    console.warn("[Seed] KIE_AI_API_KEY not set — provider seeded but disabled");
  }

  console.log(`[Seed] Kie AI: ${kieAvailableModels.length} models`);
}

export async function seedZenProvider(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  const apiKey = process.env.OPENCODE_ZEN_API_KEY || "";
  const hasKey = !!apiKey;
  const encryptedApiKey = encryptSeedApiKey(apiKey);

  // Define available models for OpenCode Zen
  // IMPORTANT: The 'id' field must match 'modelId' in modelProviderMap for correct routing
  const zenAvailableModels = [
    {
      id: "kimi-k2.5-free",
      name: "Kimi K2.5 (Free)",
      contextLength: 131072,
      pricing: { input: 0, output: 0 }
    },
    {
      id: "minimax-m2.1-free",
      name: "MiniMax M2.1 (Free)",
      contextLength: 245760,
      pricing: { input: 0, output: 0 }
    },
    {
      id: "glm-4.7-free",
      name: "GLM 4.7 (Free)",
      contextLength: 131072,
      pricing: { input: 0, output: 0 }
    },
  ];

  // 1. Upsert OpenCode Zen provider
  await db
    .insert(llmProviders)
    .values({
      providerName: "opencode-zen",
      displayName: "OpenCode Zen",
      description: "Secondary provider with free model access",
      baseUrl: "https://open-api.zen.com",
      apiKeyEncrypted: encryptedApiKey,
      hasApiKey: hasKey,
      isEnabled: hasKey,
      sortOrder: 10,
      providerType: "secondary",
      healthStatus: "healthy",
      failureCount: 0,
      successCount: 0,
      configJson: { firstChunkTimeoutMs: 15000 },
      availableModels: zenAvailableModels,
      defaultModel: "kimi-k2.5-free",
    })
    .onConflictDoNothing({ target: llmProviders.providerName });

  // Update availableModels if provider already exists
  await db
    .update(llmProviders)
    .set({
      apiKeyEncrypted: encryptedApiKey,
      hasApiKey: hasKey,
      isEnabled: hasKey,
      availableModels: zenAvailableModels,
      defaultModel: "kimi-k2.5-free",
    })
    .where(eq(llmProviders.providerName, "opencode-zen"));

  // 2. Get provider IDs
  const [zenProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "opencode-zen"))
    .limit(1);

  const [openrouterProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "openrouter"))
    .limit(1);

  if (!zenProvider) {
    console.warn("[Seed] Failed to find OpenCode Zen provider after insert");
    return;
  }

  const zenId = zenProvider.id;
  const openrouterId = openrouterProvider?.id;

  if (!hasKey) {
    console.warn("[Seed] OPENCODE_ZEN_API_KEY not set — provider seeded but disabled");
  }

  // 3. OpenCode Zen free models (priority 0 = highest)
  // NOTE: OpenCode Zen uses model names directly WITHOUT any prefix (e.g., "kimi-k2.5-free", not "opencode/...")
  const zenFreeModels: ModelMapping[] = [
    {
      modelId: "kimi-k2.5-free",
      modelName: "Kimi K2.5",
      providerModelId: "kimi-k2.5-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 131072,
      priority: 0,
    },
    {
      modelId: "minimax-m2.1-free",
      modelName: "MiniMax M2.1",
      providerModelId: "minimax-m2.1-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 245760,
      priority: 0,
    },
    {
      modelId: "glm-4.7-free",
      modelName: "GLM 4.7",
      providerModelId: "glm-4.7-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 131072,
      priority: 0,
    },
  ];

  // Insert OpenCode Zen models
  for (const model of zenFreeModels) {
    await db
      .insert(modelProviderMap)
      .values({
        modelId: model.modelId,
        providerId: zenId,
        modelName: model.modelName,
        providerModelId: model.providerModelId,
        pricingInput: model.pricingInput,
        pricingOutput: model.pricingOutput,
        isFree: model.isFree,
        contextLength: model.contextLength,
        isEnabled: true,
        priority: model.priority,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] OpenCode Zen: ${zenFreeModels.length} free models`);

  // 4. OpenRouter models (paid fallbacks + additional models)
  if (openrouterId) {
    const openrouterModels: ModelMapping[] = [
      // Paid fallbacks for free models (priority 10 = lower than free)
      {
        modelId: "kimi-k2.5-free",
        modelName: "Kimi K2.5",
        providerModelId: "moonshotai/kimi-k2.5",
        pricingInput: "0.14",    // $0.14/1M
        pricingOutput: "0.42",   // $0.42/1M
        isFree: false,
        contextLength: 131072,
        priority: 10,
      },
      {
        modelId: "minimax-m2.1-free",
        modelName: "MiniMax M2.1",
        providerModelId: "minimax/minimax-m2.1",
        pricingInput: "0.15",
        pricingOutput: "0.45",
        isFree: false,
        contextLength: 245760,
        priority: 10,
      },
      {
        modelId: "glm-4.7-free",
        modelName: "GLM 4.7",
        providerModelId: "zhipu/glm-4.7",
        pricingInput: "0.10",
        pricingOutput: "0.30",
        isFree: false,
        contextLength: 131072,
        priority: 10,
      },
      // Popular paid-only models
      {
        modelId: "gpt-4o",
        modelName: "GPT-4o",
        providerModelId: "openai/gpt-4o",
        pricingInput: "2.50",
        pricingOutput: "10.00",
        isFree: false,
        contextLength: 128000,
        priority: 0,
      },
      {
        modelId: "gpt-4o-mini",
        modelName: "GPT-4o Mini",
        providerModelId: "openai/gpt-4o-mini",
        pricingInput: "0.15",
        pricingOutput: "0.60",
        isFree: false,
        contextLength: 128000,
        priority: 0,
      },
      {
        modelId: "claude-3.5-sonnet",
        modelName: "Claude 3.5 Sonnet",
        providerModelId: "anthropic/claude-3.5-sonnet",
        pricingInput: "3.00",
        pricingOutput: "15.00",
        isFree: false,
        contextLength: 200000,
        priority: 0,
      },
      {
        modelId: "claude-3.5-haiku",
        modelName: "Claude 3.5 Haiku",
        providerModelId: "anthropic/claude-3.5-haiku",
        pricingInput: "0.80",
        pricingOutput: "4.00",
        isFree: false,
        contextLength: 200000,
        priority: 0,
      },
      {
        modelId: "deepseek-chat",
        modelName: "DeepSeek Chat",
        providerModelId: "deepseek/deepseek-chat",
        pricingInput: "0.14",
        pricingOutput: "0.28",
        isFree: false,
        contextLength: 64000,
        priority: 0,
      },
      {
        modelId: "gemini-2.0-flash",
        modelName: "Gemini 2.0 Flash",
        providerModelId: "google/gemini-2.0-flash-001",
        pricingInput: "0.10",
        pricingOutput: "0.40",
        isFree: false,
        contextLength: 1000000,
        priority: 0,
      },
      {
        modelId: "llama-3.3-70b",
        modelName: "Llama 3.3 70B",
        providerModelId: "meta-llama/llama-3.3-70b-instruct",
        pricingInput: "0.12",
        pricingOutput: "0.30",
        isFree: false,
        contextLength: 131072,
        priority: 0,
      },
    ];

    for (const model of openrouterModels) {
      await db
        .insert(modelProviderMap)
        .values({
          modelId: model.modelId,
          providerId: openrouterId,
          modelName: model.modelName,
          providerModelId: model.providerModelId,
          pricingInput: model.pricingInput,
          pricingOutput: model.pricingOutput,
          isFree: model.isFree,
          contextLength: model.contextLength,
          isEnabled: true,
          priority: model.priority,
        })
        .onConflictDoNothing();
    }

    console.log(`[Seed] OpenRouter: ${openrouterModels.length} models (including paid fallbacks)`);
  } else {
    console.warn("[Seed] OpenRouter provider not found — skipping OpenRouter models");
  }

  // 5. Seed routing rules
  const rules = [
    { pattern: "*-free", mode: "cost" as const, maxFallbacks: 3 },
    { pattern: "*", mode: "cost" as const, maxFallbacks: 2 },
  ];

  for (const rule of rules) {
    await db
      .insert(routingRules)
      .values({
        modelPattern: rule.pattern,
        routingMode: rule.mode,
        providerOrder: null,
        maxFallbacks: rule.maxFallbacks,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] Routing rules seeded`);
  console.log(`[Seed] Done!`);
}

/**
 * Seed platform-scope persona templates.
 * Idempotent — ON CONFLICT DO NOTHING.
 */
export async function seedPersonaTemplates(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available — skipping persona seeds");
    return;
  }

  const personas = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "SmartSpec Default",
      description: "Helpful, concise, markdown-friendly general assistant",
      systemPromptPrefix: "You are a friendly, helpful AI assistant. Provide clear, concise, and well-formatted responses using markdown when appropriate.",
      tone: "friendly",
      language: "auto",
      scope: "platform",
      isDefault: true,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Professional Advisor",
      description: "Business-appropriate, structured responses",
      systemPromptPrefix: "You are a professional business advisor. Provide structured, formal responses with clear recommendations. Use bullet points and headers for organization.",
      tone: "formal",
      language: "auto",
      scope: "platform",
      isDefault: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Creative Partner",
      description: "Imaginative, expressive, explorative",
      systemPromptPrefix: "You are a creative partner. Think outside the box, offer imaginative suggestions, and explore unconventional ideas. Be expressive and inspiring.",
      tone: "creative",
      language: "auto",
      scope: "platform",
      isDefault: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      name: "Technical Expert",
      description: "Precise, code-heavy, documentation-oriented",
      systemPromptPrefix: "You are a technical expert. Provide precise, detailed answers with code examples when relevant. Include references to documentation and best practices.",
      tone: "technical",
      language: "auto",
      scope: "platform",
      isDefault: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      name: "Thai Assistant",
      description: "Always responds in Thai regardless of input language",
      systemPromptPrefix: "คุณเป็นผู้ช่วย AI ที่เป็นมิตร กรุณาตอบเป็นภาษาไทยเสมอ ไม่ว่าผู้ใช้จะพิมพ์ภาษาใด ให้คำตอบที่ชัดเจนและเข้าใจง่าย",
      tone: "friendly",
      language: "th",
      scope: "platform",
      isDefault: false,
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      name: "Concise Bot",
      description: "Ultra-short answers, minimal formatting",
      systemPromptPrefix: "Be extremely concise. Answer in the fewest words possible. No unnecessary formatting, headers, or bullet points unless specifically requested.",
      tone: "casual",
      language: "auto",
      scope: "platform",
      isDefault: false,
    },
  ];

  for (const persona of personas) {
    await db
      .insert(personaTemplates)
      .values({
        id: persona.id,
        tenantId: null,
        userId: null,
        name: persona.name,
        description: persona.description,
        assistantNickname: null,
        assistantGender: "neutral",
        systemPromptPrefix: persona.systemPromptPrefix,
        tone: persona.tone,
        language: persona.language,
        responseStyle: {},
        restrictions: [],
        scope: persona.scope,
        isDefault: persona.isDefault,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] ${personas.length} platform persona templates seeded`);
}

/**
 * Seed system team templates for the Virtual AI Office Orchestrator.
 * These are platform-wide templates (tenantId=null, isSystem=true).
 */
export async function seedAssistantTeamTemplates(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  const templates = [
    {
      id: "tmpl-team-research-analysis",
      name: "Research & Analysis Team",
      description: "A team focused on research, data analysis, and report writing. Ideal for market research, competitive analysis, and technical investigations.",
      category: "research",
      teamConfigJson: {
        defaultDiscussionMode: "round-robin",
        maxTurnsPerRun: 20,
        defaultStopPolicy: "lead_satisfied",
      },
      memberTemplateJson: [
        { role: "Lead Researcher", isLead: true, specialty: ["research", "strategy"], modelPolicy: "quality_optimized" },
        { role: "Data Analyst", isLead: false, specialty: ["data", "statistics", "visualization"], modelPolicy: "auto" },
        { role: "Report Writer", isLead: false, specialty: ["writing", "editing", "formatting"], modelPolicy: "auto" },
      ],
      defaultDiscussionMode: "round-robin",
    },
    {
      id: "tmpl-team-content-creation",
      name: "Content Creation Team",
      description: "A creative team for content strategy, writing, and editing. Perfect for blog posts, marketing copy, and social media content.",
      category: "content",
      teamConfigJson: {
        defaultDiscussionMode: "lead-directed",
        maxTurnsPerRun: 15,
        defaultStopPolicy: "lead_satisfied",
      },
      memberTemplateJson: [
        { role: "Content Strategist", isLead: true, specialty: ["strategy", "seo", "planning"], modelPolicy: "quality_optimized" },
        { role: "Writer", isLead: false, specialty: ["writing", "storytelling", "tone"], modelPolicy: "auto" },
        { role: "Editor", isLead: false, specialty: ["editing", "grammar", "fact-checking"], modelPolicy: "auto" },
      ],
      defaultDiscussionMode: "lead-directed",
    },
    {
      id: "tmpl-team-code-review",
      name: "Code Review Team",
      description: "A technical team for architecture review, security audit, and code quality assessment. Best for pull request reviews and technical debt analysis.",
      category: "engineering",
      teamConfigJson: {
        defaultDiscussionMode: "round-robin",
        maxTurnsPerRun: 25,
        defaultStopPolicy: "consensus",
      },
      memberTemplateJson: [
        { role: "Lead Architect", isLead: true, specialty: ["architecture", "design-patterns", "scalability"], modelPolicy: "quality_optimized" },
        { role: "Security Reviewer", isLead: false, specialty: ["security", "vulnerabilities", "owasp"], modelPolicy: "quality_optimized" },
        { role: "Quality Reviewer", isLead: false, specialty: ["testing", "code-quality", "best-practices"], modelPolicy: "auto" },
      ],
      defaultDiscussionMode: "round-robin",
    },
  ];

  for (const tmpl of templates) {
    await db
      .insert(assistantTeamTemplates)
      .values({
        id: tmpl.id,
        tenantId: null,
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        teamConfigJson: tmpl.teamConfigJson,
        memberTemplateJson: tmpl.memberTemplateJson,
        defaultDiscussionMode: tmpl.defaultDiscussionMode,
        isSystem: true,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] ${templates.length} system team templates seeded`);
}
