import { describe, expect, it } from "vitest";

import {
  createVerticalDramaSpeakerPeopleDetectionDedupeKey,
  verticalDramaSpeakerPeopleDetectionJobPayloadSchema,
  verticalDramaSpeakerPeopleDetectionResultSchema,
} from "../verticalDramaSpeakerPeopleDetectionJob";
import { omitUndefinedJobPayloadProperties } from "../feature186VerticalDramaJobAdapter";
import { validateBoundedPayload } from "../jobCanonicalization";

describe("vertical drama speaker people detection jobs", () => {
  it("accepts only the bounded owner-independent payload required by the worker", () => {
    expect(
      verticalDramaSpeakerPeopleDetectionJobPayloadSchema.parse({
        seriesId: 7,
        episodeId: 21,
        shotNumber: 3,
        sourceMediaAssetId: "884",
        speakers: [{ speakerLabel: "  Mara  " }],
        publicUrl: "https://smartaihub.app",
      })
    ).toMatchObject({ seriesId: 7, episodeId: 21, sourceMediaAssetId: "884" });

    expect(() =>
      verticalDramaSpeakerPeopleDetectionJobPayloadSchema.parse({
        seriesId: 7,
        episodeId: 21,
        shotNumber: 3,
        sourceMediaAssetId: "884",
        speakers: [],
        imageUrl: "https://example.invalid/signed-image",
      })
    ).toThrow();
  });

  it("deduplicates equivalent speaker labels for the same approved frame and owner", () => {
    const base = {
      tenantId: "tenant-a",
      userId: 12,
      seriesId: 7,
      episodeId: 21,
      shotNumber: 3,
      sourceMediaAssetId: "884",
      speakers: [{ speakerLabel: " Mara " }, { speakerLabel: "Jin" }],
    };
    expect(createVerticalDramaSpeakerPeopleDetectionDedupeKey(base)).toBe(
      createVerticalDramaSpeakerPeopleDetectionDedupeKey({
        ...base,
        speakers: [{ speakerLabel: "jin" }, { speakerLabel: "mara" }],
      })
    );
    expect(createVerticalDramaSpeakerPeopleDetectionDedupeKey(base)).not.toBe(
      createVerticalDramaSpeakerPeopleDetectionDedupeKey({
        ...base,
        sourceMediaAssetId: "885",
      })
    );
  });

  it("omits undefined optional diagnostics before persisting worker output", () => {
    const parsed = verticalDramaSpeakerPeopleDetectionResultSchema.parse({
      people: [],
      suggestions: [],
      creditsUsed: 0,
      model: "test-model",
      sourceMediaAssetId: "884",
      appearanceProfileStatus: "reused",
      appearanceProfileShotCount: 2,
      appearanceProfileTotalShotCount: 2,
      appearanceProfileSkippedShotNumbers: [],
      attributionIssue: undefined,
    });

    const safeOutput = omitUndefinedJobPayloadProperties(parsed);

    expect(safeOutput).not.toHaveProperty("attributionIssue");
    expect(() =>
      validateBoundedPayload(safeOutput, "result.output")
    ).not.toThrow();
  });
});
