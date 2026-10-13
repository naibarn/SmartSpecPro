import { lookup } from "node:dns/promises";
import {
  createServer as createNetServer,
  connect as connectNet,
  isIP,
} from "node:net";
import { createServer as createHttpServer, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ALLOWED_HOSTS = new Set(["smartaihub.app", "api.smartaihub.app"]);
const ALLOWED_PORT = 443;

type ProxyAudit = {
  allowed: string[];
  denied: string[];
};

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return false;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a === 255
    );
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0]!;
  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return (
    firstHextet >= 0x2000 &&
    firstHextet <= 0x3fff &&
    !normalized.startsWith("2001:db8:")
  );
}

function parseConnectTarget(
  authority: string
): { host: string; port: number } | null {
  const match = authority.match(/^([a-zA-Z0-9.-]+):([0-9]{1,5})$/);
  if (!match) return null;
  const host = match[1]!.toLowerCase().replace(/\.$/, "");
  const port = Number(match[2]);
  return { host, port };
}

export type MoliUatEgressProxy = {
  port: number;
  close: () => Promise<void>;
  evidence: () => ProxyAudit;
};

export async function createMoliUatEgressProxy(): Promise<MoliUatEgressProxy> {
  const audit: ProxyAudit = { allowed: [], denied: [] };
  const activeSockets = new Set<NodeJS.Socket>();
  const server: Server = createHttpServer((_request, response) => {
    response.writeHead(403, { "cache-control": "no-store" });
    response.end("UAT_EGRESS_PROXY_CONNECT_ONLY");
  });

  server.on("connection", socket => {
    activeSockets.add(socket);
    if (activeSockets.size > 12) {
      socket.destroy();
      return;
    }
    socket.once("close", () => activeSockets.delete(socket));
    socket.setTimeout(15_000, () => socket.destroy());
  });
  server.on("connect", (request, client, head) => {
    const target = parseConnectTarget(request.url ?? "");
    if (
      !target ||
      !ALLOWED_HOSTS.has(target.host) ||
      target.port !== ALLOWED_PORT
    ) {
      audit.denied.push(
        target ? `${target.host}:${target.port}` : "invalid-connect-target"
      );
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }

    void (async () => {
      try {
        const addresses = await lookup(target.host, {
          all: true,
          verbatim: true,
        });
        if (
          !addresses.length ||
          addresses.some(({ address }) => !isPublicAddress(address))
        ) {
          throw new Error("MOLI_UAT_GATEWAY_DNS_ADDRESS_REJECTED");
        }
        // Pin the validated DNS answer for this CONNECT to prevent a second
        // resolution from changing the destination after policy validation.
        const upstream = connectNet({
          host: addresses[0]!.address,
          port: ALLOWED_PORT,
        });
        upstream.once("error", () => {
          audit.denied.push(`${target.host}:${ALLOWED_PORT}:connect-failed`);
          client.destroy();
        });
        upstream.once("connect", () => {
          audit.allowed.push(`${target.host}:${ALLOWED_PORT}`);
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        client.once("close", () => upstream.destroy());
      } catch {
        audit.denied.push(`${target.host}:${ALLOWED_PORT}:dns-rejected`);
        client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("MOLI_UAT_PROXY_BIND_FAILED");

  return {
    port: address.port,
    close: async () => {
      for (const socket of activeSockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    },
    evidence: () => ({
      allowed: [...audit.allowed],
      denied: [...audit.denied],
    }),
  };
}

function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("MOLI_UAT_CDP_PORT_UNAVAILABLE"));
      const { port } = address;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

export type MoliUatProcess = {
  endpoint: string;
  unitName: string;
  stop: () => void;
};

export async function startMoliUatProcess(input: {
  rootfs: string;
  runId: string;
  testId: string;
  proxyPort: number;
}): Promise<MoliUatProcess> {
  if (!input.rootfs.startsWith("/tmp/smarthub-moli-uat-rootfs-")) {
    throw new Error("MOLI_UAT_ROOTFS_PATH_NOT_APPROVED");
  }
  const cdpPort = await allocateLoopbackPort();
  const uid = execFileSync("id", ["-u", "dev"], { encoding: "utf8" }).trim();
  const gid = execFileSync("id", ["-g", "dev"], { encoding: "utf8" }).trim();
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(gid))
    throw new Error("MOLI_UAT_SERVICE_IDENTITY_INVALID");
  const safeRun =
    input.runId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "run";
  const safeTest =
    input.testId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "test";
  const unitName = `smarthub-moli-uat-${safeRun}-${safeTest}-${cdpPort}.service`;
  const properties = [
    "User=dev",
    `RootDirectory=${input.rootfs}`,
    "IPAddressDeny=any",
    "IPAddressAllow=localhost",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "PrivateTmp=yes",
    "NoNewPrivileges=yes",
    "CapabilityBoundingSet=",
    "MemoryMax=1G",
    "CPUQuota=100%",
    "TasksMax=64",
    "RuntimeMaxSec=120s",
    "TimeoutStopSec=5s",
    "ProtectProc=invisible",
    "ProtectKernelTunables=yes",
    "ProtectKernelModules=yes",
    "ProtectControlGroups=yes",
    "PrivateDevices=yes",
    `TemporaryFileSystem=/profile:rw,nosuid,nodev,noexec,size=512m,mode=0700,uid=${uid},gid=${gid}`,
    `TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=64m,mode=0700,uid=${uid},gid=${gid}`,
    "UMask=0077",
  ];
  const args = [
    "-n",
    "systemd-run",
    "--system",
    "--no-block",
    "--collect",
    `--unit=${unitName}`,
    ...properties.flatMap(property => ["--property", property]),
    "--",
    "/usr/bin/moli",
    "serve",
    "--host",
    "127.0.0.1",
    "--port",
    String(cdpPort),
    "--timeout",
    "30",
    "--profile-dir",
    "/profile",
    "--http-proxy",
    `http://127.0.0.1:${input.proxyPort}`,
    "--block-private-networks",
    "--log-level",
    "error",
  ];
  execFileSync("sudo", args, { stdio: "ignore", timeout: 10_000 });

  const endpoint = `http://127.0.0.1:${cdpPort}`;
  const readyBy = Date.now() + 15_000;
  while (Date.now() < readyBy) {
    try {
      const response = await fetch(new URL("/json/version", endpoint), {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) {
        const version = (await response.json()) as {
          webSocketDebuggerUrl?: string;
        };
        const ws = version.webSocketDebuggerUrl
          ? new URL(version.webSocketDebuggerUrl)
          : null;
        if (ws?.hostname !== "127.0.0.1")
          throw new Error("MOLI_UAT_CDP_BINDING_REJECTED");
        return {
          endpoint,
          unitName,
          stop: () =>
            execFileSync("sudo", ["-n", "systemctl", "stop", unitName], {
              stdio: "ignore",
              timeout: 10_000,
            }),
        };
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "MOLI_UAT_CDP_BINDING_REJECTED"
      )
        throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  try {
    execFileSync("sudo", ["-n", "systemctl", "stop", unitName], {
      stdio: "ignore",
      timeout: 10_000,
    });
  } catch {
    /* preserve the startup failure; the run-scoped global teardown retries cleanup */
  }
  throw new Error("MOLI_UAT_PROCESS_START_TIMEOUT");
}

export function isMoliUatPublicAddress(address: string): boolean {
  return isPublicAddress(address);
}

export function assertMoliUatRuntimeIsolation(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("MOLI_UAT_PRODUCTION_ENVIRONMENT_FORBIDDEN");
  }
}

export async function verifyMoliUatSystemdIsolation(): Promise<void> {
  const localServer = createHttpServer((_request, response) => {
    response.writeHead(200, { "cache-control": "no-store" });
    response.end("loopback-ok");
  });
  await new Promise<void>((resolve, reject) => {
    localServer.once("error", reject);
    localServer.listen(0, "127.0.0.1", () => resolve());
  });
  const localAddress = localServer.address();
  if (!localAddress || typeof localAddress === "string")
    throw new Error("MOLI_UAT_ISOLATION_PROBE_BIND_FAILED");

  const unitName = `smarthub-moli-uat-policy-probe-${process.pid}.service`;
  const runProbe = async (url: string, resolveHost?: string) => {
    const curlArgs = [
      "--silent",
      "--show-error",
      "--output",
      "/dev/null",
      "--max-time",
      "3",
    ];
    if (resolveHost) curlArgs.push("--resolve", resolveHost);
    curlArgs.push(url);
    return execFileAsync(
      "sudo",
      [
        "-n",
        "systemd-run",
        "--system",
        "--wait",
        "--pipe",
        "--collect",
        `--unit=${unitName}`,
        "--property",
        "User=dev",
        "--property",
        "IPAddressDeny=any",
        "--property",
        "IPAddressAllow=localhost",
        "--",
        "/usr/bin/curl",
        ...curlArgs,
      ],
      { timeout: 7_000, maxBuffer: 1024 }
    );
  };

  try {
    await runProbe(`http://127.0.0.1:${localAddress.port}/`);
  } catch (error) {
    const detail =
      error && typeof error === "object" && "status" in error
        ? `exit-${String((error as { status?: unknown }).status)}`
        : "systemd-probe-failed";
    throw new Error(`MOLI_UAT_SYSTEMD_LOOPBACK_ALLOW_FAILED:${detail}`);
  } finally {
    await new Promise<void>(resolve => localServer.close(() => resolve()));
  }

  // Resolve directly to a fixed public address so a missing systemd network
  // filter cannot appear to pass merely because DNS is unavailable.
  let directEgressReached = false;
  try {
    await runProbe(
      "https://smartaihub.app/health",
      "smartaihub.app:443:1.1.1.1"
    );
    directEgressReached = true;
  } catch {
    directEgressReached = false;
  }
  if (directEgressReached)
    throw new Error("MOLI_UAT_SYSTEMD_DIRECT_EGRESS_NOT_BLOCKED");
}
