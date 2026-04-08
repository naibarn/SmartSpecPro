import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { sdk } from "../_core/sdk";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { getDb } from "../db";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { agencyBridge } from "../services/agencyBridge";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { generateComposerCaption } from "../services/contentComposerPublishService";
import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
import { getSkillByIdAsync } from "../services/skillRegistry";
import { agencies, agencyConversations } from "../../drizzle/schema";

const streamInputSchema = z.object({
  topic: z.string().trim().min(1).max(2000),
  executionSource: z.enum(["skill", "agency"]).default("skill"),
  skillId: z.string().trim().max(255).optional().nullable(),
  agencyId: z.string().trim().max(255).optional().nullable(),
  agencyName: z.string().trim().max(255).optional().nullable(),
  requiresWebSearch: z.boolean().default(false),
  requiresThinking: z.boolean().default(false),
  articleBody: z.string().optional().nullable(),
  socialPlatform: z.enum(["youtube", "facebook", "tiktok", "upload_post"]).optional().nullable(),
  attachmentCount: z.number().int().min(0).max(6).default(0),
});

const CAPTION_MARKER = "[[CAPTION]]";
const ARTICLE_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ["article", "section", "h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "blockquote", "pre", "code", "a", "b", "i", "em", "strong", "br", "img", "figure", "figcaption"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    "*": ["class", "id"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  disallowedTagsMode: "discard",
};

function sendEvent(res: Response, event: string, data: Record<string, unknown>): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^\s*```(?:html)?\s*([\s\S]*?)\s*```\s*$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, ARTICLE_SANITIZE);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHtmlLike(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function normalizeArticleHtml(rawText: string, topic: string): string {
  const stripped = stripCodeFences(rawText).trim();
  if (!stripped) {
    return `<article><h1>${escapeHtml(topic || "Untitled article")}</h1><p></p></article>`;
  }

  if (isHtmlLike(stripped)) {
    const sanitized = sanitizeArticleHtml(stripped);
    return sanitized.includes("<article") ? sanitized : `<article>${sanitized}</article>`;
  }

  const paragraphs = stripped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`);

  return `<article><h1>${escapeHtml(topic || "Untitled article")}</h1>${paragraphs.join("")}</article>`;
}

function buildComposerPrompt(params: {
  topic: string;
  executionSource: "skill" | "agency";
  sourceLabel: string;
  requiresWebSearch: boolean;
  requiresThinking: boolean;
  articleBody: string;
  attachmentCount: number;
}): string {
  return [
    `Topic: ${params.topic}`,
    `Execution source: ${params.executionSource}`,
    `Selected source: ${params.sourceLabel}`,
    `Requires web search: ${params.requiresWebSearch ? "yes" : "no"}`,
    `Requires thinking: ${params.requiresThinking ? "yes" : "no"}`,
    `Attached media count: ${params.attachmentCount}`,
    params.articleBody.trim() ? `Existing draft body:\n${params.articleBody.trim()}` : "",
    "Write a publication-ready HTML article only.",
    "Use semantic article, section, h1, h2, p, ul, li, figure, figcaption, strong, em, and br tags.",
    "Do not wrap the response in markdown fences.",
    `After the article, include the marker ${CAPTION_MARKER} on its own line, then write a concise social caption on the next line.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || event;
    } else if (line.startsWith("data:")) {
      dataParts.push(line.slice("data:".length).trim());
    }
  }

  if (dataParts.length === 0) {
    return null;
  }

  return {
    event,
    data: dataParts.join("\n"),
  };
}

async function getInternalNodeBaseUrl(): Promise<string> {
  const runtime = await getAppRuntimeConfig();
  return runtime.smartspecInternalUrl || runtime.internalNodeUrl;
}

export const contentComposerStreamRouter = Router();

contentComposerStreamRouter.post("/api/content-composer/generate-stream", async (req: Request, res: Response) => {
  const user = await sdk.authenticateRequest(req).catch(() => null);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tenant = (req as { tenant?: { id: string } }).tenant;
  if (!tenant?.id) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  const enabled = await getTenantFeatureFlag("CONTENT_COMPOSER_ENABLED", tenant.id);
  if (!enabled) {
    return res.status(403).json({ error: "Content Composer is disabled for this tenant" });
  }

  const parsed = streamInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const prompt = buildComposerPrompt({
    topic: parsed.data.topic,
    executionSource: parsed.data.executionSource,
    sourceLabel: parsed.data.executionSource === "agency"
      ? (parsed.data.agencyName?.trim() || parsed.data.agencyId?.trim() || "Agency")
      : (parsed.data.skillId?.trim() || "Skill"),
    requiresWebSearch: parsed.data.requiresWebSearch,
    requiresThinking: parsed.data.requiresThinking,
    articleBody: parsed.data.articleBody ?? "",
    attachmentCount: parsed.data.attachmentCount,
  });

  sendEvent(res, "start", {
    topic: parsed.data.topic,
    executionSource: parsed.data.executionSource,
  });

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let rawOutput = "";
  let captionBuffer = "";
  let markerSeen = false;

  const flushDelta = (delta: string) => {
    if (!delta) return;
    const previousLength = rawOutput.length;
    const nextOutput = rawOutput + delta;
    const markerIndex = nextOutput.indexOf(CAPTION_MARKER);

    if (markerIndex >= 0) {
      const articleEnd = Math.max(previousLength, markerIndex);
      const newArticle = nextOutput.slice(previousLength, articleEnd);
      if (newArticle) {
        sendEvent(res, "article_chunk", { delta: newArticle });
      }
      rawOutput = nextOutput;
      markerSeen = true;
      const captionStart = markerIndex + CAPTION_MARKER.length;
      captionBuffer += nextOutput.slice(captionStart);
      return;
    }

    if (!markerSeen) {
      const newArticle = nextOutput.slice(previousLength);
      if (newArticle) {
        sendEvent(res, "article_chunk", { delta: newArticle });
      }
    } else {
      captionBuffer += delta;
    }

    rawOutput = nextOutput;
  };

  try {
    if (parsed.data.executionSource === "agency") {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const agencyId = parsed.data.agencyId?.trim();
      if (!agencyId) {
        sendEvent(res, "error", { message: "Agency must be selected" });
        sendEvent(res, "done", { success: false });
        return res.end();
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
          tenantId: agencies.tenantId,
          isPublished: agencies.isPublished,
        })
        .from(agencies)
        .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenant.id)))
        .limit(1);

      if (!agency) {
        sendEvent(res, "error", { message: "Agency not found" });
        sendEvent(res, "done", { success: false });
        return res.end();
      }

      const isRunnable =
        agency.status === "published" ||
        agency.visibility === "template" ||
        agency.createdBy === user.id;

      if (!isRunnable || agency.status === "archived") {
        sendEvent(res, "error", { message: "Agency is not ready to run yet" });
        sendEvent(res, "done", { success: false });
        return res.end();
      }

      const conversationId = crypto.randomUUID();
      await db.insert(agencyConversations).values({
        id: conversationId,
        agencyId: agency.id,
        tenantId: tenant.id,
        userId: user.id,
        title: `Content Composer: ${parsed.data.topic.slice(0, 120) || "Article"}`,
        source: "web",
      });

      const userToken = createInternalTokenFromAuth({ userId: user.id }, ["agency:run"]);
      const result = await agencyBridge.executeRun({
        agencyId: agency.id,
        conversationId,
        message: prompt,
        userToken,
        tenantId: tenant.id,
        userId: user.id,
        additionalInstructions: [
          `Selected agency: ${agency.name}`,
          agency.systemPrompt?.trim() ? `Agency system prompt:\n${agency.systemPrompt.trim()}` : "",
        ].filter(Boolean).join("\n\n"),
      });

      const articleHtml = normalizeArticleHtml(result.response || "", parsed.data.topic);
      sendEvent(res, "article_chunk", { delta: articleHtml });
      sendEvent(res, "article", { html: articleHtml });
      const caption = (await generateComposerCaption({
        topic: parsed.data.topic,
        articleBody: articleHtml,
        socialPlatform: parsed.data.socialPlatform ?? null,
        attachmentCount: parsed.data.attachmentCount,
        requiresWebSearch: parsed.data.requiresWebSearch,
        requiresThinking: parsed.data.requiresThinking,
      })).caption;
      sendEvent(res, "caption", { caption });
      sendEvent(res, "done", { success: true });
      return res.end();
    }

    const skillId = parsed.data.skillId?.trim();
    if (!skillId) {
      sendEvent(res, "error", { message: "Skill must be selected" });
      sendEvent(res, "done", { success: false });
      return res.end();
    }

    const skill = await getSkillByIdAsync(skillId);
    if (!skill) {
      sendEvent(res, "error", { message: "Skill not found" });
      sendEvent(res, "done", { success: false });
      return res.end();
    }

    const model = await resolveEnabledLlmModelId();
    if (!model) {
      sendEvent(res, "error", { message: "No enabled LLM model configured" });
      sendEvent(res, "done", { success: false });
      return res.end();
    }

    const requestUrl = new URL("/api/llm/stream", await getInternalNodeBaseUrl());
    const requestBody = {
      model,
      stream: true,
      messages: [
        {
          role: "system",
          content: [
            skill.systemPrompt?.trim() || "You are a senior content editor for the Media Studio composer.",
            "Write a complete, publication-ready HTML article only.",
            "Use semantic tags like article, section, h1, h2, p, ul, li, figure, figcaption, and strong.",
            "Do not use markdown fences.",
            `After the article, include the marker ${CAPTION_MARKER} on its own line, then write a concise social caption on the next line.`,
            "The caption should be a single short paragraph and may include one or two hashtags.",
          ].join("\n"),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    };

    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const upstream = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.cookie ? { cookie: String(req.headers.cookie) } : {}),
        ...(req.headers.authorization ? { authorization: String(req.headers.authorization) } : {}),
        ...(req.headers["x-tenant-id"] ? { "x-tenant-id": String(req.headers["x-tenant-id"]) } : {}),
        ...(req.headers["x-request-id"] ? { "x-request-id": String(req.headers["x-request-id"]) } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const errorText = await upstream.text().catch(() => "LLM stream failed");
      sendEvent(res, "error", { message: errorText || `LLM stream failed with status ${upstream.status}` });
      sendEvent(res, "done", { success: false });
      return res.end();
    }

    reader = upstream.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary < 0) break;
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsedBlock = parseSseBlock(block);
        if (!parsedBlock) continue;
        if (parsedBlock.data === "[DONE]") {
          continue;
        }

        try {
          const eventPayload = JSON.parse(parsedBlock.data) as Record<string, unknown>;
          const delta = eventPayload?.choices && Array.isArray(eventPayload.choices)
            ? (eventPayload.choices[0] as { delta?: { content?: unknown } } | undefined)?.delta?.content
            : null;
          if (typeof delta === "string" && delta.length > 0) {
            flushDelta(delta);
          }
        } catch {
          // Non-JSON SSE payloads are ignored; the route only needs delta text.
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM stream failed";
    sendEvent(res, "error", { message });
    sendEvent(res, "done", { success: false });
    return res.end();
  } finally {
    try {
      reader?.releaseLock();
    } catch {
      // no-op
    }
  }

  try {
    const markerIndex = rawOutput.indexOf(CAPTION_MARKER);
    const articleHtml = normalizeArticleHtml(
      markerIndex >= 0 ? rawOutput.slice(0, markerIndex) : rawOutput,
      parsed.data.topic,
    );

    if (articleHtml) {
      sendEvent(res, "article", { html: articleHtml });
    }

    const captionText = captionBuffer.trim();
    const caption = captionText || (await generateComposerCaption({
      topic: parsed.data.topic,
      articleBody: articleHtml,
      socialPlatform: parsed.data.socialPlatform ?? null,
      attachmentCount: parsed.data.attachmentCount,
      requiresWebSearch: parsed.data.requiresWebSearch,
      requiresThinking: parsed.data.requiresThinking,
    })).caption;
    sendEvent(res, "caption", { caption });
    sendEvent(res, "done", { success: true });
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM stream failed";
    sendEvent(res, "error", { message });
    sendEvent(res, "done", { success: false });
    res.end();
  }
});

export default contentComposerStreamRouter;
