import { getCachedPreferredInternalToken, getCachedPythonBackendUrl } from "./appRuntimeConfig";
import type { ProviderPollClient, ProviderPollObservation } from "./providerPollerService";

/**
 * Server-to-server provider observation bridge used while Python media
 * adapters still own the provider SDKs. It performs one poll only; the
 * durable PostgreSQL poll ledger controls when this method is called again.
 */
export function createPythonProviderPollClient(provider: string): ProviderPollClient {
  return {
    async inspect(input): Promise<ProviderPollObservation> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${getCachedPythonBackendUrl()}/api/v1/internal/provider/poll`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-proxy-token": getCachedPreferredInternalToken(),
          },
          body: JSON.stringify({
            provider,
            provider_job_id: input.providerJobId,
            operation_key: input.operationKey,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`PYTHON_PROVIDER_POLL_HTTP_${response.status}`);
        const body = await response.json() as Record<string, unknown>;
        const status = body.status;
        if (status === "pending") {
          return {
            status: "pending",
            ...(typeof body.providerStatus === "string" ? { providerStatus: body.providerStatus } : {}),
          };
        }
        if (status === "completed" && typeof body.resultRef === "string") {
          return { status: "completed", resultRef: body.resultRef };
        }
        if (status === "failed") {
          return {
            status: "failed",
            safeErrorCode: typeof body.safeErrorCode === "string" ? body.safeErrorCode : "PROVIDER_TASK_FAILED",
            ...(typeof body.message === "string" ? { message: body.message.slice(0, 500) } : {}),
          };
        }
        return {
          status: "unknown",
          reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : "provider_poll_invalid_response",
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
