export const COMPANION_TOKEN_MESSAGE = "SMARTAIHUB_COMPANION_TOKEN";
export const LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE = "SMARTAIHUB_MARKETPLACE_EXTENSION_TOKEN";

export interface CompanionExtensionRuntime {
  lastError?: { message?: string };
  sendMessage(
    extensionId: string,
    message: Record<string, unknown>,
    callback: (response: any) => void,
  ): void;
}

export interface CompanionTokenPayload {
  accessToken: string;
  expiresAt: string;
  baseUrl: string;
  deviceId: string;
}

export interface CompanionTokenDeliveryResult {
  ok: boolean;
  error?: string;
  protocol: "canonical" | "legacy";
}

export function isMissingCompanionReceiverError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return /receiving end does not exist|message port closed before a response was received/i.test(message);
}

function sendCompanionTokenMessage(
  runtime: CompanionExtensionRuntime,
  extensionId: string,
  type: string,
  payload: CompanionTokenPayload,
): Promise<{ response: any; transportError: string }> {
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(extensionId, { type, ...payload }, (response: any) => {
        resolve({
          response,
          transportError: String(runtime.lastError?.message || ""),
        });
      });
    } catch (error) {
      resolve({
        response: undefined,
        transportError: error instanceof Error ? error.message : "extension_message_failed",
      });
    }
  });
}

function toDeliveryResult(
  attempt: { response: any; transportError: string },
  protocol: "canonical" | "legacy",
): CompanionTokenDeliveryResult {
  if (attempt.transportError) return { ok: false, error: attempt.transportError, protocol };
  if (attempt.response?.ok) return { ok: true, protocol };
  return {
    ok: false,
    error: String(attempt.response?.error || "ส่ง token เข้า extension ไม่สำเร็จ"),
    protocol,
  };
}

export async function deliverCompanionToken(
  runtime: CompanionExtensionRuntime,
  extensionId: string,
  payload: CompanionTokenPayload,
): Promise<CompanionTokenDeliveryResult> {
  const canonical = await sendCompanionTokenMessage(
    runtime,
    extensionId,
    COMPANION_TOKEN_MESSAGE,
    payload,
  );
  if (!isMissingCompanionReceiverError(canonical.transportError)) {
    return toDeliveryResult(canonical, "canonical");
  }

  const legacy = await sendCompanionTokenMessage(
    runtime,
    extensionId,
    LEGACY_MARKETPLACE_EXTENSION_TOKEN_MESSAGE,
    payload,
  );
  return toDeliveryResult(legacy, "legacy");
}
