import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  ASTRYX_PALETTES,
  DEFAULT_ASTRYX_PALETTE,
  getAstryxPalette,
  isAstryxPaletteSlug,
  type AstryxPaletteDefinition,
  type AstryxPaletteSlug,
} from "@/themes/catalog";

const STORAGE_KEY = "astryx-palette";

interface AstryxPaletteContextType {
  /** Active palette slug (e.g. "neutral", "butter"). */
  palette: AstryxPaletteSlug;
  /** The active palette's full definition (theme object, name, description). */
  activePalette: AstryxPaletteDefinition;
  /** Switch the active palette and persist the choice to localStorage. */
  setPalette: (slug: AstryxPaletteSlug) => void;
  /** All available palettes, for building a picker UI. */
  themes: AstryxPaletteDefinition[];
}

const AstryxPaletteContext = createContext<
  AstryxPaletteContextType | undefined
>(undefined);

function readStoredPalette(): AstryxPaletteSlug {
  if (typeof window === "undefined") {
    return DEFAULT_ASTRYX_PALETTE;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isAstryxPaletteSlug(stored) ? stored : DEFAULT_ASTRYX_PALETTE;
  } catch {
    // localStorage may be unavailable (private browsing, disabled storage).
    return DEFAULT_ASTRYX_PALETTE;
  }
}

interface AstryxPaletteProviderProps {
  children: React.ReactNode;
}

/**
 * Persists the user's chosen Astryx palette (color theme) independent of the
 * separate light/dark mode axis handled by `ThemeContext`. Palette selection
 * is v1 localStorage-only — syncing to a per-user DB setting is a follow-up.
 */
export function AstryxPaletteProvider({
  children,
}: AstryxPaletteProviderProps) {
  const [palette, setPaletteState] = useState<AstryxPaletteSlug>(
    readStoredPalette,
  );

  const setPalette = useCallback((slug: AstryxPaletteSlug) => {
    setPaletteState(slug);
    try {
      window.localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      // Ignore storage failures — palette still applies for this session.
    }
  }, []);

  const activePalette = useMemo(() => getAstryxPalette(palette), [palette]);

  const value = useMemo<AstryxPaletteContextType>(
    () => ({
      palette,
      activePalette,
      setPalette,
      themes: ASTRYX_PALETTES,
    }),
    [palette, activePalette, setPalette],
  );

  return (
    <AstryxPaletteContext.Provider value={value}>
      {children}
    </AstryxPaletteContext.Provider>
  );
}

export function useAstryxPalette() {
  const context = useContext(AstryxPaletteContext);
  if (!context) {
    throw new Error(
      "useAstryxPalette must be used within AstryxPaletteProvider",
    );
  }
  return context;
}
