import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DATABASE_NAME = "spec224_d385_test";
const RUNTIME_ROLE = "spec224_d385_runtime";
const PG_VERSION = "PostgreSQL 15.17";
const PG_IMAGE = "pgvector/pgvector:pg15";
const TASK_LABEL = "spec224-safe-postgres-admission";

export type Spec224DisposablePostgresTarget = {
  runId: string;
  port: number;
  identity: string;
  containerName: string;
  networkName: string;
  dataDirectory: string;
  proxyPid: number;
  proxyPath: string;
};

export function getSpec224DisposablePostgresTarget(): Spec224DisposablePostgresTarget {
  const runId = process.env.SPEC224_TEST_RUN_ID ?? "";
  const port = Number(process.env.SPEC224_TEST_PG_PORT);
  const containerName = process.env.SPEC224_TEST_PG_CONTAINER ?? "";
  const networkName = process.env.SPEC224_TEST_PG_NETWORK ?? "";
  const dataDirectory = process.env.SPEC224_TEST_PGDATA ?? "";
  const proxyPid = Number(process.env.SPEC224_TEST_PG_PROXY_PID);
  const proxyPath = `/tmp/codex-spec224-safe-postgres-${runId}/pg_proxy.py`;
  if (
    !/^[a-f0-9]{8}$/.test(runId) ||
    !Number.isInteger(port) ||
    port <= 55400 ||
    port > 55999 ||
    port === 55493 ||
    containerName !== `codex-spec224-safe-pg-${runId}` ||
    networkName !== `codex-spec224-safe-net-${runId}` ||
    dataDirectory !== `/tmp/codex-spec224-safe-postgres-${runId}/pgdata` ||
    !Number.isSafeInteger(proxyPid) ||
    proxyPid < 2
  ) {
    throw new Error("SPEC224_DISPOSABLE_POSTGRES_TARGET_INVALID");
  }
  const identity = `spec224-safe-${runId}|${DATABASE_NAME}|${RUNTIME_ROLE}|${PG_VERSION}`;
  if (process.env.SPEC224_TEST_DATABASE_IDENTITY !== identity) {
    throw new Error("SPEC224_DISPOSABLE_POSTGRES_IDENTITY_INVALID");
  }
  return {
    runId,
    port,
    identity,
    containerName,
    networkName,
    dataDirectory,
    proxyPid,
    proxyPath,
  };
}

export function assertSpec224DisposableDatabaseUrl(connectionString: string) {
  const target = getSpec224DisposablePostgresTarget();
  const parsed = new URL(connectionString);
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== String(target.port) ||
    parsed.pathname !== `/${DATABASE_NAME}` ||
    (parsed.password !== "" && parsed.password !== null) ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    decodeURIComponent(parsed.username) !== RUNTIME_ROLE
  ) {
    throw new Error("SPEC224_TEST_DATABASE_URL_FORBIDDEN");
  }
  return target;
}

export function assertSpec224OwnedPostgresContainer() {
  const target = getSpec224DisposablePostgresTarget();
  const [container] = JSON.parse(
    execFileSync("docker", ["inspect", target.containerName], {
      encoding: "utf8",
    })
  ) as Array<{
    Name: string;
    Config: { Image: string; Labels: Record<string, string> };
    State: { Running: boolean };
    HostConfig: { NetworkMode: string };
    Mounts: Array<{ Source: string; Destination: string; Type: string }>;
    NetworkSettings: {
      Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>;
    };
  }>;
  const [network] = JSON.parse(
    execFileSync("docker", ["network", "inspect", target.networkName], {
      encoding: "utf8",
    })
  ) as Array<{
    Internal: boolean;
    Labels: Record<string, string>;
    Containers: Record<string, { Name: string; IPv4Address: string }>;
  }>;
  const attachedContainer = Object.values(network.Containers).find(
    attached => attached.Name === target.containerName
  );
  let proxyCommand = "";
  try {
    proxyCommand = readFileSync(`/proc/${target.proxyPid}/cmdline`, "utf8");
  } catch {
    throw new Error("SPEC224_DISPOSABLE_POSTGRES_PROXY_NOT_RUNNING");
  }
  if (
    container.Name !== `/${target.containerName}` ||
    container.Config.Image !== PG_IMAGE ||
    container.Config.Labels?.["com.smartspecpro.workunit"] !== TASK_LABEL ||
    container.Config.Labels?.["com.smartspecpro.run-id"] !== target.runId ||
    container.State.Running !== true ||
    container.HostConfig.NetworkMode !== target.networkName ||
    !container.Mounts.some(
      mount =>
        mount.Type === "bind" &&
        mount.Source === target.dataDirectory &&
        mount.Destination === "/var/lib/postgresql/data"
    ) ||
    (container.NetworkSettings.Ports["5432/tcp"] ?? []).length !== 0 ||
    network.Internal !== true ||
    network.Labels?.["com.smartspecpro.workunit"] !== TASK_LABEL ||
    !attachedContainer ||
    !proxyCommand.includes(target.proxyPath) ||
    !proxyCommand.includes(String(target.port)) ||
    !proxyCommand.includes(attachedContainer.IPv4Address.split("/")[0])
  ) {
    throw new Error("SPEC224_DISPOSABLE_POSTGRES_CONTAINER_MISMATCH");
  }
  return target;
}
