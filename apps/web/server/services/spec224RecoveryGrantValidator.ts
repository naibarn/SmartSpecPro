import {
  getAppRuntimeConfig,
  getPreferredInternalToken,
} from "./appRuntimeConfig";

export const SPEC224_RECOVERY_GRANT_VALIDATION_SCHEMA =
  "spec224.recovery-grant-validation.v1" as const;

export type Spec224RecoveryGrantValidationResult =
  | "VALID"
  | "INVALID_NOT_FOUND"
  | "INVALID_TENANT"
  | "INVALID_OWNER"
  | "INVALID_AUTHORITY"
  | "INVALID_SCOPE"
  | "INVALID_BINDING"
  | "INVALID_AUDIT"
  | "INVALID_EXPIRED"
  | "INVALID_REVOKED"
  | "REQUIRES_REMOTE_TRUST"
  | "UNKNOWN";

export type Spec224RecoveryGrantValidationRequest = {
  grantId: string;
  tenantId: string;
  sourceCommit: string;
  sourceSha256: string;
  workpackageId: string;
  operation: string;
  path: string;
  runtimeScope: string;
  environmentScope: string;
  runtimeBinding?: Record<string, unknown>;
  admissionBinding?: Record<string, unknown>;
};

export type Spec224RecoveryGrantValidationDecision = {
  schemaVersion: typeof SPEC224_RECOVERY_GRANT_VALIDATION_SCHEMA;
  result: Spec224RecoveryGrantValidationResult;
  grantId: string | null;
  grantVersion: number | null;
  scopeDigest: string | null;
  validatedAt: string;
};

const KNOWN_RESULTS = new Set<Spec224RecoveryGrantValidationResult>([
  "VALID",
  "INVALID_NOT_FOUND",
  "INVALID_TENANT",
  "INVALID_OWNER",
  "INVALID_AUTHORITY",
  "INVALID_SCOPE",
  "INVALID_BINDING",
  "INVALID_AUDIT",
  "INVALID_EXPIRED",
  "INVALID_REVOKED",
  "REQUIRES_REMOTE_TRUST",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseDecision(
  value: unknown,
  expectedGrantId: string
): Spec224RecoveryGrantValidationDecision {
  if (!isRecord(value))
    throw new Error("SPEC224_GRANT_VALIDATION_RESPONSE_INVALID");
  if (
    value.schemaVersion !== SPEC224_RECOVERY_GRANT_VALIDATION_SCHEMA ||
    typeof value.result !== "string" ||
    !KNOWN_RESULTS.has(value.result as Spec224RecoveryGrantValidationResult) ||
    typeof value.valid !== "boolean" ||
    value.valid !== (value.result === "VALID") ||
    (value.result === "VALID" && value.grantId !== expectedGrantId) ||
    (value.grantId !== null && value.grantId !== expectedGrantId) ||
    (value.grantVersion !== null &&
      (!Number.isSafeInteger(value.grantVersion) ||
        Number(value.grantVersion) < 1)) ||
    (value.scopeDigest !== null &&
      (typeof value.scopeDigest !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.scopeDigest))) ||
    typeof value.validatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.validatedAt))
  ) {
    throw new Error("SPEC224_GRANT_VALIDATION_RESPONSE_INVALID");
  }
  return value as unknown as Spec224RecoveryGrantValidationDecision;
}

/** Calls the canonical Python grant authority. Every transport/schema failure is non-authorizing. */
export async function validateSpec224RecoveryGrant(
  request: Spec224RecoveryGrantValidationRequest
): Promise<Spec224RecoveryGrantValidationDecision> {
  const unknown: Spec224RecoveryGrantValidationDecision = {
    schemaVersion: SPEC224_RECOVERY_GRANT_VALIDATION_SCHEMA,
    result: "UNKNOWN",
    grantId: null,
    grantVersion: null,
    scopeDigest: null,
    validatedAt: new Date().toISOString(),
  };
  try {
    const [runtime, token] = await Promise.all([
      getAppRuntimeConfig(),
      getPreferredInternalToken(),
    ]);
    if (!token) return unknown;
    const response = await fetch(
      `${runtime.pythonBackendUrl}/api/v1/approvals/internal/spec224-recovery-grants/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-token": token,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!response.ok) return unknown;
    return parseDecision(await response.json(), request.grantId);
  } catch {
    return unknown;
  }
}
