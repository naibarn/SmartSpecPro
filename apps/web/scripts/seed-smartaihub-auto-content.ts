/**
 * Generate an auto content manifest from keyword seeds and import it into smartaihub.app.
 *
 * Usage examples:
 *   npm --prefix apps/web run seed:smartaihub:auto-content
 *   npm --prefix apps/web run seed:smartaihub:auto-content -- --count=3 --mode=news
 *   npm --prefix apps/web run seed:smartaihub:auto-content -- --keywords="AI search optimization, FAQ SEO"
 *   SMARTAIHUB_AUTO_KEYWORDS_FILE=keywords.txt npm --prefix apps/web run seed:smartaihub:auto-content
 *   cat keywords.json | npm --prefix apps/web run seed:smartaihub:auto-content -- --generate-only
 */

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { SmartAiHubContentManifestSchema } from "../shared/smartaihubContentManifest";
import {
  buildSmartAiHubAutoContentManifest,
  getSmartAiHubDefaultAutoKeywords,
  renderSmartAiHubAutoContentSummary,
  parseSmartAiHubAutoKeywords,
  type SmartAiHubAutoContentBuildOptions,
} from "../shared/smartaihubAutoContent";
import { importSmartAiHubContentManifest } from "../server/services/smartaihubContentImport";
import { pingSmartAiHubSearchEngines } from "../server/services/sitemapPing";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return (arg ? arg.slice(prefix.length) : undefined)?.trim() || undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).some((value) => value === `--${name}`);
}

function numberArgValue(name: string): number | undefined {
  const raw = argValue(name);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => resolve(raw.trim() || undefined));
    process.stdin.on("error", reject);
  });
}

function readKeywordsFromFile(filePath: string): string[] {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function resolveKeywords(): Promise<string[]> {
  const cli = argValue("keywords");
  if (cli) {
    return parseSmartAiHubAutoKeywords(cli.split(/[,;\n]+/g));
  }

  const envKeywords = process.env.SMARTAIHUB_AUTO_KEYWORDS?.trim();
  if (envKeywords) {
    return parseSmartAiHubAutoKeywords(envKeywords.split(/[,;\n]+/g));
  }

  const filePath = argValue("keyword-file") || process.env.SMARTAIHUB_AUTO_KEYWORDS_FILE?.trim();
  if (filePath) {
    return parseSmartAiHubAutoKeywords(readKeywordsFromFile(filePath));
  }

  const stdinRaw = await readStdin();
  if (stdinRaw) {
    const trimmed = stdinRaw.trim();
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parseSmartAiHubAutoKeywords(parsed.map((value) => String(value)));
      }
    }

    return parseSmartAiHubAutoKeywords(trimmed.split(/[,;\n]+/g));
  }

  return getSmartAiHubDefaultAutoKeywords();
}

async function main() {
  const tenantDomain = argValue("tenant") || process.env.SMARTAIHUB_TENANT_DOMAIN || "smartaihub.app";
  const outPath = argValue("out") || process.env.SMARTAIHUB_AUTO_CONTENT_OUT;
  const generateOnly = hasFlag("generate-only") || process.env.SMARTAIHUB_AUTO_CONTENT_GENERATE_ONLY === "true";
  const topicCount =
    numberArgValue("count") ??
    numberArgValue("topics") ??
    (Number(process.env.SMARTAIHUB_AUTO_CONTENT_COUNT || "") || 3);
  const modeInput = (argValue("mode") || process.env.SMARTAIHUB_AUTO_CONTENT_MODE || "auto").trim().toLowerCase();
  const freshnessDays =
    numberArgValue("freshness-days") ??
    Number(process.env.SMARTAIHUB_AUTO_CONTENT_FRESHNESS_DAYS || "");
  const keywords = await resolveKeywords();
  type AllowedMode = NonNullable<SmartAiHubAutoContentBuildOptions["mode"]>;
  const buildOptions: SmartAiHubAutoContentBuildOptions = {
    topicCount,
    mode: ["standard", "news", "mixed", "auto"].includes(modeInput) ? (modeInput as AllowedMode) : "auto",
    ...(Number.isFinite(freshnessDays) && freshnessDays >= 0 ? { freshnessDays } : {}),
  };
  const manifest = buildSmartAiHubAutoContentManifest(keywords, tenantDomain, buildOptions);

  const parsed = SmartAiHubContentManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`Generated manifest is invalid: ${JSON.stringify(parsed.error.flatten(), null, 2)}`);
  }

  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(parsed.data, null, 2)}\n`);
  }

  if (generateOnly) {
    console.log(JSON.stringify({
      success: true,
      summary: renderSmartAiHubAutoContentSummary(parsed.data),
      manifest: parsed.data,
    }, null, 2));
    return;
  }

  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql);

  try {
    const result = await importSmartAiHubContentManifest(db, parsed.data, tenantDomain);
    console.log(JSON.stringify({
      success: true,
      summary: renderSmartAiHubAutoContentSummary(parsed.data),
      result,
    }, null, 2));
    await pingSmartAiHubSearchEngines(tenantDomain).catch(() => {});
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Auto content seed error:", error);
  process.exit(1);
});
