import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaPlanningState,
  readVerticalDramaPlanningState,
} from "../planningState";

describe("vertical drama planning state", () => {
  it("builds a compact planning shell projection", () => {
    const state = buildVerticalDramaPlanningState({
      now: "2026-08-22T00:00:00.000Z",
      activeStep: "basic",
      draftSessionId: "draft-session",
    });
    expect(state).toMatchObject({
      version: 1,
      revision: 0,
      status: "planning",
      activeStep: "basic",
      draftSessionId: "draft-session",
    });
    expect(state).not.toHaveProperty("history");
  });

  it("rejects malformed state instead of rehydrating an unsafe snapshot", () => {
    expect(
      readVerticalDramaPlanningState({
        planningState: {
          version: 1,
          revision: -1,
          status: "planning",
          lastSavedAt: "2026-08-22T00:00:00.000Z",
        },
      })
    ).toBeNull();
  });

  it("reads only the compact canonical projection", () => {
    expect(
      readVerticalDramaPlanningState({
        planningState: {
          version: 1,
          revision: 3,
          status: "confirmed",
          activeDraft: {
            fingerprint: "a".repeat(64),
            confirmedAt: "2026-08-22T00:00:00.000Z",
          },
          lastSavedAt: "2026-08-22T00:00:00.000Z",
          history: [{ huge: true }],
        },
      })
    ).toMatchObject({ revision: 3, status: "confirmed" });
  });
});
