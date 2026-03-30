diff --git a/apps/web/package.json b/apps/web/package.json
index 90df6975..3c5af9ea 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -123,6 +123,8 @@
     "framer-motion": "^12.23.22",
     "fuse.js": "^7.1.0",
     "html2canvas": "^1.4.1",
+    "i18next": "^25.10.8",
+    "i18next-resources-to-backend": "^1.2.1",
     "input-otp": "^1.4.2",
     "ioredis": "^5.9.2",
     "jose": "^6.1.0",
@@ -146,6 +148,7 @@
     "react-dom": "^19.2.1",
     "react-helmet-async": "^2.0.5",
     "react-hook-form": "^7.64.0",
+    "react-i18next": "^16.6.5",
     "react-player": "^3.4.0",
     "react-resizable-panels": "^3.0.6",
     "react-syntax-highlighter": "^16.1.0",
diff --git a/apps/web/shared/__tests__/i18n.test.ts b/apps/web/shared/__tests__/i18n.test.ts
new file mode 100644
index 00000000..fa42d860
--- /dev/null
+++ b/apps/web/shared/__tests__/i18n.test.ts
@@ -0,0 +1,80 @@
+import { describe, expect, it } from "vitest";
+import {
+  DEFAULT_LANGUAGE,
+  LANGUAGE_COVERAGE,
+  LANGUAGE_LABELS,
+  LANGUAGE_LABELS_EN,
+  RTL_LANGUAGES,
+  SUPPORTED_LANGUAGES,
+} from "../i18n";
+
+describe("shared/i18n constants", () => {
+  it("SUPPORTED_LANGUAGES has exactly 19 entries", () => {
+    expect(SUPPORTED_LANGUAGES).toHaveLength(19);
+  });
+
+  it("first entry is English", () => {
+    expect(SUPPORTED_LANGUAGES[0]).toBe("en");
+  });
+
+  it("includes Thai", () => {
+    expect(SUPPORTED_LANGUAGES).toContain("th");
+  });
+
+  it("DEFAULT_LANGUAGE is en", () => {
+    expect(DEFAULT_LANGUAGE).toBe("en");
+  });
+
+  it("RTL_LANGUAGES includes ar", () => {
+    expect(RTL_LANGUAGES).toContain("ar");
+  });
+
+  it("RTL_LANGUAGES does not include en", () => {
+    expect(RTL_LANGUAGES).not.toContain("en");
+  });
+
+  it("LANGUAGE_LABELS has non-empty string for every supported language", () => {
+    for (const lang of SUPPORTED_LANGUAGES) {
+      expect(LANGUAGE_LABELS[lang]).toBeTruthy();
+      expect(typeof LANGUAGE_LABELS[lang]).toBe("string");
+    }
+  });
+
+  it("LANGUAGE_LABELS_EN has non-empty string for every supported language", () => {
+    for (const lang of SUPPORTED_LANGUAGES) {
+      expect(LANGUAGE_LABELS_EN[lang]).toBeTruthy();
+      expect(typeof LANGUAGE_LABELS_EN[lang]).toBe("string");
+    }
+  });
+
+  it("LANGUAGE_COVERAGE has numeric 0-100 entry for every supported language", () => {
+    for (const lang of SUPPORTED_LANGUAGES) {
+      const val = LANGUAGE_COVERAGE[lang];
+      expect(typeof val).toBe("number");
+      expect(val).toBeGreaterThanOrEqual(0);
+      expect(val).toBeLessThanOrEqual(100);
+    }
+  });
+
+  it("English coverage is 100", () => {
+    expect(LANGUAGE_COVERAGE["en"]).toBe(100);
+  });
+
+  it("all codes match BCP-47 pattern", () => {
+    const bcp47 = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;
+    for (const lang of SUPPORTED_LANGUAGES) {
+      expect(lang).toMatch(bcp47);
+    }
+  });
+
+  it("no duplicate entries", () => {
+    const unique = new Set(SUPPORTED_LANGUAGES);
+    expect(unique.size).toBe(SUPPORTED_LANGUAGES.length);
+  });
+
+  it("every RTL language is in SUPPORTED_LANGUAGES", () => {
+    for (const rtl of RTL_LANGUAGES) {
+      expect(SUPPORTED_LANGUAGES).toContain(rtl);
+    }
+  });
+});
diff --git a/apps/web/shared/i18n.ts b/apps/web/shared/i18n.ts
new file mode 100644
index 00000000..d20a7903
--- /dev/null
+++ b/apps/web/shared/i18n.ts
@@ -0,0 +1,81 @@
+// Security: Translation values MUST be plain text only. No HTML markup.
+// Language codes are validated against SUPPORTED_LANGUAGES on both client and server.
+// See spec 062 Security Requirements S1.
+
+export const SUPPORTED_LANGUAGES = [
+  "en", "th", "ja", "ar", "zh-Hans", "zh-Hant", "ko", "vi", "id", "hi",
+  "es", "pt-BR", "fr", "de", "ru", "it", "tr", "nl", "pl",
+] as const;
+
+export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
+
+export const RTL_LANGUAGES = ["ar"] as const;
+export type RtlLanguage = (typeof RTL_LANGUAGES)[number];
+
+export const DEFAULT_LANGUAGE: SupportedLanguage = "en" as const;
+
+export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
+  en: "English",
+  th: "ไทย",
+  ja: "日本語",
+  ar: "العربية",
+  "zh-Hans": "简体中文",
+  "zh-Hant": "繁體中文",
+  ko: "한국어",
+  vi: "Tiếng Việt",
+  id: "Bahasa Indonesia",
+  hi: "हिन्दी",
+  es: "Español",
+  "pt-BR": "Português (Brasil)",
+  fr: "Français",
+  de: "Deutsch",
+  ru: "Русский",
+  it: "Italiano",
+  tr: "Türkçe",
+  nl: "Nederlands",
+  pl: "Polski",
+};
+
+export const LANGUAGE_LABELS_EN: Record<SupportedLanguage, string> = {
+  en: "English",
+  th: "Thai",
+  ja: "Japanese",
+  ar: "Arabic",
+  "zh-Hans": "Chinese (Simplified)",
+  "zh-Hant": "Chinese (Traditional)",
+  ko: "Korean",
+  vi: "Vietnamese",
+  id: "Indonesian",
+  hi: "Hindi",
+  es: "Spanish",
+  "pt-BR": "Portuguese (Brazil)",
+  fr: "French",
+  de: "German",
+  ru: "Russian",
+  it: "Italian",
+  tr: "Turkish",
+  nl: "Dutch",
+  pl: "Polish",
+};
+
+export const LANGUAGE_COVERAGE: Record<SupportedLanguage, number> = {
+  en: 100,
+  th: 15,
+  ja: 0,
+  ar: 0,
+  "zh-Hans": 0,
+  "zh-Hant": 0,
+  ko: 0,
+  vi: 0,
+  id: 0,
+  hi: 0,
+  es: 0,
+  "pt-BR": 0,
+  fr: 0,
+  de: 0,
+  ru: 0,
+  it: 0,
+  tr: 0,
+  nl: 0,
+  pl: 0,
+};
diff --git a/apps/web/vite.config.ts b/apps/web/vite.config.ts
index 3901b880..a9c26acb 100644
--- a/apps/web/vite.config.ts
+++ b/apps/web/vite.config.ts
@@ -98,6 +98,14 @@ export default defineConfig({
           if (id.includes("node_modules/xlsx/")) {
             return "vendor-xlsx";
           }
+          // i18n runtime
+          if (
+            id.includes("node_modules/i18next/") ||
+            id.includes("node_modules/react-i18next/") ||
+            id.includes("node_modules/i18next-resources-to-backend/")
+          ) {
+            return "vendor-i18n";
+          }
         },
       },
     },
