/**
 * Idempotent seeder for workflow template examples (Feature 017).
 *
 * Reads 60 JSON files from specs/feature/017-VirtualWorkflowExam/templates/,
 * generates SVG previews, and upserts into the database.
 *
 * Usage:
 *   cd apps/web && NODE_PATH=./node_modules npx tsx ../../scripts/seed-workflow-templates.ts
 *
 * Safe to run multiple times. Uses templateKey as the ON CONFLICT target.
 * Exit code 0 = success (warnings allowed), 1 = unrecoverable error.
 */
import path from "node:path";
import fs from "node:fs";

// Load .env from apps/web/ directory
const webAppDir = path.resolve(__dirname, "../apps/web");
const envPath = path.join(webAppDir, ".env");
if (fs.existsSync(envPath)) {
  // Manual dotenv loading since we run outside apps/web
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import {
  workflowTemplates,
  templateCategories,
  users,
} from "../apps/web/drizzle/schema";
import { generateWorkflowSvg } from "../apps/web/server/lib/workflowSvgGenerator";

// -- Types ---------------------------------------------------------------

interface TemplateJson {
  id: string;
  name: string;
  description: string;
  category: string;
  industry: string[];
  tags: string[];
  stepCount: number;
  estimatedSetupMinutes: number;
  workflowJson: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }>;
  };
}

// -- Constants -----------------------------------------------------------

const CATEGORY_NAMES: string[] = [
  "Sales & Marketing",
  "HR & People",
  "Finance & Accounting",
  "IT & DevOps",
  "Healthcare",
  "Education",
  "Government & Public",
  "Personal Productivity",
  "Real Estate",
  "Logistics & Supply Chain",
  "Content & Media",
  "Food & Restaurant",
  "Legal & Compliance",
  "Customer Service",
  "AI & Automation",
];

const TEMPLATES_DIR = path.resolve(
  __dirname,
  "../specs/feature/017-VirtualWorkflowExam/templates"
);

const SVG_TIMEOUT_MS = 10_000;

const SYSTEM_USER_OPEN_ID = "system-seeder-workflow-templates";
const SYSTEM_USER_EMAIL = "system@smartspecpro.internal";

/** M-05: Scrub credentials from error messages before logging */
function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/postgresql?:\/\/[^\s@]*@[^\s/]*/gi, "postgresql://***:***@***");
}

// -- Helpers -------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+&\s+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function generateSvgWithTimeout(
  workflowJson: TemplateJson["workflowJson"],
  timeoutMs: number
): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve(generateWorkflowSvg(workflowJson)),
      new Promise<null>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SVG generation timeout")), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    return result;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// -- Step 0: Seed Categories ---------------------------------------------

async function seedCategories(
  db: ReturnType<typeof drizzle>
): Promise<Map<string, number>> {
  const categoryMap = new Map<string, number>();

  for (let i = 0; i < CATEGORY_NAMES.length; i++) {
    const name = CATEGORY_NAMES[i];
    const slug = slugify(name);

    await db
      .insert(templateCategories)
      .values({
        name,
        slug,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: templateCategories.slug });

    const [row] = await db
      .select({ id: templateCategories.id })
      .from(templateCategories)
      .where(eq(templateCategories.slug, slug))
      .limit(1);

    if (row) {
      categoryMap.set(name, row.id);
    }
  }

  console.log(`[OK] Seeded ${categoryMap.size} template categories`);
  return categoryMap;
}

// -- Step 1: Resolve System User -----------------------------------------

async function resolveSystemUser(
  db: ReturnType<typeof drizzle>
): Promise<number> {
  await db
    .insert(users)
    .values({
      openId: SYSTEM_USER_OPEN_ID,
      name: "System",
      email: SYSTEM_USER_EMAIL,
      role: "user",
      plan: "free",
      credits: 0,
      isDisabled: false,
    })
    .onConflictDoNothing({ target: users.openId });

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, SYSTEM_USER_OPEN_ID))
    .limit(1);

  if (!row) {
    throw new Error("Failed to create or find system user");
  }

  console.log(`[OK] System user resolved (id=${row.id})`);
  return row.id;
}

// -- Step 2: Load and Upsert Templates -----------------------------------

async function seedTemplates(
  db: ReturnType<typeof drizzle>,
  systemUserId: number,
  categoryMap: Map<string, number>
): Promise<{ ok: number; warned: number; errored: number }> {
  const stats = { ok: 0, warned: 0, errored: 0 };

  const files = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => /^tpl-\d{3}-[\w-]+\.json$/.test(f))
    .sort();

  for (const filename of files) {
    let template: TemplateJson;

    // M-06: Path traversal defense — verify resolved path stays within TEMPLATES_DIR
    const filePath = path.join(TEMPLATES_DIR, filename);
    if (!filePath.startsWith(TEMPLATES_DIR + path.sep) && filePath !== TEMPLATES_DIR) {
      console.error(`[SECURITY] Rejected suspicious path: ${filePath}`);
      stats.errored++;
      continue;
    }

    // 1. Parse JSON
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      template = JSON.parse(raw) as TemplateJson;
    } catch (err) {
      console.error(`[ERROR] ${filename} — JSON parse error: ${sanitizeError(err)}`);
      stats.errored++;
      continue;
    }

    // 2. Resolve category
    const categoryId = categoryMap.get(template.category);
    if (!categoryId) {
      console.error(
        `[ERROR] ${template.id} — Category not found: "${template.category}"`
      );
      stats.errored++;
      continue;
    }

    // 3. Generate SVG
    let previewSvg: string | null = null;
    try {
      previewSvg = await generateSvgWithTimeout(
        template.workflowJson,
        SVG_TIMEOUT_MS
      );
      if (!previewSvg) {
        console.warn(`[WARN] ${template.id} — SVG generation failed (previewSvg=null)`);
        stats.warned++;
      }
    } catch {
      console.warn(`[WARN] ${template.id} — SVG timeout (previewSvg=null)`);
      stats.warned++;
    }

    // 4. Upsert into database
    try {
      await db
        .insert(workflowTemplates)
        .values({
          templateKey: template.id,
          name: template.name,
          description: template.description,
          workflowJson: template.workflowJson,
          previewSvg,
          industry: template.industry,
          tags: template.tags,
          stepCount: template.workflowJson.nodes.length,
          estimatedSetupMinutes: template.estimatedSetupMinutes,
          categoryId,
          authorId: systemUserId,
          tenantId: null,
          isPublic: true,
          status: "published",
        })
        .onConflictDoUpdate({
          target: workflowTemplates.templateKey,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            workflowJson: sql`excluded."workflowJson"`,
            previewSvg: sql`excluded."previewSvg"`,
            industry: sql`excluded.industry`,
            tags: sql`excluded.tags`,
            stepCount: sql`excluded."stepCount"`,
            estimatedSetupMinutes: sql`excluded."estimatedSetupMinutes"`,
            categoryId: sql`excluded."categoryId"`,
            updatedAt: sql`now()`,
          },
        });

      const svgNote = previewSvg ? "" : " (no SVG)";
      console.log(`[OK]   ${template.id} — ${template.name}${svgNote}`);
      stats.ok++;
    } catch (err) {
      console.error(`[ERROR] ${template.id} — DB upsert failed: ${sanitizeError(err)}`);
      stats.errored++;
    }
  }

  return stats;
}

// -- Main ----------------------------------------------------------------

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  console.log("Starting workflow template seeder...\n");

  const client = postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  const db = drizzle(client);

  try {
    // Step 0: seed categories
    const categoryMap = await seedCategories(db);

    // Step 1: resolve system user
    const systemUserId = await resolveSystemUser(db);

    // Step 2: load + seed all templates
    const stats = await seedTemplates(db, systemUserId, categoryMap);

    // Step 3: summary
    const total = stats.ok + stats.warned + stats.errored;
    console.log(
      `\nSeeded ${total} templates: ${stats.ok} OK, ${stats.warned} warned (SVG), ${stats.errored} errored`
    );

    if (stats.errored > 0) {
      console.warn("Some templates had errors. Review output above.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seeder failed (unrecoverable):", sanitizeError(err));
  process.exit(1);
});
