import { Router } from "express";
import path from "path";
import { readFile } from "fs/promises";
import { z } from "zod";
import { requireScopes } from "../middleware/requireScopes";
import { sendApiError } from "../middleware/publicApiHeaders";
import {
  getAvailableSkillsAsync,
  getSkillByIdAsync,
} from "../services/skillRegistry";
import { executeSkill } from "../services/skillExecutor";
import { detectSkill } from "../services/skillDetector";
import {
  hasEnoughCredits,
  deductCredits,
  getCreditBalance,
} from "../services/creditService";
import { incrementDailyCredits } from "../services/apiKeyRateLimiter";
import { createInternalTokenFromAuth } from "../_core/tokens";

// ---------------------------------------------------------------------------
// Input schema cache
// ---------------------------------------------------------------------------

const schemaCache = new Map<string, Record<string, unknown>>();

async function loadInputSchema(
  skillFilePath?: string,
): Promise<Record<string, unknown>> {
  if (!skillFilePath) return { type: "object", properties: {} };

  const cacheKey = skillFilePath;
  if (schemaCache.has(cacheKey)) return schemaCache.get(cacheKey)!;

  try {
    const skillDir = path.dirname(skillFilePath);
    const schemaPath = path.join(skillDir, "schemas", "input.schema.json");
    const raw = await readFile(schemaPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    schemaCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    const empty = { type: "object", properties: {} };
    schemaCache.set(cacheKey, empty);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Execute request schema
// ---------------------------------------------------------------------------

const ExecuteBodySchema = z.object({
  inputs: z.record(z.unknown()).default({}),
  model: z.string().optional(),
  stream: z.boolean().default(false),
});

const DetectBodySchema = z.object({
  prompt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createPublicSkillsRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // GET /v1/skills
  // -------------------------------------------------------------------------
  router.get("/", requireScopes("skills:list"), async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const tags = req.query.tags as string | undefined;
      const search = req.query.search as string | undefined;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.min(
        100,
        Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
      );

      let skills = await getAvailableSkillsAsync();

      // Filter by category
      if (category) {
        skills = skills.filter(
          (s) => s.category === category || s.type === category,
        );
      }

      // Filter by tags
      if (tags) {
        const tagList = tags.split(",").map((t) => t.trim().toLowerCase());
        skills = skills.filter((s) =>
          tagList.some((tag) =>
            (s.tags ?? []).map((t) => t.toLowerCase()).includes(tag),
          ),
        );
      }

      // Filter by search (name + description)
      if (search) {
        const lower = search.toLowerCase();
        skills = skills.filter(
          (s) =>
            s.name.toLowerCase().includes(lower) ||
            (s.description ?? "").toLowerCase().includes(lower),
        );
      }

      const total = skills.length;
      const paginated = skills.slice((page - 1) * limit, page * limit);

      const skillsWithSchema = await Promise.all(
        paginated.map(async (s) => {
          const inputSchema = await loadInputSchema(s.skillFilePath);
          return {
            id: s.id,
            name: s.name,
            category: s.category ?? s.type,
            description: s.description ?? "",
            tags: s.tags ?? [],
            icon: s.icon ?? "",
            inputSchema,
          };
        }),
      );

      res.json({
        skills: skillsWithSchema,
        pagination: { page, limit, total },
      });
    } catch (err) {
      console.error("[PublicSkillsApi] GET /v1/skills error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/skills/detect   — must be before /:skillId to avoid route conflict
  // -------------------------------------------------------------------------
  router.post("/detect", requireScopes("skills:execute"), async (req, res) => {
    try {
      const parsed = DetectBodySchema.safeParse(req.body);
      if (!parsed.success) {
        sendApiError(
          res,
          400,
          "invalid_request",
          parsed.error.issues.map((i) => i.message).join("; "),
        );
        return;
      }

      const result = await detectSkill(parsed.data.prompt);

      if (result.detected && result.skill) {
        res.json({
          skill: {
            id: result.skill.id,
            name: result.skill.name,
            confidence: result.confidence ?? 1.0,
          },
          suggested_inputs: result.suggestedPrompt
            ? { prompt: result.suggestedPrompt }
            : { prompt: parsed.data.prompt },
        });
      } else {
        res.json({ skill: null, suggested_inputs: null });
      }
    } catch (err) {
      console.error("[PublicSkillsApi] POST /v1/skills/detect error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/skills/:skillId
  // -------------------------------------------------------------------------
  router.get("/:skillId", requireScopes("skills:list"), async (req, res) => {
    try {
      const skill = await getSkillByIdAsync(req.params.skillId);
      if (!skill) {
        sendApiError(res, 404, "not_found", "Skill not found");
        return;
      }

      const inputSchema = await loadInputSchema(skill.skillFilePath);

      res.json({
        id: skill.id,
        name: skill.name,
        category: skill.category ?? skill.type,
        description: skill.description ?? "",
        tags: skill.tags ?? [],
        icon: skill.icon ?? "",
        inputSchema,
        executionMode: skill.executionMode ?? "llm-only",
        creditMultiplier: skill.creditMultiplier ?? 1.0,
        defaultModel: skill.defaultModel ?? null,
      });
    } catch (err) {
      console.error("[PublicSkillsApi] GET /v1/skills/:skillId error", err);
      sendApiError(res, 500, "internal_error", "Internal server error");
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/skills/:skillId/execute
  // -------------------------------------------------------------------------
  router.post(
    "/:skillId/execute",
    requireScopes("skills:execute"),
    async (req, res) => {
      try {
        const skill = await getSkillByIdAsync(req.params.skillId);
        if (!skill) {
          sendApiError(res, 404, "not_found", "Skill not found");
          return;
        }

        const parsed = ExecuteBodySchema.safeParse(req.body);
        if (!parsed.success) {
          sendApiError(
            res,
            400,
            "invalid_request",
            parsed.error.issues.map((i) => i.message).join("; "),
          );
          return;
        }

        const { inputs, model, stream } = parsed.data;
        const auth = req.auth!;
        const userId = (auth as any).userId as number;
        const tenantId = (auth as any).tenantId as string;

        // Credit pre-check and upfront deduction
        const estimatedCost = Math.ceil((skill.creditMultiplier ?? 1) * 2);
        const sufficient = await hasEnoughCredits(userId, estimatedCost);
        if (!sufficient) {
          sendApiError(
            res,
            402,
            "insufficient_credits",
            "Your account has insufficient credits for this request",
          );
          return;
        }

        // Deduct credits BEFORE execution so the user cannot get output for free
        // if deductCredits fails. If execution subsequently fails, credits are NOT
        // refunded — this is intentional (the service cost was incurred).
        await deductCredits({
          userId,
          amount: estimatedCost,
          sourceType: "api_skill",
          description: `Skill execution: ${skill.id}`,
        } as any);
        incrementDailyCredits((auth as any).apiKeyId, estimatedCost).catch(() => {});

        // Build execution params
        const prompt =
          typeof inputs.prompt === "string" ? inputs.prompt : "";
        const { prompt: _p, ...rest } = inputs as Record<string, unknown>;
        const execParams = {
          prompt,
          model: model ?? skill.defaultModel,
          extraParams: rest,
        };

        // Execute
        const result = await executeSkill(
          skill,
          execParams as any,
          userId,
          createInternalTokenFromAuth({ userId }),
          tenantId,
        );

        const creditsUsed = estimatedCost;

        // Get remaining balance
        let remaining = 0;
        try {
          const bal = await getCreditBalance(userId);
          remaining = bal?.credits ?? 0;
        } catch {
          // Non-fatal
        }

        res.setHeader("X-Credits-Used", String(creditsUsed));
        res.setHeader("X-Credits-Remaining", String(remaining));

        if (stream) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");

          res.write(
            `data: ${JSON.stringify({ type: "result", data: result })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.json({
            result,
            credits_used: creditsUsed,
          });
        }
      } catch (err) {
        console.error(
          "[PublicSkillsApi] POST /v1/skills/:skillId/execute error",
          err,
        );
        if (!res.headersSent) {
          sendApiError(res, 500, "internal_error", "Internal server error");
        }
      }
    },
  );

  return router;
}
