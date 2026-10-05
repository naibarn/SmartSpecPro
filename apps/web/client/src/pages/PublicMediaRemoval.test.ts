import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Docs from "./Docs";
import Features from "./Features";

const source = (fileName: string) =>
  readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");

describe("public Features and Docs media governance", () => {
  it("keeps both media-free public pages importable", () => {
    expect(Features).toBeTypeOf("function");
    expect(Docs).toBeTypeOf("function");
  });

  it("does not render unverified local marketing media on Features", () => {
    const features = source("Features.tsx");

    expect(features).not.toMatch(/\/images\/smartaihub-(features|docs|domain-specific)-[^"']+\.webp/);
    expect(features).not.toContain("<img");
    expect(features).toContain("function CapabilityPanel");
    expect(features).toContain('id={spotlight.key === "vertical" ? "vertical-series" : undefined}');
    expect(features).toContain('"/login?returnUrl=%2Fdrama-series"');
  });

  it("does not render unverified local marketing media on Docs", () => {
    const docs = source("Docs.tsx");

    expect(docs).not.toMatch(/\/images\/smartaihub-(features|docs|domain-specific)-[^"']+\.webp/);
    expect(docs).not.toContain("<img");
    expect(docs).toContain("function DocumentationPanel");
    expect(docs).toContain('id="marketplace-capture"');
    expect(docs).toContain('id="worker-render"');
    expect(docs).toContain('id="mcp-integrations"');
  });

  it("keeps responsive code-rendered panels rather than empty media gaps", () => {
    const features = source("Features.tsx");
    const docs = source("Docs.tsx");

    for (const page of [features, docs]) {
      expect(page).toContain("grid place-items-center");
      expect(page).toContain("min-h-[20rem]");
    }
    expect(features).toContain("sm:min-h-[25rem]");
    expect(docs).toContain("sm:min-h-[27rem]");
  });
});
