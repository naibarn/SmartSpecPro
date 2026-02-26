/**
 * Centralized OpenSandbox feature flag evaluation.
 *
 * Reads from process.env directly for runtime flexibility.
 * The ENV object in _core/env.ts captures snapshot values at startup;
 * this module re-reads on every call so flag changes take effect immediately.
 */

/** Execution modes that always bypass sandbox (LLM text processing). */
const LEGACY_ONLY_MODES = new Set(["core-text", "llm-only"]);

/** Execution modes that route to sandbox when enabled. */
const SANDBOX_MODES = new Set([
  "sandbox-code",
  "sandbox-command",
  "sandbox-browser",
  "sandbox-file",
  "sandbox-media",
  "media-generate",
]);

/** Per-feature env var name mapping. */
const FEATURE_FLAG_MAP: Record<string, string> = {
  skill: "SANDBOX_REQUIRE_FOR_SKILLS",
  media: "SANDBOX_REQUIRE_FOR_MEDIA",
};

export type DispatchMode = "optional" | "required";

/**
 * Returns true only when OPENSANDBOX_ENABLED is strictly "true".
 */
export function isSandboxEnabled(): boolean {
  return process.env.OPENSANDBOX_ENABLED === "true";
}

/**
 * Returns the dispatch mode. Defaults to "optional" for unknown values.
 */
export function getDispatchMode(): DispatchMode {
  return process.env.OPENSANDBOX_DISPATCH_MODE === "required"
    ? "required"
    : "optional";
}

/**
 * Checks whether a specific feature type is required to use sandbox.
 * Returns false for feature types without a dedicated flag.
 */
export function isFeatureRequiredForSandbox(featureType: string): boolean {
  const envVar = FEATURE_FLAG_MAP[featureType];
  if (!envVar) return false;
  return process.env[envVar] === "true";
}

/**
 * Combined check: should this workload use the sandbox path?
 *
 * Decision tree:
 * 1. Legacy-only modes (core-text, llm-only) -> always false, never throw
 * 2. Sandbox disabled + required mode -> throw error
 * 3. Sandbox disabled + optional mode -> false (legacy fallback)
 * 4. Sandbox enabled + known sandbox mode -> true
 * 5. Otherwise -> false
 */
export function shouldUseSandboxForFeature(
  featureType: string,
  executionMode: string,
): boolean {
  // 1. Legacy modes never use sandbox
  if (LEGACY_ONLY_MODES.has(executionMode)) return false;

  const enabled = isSandboxEnabled();
  const dispatchMode = getDispatchMode();

  // 2-3. Handle disabled state
  if (!enabled) {
    if (dispatchMode === "required") {
      throw new Error(
        "Sandbox execution is required but OPENSANDBOX_ENABLED is not true. " +
          "Set OPENSANDBOX_ENABLED=true or change OPENSANDBOX_DISPATCH_MODE to optional.",
      );
    }
    return false;
  }

  // 4. Enabled — check if this is a known sandbox mode
  if (SANDBOX_MODES.has(executionMode)) return true;

  // 5. Unknown mode — don't route to sandbox
  return false;
}
