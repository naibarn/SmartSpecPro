import crypto from "node:crypto";

import { auditLogger } from "./auditLogger";
import { buildDesktopOffboardingPlan, type DesktopOffboardingPlan } from "./desktopPolicyService";
import type { DesktopLocalRoot } from "../../shared/desktopHost";

export type DesktopEnrollmentChallengePurpose = "bootstrap" | "refresh" | "rekey";

export interface CreateDesktopEnrollmentChallengeInput {
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  purpose?: DesktopEnrollmentChallengePurpose;
  deviceKeyVersion?: number;
  issuedAtEpochMs?: number;
  ttlSeconds?: number;
}

export interface DesktopEnrollmentChallenge {
  challengeId: string;
  tenantId: string;
  deviceId: string;
  purpose: DesktopEnrollmentChallengePurpose;
  deviceKeyVersion: number;
  nonce: string;
  devicePublicKeyDigest: string;
  issuedAt: string;
  issuedAtEpochMs: number;
  expiresAt: string;
  expiresAtEpochMs: number;
  challengeSha256: string;
}

export interface VerifyDesktopEnrollmentProofInput {
  challenge: DesktopEnrollmentChallenge;
  proofSha256: string;
  devicePublicKey: string;
  deviceSharedSecret: string;
  nowEpochMs?: number;
}

export interface DesktopRuntimeTokenBinding {
  tenantId: string;
  deviceId: string;
  runtimeScope: "desktop_runtime" | "desktop_refresh";
  challengeId: string;
  deviceKeyVersion: number;
  proofSha256: string;
  bindingSha256: string;
}

export interface DesktopRekeyBinding {
  tenantId: string;
  deviceId: string;
  previousBindingSha256: string;
  nextDeviceKeyVersion: number;
  nextDevicePublicKeyDigest: string;
  bindingSha256: string;
}

export interface VerifyDesktopAsymmetricEnrollmentProofInput {
  challenge: DesktopEnrollmentChallenge;
  signatureBase64: string;
  devicePublicKeyPem: string;
  nowEpochMs?: number;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEnrollmentPurpose(
  purpose: DesktopEnrollmentChallengePurpose | undefined,
): DesktopEnrollmentChallengePurpose {
  return purpose ?? "bootstrap";
}

function buildChallengeDigest(input: {
  challengeId: string;
  tenantId: string;
  deviceId: string;
  purpose: DesktopEnrollmentChallengePurpose;
  deviceKeyVersion: number;
  nonce: string;
  devicePublicKeyDigest: string;
  issuedAtEpochMs: number;
  expiresAtEpochMs: number;
}): string {
  return sha256Hex(
    [
      input.challengeId,
      input.tenantId,
      input.deviceId,
      input.purpose,
      String(input.deviceKeyVersion),
      input.nonce,
      input.devicePublicKeyDigest,
      String(input.issuedAtEpochMs),
      String(input.expiresAtEpochMs),
    ].join(":"),
  );
}

export function buildDesktopEnrollmentProofDigest(input: {
  challenge: DesktopEnrollmentChallenge;
  devicePublicKey: string;
  deviceSharedSecret: string;
}): string {
  const devicePublicKeyDigest = sha256Hex(input.devicePublicKey);
  return sha256Hex(
    [
      input.challenge.challengeId,
      input.challenge.tenantId,
      input.challenge.deviceId,
      input.challenge.purpose,
      String(input.challenge.deviceKeyVersion),
      input.challenge.nonce,
      devicePublicKeyDigest,
      String(input.challenge.expiresAtEpochMs),
      input.deviceSharedSecret,
    ].join(":"),
  );
}

export function buildDesktopEnrollmentSignaturePayload(
  challenge: DesktopEnrollmentChallenge,
): string {
  return [
    challenge.challengeId,
    challenge.tenantId,
    challenge.deviceId,
    challenge.purpose,
    String(challenge.deviceKeyVersion),
    challenge.nonce,
    challenge.devicePublicKeyDigest,
    String(challenge.issuedAtEpochMs),
    String(challenge.expiresAtEpochMs),
    challenge.challengeSha256,
  ].join(":");
}

export function buildDesktopAsymmetricProofDigest(signatureBase64: string): string {
  return sha256Hex(signatureBase64);
}

export function createDesktopEnrollmentChallenge(
  input: CreateDesktopEnrollmentChallengeInput,
): DesktopEnrollmentChallenge {
  const issuedAtEpochMs = input.issuedAtEpochMs ?? Date.now();
  const ttlSeconds = input.ttlSeconds ?? 300;
  const deviceKeyVersion = input.deviceKeyVersion ?? 1;
  const purpose = normalizeEnrollmentPurpose(input.purpose);
  if (ttlSeconds <= 0) {
    throw new Error("ttlSeconds must be greater than zero");
  }
  if (deviceKeyVersion <= 0) {
    throw new Error("deviceKeyVersion must be greater than zero");
  }
  const expiresAtEpochMs = issuedAtEpochMs + ttlSeconds * 1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const challengeId = crypto.randomBytes(12).toString("hex");
  const devicePublicKeyDigest = sha256Hex(input.devicePublicKey);
  const challenge = {
    challengeId,
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    purpose,
    deviceKeyVersion,
    nonce,
    devicePublicKeyDigest,
    issuedAt: new Date(issuedAtEpochMs).toISOString(),
    issuedAtEpochMs,
    expiresAt: new Date(expiresAtEpochMs).toISOString(),
    expiresAtEpochMs,
    challengeSha256: buildChallengeDigest({
      challengeId,
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      purpose,
      deviceKeyVersion,
      nonce,
      devicePublicKeyDigest,
      issuedAtEpochMs,
      expiresAtEpochMs,
    }),
  };

  auditLogger.log({
    eventType: "desktop_host_device_enrolled",
    metadata: {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      stage: "challenge_created",
      challengeId,
      purpose,
      deviceKeyVersion,
    },
  });

  return challenge;
}

export function verifyDesktopEnrollmentProof(
  input: VerifyDesktopEnrollmentProofInput,
): boolean {
  if (input.deviceSharedSecret.trim().length === 0) {
    return false;
  }
  const expectedChallengeDigest = buildChallengeDigest({
    challengeId: input.challenge.challengeId,
    tenantId: input.challenge.tenantId,
    deviceId: input.challenge.deviceId,
    purpose: input.challenge.purpose,
    deviceKeyVersion: input.challenge.deviceKeyVersion,
    nonce: input.challenge.nonce,
    devicePublicKeyDigest: input.challenge.devicePublicKeyDigest,
    issuedAtEpochMs: input.challenge.issuedAtEpochMs,
    expiresAtEpochMs: input.challenge.expiresAtEpochMs,
  });
  if (expectedChallengeDigest !== input.challenge.challengeSha256) {
    return false;
  }
  if (input.nowEpochMs !== undefined && input.nowEpochMs > input.challenge.expiresAtEpochMs) {
    return false;
  }
  const presentedPublicKeyDigest = sha256Hex(input.devicePublicKey);
  if (presentedPublicKeyDigest !== input.challenge.devicePublicKeyDigest) {
    return false;
  }
  const expected = buildDesktopEnrollmentProofDigest({
    challenge: input.challenge,
    devicePublicKey: input.devicePublicKey,
    deviceSharedSecret: input.deviceSharedSecret,
  });
  return expected === input.proofSha256;
}

export function verifyDesktopAsymmetricEnrollmentProof(
  input: VerifyDesktopAsymmetricEnrollmentProofInput,
): boolean {
  const expectedChallengeDigest = buildChallengeDigest({
    challengeId: input.challenge.challengeId,
    tenantId: input.challenge.tenantId,
    deviceId: input.challenge.deviceId,
    purpose: input.challenge.purpose,
    deviceKeyVersion: input.challenge.deviceKeyVersion,
    nonce: input.challenge.nonce,
    devicePublicKeyDigest: input.challenge.devicePublicKeyDigest,
    issuedAtEpochMs: input.challenge.issuedAtEpochMs,
    expiresAtEpochMs: input.challenge.expiresAtEpochMs,
  });
  if (expectedChallengeDigest !== input.challenge.challengeSha256) {
    return false;
  }
  if (input.nowEpochMs !== undefined && input.nowEpochMs > input.challenge.expiresAtEpochMs) {
    return false;
  }
  if (sha256Hex(input.devicePublicKeyPem) !== input.challenge.devicePublicKeyDigest) {
    return false;
  }
  try {
    return crypto.verify(
      null,
      Buffer.from(buildDesktopEnrollmentSignaturePayload(input.challenge)),
      input.devicePublicKeyPem,
      Buffer.from(input.signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

export function buildDesktopRuntimeTokenBinding(input: {
  tenantId: string;
  deviceId: string;
  runtimeScope: "desktop_runtime" | "desktop_refresh";
  challengeId: string;
  deviceKeyVersion: number;
  proofSha256: string;
}): DesktopRuntimeTokenBinding {
  return {
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    runtimeScope: input.runtimeScope,
    challengeId: input.challengeId,
    deviceKeyVersion: input.deviceKeyVersion,
    proofSha256: input.proofSha256,
    bindingSha256: sha256Hex(
      [
        input.tenantId,
        input.deviceId,
        input.runtimeScope,
        input.challengeId,
        String(input.deviceKeyVersion),
        input.proofSha256,
      ].join(":"),
    ),
  };
}

export function buildDesktopRekeyBinding(input: {
  tenantId: string;
  deviceId: string;
  previousBindingSha256: string;
  nextDevicePublicKey: string;
  nextDeviceKeyVersion: number;
}): DesktopRekeyBinding {
  const nextDevicePublicKeyDigest = sha256Hex(input.nextDevicePublicKey);
  return {
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    previousBindingSha256: input.previousBindingSha256,
    nextDeviceKeyVersion: input.nextDeviceKeyVersion,
    nextDevicePublicKeyDigest,
    bindingSha256: sha256Hex(
      [
        input.tenantId,
        input.deviceId,
        input.previousBindingSha256,
        String(input.nextDeviceKeyVersion),
        nextDevicePublicKeyDigest,
      ].join(":"),
    ),
  };
}

export function detectDesktopCloneSuspicion(input: {
  registeredPublicKeyDigest: string;
  presentedPublicKeyDigest: string;
  registeredDeviceKeyVersion?: number;
  presentedDeviceKeyVersion?: number;
}): boolean {
  if (input.registeredPublicKeyDigest !== input.presentedPublicKeyDigest) {
    return true;
  }
  if (
    input.registeredDeviceKeyVersion !== undefined
    && input.presentedDeviceKeyVersion !== undefined
    && input.registeredDeviceKeyVersion !== input.presentedDeviceKeyVersion
  ) {
    return true;
  }
  return false;
}

export function buildDesktopDeviceOffboarding(input: {
  deviceId: string;
  packageCachePaths?: string[];
  localRoots?: DesktopLocalRoot[];
}): DesktopOffboardingPlan {
  const plan = buildDesktopOffboardingPlan({
    deviceId: input.deviceId,
    packageCachePaths: input.packageCachePaths,
    localRoots: input.localRoots,
  });

  auditLogger.log({
    eventType: "desktop_host_device_offboarded",
    metadata: {
      deviceId: input.deviceId,
      packageCachePaths: input.packageCachePaths ?? [],
      localRootIds: (input.localRoots ?? []).map((root) => root.rootId),
    },
  });

  return plan;
}
