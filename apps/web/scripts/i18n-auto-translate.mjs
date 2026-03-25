#!/usr/bin/env node
/**
 * i18n-auto-translate.mjs
 *
 * Automatically translates missing keys in locale JSON files using the
 * internal SmartSpec LLM gateway (Node.js web server at localhost:3000).
 *
 * Authenticates via x-internal-token header (SMARTSPEC_WEB_GATEWAY_TOKEN).
 * No external API keys needed — uses whichever provider is configured in the system.
 *
 * Usage:
 *   node scripts/i18n-auto-translate.mjs [options]
 *
 * Options:
 *   --lang <code>       Target language code (default: th). Must be in SUPPORTED_LANGUAGES.
 *   --namespace <name>  Translate only this namespace (e.g. --namespace chat). Default: all.
 *   --dry-run           Print what would be translated without writing files.
 *   --model <id>        LLM model to use (default: uses env LLM_TRANSLATE_MODEL or system default).
 *   --batch-size <n>    Keys per LLM request (default: 30).
 *   --gateway <url>     Override gateway URL (default: http://localhost:3000).
 *
 * Examples:
 *   node scripts/i18n-auto-translate.mjs --lang th
 *   node scripts/i18n-auto-translate.mjs --lang ja --namespace chat
 *   node scripts/i18n-auto-translate.mjs --lang th --dry-run
 *
 * Environment (auto-loaded from apps/web/.env):
 *   SMARTSPEC_WEB_GATEWAY_TOKEN  Internal service token (required)
 *   LLM_TRANSLATE_MODEL          Model override for translations
 *   WEB_GATEWAY_URL              Override gateway URL
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
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
// Internal gateway: Node.js web server at :3000, authenticated with x-internal-token
const GATEWAY_URL = process.env.WEB_GATEWAY_URL || getArg("--gateway", "http://localhost:3000");
const GATEWAY_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";
const LLM_MODEL = process.env.LLM_TRANSLATE_MODEL || getArg("--model", "");
// Empty model = gateway picks the best available (respects system LLM settings)

if (!DRY_RUN) {
  console.log(`🤖 Using SmartSpec internal gateway: ${GATEWAY_URL}/v1/chat/completions`);
  if (LLM_MODEL) console.log(`   Model override: ${LLM_MODEL}`);
  if (!GATEWAY_TOKEN) {
    console.error("❌ SMARTSPEC_WEB_GATEWAY_TOKEN not set in apps/web/.env");
    process.exit(1);
  }
  console.log("");
}

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
mkdirSync(TH_DIR, { recursive: true }); // create target locale directory if new language

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

// ─── LLM Translation via SmartSpec internal gateway ──────────────────────────
async function translateBatch(pairs, namespace) {
  /**
   * Calls the web server's OpenAI-compatible gateway at /v1/chat/completions
   * using x-internal-token for service-to-service auth.
   *
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

  const requestBody = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 4096,
    // model is optional — gateway uses system default if omitted
    ...(LLM_MODEL ? { model: LLM_MODEL } : {}),
  };

  const resp = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": GATEWAY_TOKEN,   // service-to-service auth (see llmRoutes.ts:1460)
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gateway error HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";

  // Extract JSON (handle markdown code fences from some models)
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  const jsonStr = (jsonMatch[1] || content).trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error("❌ Failed to parse gateway response as JSON:", content.slice(0, 300));
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
