/**
 * builtin-skill-discovery Stub — Spec 035 Section 08
 *
 * POST /api/internal/tools/skill-discovery
 *
 * Simplified skill discovery for the Auto Draft Agent.
 * Returns skills ranked by keyword overlap between the query description
 * and skill name/description/tags. Full vector-search implementation
 * is deferred to Spec 034.
 *
 * Authentication: X-Internal-Token header (SMARTSPEC_WEB_GATEWAY_TOKEN)
 * Feature flag: ENABLE_CONTENT_AUTOMATION
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { getAvailableSkillsAsync } from "../services/skillRegistry";
import { getPreferredInternalToken } from "../services/appRuntimeConfig";
import type { SkillDefinition } from "@smartspec/skills";
import { contentAutomationGate } from "../middleware/contentAutomationGate";

export const skillDiscoveryRouter = Router();

// ── Request schema ─────────────────────────────────────────────────────────

const SkillDiscoveryRequestSchema = z.object({
  /** Optional category/type filter, e.g. "prompt-enhancement", "image-generation" */
  category: z.string().optional(),
  /** Natural language description used for keyword overlap scoring */
  description: z.string().max(500).optional(),
  /** Maximum number of results to return (capped at 10) */
  limit: z.number().int().min(1).max(10).default(5),
});

// ── Internal token verification ────────────────────────────────────────────

async function verifyInternalToken(req: Request): Promise<boolean> {
  const expected = await getPreferredInternalToken();
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    return (
      token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}

// ── Keyword overlap scorer ─────────────────────────────────────────────────

function computeConfidence(skill: SkillDefinition, description: string | undefined): number {
  if (!description || description.trim() === "") {
    return 0.5; // base score when no preference expressed
  }
  const tokens = description
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\w]/g, ""))
    .filter(Boolean);

  if (tokens.length === 0) return 0.5;

  const tags: string[] = (skill as any).tags ?? [];
  const corpus = `${skill.name} ${skill.description} ${tags.join(" ")}`.toLowerCase();

  let matchCount = 0;
  for (const token of tokens) {
    if (corpus.includes(token)) matchCount++;
  }

  return Math.min(1.0, matchCount / tokens.length);
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function skillDiscoveryHandler(req: Request, res: Response): Promise<void> {
  // 1. Verify X-Internal-Token
  if (!(await verifyInternalToken(req))) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  // 2. Parse + validate request body
  const parsed = SkillDiscoveryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    return;
  }

  const { category, description, limit } = parsed.data;

  try {
    // 3. Load all skills
    const allSkills = await getAvailableSkillsAsync();

    // 4. Filter by category if provided
    const filtered = category
      ? allSkills.filter((s) => s.type === category)
      : allSkills;

    // 5. Score each skill by keyword overlap
    const scored = filtered.map((skill) => ({
      skill,
      confidence: computeConfidence(skill, description),
    }));

    // 6. Sort descending by confidence
    scored.sort((a, b) => b.confidence - a.confidence);

    // If there are 5+ positive-score skills, exclude zero-confidence ones
    const positiveCount = scored.filter((s) => s.confidence > 0).length;
    const candidates =
      positiveCount >= 5 ? scored.filter((s) => s.confidence > 0) : scored;

    const results = candidates.slice(0, limit);

    // 7. Return response
    res.json({
      skills: results.map(({ skill, confidence }) => ({
        id: skill.id,
        name: skill.name,
        type: skill.type,
        description: skill.description,
        tags: (skill as any).tags ?? [],
        confidence,
      })),
      total: filtered.length,
      query_echo: {
        category,
        description,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(JSON.stringify({ event: "skill_discovery_error", error: msg }));
    res.status(500).json({ error: "SKILL_REGISTRY_ERROR", message: "Internal error" });
  }
}

skillDiscoveryRouter.post(
  "/api/internal/tools/skill-discovery",
  contentAutomationGate,
  skillDiscoveryHandler
);

export function registerSkillDiscoveryToolRoute(app: import("express").Express): void {
  app.use(skillDiscoveryRouter);
}

export default skillDiscoveryRouter;
