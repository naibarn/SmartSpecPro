import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSpaasManifest } from "../src/index";
import type { ManifestSupportContext } from "../src/index";

const fixtureUrl = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
const support: ManifestSupportContext = {
  supportedApiVersions: ["spaas.smartaihub.app/v1"],
  supportedSchemaVersions: ["1.0"],
  supportedRequiredFeatures: ["spaas.events.delivery-semantics/v1"],
  supportedOptionalFeatures: [],
  extensions: [{
    namespace: "io.modelcontextprotocol/tasks",
    versions: ["2026-07-28"],
    criticalities: ["optional"],
  }],
};

async function fixture(name = "manifest-valid.yaml"): Promise<string> {
  return readFile(fixtureUrl(name), "utf8");
}

describe("parseSpaasManifest", () => {
  it("parses the Spec 261 core manifest and generic MCP extension requirements", async () => {
    const result = parseSpaasManifest(await fixture(), support);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.metadata.id).toBe("app_construction");
    expect(result.manifest.components).toHaveLength(1);
    expect(result.manifest.extensions?.[0]).toMatchObject({
      namespace: "io.modelcontextprotocol/tasks",
      version: "2026-07-28",
      criticality: "optional",
      fallback: { policy: "SMARTAIHUB_DURABLE_WRAPPER", preservesSemantics: true },
    });
  });

  it("canonicalizes maps without reordering semantically ordered arrays", async () => {
    const a = parseSpaasManifest(await fixture("manifest-valid.yaml"), support);
    const b = parseSpaasManifest(await fixture("manifest-valid-reordered.yaml"), support);
    expect(a).toEqual(b);
    if (a.ok) expect(a.manifest.components.map((component) => component.id)).toEqual(["construction-assistant"]);
  });

  it("returns safe stable diagnostics for invalid core fields", () => {
    const result = parseSpaasManifest("apiVersion: wrong\nkind: AIApplication\nmetadata: {}", support);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.every((item) => item.stage === "V1" && item.code === "MANIFEST_SCHEMA_INVALID")).toBe(true);
  });

  it("rejects unknown top-level core fields and duplicate component identifiers", async () => {
    const fixtureText = await fixture();
    const unknownCore = parseSpaasManifest(`${fixtureText}securityModeOverride: unsafe\n`, support);
    expect(unknownCore.ok).toBe(false);
    if (!unknownCore.ok) expect(unknownCore.diagnostics.some((d) => d.code === "MANIFEST_SCHEMA_INVALID")).toBe(true);

    const duplicate = parseSpaasManifest(fixtureText.replace(
      "  - id: construction-assistant\n    type: assistant\n    source: assistants/construction.yaml\n    dependsOn: []\n    sideEffects: []",
      "  - id: construction-assistant\n    type: assistant\n    source: assistants/construction.yaml\n    dependsOn: []\n    sideEffects: []\n  - id: construction-assistant\n    type: assistant\n    source: assistants/second.yaml",
    ), support);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.diagnostics.some((d) => d.code === "COMPONENT_ID_DUPLICATE")).toBe(true);
  });

  it("rejects duplicate mapping keys, aliases, tags, and multiple YAML documents", () => {
    for (const [source, expectedCode] of [
      ["apiVersion: one\napiVersion: two\n", "MANIFEST_DUPLICATE_KEY"],
      ["base: &base {kind: AIApplication}\ncopy: *base\n", "MANIFEST_SYNTAX_INVALID"],
      ["value: !custom unsafe\n", "MANIFEST_SYNTAX_INVALID"],
      ["a: 1\n---\nb: 2\n", "MANIFEST_SYNTAX_INVALID"],
    ]) {
      const result = parseSpaasManifest(source, support);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe(expectedCode);
    }
  });

  it("fails closed for unsupported required feature and MCP extension semantics", async () => {
    const unsupportedFeature = parseSpaasManifest(await fixture(), { ...support, supportedRequiredFeatures: [] });
    expect(unsupportedFeature.ok).toBe(false);
    if (!unsupportedFeature.ok) expect(unsupportedFeature.diagnostics.some((d) => d.code === "MANIFEST_FEATURE_UNSUPPORTED")).toBe(true);

    const unsafeOptionalFeature = parseSpaasManifest((await fixture()).replace("preservesSemantics: true", "preservesSemantics: false"), {
      ...support,
      supportedOptionalFeatures: [],
    });
    expect(unsafeOptionalFeature.ok).toBe(false);
    if (!unsafeOptionalFeature.ok) expect(unsafeOptionalFeature.diagnostics.some((d) => d.code === "MANIFEST_OPTIONAL_FEATURE_UNSAFE")).toBe(true);

    const source = (await fixture()).replace("required: {}", "required:\n        io.example/unknown:\n          version: v1");
    const unsupportedExtension = parseSpaasManifest(source, support);
    expect(unsupportedExtension.ok).toBe(false);
    if (!unsupportedExtension.ok) expect(unsupportedExtension.diagnostics.some((d) => d.code === "MANIFEST_EXTENSION_UNSUPPORTED")).toBe(true);
  });

  it("requires an explicit semantics-preserving fallback for unsupported optional extensions", async () => {
    const source = (await fixture()).replace("omissionSafe: true", "omissionSafe: false");
    const result = parseSpaasManifest(source, { ...support, extensions: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.some((d) => d.code === "MANIFEST_OPTIONAL_FEATURE_UNSAFE")).toBe(true);
  });

  it("preserves safe unknown optional extension metadata without executing it", async () => {
    const result = parseSpaasManifest(await fixture(), { ...support, extensions: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.extensions?.[0]?.namespace).toBe("io.modelcontextprotocol/tasks");
    expect(result.unexecutedExtensions).toEqual([{ namespace: "io.modelcontextprotocol/tasks", version: "2026-07-28" }]);
  });

  it("bounds bytes/depth/nodes and rejects malformed UTF-8 without leaking parser text", async () => {
    const text = await fixture();
    const exactByteLimit = new TextEncoder().encode(text).byteLength;
    expect(parseSpaasManifest(text, support, { manifestBytes: exactByteLimit }).ok).toBe(true);

    const tooSmall = parseSpaasManifest(text, support, { manifestBytes: 4 });
    expect(tooSmall.ok).toBe(false);
    if (!tooSmall.ok) expect(tooSmall.diagnostics[0]?.code).toBe("MANIFEST_LIMIT_EXCEEDED");

    const tooDeep = parseSpaasManifest(text, support, { yamlDepth: 4 });
    expect(tooDeep.ok).toBe(false);
    if (!tooDeep.ok) expect(tooDeep.diagnostics[0]?.code).toBe("MANIFEST_LIMIT_EXCEEDED");

    const tooManyNodes = parseSpaasManifest(text, support, { yamlNodes: 8 });
    expect(tooManyNodes.ok).toBe(false);
    if (!tooManyNodes.ok) expect(tooManyNodes.diagnostics[0]?.code).toBe("MANIFEST_LIMIT_EXCEEDED");

    const invalidLimit = parseSpaasManifest(text, support, { yamlNodes: Number.POSITIVE_INFINITY });
    expect(invalidLimit.ok).toBe(false);
    if (!invalidLimit.ok) expect(invalidLimit.diagnostics[0]?.code).toBe("MANIFEST_LIMIT_EXCEEDED");

    const badUtf8 = parseSpaasManifest(new Uint8Array([0xff, 0xfe]), support);
    expect(badUtf8.ok).toBe(false);
    if (!badUtf8.ok) expect(JSON.stringify(badUtf8)).not.toMatch(/255|254|stack|yamlexception/i);
  });

  it("does not include raw secret-like values or source excerpts in diagnostics", () => {
    const secret = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";
    const result = parseSpaasManifest(`apiVersion: wrong\nprivateKey: ${secret}\n`, support);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result)).not.toContain(secret);
  });
});
