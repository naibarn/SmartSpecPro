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
