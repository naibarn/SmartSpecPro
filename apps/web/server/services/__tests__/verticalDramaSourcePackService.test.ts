import { describe, expect, it } from "vitest";
import { isSourcePackSchemaUnavailable } from "../verticalDramaSourcePackService";

describe("isSourcePackSchemaUnavailable", () => {
  it("recognizes a missing source-pack relation", () => {
    expect(
      isSourcePackSchemaUnavailable({
        code: "42P01",
        message:
          'relation "vertical_drama_source_pack_sessions" does not exist',
      })
    ).toBe(true);
  });

  it("recognizes a relation error even when the driver omits its message", () => {
    expect(isSourcePackSchemaUnavailable({ code: "42P01" })).toBe(true);
  });

  it("recognizes a missing source-pack column", () => {
    expect(
      isSourcePackSchemaUnavailable({
        code: "42703",
        message:
          'column "draftSessionId" of relation "vertical_drama_source_packs" does not exist',
      })
    ).toBe(true);
  });

  it("recognizes errors wrapped in a cause", () => {
    expect(
      isSourcePackSchemaUnavailable({
        message: "query failed",
        cause: {
          code: "42P01",
          message: 'relation "vertical_drama_source_packs" does not exist',
        },
      })
    ).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(
      isSourcePackSchemaUnavailable({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      })
    ).toBe(false);
  });
});
