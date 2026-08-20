import { z } from "zod";

export const connectedDeviceStatusSchema = z.enum([
  "active",
  "offline",
  "expired",
  "revoked",
]);
export type ConnectedDeviceStatus = z.infer<typeof connectedDeviceStatusSchema>;

export const connectedDeviceRecordSchema = z.object({
  deviceId: z.string().min(1),
  displayName: z.string().min(1),
  runtimeType: z.string().min(1),
  authKind: z.string().min(1),
  connectionMethod: z.string().min(1),
  platform: z.string().nullable(),
  architecture: z.string().nullable(),
  deviceFingerprint: z.string().nullable(),
  scopes: z.array(z.string()),
  allowedScopes: z.array(z.string()),
  permissionPolicyCustomized: z.boolean(),
  effectiveScopes: z.array(z.string()),
  status: connectedDeviceStatusSchema,
  approvedAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  accessTokenExpiresAt: z.string().nullable(),
  refreshTokenExpiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedByUserId: z.number().int().nullable(),
  revocationReason: z.string().nullable(),
  workerId: z.string().nullable(),
  workerStatus: z.string().nullable().optional(),
  workerRuntimeVersion: z.string().nullable().optional(),
  workerLastSeenAt: z.string().nullable().optional(),
  consentId: z.string().nullable(),
  tenantId: z.string().min(1).nullable().optional(),
  tenantName: z.string().min(1).nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  clientOrigin: z.string().nullable().optional(),
  redirectUri: z.string().nullable().optional(),
});

export type ConnectedDeviceRecord = z.infer<typeof connectedDeviceRecordSchema>;
