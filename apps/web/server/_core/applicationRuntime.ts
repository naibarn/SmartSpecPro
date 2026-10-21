import { isSharedProductionDebug } from "./sharedProductionDebug";

export type ApplicationRuntimeProfile = Readonly<{
  mode: "standard" | "cloudflare-http";
  ownsBackgroundWork: boolean;
  serveSpaAssets: boolean;
}>;

/** Request containers own API work only. Schedules and canonical consumers
 * have a separate owner; static SPA content belongs to the edge ASSETS binding.
 * This selector does not provision a container or grant deployment authority. */
export function getApplicationRuntimeProfile(env: NodeJS.ProcessEnv = process.env): ApplicationRuntimeProfile {
  const mode = env.SMARTAIHUB_APPLICATION_RUNTIME ?? "standard";
  if (mode === "standard") return { mode, ownsBackgroundWork: !isSharedProductionDebug(env), serveSpaAssets: true };
  if (mode !== "cloudflare-http" || env.NODE_ENV !== "production" || env.CLOUDFLARE_CONTAINER_POLICY !== "on-demand") {
    throw new Error("APPLICATION_RUNTIME_CONFIGURATION_DENIED");
  }
  return { mode, ownsBackgroundWork: false, serveSpaAssets: false };
}

/** Private binding addresses are deployment-local, while saved Admin settings
 * remain shared with the original service during canary and rollback. */
export function applyApplicationRuntimeConnections<T extends {
  pythonBackendUrl: string; internalNodeUrl: string; smartspecInternalUrl: string; uploadPostApiBaseUrl: string;
}>(config: T, env: NodeJS.ProcessEnv = process.env): T {
  if (env.CLOUDFLARE_APPLICATION_BRIDGE === undefined) return config;
  if (env.CLOUDFLARE_APPLICATION_BRIDGE !== "private-http-v1" || getApplicationRuntimeProfile(env).mode !== "cloudflare-http") {
    throw new Error("APPLICATION_RUNTIME_CONNECTIONS_DENIED");
  }
  let localPythonUpload = false;
  try {
    const upload = new URL(config.uploadPostApiBaseUrl);
    localPythonUpload = upload.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(upload.hostname) &&
      upload.port === "8000" && upload.pathname === "/" && !upload.username && !upload.password && !upload.search && !upload.hash;
  } catch { /* Preserve unrelated external service configuration. */ }
  return { ...config, pythonBackendUrl: "http://python.application.internal",
    internalNodeUrl: "http://127.0.0.1:3000", smartspecInternalUrl: "http://127.0.0.1:3000",
    uploadPostApiBaseUrl: localPythonUpload || config.uploadPostApiBaseUrl === config.pythonBackendUrl
      ? "http://python.application.internal" : config.uploadPostApiBaseUrl };
}
