import { describe, expect, it } from "vitest";

import { DESKTOP_HOST_PROTOCOL_VERSION } from "../../../shared/desktopHost";
import {
  signDesktopPackageEnvelope,
  verifyDesktopPackageEnvelope,
} from "../packageSigningService";

function makeManifest() {
  return {
    packageId: "storyboard-writer",
    version: "1.0.0",
    packageType: "skill_package" as const,
    runtimeDestination: "pi" as const,
    trustClass: "org_verified" as const,
    capabilityManifestDigest: "a".repeat(64),
    payloadDigest: "b".repeat(64),
    compatibilityRange: {
      minDesktopHostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
      maxDesktopHostProtocolVersion: null,
      supportedRuntimeDestinations: ["pi" as const],
    },
    payload: {
      entryKind: "skill_bundle" as const,
      relativeBundlePath: "skills/storyboard-writer",
      manifestPath: "skills/storyboard-writer/SKILL.md",
    },
  };
}

describe("packageSigningService", () => {
  it("signs and verifies a desktop package envelope", () => {
    const envelope = signDesktopPackageEnvelope({
      manifest: makeManifest(),
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "top-secret-signing-key",
      },
    });

    const verification = verifyDesktopPackageEnvelope(envelope, {
      resolveSignerSecret: ({ signerId, keyVersion }) =>
        signerId === "org-signer-1" && keyVersion === "2026-04"
          ? "top-secret-signing-key"
          : null,
    });

    expect(verification.valid).toBe(true);
    expect(verification.reason).toBe("verified");
  });

  it("fails closed when required digests are missing", () => {
    expect(() =>
      signDesktopPackageEnvelope({
        manifest: {
          ...makeManifest(),
          payloadDigest: "",
        },
        signer: {
          signerId: "org-signer-1",
          keyVersion: "2026-04",
          signerSecret: "top-secret-signing-key",
        },
      }),
    ).toThrow(/payloadDigest/i);
  });

  it("detects tampered manifests during verification", () => {
    const envelope = signDesktopPackageEnvelope({
      manifest: makeManifest(),
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "top-secret-signing-key",
      },
    });

    const verification = verifyDesktopPackageEnvelope(
      {
        ...envelope,
        manifest: {
          ...envelope.manifest,
          version: "1.0.1",
        },
      },
      {
        resolveSignerSecret: () => "top-secret-signing-key",
      },
    );

    expect(verification.valid).toBe(false);
    expect(verification.reason).toBe("signature_mismatch");
  });
});
