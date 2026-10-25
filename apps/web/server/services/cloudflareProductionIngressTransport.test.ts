import { describe, expect, it, vi } from "vitest";
import {
  productionIngressGrantAllowsJob,
  productionIngressGrantSchema,
  type ProductionIngressGrant,
} from "./cloudflareProductionIngressContract";
import { createCloudflareProductionIngressTransport } from "./cloudflareProductionIngressTransport";
import type { CloudflareProductionDeploymentTarget } from "./cloudflareProductionDeploymentContract";

const id = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const grant: ProductionIngressGrant = {
  schemaVersion: "cloudflare.production-ingress-grant.v1",
  grantRef: id(1),
  jobId: id(2),
  tenantId: "tenant-a",
  requesterUserId: 7,
  executorId: "production-executor",
  accountRef: "a".repeat(32),
  projectId: "project-a",
  targetId: "smartspec-cloudflare-runtime",
  environment: "production",
  operation: {
    contractVersion: "cloudflare-production-ingress-v1",
    grantRef: id(1),
    projectId: "project-a",
    targetId: "smartspec-cloudflare-runtime",
    environment: "production",
    zoneId: "b".repeat(32),
    routePattern: "smartaihub.app/*",
    action: "ingress-canary",
    runtimeBaselineDeploymentId: id(3),
    runtimeBaselineVersionId: id(4),
    previousRoute: { state: "absent" },
    ingressReceipt: null,
    artifactRef: `sha256:${"c".repeat(64)}`,
    sourceSha: "d".repeat(40),
    buildDigest: "c".repeat(64),
    configurationRef: `cf-origin:${"e".repeat(64)}`,
    configurationDigest: "e".repeat(64),
  },
  exposure: "100-percent-http-origin-bridge",
  actions: ["deploy", "rollback"],
  maxDurationSeconds: 900,
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
};
const target: CloudflareProductionDeploymentTarget = {
  tenantId: grant.tenantId,
  projectId: grant.operation.projectId,
  targetId: grant.operation.targetId,
  workerRef: grant.operation.targetId,
  environment: "production",
  enabled: true,
  accountRef: grant.accountRef,
  credentialRef: "fixture-credential",
};
const candidate = {
  versionId: id(5),
  sourceSha: grant.operation.sourceSha,
  buildDigest: grant.operation.buildDigest,
  configurationDigest: grant.operation.configurationDigest,
};
function provider(
  options: {
    failPublic?: boolean;
    failRuntime?: boolean;
    ambiguousRoute?: boolean;
  } = {}
) {
  let counter = 10;
  let routes: any[] = [];
  let active: any = {
    id: grant.operation.runtimeBaselineDeploymentId,
    versions: [
      { version_id: grant.operation.runtimeBaselineVersionId, percentage: 100 },
    ],
  };
  const writes: Array<{ method: string; path: string; body: any }> = [];
  const order: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    const path = u.pathname;
    if (u.hostname !== "api.cloudflare.com") {
      order.push(u.hostname + path);
      expect(init?.headers).toMatchObject({
        "Cloudflare-Workers-Version-Overrides": `${target.workerRef}="${candidate.versionId}"`,
      });
      const html = path === "/" || path.endsWith("/web");
      const failed =
        u.hostname === "smartaihub.app"
          ? options.failPublic
          : options.failRuntime;
      return new Response(
        html
          ? "<html><body>SmartAIHub</body></html>"
          : JSON.stringify({ result: { data: { json: null } } }),
        {
          status: failed ? 503 : 200,
          headers: {
            "content-type": html ? "text/html" : "application/json",
            "x-smartaihub-ingress": "cloudflare-worker",
            "x-smartaihub-application-runtime": "linux-origin",
          },
        }
      );
    }
    const method = init?.method ?? "GET";
    let result: any;
    if (method !== "GET") {
      writes.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      order.push(method + path);
    }
    if (path.endsWith("/workers/routes")) {
      if (method === "GET") result = routes;
      else {
        routes = [{ id: "f".repeat(32), ...JSON.parse(String(init?.body)) }];
        if (options.ambiguousRoute) throw new Error("provider response lost");
        result = routes[0];
      }
    } else if (method === "DELETE") {
      routes = [];
      result = { id: "f".repeat(32) };
    } else if (path.endsWith("/deployments")) {
      if (method === "POST") {
        active = { id: id(counter++), ...JSON.parse(String(init?.body)) };
        result = active;
      } else result = { deployments: [active] };
    } else if (path.endsWith(candidate.versionId))
      result = {
        id: candidate.versionId,
        annotations: {
          "workers/message": `SmartAIHub production ${candidate.sourceSha} ${candidate.buildDigest} origin ${candidate.configurationDigest}`,
        },
      };
    else throw new Error("unexpected provider operation");
    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
    });
  });
  return {
    fetchImpl,
    writes,
    order,
    get routes() {
      return routes;
    },
    get active() {
      return active;
    },
    setRoutes: (v: any[]) => {
      routes = v;
    },
  };
}
const auth = () => vi.fn(async () => {});
describe("Production ingress origin-route authority and compensation", () => {
  it("binds tenant, actor, job, executor, release, operation, expiry and explicit full bridge exposure", () => {
    const binding = {
      jobId: grant.jobId,
      tenantId: grant.tenantId,
      requesterUserId: 7,
      executorId: grant.executorId,
      accountRef: grant.accountRef,
      now: new Date(),
    };
    expect(productionIngressGrantSchema.safeParse(grant).success).toBe(true);
    expect(
      productionIngressGrantAllowsJob(grant, grant.operation, binding)
    ).toBe(true);
    for (const change of [
      { tenantId: "foreign" },
      { jobId: id(99) },
      { requesterUserId: 8 },
      { executorId: "foreign" },
      { accountRef: "0".repeat(32) },
      { now: new Date("2100-01-01") },
    ])
      expect(
        productionIngressGrantAllowsJob(grant, grant.operation, {
          ...binding,
          ...change,
        })
      ).toBe(false);
    expect(
      productionIngressGrantAllowsJob(
        grant,
        { ...grant.operation, sourceSha: "0".repeat(40) },
        binding
      )
    ).toBe(false);
    expect(
      productionIngressGrantSchema.safeParse({
        ...grant,
        exposure: "one-percent",
      }).success
    ).toBe(false);
    expect(
      productionIngressGrantSchema.safeParse({
        ...grant,
        operation: { ...grant.operation, action: "ingress-rollback" },
      }).success
    ).toBe(false);
  });
  it("probes 0% candidate before exact route attach and verifies real apex HTTP/auth", async () => {
    const p = provider(),
      authorize = auth();
    const result = await createCloudflareProductionIngressTransport(p)({
      token: "fixture",
      target,
      grant,
      candidate,
      probeToken: "p".repeat(32),
      assertMutationAuthorized: authorize,
    });
    expect(result).toMatchObject({
      productionTrafficShifted: true,
      applicationRuntime: "linux-origin",
      routeId: "f".repeat(32),
      versionId: candidate.versionId,
    });
    expect(p.writes).toHaveLength(3);
    expect(authorize).toHaveBeenCalledTimes(3);
    const attach = p.order.findIndex(
      s => s.startsWith("POST") && s.endsWith("/workers/routes")
    );
    expect(
      p.order.indexOf(
        "runtime.smartaihub.app/_ops/application-canary/ingress/auth"
      )
    ).toBeLessThan(attach);
    expect(p.order.indexOf("smartaihub.app/trpc/auth.me")).toBeGreaterThan(
      attach
    );
    expect(p.writes[0].body.versions).toContainEqual({
      version_id: candidate.versionId,
      percentage: 0,
    });
    expect(p.writes[2].body).toEqual({
      pattern: "smartaihub.app/*",
      script: target.workerRef,
    });
  });
  it("failed pre-route probe restores runtime baseline without touching apex", async () => {
    const p = provider({ failRuntime: true });
    await expect(
      createCloudflareProductionIngressTransport(p)({
        token: "fixture",
        target,
        grant,
        candidate,
        probeToken: "p".repeat(32),
        assertMutationAuthorized: auth(),
      })
    ).rejects.toThrow("APPLICATION_PROBE_FAILED");
    expect(p.routes).toHaveLength(0);
    expect(p.writes.some(w => w.path.includes("/zones/"))).toBe(false);
    expect(p.active.versions).toEqual([
      { version_id: grant.operation.runtimeBaselineVersionId, percentage: 100 },
    ]);
  });
  it("failed apex acceptance detaches exact created route and restores prior runtime", async () => {
    const p = provider({ failPublic: true }),
      authorize = auth();
    await expect(
      createCloudflareProductionIngressTransport(p)({
        token: "fixture",
        target,
        grant,
        candidate,
        probeToken: "p".repeat(32),
        assertMutationAuthorized: authorize,
      })
    ).rejects.toThrow("APPLICATION_PROBE_FAILED");
    expect(p.routes).toHaveLength(0);
    expect(p.writes.find(w => w.method === "DELETE")?.path).toMatch(
      /\/workers\/routes\/[f]{32}$/
    );
    expect(authorize).toHaveBeenCalledTimes(5);
    expect(p.active.versions).toEqual([
      { version_id: grant.operation.runtimeBaselineVersionId, percentage: 100 },
    ]);
  });
  it("unknown route write does not delete an unproven route or restore a native Worker behind it", async () => {
    const p = provider({ ambiguousRoute: true });
    await expect(
      createCloudflareProductionIngressTransport(p)({
        token: "fixture",
        target,
        grant,
        candidate,
        probeToken: "p".repeat(32),
        assertMutationAuthorized: auth(),
      })
    ).rejects.toThrow("ROUTE_SUBMISSION_UNKNOWN");
    expect(p.writes).toHaveLength(3);
    expect(p.active.versions).toEqual([
      { version_id: candidate.versionId, percentage: 100 },
    ]);
  });
  it("independent receipt-bound rollback removes ingress rather than only changing Worker weights", async () => {
    const p = provider(),
      execute = createCloudflareProductionIngressTransport(p);
    const receipt = await execute({
      token: "fixture",
      target,
      grant,
      candidate,
      probeToken: "p".repeat(32),
      assertMutationAuthorized: auth(),
    });
    const rollback = {
      ...grant,
      operation: {
        ...grant.operation,
        action: "ingress-rollback" as const,
        ingressReceipt: {
          grantRef: receipt.grantRef!,
          deploymentId: receipt.deploymentId,
          versionId: receipt.versionId!,
          routeId: receipt.routeId!,
          verifiedAt: receipt.verifiedAt!,
        },
      },
    };
    await expect(
      execute({
        token: "fixture",
        target,
        grant: rollback,
        assertMutationAuthorized: auth(),
      })
    ).resolves.toMatchObject({ previousRouteRestored: true, routeId: null });
    expect(p.routes).toHaveLength(0);
    expect(p.active.versions).toEqual([
      { version_id: grant.operation.runtimeBaselineVersionId, percentage: 100 },
    ]);
  });
  it("changed baseline/route or revoked mutation authority causes no provider writes", async () => {
    const p = provider();
    p.setRoutes([
      {
        id: "f".repeat(32),
        pattern: grant.operation.routePattern,
        script: "foreign-worker",
      },
    ]);
    await expect(
      createCloudflareProductionIngressTransport(p)({
        token: "fixture",
        target,
        grant,
        candidate,
        probeToken: "p".repeat(32),
        assertMutationAuthorized: auth(),
      })
    ).rejects.toThrow("BASELINE_CHANGED");
    expect(p.writes).toHaveLength(0);
    p.setRoutes([]);
    await expect(
      createCloudflareProductionIngressTransport(p)({
        token: "fixture",
        target,
        grant,
        candidate,
        probeToken: "p".repeat(32),
        assertMutationAuthorized: async () => {
          throw new Error("REVOKED");
        },
      })
    ).rejects.toThrow("REVOKED");
    expect(p.writes).toHaveLength(0);
  });
});

describe("Production ingress canonical executor admission", () => {
  async function fixture() {
    const { createCloudflareProductionIngressExecutor } =
      await import("./cloudflareProductionIngressExecutor");
    const ingress = vi.fn(async (input: any) => {
      await input.assertMutationAuthorized();
      return {
        deploymentId: id(10),
        routeId: "f".repeat(32),
        productionTrafficShifted: true,
      };
    });
    const prepareVersion = vi.fn(async (input: any) => {
      await input.assertMutationAuthorized();
      return { ...candidate, trafficShifted: false };
    });
    const runtime: any = {
      resolveExecutorId: () => grant.executorId,
      resolveIngressGrant: async () => grant,
      resolveTarget: async () => ({
        ...target,
        runtimePolicy: grant.operation.configurationRef,
      }),
      resolveArtifact: async () => ({
        ...candidate,
        artifactRef: grant.operation.artifactRef,
      }),
      withOriginConfiguration: async ({ operation }: any) =>
        operation({
          descriptor: {
            ingressMode: "production-origin-bridge-v1",
            allowedPublicOrigins: [
              "https://smartaihub.app",
              "https://runtime.smartaihub.app",
            ],
          },
          secrets: { applicationCanaryToken: "p".repeat(32) },
        }),
      withCredential: async ({ operation }: any) => ({
        status: "CONFIGURED",
        value: await operation("fixture"),
      }),
      prepareVersion,
      ingress,
      now: () => new Date(),
    };
    const execution: any = {
      context: {
        jobId: grant.jobId,
        jobType: "cloudflare.production.deploy",
        contractVersion: grant.operation.contractVersion,
        tenantId: grant.tenantId,
        requestedByUserId: grant.requesterUserId,
        createdAt: new Date(Date.now() - 1000).toISOString(),
        attempt: 1,
        executionClass: "long",
        timeoutSeconds: 900,
        retryPolicy: { deadlineMs: 900000, deadlineMode: "fixed" },
        input: grant.operation,
      },
      lease: {
        jobId: grant.jobId,
        attemptId: id(11),
        leaseToken: "fixture",
        fencingVersion: 1,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      },
      reporter: {
        assertActive: vi.fn(async () => {}),
        heartbeat: vi.fn(async () => {}),
      },
      controlPlane: {},
    };
    return {
      executor: createCloudflareProductionIngressExecutor(() => runtime),
      runtime,
      execution,
      ingress,
      prepareVersion,
    };
  }
  it("admits the exact contract in deployed adapter, worker and executor registrations", async () => {
    const { PostgresPullJobTransportAdapter } =
      await import("./jobTransportAdapters");
    const { POSTGRES_NODE_JOB_TYPES } =
      await import("../jobs/feature186JobTypes");
    const { defaultJobExecutorRegistry } =
      await import("./jobExecutorRegistry");
    expect(
      new PostgresPullJobTransportAdapter().supports({
        jobType: "cloudflare.production.deploy",
        executionClass: "long",
        contractVersion: grant.operation.contractVersion,
      })
    ).toBe(true);
    expect(POSTGRES_NODE_JOB_TYPES.has("cloudflare.production.deploy")).toBe(
      true
    );
    expect(
      defaultJobExecutorRegistry.resolve(
        "cloudflare.production.deploy",
        grant.operation.contractVersion
      )
    ).toBeDefined();
  });
  it("requires exact grant, lease, immutable bridge config and artifact before route execution", async () => {
    const f = await fixture();
    await expect(f.executor(f.execution)).resolves.toMatchObject({
      output: { productionTrafficShifted: true },
    });
    expect(f.prepareVersion).toHaveBeenCalledOnce();
    expect(f.ingress).toHaveBeenCalledOnce();
    expect(f.execution.reporter.assertActive).toHaveBeenCalled();
  });
  it.each([
    "foreign-tenant",
    "expired-grant",
    "wrong-actor",
    "stale-lease",
    "wrong-origin",
    "stale-artifact",
    "deadline",
  ])("rejects %s before the ingress operation", async failure => {
    const f = await fixture();
    if (failure === "foreign-tenant") f.execution.context.tenantId = "foreign";
    if (failure === "expired-grant")
      f.runtime.resolveIngressGrant = async () => ({
        ...grant,
        expiresAt: "2020-01-01T00:00:00Z",
      });
    if (failure === "wrong-actor") f.execution.context.requestedByUserId = 8;
    if (failure === "stale-lease")
      f.execution.reporter.assertActive = async () => {
        throw new Error("STALE_LEASE");
      };
    if (failure === "wrong-origin")
      f.runtime.withOriginConfiguration = async ({ operation }: any) =>
        operation({
          descriptor: {
            ingressMode: "production-origin-bridge-v1",
            allowedPublicOrigins: ["https://smartaihub.app"],
          },
        });
    if (failure === "stale-artifact")
      f.runtime.resolveArtifact = async () => null;
    if (failure === "deadline")
      f.execution.context.createdAt = "2020-01-01T00:00:00Z";
    await expect(f.executor(f.execution)).rejects.toThrow();
    expect(f.ingress).not.toHaveBeenCalled();
  });
});
