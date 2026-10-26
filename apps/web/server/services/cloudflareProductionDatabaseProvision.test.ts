import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  productionDatabaseResourcePlanDigest,
  provisionCloudflareProductionDatabase,
  type ProductionDatabaseResourcePlan,
} from "./cloudflareProductionDatabaseProvision";

const accountRef = "f3fb0b6858e186fcc36be105bfa00243";
const token = "cf_api_token_test_value_123456789";
const password = "postgres_password_test_value_abcdefghijklmnopqrstuvwxyz";
const serviceId = "12345678-1234-4234-8234-123456789abc";
const hyperdriveId = "abcdefabcdefabcdefabcdefabcdefab";
const jobId = "12345678-1234-4234-8234-123456789abc";
const plan: ProductionDatabaseResourcePlan = {
  tunnelId: "87654321-4321-4321-8321-cba987654321",
  databaseHostname: "db.smartaihub.app",
  databaseName: "smartspec",
  databaseUser: "sah_cf_prod_0123456789ab",
  vpcTcpPort: 5433,
  connectionLimit: 5,
  tlsVerification: "verify_full",
};
const operationId = productionDatabaseResourcePlanDigest(plan).slice(0, 12);
const service = {
  service_id: serviceId,
  name: `smartspec-production-postgres-${operationId}`,
  type: "tcp",
  app_protocol: "postgresql",
  tcp_port: 5433,
  host: { hostname: plan.databaseHostname, resolver_network: { tunnel_id: plan.tunnelId } },
  tls_settings: { cert_verification_mode: "verify_full" },
};
const hyperdrive = {
  id: hyperdriveId,
  name: `smartspec-production-database-${operationId}`,
  origin: { service_id: serviceId, database: plan.databaseName, user: plan.databaseUser, scheme: "postgres" },
  caching: { disabled: true },
  origin_connection_limit: 5,
};
const response = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ code: 1000 }] }), { status });

describe("Cloudflare production database resources", () => {
  it("never recreates an owned VPC when provider inventory loses the checkpoint resource", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([]));
    const saveCheckpoint = vi.fn();
    await expect(provisionCloudflareProductionDatabase({ jobId, accountRef, token, plan,
      planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint: { jobId, planDigest: productionDatabaseResourcePlanDigest(plan),
        databasePasswordDigest: createHash("sha256").update(password).digest("hex"), vpcServiceId: serviceId, pending: "hyperdrive" },
      saveCheckpoint, assertAuthorized: async () => undefined, fetchImpl,
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_VPC_SERVICE_CHECKPOINT_RESOURCE_MISSING", class: "unknown" });
    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });

  it("retains bounded provider failure details while redacting both credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: false,
      errors: [{ code: 2015, message: `Connection failed ${token} ${password} postgresql://user:secret@host/db\nnext` }] }), { status: 400 }));
    await expect(provisionCloudflareProductionDatabase({ jobId, accountRef, token, plan,
      planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_DATABASE_HTTP_400_CF_2015",
      providerMessage: "Connection failed [REDACTED] [REDACTED] postgresql://[REDACTED]@host/db next" });
  });
  it("retains provider correlation evidence without recording request secrets", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: false,
      errors: [{ code: 2015, message: "Generic connection failure" }] }), { status: 400, headers: { "cf-ray": "a5063798ebf27b4c-BKK" } }));
    const error = await provisionCloudflareProductionDatabase({ jobId, accountRef, token, plan,
      planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    }).catch(error => error);
    expect(error.providerDiagnostic).toMatchObject({ method: "GET", status: 400, cfRay: "a5063798ebf27b4c-BKK" });
    expect(error.message).toContain("a5063798ebf27b4c-BKK");
    expect(error.message).not.toContain(token);
    expect(error.message).not.toContain(password);
  });
  it("creates and reads back a private VPC PostgreSQL service and uncached Hyperdrive config", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ service_id: serviceId }))
      .mockResolvedValueOnce(response(service))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: hyperdriveId }))
      .mockResolvedValueOnce(response(hyperdrive));
    const assertAuthorized = vi.fn(async () => undefined);
    const checkpoints: unknown[] = [];

    const result = await provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      saveCheckpoint: async checkpoint => { checkpoints.push(checkpoint); }, assertAuthorized, fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(assertAuthorized).toHaveBeenCalledTimes(13);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    }
    const createServiceBody = JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body));
    expect(createServiceBody).toMatchObject({ tcp_port: 5433,
      host: { hostname: plan.databaseHostname, resolver_network: { tunnel_id: plan.tunnelId } },
      tls_settings: { cert_verification_mode: "verify_full" } });
    const createHyperdriveBody = JSON.parse(String(fetchImpl.mock.calls[5]?.[1]?.body));
    expect(createHyperdriveBody).toMatchObject({ origin: { service_id: serviceId, database: plan.databaseName, user: plan.databaseUser, password, scheme: "postgres" }, caching: { disabled: true }, origin_connection_limit: 5 });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(password);
    expect(result).toMatchObject({ providerConfigurationVerified: true, workerBound: false, activation: "disabled",
      vpcService: { id: serviceId, port: 5433 }, hyperdrive: { id: hyperdriveId } });
    expect(checkpoints.at(-1)).toMatchObject({ jobId, pending: null, vpcServiceId: serviceId, hyperdriveId });
  });

  it("reuses exact existing resources without issuing provider writes", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([service]))
      .mockResolvedValueOnce(response(service))
      .mockResolvedValueOnce(response([hyperdrive]))
      .mockResolvedValueOnce(response(hyperdrive));

    const result = await provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint: { jobId, planDigest: productionDatabaseResourcePlanDigest(plan), databasePasswordDigest: createHash("sha256").update(password).digest("hex"), vpcServiceId: serviceId, hyperdriveId },
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(result.providerConfigurationVerified).toBe(true);
  });

  it("accepts Cloudflare's empty Hyperdrive mTLS readback object for a VPC origin", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([service]))
      .mockResolvedValueOnce(response(service))
      .mockResolvedValueOnce(response([hyperdrive]))
      .mockResolvedValueOnce(response({ ...hyperdrive, mtls: {} }));

    const result = await provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint: { jobId, planDigest: productionDatabaseResourcePlanDigest(plan),
        databasePasswordDigest: createHash("sha256").update(password).digest("hex"), vpcServiceId: serviceId, hyperdriveId },
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    });

    expect(result.providerConfigurationVerified).toBe(true);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("recovers an uncertain create only when the encrypted job checkpoint proves ownership", async () => {
    const checkpoints: Array<Parameters<Parameters<typeof provisionCloudflareProductionDatabase>[0]["saveCheckpoint"]>[0]> = [];
    const firstFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error("connection reset after provider accepted POST"));
    const base = { jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      saveCheckpoint: async (checkpoint: (typeof checkpoints)[number]) => { checkpoints.push(checkpoint); },
      assertAuthorized: async () => undefined };

    await expect(provisionCloudflareProductionDatabase({ ...base, fetchImpl: firstFetch }))
      .rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_DATABASE_WRITE_UNCERTAIN", errorClass: "unknown" });
    expect(checkpoints.at(-1)).toMatchObject({ pending: "vpc_service", jobId });

    const retryFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([service]))
      .mockResolvedValueOnce(response(service))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: hyperdriveId }))
      .mockResolvedValueOnce(response(hyperdrive));
    const result = await provisionCloudflareProductionDatabase({ ...base, checkpoint: checkpoints.at(-1), fetchImpl: retryFetch });

    expect(retryFetch).toHaveBeenCalledTimes(6);
    expect(retryFetch.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes("postgres"))).toBe(true);
    expect(checkpoints.at(-1)).toMatchObject({ pending: null, vpcServiceId: serviceId, hyperdriveId });
    expect(result.providerConfigurationVerified).toBe(true);
  });

  it("rejects checkpoints from another job or password before provider access", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const checkpoint = { jobId, planDigest: productionDatabaseResourcePlanDigest(plan),
      databasePasswordDigest: createHash("sha256").update(password).digest("hex"), pending: "vpc_service" as const };
    const input = { jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint, saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl };

    await expect(provisionCloudflareProductionDatabase({ ...input, jobId: "22345678-1234-4234-8234-123456789abc" }))
      .rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_MISMATCH" });
    await expect(provisionCloudflareProductionDatabase({ ...input, databasePassword: `${password}-changed` }))
      .rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_DATABASE_CHECKPOINT_MISMATCH" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on an existing VPC service whose endpoint or TLS policy drifted", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([service]))
      .mockResolvedValueOnce(response({ ...service, host: { ...service.host, hostname: "db-staging.smartaihub.app" } }));

    await expect(provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint: { jobId, planDigest: productionDatabaseResourcePlanDigest(plan), databasePasswordDigest: createHash("sha256").update(password).digest("hex"), pending: "vpc_service" },
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_VPC_SERVICE_READBACK_MISMATCH", errorClass: "unknown" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects incompatible direct-origin mTLS settings on a VPC-backed Hyperdrive", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: plan.tunnelId, status: "healthy" }))
      .mockResolvedValueOnce(response([service]))
      .mockResolvedValueOnce(response(service))
      .mockResolvedValueOnce(response([hyperdrive]))
      .mockResolvedValueOnce(response({ ...hyperdrive, mtls: { sslmode: "verify-full", ca_certificate_id: "a".repeat(32) } }));

    await expect(provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      checkpoint: { jobId, planDigest: productionDatabaseResourcePlanDigest(plan), databasePasswordDigest: createHash("sha256").update(password).digest("hex"), vpcServiceId: serviceId, hyperdriveId },
      saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl,
    })).rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_HYPERDRIVE_READBACK_MISMATCH", errorClass: "unknown" });
  });

  it("requires production authorization before every provider operation", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const assertAuthorized = vi.fn(async () => { throw new Error("revoked"); });

    await expect(provisionCloudflareProductionDatabase({
      jobId, accountRef, token, plan, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password,
      saveCheckpoint: async () => undefined, assertAuthorized, fetchImpl,
    })).rejects.toThrow("revoked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an unapproved database hostname, weaker TLS verification, and tampered plan digests before provider access", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const base = { jobId, accountRef, token, planDigest: productionDatabaseResourcePlanDigest(plan), databasePassword: password, saveCheckpoint: async () => undefined, assertAuthorized: async () => undefined, fetchImpl };

    await expect(provisionCloudflareProductionDatabase({ ...base, plan: { ...plan, databaseHostname: "attacker.example" as "db.smartaihub.app" } }))
      .rejects.toThrow();
    await expect(provisionCloudflareProductionDatabase({ ...base, plan: { ...plan, tlsVerification: "verify_ca" as "verify_full" } }))
      .rejects.toThrow();
    await expect(provisionCloudflareProductionDatabase({ ...base, plan, planDigest: "0".repeat(64) }))
      .rejects.toMatchObject({ diagnosticCode: "CLOUDFLARE_PRODUCTION_DATABASE_PLAN_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
