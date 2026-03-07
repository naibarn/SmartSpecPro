/**
 * Skill Repositories Router
 * Manage external Git repos containing skill collections.
 * Admin can add repos, fetch/upgrade skills, and remove repos.
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { skillRepositories, skills } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateMarketplaceContent } from "../services/marketplaceContentGenerator";
import { refreshSkillCache } from "../services/skillRegistry";
import { execSync, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const REPOS_DIR = path.resolve(process.cwd(), "tmp/skill-repos");
const SKILLS_DIR = path.resolve(process.cwd(), "skills");

interface SkillMetadata {
  name: string;
  slug?: string;
  version?: string;
  author?: string;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  auto_trigger?: boolean;
  trigger_patterns?: string[];
  credit_multiplier?: number;
  priority?: number;
  enabled_by_default?: boolean;
  config?: Record<string, any>;
  metadata?: {
    category?: string;
    author?: string;
    triggers?: string;
    references?: string;
    [key: string]: any;
  };
}

function parseSkillFile(content: string): { metadata: SkillMetadata; content: string } {
  if (content.startsWith("---")) {
    const parts = content.split("---");
    if (parts.length >= 3) {
      try {
        const frontmatter = yaml.load(parts[1]) as SkillMetadata;
        const body = parts.slice(2).join("---").trim();
        return { metadata: frontmatter || {}, content: body };
      } catch {
        return { metadata: {} as SkillMetadata, content };
      }
    }
  }
  return { metadata: {} as SkillMetadata, content };
}

function mapCategoryToEnum(category?: string): string {
  const categoryMap: Record<string, string> = {
    "prompt_enhancement": "prompt_enhancement",
    "prompt-enhancement": "prompt_enhancement",
    "image_generation": "image_generation",
    "image-generation": "image_generation",
    "image_prompt_generation": "image_prompt_generation",
    "image-prompt-generation": "image_prompt_generation",
    "video_generation": "video_generation",
    "video-generation": "video_generation",
    "video_prompt_generation": "video_prompt_generation",
    "video-prompt-generation": "video_prompt_generation",
    "article_generation": "article_generation",
    "article-generation": "article_generation",
    "audio_generation": "audio_generation",
    "audio-generation": "audio_generation",
    "sound_effects": "sound_effects",
    "sound-effects": "sound_effects",
    "code_assistant": "code_assistant",
    "code-assistant": "code_assistant",
    "document_analysis": "document_analysis",
    "document-analysis": "document_analysis",
    "web_search": "web_search",
    "web-search": "web_search",
    "data_analysis": "data_analysis",
    "data-analysis": "data_analysis",
    "translation": "translation",
    "summarization": "summarization",
    "chat_assistant": "chat_assistant",
    "chat-assistant": "chat_assistant",
    "automation": "automation",
    "other": "other",
  };
  const cat = category?.toLowerCase() || "";
  if (categoryMap[cat]) return categoryMap[cat];
  if ((cat.includes("image") || cat.includes("photo")) && cat.includes("prompt")) return "image_prompt_generation";
  if ((cat.includes("video") || cat.includes("film")) && cat.includes("prompt")) return "video_prompt_generation";
  if (cat.includes("code") || cat.includes("dev") || cat.includes("engineer") || cat.includes("programming")) return "code_assistant";
  if (cat.includes("write") || cat.includes("content") || cat.includes("blog")) return "article_generation";
  if (cat.includes("data") || cat.includes("analy")) return "data_analysis";
  if (cat.includes("image") || cat.includes("photo")) return "image_generation";
  if (cat.includes("video") || cat.includes("film")) return "video_generation";
  if (cat.includes("audio") || cat.includes("music") || cat.includes("sound")) return "audio_generation";
  if (cat.includes("translat")) return "translation";
  if (cat.includes("summar")) return "summarization";
  if (cat.includes("search")) return "web_search";
  if (cat.includes("doc") || cat.includes("document")) return "document_analysis";
  if (cat.includes("automat") || cat.includes("workflow")) return "automation";
  return "other";
}

function computeContentHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * Normalize a GitHub URL or shorthand to a clone-able HTTPS URL
 * Accepts: "user/repo", "https://github.com/user/repo", "https://github.com/user/repo.git"
 */
function normalizeGitUrl(gitUrl: string): string {
  const trimmed = gitUrl.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("git@")) {
    return trimmed;
  }
  // Shorthand: "user/repo"
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}.git`;
  }
  return trimmed;
}

export const skillRepositoriesRouter = router({
  /**
   * List all skill repositories
   */
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    return db.select().from(skillRepositories).orderBy(skillRepositories.createdAt);
  }),

  /**
   * Add a new repository
   */
  add: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      gitUrl: z.string().min(1).max(500),
      branch: z.string().max(100).default("main"),
      formatType: z.enum(["auto", "antigravity", "claude", "custom-gpt"]).default("auto"),
      skillsSubdir: z.string().max(200).default("skills"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [repo] = await db
        .insert(skillRepositories)
        .values({
          name: input.name,
          gitUrl: normalizeGitUrl(input.gitUrl),
          branch: input.branch,
          formatType: input.formatType,
          skillsSubdir: input.skillsSubdir,
          status: "pending",
          createdBy: ctx.user?.id,
        })
        .returning();

      return repo;
    }),

  /**
   * Fetch repository: clone/pull and import all skills
   */
  fetch: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [repo] = await db
        .select()
        .from(skillRepositories)
        .where(eq(skillRepositories.id, input.id))
        .limit(1);

      if (!repo) throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });

      // Update status
      await db.update(skillRepositories)
        .set({ status: "fetching", errorMessage: null })
        .where(eq(skillRepositories.id, input.id));

      try {
        const repoDir = path.join(REPOS_DIR, String(input.id));
        const cloneUrl = repo.gitUrl;
        const branch = repo.branch || "main";

        // Security: validate branch name to prevent command injection
        const SAFE_BRANCH_RE = /^[a-zA-Z0-9_\-\/.]+$/;
        if (!SAFE_BRANCH_RE.test(branch)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid branch name" });
        }

        // Clone or pull — use spawnSync (no shell) to prevent command injection via cloneUrl
        if (fs.existsSync(path.join(repoDir, ".git"))) {
          const fetch = spawnSync("git", ["-C", repoDir, "fetch", "origin", branch], {
            timeout: 120000, stdio: "pipe",
          });
          if (fetch.status !== 0) throw new Error(`git fetch failed: ${fetch.stderr?.toString()}`);
          const reset = spawnSync("git", ["-C", repoDir, "reset", "--hard", `origin/${branch}`], {
            timeout: 120000, stdio: "pipe",
          });
          if (reset.status !== 0) throw new Error(`git reset failed: ${reset.stderr?.toString()}`);
        } else {
          fs.mkdirSync(repoDir, { recursive: true });
          const clone = spawnSync("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, repoDir], {
            timeout: 120000, stdio: "pipe",
          });
          if (clone.status !== 0) throw new Error(`git clone failed: ${clone.stderr?.toString()}`);
        }

        // Get commit hash
        const revParse = spawnSync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
          timeout: 10000, encoding: "utf-8",
        });
        if (revParse.status !== 0) throw new Error("git rev-parse failed");
        const commitHash = (revParse.stdout as string).trim();

        // Scan skills directory
        const skillsDir = path.join(repoDir, repo.skillsSubdir || "skills");
        if (!fs.existsSync(skillsDir)) {
          throw new Error(`Skills directory '${repo.skillsSubdir}' not found in repository`);
        }

        const folders = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);

        // Get existing skills from this repo
        const existingSlugs = new Map<string, { id: number; contentHash: string | null }>();
        const existingSkills = await db
          .select({ id: skills.id, slug: skills.slug, contentHash: skills.contentHash })
          .from(skills)
          .where(eq(skills.repositoryId, input.id));
        for (const s of existingSkills) {
          existingSlugs.set(s.slug, { id: s.id, contentHash: s.contentHash });
        }

        const results = { imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

        for (const folder of folders) {
          try {
            const folderPath = path.join(skillsDir, folder);
            // Find skill.md or SKILL.md
            const skillMdPath = [
              path.join(folderPath, "skill.md"),
              path.join(folderPath, "SKILL.md"),
            ].find(p => fs.existsSync(p));

            if (!skillMdPath) {
              results.skipped++;
              continue;
            }

            const rawContent = fs.readFileSync(skillMdPath, "utf-8");
            const parsed = parseSkillFile(rawContent);
            const metadata = parsed.metadata;
            const body = parsed.content;
            const hash = computeContentHash(rawContent);

            // Determine slug
            const slug = folder.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
            if (!slug) {
              results.skipped++;
              continue;
            }

            // Determine category from metadata
            const category = mapCategoryToEnum(
              metadata.category || metadata.metadata?.category
            ) as any;

            const skillName = (metadata.name || folder.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())).substring(0, 255);
            const description = typeof metadata.description === "string" ? metadata.description.substring(0, 5000) : "";
            // Sanitize priority — some skills use strings like "CRITICAL" instead of numbers
            const rawPriority = metadata.priority;
            const priority = typeof rawPriority === "number" ? rawPriority : 50;
            // Sanitize credit_multiplier
            const rawCredit = metadata.credit_multiplier;
            const creditMultiplier = typeof rawCredit === "number" ? String(rawCredit) : "1.0";
            // Sanitize version
            const version = typeof metadata.version === "string" ? metadata.version.substring(0, 20) : "1.0.0";

            // Copy skill folder to SKILLS_DIR
            const destDir = path.join(SKILLS_DIR, slug);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            // Copy skill.md as skill.md (lowercase)
            fs.copyFileSync(skillMdPath, path.join(destDir, "skill.md"));

            const existing = existingSlugs.get(slug);

            if (!existing) {
              // Also check if slug exists from another source
              const [anyExisting] = await db
                .select({ id: skills.id })
                .from(skills)
                .where(eq(skills.slug, slug))
                .limit(1);

              if (anyExisting) {
                results.skipped++;
                continue;
              }

              // New skill — insert
              await db.insert(skills).values({
                slug,
                name: skillName,
                description,
                category,
                version,
                author: metadata.author || metadata.metadata?.author,
                icon: metadata.icon || "sparkles",
                tags: Array.isArray(metadata.tags) ? metadata.tags : [],
                folderPath: `skills/${slug}`,
                isAutoTrigger: false,
                triggerPatterns: [],
                isEnabled: true,
                enabledByDefault: false,
                creditMultiplier,
                priority,
                systemPrompt: body || undefined,
                skillContent: body,
                marketplaceContent: generateMarketplaceContent(body, { name: skillName, description }),
                configJson: metadata.config,
                visibleByDefault: false,
                importSource: "repository",
                repositoryId: input.id,
                repositorySlug: folder,
                contentHash: hash,
              });
              results.imported++;
            } else if (existing.contentHash !== hash) {
              // Existing skill with changed content — update
              await db.update(skills)
                .set({
                  systemPrompt: body || undefined,
                  skillContent: body,
                  marketplaceContent: generateMarketplaceContent(body, { name: skillName, description }),
                  contentHash: hash,
                  description: description || undefined,
                  version: metadata.version || undefined,
                  author: metadata.author || metadata.metadata?.author || undefined,
                })
                .where(eq(skills.id, existing.id));
              results.updated++;
            } else {
              // No change
              results.skipped++;
            }
          } catch (err: any) {
            results.errors.push(`${folder}: ${err.message}`);
          }
        }

        // Update repo record
        await db.update(skillRepositories)
          .set({
            status: "ready",
            lastFetchedAt: new Date(),
            lastCommitHash: commitHash,
            skillCount: results.imported + results.updated + (existingSkills.length - results.updated),
            errorMessage: results.errors.length > 0 ? results.errors.join("\n") : null,
          })
          .where(eq(skillRepositories.id, input.id));

        await refreshSkillCache();

        return results;
      } catch (err: any) {
        await db.update(skillRepositories)
          .set({ status: "error", errorMessage: err.message })
          .where(eq(skillRepositories.id, input.id));

        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
      }
    }),

  /**
   * Remove repository and optionally its skills
   */
  remove: adminProcedure
    .input(z.object({
      id: z.number(),
      removeSkills: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      if (input.removeSkills) {
        // Get skill slugs before deleting (to clean up folders)
        const skillsToDelete = await db
          .select({ slug: skills.slug, folderPath: skills.folderPath })
          .from(skills)
          .where(eq(skills.repositoryId, input.id));

        // Delete skills from DB
        await db.delete(skills).where(eq(skills.repositoryId, input.id));

        // Delete skill folders from disk to prevent auto-sync re-import
        for (const s of skillsToDelete) {
          const skillDir = path.join(SKILLS_DIR, s.slug);
          if (fs.existsSync(skillDir)) {
            fs.rmSync(skillDir, { recursive: true, force: true });
          }
        }
      } else {
        // Detach skills (set repositoryId to null)
        await db.update(skills)
          .set({ repositoryId: null })
          .where(eq(skills.repositoryId, input.id));
      }

      // Delete repo record
      await db.delete(skillRepositories).where(eq(skillRepositories.id, input.id));

      // Clean up cloned directory
      const repoDir = path.join(REPOS_DIR, String(input.id));
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }

      await refreshSkillCache();

      return { success: true };
    }),

  /**
   * Get repository details with skill count breakdown
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [repo] = await db
        .select()
        .from(skillRepositories)
        .where(eq(skillRepositories.id, input.id))
        .limit(1);

      if (!repo) throw new TRPCError({ code: "NOT_FOUND" });

      const repoSkills = await db
        .select({ id: skills.id, slug: skills.slug, name: skills.name, enabledByDefault: skills.enabledByDefault })
        .from(skills)
        .where(eq(skills.repositoryId, input.id));

      return { ...repo, skills: repoSkills };
    }),
});
