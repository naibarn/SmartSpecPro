import type { CloudflareEnvironment, ScheduledJobSweepHandler } from "./contracts";
import { proxyAuthToOrigin } from "./authOriginProxy";
import { resolvePrivatePlatformOrigin } from "./canonicalControlPlaneProxy";

const RETENTION_ENDPOINT = "/api/internal/spec260/schedules/evidence-retention";

export function spec260EvidenceRetentionOccurrence(scheduledTime: number): string {
  if (!Number.isFinite(scheduledTime) || scheduledTime <= 0) throw new Error("SPEC260_SCHEDULED_TIME_INVALID");
  const date = new Date(scheduledTime);
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 5) * 5, 0, 0);
  return `${date.toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
}

function retentionConfiguration(env: CloudflareEnvironment) {
  if (env.CLOUDFLARE_ACTIVATION !== "enabled") return null;
  const bounded = env.CLOUDFLARE_RETENTION_SCHEDULE !== undefined;
  if (bounded && (env.CLOUDFLARE_RETENTION_SCHEDULE !== "evidence-retention" ||
      !env.CLOUDFLARE_RETENTION_TENANT_ID?.trim() ||
      !(Date.parse(env.CLOUDFLARE_RETENTION_EXPIRES_AT ?? "") > Date.now()))) return null;
  // Existing legacy schedules remain supported, but a bounded intake deployment
  // must explicitly opt into the independent system schedule capability.
  if (!bounded && env.CLOUDFLARE_JOB_TRANSPORT) return null;
  const token = env.PLATFORM_EDGE_TOKEN?.trim();
  if (!token || token.length > 4096 || !/^[\x21-\x7e]+$/.test(token) ||
      [env.AUTH_ORIGIN_TOKEN, env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET, env.CLOUDFLARE_CONTROL_PLANE_TOKEN, env.CLOUDFLARE_RUNTIME_TOKEN]
        .some(value => value?.trim() === token)) return null;
  try {
    const resolved = resolvePrivatePlatformOrigin(env);
    // New bounded schedules require the existing qualified Access/app pair.
    if (bounded && !resolved.publicOrigin) return null;
    return { ...resolved, token, bounded };
  } catch {
    // Preserve the existing explicit loopback-only development transport.
    if (!bounded) try {
      const origin = new URL(env.PLATFORM_EDGE_ORIGIN ?? "");
      if (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) &&
          origin.hostname === env.PLATFORM_EDGE_PRIVATE_HOST?.trim().toLowerCase() &&
          !origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash) {
        return { origin, publicOrigin: undefined, token, bounded };
      }
    } catch { /* invalid local development URL */ }
    return null;
  }
}

/** Configuration readiness only; never a claim that a Cron was provisioned. */
export function isSpec260EvidenceRetentionConfigured(env: CloudflareEnvironment): boolean {
  return retentionConfiguration(env) !== null;
}

export function createSpec260EvidenceRetentionSweep(fetcher: typeof fetch = fetch): ScheduledJobSweepHandler {
  return async (input: { scheduledTime: number }, env: CloudflareEnvironment) => {
    const configuration = retentionConfiguration(env);
    if (!configuration) return "retry";
    const { origin, publicOrigin, token, bounded } = configuration;
    let occurrenceKey: string;
    try { occurrenceKey = spec260EvidenceRetentionOccurrence(input.scheduledTime); }
    catch { return "retry"; }
    const headers = new Headers({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-internal-token": token,
      "x-spec260-schedule": "evidence-retention-v1",
      ...(bounded ? {
        "x-spec260-schedule-tenant": env.CLOUDFLARE_RETENTION_TENANT_ID!,
        "x-spec260-schedule-expires-at": env.CLOUDFLARE_RETENTION_EXPIRES_AT!,
      } : {}),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const init: RequestInit = { method: "POST", headers, signal: controller.signal,
        body: JSON.stringify({ scheduledTime: input.scheduledTime, occurrenceKey }), redirect: "manual" };
      const response = publicOrigin
        ? await proxyAuthToOrigin(new Request(new URL(RETENTION_ENDPOINT, publicOrigin), init), env, request => {
          // The public proxy correctly strips internal headers. Add only the
          // server-generated fixed-purpose schedule headers after that boundary.
          const outboundHeaders = new Headers(request.headers);
          for (const name of ["x-internal-token", "x-spec260-schedule", "x-spec260-schedule-tenant", "x-spec260-schedule-expires-at"]) {
            const value = headers.get(name); if (value !== null) outboundHeaders.set(name, value);
          }
          return fetcher(new Request(request, { headers: outboundHeaders }));
        }, 8_000)
        : await fetcher(new URL(RETENTION_ENDPOINT, origin), init);
      if (response.status !== 202 || Number(response.headers.get("content-length")) > 2048) {
        await response.body?.cancel(); return "retry";
      }
      if (!response.body) return "retry";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "", size = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2048) { await reader.cancel(); return "retry"; }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const result = JSON.parse(text) as { accepted?: unknown; jobId?: unknown; created?: unknown };
      return result?.accepted === true && typeof result.jobId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.jobId) &&
        typeof result.created === "boolean" ? "completed" : "retry";
    } catch {
      return "retry";
    } finally {
      clearTimeout(timeout);
    }
  };
}
