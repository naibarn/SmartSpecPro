import { describe, it, expect, afterEach } from "vitest";
import {
  isSandboxEnabled,
  getDispatchMode,
  isFeatureRequiredForSandbox,
  shouldUseSandboxForFeature,
} from "../featureFlags";

describe("isSandboxEnabled", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
  });

  it("returns false when OPENSANDBOX_ENABLED is unset", () => {
    delete process.env.OPENSANDBOX_ENABLED;
    expect(isSandboxEnabled()).toBe(false);
  });

  it("returns false when OPENSANDBOX_ENABLED is 'false'", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    expect(isSandboxEnabled()).toBe(false);
  });

  it("returns true when OPENSANDBOX_ENABLED is 'true'", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(isSandboxEnabled()).toBe(true);
  });

  it("returns false for any non-'true' value like '1' or 'yes'", () => {
    process.env.OPENSANDBOX_ENABLED = "1";
    expect(isSandboxEnabled()).toBe(false);

    process.env.OPENSANDBOX_ENABLED = "yes";
    expect(isSandboxEnabled()).toBe(false);

    process.env.OPENSANDBOX_ENABLED = "TRUE";
    expect(isSandboxEnabled()).toBe(false);
  });
});

describe("getDispatchMode", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_DISPATCH_MODE;
  });

  it("returns 'optional' when env var is unset (default)", () => {
    delete process.env.OPENSANDBOX_DISPATCH_MODE;
    expect(getDispatchMode()).toBe("optional");
  });

  it("returns 'required' when env var is 'required'", () => {
    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
    expect(getDispatchMode()).toBe("required");
  });

  it("returns 'optional' for unrecognized values", () => {
    process.env.OPENSANDBOX_DISPATCH_MODE = "banana";
    expect(getDispatchMode()).toBe("optional");
  });
});

describe("isFeatureRequiredForSandbox", () => {
  afterEach(() => {
    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
  });

  it("returns false for skills when SANDBOX_REQUIRE_FOR_SKILLS is unset", () => {
    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
    expect(isFeatureRequiredForSandbox("skill")).toBe(false);
  });

  it("returns true for skills when SANDBOX_REQUIRE_FOR_SKILLS is 'true'", () => {
    process.env.SANDBOX_REQUIRE_FOR_SKILLS = "true";
    expect(isFeatureRequiredForSandbox("skill")).toBe(true);
  });

  it("returns true for media when SANDBOX_REQUIRE_FOR_MEDIA is 'true'", () => {
    process.env.SANDBOX_REQUIRE_FOR_MEDIA = "true";
    expect(isFeatureRequiredForSandbox("media")).toBe(true);
  });

  it("returns false for unknown feature types (no env var mapping)", () => {
    expect(isFeatureRequiredForSandbox("chat")).toBe(false);
    expect(isFeatureRequiredForSandbox("workflow")).toBe(false);
  });
});

describe("shouldUseSandboxForFeature", () => {
  afterEach(() => {
    delete process.env.OPENSANDBOX_ENABLED;
    delete process.env.OPENSANDBOX_DISPATCH_MODE;
    delete process.env.SANDBOX_REQUIRE_FOR_SKILLS;
    delete process.env.SANDBOX_REQUIRE_FOR_MEDIA;
  });

  it("returns false when sandbox is globally disabled, dispatch optional", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    process.env.OPENSANDBOX_DISPATCH_MODE = "optional";
    expect(shouldUseSandboxForFeature("skill", "sandbox-code")).toBe(false);
  });

  it("throws when sandbox is globally disabled but dispatch is required", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
    expect(() => shouldUseSandboxForFeature("skill", "sandbox-code")).toThrow();
  });

  it("returns false for core-text execution mode even when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "core-text")).toBe(false);
  });

  it("returns false for llm-only execution mode even when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "llm-only")).toBe(false);
  });

  it("returns true for sandbox-code when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "sandbox-code")).toBe(true);
  });

  it("returns true for sandbox-media when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("media", "sandbox-media")).toBe(true);
  });

  it("returns true for sandbox-command when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "sandbox-command")).toBe(true);
  });

  it("returns true for sandbox-browser when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "sandbox-browser")).toBe(true);
  });

  it("returns true for sandbox-file when enabled", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "sandbox-file")).toBe(true);
  });

  it("returns true for media-generate when enabled (backward compat)", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("media", "media-generate")).toBe(true);
  });

  it("returns false for unknown execution modes", () => {
    process.env.OPENSANDBOX_ENABLED = "true";
    expect(shouldUseSandboxForFeature("skill", "unknown-mode")).toBe(false);
  });

  it("does not throw for core-text even when dispatch is required and disabled", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
    // core-text is always legacy — no throw
    expect(shouldUseSandboxForFeature("skill", "core-text")).toBe(false);
  });

  it("does not throw for llm-only even when dispatch is required and disabled", () => {
    process.env.OPENSANDBOX_ENABLED = "false";
    process.env.OPENSANDBOX_DISPATCH_MODE = "required";
    // llm-only is always legacy — no throw
    expect(shouldUseSandboxForFeature("skill", "llm-only")).toBe(false);
  });
});
