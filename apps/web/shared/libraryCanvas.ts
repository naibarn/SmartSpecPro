import { z } from "zod";

export const libraryCanvasCardTypeSchema = z.enum([
  "note",
  "evidence",
  "reference",
]);

export const libraryCanvasNodeSchema = z.object({
  id: z.string().min(1).max(160),
  type: libraryCanvasCardTypeSchema,
  libraryItemId: z.number().int().positive().nullable().optional(),
  label: z.string().max(255).nullable().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const libraryCanvasEdgeSchema = z.object({
  id: z.string().min(1).max(160),
  sourceNodeId: z.string().min(1).max(160),
  targetNodeId: z.string().min(1).max(160),
  label: z.string().max(255).nullable().optional(),
});

export const libraryCanvasBoardSchema = z.object({
  version: z.literal("v1").default("v1"),
  nodes: z.array(libraryCanvasNodeSchema).max(500).default([]),
  edges: z.array(libraryCanvasEdgeSchema).max(1000).default([]),
  viewport: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    zoom: z.number().positive().default(1),
  }).optional(),
}).superRefine((board, ctx) => {
  const nodeIds = new Set<string>();
  board.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes", index, "id"],
        message: "Canvas node ids must be unique",
      });
    }
    nodeIds.add(node.id);
  });

  const edgeIds = new Set<string>();
  board.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "id"],
        message: "Canvas edge ids must be unique",
      });
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceNodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "sourceNodeId"],
        message: "Canvas edge sourceNodeId must reference an existing node",
      });
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "targetNodeId"],
        message: "Canvas edge targetNodeId must reference an existing node",
      });
    }
  });
});

export const createLibraryCanvasInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  visibility: z.enum(["private", "team", "public"]).default("private"),
  board: libraryCanvasBoardSchema,
});

export const updateLibraryCanvasInputSchema = z.object({
  itemId: z.number().int().positive(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  visibility: z.enum(["private", "team", "public"]).optional(),
  board: libraryCanvasBoardSchema,
});

export const getLibraryCanvasInputSchema = z.object({
  itemId: z.number().int().positive(),
});

export const libraryCanvasResultSchema = z.object({
  itemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  visibility: z.enum(["private", "team", "public"]),
  board: libraryCanvasBoardSchema,
  updatedAt: z.coerce.date(),
});

export type LibraryCanvasBoard = z.infer<typeof libraryCanvasBoardSchema>;
export type CreateLibraryCanvasInput = z.infer<
  typeof createLibraryCanvasInputSchema
>;
export type UpdateLibraryCanvasInput = z.infer<
  typeof updateLibraryCanvasInputSchema
>;
export type GetLibraryCanvasInput = z.infer<
  typeof getLibraryCanvasInputSchema
>;
export type LibraryCanvasResult = z.infer<typeof libraryCanvasResultSchema>;
