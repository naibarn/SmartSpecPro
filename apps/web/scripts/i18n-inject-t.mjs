#!/usr/bin/env node
/**
 * i18n-inject-t.mjs
 *
 * Scans TSX/TS components for hardcoded strings in JSX and generates:
 *   1. A report of all strings that need t() wrapping
 *   2. Suggested key names and namespace assignments
 *   3. (Optional) Auto-patches files with t() calls via simple text replacement
 *
 * Usage:
 *   node scripts/i18n-inject-t.mjs [options]
 *
 * Options:
 *   --path <glob>     File or directory to scan (default: client/src/pages)
 *   --namespace <ns>  Target namespace for new keys (default: inferred from file path)
 *   --report          Print report only (no file changes). Default mode.
 *   --patch           Apply automatic patches (adds t() wrapping + generates JSON keys)
 *   --output <file>   Write report to file instead of stdout
 *
 * Examples:
 *   node scripts/i18n-inject-t.mjs --path client/src/pages/Chat.tsx --report
 *   node scripts/i18n-inject-t.mjs --path client/src/pages/MediaStudio.tsx --patch
 *   node scripts/i18n-inject-t.mjs --path client/src/pages --output i18n-report.json
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}

const SCAN_PATH = join(ROOT, getArg("--path", "client/src/pages"));
const MODE = args.includes("--patch") ? "patch" : "report";
const OUTPUT_FILE = getArg("--output", null);

// ─── Namespace mapping (file path → i18n namespace) ───────────────────────────
const NS_MAP = {
  "pages/Chat": "chat",
  "pages/MediaStudio": "media",
  "pages/Teams": "agency",
  "pages/Credits": "billing",
  "pages/Workflows": "workflow",
  "pages/Settings": "settings",
  "pages/Dashboard": "dashboard",
  "pages/Login": "auth",
  "pages/Signup": "auth",
  "pages/ForgotPassword": "auth",
  "pages/AuthCallback": "auth",
  "pages/Help": "help",
  "pages/Marketplace": "marketplace",
  "components/help": "help",
  "components/chat": "chat",
  "components/media": "media",
  "components/agency": "agency",
};

function inferNamespace(filePath) {
  for (const [pattern, ns] of Object.entries(NS_MAP)) {
    if (filePath.includes(pattern)) return ns;
  }
  return "common";
}

// ─── String extraction patterns ───────────────────────────────────────────────
// These regex patterns find hardcoded strings in JSX that should use t()
const PATTERNS = [
  // JSX text content: >Some Text< or > Some Text <
  { re: />(\s*)([A-Z][^<{}\n]{2,80})(\s*)</g, type: "jsx-text" },
  // Placeholder attributes: placeholder="..."
  { re: /placeholder=["']([A-Z][^"']{2,80})["']/g, type: "placeholder" },
  // Title attributes: title="..."
  { re: /\btitle=["']([A-Z][^"']{2,80})["']/g, type: "title" },
  // aria-label attributes
  { re: /aria-label=["']([A-Z][^"']{2,80})["']/g, type: "aria-label" },
  // Button/span text in JSX (without interpolation)
  { re: />\s*([A-Z][a-z][^{}<>\n]{2,60})\s*</g, type: "jsx-content" },
];

// Strings to ignore (UI boilerplate, proper nouns, technical values)
const IGNORE_PATTERNS = [
  /^(SmartAIHub|Google|GitHub|OAuth|API|URL|HTTP|JSON|LLM|AI|ID|OK|PDF|CSV|ZIP)$/i,
  /^[A-Z_]+$/,               // ALL_CAPS constants
  /^\d/,                      // starts with number
  /^[a-z]/,                   // starts with lowercase (already a key or technical)
  /^https?:\/\//,            // URLs
  /\.(ts|tsx|js|mjs)$/,      // file extensions
  /^[A-Z][a-z]+-[A-Z]/,     // kebab/hyphen cases
  /^\w+\.\w+\.\w+/,          // dotted paths (keys already)
];

function shouldIgnore(str) {
  const trimmed = str.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return true;
  if (/^\s*$/.test(trimmed)) return true;
  if (trimmed.includes("{{") || trimmed.includes("${")) return true; // already interpolated
  return IGNORE_PATTERNS.some(p => p.test(trimmed));
}

// Convert string to i18n key: "Hello World" → "hello.world"
function toKey(str, prefix = "") {
  const key = str.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, ".")
    .replace(/\.{2,}/g, ".")
    .substring(0, 40)
    .replace(/\.$/, "");
  return prefix ? `${prefix}.${key}` : key;
}

// ─── Scan file ────────────────────────────────────────────────────────────────
function scanFile(filePath) {
  const source = readFileSync(filePath, "utf-8");
  const relPath = filePath.replace(ROOT + "/", "");
  const ns = getArg("--namespace") || inferNamespace(relPath);
  const findings = [];

  // Check if already using useTranslation
  const hasTranslation = source.includes("useTranslation");
  const hasLegacyI18n = source.includes("useI18n()");

  for (const { re, type } of PATTERNS) {
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(source)) !== null) {
      const raw = match[1] || match[2] || match[3] || "";
      const str = raw.trim();
      if (!shouldIgnore(str)) {
        const line = source.substring(0, match.index).split("\n").length;
        const suggestedKey = toKey(str);
        findings.push({ line, type, str, suggestedKey, ns });
      }
    }
  }

  // Deduplicate by string
  const seen = new Set();
  const unique = findings.filter(f => {
    if (seen.has(f.str)) return false;
    seen.add(f.str);
    return true;
  });

  return { filePath, relPath, ns, hasTranslation, hasLegacyI18n, findings: unique };
}

// ─── Collect files ────────────────────────────────────────────────────────────
function collectFiles(scanPath) {
  const stat = statSync(scanPath);
  if (stat.isFile()) return [scanPath];

  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".") || entry === "__tests__" || entry === "node_modules") continue;
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if ([".tsx", ".ts"].includes(extname(entry)) && !entry.endsWith(".test.tsx")) {
        files.push(full);
      }
    }
  }
  walk(scanPath);
  return files;
}

// ─── Generate JSON keys for a namespace ──────────────────────────────────────
function generateLocaleKeys(allResults) {
  const byNs = {};
  for (const result of allResults) {
    for (const { ns, suggestedKey, str } of result.findings) {
      if (!byNs[ns]) byNs[ns] = {};
      byNs[ns][suggestedKey] = str;
    }
  }
  return byNs;
}

// ─── Patch file: inject useTranslation + wrap strings ────────────────────────
function patchFile(result) {
  const { filePath, findings, ns, hasTranslation, hasLegacyI18n } = result;
  let source = readFileSync(filePath, "utf-8");

  // 1. Add useTranslation import if missing
  if (!hasTranslation) {
    source = source.replace(
      /^(import .*from ['"]react['"]);$/m,
      `$1;\nimport { useTranslation } from 'react-i18next';`
    );
  }

  // 2. Add const { t } = useTranslation() after component function declaration
  if (!source.includes("const { t }") && !source.includes("const {t}")) {
    source = source.replace(
      /^(export (?:default )?function \w+[^{]*\{)/m,
      `$1\n  const { t } = useTranslation('${ns}');`
    );
  }

  // 3. Replace hardcoded strings with t() calls (simple cases only)
  for (const { str, suggestedKey } of findings) {
    // Only replace in safe contexts (jsx text and placeholders)
    const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Replace >"String"< → >{t('key')}<
    source = source.replace(
      new RegExp(`>\\s*${escaped}\\s*<`, "g"),
      `>{t('${suggestedKey}')}<`
    );
    // Replace placeholder="String" → placeholder={t('key')}
    source = source.replace(
      new RegExp(`placeholder=["']${escaped}["']`, "g"),
      `placeholder={t('${suggestedKey}')}`
    );
    // Replace title="String" → title={t('key')}
    source = source.replace(
      new RegExp(`title=["']${escaped}["']`, "g"),
      `title={t('${suggestedKey}')}`
    );
  }

  writeFileSync(filePath, source, "utf-8");
  return source;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const files = collectFiles(SCAN_PATH);
console.log(`\n🔍 Scanning ${files.length} files in ${SCAN_PATH.replace(ROOT + "/", "")}\n`);

const allResults = files.map(scanFile).filter(r => r.findings.length > 0);

if (allResults.length === 0) {
  console.log("✅ No hardcoded strings found! All pages appear to use t() already.");
  process.exit(0);
}

// ─── Report ───────────────────────────────────────────────────────────────────
const report = {
  summary: {
    filesWithHardcodedStrings: allResults.length,
    totalHardcodedStrings: allResults.reduce((s, r) => s + r.findings.length, 0),
    filesUsingLegacyHook: allResults.filter(r => r.hasLegacyI18n).length,
  },
  files: allResults.map(r => ({
    file: r.relPath,
    namespace: r.ns,
    hasTranslation: r.hasTranslation,
    hasLegacyI18n: r.hasLegacyI18n,
    count: r.findings.length,
    strings: r.findings.map(f => ({
      line: f.line,
      type: f.type,
      str: f.str,
      suggestedKey: `${r.ns}:${f.suggestedKey}`,
    })),
  })),
  suggestedLocaleKeys: generateLocaleKeys(allResults),
};

if (OUTPUT_FILE) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`📄 Report written to: ${OUTPUT_FILE}`);
} else {
  console.log(`📊 Summary:`);
  console.log(`   Files with hardcoded strings: ${report.summary.filesWithHardcodedStrings}`);
  console.log(`   Total strings to translate:   ${report.summary.totalHardcodedStrings}`);
  console.log(`   Files still using useI18n():  ${report.summary.filesUsingLegacyHook}`);
  console.log("");

  for (const fileResult of report.files) {
    const icon = fileResult.hasTranslation ? "🔄" : fileResult.hasLegacyI18n ? "🔴" : "⬜";
    console.log(`${icon} ${fileResult.file}  [ns: ${fileResult.namespace}]  ${fileResult.count} strings`);
    for (const { line, str, suggestedKey } of fileResult.strings.slice(0, 5)) {
      console.log(`     L${line}: "${str}" → t('${suggestedKey.split(":")[1]}')`);
    }
    if (fileResult.strings.length > 5) {
      console.log(`     ... and ${fileResult.strings.length - 5} more`);
    }
  }

  console.log(`\n📝 Suggested new locale keys:`);
  for (const [ns, keys] of Object.entries(report.suggestedLocaleKeys)) {
    console.log(`\n   [${ns}]`);
    for (const [key, val] of Object.entries(keys).slice(0, 5)) {
      console.log(`   "${key}": ${JSON.stringify(val)}`);
    }
  }
}

// ─── Patch mode ───────────────────────────────────────────────────────────────
if (MODE === "patch") {
  console.log("\n\n⚡ Applying patches...\n");
  let patched = 0;

  // Write suggested keys to locale files first
  for (const [ns, keys] of Object.entries(report.suggestedLocaleKeys)) {
    const enPath = join(ROOT, `client/src/locales/en/${ns}.json`);
    let existing = {};
    try { existing = JSON.parse(readFileSync(enPath, "utf-8")); } catch {}
    let added = 0;
    for (const [key, val] of Object.entries(keys)) {
      if (!existing[key]) { existing[key] = val; added++; }
    }
    if (added > 0) {
      const sorted = Object.fromEntries(Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(enPath, JSON.stringify(sorted, null, 2) + "\n");
      console.log(`   ✅ Added ${added} keys to locales/en/${ns}.json`);
    }
  }

  // Patch component files
  for (const result of allResults) {
    try {
      patchFile(result);
      console.log(`   ✅ Patched: ${result.relPath}`);
      patched++;
    } catch (err) {
      console.log(`   ❌ Failed: ${result.relPath} — ${err.message}`);
    }
  }

  console.log(`\n✅ Patched ${patched} files`);
  console.log(`\n⚠️  IMPORTANT: Review all changes before committing!`);
  console.log(`   Run: git diff client/src/pages`);
  console.log(`   Then translate new EN keys: node scripts/i18n-auto-translate.mjs`);
}
