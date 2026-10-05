import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/** Scoped SmartAIHub public brand and page-frame tokens. */
export const publicHomeTheme = defineTheme({
  name: "smartaihub-public-home",
  extends: neutralTheme,
  tokens: {
    "--public-layout-wide": "82.5rem",
    "--color-accent": "var(--primary)",
    "--color-on-accent": "var(--primary-foreground)",
    "--color-text-accent": "var(--primary)",
    "--color-icon-accent": "var(--primary)",
  },
});
