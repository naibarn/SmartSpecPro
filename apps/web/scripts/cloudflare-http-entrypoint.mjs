import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DENIED = "APPLICATION_CONNECTOR_CONFIGURATION_DENIED";
const CONNECTOR_KEYS = ["DATABASE_ACCESS_CLIENT_ID", "DATABASE_ACCESS_CLIENT_SECRET"];
const INHERITED_CONNECTOR_KEYS = ["TUNNEL_SERVICE_TOKEN_ID", "TUNNEL_SERVICE_TOKEN_SECRET"];

/** Immutable deployment inputs only; this is neither admission nor a job runner. */
export function applicationConnectorConfiguration(env, now = Date.now()) {
  try {
    if (env.NODE_ENV !== "production" || env.SMARTAIHUB_APPLICATION_RUNTIME !== "cloudflare-http" || env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") throw Error();
    const hostname = env.DATABASE_CONNECTOR_HOSTNAME;
    if (!hostname || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname) || hostname.length > 253) throw Error();
    const expiresAt = Date.parse(env.CLOUDFLARE_APPLICATION_EXPIRES_AT ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 600_000) throw Error();
    if (env.DATABASE_SSL_MODE !== "verify-full" || !env.DATABASE_SSL_CA || CONNECTOR_KEYS.some(key => !env[key] || /[\x00-\x20\x7f]/.test(env[key]))) throw Error();
    const database = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(database.protocol) || database.hostname !== hostname || !database.username || !database.password || database.pathname.length < 2 || [...database.searchParams.keys()].some(key => /^ssl/i.test(key))) throw Error();
    database.hostname = "127.0.0.1";
    database.port = "15432";
    const applicationEnv = { ...env, DATABASE_URL: database.href, DATABASE_SSL_SERVER_NAME: hostname };
    for (const key of [...CONNECTOR_KEYS, ...INHERITED_CONNECTOR_KEYS]) delete applicationEnv[key];
    return {
      expiresAt, applicationEnv,
      connectorEnv: { PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin", TUNNEL_SERVICE_HOSTNAME: hostname, TUNNEL_SERVICE_URL: "127.0.0.1:15432",
        TUNNEL_SERVICE_TOKEN_ID: env.DATABASE_ACCESS_CLIENT_ID, TUNNEL_SERVICE_TOKEN_SECRET: env.DATABASE_ACCESS_CLIENT_SECRET },
    };
  } catch { throw Error(DENIED); }
}

async function terminate(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, "exit").catch(() => {});
  child.kill("SIGTERM");
  let timer;
  await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 5000); })]);
  clearTimeout(timer);
}

export async function serveApplication(env = process.env) {
  const configuration = applicationConnectorConfiguration(env);
  let connector, application, timer, timeoutSignal;
  const stopped = new AbortController();
  const stop = () => stopped.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const lifetime = new Promise(resolve => { timer = setTimeout(() => {
    application?.kill("SIGKILL");
    connector?.kill("SIGKILL");
    console.error("APPLICATION_CONNECTOR_DEADLINE_REACHED");
    resolve("deadline");
    // The image entrypoint is the VM's main process; never leave paid compute
    // alive because a database probe or child shutdown got stuck.
    process.exit(0);
  }, configuration.expiresAt - Date.now()); });
  try {
    // Secret values travel only in a minimal child environment, never argv or files.
    connector = spawn("/usr/local/bin/cloudflared", ["access", "tcp", "--log-level", "error"], { env: configuration.connectorEnv, stdio: ["ignore", "inherit", "inherit"] });
    const connectorExit = new Promise(resolve => { connector.once("exit", () => resolve("connector")); connector.once("error", () => resolve("connector")); });
    const { createApplicationDatabaseTls } = await import("../server/_core/applicationDatabaseTls.ts");
    const { default: postgres } = await import("postgres");
    // A listener alone does not qualify Access authentication or DB trust.
    // Health performs SELECT only and never initializes schema or app jobs.
    const client = postgres(configuration.applicationEnv.DATABASE_URL, { ssl: createApplicationDatabaseTls(configuration.applicationEnv.DATABASE_URL, configuration.applicationEnv), max: 1, connect_timeout: 3 });
    try {
      let ready = false;
      for (let attempt = 0; attempt < 5 && !stopped.signal.aborted; attempt++) {
        if (connector.exitCode !== null || connector.signalCode !== null) break;
        try { await client`SELECT 1`; ready = true; break; }
        catch { await new Promise(resolve => setTimeout(resolve, 200)); }
      }
      if (!ready || stopped.signal.aborted) throw Error("APPLICATION_CONNECTOR_DATABASE_UNAVAILABLE");
    } finally { await client.end({ timeout: 1 }); }
    application = spawn(process.execPath, ["--import=tsx", "server/_core/index.ts"], { env: configuration.applicationEnv, stdio: ["ignore", "inherit", "inherit"] });
    const applicationExit = new Promise(resolve => { application.once("exit", () => resolve("application")); application.once("error", () => resolve("application")); });
    const signal = new Promise(resolve => {
      timeoutSignal = () => resolve("signal");
      stopped.signal.addEventListener("abort", timeoutSignal, { once: true });
      if (stopped.signal.aborted) resolve("signal");
    });
    const reason = await Promise.race([connectorExit, applicationExit, lifetime, signal]);
    if (reason === "connector" || (reason === "application" && application.exitCode !== 0)) throw Error("APPLICATION_CONNECTOR_PROCESS_STOPPED");
  } finally {
    clearTimeout(timer);
    if (timeoutSignal) stopped.signal.removeEventListener("abort", timeoutSignal);
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    await terminate(application);
    await terminate(connector);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serveApplication().catch(error => {
    console.error([DENIED, "APPLICATION_CONNECTOR_DATABASE_UNAVAILABLE", "APPLICATION_CONNECTOR_PROCESS_STOPPED"].includes(error.message) ? error.message : "APPLICATION_CONNECTOR_START_FAILED");
    process.exitCode = 1;
  });
}
