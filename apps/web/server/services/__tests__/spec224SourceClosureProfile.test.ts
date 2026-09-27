import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateSourceClosureProfile,
  parseSourceClosureProfile,
  type SourceClosureProfile,
} from "../spec224SourceClosureProfile";

describe("Spec 224 source closure profile", () => {
  it("rejects unknown profile fields instead of silently accepting drift", () => {
    expect(() => parseSourceClosureProfile({
      schemaVersion: "spec224.source-closure-profile.v1",
      profileId: "test-profile",
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [],
      workspaceManifestPaths: [],
      selectedPackageScripts: [],
      includeDevelopmentDependencies: false,
      moduleRoots: [],
      runtimeIdentity: { node: "22.22.3", python: null, packageManager: "pnpm@10.4.1", platform: "linux-x64", pythonCompatibility: null },
      selectedOptionalDependencies: [],
      selectedPythonDependencyGroups: [],
      selectedPythonExtras: [],
      runtimeEvidence: {
        baseImageDigest: null,
        observedPlatform: null,
        nodeAbi: null,
        pythonVersion: null,
        artifactStoreRef: null,
        provenanceAttestationRef: null,
        nativeBuildEvidenceRef: null,
        lifecyclePolicyRef: null,
      },
      unexpectedAdmissionOverride: true,
    })).toThrow("SPEC224_SOURCE_PROFILE_SCHEMA_INVALID");
  });

  it("keeps a statically complete fixture blocked when target and artifact attestations are absent", async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), "spec224-profile-report-"));
    await mkdir(join(sourceRoot, "src"));
    await writeFile(join(sourceRoot, "src/main.ts"), "export const ok = true;\n");
    await writeFile(join(sourceRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(sourceRoot, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0" }));
    const profile: SourceClosureProfile = {
      schemaVersion: "spec224.source-closure-profile.v1",
      profileId: "fixture-profile",
      entryPaths: ["src/main.ts"],
      dependencyArtifacts: ["pnpm-lock.yaml"],
      profileInputs: [{ path: "package.json", kind: "runtime-config" }],
      workspaceManifestPaths: [],
      selectedPackageScripts: [],
      includeDevelopmentDependencies: false,
      moduleRoots: [],
      runtimeIdentity: { node: "22.22.3", python: null, packageManager: "pnpm@10.4.1", platform: "linux-x64", pythonCompatibility: null },
      selectedOptionalDependencies: [],
      selectedPythonDependencyGroups: [],
      selectedPythonExtras: [],
      runtimeEvidence: {
        baseImageDigest: null,
        observedPlatform: null,
        nodeAbi: null,
        pythonVersion: null,
        artifactStoreRef: null,
        provenanceAttestationRef: null,
        nativeBuildEvidenceRef: null,
        lifecyclePolicyRef: null,
      },
      scopeBoundaries: [],
    };

    try {
      const report = await evaluateSourceClosureProfile({ sourceRoot, profile });

      expect(report).toMatchObject({
        status: "BLOCKED",
        admissionEligible: false,
        runtimeIdentity: profile.runtimeIdentity,
      });
      expect(report.blockers).toEqual(expect.arrayContaining([
        "RUNTIME_BASE_IMAGE_DIGEST_MISSING",
        "RUNTIME_PLATFORM_ATTESTATION_MISSING",
        "NODE_ABI_EVIDENCE_MISSING",
        "ARTIFACT_STORE_REFERENCE_MISSING",
        "ARTIFACT_PROVENANCE_ATTESTATION_MISSING",
        "NATIVE_BUILD_EVIDENCE_MISSING",
        "LIFECYCLE_POLICY_EVIDENCE_MISSING",
      ]));
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});
