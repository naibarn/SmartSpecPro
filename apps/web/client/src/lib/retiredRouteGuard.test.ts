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
  ])("blocks %s", path => {
    expect(isRetiredRoute(path)).toBe(true);
  });

  it.each(["/", "/dashboard", "/chat", "/worker-jobs", "/marketplace"]) (
    "keeps %s available",
    path => {
      expect(isRetiredRoute(path)).toBe(false);
    },
  );
});
