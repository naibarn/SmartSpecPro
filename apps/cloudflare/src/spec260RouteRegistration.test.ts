import { describe, expect, it, vi } from "vitest";
import type { Spec260ApiRoute } from "@smartspec/shared/src/emergencyRouteManifest";
import { createCloudflareWorker } from "./index";
import { createSpec260RouteRegistry, type Spec260RouteAuthorizer } from "./spec260RouteRegistration";

const workerEnv = {} as never;

describe("Spec 260 Cloudflare route registration", () => {
  it("connects a manifest route through the Worker and keeps anonymous writes uncacheable", async () => {
    const registry = createSpec260RouteRegistry({
      "public.report.create": async (_request, _route, params) => new Response(JSON.stringify({ accepted: false, params })),
    }, vi.fn(async () => "forbidden" as const));
    const worker = createCloudflareWorker(undefined, undefined, undefined, undefined, undefined, undefined, registry);
    const response = await worker.fetch(new Request("https://runtime.invalid/api/public/emergency/reports", { method: "POST" }), workerEnv);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("fails a declared endpoint closed when the emergency registry is not configured", async () => {
    const response = await createCloudflareWorker().fetch(
      new Request("https://runtime.invalid/api/public/emergency/alerts"),
      workerEnv,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not let route-class authorization bypass resource-level scope checks", async () => {
    const authorize: Spec260RouteAuthorizer = vi.fn(async (
      _request: Request,
      _route: Spec260ApiRoute,
      params: Readonly<Record<string, string>>,
    ) => params.caseId === "owned-case" ? "authorized" : "forbidden");
    const registry = createSpec260RouteRegistry({
      "auth.case.detail": async () => new Response("secret"),
    }, authorize);
    const response = await registry.dispatch(new Request("https://runtime.invalid/api/auth/emergency/cases/other-case"));

    expect(response?.status).toBe(403);
    expect(authorize).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ id: "auth.case.detail" }), { caseId: "other-case" });
  });

  it("only caches successful public GET projections", async () => {
    const registry = createSpec260RouteRegistry({
      "public.alerts.list": async () => new Response("upstream failed", { status: 502 }),
    }, vi.fn(async () => "authorized" as const));
    const response = await registry.dispatch(new Request("https://runtime.invalid/api/public/emergency/alerts"));

    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });
});
