import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerJobs, workers } from "../../../drizzle/schema";
import { createSpec267NativePostgres } from "./support/spec267NativePostgres";
import { installSpec267WorkerClaimSchema } from "./support/spec267WorkerClaimSchema";

const { database } = vi.hoisted(() => ({ database: { current: null as any } }));
vi.mock("../../db", () => ({ getDb: () => {
  if (!database.current) throw new Error("Native test database is not ready");
  return database.current;
} }));
vi.mock("../auditLogger", () => ({ auditLogger: { log: vi.fn() } }));
vi.mock("../jobControlPlaneGateway", () => ({ createControlPlaneJob: vi.fn() }));

const suite = process.env.RUN_NATIVE_WORKER_POSTGRES_TESTS === "true" ? describe : describe.skip;

suite("SPEC-267 real PostgreSQL claim and restart recovery (scoped canonical schema)", () => {
  let fixture: Awaited<ReturnType<typeof createSpec267NativePostgres>> | undefined;
  let client: ReturnType<Awaited<ReturnType<typeof createSpec267NativePostgres>>["connect"]> | undefined;
  let service: typeof import("../workerRegistryService");
  const tenantId = randomUUID();
  const workerId = randomUUID();
  const runtimeType = "desktop_zeroclaw_managed" as const;

  function reconnect() {
    client = fixture!.connect();
    database.current = drizzle(client);
  }
  async function addJob(values: Partial<typeof workerJobs.$inferInsert> = {}) {
    const id = randomUUID();
    await database.current.insert(workerJobs).values({ id, tenantId, runtimeType,
      jobType: "native_test", ...values });
    return id;
  }
  const claim = (capabilityHints: string[]) => service.claimWorkerJob({
    auth: { tenantId, workerId, runtimeType } as any, workerId,
    payload: { maxJobs: 1, capabilityHints },
  });

  beforeAll(async () => {
    fixture = await createSpec267NativePostgres();
    reconnect();
    await installSpec267WorkerClaimSchema(client!);
    process.env.JWT_SECRET ||= "spec267-native-test-only-secret-at-least-32-characters";
    service = await import("../workerRegistryService");
    await database.current.insert(workers).values({ id: workerId, tenantId,
      runtimeType, displayName: "isolated native worker", runtimeVersion: "1.0.0",
      externalReference: workerId, status: "online",
      capabilitiesJson: { workerApp: { sharingMode: "tenant", acceptJobs: true } },
    });
  }, 40_000);

  afterAll(async () => {
    database.current = null;
    await client?.end({ timeout: 2 });
    if (fixture) {
      const root = fixture.root;
      await fixture.close();
      await fixture.close(); // Idempotent cleanup.
      await expect(access(root)).rejects.toMatchObject({ code: "ENOENT" });
    }
  }, 20_000);

  it("uses only its owned data directory and private socket, with TCP disabled", async () => {
    const [row] = await client!`SELECT current_database() AS database, current_setting('data_directory') AS data, current_setting('listen_addresses') AS listen`;
    expect(row).toEqual({ database: fixture!.database, data: fixture!.data, listen: "" });
  });

  it("has every current worker_jobs column and canonical dedupe indexes", async () => {
    const columns = await client!`SELECT column_name FROM information_schema.columns WHERE table_name = 'worker_jobs'`;
    expect(columns.map(row => row.column_name).sort()).toEqual(Object.values(workerJobs)
      .filter((column: any) => column && typeof column.name === "string" && typeof column.getSQLType === "function")
      .map((column: any) => column.name).sort());
    const indexes = await client!`SELECT indexname FROM pg_indexes WHERE tablename = 'worker_jobs'`;
    expect(indexes.map(row => row.indexname)).toContain("worker_jobs_tenant_active_dedupe_key_unique");
  });

  it("scans past a full incompatible page and dispatches compatible independent work", async () => {
    for (let i = 0; i < 12; i++) await addJob({ priority: 100,
      capabilityRequirementsJson: { capabilityFamilies: ["gpu"] } });
    const compatible = await addJob({ priority: 1,
      capabilityRequirementsJson: { capabilityFamilies: ["cpu"] } });
    expect((await claim(["cpu"])).job?.id).toBe(compatible);
  });

  it("does not dispatch an incompatible job when the worker lacks its capability", async () => {
    expect((await claim(["cpu"])).job).toBeNull();
    const [row] = await client!`SELECT count(*)::int AS count FROM worker_jobs WHERE status = 'queued'`;
    expect(row.count).toBe(12);
  });

  it("allows only one concurrent CAS claim for a job", async () => {
    const id = await addJob();
    const repo = service.getDefaultWorkerRuntimeRepository();
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) =>
      repo.tryClaimJob(id, workerId, `concurrent-${i}`, new Date(Date.now() + 60_000))));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("reclaims an expired worker lease and rejects the old token before side effects", async () => {
    const id = await addJob({ status: "claimed", workerId, leaseOwnerToken: "crashed-worker-token",
      leaseExpiresAt: new Date(Date.now() - 5_000) });
    const repo = service.getDefaultWorkerRuntimeRepository();
    const recovered = await repo.tryClaimJob(id, workerId, "replacement-token", new Date(Date.now() + 60_000));
    expect(recovered?.leaseOwnerToken).toBe("replacement-token");
    await expect(service.recordWorkerJobEvent({ auth: { tenantId, workerId, runtimeType } as any,
      jobId: id, payload: { eventType: "job.started", leaseOwnerToken: "crashed-worker-token", sequenceNumber: 1, payloadJson: {} } as any,
    })).rejects.toMatchObject({ code: "stale_worker_lease" });
    expect((await repo.getJobById(tenantId, id))?.status).toBe("claimed");
  });

  it("keeps the canonical active dedupe constraint during duplicate dispatch", async () => {
    const key = randomUUID();
    await addJob({ activeDedupeKey: key });
    await expect(addJob({ activeDedupeKey: key })).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("recovers durable expired assignments after PostgreSQL and client restart", async () => {
    const id = await addJob({ status: "running", workerId, leaseOwnerToken: "before-restart",
      leaseExpiresAt: new Date(Date.now() - 5_000) });
    await client!.end({ timeout: 2 });
    database.current = null;
    await fixture!.restart();
    reconnect();
    const repo = service.getDefaultWorkerRuntimeRepository();
    const rows = await repo.listClaimableJobs(tenantId, runtimeType, null, [], { limit: 100 });
    expect(rows.some(row => row.id === id)).toBe(true);
    expect((await repo.tryClaimJob(id, workerId, "after-restart", new Date(Date.now() + 60_000)))?.leaseOwnerToken).toBe("after-restart");
  }, 30_000);
});
