import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Manus runtime removal", () => {
  it("does not register or declare the retired Manus runtime", () => {
    const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    const indexHtml = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
    const indexCss = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    const webPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const rootPackage = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const lockfiles = [
      readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
      readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"),
      readFileSync(new URL("../../../pnpm-lock.yaml", import.meta.url), "utf8"),
      readFileSync(new URL("../../../package-lock.json", import.meta.url), "utf8"),
    ];

    expect(viteConfig).not.toContain("vite-plugin-manus-runtime");
    expect(indexHtml).not.toContain("manus-previewer");
    expect(indexCss).not.toContain("PreviewerMode");
    expect(webPackage.devDependencies?.["vite-plugin-manus-runtime"]).toBeUndefined();
    expect(rootPackage.devDependencies?.["vite-plugin-manus-runtime"]).toBeUndefined();
    expect(lockfiles.every((lockfile) => !lockfile.includes("vite-plugin-manus-runtime"))).toBe(true);
  });
});
