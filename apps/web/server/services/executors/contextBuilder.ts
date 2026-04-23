import {
  buildPersonaPromptSegments,
  getPersonaById,
} from "../personaService";
import { retrieveForPrompt } from "../scopedMemoryService";
import { getEntityMemories } from "../chatService";
import {
  composePrompt,
  type ComposePromptInput,
  type PromptMessage,
} from "../promptComposer";
import {
  buildWebSearchParams,
  detectProviderFamily,
} from "../webSearchToolInjector";
import { getProviderForModel } from "../llmRouter";
import {
  buildSystemPrompt,
  buildUserPrompt,
} from "../promptEnhancementService";
import type { UnifiedExecutionRequest, Attachment } from "./types";

// ─── Token Budget Constants (matching "balanced" profile from promptComposer) ──

export const CHAT_PERSONA_BUDGET = 1200;
export const CHAT_SCOPED_MEMORY_BUDGET = 3000;
export const CHAT_ENTITY_MEMORY_BUDGET = 1500;
export const CHAT_TOTAL_CONTEXT_BUDGET = 6000;

const KNOWLEDGEBASE_MAX_CHARS = 8000;

// Known prompt-enhancement skill slugs
const ENHANCEMENT_SLUGS = new Set([
  "image_prompt_engineer",
  "image-prompt-engineer",
  "create-image-prompt",
]);

// ─── buildChatContext ──────────────────────────────────────

export async function buildChatContext(
  request: UnifiedExecutionRequest,
  skillSystemPrompt: string,
  knowledgebase: string | null,
): Promise<Array<{ role: string; content: string | unknown[] }>> {
  const messages: Array<{ role: string; content: string | unknown[] }> = [];

  // 1. Persona enrichment (if active)
  const personaId = request.conversationContext?.activePersonaId;
  if (personaId) {
    try {
      const persona = await getPersonaById(personaId);
      if (persona) {
        const segments = buildPersonaPromptSegments(persona);

        // Build persona system message
        const parts: string[] = [segments.prefix];

        if (segments.styleInstructions) {
          parts.push(segments.styleInstructions);
        }
        if (segments.restrictionsBulletPoints) {
          parts.push(segments.restrictionsBulletPoints);
        }

        // Scoped memory — personaId is the assistantId in chat context
        const scopedMemories = await retrieveForPrompt(
          request.tenantId,
          personaId, // assistantId = personaId in chat channel
          null,
          null,
          null,
          request.userMessage,
          CHAT_SCOPED_MEMORY_BUDGET,
        );
        if (scopedMemories.length > 0) {
          const memContent = scopedMemories
            .map((m) => m.memory.content)
            .join("\n");
          parts.push(`[SCOPED MEMORY]\n${memContent}`);
        }

        // Entity memory
        const entityMemories = await getEntityMemories(
          request.userId,
          undefined,
          personaId,
        );
        if (entityMemories.length > 0) {
          // Cap entity memory to budget (~10 chars per token estimate)
          const maxEntries = Math.ceil(CHAT_ENTITY_MEMORY_BUDGET / 150);
          const capped = entityMemories.slice(0, maxEntries);
          const entityContent = capped
            .map((m) => `${m.entityName}: ${(m.facts || []).join(", ")}`)
            .join("\n");
          parts.push(`[ENTITY MEMORY]\n${entityContent}`);
        }

        messages.push({ role: "system", content: parts.join("\n\n") });
      }
    } catch (err) {
      // Non-blocking: fall through to un-enriched context
      console.warn("[contextBuilder] persona enrichment failed:", err);
    }
  }

  // 2. Skill system prompt + knowledgebase
  let skillPrompt = skillSystemPrompt;
  if (knowledgebase) {
    const trimmedKb = knowledgebase.substring(0, KNOWLEDGEBASE_MAX_CHARS);
    skillPrompt += `\n\n[DOMAIN KNOWLEDGE]\n${trimmedKb}`;
  }
  messages.push({ role: "system", content: skillPrompt });

  // 3. User message (potentially multimodal)
  const userContent = buildUserMessage(request);
  messages.push({ role: "user", content: userContent });

  return messages;
}

// ─── buildTeamContext ──────────────────────────────────────

export async function buildTeamContext(
  request: UnifiedExecutionRequest,
  tenantId: string,
): Promise<PromptMessage[]> {
  if (!request.teamContext) {
    throw new Error("[contextBuilder] buildTeamContext called without teamContext");
  }
  const tc = request.teamContext;
  const input: ComposePromptInput = {
    assistantId: tc.assistantId,
    runId: tc.runId,
    roomId: tc.roomId,
    teamId: tc.teamId,
    objective: tc.objective,
    tenantId,
    initiatedByUserId: tc.initiatedByUserId ?? request.userId,
    currentMessage: tc.currentMessage ?? request.userMessage,
    memoryMode: tc.memoryMode,
  };
  const result = await composePrompt(input);
  return result.messages;
}

// ─── buildDynamicModelRequirements ──────────────────────────

export function buildDynamicModelRequirements(
  skill: {
    executionPolicy: Record<string, any> | string | null;
    category?: string;
    type?: string;
  },
  hasImages: boolean,
  routeReason: string | undefined,
): { requirements: Record<string, unknown>; hasOverrides: boolean } {
  // Parse execution policy
  let parsedPolicy: Record<string, any> | null = null;
  if (typeof skill.executionPolicy === "string") {
    try {
      parsedPolicy = JSON.parse(skill.executionPolicy);
    } catch {
      parsedPolicy = {};
    }
  } else if (
    typeof skill.executionPolicy === "object" &&
    skill.executionPolicy
  ) {
    parsedPolicy = skill.executionPolicy;
  }

  const baseReqs = parsedPolicy?.requirements || {};
  const dynamicReqs: Record<string, unknown> = { ...baseReqs };
  let hasOverrides = false;

  // Vision requirement for image attachments
  if (hasImages) {
    dynamicReqs.supportsVision = true;
    hasOverrides = true;
  }

  // Web search requirement
  if (
    parsedPolicy?.requires_web_search ||
    parsedPolicy?.requires_citations
  ) {
    dynamicReqs.supportsWebSearch = true;
    hasOverrides = true;
  }

  // Thinking requirement
  if (
    parsedPolicy?.requires_thinking ||
    parsedPolicy?.thinking_level_hint === "high" ||
    parsedPolicy?.thinking_level_hint === "medium"
  ) {
    dynamicReqs.supportsThinking = true;
    hasOverrides = true;
  }

  // Review / complex skill requirements
  const isReviewSkill =
    (skill.category || "").includes("review") ||
    (skill.type || "").includes("review");
  const isComplexTask =
    isReviewSkill || parsedPolicy?.thinking_level_hint === "high";
  if (isComplexTask) {
    dynamicReqs.supportsWebSearch = true;
    dynamicReqs.supportsThinking = true;
    if (
      !dynamicReqs.contextLength ||
      (dynamicReqs.contextLength as number) < 500_000
    ) {
      dynamicReqs.contextLength = 500_000;
    }
    hasOverrides = true;
  }

  // Route reason web search trigger
  if (routeReason?.includes("web_search")) {
    dynamicReqs.supportsWebSearch = true;
    hasOverrides = true;
  }

  return { requirements: dynamicReqs, hasOverrides };
}

// ─── buildPromptEnhancementContext ──────────────────────────

export async function buildPromptEnhancementContext(
  skillSlug: string,
  dynamicParams: Record<string, unknown>,
  userMessage: string,
): Promise<{ systemPrompt: string; userPrompt: string } | null> {
  if (!ENHANCEMENT_SLUGS.has(skillSlug)) {
    return null;
  }

  try {
    const enhancementRequest = {
      skillId: skillSlug,
      userInput: userMessage,
      referenceImages: Array.isArray(dynamicParams.reference_images)
        ? (dynamicParams.reference_images as string[])
        : undefined,
      styleCategory: dynamicParams.styleCategory as string | undefined,
      styleName: dynamicParams.styleName as string | undefined,
    };

    const systemPrompt = buildSystemPrompt(enhancementRequest);
    const userPrompt = buildUserPrompt(enhancementRequest);

    return { systemPrompt, userPrompt };
  } catch (err) {
    console.warn("[contextBuilder] prompt enhancement failed:", err);
    return null;
  }
}

// ─── injectWebSearchIfNeeded ──────────────────────────────

export async function injectWebSearchIfNeeded(options: {
  skillPolicy: Record<string, any> | null;
  routeReason: string | undefined;
  modelId: string | null;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
}): Promise<{
  extraBodyParams: Record<string, unknown>;
  systemPromptSuffix?: string;
} | null> {
  const { skillPolicy, routeReason, modelId } = options;

  // Determine if web search is needed
  const needsWebSearch =
    skillPolicy?.requires_web_search ||
    skillPolicy?.requirements?.supportsWebSearch ||
    routeReason?.includes("web_search");

  if (!needsWebSearch) {
    return null;
  }

  if (!modelId) {
    return null;
  }

  try {
    const provider = await getProviderForModel(modelId, {
      preferredProviderId: options.preferredProviderId,
      strictProviderPin: options.strictProviderPin,
    });

    if (!provider) {
      return null;
    }

    const family = detectProviderFamily(provider.providerName);
    const params = buildWebSearchParams(family);

    return {
      extraBodyParams: params.bodyParams,
      systemPromptSuffix: params.systemPromptSuffix,
    };
  } catch (err) {
    console.warn("[contextBuilder] web search injection failed:", err);
    return null;
  }
}

// ─── Internal Helpers ──────────────────────────────────────

/** Keys from dynamicParams that should not be included in LLM prompts. */
const EXCLUDED_PARAM_KEYS = new Set([
  "reference_images",
  "userToken",
  "__serverUserToken",
  "apiConfig",
  "extraParams",
  "publicUrl",
]);

function buildUserMessage(
  request: UnifiedExecutionRequest,
): string | unknown[] {
  let userText = request.userMessage;

  // U05: Append dynamic params inside an XML fence to prevent prompt injection
  if (request.dynamicParams) {
    const paramSummary = Object.entries(request.dynamicParams)
      .filter(
        ([k, v]) =>
          v !== undefined &&
          v !== null &&
          v !== "" &&
          !EXCLUDED_PARAM_KEYS.has(k),
      )
      .map(([k, v]) => {
        const raw = typeof v === "object" ? JSON.stringify(v) : String(v);
        // Escape XML special chars to prevent fence-breaking injection
        const safe = raw
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `- ${k}: ${safe}`;
      })
      .join("\n");
    if (paramSummary) {
      userText += `\n\n<form_inputs>\n${paramSummary}\n</form_inputs>`;
    }
  }

  // Collect image URLs from attachments and dynamicParams
  const imageUrls = collectImageUrls(request);

  if (imageUrls.length === 0) {
    return userText;
  }

  // Build multimodal content array
  const baseUrl = (request.conversationContext?.publicUrl || "").replace(
    /\/+$/,
    "",
  );
  const contentParts: unknown[] = [{ type: "text", text: userText }];

  for (const imgUrl of imageUrls) {
    const absoluteUrl =
      imgUrl.startsWith("http") || /^data:image\//i.test(imgUrl)
        ? imgUrl
        : `${baseUrl}${imgUrl}`;
    contentParts.push({
      type: "image_url",
      image_url: { url: absoluteUrl },
    });
  }

  return contentParts;
}

/** U10: Reject URLs pointing to internal/metadata endpoints (SSRF prevention). */
function isSafeImageUrl(url: string): boolean {
  // Allow data: URIs (base64 images) and relative paths
  if (/^data:image\//i.test(url) || !url.startsWith("http")) return true;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      console.warn(`[contextBuilder] Blocked internal URL in image: ${hostname}`);
      return false;
    }
    // Block non-http(s) schemes
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function collectImageUrls(request: UnifiedExecutionRequest): string[] {
  const urls: string[] = [];

  // From attachments
  if (request.attachments) {
    for (const att of request.attachments) {
      if (att.type === "image" && att.url && isSafeImageUrl(att.url)) {
        urls.push(att.url);
      }
    }
  }

  // From dynamicParams.reference_images
  if (Array.isArray(request.dynamicParams?.reference_images)) {
    for (const img of request.dynamicParams!.reference_images as unknown[]) {
      if (typeof img === "string" && img.length > 0 && isSafeImageUrl(img)) {
        urls.push(img);
      }
    }
  }

  return urls;
}
