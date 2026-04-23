import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";

import {
  libraryContextPacks,
  librarySavedViewScopeEnum,
  librarySavedViews,
  librarySavedViewVisibilityEnum,
} from "./schema";

describe("library saved view schema", () => {
  it("defines durable saved-view columns", () => {
    const columns = getTableColumns(librarySavedViews);

    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.ownerUserId).toBeDefined();
    expect(columns.managingGroupId).toBeDefined();
    expect(columns.slug).toBeDefined();
    expect(columns.title).toBeDefined();
    expect(columns.description).toBeDefined();
    expect(columns.visibilityMode).toBeDefined();
    expect(columns.scopeMode).toBeDefined();
    expect(columns.queryDefinition).toBeDefined();
    expect(columns.presentationDefinition).toBeDefined();
    expect(columns.archivedAt).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  it("defines saved-view visibility and scope enums", () => {
    expect(librarySavedViewVisibilityEnum.enumValues).toEqual([
      "private",
      "team",
    ]);
    expect(librarySavedViewScopeEnum.enumValues).toEqual([
      "all",
      "my_library",
      "private_vault",
      "shared_with_me",
      "shared_groups",
    ]);
  });

  it("defines context-pack approval audit columns", () => {
    const columns = getTableColumns(libraryContextPacks);

    expect(columns.submittedForReviewAt).toBeDefined();
    expect(columns.reviewedAt).toBeDefined();
    expect(columns.approvedAt).toBeDefined();
    expect(columns.reviewerUserId).toBeDefined();
    expect(columns.lastSourceMutationAt).toBeDefined();
    expect(columns.freshUntil).toBeDefined();
  });
});
