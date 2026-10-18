function safeRuntimeValue(
  value: string | undefined,
  maxLength = 100
): string | null {
  const normalized = value?.trim();
  return normalized &&
    normalized.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
}

/** Reads only allowlisted, non-secret fields needed to correlate backend diagnostics. */
export function getSpec224BackendRuntimeIdentity(
  env: NodeJS.ProcessEnv = process.env
) {
  const environment =
    safeRuntimeValue(env.APP_ENV) ??
    safeRuntimeValue(env.NODE_ENV) ??
    "unknown";
  const runtimeRevision =
    safeRuntimeValue(env.RELEASE) ?? safeRuntimeValue(env.COMMIT_SHA) ?? null;
  const instanceId =
    safeRuntimeValue(env.SMARTSPEC_RUNTIME_ID) ??
    `${environment}:pid-${process.pid}`;
  return { environment, runtimeRevision, instanceId };
}
