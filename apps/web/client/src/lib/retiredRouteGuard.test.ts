import { describe, expect, it } from "vitest";
import { isRetiredRoute } from "./retiredRouteGuard";

describe("isRetiredRoute", () => {
  it.each([
    "/agencies",
    "/agencies/123/edit",
    "/work/request?requestId=123",
    "/workflows/gallery",
    "/workpacks/demo/replay",
    "/admin/sandbox",
    "/docker",
    "/docker-redirect",
    "/disaster",
    "/disaster/map",
    "/dashboard/emergency",
    "/dashboard/emergency/command",
  ])("blocks %s", path => {
    expect(isRetiredRoute(path)).toBe(true);
  });

  it.each(["/", "/dashboard", "/chat", "/worker-jobs", "/marketplace", "/dashboard/emergency-other"]) (
    "keeps %s available",
    path => {
      expect(isRetiredRoute(path)).toBe(false);
    },
  );
});
