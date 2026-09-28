import { describe, expect, it } from "vitest";
import {
  validateMiniAppInput,
  authorizeMiniAppArtifact,
  publishMiniApp,
  filterWorkflowMarketplace,
  MiniAppError,
} from "../workflowMiniAppService";

describe("workflowMiniAppService", () => {
  it("validates typed inputs and tenant-scoped artifacts", () => {
    expect(
      validateMiniAppInput({
        schema: [{ name: "topic", type: "string", required: true }],
        input: { topic: "hello" },
      })
    ).toMatchObject({ valid: true });
    expect(
      validateMiniAppInput({
        schema: [{ name: "topic", type: "string", required: true }],
        input: {},
      })
    ).toMatchObject({ valid: false, reasonCode: "REQUIRED_INPUT_MISSING" });
    expect(
      authorizeMiniAppArtifact({
        tenantId: "tenant-1",
        artifact: { tenantId: "tenant-2", objectKey: "x" },
      })
    ).toMatchObject({ allowed: false, reasonCode: "ARTIFACT_TENANT_MISMATCH" });
  });

  it("publishes immutable app versions and filters marketplace by access", () => {
    const app = publishMiniApp({
      appId: "app-1",
      versionId: "version-1",
      slug: "summarize",
      accessMode: "public",
    });
    expect(app).toMatchObject({ status: "published" });
    expect(() =>
      publishMiniApp({ ...app, versionId: "version-2" })
    ).toThrowError(new MiniAppError("PUBLISHED_APP_IMMUTABLE"));
    expect(
      filterWorkflowMarketplace(
        [
          {
            slug: "a",
            status: "published",
            accessMode: "public",
            tags: ["ai"],
          },
          { slug: "b", status: "draft", accessMode: "public", tags: ["ai"] },
        ],
        { tag: "ai" }
      )
    ).toHaveLength(1);
  });
});
