import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/** Scoped SmartAIHub public brand and page-frame tokens. */
export const publicHomeTheme = defineTheme({
  name: "smartaihub-public-home",
  extends: neutralTheme,
  tokens: {
    "--public-layout-wide": "88rem",
    "--color-accent": "#006874",
    "--color-accent-muted": "#e5f5f6",
    "--color-on-accent": "#ffffff",
    "--color-text-accent": "#006874",
    "--color-icon-accent": "#006874",
    "--color-background-muted": "#f2f8f8",
    "--color-text-secondary": "#52666b",
  },
});
