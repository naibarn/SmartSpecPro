/** Run inside the existing Owner browser. Credentials never leave same-origin
 * fetch and are never copied into a grant, job payload, log or CLI process. */
export async function verifyCloudflareIngressInBrowser(
  input: {
    jobId: string;
    requesterUserId: number;
    tenantId: string;
    receipt: { routeId: string; deploymentId: string; versionId: string };
  },
  fetchImpl: typeof fetch = fetch
) {
  async function request(path: string, body?: unknown) {
    const response = await fetchImpl(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify({ json: body }) }),
    });
    if (
      !response.ok ||
      response.headers.get("x-smartaihub-ingress") !== "cloudflare-worker" ||
      response.headers.get("x-smartaihub-application-runtime") !==
        "linux-origin"
    )
      throw new Error("INGRESS_LIVE_PATH_FAILED");
    return response.json();
  }
  let passed = false;
  try {
    const health = await request("/health");
    if (health.status !== "ok") throw new Error("INGRESS_LIVE_HEALTH_FAILED");
    const me = (await request("/trpc/auth.me")).result?.data?.json;
    if (
      me?.id !== input.requesterUserId ||
      me?.currentTenantId !== input.tenantId
    )
      throw new Error("INGRESS_LIVE_SESSION_FAILED");
    const preferences = await request("/trpc/users.getPreferences");
    if (preferences.error || !preferences.result?.data?.json)
      throw new Error("INGRESS_LIVE_AUTH_READ_FAILED");
    passed = true;
  } catch {
    /* The canonical executor compensates on an explicit failure or timeout. */
  }
  // This authenticated, CSRF-protected mutation is itself the representative
  // authorized write. It records only this job's observation, not user settings.
  const result = await request(
    "/trpc/infrastructure.recordCloudflareProductionIngressAcceptance",
    {
      jobId: input.jobId,
      receipt: input.receipt,
      passed,
    }
  );
  if (result.result?.data?.json?.recorded !== true)
    throw new Error("INGRESS_LIVE_RECEIPT_NOT_RECORDED");
  return { passed };
}
