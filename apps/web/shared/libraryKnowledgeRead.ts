import { z } from "zod";

export const libraryKnowledgeInspectorInputSchema = z.object({
  itemId: z.number().int().positive(),
  localGraphLimit: z.number().int().min(1).max(100).optional(),
});

export const libraryKnowledgeRelationEntrySchema = z.object({
  libraryItemId: z.number().int().positive().nullable().default(null),
  title: z.string().nullable().default(null),
  logicalPath: z.string().nullable().default(null),
  status: z.enum(["resolved", "ambiguous", "unresolved", "forbidden"]),
  matchedBy: z.enum(["logical_path", "title", "alias"]).nullable().default(null),
  matchedValue: z.string().nullable().default(null),
  rawReference: z.string().min(1),
  displayText: z.string().nullable().default(null),
});

export const libraryKnowledgeGraphNodeSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  logicalPath: z.string().nullable().default(null),
  role: z.enum(["active", "neighbor"]),
});

export const libraryKnowledgeGraphEdgeSchema = z.object({
  sourceLibraryItemId: z.number().int().positive(),
  targetLibraryItemId: z.number().int().positive(),
  relationKind: z.enum(["wikilink", "markdown"]),
});

export const libraryKnowledgeMentionSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  logicalPath: z.string().nullable().default(null),
  matchedText: z.string().min(1),
});

export const libraryKnowledgeSharedTagSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  logicalPath: z.string().nullable().default(null),
  sharedTags: z.array(z.string()).default([]),
});

export const libraryKnowledgeSemanticRelatedSchema = z.object({
  libraryItemId: z.number().int().positive(),
  title: z.string().min(1).max(255),
  logicalPath: z.string().nullable().default(null),
  score: z.number().nonnegative().nullable().default(null),
  rationale: z.string().nullable().default(null),
});

export const libraryKnowledgeInspectorResultSchema = z.object({
  note: z.object({
    libraryItemId: z.number().int().positive(),
    title: z.string().min(1).max(255),
    logicalPath: z.string().nullable().default(null),
    aliases: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    properties: z.record(z.unknown()).default({}),
  }),
  outgoing: z.array(libraryKnowledgeRelationEntrySchema).default([]),
  backlinks: z.array(libraryKnowledgeRelationEntrySchema).default([]),
  unlinkedMentions: z.array(libraryKnowledgeMentionSchema).default([]),
  sharedTags: z.array(libraryKnowledgeSharedTagSchema).default([]),
  semanticRelated: z.array(libraryKnowledgeSemanticRelatedSchema).default([]),
  localGraph: z.object({
    nodes: z.array(libraryKnowledgeGraphNodeSchema).default([]),
    edges: z.array(libraryKnowledgeGraphEdgeSchema).default([]),
  }),
});

export const libraryKnowledgeQuickSwitchInputSchema = z.object({
  query: z.string().max(255).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const libraryKnowledgeQuickSwitchResultSchema = z.object({
  results: z.array(
    z.object({
      libraryItemId: z.number().int().positive(),
      title: z.string().min(1).max(255),
      logicalPath: z.string().nullable().default(null),
      aliases: z.array(z.string()).default([]),
      matchType: z.enum([
        "recent",
        "exact_title",
        "exact_path",
        "exact_alias",
        "prefix",
        "path_prefix",
        "fuzzy",
        "path_fuzzy",
      ]),
      disambiguation: z.string().nullable().default(null),
    }),
  ).default([]),
  createSuggestion: z.string().nullable().default(null),
});

export const libraryKnowledgePropertyCatalogInputSchema = z.object({
  query: z.string().max(255).optional(),
});

export const libraryKnowledgePropertyCatalogResultSchema = z.object({
  properties: z.array(
    z.object({
      key: z.string().min(1),
      inferredType: z.enum(["string", "number", "boolean", "array", "object", "null", "mixed"]),
      usageCount: z.number().int().nonnegative(),
    }),
  ).default([]),
});

export const libraryKnowledgeTagCatalogInputSchema = z.object({
  query: z.string().max(255).optional(),
});

export const libraryKnowledgeTagCatalogResultSchema = z.object({
  tags: z.array(
    z.object({
      tag: z.string().min(1),
      usageCount: z.number().int().nonnegative(),
    }),
  ).default([]),
});

export type LibraryKnowledgeInspectorInput = z.infer<
  typeof libraryKnowledgeInspectorInputSchema
>;
export type LibraryKnowledgeInspectorResult = z.infer<
  typeof libraryKnowledgeInspectorResultSchema
>;
export type LibraryKnowledgeQuickSwitchInput = z.infer<
  typeof libraryKnowledgeQuickSwitchInputSchema
>;
export type LibraryKnowledgeQuickSwitchResult = z.infer<
  typeof libraryKnowledgeQuickSwitchResultSchema
>;
export type LibraryKnowledgePropertyCatalogInput = z.infer<
  typeof libraryKnowledgePropertyCatalogInputSchema
>;
export type LibraryKnowledgePropertyCatalogResult = z.infer<
  typeof libraryKnowledgePropertyCatalogResultSchema
>;
export type LibraryKnowledgeTagCatalogInput = z.infer<
  typeof libraryKnowledgeTagCatalogInputSchema
>;
export type LibraryKnowledgeTagCatalogResult = z.infer<
  typeof libraryKnowledgeTagCatalogResultSchema
>;
