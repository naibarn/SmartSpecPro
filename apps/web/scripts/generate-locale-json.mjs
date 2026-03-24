#!/usr/bin/env node
/**
 * Script: generate-locale-json.mjs
 * Transforms en.ts / th.ts flat key dictionaries into namespaced JSON files
 * under client/src/locales/{en,th}/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..");
const LOCALES_SRC = join(WEB_ROOT, "client/src/lib/i18n/locales");
const OUT_ROOT = join(WEB_ROOT, "client/src/locales");

// Namespace mapping: source prefix → target JSON file (without .json)
const NAMESPACE_MAP = {
  help: "help",
  bsHelp: "help",        // Browser-session help → merged into help.json as bs.* sub-namespace
  chat: "chat",
  settings: "settings",
  mediaStudio: "media",
  credits: "billing",
  workflows: "workflow",
  notifications: "common",
  common: "common",
  invite: "admin",
  editor: "presentation",
  teams: "agency",
  orchestrator: "agency",
};

// Prefixes that get a sub-namespace prefix in the target file to avoid collisions
// bsHelp.title → "bs.title" in help.json (prevents collision with help.title)
const SUBNAMESPACE_PREFIX = {
  bsHelp: "bs",
};

/** Parse a .ts locale file → flat Record<string, string> */
function parseLocaleTs(filepath) {
  const src = readFileSync(filepath, "utf-8");
  const result = {};

  // Strategy: find each key-value pair.
  // Keys are always: "some.key":
  // Values are either:
  //   - on the same line: "some.key": "value",
  //   - on the next line: "some.key":\n    "value",
  // Values can span multiple lines via string concatenation with +
  //   "key": "part1" +
  //     "part2",
  // We handle all these cases.

  // First, collapse the source into a manageable form.
  // We use a state machine over characters.

  // Simpler approach: use regex to find all "key": followed by string content
  // The regex handles: key on one line, value on same or next lines
  // Matches: "key": "value" (single line)
  // or: "key":\n    "value" (value on next line)
  // or: "key":\n    "value1" +\n      "value2" (multiline concatenation)

  // We'll process line by line but with a lookahead buffer approach
  const lines = src.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for a key definition: starts with spaces, then "key":
    const keyMatch = line.match(/^\s+"([^"]+)":\s*/);
    if (!keyMatch) { i++; continue; }

    const key = keyMatch[1];
    // Don't process TypeScript-only keys (like object spread, etc.)
    if (!key.includes(".")) { i++; continue; }

    // Collect value: everything after the key on the same line, then subsequent lines
    let rest = line.substring(keyMatch[0].length);
    let value = "";

    // Parse value from rest + potentially following lines
    const parsed = parseValue(rest, lines, i);
    if (parsed !== null) {
      value = parsed.value;
      i = parsed.nextLine;
      result[key] = value;
    } else {
      i++;
    }
  }

  return result;
}

/**
 * Parse a value starting from `rest` (remainder of current line after "key": )
 * Returns { value: string, nextLine: number } or null
 */
function parseValue(rest, lines, lineIdx) {
  // Skip leading whitespace
  rest = rest.trimStart();

  if (rest.startsWith('"')) {
    // Inline string value
    return parseQuotedString(rest, lines, lineIdx);
  } else if (rest === "" || rest.startsWith("//")) {
    // Value on next line(s)
    let nextLine = lineIdx + 1;
    while (nextLine < lines.length) {
      const nextRest = lines[nextLine].trimStart();
      if (nextRest.startsWith('"')) {
        return parseQuotedString(nextRest, lines, nextLine);
      } else if (nextRest === "" || nextRest.startsWith("//")) {
        nextLine++;
      } else {
        break;
      }
    }
  }
  return null;
}

/**
 * Parse a (possibly multi-line concatenated) quoted string starting from `rest`
 * which begins with a `"`. Handles `"part1" + "part2"` continuation.
 */
function parseQuotedString(rest, lines, lineIdx) {
  let value = "";
  let pos = 0;
  let currentLine = rest;
  let currentLineIdx = lineIdx;

  while (true) {
    // Must start with "
    if (currentLine[pos] !== '"') break;
    pos++; // skip opening "

    // Read until closing " (respecting escapes)
    let segment = "";
    while (pos < currentLine.length) {
      const ch = currentLine[pos];
      if (ch === "\\") {
        const next = currentLine[pos + 1];
        if (next === "n") { segment += "\n"; pos += 2; }
        else if (next === "t") { segment += "\t"; pos += 2; }
        else if (next === '"') { segment += '"'; pos += 2; }
        else if (next === "\\") { segment += "\\"; pos += 2; }
        else { segment += next || ""; pos += 2; }
      } else if (ch === '"') {
        pos++; // skip closing "
        value += segment;
        break;
      } else {
        segment += ch;
        pos++;
      }
    }

    // Skip whitespace after closing "
    while (pos < currentLine.length && (currentLine[pos] === " " || currentLine[pos] === "\t")) pos++;

    // Check for continuation: ,  or + or end of line
    if (pos < currentLine.length && currentLine[pos] === "+") {
      // Concatenation on same or next line
      pos++;
      while (pos < currentLine.length && (currentLine[pos] === " " || currentLine[pos] === "\t")) pos++;
      if (pos < currentLine.length) {
        // Continue parsing on same line
        currentLine = currentLine.substring(pos);
        pos = 0;
        continue;
      } else {
        // Value continues on next line
        currentLineIdx++;
        if (currentLineIdx >= lines.length) break;
        currentLine = lines[currentLineIdx].trimStart();
        pos = 0;
        continue;
      }
    } else {
      // Done: comma or end of line
      return { value, nextLine: currentLineIdx + 1 };
    }
  }

  return null;
}

/** Assign a key to a namespace file */
function keyToNamespace(key) {
  const dot = key.indexOf(".");
  if (dot < 0) return "common";
  const prefix = key.substring(0, dot);
  const ns = NAMESPACE_MAP[prefix];
  if (!ns) {
    console.warn(`[generate-locale-json] Unmapped prefix: "${prefix}" (key: "${key}") — skipping`);
    return "misc";
  }
  return ns;
}

/** Strip source prefix from key; add sub-namespace prefix if needed to prevent collisions */
function stripPrefix(key) {
  const dot = key.indexOf(".");
  if (dot < 0) return key;
  const prefix = key.substring(0, dot);
  const rest = key.substring(dot + 1);
  const subPrefix = SUBNAMESPACE_PREFIX[prefix];
  if (subPrefix) {
    // e.g. bsHelp.title → bs.title
    return `${subPrefix}.${rest}`;
  }
  return rest;
}

/** Write JSON file, sorted keys */
function writeJson(filepath, data) {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(filepath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");
}

function processLocale(lang) {
  const srcFile = join(LOCALES_SRC, `${lang}.ts`);
  const flat = parseLocaleTs(srcFile);
  const outDir = join(OUT_ROOT, lang);
  mkdirSync(outDir, { recursive: true });

  // Group by namespace
  const groups = {};
  for (const [key, value] of Object.entries(flat)) {
    const ns = keyToNamespace(key);
    if (!groups[ns]) groups[ns] = {};
    if (ns === "misc") continue; // skip unmapped keys
    const stripped = stripPrefix(key);
    groups[ns][stripped] = value;
  }

  // Write namespace files
  for (const [ns, data] of Object.entries(groups)) {
    writeJson(join(outDir, `${ns}.json`), data);
  }

  // Write empty placeholders for standard namespaces
  const allNs = ["agency", "marketplace", "profile", "social", "dashboard"];
  for (const ns of allNs) {
    if (!groups[ns]) {
      writeJson(join(outDir, `${ns}.json`), {});
    }
  }

  const totalKeys = Object.keys(flat).length;
  const outputKeys = Object.values(groups).reduce((sum, g) => sum + Object.keys(g).length, 0);
  const fileCount = Object.keys(groups).length + allNs.filter(ns => !groups[ns]).length;
  console.log(`${lang}: ${totalKeys} source keys → ${outputKeys} output keys across ${fileCount} files`);
  return { totalKeys, outputKeys, groups };
}

// Process both locales
const en = processLocale("en");
const th = processLocale("th");

// Ensure th has all en namespace files (empty if missing)
for (const ns of Object.keys(en.groups)) {
  const thFile = join(OUT_ROOT, "th", `${ns}.json`);
  if (!existsSync(thFile)) {
    writeJson(thFile, {});
  }
}

// Create new Wave 1 files: nav.json, auth.json, errors.json
const newNavEn = {
  "header.notifications": "Notifications",
  "header.profile": "Profile",
  "header.search": "Search",
  "header.signOut": "Sign out",
  "navbar.features": "Features",
  "navbar.getStarted": "Get Started",
  "navbar.home": "Home",
  "navbar.pricing": "Pricing",
  "navbar.signIn": "Sign In",
  "sidebar.agencies": "Agencies",
  "sidebar.chat": "Chat",
  "sidebar.credits": "Credits",
  "sidebar.dashboard": "Dashboard",
  "sidebar.library": "Library",
  "sidebar.mediaStudio": "Media Studio",
  "sidebar.presentations": "Presentations",
  "sidebar.settings": "Settings",
  "sidebar.teams": "Teams",
  "sidebar.workflows": "Workflows",
};

const newNavTh = {
  "header.notifications": "การแจ้งเตือน",
  "header.profile": "โปรไฟล์",
  "header.search": "ค้นหา",
  "header.signOut": "ออกจากระบบ",
  "navbar.features": "ฟีเจอร์",
  "navbar.getStarted": "เริ่มต้นใช้งาน",
  "navbar.home": "หน้าหลัก",
  "navbar.pricing": "ราคา",
  "navbar.signIn": "เข้าสู่ระบบ",
  "sidebar.agencies": "เอเจนซี",
  "sidebar.chat": "แชท",
  "sidebar.credits": "เครดิต",
  "sidebar.dashboard": "แดชบอร์ด",
  "sidebar.library": "ไลบรารี",
  "sidebar.mediaStudio": "มีเดียสตูดิโอ",
  "sidebar.presentations": "งานนำเสนอ",
  "sidebar.settings": "การตั้งค่า",
  "sidebar.teams": "ทีม",
  "sidebar.workflows": "เวิร์กโฟลว์",
};

const newAuthEn = {
  "callback.error": "Authentication failed. Please try again.",
  "callback.processing": "Processing your sign-in\u2026",
  "mfa.codeLabel": "Authentication Code",
  "mfa.submitButton": "Verify",
  "mfa.title": "Two-Factor Authentication",
  "resetPassword.emailLabel": "Email Address",
  "resetPassword.submitButton": "Send Reset Link",
  "resetPassword.title": "Reset Password",
  "signIn.createAccount": "Create account",
  "signIn.emailLabel": "Email",
  "signIn.forgotPassword": "Forgot password?",
  "signIn.noAccount": "Don't have an account?",
  "signIn.passwordLabel": "Password",
  "signIn.submitButton": "Sign In",
  "signIn.title": "Sign In",
  "signUp.createAccount": "Create Account",
  "signUp.email": "Email",
  "signUp.password": "Password",
  "signUp.title": "Create Account",
};

const newAuthTh = {
  "callback.error": "การยืนยันตัวตนล้มเหลว กรุณาลองใหม่",
  "callback.processing": "กำลังดำเนินการลงชื่อเข้าใช้\u2026",
  "mfa.codeLabel": "รหัสยืนยัน",
  "mfa.submitButton": "ยืนยัน",
  "mfa.title": "การยืนยันตัวตนสองขั้นตอน",
  "resetPassword.emailLabel": "ที่อยู่อีเมล",
  "resetPassword.submitButton": "ส่งลิงก์รีเซ็ต",
  "resetPassword.title": "รีเซ็ตรหัสผ่าน",
  "signIn.createAccount": "สร้างบัญชี",
  "signIn.emailLabel": "อีเมล",
  "signIn.forgotPassword": "ลืมรหัสผ่าน?",
  "signIn.noAccount": "ยังไม่มีบัญชี?",
  "signIn.passwordLabel": "รหัสผ่าน",
  "signIn.submitButton": "เข้าสู่ระบบ",
  "signIn.title": "เข้าสู่ระบบ",
  "signUp.createAccount": "สร้างบัญชี",
  "signUp.email": "อีเมล",
  "signUp.password": "รหัสผ่าน",
  "signUp.title": "สร้างบัญชี",
};

const newErrorsEn = {
  "forbidden.message": "You don't have permission to access this resource.",
  "forbidden.title": "Access Forbidden",
  "generic.somethingWentWrong": "Something went wrong. Please try again.",
  "generic.tryAgain": "Try Again",
  "networkError": "Network error. Please check your connection.",
  "notFound.message": "The page you're looking for doesn't exist.",
  "notFound.title": "Page Not Found",
  "requestFailed": "The request failed. Please try again.",
  "serverError.message": "An internal server error occurred.",
  "serverError.title": "Server Error",
  "session.expired": "Your session has expired. Please sign in again.",
  "validation.invalidEmail": "Please enter a valid email address.",
  "validation.passwordTooShort": "Password must be at least 8 characters.",
  "validation.required": "This field is required.",
};

const newErrorsTh = {
  "forbidden.message": "คุณไม่มีสิทธิ์เข้าถึงทรัพยากรนี้",
  "forbidden.title": "การเข้าถึงถูกปฏิเสธ",
  "generic.somethingWentWrong": "เกิดข้อผิดพลาด กรุณาลองใหม่",
  "generic.tryAgain": "ลองใหม่",
  "networkError": "ข้อผิดพลาดเครือข่าย กรุณาตรวจสอบการเชื่อมต่อ",
  "notFound.message": "ไม่พบหน้าที่คุณกำลังค้นหา",
  "notFound.title": "ไม่พบหน้า",
  "requestFailed": "คำขอล้มเหลว กรุณาลองใหม่",
  "serverError.message": "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
  "serverError.title": "ข้อผิดพลาดเซิร์ฟเวอร์",
  "session.expired": "เซสชันของคุณหมดอายุ กรุณาลงชื่อเข้าใช้ใหม่",
  "validation.invalidEmail": "กรุณากรอกที่อยู่อีเมลที่ถูกต้อง",
  "validation.passwordTooShort": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร",
  "validation.required": "จำเป็นต้องกรอกข้อมูลในช่องนี้",
};

writeJson(join(OUT_ROOT, "en/nav.json"), newNavEn);
writeJson(join(OUT_ROOT, "th/nav.json"), newNavTh);
writeJson(join(OUT_ROOT, "en/auth.json"), newAuthEn);
writeJson(join(OUT_ROOT, "th/auth.json"), newAuthTh);
writeJson(join(OUT_ROOT, "en/errors.json"), newErrorsEn);
writeJson(join(OUT_ROOT, "th/errors.json"), newErrorsTh);

// Ensure common.json has required keys
function ensureCommonKeys(langFile, requiredKeys) {
  let data = {};
  try { data = JSON.parse(readFileSync(langFile, "utf-8")); } catch {}
  for (const [k, v] of Object.entries(requiredKeys)) {
    if (data[k] === undefined || data[k] === null) data[k] = v;
  }
  writeJson(langFile, data);
}

const requiredCommonEn = {
  "active": "Active",
  "back": "Back",
  "cancel": "Cancel",
  "close": "Close",
  "confirm": "Confirm",
  "confirmDialog.irreversible": "This action cannot be undone.",
  "confirmDialog.title": "Are you sure?",
  "copy": "Copy",
  "copied": "Copied!",
  "create": "Create",
  "delete": "Delete",
  "deselectAll": "Deselect All",
  "download": "Download",
  "edit": "Edit",
  "emptyState.noItems": "No items found.",
  "emptyState.noResults": "No results for your search.",
  "emptyState.nothingYet": "Nothing here yet.",
  "error": "Error",
  "export": "Export",
  "filter": "Filter",
  "import": "Import",
  "inactive": "Inactive",
  "loading": "Loading\u2026",
  "next": "Next",
  "ok": "OK",
  "optional": "Optional",
  "pagination.next": "Next",
  "pagination.page": "Page {{page}}",
  "pagination.previous": "Previous",
  "pagination.showing": "Showing {{from}}\u2013{{to}} of {{total}}",
  "pending": "Pending",
  "refresh": "Refresh",
  "required": "Required",
  "retry": "Retry",
  "save": "Save",
  "search": "Search",
  "selectAll": "Select All",
  "showLess": "Show Less",
  "showMore": "Show More",
  "sort": "Sort",
  "submit": "Submit",
  "success": "Success",
  "toast.copied": "Copied to clipboard",
  "toast.created": "Created successfully",
  "toast.deleted": "Deleted successfully",
  "toast.failed": "Operation failed",
  "toast.saved": "Saved successfully",
  "upload": "Upload",
  "yes": "Yes",
  "no": "No",
};

const requiredCommonTh = {
  "active": "ใช้งานอยู่",
  "back": "กลับ",
  "cancel": "ยกเลิก",
  "close": "ปิด",
  "confirm": "ยืนยัน",
  "confirmDialog.irreversible": "การกระทำนี้ไม่สามารถย้อนกลับได้",
  "confirmDialog.title": "คุณแน่ใจหรือไม่?",
  "copy": "คัดลอก",
  "copied": "คัดลอกแล้ว!",
  "create": "สร้าง",
  "delete": "ลบ",
  "deselectAll": "ยกเลิกการเลือกทั้งหมด",
  "download": "ดาวน์โหลด",
  "edit": "แก้ไข",
  "emptyState.noItems": "ไม่พบรายการ",
  "emptyState.noResults": "ไม่พบผลลัพธ์",
  "emptyState.nothingYet": "ยังไม่มีข้อมูล",
  "error": "ข้อผิดพลาด",
  "export": "ส่งออก",
  "filter": "กรอง",
  "import": "นำเข้า",
  "inactive": "ไม่ใช้งาน",
  "loading": "กำลังโหลด\u2026",
  "next": "ถัดไป",
  "ok": "ตกลง",
  "optional": "ไม่บังคับ",
  "pagination.next": "ถัดไป",
  "pagination.page": "หน้า {{page}}",
  "pagination.previous": "ก่อนหน้า",
  "pagination.showing": "แสดง {{from}}\u2013{{to}} จาก {{total}}",
  "pending": "รอดำเนินการ",
  "refresh": "รีเฟรช",
  "required": "จำเป็น",
  "retry": "ลองใหม่",
  "save": "บันทึก",
  "search": "ค้นหา",
  "selectAll": "เลือกทั้งหมด",
  "showLess": "แสดงน้อยลง",
  "showMore": "แสดงเพิ่มเติม",
  "sort": "เรียงลำดับ",
  "submit": "ส่ง",
  "success": "สำเร็จ",
  "toast.copied": "คัดลอกไปยังคลิปบอร์ด",
  "toast.created": "สร้างสำเร็จ",
  "toast.deleted": "ลบสำเร็จ",
  "toast.failed": "การดำเนินการล้มเหลว",
  "toast.saved": "บันทึกสำเร็จ",
  "upload": "อัปโหลด",
  "yes": "ใช่",
  "no": "ไม่",
};

ensureCommonKeys(join(OUT_ROOT, "en/common.json"), requiredCommonEn);
ensureCommonKeys(join(OUT_ROOT, "th/common.json"), requiredCommonTh);

console.log("\nDone! Locale JSON files written to client/src/locales/");
