import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { SkillDefinition } from "@smartspec/skills";

import { DESKTOP_HOST_PROTOCOL_VERSION } from "../../../shared/desktopHost";
import {
  assertDesktopArtifactPromotionAllowed,
  buildDesktopMaterializationDescriptor,
  buildDesktopSkillPackageEnvelope,
} from "../desktopPackageRegistryService";
import { buildRevocationFeedSnapshot } from "../revocationFeedService";

const tempDirs: string[] = [];

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "storyboard-writer",
    name: "Storyboard Writer",
    description: "A test skill",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    executionMode: "sandbox-command",
    ...overrides,
  };
}

function makeTempSkillDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-package-registry-"));
  tempDirs.push(dir);
  return dir;
}

function writeBundle(dir: string): string {
  const entryPath = path.join(dir, "dist", "index.mjs");
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, "export default {};\n", "utf-8");
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    [
      "---",
      "name: Storyboard Writer",
      "execution_mode: sandbox-command",
      "local_execution:",
      "  tier: local_safe",
      "  reviewed: true",
      "  runtime: script_bundle",
      "---",
      "Hello",
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(dir, "skill.manifest.json"),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
    "utf-8",
  );
  return path.join(dir, "SKILL.md");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("desktopPackageRegistryService", () => {
  it("builds a signed org-verified package envelope from a reviewed skill bundle", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeBundle(skillDir);

    const envelope = buildDesktopSkillPackageEnvelope({
      skill: makeSkill({ skillFilePath }),
      trustClass: "org_verified",
      version: "1.0.0",
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "signing-key.test",
      },
    });

    expect(envelope.manifest.packageId).toBe("storyboard-writer");
    expect(envelope.manifest.trustClass).toBe("org_verified");
    expect(envelope.manifest.runtimeDestination).toBe("pi");
    expect(envelope.manifest.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      envelope.manifest.compatibilityRange.minDesktopHostProtocolVersion,
    ).toBe(DESKTOP_HOST_PROTOCOL_VERSION);
  });

  it("rejects local-unverified packages from the server-published registry", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeBundle(skillDir);

    expect(() =>
      buildDesktopSkillPackageEnvelope({
        skill: makeSkill({ skillFilePath }),
        trustClass: "local_unverified",
        version: "1.0.0",
        signer: {
          signerId: "org-signer-1",
          keyVersion: "2026-04",
          signerSecret: "signing-key.test",
        },
      }),
    ).toThrow(/local-unverified/i);
  });

  it("fails materialization when the package or signer is revoked", () => {
    const skillDir = makeTempSkillDir();
    const skillFilePath = writeBundle(skillDir);
    const envelope = buildDesktopSkillPackageEnvelope({
      skill: makeSkill({ skillFilePath }),
      trustClass: "org_verified",
      version: "1.0.0",
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "signing-key.test",
      },
    });

    const revocationFeed = buildRevocationFeedSnapshot({
      generatedAt: "2026-04-08T10:00:00.000Z",
      revokedPackageIds: [envelope.manifest.packageId],
    });

    expect(() =>
      buildDesktopMaterializationDescriptor({
        envelope,
        localBundlePath: "/tmp/storyboard-writer",
        currentProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        revocationFeed,
        resolveSignerSecret: () => "signing-key.test",
      }),
    ).toThrow(/revoked/i);
  });

  it("fails closed on missing signature or compatibility metadata", () => {
    expect(() =>
      buildDesktopMaterializationDescriptor({
        envelope: {
          manifest: {
            packageId: "storyboard-writer",
            version: "1.0.0",
          },
        } as any,
        localBundlePath: "/tmp/storyboard-writer",
        currentProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        revocationFeed: buildRevocationFeedSnapshot({
          generatedAt: "2026-04-08T10:00:00.000Z",
        }),
        resolveSignerSecret: () => "signing-key.test",
      }),
    ).toThrow(/compatibility|signature/i);
  });

  it("blocks trust-tainted outputs from silently publishing into verified surfaces", () => {
    expect(() =>
      assertDesktopArtifactPromotionAllowed({
        sourceTrustClass: "project_local",
        destinationSurface: "org_verified_registry",
      }),
    ).toThrow(/requires review/i);
  });
});
