import { afterEach, describe, expect, it } from "vitest";

import {
  clearPersistedSourcePackPointer,
  mergeSourcePackPointers,
  preparePlanningSeriesInitialForm,
  persistSourcePackPointer,
  readPersistedSourcePackPointer,
  restoreSourcePackPointerIntoWizard,
} from "@/components/verticalDramaSeries/CreateSeriesWizard";

describe("source-pack pointer persistence", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("keeps source-pack pointers isolated per series", () => {
    persistSourcePackPointer("series-33", {
      draftSessionId: "draft-33",
      sourcePackId: 7,
      profileId: "review_place",
      savedAt: 123,
    });
    persistSourcePackPointer("series-44", {
      draftSessionId: "draft-44",
      sourcePackId: 9,
      profileId: "review_product",
      savedAt: 456,
    });

    expect(readPersistedSourcePackPointer("series-33")).toMatchObject({
      draftSessionId: "draft-33",
      sourcePackId: 7,
      profileId: "review_place",
      savedAt: 123,
    });
    expect(readPersistedSourcePackPointer("series-44")).toMatchObject({
      draftSessionId: "draft-44",
      sourcePackId: 9,
      profileId: "review_product",
      savedAt: 456,
    });
  });

  it("clears only the selected series pointer", () => {
    persistSourcePackPointer("series-33", {
      draftSessionId: "draft-33",
      sourcePackId: 7,
    });
    persistSourcePackPointer("series-44", {
      draftSessionId: "draft-44",
      sourcePackId: 9,
    });

    clearPersistedSourcePackPointer("series-33");

    expect(readPersistedSourcePackPointer("series-33")).toBeNull();
    expect(readPersistedSourcePackPointer("series-44")).toMatchObject({
      draftSessionId: "draft-44",
      sourcePackId: 9,
    });
  });

  it("merges partial session and pack updates without dropping the other pointer", () => {
    persistSourcePackPointer("series-33", {
      draftSessionId: "draft-33",
      profileId: "review_place",
    });
    persistSourcePackPointer("series-33", {
      sourcePackId: 7,
    });

    expect(readPersistedSourcePackPointer("series-33")).toMatchObject({
      draftSessionId: "draft-33",
      sourcePackId: 7,
      profileId: "review_place",
    });
  });

  it("ignores malformed pointers instead of restoring a new pack", () => {
    window.sessionStorage.setItem(
      "smartspec.vertical-drama.source-pack-pointers.v1",
      JSON.stringify({
        broken: { sourcePackId: 0 },
        draftOnly: { draftSessionId: "draft-only" },
      })
    );

    expect(readPersistedSourcePackPointer("broken")).toBeNull();
    expect(readPersistedSourcePackPointer("draftOnly")).toMatchObject({
      draftSessionId: "draft-only",
    });
  });

  it("restores the series profile and source pack on a planning-page remount", () => {
    const restored = restoreSourcePackPointerIntoWizard(
      {
        seriesProfileId: "drama_romance",
        seriesFormatKind: "fiction_drama",
      } as never,
      {
        draftSessionId: "draft-review",
        sourcePackId: 22,
        profileId: "location_review",
        savedAt: Date.now(),
      },
      "series-33"
    );

    expect(restored).toMatchObject({
      seriesProfileId: "location_review",
      seriesFormatKind: "location_review",
      sourceDraftSessionId: "draft-review",
      sourcePackId: 22,
    });
  });

  it("uses the Series pointer as authority while filling legacy fields from the browser fallback", () => {
    expect(
      mergeSourcePackPointers(
        {
          sourcePackId: 42,
          savedAt: "2026-08-23T00:00:00.000Z",
        },
        {
          sourcePackId: 7,
          draftSessionId: "draft-33",
          profileId: "review_place",
          savedAt: 1,
        }
      )
    ).toMatchObject({
      sourcePackId: 42,
      draftSessionId: "draft-33",
      profileId: "review_place",
    });
  });

  it("does not reuse the generic create workspace source pack for a planning Series", () => {
    const prepared = preparePlanningSeriesInitialForm(
      {
        sourcePackId: 7,
        sourceDraftSessionId: "draft-from-another-series",
        sourcePackAttachIdempotencyKey: "stale-key",
        seriesProfileId: "review_place",
      } as never,
      "series-33"
    );

    expect(prepared).toMatchObject({ seriesProfileId: "review_place" });
    expect(prepared.sourcePackId).toBeUndefined();
    expect(prepared.sourceDraftSessionId).toBeUndefined();
    expect(prepared.sourcePackAttachIdempotencyKey).toBeUndefined();
  });
});
