export type CloudflareArtifactPublishFailure = Readonly<{
  phase: string;
  rootErrorCategory: string;
  diagnosticCode: string;
  retryable: boolean;
  timeoutResource: { kind: string; code: string | null } | null;
  providerDiagnostics: {
    errorName: string | null;
    errorCode: string | null;
    httpStatus: number | null;
    requestId: string | null;
    attempts: number | null;
    retryDelayMs: number | null;
  };
}>;

function safeCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)
    ? value
    : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function classifyCloudflareArtifactPublishFailure(
  error: unknown,
  phase: string,
): CloudflareArtifactPublishFailure {
  const value = error && typeof error === "object" ? error as Record<string, any> : {};
  const metadata = value.$metadata && typeof value.$metadata === "object" ? value.$metadata as Record<string, any> : {};
  const chain: Record<string, any>[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object" && !chain.includes(current as Record<string, any>); depth++) {
    chain.push(current as Record<string, any>);
    current = (current as Record<string, any>).cause;
  }
  const name = chain.map(item => safeCode(item.name)).find(Boolean) ?? null;
  const code = chain.map(item => safeCode(item.Code) ?? safeCode(item.code) ?? safeCode(item.CodeName)).find(Boolean) ?? null;
  const status = safeNumber(metadata.httpStatusCode) ?? chain.map(item => safeNumber(item.statusCode) ?? safeNumber(item.status)).find(value => value !== null) ?? null;
  const internalCode = chain.map(item => item instanceof Error && /^[A-Z][A-Z0-9_]{4,99}$/.test(item.message) ? item.message : null).find(Boolean) ?? null;
  const networkTimeoutCodes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);
  const filesystemResourceCodes = new Set(["ENOSPC", "EMFILE", "ENFILE", "ENOMEM"]);
  const timeoutCode = code && networkTimeoutCodes.has(code) ? code : null;
  const filesystemCode = code && filesystemResourceCodes.has(code) ? code : null;
  const timeoutByName = name === "TimeoutError" || name === "AbortError" || name === "RequestTimeout";
  const timeoutResource = timeoutCode || timeoutByName
    ? { kind: "timeout", code: timeoutCode ?? name }
    : filesystemCode
      ? { kind: "resource_exhaustion", code: filesystemCode }
      : null;

  let rootErrorCategory = "provider_error";
  if (internalCode?.startsWith("STORAGE_")) rootErrorCategory = "storage_configuration_or_integrity";
  else if (internalCode?.startsWith("CLOUDFLARE_BUILD_RECEIPT")) rootErrorCategory = "build_receipt_validation";
  else if (internalCode?.startsWith("CLOUDFLARE_ARTIFACT")) rootErrorCategory = "artifact_validation_or_integrity";
  else if (timeoutResource) rootErrorCategory = timeoutResource.kind;
  else if (status === 401 || status === 403) rootErrorCategory = "provider_authorization";
  else if (status === 408 || status === 429 || (status !== null && status >= 500)) rootErrorCategory = "provider_transient";
  else if (status !== null && status >= 400) rootErrorCategory = "provider_rejected_request";
  else if (code?.startsWith("ENOTFOUND") || code?.startsWith("EAI_")) rootErrorCategory = "provider_network";

  const retryable = timeoutResource?.kind === "timeout" || status === 408 || status === 429 || (status !== null && status >= 500) ||
    rootErrorCategory === "provider_network";
  return {
    phase: /^[a-z0-9_]{1,64}$/.test(phase) ? phase : "unknown",
    rootErrorCategory,
    diagnosticCode: internalCode ?? code ?? name ?? "ARTIFACT_PUBLISH_FAILED",
    retryable,
    timeoutResource,
    providerDiagnostics: {
      errorName: name,
      errorCode: code,
      httpStatus: status,
      requestId: safeCode(metadata.requestId) ?? safeCode(metadata.extendedRequestId),
      attempts: safeNumber(metadata.attempts),
      retryDelayMs: safeNumber(metadata.totalRetryDelay),
    },
  };
}
