import { describe, expect, it } from "vitest";
import {
  buildLegacyDraftSeriesMetadata,
  isLegacyDraftMigrationSchemaUnavailable,
} from "../verticalDramaLegacyDraftMigration";

describe("verticalDramaLegacyDraftMigration", () => {
  it("defers only when the compatibility schema is not ready", () => {
    expect(
      isLegacyDraftMigrationSchemaUnavailable({
        code: "42703",
        message: 'column "seriesId" does not exist',
      })
    ).toBe(true);
    expect(
      isLegacyDraftMigrationSchemaUnavailable({
        code: "42P01",
        message: 'relation "vertical_drama_draft_ledgers" does not exist',
      })
    ).toBe(true);
    expect(
      isLegacyDraftMigrationSchemaUnavailable({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      })
    ).toBe(false);
  });

  it("prefers the persisted title and preserves the planning locale/count", () => {
    expect(
      buildLegacyDraftSeriesMetadata({
        jobCode: 11,
        currentJson: { title: "เลือดเดียวกัน สนามเดียวกัน" },
        requestJson: {
          synthesis: {
            locale: "en-US",
            seriesTitleHint: "ignored fallback",
            targetEpisodeCount: 120,
          },
        },
      })
    ).toMatchObject({
      title: "เลือดเดียวกัน สนามเดียวกัน",
      locale: "en",
      targetEpisodeCount: 120,
    });
  });

  it("uses a safe recovery title and clamps invalid episode counts", () => {
    expect(
      buildLegacyDraftSeriesMetadata({
        jobCode: 42,
        currentJson: {},
        requestJson: {
          synthesis: {
            seriesTitleHint: "เรื่องเก่า",
            targetEpisodeCount: 5000,
          },
        },
      })
    ).toMatchObject({ title: "เรื่องเก่า", targetEpisodeCount: 1000 });

    expect(
      buildLegacyDraftSeriesMetadata({
        jobCode: 43,
        currentJson: {},
        requestJson: {},
      })
    ).toMatchObject({
      title: "กู้คืนงาน Draft #43",
      locale: "th",
      targetEpisodeCount: 10,
    });
  });
});
