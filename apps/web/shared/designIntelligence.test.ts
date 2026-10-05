import { describe, expect, it } from "vitest";
import {
  canonicalDesignDigestInput,
  designRequestSchema,
  designArtifactVersionSchema,
  designContextBundleSchema,
  designBriefSchema,
  designG0ReconciliationSchema,
  isDesignG0CoreReady,
} from "./designIntelligence";

describe("provider-neutral design contracts", () => {
  it("accepts a scoped native request with a safe prompt envelope", () => {
    const parsed = designRequestSchema.safeParse({
      schemaVersion: 1,
      tenantId: "tenant-1",
      projectId: "project-1",
      requestId: "request-1",
      requestedBy: "user-1",
      intent: "mini-app-screen",
      prompt: { text: "Create a reading list screen", trust: "user-authored" },
      locale: "en",
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    { schemaVersion: 2 },
    { tenantId: "   " },
    { prompt: { text: "x".repeat(20_001), trust: "user-authored" } },
    { prompt: { text: "api_key=secret-value", trust: "user-authored" } },
    { prompt: { text: "secret=short-value token=short-value", trust: "user-authored" } },
    { prompt: { text: "Authorization: Basic dXNlcjpwYXNz", trust: "user-authored" } },
    { prompt: { text: "store sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", trust: "user-authored" } },
    { prompt: { text: "Create view", trust: "user-authored", sourceRef: "Authorization:Basic" } },
    { prompt: { text: "open javascript:alert(1)", trust: "user-authored" } },
    { prompt: { text: "<script>alert(1)</script>", trust: "imported-untrusted" } },
  ])("rejects unsafe or incomplete input %#", (override) => {
    const base = {
      schemaVersion: 1,
      tenantId: "tenant-1",
      projectId: "project-1",
      requestId: "request-1",
      requestedBy: "user-1",
      intent: "mini-app-screen",
      prompt: { text: "Create a reading list screen", trust: "user-authored" },
      locale: "en",
    };
    expect(designRequestSchema.safeParse({ ...base, ...override }).success).toBe(false);
  });

  it("keeps digest input stable across object key order", () => {
    expect(canonicalDesignDigestInput({ b: 2, a: 1 })).toBe(
      canonicalDesignDigestInput({ a: 1, b: 2 }),
    );
    expect(() => canonicalDesignDigestInput({ value: Number.NaN })).toThrow();
    expect(() => canonicalDesignDigestInput({ value: new Date() })).toThrow();
  });

  it("rejects raw HTML and secret fields in canonical artifact payloads", () => {
    const artifact = {
      schemaVersion: 1,
      artifactId: "artifact-1",
      version: 1,
      digest: `sha256:${"a".repeat(64)}`,
      tenantId: "tenant-1",
      projectId: "project-1",
      ownerId: "tenant-1",
      createdBy: "user-1",
      status: "draft",
      rights: { ownerId: "tenant-1", license: "owned", assetsCleared: true },
      systemSnapshot: { catalogSnapshotId: "catalog-1", componentVersion: "1", locale: "en", theme: "light", deviceProfile: "desktop" },
      actionBindings: [],
      storageRef: "internal:design/artifact-1/1",
      provenance: { source: "native", requestId: "request-1", reproducibility: "deterministic" },
      payload: { screen: { title: "List", rawHtml: "<script>bad()</script>" } },
    };
    expect(designArtifactVersionSchema.safeParse(artifact).success).toBe(false);
    for (const payload of [
      { headers: { "X-API-Key": "secret" } },
      { auth: { password: "secret" } },
      { cookie: "sid=secret" },
      { credentials: { accessKey: "secret" } },
      { description: "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
    ]) {
      expect(designArtifactVersionSchema.safeParse({ ...artifact, payload }).success).toBe(false);
    }
  });

  it("rejects provider credentials under ordinary text fields", () => {
    const tokens = [
      "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      "gho_abcdefghijklmnopqrstuvwxyz123456",
      "ghs_abcdefghijklmnopqrstuvwxyz123456",
      ["xai", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
      "xai-abcdefghijklmnopqrstuvwxyz123456",
      ["rk", "live", "abcdefghijklmnopqrstuvwxyz123456"].join("_"),
      "whsec_abcdefghijklmnopqrstuvwxyz123456",
      "gsk_abcdefghijklmnopqrstuvwxyz123456",
      "hf_abcdefghijklmnopqrstuvwxyz123456",
    ];
    for (const token of tokens) {
      expect(designContextBundleSchema.safeParse({
        schemaVersion: 1, tenantId: "tenant-1", projectId: "project-1", locale: "en", theme: "light",
        viewport: { width: 1280, height: 800 }, componentCatalogSnapshotId: "catalog-1",
        content: [{ sourceRef: "doc-1", trust: "imported-untrusted", summary: token }],
      }).success).toBe(false);
      expect(designBriefSchema.safeParse({
        requestId: "request-1", objective: token, audience: "creator", constraints: [], contextBundleId: "context-1",
      }).success).toBe(false);
    }
  });

  it("requires a full SHA-256 digest", () => {
    expect(designArtifactVersionSchema.safeParse({ digest: "sha256:abc" }).success).toBe(false);
  });

  it("rejects non-JSON objects and traversal in persisted artifact fields", () => {
    const payload = { value: new Date() };
    expect(() => canonicalDesignDigestInput({ payload })).toThrow();
    const traversal = {
      artifactId: "artifact-1", version: 1, digest: `sha256:${"c".repeat(64)}`,
      tenantId: "tenant-1", projectId: "project-1", ownerId: "tenant-1", createdBy: "user-1",
      status: "draft", rights: { ownerId: "tenant-1", license: "owned", assetsCleared: true },
      systemSnapshot: { catalogSnapshotId: "catalog-1", componentVersion: "1", locale: "en", theme: "light", deviceProfile: "desktop" },
      actionBindings: [], storageRef: "internal:../other-tenant/artifact",
      provenance: { source: "native", requestId: "request-1", reproducibility: "deterministic" }, payload: {},
    };
    expect(designArtifactVersionSchema.safeParse(traversal).success).toBe(false);
  });

  it("rejects canonical artifact versions without project scope or complete lineage", () => {
    const valid = {
      schemaVersion: 1,
      artifactId: "artifact-1",
      version: 2,
      digest: `sha256:${"b".repeat(64)}`,
      tenantId: "tenant-1",
      projectId: "project-1",
      ownerId: "tenant-1",
      createdBy: "user-1",
      status: "selected",
      rights: { ownerId: "tenant-1", license: "owned", assetsCleared: true },
      systemSnapshot: { catalogSnapshotId: "catalog-1", componentVersion: "1", locale: "en", theme: "light", deviceProfile: "desktop" },
      actionBindings: [],
      storageRef: "internal:design/artifact-1/2",
      provenance: { source: "native", requestId: "request-1", reproducibility: "deterministic" },
      payload: { screen: { title: "List" } },
    };
    expect(designArtifactVersionSchema.safeParse(valid).success).toBe(true);
    expect(designArtifactVersionSchema.safeParse({ ...valid, projectId: undefined }).success).toBe(false);
    expect(designArtifactVersionSchema.safeParse({ ...valid, parentArtifactId: "parent-1" }).success).toBe(false);
  });

  it("rejects an incomplete artifact version", () => {
    expect(
      designArtifactVersionSchema.safeParse({ artifactId: "artifact-1", version: 1 }).success,
    ).toBe(false);
  });

  it("fails the G0 readiness gate closed while any core authority is unresolved", () => {
    const result = designG0ReconciliationSchema.parse({
      specNumberUnique: "unresolved",
      schemaOwner: "unresolved",
      recoveryClosure: "unresolved",
      contractAuthorities: "unresolved",
      secretBinding: "unresolved",
      providerCertification: "unresolved",
      flagsDefaultOff: true,
    });
    expect(isDesignG0CoreReady(result)).toBe(false);
  });
});
