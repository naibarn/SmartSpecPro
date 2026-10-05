import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VALIDATION_LIMITS,
  DIAGNOSTIC_CODES,
  STAGE_STATUSES,
  VALIDATION_STAGES,
  VALIDATION_STATUSES,
} from "../src/index";

const packageRoot = new URL("../", import.meta.url);

describe("SPAAS package contract", () => {
  it("declares the workspace identity and ESM public entrypoint", async () => {
    const pkg = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8"));
    expect(pkg.name).toBe("@smartspec/spaas-standard");
    expect(pkg.type).toBe("module");
    expect(pkg.exports["."].import).toBe("./src/index.ts");
    expect(pkg.scripts.test).toContain("vitest run");
  });

  it("exports a fixed ordered set of all eight validation stages", () => {
    expect(VALIDATION_STAGES).toEqual(["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
    expect(STAGE_STATUSES).toEqual(["passed", "failed", "not_evaluated"]);
    expect(VALIDATION_STATUSES).toEqual(["valid", "invalid", "needs_context"]);
    expect(DIAGNOSTIC_CODES).toContain("SECRET_EMBEDDED");
    expect(DIAGNOSTIC_CODES).toContain("DEPENDENCY_CYCLE");
  });

  it("provides finite positive inclusive resource bounds", () => {
    for (const limit of Object.values(DEFAULT_VALIDATION_LIMITS)) {
      expect(Number.isSafeInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
      expect(Number.isFinite(limit)).toBe(true);
    }
    expect(DEFAULT_VALIDATION_LIMITS.entryBytes).toBeLessThanOrEqual(DEFAULT_VALIDATION_LIMITS.aggregateBytes);
  });

  it("defines safe diagnostics and discriminated validation contracts", async () => {
    const source = await readFile(new URL("src/model.ts", packageRoot), "utf8");
    expect(source).toContain('readonly reason: string');
    expect(source).toContain('readonly status: "valid"');
    expect(source).toContain('readonly status: "invalid"');
    expect(source).toContain('readonly status: "needs_context"');
    expect(source).toContain('readonly failedStage: FailedStageResult');
    expect(source).toContain('readonly missingRequiredStage: UnevaluatedStageResult & { readonly mandatory: true }');
    expect(source).toContain("type SpaasValidationLimitOverrides = Partial<SpaasValidationLimits>");
    expect(source).not.toContain("function resolveValidationLimits");
    expect(source).not.toContain("rawManifest");
    expect(source).not.toContain("secretValue");
  });

  it("contains no retired-system imports or runtime/app coupling", async () => {
    const { readdir } = await import("node:fs/promises");
    const paths = ["src/index.ts", "src/model.ts", "package.json"];
    const scan = async (dir: string): Promise<string[]> => {
      const entries = await readdir(new URL(dir, packageRoot), { withFileTypes: true });
      const found: string[] = [];
      for (const entry of entries) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) found.push(...(await scan(relative)));
        else if (entry.name.endsWith(".ts") || entry.name === "package.json") found.push(relative);
      }
      return found;
    };
    const sourceFiles = [...new Set([...paths, ...(await scan("src"))])];
    for (const path of sourceFiles) {
      const source = await readFile(new URL(path, packageRoot), "utf8");
      expect(source).not.toMatch(/(?:from\s+|import\s*\()["'][^"']*(?:apps\/web|agency|work\/request|workpacks|sandbox_jobs|opensandbox|docker|routers\/|database|runtime-adapter)/i);
    }
  });
});
