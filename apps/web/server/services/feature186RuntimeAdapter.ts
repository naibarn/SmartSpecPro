import {
  assertFeature186RuntimeConfigured,
  isCloudflareHardCutoverEnabled,
} from "./cloudflareRuntimeTarget";
import {
  CloudflareQueueHttpJobTransportAdapter,
  PostgresPullJobTransportAdapter,
  type JobTransportAdapter,
} from "./jobTransportAdapters";

/**
 * Select the transport for the canonical envelope in one place. Both the
 * web outbox publisher and the reconciler use this factory so local execution
 * and the later Cloudflare migration cannot drift into different contracts.
 */
export function createFeature186RuntimeAdapter(): JobTransportAdapter {
  if (!isCloudflareHardCutoverEnabled()) {
    return new PostgresPullJobTransportAdapter();
  }

  assertFeature186RuntimeConfigured();
  const runtimeUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim();
  if (!runtimeUrl) {
    throw new Error("CLOUDFLARE_RUNTIME_CONFIG_INCOMPLETE");
  }
  return new CloudflareQueueHttpJobTransportAdapter(
    runtimeUrl,
    process.env.CLOUDFLARE_RUNTIME_TOKEN ?? ""
  );
}
