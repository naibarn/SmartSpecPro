diff --git a/apps/web/server/routers/presentation.ts b/apps/web/server/routers/presentation.ts
index a11ba36..4dfabd6 100644
--- a/apps/web/server/routers/presentation.ts
+++ b/apps/web/server/routers/presentation.ts
@@ -7,6 +7,7 @@ import {
   PRESENTATION_ERROR_CODE,
   isPresentationFeatureEnabled,
   isPresentationExportWriteEnabled,
+  isPresentationAIGenerationEnabled,
 } from "@shared/presentation/constants";
 import {
   isPresentationItemType,
@@ -99,7 +100,21 @@ function getAvailability(): PresentationAvailability {
     };
   }
 
-  return { enabled: true };
+  return {
+    enabled: true,
+    aiGenerationEnabled: isPresentationAIGenerationEnabled(),
+  };
+}
+
+function ensureAIGenerationEnabled(): void {
+  if (isPresentationAIGenerationEnabled()) {
+    return;
+  }
+
+  throw new PresentationServiceError(
+    PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
+    `${PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED}: AI presentation generation is currently disabled`,
+  );
 }
 
 function ensureFeatureEnabled(): void {
@@ -167,6 +182,17 @@ function mapPresentationServiceError(error: PresentationServiceError): TRPCError
     return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message, cause: error.details });
   }
 
+  if (error.code === PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS) {
+    return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
+  }
+
+  if (
+    error.code === PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED
+    || error.code === PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE
+  ) {
+    return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
+  }
+
   return new TRPCError({ code: "BAD_REQUEST", message: error.message });
 }
 
diff --git a/apps/web/shared/presentation/__tests__/constants.ai.test.ts b/apps/web/shared/presentation/__tests__/constants.ai.test.ts
new file mode 100644
index 0000000..8d54b5c
--- /dev/null
+++ b/apps/web/shared/presentation/__tests__/constants.ai.test.ts
@@ -0,0 +1,131 @@
+import { describe, expect, it, afterEach } from "vitest";
+
+import {
+  PRESENTATION_ERROR_CODE,
+  PRESENTATION_ERROR_CODE_VALUES,
+  PRESENTATION_AI_GENERATION_FLAG_ENV,
+  isPresentationAIGenerationEnabled,
+} from "../constants";
+import { presentationAvailabilitySchema } from "../contracts";
+
+describe("AI error codes in PRESENTATION_ERROR_CODE_VALUES", () => {
+  it("includes PRESENTATION_AI_GENERATION_FAILED", () => {
+    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
+      "PRESENTATION_AI_GENERATION_FAILED",
+    );
+  });
+
+  it("includes PRESENTATION_AI_INSUFFICIENT_CREDITS", () => {
+    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
+      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
+    );
+  });
+
+  it("includes PRESENTATION_AI_INVALID_RESPONSE", () => {
+    expect(PRESENTATION_ERROR_CODE_VALUES).toContain(
+      "PRESENTATION_AI_INVALID_RESPONSE",
+    );
+  });
+
+  it("has matching entries in PRESENTATION_ERROR_CODE object", () => {
+    expect(PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED).toBe(
+      "PRESENTATION_AI_GENERATION_FAILED",
+    );
+    expect(PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS).toBe(
+      "PRESENTATION_AI_INSUFFICIENT_CREDITS",
+    );
+    expect(PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE).toBe(
+      "PRESENTATION_AI_INVALID_RESPONSE",
+    );
+  });
+});
+
+describe("PRESENTATION_AI_GENERATION_FLAG_ENV", () => {
+  it("equals 'PRESENTATION_AI_GENERATION_ENABLED'", () => {
+    expect(PRESENTATION_AI_GENERATION_FLAG_ENV).toBe(
+      "PRESENTATION_AI_GENERATION_ENABLED",
+    );
+  });
+});
+
+describe("isPresentationAIGenerationEnabled()", () => {
+  afterEach(() => {
+    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
+  });
+
+  it("returns false when env var is unset (default OFF)", () => {
+    delete process.env.PRESENTATION_AI_GENERATION_ENABLED;
+    expect(isPresentationAIGenerationEnabled()).toBe(false);
+  });
+
+  it("returns true when env var is 'true'", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "true";
+    expect(isPresentationAIGenerationEnabled()).toBe(true);
+  });
+
+  it("returns true when env var is '1'", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "1";
+    expect(isPresentationAIGenerationEnabled()).toBe(true);
+  });
+
+  it("returns false when env var is 'false'", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "false";
+    expect(isPresentationAIGenerationEnabled()).toBe(false);
+  });
+
+  it("returns false when env var is '0'", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "0";
+    expect(isPresentationAIGenerationEnabled()).toBe(false);
+  });
+
+  it("returns false when env var is 'off'", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "off";
+    expect(isPresentationAIGenerationEnabled()).toBe(false);
+  });
+
+  it("returns false when env var is empty string", () => {
+    process.env.PRESENTATION_AI_GENERATION_ENABLED = "";
+    expect(isPresentationAIGenerationEnabled()).toBe(false);
+  });
+});
+
+describe("presentationAvailabilitySchema with aiGenerationEnabled", () => {
+  it("accepts existing shape without aiGenerationEnabled (backward compat)", () => {
+    const result = presentationAvailabilitySchema.safeParse({
+      enabled: true,
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("accepts shape with aiGenerationEnabled: true", () => {
+    const result = presentationAvailabilitySchema.safeParse({
+      enabled: true,
+      aiGenerationEnabled: true,
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.aiGenerationEnabled).toBe(true);
+    }
+  });
+
+  it("accepts shape with aiGenerationEnabled: false", () => {
+    const result = presentationAvailabilitySchema.safeParse({
+      enabled: true,
+      aiGenerationEnabled: false,
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.aiGenerationEnabled).toBe(false);
+    }
+  });
+
+  it("defaults aiGenerationEnabled to undefined when omitted", () => {
+    const result = presentationAvailabilitySchema.safeParse({
+      enabled: true,
+    });
+    expect(result.success).toBe(true);
+    if (result.success) {
+      expect(result.data.aiGenerationEnabled).toBeUndefined();
+    }
+  });
+});
diff --git a/apps/web/shared/presentation/constants.ts b/apps/web/shared/presentation/constants.ts
index 1f3ce18..118e710 100644
--- a/apps/web/shared/presentation/constants.ts
+++ b/apps/web/shared/presentation/constants.ts
@@ -26,6 +26,9 @@ export const PRESENTATION_ERROR_CODE_VALUES = [
   "PRESENTATION_VALIDATION_FAILED",
   "PRESENTATION_EXPORT_THROTTLED",
   "PRESENTATION_RENDER_SCHEMA_MISMATCH",
+  "PRESENTATION_AI_GENERATION_FAILED",
+  "PRESENTATION_AI_INSUFFICIENT_CREDITS",
+  "PRESENTATION_AI_INVALID_RESPONSE",
 ] as const;
 
 export type PresentationErrorCode = typeof PRESENTATION_ERROR_CODE_VALUES[number];
@@ -45,6 +48,9 @@ export const PRESENTATION_ERROR_CODE: Record<string, PresentationErrorCode> = {
   VALIDATION_FAILED: "PRESENTATION_VALIDATION_FAILED",
   EXPORT_THROTTLED: "PRESENTATION_EXPORT_THROTTLED",
   RENDER_SCHEMA_MISMATCH: "PRESENTATION_RENDER_SCHEMA_MISMATCH",
+  AI_GENERATION_FAILED: "PRESENTATION_AI_GENERATION_FAILED",
+  AI_INSUFFICIENT_CREDITS: "PRESENTATION_AI_INSUFFICIENT_CREDITS",
+  AI_INVALID_RESPONSE: "PRESENTATION_AI_INVALID_RESPONSE",
 };
 
 export const PRESENTATION_CONFLICT_SCHEMA_VERSION = "presentation_conflict_v1";
@@ -56,6 +62,7 @@ export const PRESENTATION_EXPORT_SCHEMA_VERSION = "presentation_export_v1";
 
 export const PRESENTATION_FEATURE_FLAG_ENV = "PRESENTATION_EDITOR_ENABLED";
 export const PRESENTATION_EXPORT_WRITE_FLAG_ENV = "PRESENTATION_EXPORTS_ENABLED";
+export const PRESENTATION_AI_GENERATION_FLAG_ENV = "PRESENTATION_AI_GENERATION_ENABLED";
 
 export function isPresentationFeatureEnabled(): boolean {
   const raw = (process.env[PRESENTATION_FEATURE_FLAG_ENV] || "").trim().toLowerCase();
@@ -74,3 +81,13 @@ export function isPresentationExportWriteEnabled(): boolean {
 
   return !["0", "false", "off", "no", "disabled"].includes(raw);
 }
+
+export function isPresentationAIGenerationEnabled(): boolean {
+  const raw = (process.env[PRESENTATION_AI_GENERATION_FLAG_ENV] || "")
+    .trim()
+    .toLowerCase();
+  if (!raw) {
+    return false; // default OFF — AI generation must be explicitly enabled
+  }
+  return ["1", "true", "on", "yes", "enabled"].includes(raw);
+}
diff --git a/apps/web/shared/presentation/contracts.ts b/apps/web/shared/presentation/contracts.ts
index 768dc4e..b1ad62e 100644
--- a/apps/web/shared/presentation/contracts.ts
+++ b/apps/web/shared/presentation/contracts.ts
@@ -50,6 +50,7 @@ export const presentationAvailabilitySchema = z.object({
   enabled: z.boolean(),
   errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
   message: z.string().optional(),
+  aiGenerationEnabled: z.boolean().optional(),
 });
 
 export const presentationConflictReasonCodeSchema = z.enum([
@@ -192,6 +193,8 @@ export const presentationTextElementSchema = z.object({
   lineHeight: z.number().finite().min(0.6).max(4).optional(),
   letterSpacing: z.number().finite().min(-20).max(100).optional(),
   backgroundColor: z.string().min(1).max(64).optional(),
+  textShadow: z.string().max(256).optional(),
+  textStroke: z.string().max(128).optional(),
 }).strict();
 
 export const presentationImageElementSchema = z.object({
@@ -205,6 +208,8 @@ export const presentationImageElementSchema = z.object({
   rotation: presentationElementRotationSchema.optional(),
   src: z.string().max(4_096),
   alt: z.string().max(512),
+  svgContent: z.string().max(8_192).optional(),
+  svgColor: z.string().max(32).optional(),
 }).strict();
 
 export const presentationVideoElementSchema = z.object({
