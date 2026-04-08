import { describe, expect, it } from "vitest";

import {
  canRunSkillLocally,
  describeSkillLocalExecution,
} from "./skillLocalExecutionPolicy";
import { buildTauriLocalSkillExecutionEnvelope } from "./tauriSkillRuntime";

const basePolicy = {
  tier: "local_safe" as const,
  runtimeKind: "script_bundle" as const,
  eligible: true,
  reviewed: true,
  allowOffline: true,
  requiresTauri: true,
  reason: "local_safe_script_skill",
  warnings: [],
  derivedFrom: ["frontmatter", "bundle_manifest"],
  signals: {
    requiresNetwork: false,
    requiresBrowser: false,
    maxRuntimeSeconds: 60,
    maxInputMb: 16,
    sandboxProfileSlug: null,
  },
  localScriptManifest: {
    runtimeKind: "node_bundle" as const,
    reviewedEntry: "dist/index.mjs",
    artifactDigestSha256: "a".repeat(64),
    permissionProfile: "tauri-local-safe-default",
    inputRoots: ["inputs"],
    outputRoots: ["outputs"],
    maxOutputMb: 24,
    provenance: {},
  },
};

describe("skillLocalExecutionPolicy", () => {
  it("only allows local-safe skills on Tauri", () => {
    expect(canRunSkillLocally(basePolicy, "tauri")).toBe(true);
    expect(canRunSkillLocally(basePolicy, "web")).toBe(false);
  });

  it("does not expose Gemma-only preprocess helpers until a bundled runtime exists", () => {
    const state = describeSkillLocalExecution(
      {
        ...basePolicy,
        tier: "local_preprocess_only",
        runtimeKind: "gemma4_text",
        requiresTauri: false,
      },
      "web",
    );

    expect(state.canRunLocally).toBe(false);
    expect(state.canUseLocalPreprocess).toBe(false);
    expect(state.badgeLabel).toBe("Local Assist");
  });

  it("requires at least one prepared Gemma profile before advertising local Gemma helpers", () => {
    const state = describeSkillLocalExecution(
      {
        ...basePolicy,
        tier: "local_safe",
        runtimeKind: "gemma4_text",
        requiresTauri: true,
      },
      "tauri",
      {
        gemma4TextAvailable: true,
        installedGemmaProfileIds: [],
      },
    );

    expect(state.canRunLocally).toBe(false);
  });

  it("allows local-safe Gemma text skills when an external local text backend is configured", () => {
    const state = describeSkillLocalExecution(
      {
        ...basePolicy,
        tier: "local_safe",
        runtimeKind: "gemma4_text",
        requiresTauri: false,
      },
      "web",
      {
        externalTextBackendAvailable: true,
      },
    );

    expect(state.canRunLocally).toBe(true);
    expect(state.badgeLabel).toBe("Local Safe");
  });

  it("does not expose preprocess helpers when the policy is ineligible", () => {
    const state = describeSkillLocalExecution(
      {
        ...basePolicy,
        tier: "local_preprocess_only",
        runtimeKind: "gemma4_text",
        requiresTauri: false,
        eligible: false,
        reason: "tenant_disabled",
      },
      "web",
    );

    expect(state.canRunLocally).toBe(false);
    expect(state.canUseLocalPreprocess).toBe(false);
  });
});

describe("buildTauriLocalSkillExecutionEnvelope", () => {
  it("builds a secret-free envelope for the local runner", () => {
    const envelope = buildTauriLocalSkillExecutionEnvelope({
      skillId: "storyboard-writer",
      localExecutionId: "exec-2",
      runtimeKind: "script_bundle",
      params: { topic: "ocean" },
      metadata: { source: "chat" },
      userToken: "secret",
      providerApiKeys: ["secret"],
    });

    expect(envelope).toEqual({
      skillId: "storyboard-writer",
      localExecutionId: "exec-2",
      runtimeKind: "script_bundle",
      params: { topic: "ocean" },
      stagedInputs: [],
      outputContract: null,
      metadata: { source: "chat" },
    });
  });
});
