import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/** Keep public Astryx controls aligned with the current tenant's brand token. */
export const publicHomeTheme = defineTheme({
  name: "smartaihub-public-home",
  extends: neutralTheme,
  tokens: {
    "--color-accent": "var(--primary)",
    "--color-on-accent": "var(--primary-foreground)",
    "--color-text-accent": "var(--primary)",
    "--color-icon-accent": "var(--primary)",
  },
});
