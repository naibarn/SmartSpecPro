import { describe, test, expect } from "vitest";
import * as schema from "../schema";

describe("Drizzle Schema Exports", () => {
  test("exports Feature 175 audio tables", () => {
    expect(schema.verticalDramaSeriesSoundBibles).toBeDefined();
    expect(schema.verticalDramaAudioQcReports).toBeDefined();
    expect(schema.verticalDramaAudioManifests).toBeDefined();
  });

  test("exports core Vertical Drama series and episode tables", () => {
    expect(schema.verticalDramaSeries).toBeDefined();
    expect(schema.verticalDramaEpisodes).toBeDefined();
  });
});
