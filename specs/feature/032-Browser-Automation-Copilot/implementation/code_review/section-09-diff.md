diff --git a/apps/web/server/__tests__/responsesAudit.test.ts b/apps/web/server/__tests__/responsesAudit.test.ts
new file mode 100644
index 0000000..7194901
--- /dev/null
+++ b/apps/web/server/__tests__/responsesAudit.test.ts
@@ -0,0 +1,103 @@
+/**
+ * Tests for Responses API audit events and store=false enforcement.
+ *
+ * Tests:
+ * - store=true in request body -> overridden to false
+ * - store field absent -> defaults to false
+ * - sanitizeToolOutputForLLM strips HTML
+ */
+
+// ── Env stubs (MUST be before any imports) ──────────────────
+process.env.JWT_SECRET =
+  process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";
+process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token-value";
+process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID = "99";
+
+import { describe, it, expect, vi } from "vitest";
+
+// Mock authz to prevent tokens.ts from crashing
+vi.mock("../_core/authz", () => ({
+  authorizeRequest: vi.fn().mockResolvedValue({ ok: true, userId: 42 }),
+}));
+
+import { sanitizeResponsesBody, sanitizeToolOutputForLLM } from "../_core/responsesRoutes";
+
+describe("sanitizeResponsesBody — store=false enforcement", () => {
+  const validBase = {
+    model: "gpt-4o",
+    input: [{ role: "user", content: "hello" }],
+  };
+
+  it("overrides store=true to false", () => {
+    const result = sanitizeResponsesBody({ ...validBase, store: true });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(false);
+    }
+  });
+
+  it("overrides store=true always (ZDR compliance)", () => {
+    const result = sanitizeResponsesBody({ ...validBase, store: true });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(false);
+    }
+  });
+
+  it("defaults store to false when absent", () => {
+    const result = sanitizeResponsesBody({ ...validBase });
+    expect(result.ok).toBe(true);
+    if (result.ok) {
+      expect(result.body.store).toBe(false);
+    }
+  });
+
+  it("rejects missing model", () => {
+    const result = sanitizeResponsesBody({ input: [{ role: "user", content: "hi" }] });
+    expect(result.ok).toBe(false);
+  });
+
+  it("rejects missing input", () => {
+    const result = sanitizeResponsesBody({ model: "gpt-4o" });
+    expect(result.ok).toBe(false);
+  });
+});
+
+describe("sanitizeToolOutputForLLM — HTML stripping", () => {
+  it("strips script tags and content", () => {
+    const input = "Hello <script>alert('xss')</script> World";
+    const result = sanitizeToolOutputForLLM(input);
+    expect(result).not.toContain("<script>");
+    expect(result).toContain("Hello");
+    expect(result).toContain("World");
+  });
+
+  it("strips iframe tags", () => {
+    const input = '<iframe src="evil.com"></iframe> Safe';
+    const result = sanitizeToolOutputForLLM(input);
+    expect(result).not.toContain("<iframe");
+    expect(result).toContain("Safe");
+  });
+
+  it("strips event handler attributes", () => {
+    const input = '<img onerror="evil()" src="x"> text';
+    const result = sanitizeToolOutputForLLM(input);
+    expect(result).not.toContain("onerror");
+  });
+
+  it("preserves plain text", () => {
+    const input = "Just plain text with no HTML";
+    const result = sanitizeToolOutputForLLM(input);
+    expect(result).toBe(input);
+  });
+
+  it("truncates extremely long output", () => {
+    const input = "A".repeat(60_000);
+    const result = sanitizeToolOutputForLLM(input);
+    expect(result.length).toBeLessThanOrEqual(50_001);
+  });
+
+  it("handles empty string", () => {
+    expect(sanitizeToolOutputForLLM("")).toBe("");
+  });
+});
diff --git a/apps/web/server/__tests__/responsesRoutes.test.ts b/apps/web/server/__tests__/responsesRoutes.test.ts
index 46ee033..dfdb02d 100644
--- a/apps/web/server/__tests__/responsesRoutes.test.ts
+++ b/apps/web/server/__tests__/responsesRoutes.test.ts
@@ -205,10 +205,9 @@ describe("sanitizeResponsesBody", () => {
     }
   });
 
-  it("overrides store=true when tenant disallows", () => {
+  it("always overrides store=true to false (ZDR compliance)", () => {
     const result = sanitizeResponsesBody(
       { model: "gpt-5.4", input: [{ role: "user", content: "hi" }], store: true },
-      false,
     );
     expect(result.ok).toBe(true);
     if (result.ok) {
@@ -216,17 +215,6 @@ describe("sanitizeResponsesBody", () => {
     }
   });
 
-  it("allows store=true when tenant allows", () => {
-    const result = sanitizeResponsesBody(
-      { model: "gpt-5.4", input: [{ role: "user", content: "hi" }], store: true },
-      true,
-    );
-    expect(result.ok).toBe(true);
-    if (result.ok) {
-      expect(result.body.store).toBe(true);
-    }
-  });
-
   it("accepts valid payload and strips unknown fields", () => {
     const result = sanitizeResponsesBody({
       model: "gpt-5.4",
diff --git a/apps/web/server/_core/responsesRoutes.ts b/apps/web/server/_core/responsesRoutes.ts
index b4ba73d..23a0df9 100644
--- a/apps/web/server/_core/responsesRoutes.ts
+++ b/apps/web/server/_core/responsesRoutes.ts
@@ -9,6 +9,7 @@
  */
 
 import type { Express, Request, Response } from "express";
+import sanitizeHtml from "sanitize-html";
 import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
 import { debugLog, debugError } from "./logger";
 import { auditLogger } from "../services/auditLogger";
@@ -116,13 +117,30 @@ const TOOL_DISPATCH_MAP: Record<string, string> = {
 // Helpers
 // ---------------------------------------------------------------------------
 
+const MAX_TOOL_OUTPUT_LENGTH = 50_000;
+
+/**
+ * Sanitize tool output HTML before sending as function_call_output to the LLM.
+ * Defense-in-depth against prompt injection via untrusted tool results.
+ */
+export function sanitizeToolOutputForLLM(raw: string): string {
+  if (!raw) return raw;
+  let cleaned = sanitizeHtml(raw, {
+    allowedTags: [],
+    allowedAttributes: {},
+  });
+  if (cleaned.length > MAX_TOOL_OUTPUT_LENGTH) {
+    cleaned = cleaned.slice(0, MAX_TOOL_OUTPUT_LENGTH);
+  }
+  return cleaned;
+}
+
 /**
  * Sanitize and validate a Responses API request body.
- * Enforces store=false default, validates required fields, strips unknown fields.
+ * Enforces store=false always (ZDR compliance), validates required fields, strips unknown fields.
  */
 export function sanitizeResponsesBody(
   body: any,
-  tenantStoreAllowed: boolean = false,
 ): SanitizeResult {
   if (!body || typeof body !== "object") {
     return { ok: false, error: "Request body must be a JSON object", status: 400 };
@@ -150,13 +168,8 @@ export function sanitizeResponsesBody(
     }
   }
 
-  // Enforce store=false (ZDR compliance)
-  if (sanitized.store === true && !tenantStoreAllowed) {
-    sanitized.store = false;
-  }
-  if (sanitized.store === undefined) {
-    sanitized.store = false;
-  }
+  // Always enforce store=false (ZDR compliance — OpenAI must never store request/response)
+  sanitized.store = false;
 
   const stream = Boolean(sanitized.stream);
 
@@ -388,7 +401,7 @@ export function registerResponsesRoutes(
       }
 
       // --- Sanitize body ---
-      const sanitizeResult = sanitizeResponsesBody(req.body, false);
+      const sanitizeResult = sanitizeResponsesBody(req.body);
       if (!sanitizeResult.ok) {
         return res
           .status(sanitizeResult.status)
@@ -748,13 +761,16 @@ async function proxyResponsesJson(
         },
       });
 
-      const output = await dispatchFunctionCall(
+      const rawOutput = await dispatchFunctionCall(
         fc.name,
         fc.arguments,
         internalToken,
         userId,
       );
 
+      // Sanitize tool output to prevent prompt injection via untrusted content
+      const output = sanitizeToolOutputForLLM(rawOutput);
+
       toolOutputs.push({
         type: "function_call_output",
         call_id: fc.callId,
@@ -1142,13 +1158,16 @@ async function proxyResponsesStream(
           metadata: { toolName: fc.name, callId: fc.callId, round },
         });
 
-        const output = await dispatchFunctionCall(
+        const rawOutput = await dispatchFunctionCall(
           fc.name,
           fc.arguments,
           internalToken,
           userId,
         );
 
+        // Sanitize tool output to prevent prompt injection via untrusted content
+        const output = sanitizeToolOutputForLLM(rawOutput);
+
         toolOutputs.push({
           type: "function_call_output",
           call_id: fc.callId,
diff --git a/apps/web/server/routes/browserTool.ts b/apps/web/server/routes/browserTool.ts
index 9697241..d4f081d 100644
--- a/apps/web/server/routes/browserTool.ts
+++ b/apps/web/server/routes/browserTool.ts
@@ -22,6 +22,8 @@ import crypto from "crypto";
 import { deductCredits, refundCredits, hasEnoughCredits, drawFromReservation } from "../services/creditService";
 import { getRedisClient } from "../services/redis";
 import { getTenantFeatureFlag } from "../services/featureFlags";
+import { auditLogger } from "../services/auditLogger";
+import { getTraceId } from "../services/traceContext";
 import { ENV } from "../_core/env";
 
 const router = Router();
@@ -254,6 +256,14 @@ router.post("/api/internal/tools/browser", async (req: Request, res: Response) =
     }
 
     // Forward to Python browser service
+    const traceId = getTraceId();
+    const startTime = Date.now();
+
+    // Extract domains from navigate actions for audit
+    const domains = (actions as Array<{ action: string; url?: string }>)
+      .filter((a) => a.action === "navigate" && a.url)
+      .map((a) => { try { return new URL(a.url!).hostname; } catch { return "unknown"; } });
+
     const pythonRes = await fetch(`${PYTHON_BACKEND_URL}/api/browser/execute`, {
       method: "POST",
       headers: {
@@ -285,6 +295,20 @@ router.post("/api/internal/tools/browser", async (req: Request, res: Response) =
         creditsReserved = false;
       }
 
+      auditLogger.log({
+        traceId,
+        eventType: "browser_tool_call",
+        userId,
+        metadata: {
+          domains,
+          actionCount: (actions as unknown[]).length,
+          screenshotsTaken: 0,
+          actualCost: 0,
+          outcome: "failure",
+          wallTimeMs: Date.now() - startTime,
+        },
+      });
+
       // Normalize upstream error to avoid leaking internal details
       res.status(502).json({
         error: "Browser execution failed.",
@@ -314,6 +338,20 @@ router.post("/api/internal/tools/browser", async (req: Request, res: Response) =
       }
     }
 
+    auditLogger.log({
+      traceId,
+      eventType: "browser_tool_call",
+      userId,
+      metadata: {
+        domains,
+        actionCount: (actions as unknown[]).length,
+        screenshotsTaken: result.screenshots_taken ?? 0,
+        actualCost: result.actual_cost ?? 0,
+        outcome: "success",
+        wallTimeMs: Date.now() - startTime,
+      },
+    });
+
     res.json(result);
   } catch (err) {
     if (creditsReserved && !usingParentReservation) {
diff --git a/python-backend/app/services/tools/browser_tool.py b/python-backend/app/services/tools/browser_tool.py
index 0a7c552..de11bab 100644
--- a/python-backend/app/services/tools/browser_tool.py
+++ b/python-backend/app/services/tools/browser_tool.py
@@ -15,12 +15,14 @@ from __future__ import annotations
 
 import asyncio
 import ipaddress
+import re
 import socket
 import time
 import uuid
 from typing import TYPE_CHECKING, Any
 from urllib.parse import urlparse
 
+import bleach
 import structlog
 from sqlalchemy import select
 from sqlalchemy.ext.asyncio import AsyncSession
@@ -33,6 +35,60 @@ if TYPE_CHECKING:
 logger = structlog.get_logger(__name__)
 
 
+# ── Prompt Injection Mitigation ───────────────────────────────────────────
+
+MAX_TOOL_OUTPUT_LENGTH = 50_000
+
+# Regex to strip content of dangerous tags before bleach processes text
+_DANGEROUS_TAG_CONTENT = re.compile(
+    r"<\s*(script|style|iframe|object|embed)[^>]*>.*?</\s*\1\s*>",
+    re.IGNORECASE | re.DOTALL,
+)
+
+def sanitize_tool_output(raw: str) -> str:
+    """Strip all HTML from tool output to prevent prompt injection.
+
+    Removes all HTML tags, event handler attributes, and truncates
+    to MAX_TOOL_OUTPUT_LENGTH characters.
+    """
+    if not raw:
+        return raw
+    # First strip dangerous tags AND their content (script, style, iframe, etc.)
+    cleaned = _DANGEROUS_TAG_CONTENT.sub("", raw)
+    # Then strip remaining HTML tags (preserving text content of safe tags)
+    cleaned = bleach.clean(cleaned, tags=[], attributes={}, strip=True)
+    if len(cleaned) > MAX_TOOL_OUTPUT_LENGTH:
+        cleaned = cleaned[:MAX_TOOL_OUTPUT_LENGTH]
+    return cleaned
+
+
+# ── Redaction Policy ──────────────────────────────────────────────────────
+
+_SENSITIVE_SELECTOR_PATTERNS = re.compile(
+    r"(?i)"
+    r"(?:type\s*=\s*[\"']?password)"
+    r"|(?:\[(?:name|id)\s*\*?=\s*[\"']?[^\]]*(?:token|secret|key|password|apikey|credential)[^\]]*\])"
+    r"|(?:#[^\"'\s]*(?:password|token|secret))"
+)
+
+def redact_action_for_audit(action: dict) -> dict:
+    """Return a shallow copy of an action dict with sensitive values redacted.
+
+    For fill/type actions on password or secret-related fields, replaces the
+    value with '[REDACTED]'. Non-sensitive fields are preserved as-is.
+    """
+    copy = dict(action)
+    action_type = copy.get("type", "")
+    if action_type not in ("fill", "type"):
+        return copy
+
+    selector = copy.get("selector", "")
+    if _SENSITIVE_SELECTOR_PATTERNS.search(selector):
+        copy["value"] = "[REDACTED]"
+
+    return copy
+
+
 # ── SSRF Protection ────────────────────────────────────────────────────────
 
 
@@ -539,12 +595,13 @@ class BrowserSession:
         return {"screenshot_index": self._screenshot_count, "data": ""}
 
     async def extract_text(self, selector: str | None = None) -> dict:
-        """Extract text content. Truncates at MAX_TEXT_LENGTH chars."""
+        """Extract text content. Sanitizes HTML and truncates at MAX_TEXT_LENGTH chars."""
         if self._dispatcher is not None:
             result = await self._dispatch_to_sandbox(
                 {"action": "extractText", "selector": selector}
             )
             text = result.get("text", "")
+            text = sanitize_tool_output(text)
             truncated = self._truncate_text(text)
             self._check_output_budget(len(truncated.encode()))
             return {"text": truncated, "selector": selector}
diff --git a/python-backend/requirements.txt b/python-backend/requirements.txt
index 293653a..9b0a310 100644
--- a/python-backend/requirements.txt
+++ b/python-backend/requirements.txt
@@ -189,3 +189,6 @@ pybreaker>=1.0.0
 
 # Multi-agent orchestration framework
 agency-swarm==1.8.0
+
+# Section 032: Browser Automation Security
+bleach>=6.0.0
diff --git a/python-backend/tests/test_browser_security.py b/python-backend/tests/test_browser_security.py
new file mode 100644
index 0000000..f6ed632
--- /dev/null
+++ b/python-backend/tests/test_browser_security.py
@@ -0,0 +1,149 @@
+"""Security controls for browser automation tool outputs.
+
+Tests:
+- HTML script tags stripped from extracted text (using bleach)
+- Tool outputs sanitized before function_call_output
+- fill action on input[type=password] -> value not in audit log
+- fill action on input[name*=token] -> value not in audit log
+- fill action on normal input -> value preserved in audit log
+"""
+import pytest
+
+from app.services.tools.browser_tool import redact_action_for_audit, sanitize_tool_output
+
+
+class TestSanitizeToolOutput:
+    """Tests for sanitize_tool_output() — HTML stripping for prompt injection prevention."""
+
+    def test_strips_script_tags(self):
+        raw = "Hello <script>alert('xss')</script> World"
+        result = sanitize_tool_output(raw)
+        assert "<script>" not in result
+        assert "alert" not in result
+        assert "Hello" in result
+        assert "World" in result
+
+    def test_strips_img_onerror(self):
+        raw = '<img onerror="evil()" src="x"> Some text'
+        result = sanitize_tool_output(raw)
+        assert "onerror" not in result
+        assert "evil" not in result
+        assert "Some text" in result
+
+    def test_strips_iframe_and_object(self):
+        raw = '<iframe src="evil.com"></iframe><object data="bad"></object> Safe content'
+        result = sanitize_tool_output(raw)
+        assert "<iframe" not in result
+        assert "<object" not in result
+        assert "Safe content" in result
+
+    def test_strips_style_tags(self):
+        raw = "<style>body{display:none}</style> Visible text"
+        result = sanitize_tool_output(raw)
+        assert "<style>" not in result
+        assert "Visible text" in result
+
+    def test_preserves_plain_text(self):
+        raw = "This is just plain text with no HTML"
+        result = sanitize_tool_output(raw)
+        assert result == raw
+
+    def test_truncates_long_output(self):
+        raw = "A" * 60_000
+        result = sanitize_tool_output(raw)
+        assert len(result) <= 50_001  # 50k + truncation notice allowance
+
+    def test_handles_empty_string(self):
+        assert sanitize_tool_output("") == ""
+
+    def test_strips_all_html_tags(self):
+        raw = "<b>bold</b> <i>italic</i> <p>paragraph</p>"
+        result = sanitize_tool_output(raw)
+        assert "<b>" not in result
+        assert "<i>" not in result
+        assert "<p>" not in result
+        assert "bold" in result
+        assert "italic" in result
+        assert "paragraph" in result
+
+
+class TestRedactActionForAudit:
+    """Tests for redact_action_for_audit() — sensitive field value redaction."""
+
+    def test_password_input_redacted(self):
+        action = {"type": "fill", "selector": "input[type=password]", "value": "s3cret"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+        # Original unchanged
+        assert action["value"] == "s3cret"
+
+    def test_password_type_quoted_redacted(self):
+        action = {"type": "fill", "selector": 'input[type="password"]', "value": "s3cret"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_token_name_redacted(self):
+        action = {"type": "fill", "selector": "input[name=api_token]", "value": "tok_abc123"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_secret_name_redacted(self):
+        action = {"type": "fill", "selector": "input[name=client_secret]", "value": "sec_xyz"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_key_name_redacted(self):
+        action = {"type": "fill", "selector": "input[name=api_key]", "value": "key_123"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_apikey_name_redacted(self):
+        action = {"type": "fill", "selector": "input[name=apikey]", "value": "key_123"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_credential_name_redacted(self):
+        action = {"type": "fill", "selector": "input[name=credential]", "value": "cred_123"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_password_id_redacted(self):
+        action = {"type": "fill", "selector": "#password-field", "value": "s3cret"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_token_id_redacted(self):
+        action = {"type": "fill", "selector": "input[id=auth_token]", "value": "tok_abc"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_normal_input_preserved(self):
+        action = {"type": "fill", "selector": "input[name=username]", "value": "john"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "john"
+
+    def test_email_input_preserved(self):
+        action = {"type": "fill", "selector": "input[name=email]", "value": "john@example.com"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "john@example.com"
+
+    def test_click_action_unchanged(self):
+        action = {"type": "click", "selector": "button.submit"}
+        result = redact_action_for_audit(action)
+        assert result == action
+
+    def test_type_action_password_redacted(self):
+        action = {"type": "type", "selector": "input[type=password]", "value": "s3cret"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
+
+    def test_returns_shallow_copy(self):
+        action = {"type": "fill", "selector": "input[name=username]", "value": "john"}
+        result = redact_action_for_audit(action)
+        assert result is not action
+        assert result == action
+
+    def test_secret_id_redacted(self):
+        action = {"type": "fill", "selector": "input[id=secret_input]", "value": "mysecret"}
+        result = redact_action_for_audit(action)
+        assert result["value"] == "[REDACTED]"
