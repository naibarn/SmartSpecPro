export interface TransparentBackgroundCapability {
  inputKey: string;
  enabledValue: string;
  disabledValue: string;
  outputFormat: string;
}

type TransparentBackgroundRequest = {
  capability: TransparentBackgroundCapability | null;
  requested: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Resolve native alpha support from a model's provider-owned config.
 * Unknown/absent capability is intentionally treated as unsupported.
 */
export function resolveTransparentBackgroundCapability(
  configJson: unknown,
): TransparentBackgroundCapability | null {
  const config = asRecord(configJson);
  if (config?.supportsTransparentBackground !== true) {
    return null;
  }

  const details = asRecord(config.transparentBackground);
  return {
    inputKey: typeof details?.inputKey === "string" && details.inputKey.trim()
      ? details.inputKey.trim()
      : "background",
    enabledValue: typeof details?.enabledValue === "string" && details.enabledValue.trim()
      ? details.enabledValue.trim()
      : "transparent",
    disabledValue: typeof details?.disabledValue === "string" && details.disabledValue.trim()
      ? details.disabledValue.trim()
      : "auto",
    outputFormat: typeof details?.outputFormat === "string" && details.outputFormat.trim()
      ? details.outputFormat.trim()
      : "png",
  };
}

/**
 * Resolve and classify a request before it reaches a provider. The generic
 * `background=transparent` alias is recognized so unsupported models fail
 * closed even when the request was not produced by the Media Studio UI.
 */
export function resolveTransparentBackgroundRequest(
  configJson: unknown,
  extraParams: Record<string, unknown> | null | undefined,
): TransparentBackgroundRequest {
  const capability = resolveTransparentBackgroundCapability(configJson);
  const genericRequested = (
    extraParams?.background === "transparent"
    || extraParams?.transparent_background === true
    || extraParams?.transparentBackground === true
  );
  const requested = Boolean(
    genericRequested
    || (capability && extraParams?.[capability.inputKey] === capability.enabledValue),
  );

  return { capability, requested };
}

