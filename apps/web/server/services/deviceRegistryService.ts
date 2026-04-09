import {
  desktopDeviceRegistrationPayloadSchema,
  desktopHostFeatureFlagKeys,
  desktopHostFeatureFlagsSchema,
  desktopHostPolicySnapshotSchema,
  resolveDesktopWorkerProjectionRuntimeType,
  type DesktopDeviceRegistrationPayload,
  type DesktopHostFeatureFlags,
  type DesktopHostPolicySnapshot,
} from "../../shared/desktopHost";
import { FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../../shared/featureFlags";

export interface BuildDesktopHostPolicySnapshotInput {
  tenantId: string;
  deviceId: string;
  policyVersion: string;
  fetchedAt: string;
  expiresAt: string;
  trustFreshnessTtlSeconds: number;
  featureFlags?: Partial<TenantFeatureFlags> | Record<string, boolean> | null;
  workerProjectionEnabled?: boolean;
}

export function validateDesktopDeviceRegistrationPayload(
  input: unknown,
): DesktopDeviceRegistrationPayload {
  return desktopDeviceRegistrationPayloadSchema.parse(input);
}

export function resolveDesktopHostFeatureFlags(
  storedFlags: Partial<TenantFeatureFlags> | Record<string, boolean> | null | undefined,
): DesktopHostFeatureFlags {
  return desktopHostFeatureFlagsSchema.parse({
    desktopHostEnabled:
      typeof storedFlags?.desktopHostEnabled === "boolean"
        ? storedFlags.desktopHostEnabled
        : FEATURE_FLAG_DEFAULTS.desktopHostEnabled,
    desktopAdvancedLocalMode:
      typeof storedFlags?.desktopAdvancedLocalMode === "boolean"
        ? storedFlags.desktopAdvancedLocalMode
        : FEATURE_FLAG_DEFAULTS.desktopAdvancedLocalMode,
    desktopPackageSync:
      typeof storedFlags?.desktopPackageSync === "boolean"
        ? storedFlags.desktopPackageSync
        : FEATURE_FLAG_DEFAULTS.desktopPackageSync,
    desktopAgencyRuntime:
      typeof storedFlags?.desktopAgencyRuntime === "boolean"
        ? storedFlags.desktopAgencyRuntime
        : FEATURE_FLAG_DEFAULTS.desktopAgencyRuntime,
    desktopWorkerProjection:
      typeof storedFlags?.desktopWorkerProjection === "boolean"
        ? storedFlags.desktopWorkerProjection
        : FEATURE_FLAG_DEFAULTS.desktopWorkerProjection,
  });
}

export function buildDesktopHostPolicySnapshot(
  input: BuildDesktopHostPolicySnapshotInput,
): DesktopHostPolicySnapshot {
  const featureFlags = resolveDesktopHostFeatureFlags(input.featureFlags);
  const workerProjectionRuntimeType = resolveDesktopWorkerProjectionRuntimeType(
    input.workerProjectionEnabled ?? featureFlags.desktopWorkerProjection,
  );

  return desktopHostPolicySnapshotSchema.parse({
    policyVersion: input.policyVersion,
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    fetchedAt: input.fetchedAt,
    expiresAt: input.expiresAt,
    trustFreshnessTtlSeconds: input.trustFreshnessTtlSeconds,
    featureFlags,
    workerProjectionRuntimeType,
  });
}

export const DESKTOP_HOST_POLICY_FEATURE_FLAGS = desktopHostFeatureFlagKeys;
