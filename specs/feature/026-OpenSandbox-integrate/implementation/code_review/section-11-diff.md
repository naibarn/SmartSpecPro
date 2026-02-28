diff --git a/apps/web/.env.example b/apps/web/.env.example
index 3e28d22..b2d2a7c 100644
--- a/apps/web/.env.example
+++ b/apps/web/.env.example
@@ -54,3 +54,19 @@ MCP_WRITE_TOKEN=replace_me_write_token
 # Stripe (for credit purchases)
 # STRIPE_SECRET_KEY=
 # STRIPE_WEBHOOK_SECRET=
+
+# =============================================================================
+# OPENSANDBOX INTEGRATION
+# =============================================================================
+# Master switch for sandbox execution. When false, all workloads use legacy paths.
+OPENSANDBOX_ENABLED=false
+
+# Dispatch mode: 'optional' allows legacy fallback, 'required' fails if sandbox unavailable.
+OPENSANDBOX_DISPATCH_MODE=optional
+
+# Default sandbox profile slug (must match a row in sandbox_profiles table).
+SANDBOX_DEFAULT_PROFILE=code-default
+
+# Per-feature enforcement flags. When true, the feature MUST use sandbox (no legacy fallback).
+SANDBOX_REQUIRE_FOR_SKILLS=false
+SANDBOX_REQUIRE_FOR_MEDIA=false
diff --git a/apps/web/server/services/sandbox/__tests__/featureFlags.test.ts b/apps/web/server/services/sandbox/__tests__/featureFlags.test.ts
new file mode 100644
index 0000000..7e48837
--- /dev/null
+++ b/apps/web/server/services/sandbox/__tests__/featureFlags.test.ts
@@ -0,0 +1,167 @@
+import { describe, it, expect, afterEach } from "vitest";
+import {
+  isSandboxEnabled,
+  getDispatchMode,
+  isFeatureRequiredForSandbox,
+  shouldUseSandboxForFeature,
+} from "../featureFlags";
+
+describe("isSandboxEnabled", () => {
+  afterEach(() => {
+    delete process.env.OPENSANDBOX_ENABLED;
+  });
+
+  it("returns false when OPENSANDBOX_ENABLED is unset", () => {
+    delete process.env.OPENSANDBOX_ENABLED;
+    expect(isSandboxEnabled()).toBe(false);
+  });
+
+  it("returns false when OPENSANDBOX_ENABLED is 'false'", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    expect(isSandboxEnabled()).toBe(false);
+  });
+
+  it("returns true when OPENSANDBOX_ENABLED is 'true'", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(isSandboxEnabled()).toBe(true);
+  });
+
+  it("returns false for any non-'true' value like '1' or 'yes'", () => {
+    process.env.OPENSANDBOX_ENABLED = "1";
+    expect(isSandboxEnabled()).toBe(false);
+
+    process.env.OPENSANDBOX_ENABLED = "yes";
+    expect(isSandboxEnabled()).toBe(false);
+
+    process.env.OPENSANDBOX_ENABLED = "TRUE";
+    expect(isSandboxEnabled()).toBe(false);
+  });
+});
+
+describe("getDispatchMode", () => {
+  afterEach(() => {
+    delete process.env.OPENSANDBOX_DISPATCH_MODE;
+  });
+
+  it("returns 'optional' when env var is unset (default)", () => {
+    delete process.env.OPENSANDBOX_DISPATCH_MODE;
+    expect(getDispatchMode()).toBe("optional");
+  });
+
+  it("returns 'required' when env var is 'required'", () => {
+    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
+    expect(getDispatchMode()).toBe("required");
+  });
+
+  it("returns 'optional' for unrecognized values", () => {
+    process.env.OPENSANDBOX_DISPATCH_MODE = "banana";
+    expect(getDispatchMode()).toBe("optional");
+  });
+});
+
+describe("isFeatureRequiredForSandbox", () => {
+  afterEach(() => {
+    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
+    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
+  });
+
+  it("returns false for skills when SANDBOX_REQUIRE_FOR_SKILLS is unset", () => {
+    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
+    expect(isFeatureRequiredForSandbox("skill")).toBe(false);
+  });
+
+  it("returns true for skills when SANDBOX_REQUIRE_FOR_SKILLS is 'true'", () => {
+    process.env.SANDBOX_REQUIRE_FOR_SKILLS = "true";
+    expect(isFeatureRequiredForSandbox("skill")).toBe(true);
+  });
+
+  it("returns true for media when SANDBOX_REQUIRE_FOR_MEDIA is 'true'", () => {
+    process.env.SANDBOX_REQUIRE_FOR_MEDIA = "true";
+    expect(isFeatureRequiredForSandbox("media")).toBe(true);
+  });
+
+  it("returns false for unknown feature types (no env var mapping)", () => {
+    expect(isFeatureRequiredForSandbox("chat")).toBe(false);
+    expect(isFeatureRequiredForSandbox("workflow")).toBe(false);
+  });
+});
+
+describe("shouldUseSandboxForFeature", () => {
+  afterEach(() => {
+    delete process.env.OPENSANDBOX_ENABLED;
+    delete process.env.OPENSANDBOX_DISPATCH_MODE;
+    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
+    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
+  });
+
+  it("returns false when sandbox is globally disabled, dispatch optional", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    process.env.OPENSANDBOX_DISPATCH_MODE = "optional";
+    expect(shouldUseSandboxForFeature("skill", "sandbox-code")).toBe(false);
+  });
+
+  it("throws when sandbox is globally disabled but dispatch is required", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
+    expect(() => shouldUseSandboxForFeature("skill", "sandbox-code")).toThrow();
+  });
+
+  it("returns false for core-text execution mode even when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "core-text")).toBe(false);
+  });
+
+  it("returns false for llm-only execution mode even when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "llm-only")).toBe(false);
+  });
+
+  it("returns true for sandbox-code when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "sandbox-code")).toBe(true);
+  });
+
+  it("returns true for sandbox-media when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("media", "sandbox-media")).toBe(true);
+  });
+
+  it("returns true for sandbox-command when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "sandbox-command")).toBe(true);
+  });
+
+  it("returns true for sandbox-browser when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "sandbox-browser")).toBe(true);
+  });
+
+  it("returns true for sandbox-file when enabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "sandbox-file")).toBe(true);
+  });
+
+  it("returns true for media-generate when enabled (backward compat)", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("media", "media-generate")).toBe(true);
+  });
+
+  it("returns false for unknown execution modes", () => {
+    process.env.OPENSANDBOX_ENABLED = "true";
+    expect(shouldUseSandboxForFeature("skill", "unknown-mode")).toBe(false);
+  });
+
+  it("does not throw for core-text even when dispatch is required and disabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
+    // core-text is always legacy — no throw
+    expect(shouldUseSandboxForFeature("skill", "core-text")).toBe(false);
+  });
+
+  it("does not throw for llm-only even when dispatch is required and disabled", () => {
+    process.env.OPENSANDBOX_ENABLED = "false";
+    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
+    // llm-only is always legacy — no throw
+    expect(shouldUseSandboxForFeature("skill", "llm-only")).toBe(false);
+  });
+});
diff --git a/apps/web/server/services/sandbox/featureFlags.ts b/apps/web/server/services/sandbox/featureFlags.ts
new file mode 100644
index 0000000..5ad24d3
--- /dev/null
+++ b/apps/web/server/services/sandbox/featureFlags.ts
@@ -0,0 +1,92 @@
+/**
+ * Centralized OpenSandbox feature flag evaluation.
+ *
+ * Reads from process.env directly for runtime flexibility.
+ * The ENV object in _core/env.ts captures snapshot values at startup;
+ * this module re-reads on every call so flag changes take effect immediately.
+ */
+
+/** Execution modes that always bypass sandbox (LLM text processing). */
+const LEGACY_ONLY_MODES = new Set(["core-text", "llm-only"]);
+
+/** Execution modes that route to sandbox when enabled. */
+const SANDBOX_MODES = new Set([
+  "sandbox-code",
+  "sandbox-command",
+  "sandbox-browser",
+  "sandbox-file",
+  "sandbox-media",
+  "media-generate",
+]);
+
+/** Per-feature env var name mapping. */
+const FEATURE_FLAG_MAP: Record<string, string> = {
+  skill: "SANDBOX_REQUIRE_FOR_SKILLS",
+  media: "SANDBOX_REQUIRE_FOR_MEDIA",
+};
+
+export type DispatchMode = "optional" | "required";
+
+/**
+ * Returns true only when OPENSANDBOX_ENABLED is strictly "true".
+ */
+export function isSandboxEnabled(): boolean {
+  return process.env.OPENSANDBOX_ENABLED === "true";
+}
+
+/**
+ * Returns the dispatch mode. Defaults to "optional" for unknown values.
+ */
+export function getDispatchMode(): DispatchMode {
+  return process.env.OPENSANDBOX_DISPATCH_MODE === "required"
+    ? "required"
+    : "optional";
+}
+
+/**
+ * Checks whether a specific feature type is required to use sandbox.
+ * Returns false for feature types without a dedicated flag.
+ */
+export function isFeatureRequiredForSandbox(featureType: string): boolean {
+  const envVar = FEATURE_FLAG_MAP[featureType];
+  if (!envVar) return false;
+  return process.env[envVar] === "true";
+}
+
+/**
+ * Combined check: should this workload use the sandbox path?
+ *
+ * Decision tree:
+ * 1. Legacy-only modes (core-text, llm-only) -> always false, never throw
+ * 2. Sandbox disabled + required mode -> throw error
+ * 3. Sandbox disabled + optional mode -> false (legacy fallback)
+ * 4. Sandbox enabled + known sandbox mode -> true
+ * 5. Otherwise -> false
+ */
+export function shouldUseSandboxForFeature(
+  featureType: string,
+  executionMode: string,
+): boolean {
+  // 1. Legacy modes never use sandbox
+  if (LEGACY_ONLY_MODES.has(executionMode)) return false;
+
+  const enabled = isSandboxEnabled();
+  const dispatchMode = getDispatchMode();
+
+  // 2-3. Handle disabled state
+  if (!enabled) {
+    if (dispatchMode === "required") {
+      throw new Error(
+        "Sandbox execution is required but OPENSANDBOX_ENABLED is not true. " +
+          "Set OPENSANDBOX_ENABLED=true or change OPENSANDBOX_DISPATCH_MODE to optional.",
+      );
+    }
+    return false;
+  }
+
+  // 4. Enabled — check if this is a known sandbox mode
+  if (SANDBOX_MODES.has(executionMode)) return true;
+
+  // 5. Unknown mode — don't route to sandbox
+  return false;
+}
diff --git a/apps/web/server/services/sandbox/index.ts b/apps/web/server/services/sandbox/index.ts
index 7af813d..066dabb 100644
--- a/apps/web/server/services/sandbox/index.ts
+++ b/apps/web/server/services/sandbox/index.ts
@@ -4,6 +4,13 @@ export type {
   SandboxDispatchResult,
   ExecutionMode,
 } from "./dispatchService";
+export {
+  isSandboxEnabled,
+  getDispatchMode,
+  isFeatureRequiredForSandbox,
+  shouldUseSandboxForFeature,
+} from "./featureFlags";
+export type { DispatchMode } from "./featureFlags";
 export { resolveProfile, checkTenantPolicy } from "./policyResolver";
 export { projectStatus } from "./statusProjection";
 export type {
diff --git a/python-backend/.env.example b/python-backend/.env.example
index 1a2dd1c..6d1ada1 100644
--- a/python-backend/.env.example
+++ b/python-backend/.env.example
@@ -174,3 +174,38 @@ SMARTSPEC_PROXY_TOKEN=
 
 # Restrict OpenAI-compatible endpoints to localhost
 SMARTSPEC_LOCALHOST_ONLY=1
+
+# =============================================================================
+# OPENSANDBOX INTEGRATION
+# =============================================================================
+# Master switch — set true to enable sandbox execution
+OPENSANDBOX_ENABLED=false
+
+# Dispatch mode: 'optional' (fallback to legacy) or 'required' (fail if unavailable)
+OPENSANDBOX_DISPATCH_MODE=optional
+
+# OpenSandbox server URL (localhost for dev, https://sandbox.smartaihub.app for prod)
+OPENSANDBOX_BASE_URL=http://localhost:8080
+
+# API key for authenticating with the OpenSandbox server
+OPENSANDBOX_API_KEY=dev-sandbox-key-change-me
+
+# Timeouts
+OPENSANDBOX_REQUEST_TIMEOUT_SECONDS=30
+OPENSANDBOX_CREATE_TIMEOUT_SECONDS=120
+OPENSANDBOX_READY_POLL_INTERVAL_MS=2000
+
+# Artifact storage
+SANDBOX_ARTIFACT_BUCKET=smartspec-sandbox-artifacts
+SANDBOX_SIGNED_URL_TTL_SECONDS=900
+
+# Network policy
+SANDBOX_DEFAULT_NETWORK_ACTION=deny
+
+# Concurrency limits
+SANDBOX_MAX_CONCURRENT_GLOBAL=10
+SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT=3
+
+# Per-feature enforcement
+SANDBOX_REQUIRE_FOR_SKILLS=false
+SANDBOX_REQUIRE_FOR_MEDIA=false
diff --git a/python-backend/app/integrations/opensandbox/config.py b/python-backend/app/integrations/opensandbox/config.py
index eb59f5c..d17d9ea 100644
--- a/python-backend/app/integrations/opensandbox/config.py
+++ b/python-backend/app/integrations/opensandbox/config.py
@@ -25,6 +25,11 @@ class OpenSandboxSettings(BaseSettings):
     SANDBOX_MAX_CONCURRENT_GLOBAL: int = 10
     SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT: int = 3
 
+    # Feature flags
+    OPENSANDBOX_DISPATCH_MODE: str = "optional"
+    SANDBOX_REQUIRE_FOR_SKILLS: bool = False
+    SANDBOX_REQUIRE_FOR_MEDIA: bool = False
+
     @property
     def is_enabled(self) -> bool:
         """Return True if OpenSandbox is enabled and has a valid base URL."""
diff --git a/python-backend/tests/test_sandbox_feature_flags.py b/python-backend/tests/test_sandbox_feature_flags.py
new file mode 100644
index 0000000..0e855b6
--- /dev/null
+++ b/python-backend/tests/test_sandbox_feature_flags.py
@@ -0,0 +1,118 @@
+"""Tests for OpenSandbox feature flag behavior in Python backend.
+
+Tests verify that environment variables correctly control sandbox routing
+at the configuration level.
+"""
+import pytest
+from unittest.mock import patch
+
+
+pytestmark = [pytest.mark.unit, pytest.mark.sandbox]
+
+
+class TestOpenSandboxSettingsFlags:
+    """Tests for the OpenSandboxSettings config reading feature flag env vars."""
+
+    def test_enabled_defaults_to_false(self):
+        """When no OPENSANDBOX_ENABLED env var is set, is_enabled returns False."""
+        with patch.dict("os.environ", {}, clear=True):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+            settings = OpenSandboxSettings()
+            assert settings.OPENSANDBOX_ENABLED is False
+            assert settings.is_enabled is False
+
+    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "true"})
+    def test_enabled_reads_true_from_env(self):
+        """OPENSANDBOX_ENABLED=true sets OPENSANDBOX_ENABLED to True."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.OPENSANDBOX_ENABLED is True
+
+    @patch.dict("os.environ", {"OPENSANDBOX_ENABLED": "false"})
+    def test_enabled_reads_false_from_env(self):
+        """OPENSANDBOX_ENABLED=false sets OPENSANDBOX_ENABLED to False."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.OPENSANDBOX_ENABLED is False
+
+    @patch.dict("os.environ", {
+        "OPENSANDBOX_ENABLED": "true",
+        "OPENSANDBOX_BASE_URL": "",
+    })
+    def test_enabled_but_no_url_returns_disabled(self):
+        """is_enabled is False when OPENSANDBOX_ENABLED=true but URL is empty."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.OPENSANDBOX_ENABLED is True
+        assert settings.is_enabled is False
+
+
+class TestDispatchModeFlags:
+    """Tests for OPENSANDBOX_DISPATCH_MODE behavior at config level."""
+
+    def test_dispatch_mode_defaults_to_optional(self):
+        """When OPENSANDBOX_DISPATCH_MODE is unset, default is 'optional'."""
+        with patch.dict("os.environ", {}, clear=True):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+            settings = OpenSandboxSettings()
+            assert settings.OPENSANDBOX_DISPATCH_MODE == "optional"
+
+    @patch.dict("os.environ", {"OPENSANDBOX_DISPATCH_MODE": "required"})
+    def test_dispatch_mode_reads_required(self):
+        """OPENSANDBOX_DISPATCH_MODE=required is read correctly."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.OPENSANDBOX_DISPATCH_MODE == "required"
+
+    @patch.dict("os.environ", {"OPENSANDBOX_DISPATCH_MODE": "optional"})
+    def test_dispatch_mode_reads_optional(self):
+        """OPENSANDBOX_DISPATCH_MODE=optional is read correctly."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.OPENSANDBOX_DISPATCH_MODE == "optional"
+
+
+class TestPerFeatureFlags:
+    """Tests for per-feature sandbox requirement flags."""
+
+    def test_skills_required_defaults_to_false(self):
+        """SANDBOX_REQUIRE_FOR_SKILLS defaults to False."""
+        with patch.dict("os.environ", {}, clear=True):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+            settings = OpenSandboxSettings()
+            assert settings.SANDBOX_REQUIRE_FOR_SKILLS is False
+
+    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_SKILLS": "true"})
+    def test_skills_required_reads_true(self):
+        """SANDBOX_REQUIRE_FOR_SKILLS=true sets flag to True."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.SANDBOX_REQUIRE_FOR_SKILLS is True
+
+    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_SKILLS": "false"})
+    def test_skills_required_reads_false(self):
+        """SANDBOX_REQUIRE_FOR_SKILLS=false sets flag to False."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.SANDBOX_REQUIRE_FOR_SKILLS is False
+
+    def test_media_required_defaults_to_false(self):
+        """SANDBOX_REQUIRE_FOR_MEDIA defaults to False."""
+        with patch.dict("os.environ", {}, clear=True):
+            from app.integrations.opensandbox.config import OpenSandboxSettings
+            settings = OpenSandboxSettings()
+            assert settings.SANDBOX_REQUIRE_FOR_MEDIA is False
+
+    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_MEDIA": "true"})
+    def test_media_required_reads_true(self):
+        """SANDBOX_REQUIRE_FOR_MEDIA=true sets flag to True."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.SANDBOX_REQUIRE_FOR_MEDIA is True
+
+    @patch.dict("os.environ", {"SANDBOX_REQUIRE_FOR_MEDIA": "false"})
+    def test_media_required_reads_false(self):
+        """SANDBOX_REQUIRE_FOR_MEDIA=false sets flag to False."""
+        from app.integrations.opensandbox.config import OpenSandboxSettings
+        settings = OpenSandboxSettings()
+        assert settings.SANDBOX_REQUIRE_FOR_MEDIA is False
