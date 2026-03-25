diff --git a/apps/web/server/routers/__tests__/users.i18n.test.ts b/apps/web/server/routers/__tests__/users.i18n.test.ts
new file mode 100644
index 00000000..12b6cdd9
--- /dev/null
+++ b/apps/web/server/routers/__tests__/users.i18n.test.ts
@@ -0,0 +1,55 @@
+/**
+ * Tests for section-07: server-side language allowlist on updatePreferences.
+ * Validates the Zod schema directly — no full tRPC context needed.
+ */
+
+import { describe, it, expect } from "vitest";
+import { z } from "zod";
+import { SUPPORTED_LANGUAGES } from "@shared/i18n";
+
+const updatePreferencesSchema = z.object({
+  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
+  translationModel: z.string().max(100).optional(),
+});
+
+describe("updatePreferences schema — translationLanguage allowlist", () => {
+  it("accepts translationLanguage='en'", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "en" }).success).toBe(true);
+  });
+
+  it("accepts translationLanguage='th'", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "th" }).success).toBe(true);
+  });
+
+  it("accepts translationLanguage='ja'", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "ja" }).success).toBe(true);
+  });
+
+  it("accepts translationLanguage='zh-Hans' (BCP-47 subtag)", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "zh-Hans" }).success).toBe(true);
+  });
+
+  it("accepts translationLanguage='pt-BR' (BCP-47 region)", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "pt-BR" }).success).toBe(true);
+  });
+
+  it("rejects translationLanguage='invalid'", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "invalid" }).success).toBe(false);
+  });
+
+  it("rejects translationLanguage='<script>' (XSS attempt)", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "<script>" }).success).toBe(false);
+  });
+
+  it("rejects translationLanguage='en; DROP TABLE users' (SQL injection)", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: "en; DROP TABLE users" }).success).toBe(false);
+  });
+
+  it("accepts translationLanguage=undefined (optional field)", () => {
+    expect(updatePreferencesSchema.safeParse({ translationLanguage: undefined }).success).toBe(true);
+  });
+
+  it("accepts empty object {} (all fields optional)", () => {
+    expect(updatePreferencesSchema.safeParse({}).success).toBe(true);
+  });
+});
diff --git a/apps/web/server/routers/help.ts b/apps/web/server/routers/help.ts
index 1b753bb2..2201f261 100644
--- a/apps/web/server/routers/help.ts
+++ b/apps/web/server/routers/help.ts
@@ -14,30 +14,31 @@ import {
   getHelpSearchIndex,
   getContextualHelpTopics,
 } from "../services/helpContentService";
+import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
 
 export const helpRouter = router({
   getManifest: publicProcedure
-    .input(z.object({ locale: z.enum(["en", "th"]).default("en") }))
+    .input(z.object({ locale: z.enum(SUPPORTED_LANGUAGES).default("en") }))
     .query(async ({ input }) => getHelpManifest(input.locale)),
 
   getTopic: publicProcedure
     .input(
       z.object({
         slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Invalid slug format"),
-        locale: z.enum(["en", "th"]).default("en"),
+        locale: z.enum(SUPPORTED_LANGUAGES).default("en"),
       }),
     )
     .query(async ({ input }) => getHelpTopic(input.slug, input.locale)),
 
   getSearchIndex: publicProcedure
-    .input(z.object({ locale: z.enum(["en", "th"]).default("en") }))
+    .input(z.object({ locale: z.enum(SUPPORTED_LANGUAGES).default("en") }))
     .query(async ({ input }) => getHelpSearchIndex(input.locale)),
 
   getContextualTopics: publicProcedure
     .input(
       z.object({
         page: z.string().min(1),
-        locale: z.enum(["en", "th"]).default("en"),
+        locale: z.enum(SUPPORTED_LANGUAGES).default("en"),
       }),
     )
     .query(async ({ input }) => getContextualHelpTopics(input.page, input.locale)),
diff --git a/apps/web/server/routers/translation.ts b/apps/web/server/routers/translation.ts
index d90bb0f9..0655e25a 100644
--- a/apps/web/server/routers/translation.ts
+++ b/apps/web/server/routers/translation.ts
@@ -5,6 +5,7 @@
 
 import { z } from "zod";
 import { router, protectedProcedure } from "../_core/trpc";
+import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
 import { getDb } from "../db";
 import { users } from "../../drizzle/schema";
 import { eq } from "drizzle-orm";
@@ -53,7 +54,8 @@ export const translationRouter = router({
         .limit(1);
 
       const prefs = (user?.userPreferences as Record<string, any>) || {};
-      const targetLang = input.targetLanguage || prefs.translationLanguage || "th";
+      const rawLang = input.targetLanguage || prefs.translationLanguage || "th";
+      const targetLang = (SUPPORTED_LANGUAGES as readonly string[]).includes(rawLang) ? rawLang : "en";
       const langName = LANGUAGE_NAMES[targetLang] || targetLang;
 
       // Run planner (returns null if disabled — zero overhead)
diff --git a/apps/web/server/routers/users.ts b/apps/web/server/routers/users.ts
index a694e58c..b8e45d61 100644
--- a/apps/web/server/routers/users.ts
+++ b/apps/web/server/routers/users.ts
@@ -11,6 +11,7 @@ import { eq, desc, like, or, sql, and } from "drizzle-orm";
 import { addCredits, deductCredits, type TransactionType } from "../services/creditService";
 import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
 import { browserPolicyUserProfileSchema } from "../../shared/browserPolicy";
+import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
 import {
   resolveEffectiveUserAutomationPolicy,
   updateUserBrowserPolicyProfile,
@@ -753,7 +754,7 @@ export const usersRouter = router({
 
   updatePreferences: protectedProcedure
     .input(z.object({
-      translationLanguage: z.string().max(10).optional(),
+      translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
       translationModel: z.string().max(100).optional(),
     }))
     .mutation(async ({ ctx, input }) => {
