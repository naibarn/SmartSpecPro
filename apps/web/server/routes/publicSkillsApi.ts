import { Router } from "express";
import { randomUUID } from "crypto";
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
  getCreditBalance,
} from "../services/creditService";
import { normalizeSkillRevenuePricing } from "../services/skillRevenueBilling";
import { incrementDailyCredits } from "../services/apiKeyRateLimiter";
import { createInternalTokenFromAuth } from "../_core/tokens";
import {
  assertDelegatedWorkerGrant,
  WorkerDelegationError,
} from "../services/workerDelegationService";
import {
  DelegatedWorkerPlatformError,
  runWithDelegatedWorkerExecution,
} from "../services/delegatedWorkerPlatformService";

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
        pagination: { page, limit, total, has_more: (page - 1) * limit + skillsWithSchema.length < total },
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
        await assertDelegatedWorkerGrant(req.auth, {
          grantType: "skill",
          resourceId: req.params.skillId,
        });

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

        // Public API uses the same fixed price as every other skill entry point.
        // The charge is committed only after execution succeeds; media/python
        // paths settle internally and the same run id makes this idempotent.
        const estimatedCost = normalizeSkillRevenuePricing(skill).totalCredits;
        const skillRunId = req.get("Idempotency-Key") || randomUUID();
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
        const result = await runWithDelegatedWorkerExecution({
          auth,
          actionClass: "compute",
          estimatedCredits: estimatedCost,
          idempotencyKey: skillRunId,
        }, async () => {
          const prompt =
            typeof inputs.prompt === "string" ? inputs.prompt : "";
          const { prompt: _p, ...rest } = inputs as Record<string, unknown>;
          const execParams = {
            prompt,
            model: model ?? skill.defaultModel,
            extraParams: rest,
            runId: skillRunId,
          };
          const execution = await executeSkill(
            skill,
            execParams as any,
            userId,
            createInternalTokenFromAuth({ userId, tenantId }),
            tenantId,
          );
          if (!execution.success) return execution;
          incrementDailyCredits((auth as any).apiKeyId, execution.creditsUsed ?? estimatedCost).catch(() => {});
          return execution;
        });

        const creditsUsed = (result as any)?.creditsUsed ?? estimatedCost;

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
          const hb = setInterval(() => { if (!res.writableEnded) res.write(": heartbeat\n\n"); }, 15000);
          req.on("close", () => clearInterval(hb));
          res.write(
            `data: ${JSON.stringify({ type: "result", data: result })}\n\n`,
          );
          clearInterval(hb);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.json({
            result,
            credits_used: creditsUsed,
          });
        }
      } catch (err) {
        if (err instanceof WorkerDelegationError || err instanceof DelegatedWorkerPlatformError) {
          sendApiError(res, err.statusCode, err.code, err.message, err.type);
          return;
        }
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
