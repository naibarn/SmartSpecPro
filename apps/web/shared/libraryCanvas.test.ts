import { describe, expect, it } from "vitest";

import { libraryCanvasBoardSchema } from "./libraryCanvas";

describe("libraryCanvasBoardSchema", () => {
  it("accepts spatial knowledge boards whose edges reference existing nodes", () => {
    const parsed = libraryCanvasBoardSchema.parse({
      version: "v1",
      nodes: [
        { id: "note-1", type: "note", libraryItemId: 101, x: 0, y: 0 },
        { id: "evidence-1", type: "evidence", libraryItemId: 102, x: 320, y: 0 },
      ],
      edges: [
        {
          id: "edge-1",
          sourceNodeId: "note-1",
          targetNodeId: "evidence-1",
          label: "supports",
        },
      ],
    });

    expect(parsed.edges[0]).toMatchObject({
      sourceNodeId: "note-1",
      targetNodeId: "evidence-1",
    });
  });

  it("rejects duplicate nodes, duplicate edges, and dangling edge endpoints", () => {
    const result = libraryCanvasBoardSchema.safeParse({
      version: "v1",
      nodes: [
        { id: "note-1", type: "note", libraryItemId: 101, x: 0, y: 0 },
        { id: "note-1", type: "reference", x: 320, y: 0 },
      ],
      edges: [
        {
          id: "edge-1",
          sourceNodeId: "note-1",
          targetNodeId: "missing-node",
        },
        {
          id: "edge-1",
          sourceNodeId: "missing-source",
          targetNodeId: "note-1",
        },
      ],
    });

    expect(result.success).toBe(false);
    const messages = result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Canvas node ids must be unique",
        "Canvas edge ids must be unique",
        "Canvas edge sourceNodeId must reference an existing node",
        "Canvas edge targetNodeId must reference an existing node",
      ]),
    );
  });
});
