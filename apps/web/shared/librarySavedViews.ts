import { z } from "zod";

export const librarySavedViewVisibilityValues = [
  "private",
  "team",
] as const;

export const librarySavedViewScopeValues = [
  "all",
  "my_library",
  "private_vault",
  "shared_with_me",
  "shared_groups",
] as const;

export const librarySavedViewSortValues = [
  "updated_desc",
  "created_desc",
] as const;

export const librarySavedViewVisibilitySchema = z.enum(
  librarySavedViewVisibilityValues,
);

export const librarySavedViewScopeSchema = z.enum(
  librarySavedViewScopeValues,
);

export const librarySavedViewSortSchema = z.enum(
  librarySavedViewSortValues,
);

export const librarySavedViewRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({ slug: z.string().min(1).max(160) }),
]);

export const librarySavedViewFiltersSchema = z.object({
  itemType: z.string().min(1).max(32).optional(),
  ownerUserId: z.number().int().positive().optional(),
  projectId: z.string().max(100).nullable().optional(),
  status: z.enum(["draft", "ready", "indexing", "archived", "failed"]).optional(),
});

export const librarySavedViewQueryDefinitionSchema = z.object({
  query: z.string().max(255).optional(),
  scope: librarySavedViewScopeSchema.default("all"),
  sort: librarySavedViewSortSchema.default("updated_desc"),
  folderId: z.number().int().positive().nullable().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  filters: librarySavedViewFiltersSchema.optional(),
});

export const librarySavedViewPresentationDefinitionSchema = z.object({
  columns: z.array(z.string().min(1).max(64)).max(20).default([]),
  groupBy: z.string().min(1).max(64).nullable().optional(),
  defaultLayout: z.enum(["table", "list"]).default("table"),
});

export const librarySavedViewSummarySchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(255),
  description: z.string().nullable().default(null),
  visibilityMode: librarySavedViewVisibilitySchema,
  scopeMode: librarySavedViewScopeSchema,
  updatedAt: z.coerce.date(),
});

export const librarySavedViewDetailSchema = librarySavedViewSummarySchema.extend({
  ownerUserId: z.number().int().positive(),
  managingGroupId: z.number().int().positive().nullable().default(null),
  queryDefinition: librarySavedViewQueryDefinitionSchema,
  presentationDefinition: librarySavedViewPresentationDefinitionSchema,
  archivedAt: z.coerce.date().nullable().default(null),
  createdAt: z.coerce.date(),
});

export const librarySavedViewListInputSchema = z.object({
  query: z.string().max(255).optional(),
  visibilityMode: librarySavedViewVisibilitySchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).optional(),
});

export const libraryCreateSavedViewInputSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
  visibilityMode: librarySavedViewVisibilitySchema.default("private"),
  scopeMode: librarySavedViewScopeSchema.default("all"),
  queryDefinition: librarySavedViewQueryDefinitionSchema.default({ scope: "all" }),
  presentationDefinition: librarySavedViewPresentationDefinitionSchema.default({}),
});

export const libraryUpdateSavedViewInputSchema = z.object({
  ref: librarySavedViewRefSchema,
  expectedUpdatedAt: z.coerce.date().optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  visibilityMode: librarySavedViewVisibilitySchema.optional(),
  scopeMode: librarySavedViewScopeSchema.optional(),
  queryDefinition: librarySavedViewQueryDefinitionSchema.optional(),
  presentationDefinition: librarySavedViewPresentationDefinitionSchema.optional(),
});

export const libraryArchiveSavedViewInputSchema = librarySavedViewRefSchema;

export const libraryExecuteSavedViewInputSchema = z.object({
  ref: librarySavedViewRefSchema,
  limitOverride: z.number().int().min(1).max(200).optional(),
});

export const librarySavedViewExecutionItemSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255),
  itemType: z.string().min(1).max(32),
  status: z.string().min(1).max(32),
  visibility: z.string().min(1).max(32),
  updatedAt: z.coerce.date(),
});

export const librarySavedViewExecutionResultSchema = z.object({
  view: librarySavedViewSummarySchema,
  total: z.number().int().nonnegative(),
  items: z.array(librarySavedViewExecutionItemSchema),
});

export type LibrarySavedViewVisibility = z.infer<
  typeof librarySavedViewVisibilitySchema
>;
export type LibrarySavedViewScope = z.infer<
  typeof librarySavedViewScopeSchema
>;
export type LibrarySavedViewSort = z.infer<
  typeof librarySavedViewSortSchema
>;
export type LibrarySavedViewRef = z.infer<
  typeof librarySavedViewRefSchema
>;
export type LibrarySavedViewQueryDefinition = z.infer<
  typeof librarySavedViewQueryDefinitionSchema
>;
export type LibrarySavedViewPresentationDefinition = z.infer<
  typeof librarySavedViewPresentationDefinitionSchema
>;
export type LibrarySavedViewSummary = z.infer<
  typeof librarySavedViewSummarySchema
>;
export type LibrarySavedViewDetail = z.infer<
  typeof librarySavedViewDetailSchema
>;
export type LibrarySavedViewListInput = z.infer<
  typeof librarySavedViewListInputSchema
>;
export type LibraryCreateSavedViewInput = z.infer<
  typeof libraryCreateSavedViewInputSchema
>;
export type LibraryUpdateSavedViewInput = z.infer<
  typeof libraryUpdateSavedViewInputSchema
>;
export type LibraryArchiveSavedViewInput = z.infer<
  typeof libraryArchiveSavedViewInputSchema
>;
export type LibraryExecuteSavedViewInput = z.infer<
  typeof libraryExecuteSavedViewInputSchema
>;
export type LibrarySavedViewExecutionResult = z.infer<
  typeof librarySavedViewExecutionResultSchema
>;
