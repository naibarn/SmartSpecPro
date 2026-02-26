import type { SlideStylePreset } from "./aiTypes";
import { SlideStylePresetSchema, AI_STYLE_PRESET_IDS } from "./aiTypes";

const darkProfessional: SlideStylePreset = {
  id: "dark-professional",
  name: "Dark Professional",
  colors: {
    background: "#1a1a2e",
    backgroundAlt: "#16213e",
    primary: "#e94560",
    secondary: "#0f3460",
    text: "#ffffff",
    textMuted: "#a0a0b0",
    cardBg: ["#16213e", "#1a1a3e", "#0f2460"],
    overlay: "rgba(0,0,0,0.55)",
  },
  typography: {
    titleFontFamily: "Inter",
    bodyFontFamily: "Sarabun",
    titleFontWeight: 700,
    bodyFontWeight: 400,
  },
  header: {
    enabled: true,
    height: 60,
    backgroundColor: "#0f3460",
    showDeckTitle: true,
    logoPosition: "left",
    titleFontSize: 18,
    titleColor: "#ffffff",
    borderBottom: "2px solid #e94560",
  },
  footer: {
    enabled: true,
    height: 40,
    backgroundColor: "#0f3460",
    showPageNumber: true,
    showCustomText: false,
    fontSize: 14,
    textColor: "#a0a0b0",
    borderTop: "1px solid #e94560",
  },
};

const lightMinimalist: SlideStylePreset = {
  id: "light-minimalist",
  name: "Light Minimalist",
  colors: {
    background: "#ffffff",
    backgroundAlt: "#f5f5f5",
    primary: "#1a1a1a",
    secondary: "#666666",
    text: "#1a1a1a",
    textMuted: "#999999",
    cardBg: ["#f5f5f5", "#eeeeee", "#e8e8e8"],
    overlay: "rgba(255,255,255,0.7)",
  },
  typography: {
    titleFontFamily: "Inter",
    bodyFontFamily: "Inter",
    titleFontWeight: 600,
    bodyFontWeight: 400,
  },
  footer: {
    enabled: true,
    height: 30,
    backgroundColor: "transparent",
    showPageNumber: true,
    showCustomText: false,
    fontSize: 12,
    textColor: "#999999",
  },
};

const corporateBlue: SlideStylePreset = {
  id: "corporate-blue",
  name: "Corporate Blue",
  colors: {
    background: "#f0f4f8",
    backgroundAlt: "#d9e2ec",
    primary: "#102a43",
    secondary: "#334e68",
    text: "#102a43",
    textMuted: "#627d98",
    cardBg: ["#d9e2ec", "#bcccdc", "#9fb3c8"],
    overlay: "rgba(16,42,67,0.6)",
  },
  typography: {
    titleFontFamily: "Inter",
    bodyFontFamily: "Inter",
    titleFontWeight: 700,
    bodyFontWeight: 400,
  },
  header: {
    enabled: true,
    height: 60,
    backgroundColor: "#102a43",
    showDeckTitle: true,
    logoPosition: "left",
    titleFontSize: 18,
    titleColor: "#ffffff",
    borderBottom: "3px solid #334e68",
  },
  footer: {
    enabled: true,
    height: 40,
    backgroundColor: "#102a43",
    showPageNumber: true,
    showCustomText: true,
    customText: "Confidential",
    fontSize: 12,
    textColor: "#9fb3c8",
    borderTop: "1px solid #334e68",
  },
};

const natureGreen: SlideStylePreset = {
  id: "nature-green",
  name: "Nature Green",
  colors: {
    background: "#f0f7f0",
    backgroundAlt: "#d4edda",
    primary: "#1b4332",
    secondary: "#2d6a4f",
    text: "#1b4332",
    textMuted: "#52796f",
    cardBg: ["#d4edda", "#b7e4c7", "#95d5b2"],
    overlay: "rgba(27,67,50,0.55)",
  },
  typography: {
    titleFontFamily: "Inter",
    bodyFontFamily: "Inter",
    titleFontWeight: 700,
    bodyFontWeight: 400,
  },
  header: {
    enabled: true,
    height: 56,
    backgroundColor: "#1b4332",
    showDeckTitle: true,
    logoPosition: "left",
    titleFontSize: 18,
    titleColor: "#ffffff",
    borderBottom: "2px solid #2d6a4f",
  },
  footer: {
    enabled: true,
    height: 36,
    backgroundColor: "#2d6a4f",
    showPageNumber: true,
    showCustomText: false,
    fontSize: 12,
    textColor: "#d4edda",
    borderTop: "1px solid #52796f",
  },
};

const warmSunset: SlideStylePreset = {
  id: "warm-sunset",
  name: "Warm Sunset",
  colors: {
    background: "#fff8f0",
    backgroundAlt: "#ffecd2",
    primary: "#d63031",
    secondary: "#e17055",
    text: "#2d3436",
    textMuted: "#636e72",
    cardBg: ["#ffecd2", "#fab1a0", "#fdcb6e"],
    overlay: "rgba(45,52,54,0.5)",
  },
  typography: {
    titleFontFamily: "Inter",
    bodyFontFamily: "Inter",
    titleFontWeight: 700,
    bodyFontWeight: 400,
  },
  footer: {
    enabled: true,
    height: 32,
    backgroundColor: "transparent",
    showPageNumber: true,
    showCustomText: false,
    fontSize: 12,
    textColor: "#d63031",
  },
};

/** Record keyed by preset ID for fast lookup */
export const PRESET_MAP: Record<
  (typeof AI_STYLE_PRESET_IDS)[number],
  SlideStylePreset
> = {
  "dark-professional": darkProfessional,
  "light-minimalist": lightMinimalist,
  "corporate-blue": corporateBlue,
  "nature-green": natureGreen,
  "warm-sunset": warmSunset,
};

/** Array form for UI listing */
export const BUILT_IN_PRESETS: readonly SlideStylePreset[] =
  Object.values(PRESET_MAP);

/** Retrieve a preset by ID, returns undefined if not found */
export function getBuiltInPreset(id: string): SlideStylePreset | undefined {
  return PRESET_MAP[id as (typeof AI_STYLE_PRESET_IDS)[number]];
}

// Development-time validation — ensures no typos in preset definitions
if (process.env.NODE_ENV !== "production") {
  for (const preset of BUILT_IN_PRESETS) {
    const result = SlideStylePresetSchema.safeParse(preset);
    if (!result.success) {
      throw new Error(
        `Built-in preset '${preset.id}' failed schema validation: ${result.error.message}`,
      );
    }
  }
}
