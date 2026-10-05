import {
  resolveThemeTokens,
  type DefinedTheme,
  type ResolvedThemeMode,
} from "@astryxdesign/core/theme";

/**
 * Resolve Astryx color tokens for browsers that do not support light-dark().
 * Keep this limited to colors so the app's own typography scale is untouched.
 */
export function resolveAstryxColorTokens(
  theme: DefinedTheme,
  mode: ResolvedThemeMode
): Record<string, string> {
  const resolved = resolveThemeTokens(theme, { mode });

  return Object.fromEntries(
    Object.entries(resolved).filter(([name]) => name.startsWith("--color-"))
  );
}

/** Tenant domains own the root color variables; only the platform may shim them. */
export function resolveAstryxCompatibilityTokens(
  theme: DefinedTheme,
  mode: ResolvedThemeMode,
  enabled: boolean,
): Record<string, string> {
  return enabled ? resolveAstryxColorTokens(theme, mode) : {};
}

/** Apply fallback color tokens without clobbering a newer theme owner's values. */
export function applyAstryxCompatibilityTokens(
  targets: HTMLElement[],
  tokens: Record<string, string>,
): () => void {
  const previousValues = targets.map(target => ({
    target,
    values: new Map(
      Object.keys(tokens).map(name => [name, target.style.getPropertyValue(name)]),
    ),
  }));

  for (const target of targets) {
    for (const [name, value] of Object.entries(tokens)) {
      target.style.setProperty(name, value);
    }
  }

  return () => {
    for (const { target, values } of previousValues) {
      for (const [name, previousValue] of values) {
        if (target.style.getPropertyValue(name) !== tokens[name]) continue;
        if (previousValue) target.style.setProperty(name, previousValue);
        else target.style.removeProperty(name);
      }
    }
  };
}
