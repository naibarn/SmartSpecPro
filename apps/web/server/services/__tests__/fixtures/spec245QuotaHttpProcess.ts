import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { createServer } from "node:http";
import { quotaMiddleware } from "../../../middleware/quotaMiddleware";
import { idempotencyMiddleware } from "../../../middleware/idempotencyMiddleware";
import { checkAndIncrementQuota } from "../../apiKeyQuotaService";
import {
  acquirePostgresSemaphore,
  type PostgresSemaphoreHandle,
} from "../../postgresDelegatedWorkerSemaphore";
import { getRedisClient, closeRedis } from "../../redis";
import { sql } from "drizzle-orm";

const heldLeases = new Map<string, PostgresSemaphoreHandle>();

const app = express();
app.use(express.json());

function attachTestAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const body = req.body as {
    apiKeyId?: string;
    tenantId?: string;
    limit?: number;
  };
  (req as Request & { auth?: unknown }).auth = {
    mode: "api_key",
    apiKeyId: body.apiKeyId ?? "multiprocess-api-key",
    tenantId: body.tenantId ?? "multiprocess-tenant",
    quotaHourly: body.limit ?? 30,
    quotaDaily: req.header("x-spec245-daily") === "true" ? 100 : null,
  };
  next();
}

app.get("/ready", (_req, res) => res.status(200).json({ pid: process.pid }));

app.post("/quota", attachTestAuth, quotaMiddleware(), (_req, res) => {
  res.status(200).json({ pid: process.pid, execution: "accepted" });
});

app.post(
  "/idempotent",
  attachTestAuth,
  quotaMiddleware(),
  idempotencyMiddleware(),
  async (req, res) => {
    await new Promise(resolve => setTimeout(resolve, 80));
    res
      .status(201)
      .json({ pid: process.pid, marker: req.header("idempotency-key") });
  }
);

app.post("/quota-at", async (req, res) => {
  const body = req.body as {
    apiKeyId: string;
    tenantId: string;
    at: string;
    limit: number;
  };
  const result = await checkAndIncrementQuota(
    body.apiKeyId,
    body.tenantId,
    { quotaHourly: body.limit },
    new Date(body.at)
  );
  res.status(result.allowed ? 200 : 429).json(result);
});

app.post("/legacy-increment", async (req, res) => {
  const { key, count = 1 } = req.body as { key: string; count?: number };
  const value = await getRedisClient().incrby(key, count);
  res.status(200).json({ value });
});

app.post("/lease/acquire", async (req, res) => {
  const body = req.body as {
    ref: string;
    scopeKey: string;
    ttlSeconds: number;
    maxSlots: number;
  };
  const handle = await acquirePostgresSemaphore({
    scopeKey: body.scopeKey,
    tenantId: "tenant-g4-test",
    workerId: "worker-g4-test",
    workerJobId: "job-g4-test",
    actionClass: "mcp_write",
    maxSlots: body.maxSlots,
    ttlSeconds: body.ttlSeconds,
  });
  if (!handle) {
    res.status(429).json({ acquired: false, pid: process.pid });
    return;
  }
  heldLeases.set(body.ref, handle);
  res.status(200).json({
    acquired: true,
    leaseId: handle.leaseId,
    fencingToken: handle.fencingToken,
    pid: process.pid,
  });
});

app.post("/lease/renew", async (req, res) => {
  const handle = heldLeases.get(String(req.body.ref));
  res.status(200).json({ renewed: handle ? await handle.renew() : false });
});

app.post("/lease/current", async (req, res) => {
  const handle = heldLeases.get(String(req.body.ref));
  res.status(200).json({ current: handle ? await handle.isCurrent() : false });
});

app.post("/lease/commit", async (req, res) => {
  const handle = heldLeases.get(String(req.body.ref));
  if (!handle) {
    res.status(409).json({ committed: false });
    return;
  }
  try {
    await handle.commitIfCurrent(tx =>
      tx.execute(sql`
      INSERT INTO spec245_g4_fenced_test_commits ("leaseId", "fencingToken", "writerPid")
      VALUES (${handle.leaseId}, ${handle.fencingToken}, ${process.pid})
    `)
    );
    res
      .status(200)
      .json({ committed: true, fencingToken: handle.fencingToken });
  } catch {
    res.status(409).json({ committed: false });
  }
});

app.post("/lease/release", async (req, res) => {
  const ref = String(req.body.ref);
  const handle = heldLeases.get(ref);
  if (handle) {
    await handle.release();
    heldLeases.delete(ref);
  }
  res.status(200).json({ released: Boolean(handle) });
});

const server = createServer(app);
const port = Number(process.env.PORT ?? 0);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") process.exit(1);
  console.log(
    JSON.stringify({ ready: true, port: address.port, pid: process.pid })
  );
});

async function shutdown(): Promise<void> {
  server.close();
  await closeRedis();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
