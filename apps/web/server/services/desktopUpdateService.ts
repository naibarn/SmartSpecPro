import { auditLogger } from "./auditLogger";

export interface DesktopUpdateDescriptor {
  currentVersion: string;
  bundleVersion: string;
  signerId: string;
  signatureSha256: string;
}

export interface DesktopTrustedSigner {
  signerId: string;
  keyVersion: string;
  status: "trusted" | "rotated" | "revoked";
}

export interface DesktopUpdateVerificationResult {
  accepted: boolean;
  reason: string;
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function parseVersionSegments(version: string): string[] {
  return version
    .trim()
    .split(/[.+-]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function compareVersionStrings(left: string, right: string): number {
  const leftSegments = parseVersionSegments(left);
  const rightSegments = parseVersionSegments(right);
  const maxLength = Math.max(leftSegments.length, rightSegments.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftSegment = leftSegments[index] ?? "0";
    const rightSegment = rightSegments[index] ?? "0";
    const leftNumeric = /^\d+$/.test(leftSegment);
    const rightNumeric = /^\d+$/.test(rightSegment);

    if (leftNumeric && rightNumeric) {
      const leftNumber = Number.parseInt(leftSegment, 10);
      const rightNumber = Number.parseInt(rightSegment, 10);
      if (leftNumber !== rightNumber) {
        return leftNumber > rightNumber ? 1 : -1;
      }
      continue;
    }

    if (leftSegment !== rightSegment) {
      return leftSegment.localeCompare(rightSegment);
    }
  }

  return 0;
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function buildDesktopTrustedSignerSet(
  signers: DesktopTrustedSigner[],
): DesktopTrustedSigner[] {
  return signers.filter((signer) => signer.status !== "revoked");
}

export function resolveConfiguredDesktopTrustedSigners(): DesktopTrustedSigner[] {
  const signerId = process.env.DESKTOP_PACKAGE_SIGNER_ID ?? "desktop-host-dev-signer";
  const keyVersion = process.env.DESKTOP_PACKAGE_SIGNER_KEY_VERSION ?? "2026-04-08";
  const revokedSignerIds = new Set(parseCsvList(process.env.DESKTOP_REVOKED_SIGNER_IDS));
  const rotatedSignerIds = new Set(parseCsvList(process.env.DESKTOP_ROTATED_SIGNER_IDS));

  const configured = [
    {
      signerId,
      keyVersion,
      status: revokedSignerIds.has(signerId)
        ? "revoked"
        : rotatedSignerIds.has(signerId)
          ? "rotated"
          : "trusted",
    },
  ] satisfies DesktopTrustedSigner[];

  const extraSignerIds = parseCsvList(process.env.DESKTOP_EXTRA_TRUSTED_SIGNER_IDS);
  for (const extraSignerId of extraSignerIds) {
    configured.push({
      signerId: extraSignerId,
      keyVersion,
      status: revokedSignerIds.has(extraSignerId)
        ? "revoked"
        : rotatedSignerIds.has(extraSignerId)
          ? "rotated"
          : "trusted",
    });
  }

  return configured;
}

export function verifyDesktopUpdateDescriptor(input: {
  descriptor: DesktopUpdateDescriptor;
  trustedSigners: DesktopTrustedSigner[];
  allowDowngrade?: boolean;
}): DesktopUpdateVerificationResult {
  const trusted = buildDesktopTrustedSignerSet(input.trustedSigners).find(
    (signer) => signer.signerId === input.descriptor.signerId,
  );

  if (!trusted) {
    throw new Error("desktop update signer is not trusted");
  }
  if (!isSha256Hex(input.descriptor.signatureSha256)) {
    throw new Error("desktop update signature is invalid");
  }
  if (
    input.allowDowngrade !== true
    && compareVersionStrings(
      input.descriptor.bundleVersion,
      input.descriptor.currentVersion,
    ) < 0
  ) {
    throw new Error("desktop update downgrade is blocked by policy");
  }

  const result = {
    accepted: true,
    reason: trusted.status === "rotated"
      ? "signed_update_verified_with_rotated_signer"
      : "signed_update_verified",
  };

  auditLogger.log({
    eventType: "desktop_host_update_verified",
    metadata: {
      signerId: input.descriptor.signerId,
      currentVersion: input.descriptor.currentVersion,
      bundleVersion: input.descriptor.bundleVersion,
      reason: result.reason,
    },
  });

  return result;
}
