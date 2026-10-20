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
