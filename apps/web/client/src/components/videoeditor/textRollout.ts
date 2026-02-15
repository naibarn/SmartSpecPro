const DISABLED_VALUES = new Set(['0', 'false', 'off', 'disabled', 'no']);

type RuntimeFlags = {
  textClipT1?: boolean;
};

type FeatureWindow = Window & {
  __SMARTSPEC_FEATURES__?: RuntimeFlags;
};

export function isTextClipRolloutEnabled(
  env: Record<string, string | undefined> | undefined = import.meta.env as unknown as Record<string, string | undefined>,
): boolean {
  if (typeof window !== 'undefined') {
    const runtimeFlag = (window as FeatureWindow).__SMARTSPEC_FEATURES__?.textClipT1;
    if (typeof runtimeFlag === 'boolean') {
      return runtimeFlag;
    }
  }

  const rawValue = env?.VITE_ENABLE_TEXT_CLIP_T1;
  if (typeof rawValue !== 'string') {
    return true;
  }

  return !DISABLED_VALUES.has(rawValue.trim().toLowerCase());
}
