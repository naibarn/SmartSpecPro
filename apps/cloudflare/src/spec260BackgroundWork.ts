import type { CloudflareEnvironment, ScheduledJobSweepHandler } from "./contracts";

const RETENTION_ENDPOINT = "/api/internal/spec260/schedules/evidence-retention";

export function spec260EvidenceRetentionOccurrence(scheduledTime: number): string {
  if (!Number.isFinite(scheduledTime) || scheduledTime <= 0) throw new Error("SPEC260_SCHEDULED_TIME_INVALID");
  const date = new Date(scheduledTime);
  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 5) * 5, 0, 0);
  return `${date.toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
}

function resolvePlatformOrigin(raw: string | undefined, privateHost: string | undefined): URL | null {
  if (!raw?.trim()) return null;
  try {
    const origin = new URL(raw);
    const expectedHost = privateHost?.trim().toLowerCase();
    const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
    const publicProductHost = origin.hostname === "smartaihub.app" || origin.hostname.endsWith(".smartaihub.app") ||
      origin.hostname === "smartspec.pro" || origin.hostname.endsWith(".smartspec.pro");
    if ((!localHttp && origin.protocol !== "https:") || !expectedHost || origin.hostname.toLowerCase() !== expectedHost ||
        publicProductHost || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    return origin;
  } catch {
    return null;
  }
}

export function createSpec260EvidenceRetentionSweep(fetcher: typeof fetch = fetch): ScheduledJobSweepHandler {
  return async (input: { scheduledTime: number }, env: CloudflareEnvironment) => {
    if (env.CLOUDFLARE_ACTIVATION !== "enabled") return "retry";
    const origin = resolvePlatformOrigin(env.PLATFORM_EDGE_ORIGIN, env.PLATFORM_EDGE_PRIVATE_HOST);
    const token = env.PLATFORM_EDGE_TOKEN?.trim();
    if (!origin || !token) return "retry";
    let occurrenceKey: string;
    try { occurrenceKey = spec260EvidenceRetentionOccurrence(input.scheduledTime); }
    catch { return "retry"; }
    const headers = new Headers({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-internal-token": token,
      "x-spec260-schedule": "evidence-retention-v1",
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetcher(new URL(RETENTION_ENDPOINT, origin), {
        method: "POST", headers, signal: controller.signal,
        body: JSON.stringify({ scheduledTime: input.scheduledTime, occurrenceKey }),
        redirect: "manual",
      });
      return response.ok ? "completed" : "retry";
    } catch {
      return "retry";
    } finally {
      clearTimeout(timeout);
    }
  };
}
