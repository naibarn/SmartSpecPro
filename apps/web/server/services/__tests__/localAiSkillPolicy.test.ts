import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillDefinition } from "@smartspec/skills";

import {
  applyLocalSkillExecutionPolicyGate,
  buildLocalSkillExecutionEnvelope,
  resolveEffectiveLocalSkillExecutionPolicy,
  resolveLocalSkillExecutionPolicy,
} from "../localAiSkillPolicy";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    executionMode: "llm-only",
    ...overrides,
  };
}

const tempDirs: string[] = [];

function makeTempSkillDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-skill-policy-"));
  tempDirs.push(dir);
  return dir;
}

function writeSkillManifest(dir: string, content: string): string {
  const filePath = path.join(dir, "SKILL.md");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function writeBundleManifest(
  dir: string,
  input: Record<string, unknown>,
): string {
  const entryPath = path.join(dir, "dist", "index.mjs");
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, "export default {};\n", "utf-8");
  const manifestPath = path.join(dir, "skill.manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(input, null, 2), "utf-8");
  return manifestPath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveLocalSkillExecutionPolicy", () => {
  it("defaults to cloud_required when local execution metadata is missing", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      "---\nname: Test Skill\nexecution_mode: llm-only\n---\nHello",
    );

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({ skillFilePath }),
      platform: "tauri",
    });

    expect(result.tier).toBe("cloud_required");
    expect(result.reason).toBe("missing_local_execution_policy");
  });

  it("promotes curated text-only skills to local_safe on Tauri even before frontmatter rollout finishes", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      "---\nname: Translation\nexecution_mode: llm-only\n---\nHello",
    );

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({
        id: "translation",
        skillFilePath,
        executionMode: "llm-only",
      }),
      platform: "tauri",
    });

    expect(result.tier).toBe("local_safe");
    expect(result.runtimeKind).toBe("gemma4_text");
    expect(result.eligible).toBe(true);
    expect(result.reason).toBe("local_safe_text_skill_curated");
  });

  it("allows reviewed text-only local_safe skills on Tauri", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Test Skill",
        "execution_mode: llm-only",
        "local_execution:",
        "  tier: local_safe",
        "  reviewed: true",
        "  allow_offline: true",
        "  runtime: gemma4_text",
        "---",
        "Hello",
      ].join("\n"),
    );

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({ skillFilePath }),
      platform: "tauri",
    });

    expect(result.tier).toBe("local_safe");
    expect(result.runtimeKind).toBe("gemma4_text");
    expect(result.eligible).toBe(true);
    expect(result.allowOffline).toBe(true);
  });

  it("allows reviewed text-only local_safe skills on web for external local backends", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Test Skill",
        "execution_mode: llm-only",
        "local_execution:",
        "  tier: local_safe",
        "  reviewed: true",
        "  allow_offline: true",
        "  runtime: gemma4_text",
        "---",
        "Hello",
      ].join("\n"),
    );

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({ skillFilePath }),
      platform: "web",
    });

    expect(result.tier).toBe("local_safe");
    expect(result.runtimeKind).toBe("gemma4_text");
    expect(result.eligible).toBe(true);
    expect(result.requiresTauri).toBe(false);
  });

  it("keeps local_preprocess_only eligible without promoting to local_safe", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Test Skill",
        "execution_mode: llm-only",
        "local_execution:",
        "  tier: local_preprocess_only",
        "  reviewed: true",
        "---",
        "Hello",
      ].join("\n"),
    );

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({ skillFilePath }),
      platform: "web",
    });

    expect(result.tier).toBe("local_preprocess_only");
    expect(result.runtimeKind).toBe("gemma4_text");
    expect(result.requiresTauri).toBe(false);
  });

  it("allows reviewed script bundles only when the localExecution manifest contract is present", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Bundle Skill",
        "execution_mode: sandbox-command",
        "local_execution:",
        "  tier: local_safe",
        "  reviewed: true",
        "  runtime: script_bundle",
        "---",
        "Hello",
      ].join("\n"),
    );

    writeBundleManifest(skillDir, {
      entry: "dist/index.mjs",
      localExecution: {
        runtimeKind: "node_bundle",
        reviewedEntry: "dist/index.mjs",
        artifactDigestSha256: "a".repeat(64),
        permissionProfile: "tauri-local-safe-default",
        inputRoots: ["inputs"],
        outputRoots: ["outputs"],
        maxOutputMb: 24,
        provenance: {
          builder: "ci",
          buildId: "build-001",
          reviewedAt: "2026-04-05T10:00:00Z",
          signatureSha256: "b".repeat(64),
          version: "1.0.0",
        },
        sourceLanguage: "tsx",
        requiresCompiledArtifact: true,
        supportedOutputKinds: ["json", "files"],
      },
    });

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({
        skillFilePath,
        executionMode: "sandbox-command",
      }),
      platform: "tauri",
    });

    expect(result.tier).toBe("local_safe");
    expect(result.runtimeKind).toBe("script_bundle");
    expect(result.localScriptManifest?.runtimeKind).toBe("node_bundle");
    expect(result.localScriptManifest?.sourceLanguage).toBe("tsx");
  });

  it("fails closed for reviewed script bundles that require network", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Bundle Skill",
        "execution_mode: sandbox-command",
        "requires_network: true",
        "local_execution:",
        "  tier: local_safe",
        "  reviewed: true",
        "  runtime: script_bundle",
        "---",
        "Hello",
      ].join("\n"),
    );

    writeBundleManifest(skillDir, {
      entry: "dist/index.mjs",
      localExecution: {
        runtimeKind: "node_bundle",
        reviewedEntry: "dist/index.mjs",
        artifactDigestSha256: "a".repeat(64),
        permissionProfile: "tauri-local-safe-default",
        inputRoots: ["inputs"],
        outputRoots: ["outputs"],
        maxOutputMb: 24,
        provenance: {
          builder: "ci",
        },
      },
    });

    const result = resolveLocalSkillExecutionPolicy({
      skill: makeSkill({
        skillFilePath,
        executionMode: "sandbox-command",
        requiresNetwork: true,
      }),
      platform: "tauri",
    });

    expect(result.tier).toBe("cloud_required");
    expect(result.reason).toBe("requires_network_not_local_safe");
  });
});

describe("buildLocalSkillExecutionEnvelope", () => {
  it("strips reusable secrets from the local execution envelope", () => {
    const envelope = buildLocalSkillExecutionEnvelope({
      skillId: "bundle-skill",
      localExecutionId: "exec-1",
      runtimeKind: "script_bundle",
      params: { prompt: "hello" },
      metadata: { source: "chat" },
      userToken: "secret-user-token",
      providerApiKeys: ["secret-provider-key"],
      refreshToken: "secret-refresh-token",
      sessionToken: "secret-session-token",
    });

    expect(envelope).toEqual({
      skillId: "bundle-skill",
      localExecutionId: "exec-1",
      runtimeKind: "script_bundle",
      params: { prompt: "hello" },
      stagedInputs: [],
      outputContract: null,
      metadata: { source: "chat" },
    });
    expect("userToken" in envelope).toBe(false);
  });
});

describe("applyLocalSkillExecutionPolicyGate", () => {
  it("blocks local execution when the tenant feature is disabled", () => {
    const gated = applyLocalSkillExecutionPolicyGate(
      {
        tier: "local_safe",
        runtimeKind: "gemma4_text",
        eligible: true,
        reviewed: true,
        allowOffline: true,
        requiresTauri: true,
        reason: "local_safe_text_skill",
        warnings: [],
        derivedFrom: ["frontmatter"],
        signals: {
          requiresNetwork: false,
          requiresBrowser: false,
          maxRuntimeSeconds: null,
          maxInputMb: null,
          sandboxProfileSlug: null,
        },
        localScriptManifest: null,
      },
      {
        featureEnabled: false,
        forceCloudOnly: false,
        userEnabled: true,
        executionMode: "prefer_local",
      },
    );

    expect(gated.eligible).toBe(false);
    expect(gated.reason).toBe("tenant_disabled");
  });

  it("blocks preprocess-only skills in local_only mode", () => {
    const gated = applyLocalSkillExecutionPolicyGate(
      {
        tier: "local_preprocess_only",
        runtimeKind: "gemma4_text",
        eligible: true,
        reviewed: true,
        allowOffline: true,
        requiresTauri: false,
        reason: "local_preprocess_only_declared",
        warnings: [],
        derivedFrom: ["frontmatter"],
        signals: {
          requiresNetwork: false,
          requiresBrowser: false,
          maxRuntimeSeconds: null,
          maxInputMb: null,
          sandboxProfileSlug: null,
        },
        localScriptManifest: null,
      },
      {
        featureEnabled: true,
        forceCloudOnly: false,
        userEnabled: true,
        executionMode: "local_only",
      },
    );

    expect(gated.eligible).toBe(false);
    expect(gated.reason).toBe("local_only_requires_local_safe_skill");
  });
});

describe("resolveEffectiveLocalSkillExecutionPolicy", () => {
  it("applies user execution-mode gating on top of declared policy", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeSkillManifest(
      skillDir,
      [
        "---",
        "name: Test Skill",
        "execution_mode: llm-only",
        "local_execution:",
        "  tier: local_safe",
        "  reviewed: true",
        "  runtime: gemma4_text",
        "---",
        "Hello",
      ].join("\n"),
    );

    const result = resolveEffectiveLocalSkillExecutionPolicy({
      skill: makeSkill({ skillFilePath }),
      platform: "tauri",
      featureEnabled: true,
      forceCloudOnly: false,
      userEnabled: false,
      executionMode: "off",
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("user_local_ai_disabled");
  });
});
