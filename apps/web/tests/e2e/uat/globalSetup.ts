import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, access } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { FullConfig } from "@playwright/test";
import {
  assertUatBrokerEnvironment,
  seedUatIdentities,
} from "../../../server/services/uatSessionBroker";
import {
  assertMoliUatRuntimeIsolation,
  verifyMoliUatSystemdIsolation,
} from "./moliUatRuntime";

const MOLI_VERSION = "1.1.15";
const MOLI_ARCHIVE_URL = `https://github.com/lexmount/moli/releases/download/v${MOLI_VERSION}/moli-x86_64-unknown-linux-gnu.tar.gz`;
const MOLI_ARCHIVE_SHA256 =
  "f7c9455451bffd4d3a6353431b3596c1d18ad4d9fe6725d8d4033f6fff5fa59d";
const MOLI_BINARY_SHA256 =
  "f927b72192905c092ec95c8f528e35087224f3fe8750f72fb2147efa676eab8d";

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function prepareMoliRootfs(
  rootfs: string
): Promise<{ version: string; rootfsDigest: string }> {
  assertMoliUatRuntimeIsolation();
  const cacheDir = "/tmp/smarthub-moli-uat-runtime-v1.1.15";
  const archivePath = path.join(cacheDir, "moli.tar.gz");
  const binaryPath =
    process.env.MOLI_BINARY_PATH || path.join(cacheDir, "moli");
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });

  if (process.env.MOLI_BINARY_PATH) {
    if ((await sha256(binaryPath)) !== MOLI_BINARY_SHA256)
      throw new Error("MOLI_UAT_BINARY_DIGEST_MISMATCH");
  } else {
    let cachedArchiveValid = false;
    try {
      cachedArchiveValid = (await sha256(archivePath)) === MOLI_ARCHIVE_SHA256;
    } catch {
      /* download pinned release */
    }
    if (!cachedArchiveValid) {
      const response = await fetch(MOLI_ARCHIVE_URL, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`MOLI_UAT_DOWNLOAD_FAILED:${response.status}`);
      const archive = Buffer.from(await response.arrayBuffer());
      if (
        createHash("sha256").update(archive).digest("hex") !==
        MOLI_ARCHIVE_SHA256
      ) {
        throw new Error("MOLI_UAT_ARCHIVE_DIGEST_MISMATCH");
      }
      await writeFile(archivePath, archive, { mode: 0o600 });
    }
    const extracted = path.join(
      cacheDir,
      "moli-v1.1.15-x86_64-unknown-linux-gnu",
      "moli"
    );
    try {
      await access(extracted);
    } catch {
      execFileSync(
        "tar",
        [
          "-xzf",
          archivePath,
          "-C",
          cacheDir,
          "moli-v1.1.15-x86_64-unknown-linux-gnu/moli",
        ],
        { stdio: "ignore" }
      );
    }
    execFileSync("install", ["-m", "0555", extracted, binaryPath], {
      stdio: "ignore",
    });
  }

  if ((await sha256(binaryPath)) !== MOLI_BINARY_SHA256)
    throw new Error("MOLI_UAT_BINARY_DIGEST_MISMATCH");
  const version = execFileSync(binaryPath, ["--version"], {
    encoding: "utf8",
  }).trim();
  if (version !== `moli ${MOLI_VERSION}`)
    throw new Error("MOLI_UAT_VERSION_MISMATCH");
  if (!rootfs.startsWith("/tmp/smarthub-moli-uat-rootfs-"))
    throw new Error("MOLI_UAT_ROOTFS_PATH_NOT_APPROVED");
  const builder = path.resolve(
    "../../scripts/spec208/build-moli-acceptance-rootfs.sh"
  );
  execFileSync("bash", [builder, binaryPath, process.execPath, rootfs], {
    stdio: "ignore",
    timeout: 60_000,
  });
  const certDir = path.join(rootfs, "etc/ssl/certs");
  await chmod(path.join(rootfs, "etc"), 0o755);
  await mkdir(certDir, { recursive: true, mode: 0o755 });
  execFileSync("cp", ["-a", "/etc/ssl/certs/.", certDir], { stdio: "ignore" });
  await chmod(certDir, 0o555);
  await chmod(path.join(rootfs, "etc"), 0o555);
  const provenancePath = `${rootfs}.provenance.json`;
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
    rootfsDigest?: string;
  };
  if (!provenance.rootfsDigest?.startsWith("sha256:"))
    throw new Error("MOLI_UAT_ROOTFS_DIGEST_MISSING");
  const rootfsDigest = execFileSync(
    "bash",
    [
      "-lc",
      "tar --sort=name --mtime='UTC 1970-01-01' --numeric-owner --format=gnu -cf - -C \"$1\" . | sha256sum",
      "moli-rootfs-digest",
      rootfs,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1024,
    }
  )
    .trim()
    .split(/\s+/)[0];
  if (!rootfsDigest || !/^[a-f0-9]{64}$/.test(rootfsDigest))
    throw new Error("MOLI_UAT_ROOTFS_DIGEST_INVALID");
  provenance.rootfsDigest = `sha256:${rootfsDigest}`;
  await chmod(provenancePath, 0o644);
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2), {
    mode: 0o444,
  });
  await chmod(provenancePath, 0o444);
  return { version, rootfsDigest: provenance.rootfsDigest };
}

function assertLoopbackServiceUrl(
  value: string | undefined,
  service: "web" | "python"
): URL {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`UAT_${service.toUpperCase()}_LOCAL_URL_REQUIRED`);
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    url.protocol !== "http:" ||
    !localHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (service === "web" && url.port === "3000") ||
    (service === "python" && url.port === "8000")
  ) {
    throw new Error(`UAT_${service.toUpperCase()}_LOCAL_URL_REQUIRED`);
  }
  return url;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.SMARTSPEC_BROWSER_UAT !== "1") return;
  if (process.env.SMARTSPEC_UAT_BROWSER === "moli") {
    assertMoliUatRuntimeIsolation();
  }

  const outputDir = path.resolve(
    config.outputDir ??
      config.projects[0]?.outputDir ??
      "test-results/smarthub-uat"
  );
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);

  if (
    process.env.NODE_ENV !== "development" ||
    process.env.SMARTSPEC_ENVIRONMENT !== "development" ||
    process.env.SMARTSPEC_DEV_DATABASE_MODE !== "development"
  ) {
    throw new Error("UAT_DEVELOPMENT_ENVIRONMENT_REQUIRED");
  }
  assertUatBrokerEnvironment({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.SMARTSPEC_UAT_SESSION_BROKER,
    smartSpecEnvironment: process.env.SMARTSPEC_ENVIRONMENT,
    databaseMode: process.env.SMARTSPEC_DEV_DATABASE_MODE,
    databaseUrl: process.env.DATABASE_URL,
  });
  const webOrigin = assertLoopbackServiceUrl(
    process.env.SMARTSPEC_UAT_BASE_URL,
    "web"
  );
  const pythonOrigin = assertLoopbackServiceUrl(
    process.env.PYTHON_BACKEND_URL,
    "python"
  );

  // UAT uses dedicated local development services directly. It must never
  // traverse the public SmartAIHub hostname or the production service ports.
  const [webResponse, apiResponse] = await Promise.all([
    fetch(new URL("/health", webOrigin), {
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(new URL("/health", pythonOrigin), {
      signal: AbortSignal.timeout(10_000),
    }),
  ]);
  if (!webResponse.ok || !apiResponse.ok) {
    throw new Error(
      `UAT_LOCAL_HEALTH_FAILED:web=${webResponse.status}:python=${apiResponse.status}`
    );
  }

  const webHealth = (await webResponse.json()) as { service?: string };
  const apiHealth = (await apiResponse.json()) as {
    status?: string;
    version?: string;
  };
  if (
    webHealth.service !== "smartaihub-web" ||
    apiHealth.status !== "healthy"
  ) {
    throw new Error("UAT_TUNNEL_HEALTH_TARGET_MISMATCH");
  }

  const moliRuntime =
    process.env.SMARTSPEC_UAT_BROWSER === "moli"
      ? await (async () => {
          await verifyMoliUatSystemdIsolation();
          return await prepareMoliRootfs(
            process.env.SMARTSPEC_MOLI_UAT_ROOTFS!
          );
        })()
      : null;
  await seedUatIdentities();
  const evidence = {
    route: {
      browserOrigin: webOrigin.origin,
      webDevelopmentTarget: webOrigin.origin,
      pythonDevelopmentTarget: pythonOrigin.origin,
      networkBoundary: "loopback-only; public SmartAIHub origins are not used",
    },
    health: {
      webService: webHealth.service,
      pythonStatus: apiHealth.status,
      pythonVersion: apiHealth.version,
      webRequestId: webResponse.headers.get("x-request-id"),
      pythonRequestId: apiResponse.headers.get("x-request-id"),
    },
    browser: moliRuntime
      ? {
          engine: "moli",
          version: moliRuntime.version,
          rootfsDigest: moliRuntime.rootfsDigest,
          egress:
            "systemd IPAddressDeny=any; only loopback proxy allowed; proxy permits smartaihub.app:443 and api.smartaihub.app:443",
          systemdNetworkIsolationVerified: true,
        }
      : { engine: "chromium" },
  };
  await writeFile(
    path.join(outputDir, "route-evidence.json"),
    JSON.stringify(evidence, null, 2),
    {
      mode: 0o600,
    }
  );
}
