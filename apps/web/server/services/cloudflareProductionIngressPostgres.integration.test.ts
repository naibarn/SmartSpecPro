import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const fixture = vi.hoisted(() => ({
  beforeCommit: false,
  afterCommit: false,
  routeLive: false,
  expiry: new Date(Date.now() + 3600000).toISOString(),
  workerReady: true,
}));
vi.mock("./cloudflareExecutionReadiness", () => ({
  checkCloudflareExecutionReadiness: async () => fixture.workerReady
    ? { ready: true, reason: null } : { ready: false, reason: "MIGRATION_WAITING_WORKER_CAPACITY" },
}));
vi.mock("./cloudflareProductionDeploymentContract", async original => ({
  ...(await original<any>()),
  resolveCloudflareProductionDeploymentTarget: async ({
    tenantId,
    projectId,
  }: any) => ({
    tenantId,
    projectId,
    targetId: "smartspec-cloudflare-runtime",
    workerRef: "smartspec-cloudflare-runtime",
    environment: "production",
    enabled: true,
    accountRef: "a".repeat(32),
    credentialRef: "fixture",
    runtimePolicy: `cf-origin:${"b".repeat(64)}`,
  }),
}));
vi.mock("./cloudflareProductionProviderInventory", () => ({
  probeCloudflareProductionProviderInventory: async () => ({
    status: "CHECKED",
    accessChecks: {
      zone: { complete: true },
      routes: { complete: true },
      workerDeployments: { complete: true },
      workerVersions: [{ complete: true }],
    },
    domainRoute: {
      zoneId: "c".repeat(32),
      inventoryComplete: true,
      attached: fixture.routeLive,
      conflicting: false,
      routeId: fixture.routeLive ? "f".repeat(32) : null,
      script: fixture.routeLive ? "smartspec-cloudflare-runtime" : null,
    },
    worker: {
      activeDeploymentId: fixture.routeLive
        ? "33333333-3333-4333-8333-333333333333"
        : "11111111-1111-4111-8111-111111111111",
      versions: [
        {
          versionId: fixture.routeLive
            ? "44444444-4444-4444-8444-444444444444"
            : "22222222-2222-4222-8222-222222222222",
        },
      ],
    },
  }),
}));
vi.mock("./cloudflareStagingArtifactAuthority", async original => ({
  ...(await original<any>()),
  resolveCloudflareStagingModules: async () => ({
    moduleFiles: {
      "index.js": {
        bytes: new TextEncoder().encode("/_ops/application-canary/ingress/"),
      },
    },
  }),
  resolveLatestPublishedCloudflareStagingArtifact: async () => ({
    artifactRef: `sha256:${"d".repeat(64)}`,
    buildDigest: "d".repeat(64),
    sourceSha: "e".repeat(40),
  }),
}));
vi.mock("./cloudflareOriginConfiguration", async original => ({
  ...(await original<any>()),
  getCloudflareOriginConfiguration: async () => ({
    status: "STORED",
    configurationDigest: "b".repeat(64),
    descriptor: {
      origin: "https://origin.fixture.invalid",
      ingressMode: "production-origin-bridge-v1",
      expiresAt: fixture.expiry,
    },
  }),
  withCloudflareOriginConfiguration: async (
    _db: any,
    _scope: any,
    operation: any
  ) =>
    operation({
      secrets: {
        token: "fixture-origin-credential",
        clientId: "fixture-client-id",
        secret: "fixture-client-secret",
        applicationCanaryToken: "p".repeat(32),
      },
    }),
}));
vi.mock("./appRuntimeConfig", async original => ({
  ...(await original<any>()),
  getAppRuntimeConfig: async () => ({
    pythonBackendUrl: "https://approval.fixture.invalid",
    webGatewayToken: "fixture-gateway-token",
  }),
}));
vi.mock("./jobControlPlaneGateway", async original => {
  const actual = await original<any>();
  return {
    ...actual,
    createControlPlaneJob: async (input: any) => {
      if (fixture.beforeCommit) {
        fixture.beforeCommit = false;
        throw new Error("fixture admission unavailable");
      }
      const result = await actual.createControlPlaneJob(input);
      if (fixture.afterCommit) {
        fixture.afterCommit = false;
        throw new Error("fixture response lost after commit");
      }
      return result;
    },
  };
});
const suite =
  process.env.RUN_CLOUDFLARE_PRODUCTION_DB_INTEGRATION === "true"
    ? describe
    : describe.skip;
suite(
  "Production ingress authenticated canonical admission in disposable PostgreSQL",
  () => {
    let disposable: any, client: any, closeDb: any, caller: any;
    let original: Record<string, string | undefined>;
    const grants = new Map<string, any>(),
      requests: any[] = [];
    beforeAll(async () => {
      original = Object.fromEntries(
        [
          "DATABASE_URL",
          "NODE_ENV",
          "CLOUDFLARE_PRODUCTION_EXECUTOR_ID",
          "AUTH_ORIGIN_TOKEN",
          "AUTH_ORIGIN_PRIVATE_HOST",
          "AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS",
        ].map(k => [k, process.env[k]])
      );
      disposable = await (
        await import("./__tests__/support/spec277DisposablePostgres")
      ).createSpec277DisposablePostgres();
      Object.assign(process.env, {
        DATABASE_URL: disposable.databaseUrl,
        NODE_ENV: "test",
        CLOUDFLARE_PRODUCTION_EXECUTOR_ID: "fixture-executor",
        AUTH_ORIGIN_TOKEN: "fixture-origin-credential",
        AUTH_ORIGIN_PRIVATE_HOST: "origin.fixture.invalid",
        AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS: JSON.stringify([
          "https://smartaihub.app",
          "https://runtime.smartaihub.app",
        ]),
      });
      vi.resetModules();
      client = (await import("postgres")).default(disposable.databaseUrl, {
        max: 2,
      });
      const schema = await import("../../drizzle/schema");
      await (
        await import("./__tests__/support/spec277AutoTeamRuntimeSchema")
      ).installSpec277AutoTeamRuntimeSchema(client, [
        schema.systemSettings,
        schema.workerJobActions,
        schema.users,
        schema.tenants,
        schema.tenantDataTransferPlans,
        schema.tenantIdentityActions,
      ]);
      await client`INSERT INTO users(id,"openId",role) VALUES(17,'isolated-ingress-owner','admin')`;
      ({ closeDb } = await import("../db"));
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: any, init: any) => {
          const parsed = new URL(String(url));
          if (
            parsed.pathname ===
            "/api/v1/approvals/internal/cloudflare-production-capabilities"
          )
            return new Response(
              JSON.stringify({
                grantSchemas: ["cloudflare.production-ingress-grant.v1"],
              }),
              { status: 200 }
            );
          if (parsed.hostname === "origin.fixture.invalid")
            return new Response(
              JSON.stringify({ result: { data: { json: null } } }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          if (
            parsed.href !==
              "https://approval.fixture.invalid/api/v1/approvals/cloudflare-production-grants" ||
            init?.method !== "POST"
          )
            throw new Error("UNEXPECTED_FIXTURE_NETWORK_OPERATION");
          const request = JSON.parse(init.body);
          requests.push(request);
          let grant = grants.get(request.idempotencyKey);
          if (!grant) {
            const grantRef = randomUUID();
            const { idempotencyKey, ...document } = request;
            grant = {
              ...document,
              grantRef,
              tenantId: "tenant-ingress-fixture",
              requesterUserId: 17,
              revokedAt: null,
              operation: { ...document.operation, grantRef },
            };
            grants.set(idempotencyKey, grant);
          }
          return new Response(
            JSON.stringify({
              id: grant.grantRef,
              status: "approved",
              payload: grant,
            }),
            { status: 201 }
          );
        })
      );
      const { infrastructureRouter } =
        await import("../routers/infrastructure");
      caller = infrastructureRouter.createCaller({
        user: {
          id: 17,
          role: "admin",
          currentTenantId: "tenant-ingress-fixture",
        },
        tenantId: "tenant-ingress-fixture",
        userToken: "isolated-owner-token",
        req: { requestId: "isolated-ingress-admission" },
      } as any);
    }, 30000);
    afterAll(async () => {
      vi.unstubAllGlobals();
      if (closeDb) await closeDb();
      if (client) await client.end({ timeout: 3 });
      if (disposable) await disposable.close();
      for (const [k, v] of Object.entries(original ?? {})) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }, 20000);
    async function submission(projectId: string) {
      const identity = {
        tenantId: "tenant-ingress-fixture",
        projectId,
        environment: "production",
      };
      const preflight =
        await caller.getCloudflareProductionIngressPreflight(identity);
      expect(preflight.ready).toBe(true);
      return {
        ...identity,
        submissionId: randomUUID(),
        planDigest: preflight.planDigest,
        exposure: "100-percent-http-origin-bridge",
      };
    }
    it("reconciles a post-commit timeout and prevents duplicate grant/job/outbox", async () => {
      const input = await submission("ingress-commit-fixture");
      fixture.afterCommit = true;
      await expect(
        caller.queueCloudflareProductionIngress(input)
      ).resolves.toMatchObject({ jobId: input.submissionId, status: "queued" });
      await expect(
        caller.queueCloudflareProductionIngress(input)
      ).resolves.toMatchObject({ jobId: input.submissionId, status: "queued" });
      expect(requests).toHaveLength(1);
      expect(grants.size).toBe(1);
      const [job] =
        await client`SELECT status,attempt,"maxAttempts","contractVersion" FROM worker_jobs WHERE id=${input.submissionId}`;
      expect(job).toMatchObject({
        status: "queued",
        attempt: 1,
        maxAttempts: 1,
        contractVersion: "cloudflare-production-ingress-v1",
      });
      expect(
        (
          await client`SELECT count(*)::int AS n FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`
        )[0].n
      ).toBe(1);
    });
    it("retains exact approved scope on pre-commit failure and recovers the same Submission ID", async () => {
      const input = await submission("ingress-retry-fixture");
      fixture.beforeCommit = true;
      await expect(
        caller.queueCloudflareProductionIngress(input)
      ).rejects.toMatchObject({
        message: "PRODUCTION_INGRESS_ADMISSION_UNKNOWN",
      });
      const checkpoint =
        await client`SELECT "valueJson" FROM system_settings WHERE category='cloudflare_production_ingress_submissions' AND key=${input.submissionId}`;
      expect(checkpoint).toHaveLength(1);
      await expect(
        caller.queueCloudflareProductionIngress(input)
      ).resolves.toMatchObject({ jobId: input.submissionId, status: "queued" });
      expect(requests[1]).toEqual(requests[2]);
      expect(grants.size).toBe(2);
      expect(
        (
          await client`SELECT count(*)::int AS n FROM worker_jobs WHERE id=${input.submissionId}`
        )[0].n
      ).toBe(1);
      await expect(
        caller.queueCloudflareProductionIngress({
          ...input,
          tenantId: "foreign-tenant",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(requests).toHaveLength(3);
    });
    it("admits a new exact receipt-bound rollback through the same Owner/grant/job path", async () => {
      const input = await submission("ingress-rollback-fixture");
      await caller.queueCloudflareProductionIngress(input);
      const sourceGrant = grants.get(
        `cf-production-ingress:${input.submissionId}`
      );
      const receipt = {
        grantRef: sourceGrant.grantRef,
        routeId: "f".repeat(32),
        deploymentId: "33333333-3333-4333-8333-333333333333",
        versionId: "44444444-4444-4444-8444-444444444444",
        verifiedAt: new Date().toISOString(),
        productionTrafficShifted: true,
      };
      // Only this disposable fixture simulates an already accepted provider receipt.
      await client`UPDATE worker_jobs SET status='succeeded',"activeDedupeKey"=NULL,"outputJson"=${client.json(receipt)} WHERE id=${input.submissionId}`;
      fixture.routeLive = true;
      const plan = await caller.getCloudflareProductionIngressRollbackPreflight(
        {
          tenantId: input.tenantId,
          projectId: input.projectId,
          environment: "production",
          jobId: input.submissionId,
        }
      );
      expect(plan.ready).toBe(true);
      const rollbackId = randomUUID();
      await expect(
        caller.queueCloudflareProductionIngress({
          ...input,
          submissionId: rollbackId,
          planDigest: plan.planDigest,
          rollbackJobId: input.submissionId,
        })
      ).resolves.toMatchObject({ jobId: rollbackId, status: "queued" });
      const [job] =
        await client`SELECT "inputJson" FROM worker_jobs WHERE id=${rollbackId}`;
      expect(job.inputJson).toMatchObject({
        action: "ingress-rollback",
        previousRoute: { state: "absent" },
        ingressReceipt: {
          routeId: receipt.routeId,
          grantRef: sourceGrant.grantRef,
        },
      });
      fixture.routeLive = false;
      await expect(
        caller.getCloudflareProductionIngressRollbackPreflight({
          tenantId: input.tenantId,
          projectId: input.projectId,
          environment: "production",
          jobId: input.submissionId,
        })
      ).resolves.toMatchObject({
        ready: false,
        reason: "INGRESS_ROLLBACK_PROVIDER_CHANGED",
      });
    });
    it("publishes, claims and executes the admitted job with fenced authenticated acceptance", async () => {
      fixture.routeLive = false;
      const input = await submission("ingress-claim-fixture");
      // Earlier fixture jobs already occupy this shared class. A valid Owner
      // operation must persist its exact job/outbox instead of losing admission
      // to unrelated Python work; execution authorization is checked below.
      const previousLimit = process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG;
      process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG = "1";
      try {
        await expect(caller.queueCloudflareProductionIngress(input))
          .resolves.toMatchObject({ jobId: input.submissionId, status: "queued" });
        await caller.queueCloudflareProductionIngress(input);
        expect((await client`SELECT count(*)::int AS n FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`)[0].n).toBe(1);
      } finally {
        if (previousLimit === undefined) delete process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG;
        else process.env.FEATURE_186_MAX_CONCURRENT_PER_TENANT_LONG = previousLimit;
      }
      const grant = grants.get(`cf-production-ingress:${input.submissionId}`);
      const { getDb } = await import("../db");
      const db = getDb();
      const { createJobControlPlane } = await import("./jobControlPlane");
      const { publishJobOutboxRow } = await import("./jobOutboxPublisher");
      const { PostgresPullJobTransportAdapter } =
        await import("./jobTransportAdapters");
      const { JobExecutorRegistry } = await import("./jobExecutorRegistry");
      const { executeCanonicalJobEnvelope } =
        await import("../jobs/unifiedJobConsumer");
      const { createCloudflareProductionIngressExecutor } =
        await import("./cloudflareProductionIngressExecutor");
      const {
        recordIngressBrowserAcceptance,
        waitForIngressBrowserAcceptance,
      } = await import("./cloudflareProductionIngressAcceptance");
      const [outbox] =
        await client`SELECT * FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`;
      await expect(
        publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter())
      ).resolves.toMatchObject({ state: "published" });
      const receipt = {
        routeId: "e".repeat(32),
        deploymentId: randomUUID(),
        versionId: randomUUID(),
      };
      const runtime: any = {
        resolveExecutorId: () => grant.executorId,
        resolveIngressGrant: async () => grant,
        resolveTarget: async () => ({
          tenantId: input.tenantId,
          projectId: input.projectId,
          targetId: grant.targetId,
          workerRef: grant.targetId,
          accountRef: grant.accountRef,
          environment: "production",
          enabled: true,
          credentialRef: "fixture",
          runtimePolicy: grant.operation.configurationRef,
        }),
        resolveArtifact: async () => ({
          artifactRef: grant.operation.artifactRef,
          sourceSha: grant.operation.sourceSha,
          buildDigest: grant.operation.buildDigest,
        }),
        withCredential: async ({ operation }: any) => ({
          status: "CONFIGURED",
          value: await operation("fixture"),
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
        prepareVersion: async () => ({
          versionId: receipt.versionId,
          sourceSha: grant.operation.sourceSha,
          buildDigest: grant.operation.buildDigest,
          configurationDigest: grant.operation.configurationDigest,
          trafficShifted: false,
        }),
        ingress: async ({ acceptApplication }: any) => ({
          ...receipt,
          productionTrafficShifted: true,
          authenticatedAcceptance: await acceptApplication(receipt),
        }),
        waitForIngressAcceptance: async (parameters: any) => {
          const event = {
            jobId: input.submissionId,
            actorUserId: 17,
            tenantId: input.tenantId,
            receipt,
            passed: true,
            verifiedPublicOrigin: "https://smartaihub.app",
          };
          await expect(
            recordIngressBrowserAcceptance(db, { ...event, actorUserId: 18 })
          ).rejects.toThrow("SCOPE_DENIED");
          await expect(
            recordIngressBrowserAcceptance(db, {
              ...event,
              tenantId: "foreign",
            })
          ).rejects.toThrow("SCOPE_DENIED");
          await expect(
            recordIngressBrowserAcceptance(db, {
              ...event,
              verifiedPublicOrigin: undefined,
            })
          ).rejects.toThrow("NOT_EDGE_ATTESTED");
          await expect(
            recordIngressBrowserAcceptance(db, {
              ...event,
              receipt: { ...receipt, routeId: "0".repeat(32) },
            })
          ).rejects.toThrow("SCOPE_DENIED");
          await recordIngressBrowserAcceptance(db, event);
          await recordIngressBrowserAcceptance(db, event);
          return waitForIngressBrowserAcceptance(db, {
            ...parameters,
            pollMs: 1,
          });
        },
        now: () => new Date(),
      };
      const registry = new JobExecutorRegistry();
      registry.register({
        jobType: "cloudflare.production.deploy",
        executionClass: "long",
        contractVersions: new Set([grant.operation.contractVersion]),
        executor: createCloudflareProductionIngressExecutor(() => runtime),
      });
      const result = await executeCanonicalJobEnvelope(outbox.envelopeJson, {
        controlPlane: createJobControlPlane(),
        executorRegistry: registry,
        runnerId: "isolated-ingress-node",
        adapter: "postgres-pull",
      });
      expect(result.state).toBe("succeeded");
      const [job] =
        await client`SELECT status,"outputJson","fencingVersion" FROM worker_jobs WHERE id=${input.submissionId}`;
      expect(job).toMatchObject({
        status: "succeeded",
        fencingVersion: 1,
        outputJson: {
          authenticatedAcceptance: { verified: true, actorUserId: 17 },
        },
      });
      expect(
        (
          await client`SELECT count(*)::int AS n FROM worker_job_events WHERE "workerJobId"=${input.submissionId} AND "eventType"='INGRESS_BROWSER_ACCEPTANCE'`
        )[0].n
      ).toBe(1);
      await expect(
        recordIngressBrowserAcceptance(db, {
          jobId: input.submissionId,
          actorUserId: 17,
          tenantId: input.tenantId,
          receipt,
          passed: true,
          verifiedPublicOrigin: "https://smartaihub.app",
        })
      ).rejects.toThrow("SCOPE_DENIED");
      expect(
        (
          await client`SELECT count(*)::int AS n FROM worker_job_outbox WHERE "workerJobId"=${input.submissionId}`
        )[0].n
      ).toBe(1);
    });
    it("retains the same submission without consuming a grant while worker capacity is unavailable", async () => {
      fixture.routeLive = false;
      const input = await submission("ingress-jit-capacity");
      const previousRequests = requests.length;
      fixture.workerReady = false;
      try {
        await expect(caller.queueCloudflareProductionIngress(input)).rejects.toThrow("MIGRATION_WAITING_WORKER_CAPACITY");
        expect(requests).toHaveLength(previousRequests);
        expect(await client`SELECT id FROM worker_jobs WHERE id=${input.submissionId}`).toHaveLength(0);
      } finally { fixture.workerReady = true; }
      await expect(caller.queueCloudflareProductionIngress(input)).resolves.toMatchObject({ jobId: input.submissionId });
      expect(requests).toHaveLength(previousRequests + 1);
      const { recordMigrationContinuation, getCloudflareMigrationMission } = await import("./cloudflareMigrationLifecycle");
      const { getDb } = await import("../db");
      const metadata = { migrationMode: "FIRST_MIGRATION" as const, architecture: "HYBRID_INGRESS" as const,
        agentCapacity: "WAITING_AGENT_CAPACITY" as const, engineeringCheckpoint: "REPAIR_REQUIRED" as const,
        handoffRef: "orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/HANDOFF.md" as const };
      const persisted = await recordMigrationContinuation(getDb(), input, metadata);
      const projection = await getCloudflareMigrationMission(getDb(), input);
      expect(projection).toMatchObject({ campaignId: persisted.campaignId, migrationMode: "FIRST_MIGRATION", state: "AUTHORIZED", campaignAuthority: "NOT_AUTHORIZED" });
      await expect(recordMigrationContinuation(getDb(), { ...input, tenantId: "foreign" }, metadata)).rejects.toThrow("MIGRATION_EXISTING_MISSION_REQUIRED");
      expect((await client`SELECT count(*)::int n FROM worker_jobs WHERE id=${input.submissionId}`)[0].n).toBe(1);
    });
    it("recovers only the definite pre-provider origin binding defect under the same unexpired grant",async()=>{
      fixture.routeLive=false;const input=await submission("ingress-binding-recovery");await caller.queueCloudflareProductionIngress(input);
      const grant=grants.get(`cf-production-ingress:${input.submissionId}`);
      const {createJobControlPlane}=await import("./jobControlPlane");const cp=createJobControlPlane();
      // A disposable failed execution record, never a production authority write.
      await client`UPDATE worker_jobs SET status='failed',"errorCode"='CLOUDFLARE_PRODUCTION_ORIGIN_GRANT_REQUIRED',"fencingVersion"=1 WHERE id=${input.submissionId}`;
      const evidence={disposition:"pre_submission_failure" as const,knownRuntime:"cloudflare_production_ingress_origin_binding" as const,
        operationKey:`ingress-origin-binding:${input.submissionId}:${grant.operation.buildDigest}`,
        replacementGrantRef:grant.grantRef,replacementGrantExpiresAt:grant.expiresAt};
      const scope={tenantId:input.tenantId,requestedByUserId:17,authorizationScope:"infrastructure.cloudflare_production_ingress_technical_recovery"};
      await expect(cp.recoverReviewGatedJob(input.submissionId,randomUUID(),"corrected binding",{...evidence,replacementGrantExpiresAt:new Date(Date.now()+1000).toISOString()},undefined,scope)).resolves.toBe(false);
      await expect(cp.recoverReviewGatedJob(input.submissionId,randomUUID(),"corrected binding",evidence,undefined,scope)).resolves.toBe(true);
      const [job]=await client`SELECT status,attempt,"maxAttempts","inputJson" FROM worker_jobs WHERE id=${input.submissionId}`;
      expect(job).toMatchObject({status:"queued",attempt:2,maxAttempts:2,inputJson:{grantRef:grant.grantRef}});
      await client`UPDATE worker_jobs SET status='failed',"errorCode"='CLOUDFLARE_PRODUCTION_ORIGIN_GRANT_REQUIRED' WHERE id=${input.submissionId}`;
      await client`UPDATE worker_jobs SET attempt=4,"maxAttempts"=4,"fencingVersion"=4 WHERE id=${input.submissionId}`;
      await expect(cp.recoverReviewGatedJob(input.submissionId,randomUUID(),"corrected binding",evidence,undefined,scope)).resolves.toBe(false);
    });

  }
);
