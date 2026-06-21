import { describe, expect, it } from "vitest";
import { projectMcpToolInputSchema } from "../mcpToolSchemaProjection";

describe("mcpToolSchemaProjection", () => {
  it("projects supported fields and hides unsupported provider schema fields", () => {
    const projection = projectMcpToolInputSchema({
      toolName: "video_generate",
      inputSchema: {
        type: "object",
        required: ["prompt", "duration"],
        properties: {
          prompt: { type: "string", title: "Prompt" },
          duration: { type: "integer", title: "Duration" },
          quality: { enum: ["draft", "final"] },
          reference: { type: "array" },
          transport: { type: "string" },
        },
      },
    });

    expect(projection.toolName).toBe("video_generate");
    expect(projection.schemaHash).toHaveLength(64);
    expect(projection.fields.find((field) => field.name === "prompt")).toMatchObject({
      kind: "string",
      required: true,
    });
    expect(projection.fields.find((field) => field.name === "duration")).toMatchObject({
      kind: "number",
      required: true,
    });
    expect(projection.fields.find((field) => field.name === "quality")).toMatchObject({
      kind: "enum",
      options: ["draft", "final"],
    });
    expect(projection.fields.find((field) => field.name === "reference")).toMatchObject({
      hidden: true,
    });
    expect(projection.fields.find((field) => field.name === "transport")).toBeUndefined();
    expect(projection.warnings.join(" ")).toContain("protected");
  });
});
