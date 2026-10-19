import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = process.env.RUN_CLOUDFLARE_STAGING_DB_INTEGRATION === "true";
const suite = enabled ? describe : describe.skip;

suite("Cloudflare staging canonical PostgreSQL execution", () => {
  let disposable: Awaited<
    ReturnType<
      typeof import("./__tests__/support/spec277DisposablePostgres").createSpec277DisposablePostgres
    >
  >;
  let sql: import("postgres").Sql;
  let closeDb: typeof import("../db").closeDb;
  let runtimeDb: import("../db").DrizzleDB;
  let schema: typeof import("../../drizzle/schema");
  let controlPlane: ReturnType<
    typeof import("./jobControlPlane").createJobControlPlane
  >;
  let createJobControlPlane: typeof import("./jobControlPlane").createJobControlPlane;
  let executeCanonicalJobEnvelope: typeof import("../jobs/unifiedJobConsumer").executeCanonicalJobEnvelope;
  let createJobExecutorRegistry: typeof import("./jobExecutorRegistry").createJobExecutorRegistry;
  let createCloudflareStagingDeploymentExecutor: typeof import("./cloudflareStagingDeploymentExecutor").createCloudflareStagingDeploymentExecutor;
  let bindCloudflareStagingDeploymentAuthorities: typeof import("./cloudflareStagingDeploymentExecutor").bindCloudflareStagingDeploymentAuthorities;
  let createCloudflareStagingArtifactAuthority: typeof import("./cloudflareStagingArtifactAuthority").createCloudflareStagingArtifactAuthority;
  let createCanonicalBuildReceiptAuthority: typeof import("./cloudflareStagingArtifactAuthority").createCanonicalBuildReceiptAuthority;
  let createCloudflareStagingApiTransport: typeof import("./cloudflareStagingApiTransport").createCloudflareStagingApiTransport;
  let resolveProviderDeploymentTarget: typeof import("./providerDeploymentTargetAuthority").resolveProviderDeploymentTarget;
  let createProviderDeploymentTarget: typeof import("./providerDeploymentTargetAuthority").createProviderDeploymentTarget;
  let saveCloudflareDeploymentCredential: typeof import("./cloudflareCredentialCenter").saveCloudflareDeploymentCredential;
  let createCloudflareStagingExecutorProof: typeof import("./cloudflareStagingExecutorIdentityService").createCloudflareStagingExecutorProof;
  let verifyCloudflareStagingExecutorProof: typeof import("./cloudflareStagingExecutorIdentityService").verifyCloudflareStagingExecutorProof;
  let validateCloudflareStagingExecutorRegistration: typeof import("./cloudflareStagingExecutorIdentityService").validateCloudflareStagingExecutorRegistration;
  let artifactAuthority: ReturnType<
    typeof import("./cloudflareStagingArtifactAuthority").createCloudflareStagingArtifactAuthority
  >;
  let buildReceiptRoot: string;
  let originalEnv: Record<string, string | undefined>;

  beforeAll(async () => {
    originalEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      LLM_ENCRYPTION_KEY: process.env.LLM_ENCRYPTION_KEY,
      DB_POOL_SIZE: process.env.DB_POOL_SIZE,
    };
    const { createSpec277DisposablePostgres } =
      await import("./__tests__/support/spec277DisposablePostgres");
    const { installSpec277AutoTeamRuntimeSchema } =
      await import("./__tests__/support/spec277AutoTeamRuntimeSchema");
    disposable = await createSpec277DisposablePostgres();
    process.env.DATABASE_URL = disposable.databaseUrl;
    process.env.NODE_ENV = "test";
    process.env.LLM_ENCRYPTION_KEY =
      "cloudflare-staging-disposable-test-key-only";
    process.env.DB_POOL_SIZE = "2";
    const postgres = (await import("postgres")).default;
    sql = postgres(disposable.databaseUrl, { max: 2 });
    vi.resetModules();
    schema = await import("../../drizzle/schema");
    await installSpec277AutoTeamRuntimeSchema(sql, [
      schema.canonicalProjects,
      schema.tenants,
      schema.users,
      schema.runnerNodes,
      schema.providerDeploymentTargets,
      schema.providerDeploymentCredentials,
      schema.tenantDataTransferPlans,
      schema.tenantIdentityActions,
    ]);
    ({ closeDb } = await import("../db"));
    runtimeDb = (await import("../db")).getDb();
    ({ createJobControlPlane } = await import("./jobControlPlane"));
    controlPlane = createJobControlPlane();
    ({ executeCanonicalJobEnvelope } =
      await import("../jobs/unifiedJobConsumer"));
    ({ createJobExecutorRegistry } = await import("./jobExecutorRegistry"));
    ({
      createCloudflareStagingDeploymentExecutor,
      bindCloudflareStagingDeploymentAuthorities,
    } = await import("./cloudflareStagingDeploymentExecutor"));
    ({
      createCloudflareStagingArtifactAuthority,
      createCanonicalBuildReceiptAuthority,
    } = await import("./cloudflareStagingArtifactAuthority"));
    ({ createCloudflareStagingApiTransport } =
      await import("./cloudflareStagingApiTransport"));
    ({ resolveProviderDeploymentTarget, createProviderDeploymentTarget } =
      await import("./providerDeploymentTargetAuthority"));
    ({ saveCloudflareDeploymentCredential } =
      await import("./cloudflareCredentialCenter"));
    ({
      createCloudflareStagingExecutorProof,
      verifyCloudflareStagingExecutorProof,
      validateCloudflareStagingExecutorRegistration,
    } = await import("./cloudflareStagingExecutorIdentityService"));
  }, 30_000);

  afterAll(async () => {
    if (closeDb) await closeDb();
    if (sql) await sql.end({ timeout: 5 });
    if (disposable) await disposable.close();
    if (buildReceiptRoot)
      await rm(buildReceiptRoot, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalEnv ?? {})) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }, 20_000);

  it("executes a persisted worker_jobs outbox envelope with DB-bound target, credential, executor, artifact and Cloudflare transport", async () => {
    const tenantId = "cf-stage-db-test";
    const projectId = "smartspec";
    const sourceSha = "a".repeat(40);
    const rollbackSha = "c".repeat(40);
    const accountId = "0123456789abcdef0123456789abcdef";
    const executorId = "cf-staging-executor:integration-test";
    const targetId = "smartspec-cloudflare-staging" as const;
    const [user] = await runtimeDb
      .insert(schema.users)
      .values({
        openId: `cf-stage-${Date.now()}`,
        role: "admin",
        plan: "free",
        credits: 0,
        isDisabled: false,
      })
      .returning({ id: schema.users.id });
    await runtimeDb.insert(schema.tenants).values({
      id: tenantId,
      slug: tenantId,
      name: "Disposable Cloudflare Staging",
    });

    const pair = generateKeyPairSync("ed25519");
    const registered = validateCloudflareStagingExecutorRegistration({
      executorId,
      publicKey: pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await runtimeDb.insert(schema.runnerNodes).values({
      runnerId: executorId,
      tenantId,
      ownerUserId: user!.id,
      nodeKind: "service_executor",
      profile: "cloudflare_staging_executor",
      displayName: "Disposable Cloudflare staging executor",
      trustState: "trusted",
      status: "registered",
      snapshotExpiresAt: registered.expiresAt,
      currentSnapshotJson: {
        cloudflareStagingExecutor: {
          version: 1,
          publicKey: registered.publicKey,
          fingerprint: registered.fingerprint,
          target: targetId,
          capability: "cloudflare:staging:deploy",
        },
      },
    });

    const identity = {
      tenantId,
      projectId,
      environment: "staging",
      provider: "cloudflare",
    };
    const targetResult = await createProviderDeploymentTarget(runtimeDb, {
      identity,
      deploymentTargetId: targetId,
      accountRef: accountId,
      workerRef: targetId,
      provenance: "disposable integration fixture",
      actorUserId: user!.id,
    });
    expect(targetResult.status).toBe("CREATED");
    await saveCloudflareDeploymentCredential(runtimeDb, {
      identity,
      token: "disposable-cloudflare-token",
      actorUserId: user!.id,
    });

    const moduleBytes = new TextEncoder().encode(
      "export default { fetch() { return new Response('ok') } };"
    );
    const assetBytes = new TextEncoder().encode(
      "<!doctype html><title>disposable</title>"
    );
    const files = [
      ["modules/index.js", moduleBytes],
      ["public/index.html", assetBytes],
    ] as const;
    const bundleDigest = createHash("sha256")
      .update(
        files
          .map(
            ([name, bytes]) =>
              `${name}\0${createHash("sha256").update(bytes).digest("hex")}\0${bytes.byteLength}`
          )
          .join("\n")
      )
      .digest("hex");
    const receipt = {
      buildId: "disposable-test-build-0001",
      status: "BUILD_PASSED" as const,
      canonicalRef: "refs/heads/main" as const,
      sourceSha,
      canonicalTipAfterBuild: sourceSha,
      cloudflareBundleDigest: bundleDigest,
      completedAt: new Date().toISOString(),
    };
    buildReceiptRoot = await mkdtemp(
      join(tmpdir(), "cloudflare-staging-receipt-test-")
    );
    await writeFile(
      join(buildReceiptRoot, `${receipt.buildId}.json`),
      JSON.stringify({
        status: "BUILD_PASSED",
        canonical_ref: "refs/heads/main",
        source_revision: sourceSha,
        canonical_tip_after_build: sourceSha,
        source_verified: true,
        cloudflare_staging_artifact: {
          status: "PUBLISHED",
          source_sha: sourceSha,
          build_digest: bundleDigest,
          artifact_ref: `sha256:${bundleDigest}`,
        },
      }),
      { mode: 0o600 }
    );
    const storageMap = new Map<string, Uint8Array>();
    artifactAuthority = createCloudflareStagingArtifactAuthority({
      storage: {
        async putIfAbsent(key, bytes) {
          if (!storageMap.has(key)) storageMap.set(key, Uint8Array.from(bytes));
        },
        async readBuffer(key) {
          return storageMap.get(key) ?? null;
        },
      },
      buildReceipts: createCanonicalBuildReceiptAuthority(buildReceiptRoot),
    });
    const publishedArtifact = await artifactAuthority.publish({
      receipt,
      bundle: {
        mainModule: "index.js",
        compatibilityDate: "2026-10-17",
        moduleFiles: {
          "index.js": {
            contentType: "application/javascript+module",
            bytes: moduleBytes,
          },
        },
        assets: {
          "index.html": { contentType: "text/html", bytes: assetBytes },
        },
      },
    });

    const versionId = "22222222-2222-4222-8222-222222222222";
    const deploymentId = "11111111-1111-4111-8111-111111111111";
    const cloudflareRequests: string[] = [];
    const fetchImpl: typeof fetch = async (input, init = {}) => {
      const url = String(input);
      cloudflareRequests.push(url);
      if (!url.startsWith("https://api.cloudflare.com/client/v4/")) {
        if (url.endsWith("/healthz"))
          return Response.json({ ok: true, service: "smartspec-cloudflare-runtime" });
        throw new Error("unexpected test transport URL");
      }
      const result = url.endsWith("/assets-upload-session")
        ? { jwt: "asset-session", buckets: [] }
        : url.endsWith("/versions")
          ? { id: versionId }
          : url.endsWith("/deployments") && init.method === "POST"
            ? { id: deploymentId }
            : url.endsWith("/deployments")
              ? { deployments: [{ id: deploymentId }] }
              : url.endsWith("/workers/subdomain")
                ? { subdomain: "disposable-account" }
                : url.endsWith(`/deployments/${deploymentId}`)
                  ? {
                      id: deploymentId,
                      versions: [{ version_id: versionId, percentage: 100 }],
                    }
                  : url.endsWith(`/versions/${versionId}`)
                    ? {
                        id: versionId,
                        annotations: {
                          "workers/message": `SmartAIHub staging ${sourceSha} ${bundleDigest}`,
                        },
                      }
                    : null;
      if (!result)
        return new Response(
          JSON.stringify({
            success: false,
            errors: [
              { code: 1000, message: "unexpected mocked Cloudflare endpoint" },
            ],
          }),
          { status: 500 }
        );
      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const cloudflare = createCloudflareStagingApiTransport({
      resolveBundle: ref => artifactAuthority.resolveBundle(ref),
      fetchImpl,
    });
    const rollbackDigest = "d".repeat(64);
    let grant = {
      schemaVersion: "cloudflare.staging-deployment-grant.v1" as const,
      grantRef: "a4dca6ee-3424-4c4e-86b6-f6aa5ed8f8c0",
      tenantId,
      requesterUserId: user!.id,
      projectId,
      executorId,
      targetId,
      environment: "staging" as const,
      artifactRef: publishedArtifact.artifactRef,
      sourceSha,
      buildDigest: publishedArtifact.buildDigest,
      actions: ["deploy", "rollback"] as readonly ("deploy" | "rollback")[],
      rollbackDeploymentId: deploymentId,
      rollbackArtifactRef: `sha256:${rollbackDigest}`,
      rollbackSourceSha: rollbackSha,
      rollbackBuildDigest: rollbackDigest,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      revoked: false as const,
    };
    const python = process.env.CLOUDFLARE_POLICY_TEST_PYTHON;
    const policyJobId = "06c1af13-d332-49b5-89ef-81c7f1089ca4";
    async function policyProbe(data: Record<string, unknown>): Promise<{ grant: typeof grant | null }> {
      if (!python) throw new Error("POLICY_TEST_PYTHON_REQUIRED");
      return new Promise((resolveProbe, reject) => {
        const child = spawn(python, ["tests/integration/cloudflare_staging_policy_probe.py"], {
          cwd: resolve(import.meta.dirname, "../../../../python-backend"),
          env: { ...process.env, DEBUG: "false", PYTHONPATH: "." }, stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "", stderr = "";
        child.stdout.on("data", chunk => { stdout += chunk; });
        child.stderr.on("data", chunk => { stderr += chunk; });
        child.on("error", reject);
        child.on("close", code => {
          const line = stdout.split("\n").find(value => value.startsWith("POLICY_PROBE:"));
          if (code !== 0 || !line) return reject(new Error(`DISPOSABLE_POLICY_PROBE_FAILED: ${stderr.slice(-4000)}`));
          resolveProbe(JSON.parse(line.slice("POLICY_PROBE:".length)));
        });
        child.stdin.end(JSON.stringify({ databaseUrl: disposable.databaseUrl, ...data }));
      });
    }
    if (python) {
      await runtimeDb.update(schema.tenants).set({ ownerId: user!.id }).where((await import("drizzle-orm")).eq(schema.tenants.id, tenantId));
      await runtimeDb.insert(schema.canonicalProjects).values({ projectId, tenantId, projectType: "platform-deployment", title: "Disposable policy fixture", ownerPrincipalId: `user:${user!.id}` });
      const issued = await policyProbe({ mode: "issue", grant, jobId: policyJobId, accountRef: accountId });
      expect(issued.grant).not.toBeNull();
      const [decision] = await sql`SELECT extra_data FROM approval_requests WHERE id = ${issued.grant!.grantRef}`;
      expect(decision!.extra_data.cloudflareStagingGrantIssuerV1).toBe("owner_staging_policy");
      const [audits] = await sql`SELECT count(*)::int AS count FROM audit_logs WHERE action = 'cloudflare.staging_grant.policy_approved'`;
      expect(audits!.count).toBe(1);
      grant = { ...issued.grant!, revoked: false };
    } else {
      await sql.unsafe(`
        CREATE TABLE approval_requests (
          id varchar(36) PRIMARY KEY,
          request_type varchar(50) NOT NULL,
          tenant_id varchar(36) NOT NULL,
          project_id varchar(255) NOT NULL,
          requester_id integer NOT NULL,
          status varchar(20) NOT NULL,
          payload jsonb NOT NULL,
          extra_data jsonb NOT NULL,
          current_approvals integer NOT NULL,
          required_approvers integer NOT NULL,
          resolved_at timestamptz NOT NULL,
          revoked_at timestamptz,
          expires_at timestamptz NOT NULL
        )
      `);
      await sql`
        INSERT INTO approval_requests
          (id, request_type, tenant_id, project_id, requester_id, status, payload, extra_data,
           current_approvals, required_approvers, resolved_at, expires_at)
        VALUES (${grant.grantRef}, 'deployment', ${tenantId}, ${projectId}, ${user!.id}, 'approved',
          ${grant}::jsonb, ${{ cloudflareStagingGrantIssuerV1: "admin_approval_workflow" }}::jsonb,
          1, 1, NOW(), ${grant.expiresAt})
      `;
      const [storedGrant] = await sql<
        { id: string; status: string; payload: Record<string, unknown> }[]
      >`
        SELECT id, status, payload FROM approval_requests WHERE id = ${grant.grantRef}
      `;
      expect(storedGrant?.status).toBe("approved");
      expect(storedGrant?.payload).toEqual(grant);
    }
    const runtime = bindCloudflareStagingDeploymentAuthorities({
      db: runtimeDb,
      cloudflare,
      resolveGrant: async ref => {
        if (python) {
          const resolved = await policyProbe({ mode: "resolve", grantRef: ref });
          return resolved.grant ? { ...resolved.grant, revoked: false as const } : null;
        }
        const [row] = await sql<
          {
            payload: Record<string, unknown>;
            extra_data: Record<string, unknown>;
          }[]
        >`
          SELECT payload, extra_data FROM approval_requests
          WHERE id = ${ref} AND request_type = 'deployment' AND status = 'approved'
            AND revoked_at IS NULL AND current_approvals >= required_approvers
            AND resolved_at IS NOT NULL AND expires_at > NOW()
        `;
        if (
          !row ||
          row.extra_data.cloudflareStagingGrantIssuerV1 !==
            "admin_approval_workflow"
        )
          return null;
        const persisted = row.payload as typeof grant;
        if (
          persisted.grantRef !== ref ||
          persisted.tenantId !== tenantId ||
          persisted.projectId !== projectId ||
          persisted.requesterUserId !== user!.id ||
          persisted.revokedAt !== null
        )
          return null;
        return { ...persisted, revoked: false as const };
      },
      resolveArtifact: async ref => {
        if (ref !== publishedArtifact.artifactRef) return null;
        const resolvedBundle = await artifactAuthority.resolveBundle(ref);
        return resolvedBundle
          ? {
              artifactRef: ref,
              sourceSha: resolvedBundle.sourceSha,
              buildDigest: resolvedBundle.buildDigest,
              immutable: true as const,
            }
          : null;
      },
      executorIdentity: async binding => {
        const proof = await createCloudflareStagingExecutorProof(binding, {
          resolvePrivateKey: async () => ({
            executorId,
            privateKey: pair.privateKey
              .export({ type: "pkcs8", format: "pem" })
              .toString(),
          }),
        });
        return verifyCloudflareStagingExecutorProof(proof, {
          expectedBinding: binding,
        });
      },
    });

    const {
      CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
      CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
    } = await import("./cloudflareStagingDeploymentExecutor");
    const definition = {
      contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
      tenantId,
      requestedByUserId: user!.id,
      jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      executionClass: "long" as const,
      input: {
        contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
        action: "deploy",
        targetId,
        environment: "staging",
        grantRef: grant.grantRef,
        artifactRef: publishedArtifact.artifactRef,
        sourceSha,
        buildDigest: publishedArtifact.buildDigest,
      },
      idempotencyKey: `cf-stage-${Date.now()}`,
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: "none" as const,
        deadlineMs: 60_000,
        allowedErrorClasses: [],
      },
      timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 60_000 },
    };
    const job = await controlPlane.create(definition, python ? { canonicalJobId: policyJobId } : undefined);
    expect(job.created).toBe(true);
    const [outbox] = await runtimeDb
      .select()
      .from(schema.workerJobOutbox)
      .where(
        (await import("drizzle-orm")).eq(
          schema.workerJobOutbox.workerJobId,
          job.jobId
        )
      );
    expect(outbox?.envelopeJson).toMatchObject({
      jobId: job.jobId,
      contractVersion: CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT,
      businessAttempt: 1,
    });

    const registration = {
      jobType: CLOUDFLARE_STAGING_DEPLOYMENT_JOB,
      contractVersions: new Set([CLOUDFLARE_STAGING_DEPLOYMENT_CONTRACT]),
      executionClass: "long" as const,
      executor: createCloudflareStagingDeploymentExecutor(runtime),
    };
    const registry = createJobExecutorRegistry([registration]);
    const { publishJobOutboxRow } = await import("./jobOutboxPublisher");
    const { PostgresPullJobTransportAdapter } = await import("./jobTransportAdapters");
    const publication = await publishJobOutboxRow(outbox!.id, new PostgresPullJobTransportAdapter());
    expect(publication.state).toBe("published");
    const execution = await executeCanonicalJobEnvelope(outbox!.envelopeJson, {
      controlPlane,
      executorRegistry: registry,
      runnerId: executorId,
      adapter: "postgres-pull",
    });
    expect(execution).toMatchObject({ state: "succeeded", jobId: job.jobId });
    const status = await controlPlane.getStatus(job.jobId, { tenantId });
    expect(status).toMatchObject({ status: "succeeded" });
    expect(JSON.stringify(status?.output)).toContain('"runtimeVerified":true');
    expect(JSON.stringify(status?.output)).not.toContain(
      "disposable-cloudflare-token"
    );
    expect(
      cloudflareRequests.some(url => url.includes("/workers/subdomain"))
    ).toBe(true);
    expect(
      cloudflareRequests.filter(
        url =>
          !url.includes(
            "/accounts/0123456789abcdef0123456789abcdef/workers/scripts/smartspec-cloudflare-staging/"
          ) &&
          !url.endsWith(
            "/accounts/0123456789abcdef0123456789abcdef/workers/subdomain"
          ) &&
          !url.endsWith("/healthz")
      )
    ).toEqual([]);
  }, 30_000);
});
