import crypto from "crypto";

import { z } from "zod";

import { desktopPackageTrustClassSchema } from "../../shared/desktopHost";

export const desktopPackageTypeValues = [
  "skill_package",
  "agency_pack",
  "hybrid_pack",
  "tooling_pack",
  "runtime_support_pack",
] as const;

export const desktopRuntimeDestinationValues = [
  "pi",
  "agency_swarm",
  "desktop_host",
  "hybrid",
] as const;

export const desktopPayloadEntryKindValues = [
  "skill_bundle",
  "agency_definition",
  "hybrid_bundle",
  "runtime_support_bundle",
] as const;

export const desktopPackageTypeSchema = z.enum(desktopPackageTypeValues);
export const desktopRuntimeDestinationSchema = z.enum(
  desktopRuntimeDestinationValues,
);
export const desktopPayloadEntryKindSchema = z.enum(
  desktopPayloadEntryKindValues,
);

export const desktopPackageCompatibilityRangeSchema = z.object({
  minDesktopHostProtocolVersion: z.string().min(1),
  maxDesktopHostProtocolVersion: z.string().min(1).nullable().optional().default(null),
  supportedRuntimeDestinations: z.array(desktopRuntimeDestinationSchema).min(1),
});

export const desktopPackagePayloadSchema = z.object({
  entryKind: desktopPayloadEntryKindSchema,
  relativeBundlePath: z.string().min(1),
  manifestPath: z.string().min(1),
});

export const desktopPackageManifestSchema = z.object({
  packageId: z.string().min(1),
  version: z.string().min(1),
  packageType: desktopPackageTypeSchema,
  runtimeDestination: desktopRuntimeDestinationSchema,
  trustClass: desktopPackageTrustClassSchema,
  capabilityManifestDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  compatibilityRange: desktopPackageCompatibilityRangeSchema,
  payload: desktopPackagePayloadSchema,
});

export const desktopPackageSignerSchema = z.object({
  signerId: z.string().min(1),
  keyVersion: z.string().min(1),
});

export const signedDesktopPackageEnvelopeSchema = z.object({
  manifest: desktopPackageManifestSchema,
  signer: desktopPackageSignerSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
  signedAt: z.string().datetime(),
});

export type DesktopPackageManifest = z.infer<typeof desktopPackageManifestSchema>;
export type DesktopPackageSigner = z.infer<typeof desktopPackageSignerSchema>;
export type SignedDesktopPackageEnvelope = z.infer<
  typeof signedDesktopPackageEnvelopeSchema
>;

export interface SignDesktopPackageEnvelopeInput {
  manifest: DesktopPackageManifest;
  signer: DesktopPackageSigner & {
    signerSecret: string;
  };
  signedAt?: string;
}

export interface VerifyDesktopPackageEnvelopeInput {
  resolveSignerSecret: (signer: DesktopPackageSigner) => string | null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function computeSha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function computeHmacSha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function buildSignedPayload(
  manifest: DesktopPackageManifest,
  signer: DesktopPackageSigner,
): string {
  return stableStringify({ manifest, signer });
}

export function computeDesktopPackageManifestFingerprint(
  manifest: DesktopPackageManifest,
): string {
  return computeSha256Hex(stableStringify(manifest));
}

export function signDesktopPackageEnvelope(
  input: SignDesktopPackageEnvelopeInput,
): SignedDesktopPackageEnvelope {
  const manifest = desktopPackageManifestSchema.parse(input.manifest);
  const signer = desktopPackageSignerSchema.parse(input.signer);
  const signedPayload = buildSignedPayload(manifest, signer);

  return signedDesktopPackageEnvelopeSchema.parse({
    manifest,
    signer,
    signature: computeHmacSha256Hex(input.signer.signerSecret, signedPayload),
    signedAt: input.signedAt ?? new Date().toISOString(),
  });
}

export function verifyDesktopPackageEnvelope(
  envelope: SignedDesktopPackageEnvelope,
  input: VerifyDesktopPackageEnvelopeInput,
): { valid: boolean; reason: "verified" | "missing_signer_secret" | "signature_mismatch" } {
  const parsed = signedDesktopPackageEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    return { valid: false, reason: "signature_mismatch" };
  }

  const signerSecret = input.resolveSignerSecret(parsed.data.signer);
  if (!signerSecret) {
    return { valid: false, reason: "missing_signer_secret" };
  }

  const expectedSignature = computeHmacSha256Hex(
    signerSecret,
    buildSignedPayload(parsed.data.manifest, parsed.data.signer),
  );
  if (expectedSignature !== parsed.data.signature) {
    return { valid: false, reason: "signature_mismatch" };
  }

  return { valid: true, reason: "verified" };
}
