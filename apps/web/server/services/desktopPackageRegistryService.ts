import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { SkillDefinition } from "@smartspec/skills";

import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  type DesktopPackageCatalogItem,
  type DesktopPackageState,
  type DesktopPackageTrustClass,
} from "../../shared/desktopHost";
import { resolveEffectiveLocalSkillExecutionPolicy } from "./localAiSkillPolicy";
import {
  signDesktopPackageEnvelope,
  signedDesktopPackageEnvelopeSchema,
  verifyDesktopPackageEnvelope,
  type DesktopPackageSigner,
  type SignedDesktopPackageEnvelope,
} from "./packageSigningService";
import {
  isDesktopPackageOrSignerRevoked,
  type DesktopRevocationFeedSnapshot,
} from "./revocationFeedService";
import {
  resolveSkillBundleDir,
  resolveSkillManifestPath,
} from "./skillFiles";

export interface BuildDesktopSkillPackageEnvelopeInput {
  skill: SkillDefinition;
  trustClass: DesktopPackageTrustClass;
  version: string;
  signer: DesktopPackageSigner & {
    signerSecret: string;
  };
}

export interface BuildDesktopMaterializationDescriptorInput {
  envelope: SignedDesktopPackageEnvelope;
  localBundlePath: string;
  currentProtocolVersion: string;
  revocationFeed: DesktopRevocationFeedSnapshot;
  resolveSignerSecret: (signer: DesktopPackageSigner) => string | null;
}

export interface DesktopMaterializationDescriptor {
  packageId: string;
  packageVersion: string;
  trustClass: DesktopPackageTrustClass;
  runtimeDestination: "pi" | "desktop_host" | "hybrid";
  localBundlePath: string;
  capabilityManifestDigest: string;
  payloadDigest: string;
  signerId: string;
  revocationCheckedAt: string;
}

function readSkillVersion(skill: SkillDefinition): string | null {
  const candidate = (skill as SkillDefinition & { version?: unknown }).version;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function inferBuiltInSkill(skill: SkillDefinition): boolean {
  if (skill.internalOnly) {
    return true;
  }

  const filePath = typeof skill.skillFilePath === "string"
    ? skill.skillFilePath.replace(/\\/g, "/")
    : "";
  return filePath.includes("/apps/web/skills/") || filePath.includes("/skills/");
}

export function resolveDesktopPublishedSkillVersion(skill: SkillDefinition): string {
  return readSkillVersion(skill) ?? "1.0.0";
}

export function resolveDesktopPublishedSkillTrustClass(
  skill: SkillDefinition,
): DesktopPackageTrustClass {
  return inferBuiltInSkill(skill) ? "built_in_verified" : "org_verified";
}

export function resolveDesktopPackageState(input: {
  packageId: string;
  signerId: string;
  revocationFeed: DesktopRevocationFeedSnapshot;
}): DesktopPackageState {
  if (input.revocationFeed.revokedPackageIds.includes(input.packageId)) {
    return "revoked";
  }
  if (input.revocationFeed.revokedSignerIds.includes(input.signerId)) {
    return "revoked";
  }
  return "trusted";
}

export function buildDesktopSkillCatalogItem(input: {
  skill: SkillDefinition;
  signer: DesktopPackageSigner;
  revocationFeed: DesktopRevocationFeedSnapshot;
}): DesktopPackageCatalogItem {
  const trustClass = resolveDesktopPublishedSkillTrustClass(input.skill);

  return {
    packageId: input.skill.id,
    name: input.skill.name,
    packageType: "skill_package",
    runtimeDestination: "pi",
    trustClass,
    state: resolveDesktopPackageState({
      packageId: input.skill.id,
      signerId: input.signer.signerId,
      revocationFeed: input.revocationFeed,
    }),
    version: resolveDesktopPublishedSkillVersion(input.skill),
    signerId: input.signer.signerId,
    signerKeyVersion: input.signer.keyVersion,
    summary: input.skill.description ?? null,
    availableOnDesktop: true,
    source: trustClass === "built_in_verified" ? "built_in" : "skill_registry",
  };
}

function computeSha256Hex(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function walkFiles(rootDir: string): string[] {
  const files: string[] = [];

  function visit(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  visit(rootDir);
  return files;
}

function computeDirectoryDigest(rootDir: string): string {
  const hash = crypto.createHash("sha256");
  for (const filePath of walkFiles(rootDir)) {
    hash.update(path.relative(rootDir, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function buildCapabilityDigest(skill: SkillDefinition): string {
  const policy = resolveEffectiveLocalSkillExecutionPolicy({
    skill,
    platform: "tauri",
    featureEnabled: true,
    forceCloudOnly: false,
    userEnabled: true,
    executionMode: "prefer_local",
  });

  return computeSha256Hex(
    JSON.stringify({
      eligible: policy.eligible,
      tier: policy.tier,
      runtimeKind: policy.runtimeKind,
      allowOffline: policy.allowOffline,
      requiresTauri: policy.requiresTauri,
      localScriptManifest: policy.localScriptManifest
        ? {
            runtimeKind: policy.localScriptManifest.runtimeKind,
            permissionProfile: policy.localScriptManifest.permissionProfile,
            artifactDigestSha256: policy.localScriptManifest.artifactDigestSha256,
          }
        : null,
    }),
  );
}

function assertServerPublishableTrustClass(trustClass: DesktopPackageTrustClass): void {
  if (trustClass === "local_unverified" || trustClass === "project_local") {
    throw new Error(
      `Server-published desktop packages cannot use ${trustClass.replace("_", "-")} trust class`,
    );
  }
}

function assertProtocolCompatible(
  currentProtocolVersion: string,
  envelope: SignedDesktopPackageEnvelope,
): void {
  const minimum = envelope.manifest.compatibilityRange.minDesktopHostProtocolVersion;
  const maximum = envelope.manifest.compatibilityRange.maxDesktopHostProtocolVersion;

  if (currentProtocolVersion < minimum) {
    throw new Error("package compatibility metadata requires a newer desktop host protocol");
  }

  if (maximum && currentProtocolVersion > maximum) {
    throw new Error("package compatibility metadata blocks this desktop host protocol");
  }
}

export function buildDesktopSkillPackageEnvelope(
  input: BuildDesktopSkillPackageEnvelopeInput,
): SignedDesktopPackageEnvelope {
  assertServerPublishableTrustClass(input.trustClass);

  if (!input.skill.skillFilePath) {
    throw new Error("skillFilePath is required for package registry publication");
  }

  const skillDir = path.dirname(input.skill.skillFilePath);
  const bundleDir = resolveSkillBundleDir(skillDir);
  const manifestPath = resolveSkillManifestPath(skillDir);
  if (!bundleDir || !manifestPath) {
    throw new Error("skill bundle and manifest must exist before package publication");
  }

  const payloadDigest = computeDirectoryDigest(bundleDir);
  const capabilityManifestDigest = buildCapabilityDigest(input.skill);

  return signDesktopPackageEnvelope({
    manifest: {
      packageId: input.skill.id,
      version: input.version,
      packageType: "skill_package",
      runtimeDestination: "pi",
      trustClass: input.trustClass,
      capabilityManifestDigest,
      payloadDigest,
      compatibilityRange: {
        minDesktopHostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        maxDesktopHostProtocolVersion: null,
        supportedRuntimeDestinations: ["pi"],
      },
      payload: {
        entryKind: "skill_bundle",
        relativeBundlePath: path.relative(process.cwd(), bundleDir) || path.basename(bundleDir),
        manifestPath: path.relative(process.cwd(), manifestPath) || path.basename(manifestPath),
      },
    },
    signer: input.signer,
  });
}

export function buildDesktopMaterializationDescriptor(
  input: BuildDesktopMaterializationDescriptorInput,
): DesktopMaterializationDescriptor {
  const envelope = signedDesktopPackageEnvelopeSchema.parse(input.envelope);
  const verification = verifyDesktopPackageEnvelope(envelope, {
    resolveSignerSecret: input.resolveSignerSecret,
  });
  if (!verification.valid) {
    throw new Error(`signature verification failed: ${verification.reason}`);
  }

  assertProtocolCompatible(input.currentProtocolVersion, envelope);

  if (
    isDesktopPackageOrSignerRevoked({
      packageId: envelope.manifest.packageId,
      signerId: envelope.signer.signerId,
      revocationFeed: input.revocationFeed,
    })
  ) {
    throw new Error("package or signer has been revoked");
  }

  return {
    packageId: envelope.manifest.packageId,
    packageVersion: envelope.manifest.version,
    trustClass: envelope.manifest.trustClass,
    runtimeDestination: envelope.manifest.runtimeDestination,
    localBundlePath: input.localBundlePath,
    capabilityManifestDigest: envelope.manifest.capabilityManifestDigest,
    payloadDigest: envelope.manifest.payloadDigest,
    signerId: envelope.signer.signerId,
    revocationCheckedAt: input.revocationFeed.generatedAt,
  };
}

export function assertDesktopArtifactPromotionAllowed(input: {
  sourceTrustClass: DesktopPackageTrustClass;
  destinationSurface: "org_verified_registry" | "shared_run_history" | "device_local";
}): void {
  const trustTainted =
    input.sourceTrustClass === "local_unverified"
    || input.sourceTrustClass === "project_local";
  if (trustTainted && input.destinationSurface === "org_verified_registry") {
    throw new Error(
      "trust-tainted desktop artifacts requires review before promotion into verified organization surfaces",
    );
  }
}
