import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { isIP } from "node:net";
import { getApplicationRuntimeProfile } from "./applicationRuntime";

/** Container database connections retain end-to-end PostgreSQL TLS even when
 * the TCP endpoint is an Access connector. Credentials stay in runtime secrets. */
export function createApplicationDatabaseTls(url: string, env: NodeJS.ProcessEnv = process.env): ConnectionOptions | undefined {
  const required = getApplicationRuntimeProfile(env).mode === "cloudflare-http";
  if (!required && env.DATABASE_SSL_MODE === undefined) return undefined;
  try {
    if (env.DATABASE_SSL_MODE !== "verify-full" || !env.DATABASE_SSL_CA) throw new Error();
    const address = new URL(url);
    if (!["postgres:", "postgresql:"].includes(address.protocol)) throw new Error();
    // Do not allow URL options to weaken or ambiguously replace the trust policy.
    if ([...address.searchParams.keys()].some(key => /^ssl/i.test(key))) throw new Error();
    const host = env.DATABASE_SSL_SERVER_NAME ?? address.hostname.replace(/^\[|\]$/g, "");
    if (!host || /[\s\x00-\x1f/]/.test(host)) throw new Error();
    const ca = new X509Certificate(env.DATABASE_SSL_CA);
    if (!ca.ca) throw new Error();
    return {
      ca: env.DATABASE_SSL_CA,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(isIP(host) ? {} : { servername: host }),
      checkServerIdentity: (_name, certificate) => checkServerIdentity(host, certificate),
    };
  } catch {
    throw new Error("APPLICATION_DATABASE_TLS_REQUIRED");
  }
}
