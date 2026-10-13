import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { seedUatIdentities } from "../../../server/services/uatSessionBroker";

function assertTunnelRoute(configText: string, hostname: string, target: string): void {
  const escapedHost = hostname.replaceAll(".", "\\.");
  const escapedTarget = target.replaceAll(".", "\\.");
  const route = new RegExp(
    `-\\s*hostname:\\s*${escapedHost}\\s*\\n\\s*service:\\s*${escapedTarget}(?:\\s|$)`,
  );
  if (!route.test(configText)) {
    throw new Error(`UAT_TUNNEL_ROUTE_NOT_CONFIRMED:${hostname}`);
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.SMARTSPEC_BROWSER_UAT !== "1") return;

  const outputDir = path.resolve(
    config.outputDir ?? config.projects[0]?.outputDir ?? "test-results/smarthub-uat",
  );
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700);

  const tunnelConfigPath = process.env.CLOUDFLARED_CONFIG || "/etc/cloudflared/config.yml";
  const tunnelConfig = await readFile(tunnelConfigPath, "utf8");
  assertTunnelRoute(tunnelConfig, "smartaihub.app", "http://localhost:3000");
  assertTunnelRoute(tunnelConfig, "api.smartaihub.app", "http://localhost:8000");

  const backendEnvPath = process.env.SMARTSPEC_UAT_PYTHON_ENV_FILE ||
    "/home/dev/projects/SmartSpecPro/python-backend/.env";
  const backendEnv = await readFile(backendEnvPath, "utf8");
  const backendSettings = new Map<string, string>();
  for (const line of backendEnv.split(/\r?\n/)) {
    const match = line.match(/^\s*(SMARTSPEC_USE_WEB_GATEWAY|SMARTSPEC_WEB_GATEWAY_URL)=(.*)$/);
    if (match) backendSettings.set(match[1]!, match[2]!.trim().replace(/^['"]|['"]$/g, ""));
  }
  let webGatewayUrl: URL;
  try {
    webGatewayUrl = new URL(backendSettings.get("SMARTSPEC_WEB_GATEWAY_URL") ?? "");
  } catch {
    throw new Error("UAT_SMARTAIHUB_GATEWAY_NOT_CONFIGURED");
  }
  if (!new Set(["true", "1", "yes"]).has((backendSettings.get("SMARTSPEC_USE_WEB_GATEWAY") ?? "").toLowerCase()) ||
      webGatewayUrl.hostname !== "smartaihub.app" || webGatewayUrl.protocol !== "https:") {
    throw new Error("UAT_SMARTAIHUB_GATEWAY_NOT_CONFIGURED");
  }

  // Public DNS is intentionally untouched. Cloudflare TLS routes the required
  // hostname through the explicitly verified development tunnel.
  const [webResponse, apiResponse] = await Promise.all([
    fetch("https://smartaihub.app/health", { signal: AbortSignal.timeout(10_000) }),
    fetch("https://api.smartaihub.app/health", { signal: AbortSignal.timeout(10_000) }),
  ]);
  if (!webResponse.ok || !apiResponse.ok) {
    throw new Error(`UAT_TUNNEL_HEALTH_FAILED:web=${webResponse.status}:api=${apiResponse.status}`);
  }

  const webHealth = await webResponse.json() as { service?: string };
  const apiHealth = await apiResponse.json() as { status?: string; version?: string };
  if (webHealth.service !== "smartaihub-web" || apiHealth.status !== "healthy") {
    throw new Error("UAT_TUNNEL_HEALTH_TARGET_MISMATCH");
  }

  await seedUatIdentities();
  const evidence = {
    route: {
      browserOrigin: "https://smartaihub.app",
      webTunnelTarget: "http://localhost:3000",
      gatewayOrigin: "https://api.smartaihub.app",
      gatewayTunnelTarget: "http://localhost:8000",
      providerGatewayOrigin: webGatewayUrl.origin,
      publicDnsModified: false,
      tlsVerification: "verified by Node HTTPS client; certificate errors are not ignored",
    },
    health: {
      webService: webHealth.service,
      gatewayStatus: apiHealth.status,
      gatewayVersion: apiHealth.version,
      webRequestId: webResponse.headers.get("x-request-id"),
      gatewayRequestId: apiResponse.headers.get("x-request-id"),
      cfRay: apiResponse.headers.get("cf-ray"),
    },
  };
  await writeFile(path.join(outputDir, "route-evidence.json"), JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
}
