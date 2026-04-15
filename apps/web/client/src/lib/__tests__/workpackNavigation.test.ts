import { describe, expect, it } from "vitest";

import {
  WORKPACK_ROUTES,
  buildWorkpackDetailHref,
  buildWorkpackEntrypointHref,
  describeWorkpackEntrypoint,
} from "../workpackNavigation";

describe("workpackNavigation", () => {
  it("builds canonical workpack routes", () => {
    expect(WORKPACK_ROUTES.intake).toBe("/workpacks/intake");
    expect(buildWorkpackDetailHref("wp_1")).toBe("/workpacks/wp_1");
    expect(buildWorkpackDetailHref("wp_1", "replay")).toBe("/workpacks/wp_1/replay");
  });

  it("preserves entrypoint context in deep links", () => {
    expect(buildWorkpackEntrypointHref({
      entrypoint: "chat",
      workpackId: "wp_1",
      surface: "detail",
    })).toBe("/workpacks/wp_1?entrypoint=chat");
    expect(describeWorkpackEntrypoint("desktop_open")).toContain("desktop");
  });
});
