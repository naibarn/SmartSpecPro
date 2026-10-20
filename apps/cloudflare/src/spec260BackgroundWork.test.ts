import { describe, expect, it, vi } from "vitest";
import type { CloudflareEnvironment } from "./contracts";
import { createCloudflareWorker } from "./index";
import { createSpec260EvidenceRetentionSweep, isSpec260EvidenceRetentionConfigured, spec260EvidenceRetentionOccurrence } from "./spec260BackgroundWork";

describe("Spec260 Cloudflare evidence-retention schedule", () => {
  it("uses a deterministic five-minute UTC occurrence key", () => {
    expect(spec260EvidenceRetentionOccurrence(Date.parse("2026-09-30T12:08:51.000Z")))
      .toBe("2026-09-30T12:05Z:emergency-evidence-retention");
  });

  it("fails closed without platform origin and token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.parse("2026-09-30T12:10:00.000Z"), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled" }))
      .resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts only a deterministic schedule occurrence to the private canonical platform", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ accepted: true, jobId: "00000000-0000-4000-8000-000000000001", created: true }), { status: 202 }));
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    const scheduledTime = Date.parse("2026-09-30T12:08:51.000Z");
    await expect(sweep({ scheduledTime, maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://internal.example", PLATFORM_EDGE_PRIVATE_HOST: "internal.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("completed");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://internal.example/api/internal/spec260/schedules/evidence-retention");
    expect((init?.headers as Headers).get("x-internal-token")).toBe("secret");
    expect(JSON.parse(String(init?.body))).toEqual({ scheduledTime, occurrenceKey: "2026-09-30T12:05Z:emergency-evidence-retention" });
  });

  it("preserves explicitly allowlisted loopback HTTP development admission", async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({accepted:true,
      jobId:"00000000-0000-4000-8000-000000000001",created:true}),{status:202}));
    expect(await createSpec260EvidenceRetentionSweep(fetcher)({scheduledTime:Date.now(),maxRows:100},{
      CLOUDFLARE_ACTIVATION:"enabled",PLATFORM_EDGE_ORIGIN:"http://127.0.0.1:3100",PLATFORM_EDGE_PRIVATE_HOST:"127.0.0.1",PLATFORM_EDGE_TOKEN:"local-only-token",
    })).toBe("completed");
    expect(String(fetcher.mock.calls[0][0])).toBe("http://127.0.0.1:3100/api/internal/spec260/schedules/evidence-retention");
  });

  it("rejects non-private or recursive origins", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "http://public.example", PLATFORM_EDGE_PRIVATE_HOST: "public.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed for an HTTPS hostname without the private-host allowlist", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://public.example", PLATFORM_EDGE_PRIVATE_HOST: "private.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns retry for non-successful platform admission", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
    const sweep = createSpec260EvidenceRetentionSweep(fetcher);
    await expect(sweep({ scheduledTime: Date.now(), maxRows: 100 }, { CLOUDFLARE_ACTIVATION: "enabled",
      PLATFORM_EDGE_ORIGIN: "https://internal.example", PLATFORM_EDGE_PRIVATE_HOST: "internal.example", PLATFORM_EDGE_TOKEN: "secret" })).resolves.toBe("retry");
  });
});

function bounded(): CloudflareEnvironment {
  return { CLOUDFLARE_ACTIVATION: "enabled", CLOUDFLARE_JOB_TRANSPORT: "workflows",
    CLOUDFLARE_RETENTION_SCHEDULE: "evidence-retention", CLOUDFLARE_RETENTION_TENANT_ID: "system-tenant",
    CLOUDFLARE_RETENTION_EXPIRES_AT: new Date(Date.now()+60_000).toISOString(),
    PLATFORM_EDGE_ORIGIN: "https://origin-staging.smartaihub.app", PLATFORM_EDGE_PRIVATE_HOST: "origin-staging.smartaihub.app",
    PLATFORM_EDGE_TOKEN: "dedicated-schedule-token", AUTH_ORIGIN: "https://origin-staging.smartaihub.app",
    AUTH_ORIGIN_PRIVATE_HOST: "origin-staging.smartaihub.app", AUTH_ORIGIN_TOKEN: "dedicated-origin-token",
    AUTH_ORIGIN_ACCESS_CLIENT_ID: "dedicated-access-id", AUTH_ORIGIN_ACCESS_CLIENT_SECRET: "dedicated-access-secret",
    AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: '["https://staging.example.workers.dev"]' };
}
describe("independent bounded retention admission through existing Access authority", () => {
  it("pins private origin, distinct service credentials, system tenant and expiry", async () => {
    const env = bounded(), fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      accepted: true, jobId: "00000000-0000-4000-8000-000000000001", created: false }), { status: 202 }));
    expect(isSpec260EvidenceRetentionConfigured(env)).toBe(true);
    expect(await createSpec260EvidenceRetentionSweep(fetcher)({ scheduledTime: Date.now(), maxRows: 100 },env)).toBe("completed");
    const request = fetcher.mock.calls[0][0] as Request;
    expect(request.url).toBe("https://origin-staging.smartaihub.app/api/internal/spec260/schedules/evidence-retention");
    expect(request.headers.get("cf-access-client-id")).toBe(env.AUTH_ORIGIN_ACCESS_CLIENT_ID);
    expect(request.headers.get("cf-access-client-secret")).toBe(env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET);
    expect(request.headers.get("x-cloudflare-origin-token")).toBe(env.AUTH_ORIGIN_TOKEN);
    expect(request.headers.get("x-internal-token")).toBe(env.PLATFORM_EDGE_TOKEN);
    expect(request.headers.get("x-spec260-schedule-tenant")).toBe("system-tenant");
    expect(request.headers.get("x-spec260-schedule-expires-at")).toBe(env.CLOUDFLARE_RETENTION_EXPIRES_AT);
    expect(request.redirect).toBe("manual");
  });
  it.each(["absent", "unknown", "expired", "tenant", "access", "public", "reused"])("rejects %s schedule capability before network I/O", async mode => {
    const env = bounded(), fetcher = vi.fn<typeof fetch>();
    if(mode === "absent") delete env.CLOUDFLARE_RETENTION_SCHEDULE;
    if(mode === "unknown") env.CLOUDFLARE_RETENTION_SCHEDULE="other";
    if(mode === "expired") env.CLOUDFLARE_RETENTION_EXPIRES_AT=new Date(0).toISOString();
    if(mode === "tenant") delete env.CLOUDFLARE_RETENTION_TENANT_ID;
    if(mode === "access") delete env.AUTH_ORIGIN_ACCESS_CLIENT_SECRET;
    if(mode === "public") { env.PLATFORM_EDGE_ORIGIN="https://smartaihub.app"; env.PLATFORM_EDGE_PRIVATE_HOST="smartaihub.app"; }
    if(mode === "reused") env.PLATFORM_EDGE_TOKEN=env.AUTH_ORIGIN_TOKEN;
    expect(isSpec260EvidenceRetentionConfigured(env)).toBe(false);
    expect(await createSpec260EvidenceRetentionSweep(fetcher)({ scheduledTime: Date.now(),maxRows:100 },env)).toBe("retry");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["html", "empty", "oversize", "unaccepted", "redirect"])("does not mistake %s for durable admission", async mode => {
    const response = mode === "redirect" ? new Response(null,{status:302,headers:{location:"https://example.cloudflareaccess.com"}})
      : new Response(mode === "html" ? "<html>Access login</html>" : mode === "empty" ? "" : mode === "oversize" ? "x".repeat(2049) : '{"accepted":false}',{status:202});
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await createSpec260EvidenceRetentionSweep(fetcher)({ scheduledTime:Date.now(),maxRows:100 },bounded())).toBe("retry");
  });
  it("reports retention-only readiness without granting Queue publication or consumption", async () => {
    const env=bounded();delete env.CLOUDFLARE_JOB_TRANSPORT;
    const handler=vi.fn(),cron=vi.fn().mockResolvedValue("completed"),worker=createCloudflareWorker(handler,undefined,undefined,cron);
    const ready=await worker.fetch(new Request("https://runtime.invalid/readyz"),env);
    expect(ready.status).toBe(200);expect(await ready.json()).toMatchObject({readiness:{transport:"retention",selectedMissing:[],missing:expect.arrayContaining(["JOB_CONTAINERS","WORKER_APP"])}});
    const message={body:{},ack:vi.fn(),retry:vi.fn()};await worker.queue({messages:[message]},env);
    expect(message.retry).toHaveBeenCalledOnce();expect(handler).not.toHaveBeenCalled();
    const publication=await worker.fetch(new Request("https://runtime.invalid/internal/jobs/publish",{method:"POST"}),env);
    expect(publication.status).toBe(409);
    await worker.scheduled({scheduledTime:Date.now()},env);expect(cron).toHaveBeenCalledOnce();
  });
  it("allows only the explicit retention sweep alongside intake, without enabling provider polling", async () => {
    const cron=vi.fn().mockResolvedValue("completed"),poll=vi.fn(),worker=createCloudflareWorker(undefined,undefined,poll,cron);
    const env=bounded();
    await worker.scheduled({scheduledTime:Date.now()},env);
    expect(cron).toHaveBeenCalledTimes(1);expect(poll).not.toHaveBeenCalled();
    env.CLOUDFLARE_RETENTION_EXPIRES_AT=new Date(0).toISOString();
    await worker.scheduled({scheduledTime:Date.now()},env);expect(cron).toHaveBeenCalledTimes(1);
  });
});
