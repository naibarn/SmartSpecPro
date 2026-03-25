#!/usr/bin/env node
/**
 * i18n-auto-translate.mjs
 *
 * Automatically translates missing keys in locale JSON files using the
 * existing LLM gateway (Python backend at localhost:8000).
 *
 * Usage:
 *   node scripts/i18n-auto-translate.mjs [options]
 *
 * Options:
 *   --lang <code>       Target language code (default: th). Must be in SUPPORTED_LANGUAGES.
 *   --namespace <name>  Translate only this namespace (e.g. --namespace chat). Default: all.
 *   --dry-run           Print what would be translated without writing files.
 *   --model <id>        LLM model to use (default: uses env LLM_MODEL or claude-sonnet-4-6).
 *   --batch-size <n>    Keys per LLM request (default: 30).
 *
 * Examples:
 *   node scripts/i18n-auto-translate.mjs --lang th
 *   node scripts/i18n-auto-translate.mjs --lang ja --namespace chat
 *   node scripts/i18n-auto-translate.mjs --lang th --dry-run
 *
 * Environment:
 *   SMARTSPEC_WEB_GATEWAY_TOKEN  (required) Bearer token for LLM gateway
 *   LLM_MODEL                    Override default model
 *   PYTHON_BACKEND_URL           Override gateway URL (default: http://localhost:8000)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Auto-load .env files (apps/web/.env and python-backend/.env)
function loadEnvFile(envPath) {
  try {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* skip missing files */ }
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
loadEnvFile(join(scriptDir, "../.env"));                   // apps/web/.env
loadEnvFile(join(scriptDir, "../../../python-backend/.env")); // python-backend/.env

// ─── Config ───────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "../client/src/locales");
const SHARED_I18N = join(__dirname, "../shared/i18n.ts");

const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}
const DRY_RUN = args.includes("--dry-run");
const TARGET_LANG = getArg("--lang", "th");
const TARGET_NS = getArg("--namespace", null); // null = all
const BATCH_SIZE = parseInt(getArg("--batch-size", "30"), 10);
const GATEWAY_URL = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const GATEWAY_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || getArg("--model", "claude-haiku-4-5-20251001");

// Determine which LLM backend to use
// Priority: Anthropic direct → OpenAI direct → internal gateway
const BACKEND = ANTHROPIC_KEY ? "anthropic" : OPENAI_KEY ? "openai" : "gateway";
if (!DRY_RUN) console.log(`🤖 Using LLM backend: ${BACKEND} (model: ${LLM_MODEL})\n`);

// Language display names for the LLM prompt
const LANG_NAMES = {
  th: "Thai", ja: "Japanese", ko: "Korean", ar: "Arabic",
  "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese",
  vi: "Vietnamese", id: "Indonesian", hi: "Hindi", es: "Spanish",
  "pt-BR": "Brazilian Portuguese", fr: "French", de: "German",
  ru: "Russian", it: "Italian", tr: "Turkish", nl: "Dutch", pl: "Polish",
};

const LANG_NAME = LANG_NAMES[TARGET_LANG] || TARGET_LANG;

// ─── Validation ───────────────────────────────────────────────────────────────
if (!LANG_NAME) {
  console.error(`❌ Unknown language: ${TARGET_LANG}`);
  process.exit(1);
}
if (!GATEWAY_TOKEN && !DRY_RUN) {
  console.warn("⚠️  SMARTSPEC_WEB_GATEWAY_TOKEN not set — will try unauthenticated");
}

// ─── Load locale files ────────────────────────────────────────────────────────
function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function writeJson(path, data) {
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

const EN_DIR = join(LOCALES_DIR, "en");
const TH_DIR = join(LOCALES_DIR, TARGET_LANG);

const namespaces = readdirSync(EN_DIR)
  .filter(f => f.endsWith(".json"))
  .map(f => f.replace(".json", ""))
  .filter(ns => !TARGET_NS || ns === TARGET_NS);

// ─── Find missing keys ────────────────────────────────────────────────────────
const allMissing = {};
let totalMissing = 0;

for (const ns of namespaces) {
  const enData = readJson(join(EN_DIR, `${ns}.json`));
  const thData = readJson(join(TH_DIR, `${ns}.json`));
  const missing = Object.entries(enData).filter(([k]) => !thData[k]);
  if (missing.length > 0) {
    allMissing[ns] = { missing, existing: thData, en: enData };
    totalMissing += missing.length;
  }
}

if (totalMissing === 0) {
  console.log(`✅ No missing keys for ${LANG_NAME} (${TARGET_LANG}). All translations complete!`);
  process.exit(0);
}

console.log(`\n📋 Found ${totalMissing} missing ${LANG_NAME} keys across ${Object.keys(allMissing).length} namespaces\n`);
for (const [ns, { missing }] of Object.entries(allMissing)) {
  console.log(`   ${ns}: ${missing.length} keys`);
}

if (DRY_RUN) {
  console.log("\n[DRY RUN] Would translate the above keys. Remove --dry-run to execute.");
  process.exit(0);
}

// ─── LLM Translation ─────────────────────────────────────────────────────────
async function translateBatch(pairs, namespace) {
  /**
   * pairs: [{ key, en_value }, ...]
   * Returns: { key: translated_value, ... }
   */
  const keyList = pairs
    .map(({ key, en_value }) => `"${key}": ${JSON.stringify(en_value)}`)
    .join("\n");

  const systemPrompt = `You are a professional UI translator specialising in web application interfaces.
Translate the following JSON keys from English to ${LANG_NAME}.

Rules:
- Keep the same JSON key names
- Translate ONLY the values
- Preserve {{variable}} interpolation placeholders exactly as-is (e.g. {{name}}, {{count}})
- Use natural, concise UI copy — not formal/literary language
- Do not add HTML markup
- Respond ONLY with a valid JSON object, no explanation`;

  const userPrompt = `Namespace: ${namespace}\n\nTranslate these English values to ${LANG_NAME}:\n{\n${keyList}\n}`;

  let resp;

  if (BACKEND === "anthropic") {
    // Anthropic Messages API
    const requestBody = {
      model: LLM_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic API error HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const content = data.content?.[0]?.text?.trim() ?? "";
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    try { return JSON.parse((jsonMatch[1] || content).trim()); } catch {
      console.error("❌ Bad JSON from Anthropic:", content.slice(0, 200)); return {};
    }
  }

  if (BACKEND === "openai") {
    // OpenAI Chat Completions API
    const requestBody = {
      model: LLM_MODEL.startsWith("claude") ? "gpt-4o-mini" : LLM_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.1,
      max_tokens: 4096,
    };
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(requestBody),
    });
  } else {
    // Internal gateway fallback
    const requestBody = {
      model: LLM_MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.1, max_tokens: 4096,
    };
    resp = await fetch(`${GATEWAY_URL}/api/v1/llm/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(GATEWAY_TOKEN ? { Authorization: `Bearer ${GATEWAY_TOKEN}` } : {}) },
      body: JSON.stringify(requestBody),
    });
  }

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM gateway error HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  const jsonStr = (jsonMatch[1] || content).trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error("❌ Failed to parse LLM response as JSON:", content.slice(0, 300));
    return {};
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
let totalTranslated = 0;
let totalFailed = 0;

for (const [ns, { missing, existing, en }] of Object.entries(allMissing)) {
  console.log(`\n🔄 Translating namespace: ${ns} (${missing.length} keys)`);

  const thData = { ...existing };

  // Process in batches
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(missing.length / BATCH_SIZE);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} keys)... `);

    try {
      const pairs = batch.map(([key, en_value]) => ({ key, en_value }));
      const translated = await translateBatch(pairs, ns);

      let batchOk = 0;
      for (const [key] of batch) {
        if (translated[key] !== undefined) {
          thData[key] = translated[key];
          batchOk++;
        }
      }

      console.log(`✅ ${batchOk}/${batch.length} translated`);
      totalTranslated += batchOk;
      totalFailed += (batch.length - batchOk);
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
      totalFailed += batch.length;
    }

    // Small delay to avoid rate limits
    if (i + BATCH_SIZE < missing.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Write updated file
  const outPath = join(TH_DIR, `${ns}.json`);
  writeJson(outPath, thData);
  console.log(`   💾 Written: ${outPath}`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`✅ Translated: ${totalTranslated} keys`);
if (totalFailed > 0) console.log(`❌ Failed:     ${totalFailed} keys (re-run to retry)`);
console.log(`\n📝 Next steps:`);
console.log(`   1. Review translations in client/src/locales/${TARGET_LANG}/`);
console.log(`   2. Update LANGUAGE_COVERAGE['${TARGET_LANG}'] in shared/i18n.ts`);
console.log(`   3. Run: npm run test -- --run "localeParity"`);
