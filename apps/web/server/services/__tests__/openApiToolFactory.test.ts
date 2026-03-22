import { describe, it, expect } from "vitest";
import {
  parseOpenApiSpec,
  OpenApiImportError,
} from "../openApiToolFactory";

// ── Helpers ─────────────────────────────────────────────────────────────────

function minimalSpec(paths: Record<string, unknown>, extras: Record<string, unknown> = {}): string {
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0" },
    servers: [{ url: "https://api.example.com" }],
    paths,
    ...extras,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("parseOpenApiSpec", () => {
  it("parses valid OpenAPI 3.0 JSON spec and returns ToolPreview[]", async () => {
    const spec = minimalSpec({
      "/pets": {
        get: {
          operationId: "listPets",
          summary: "List all pets",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
        },
      },
      "/pets/{petId}": {
        get: {
          operationId: "showPetById",
          summary: "Info for a specific pet",
          parameters: [
            { name: "petId", in: "path", required: true, schema: { type: "string" } },
          ],
        },
      },
    });

    const result = await parseOpenApiSpec({ specContent: spec, specFormat: "json" });
    expect(result.previews).toHaveLength(2);
    expect(result.baseUrl).toBe("https://api.example.com");

    const listPets = result.previews.find((p) => p.name === "listPets")!;
    expect(listPets.httpMethod).toBe("GET");
    expect(listPets.path).toBe("/pets");
    expect(listPets.description).toBe("List all pets");
    expect(listPets.inputSchema).toMatchObject({
      type: "object",
      properties: { limit: { type: "integer" } },
    });

    const showPet = result.previews.find((p) => p.name === "showPetById")!;
    expect(showPet.inputSchema).toMatchObject({
      type: "object",
      properties: { petId: { type: "string" } },
      required: ["petId"],
    });
  });

  it("parses valid OpenAPI 3.1 YAML spec", async () => {
    const yamlSpec = `
openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /pets:
    post:
      operationId: createPet
      summary: Create a pet
      parameters:
        - name: dryRun
          in: query
          schema:
            type: boolean
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                tag:
                  type: string
              required:
                - name
`;

    const result = await parseOpenApiSpec({ specContent: yamlSpec, specFormat: "yaml" });
    expect(result.previews).toHaveLength(1);

    const preview = result.previews[0];
    expect(preview.name).toBe("createPet");
    expect(preview.httpMethod).toBe("POST");
    expect(preview.inputSchema).toMatchObject({
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        name: { type: "string" },
        tag: { type: "string" },
      },
      required: ["name"],
    });
  });

  it("rejects circular $ref", async () => {
    const spec = minimalSpec(
      {
        "/test": {
          get: {
            operationId: "test",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/A" },
                },
              },
            },
          },
        },
      },
      {
        components: {
          schemas: {
            A: { $ref: "#/components/schemas/B" },
            B: { $ref: "#/components/schemas/A" },
          },
        },
      },
    );

    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toThrow(OpenApiImportError);
    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toMatchObject({ code: "circular_ref" });
  });

  it("rejects nesting depth >10", async () => {
    const schemas: Record<string, unknown> = {};
    for (let i = 0; i <= 12; i++) {
      if (i === 12) {
        schemas[`Level${i}`] = { type: "string" };
      } else {
        schemas[`Level${i}`] = {
          allOf: [{ $ref: `#/components/schemas/Level${i + 1}` }],
        };
      }
    }

    const spec = minimalSpec(
      {
        "/test": {
          get: {
            operationId: "deepTest",
            requestBody: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Level0" },
                },
              },
            },
          },
        },
      },
      { components: { schemas } },
    );

    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toThrow(OpenApiImportError);
    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toMatchObject({ code: "max_depth_exceeded" });
  });

  it("rejects spec with >100 operations", async () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i <= 100; i++) {
      paths[`/path${i}`] = {
        get: { operationId: `op${i}`, summary: `Operation ${i}` },
      };
    }

    const spec = minimalSpec(paths);

    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toThrow(OpenApiImportError);
    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toMatchObject({ code: "too_many_operations" });
  });

  it("rejects spec >500KB", async () => {
    const spec = "x".repeat(501_000);

    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toThrow(OpenApiImportError);
    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toMatchObject({ code: "spec_too_large" });
  });

  it("SSRF-validates base URL (server.url)", async () => {
    const spec = JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Test", version: "1.0" },
      servers: [{ url: "http://169.254.169.254/latest/meta-data" }],
      paths: {
        "/test": { get: { operationId: "test" } },
      },
    });

    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toThrow(OpenApiImportError);
    await expect(
      parseOpenApiSpec({ specContent: spec, specFormat: "json" }),
    ).rejects.toMatchObject({ code: "ssrf_blocked" });
  });

  it("extracts inputSchema from path parameters + requestBody", async () => {
    const spec = minimalSpec({
      "/pets/{petId}": {
        post: {
          operationId: "updatePet",
          parameters: [
            { name: "petId", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    tag: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    });

    const result = await parseOpenApiSpec({ specContent: spec, specFormat: "json" });
    const preview = result.previews[0];
    expect(preview.inputSchema.properties).toMatchObject({
      petId: { type: "string" },
      name: { type: "string" },
      tag: { type: "string" },
    });
    expect(preview.inputSchema.required).toEqual(["petId"]);
  });

  it("uses operationId as tool name when available", async () => {
    const spec = minimalSpec({
      "/pets": {
        get: { operationId: "listPets", summary: "List pets" },
      },
    });

    const result = await parseOpenApiSpec({ specContent: spec, specFormat: "json" });
    expect(result.previews[0].name).toBe("listPets");
  });

  it("falls back to METHOD_path as tool name", async () => {
    const spec = minimalSpec({
      "/pets": {
        get: { summary: "List pets" },
      },
    });

    const result = await parseOpenApiSpec({ specContent: spec, specFormat: "json" });
    expect(result.previews[0].name).toBe("GET_pets");
  });

  it("extracts security scheme as auth header hint", async () => {
    const spec = minimalSpec(
      {
        "/pets": {
          get: { operationId: "listPets", summary: "List pets" },
        },
      },
      {
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      },
    );

    const result = await parseOpenApiSpec({ specContent: spec, specFormat: "json" });
    expect(result.previews[0].authHint).toEqual({
      type: "bearer",
      headerName: "Authorization",
    });
  });
});
