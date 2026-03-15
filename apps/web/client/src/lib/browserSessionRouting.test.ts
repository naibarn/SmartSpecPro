import { describe, expect, it } from "vitest";

import {
  buildBrowserSessionPath,
  parseBrowserSessionLaunchContext,
  resolveBrowserSessionReturnPath,
} from "./browserSessionRouting";

describe("browser session routing", () => {
  it("round-trips launch context through the automation route", () => {
    const path = buildBrowserSessionPath("lbs_demo_123", {
      originSurface: "chat",
      originLabel: "Chat",
      sourceId: "44",
      returnContext: {
        path: "/chat?c=44",
        label: "Return to Chat",
      },
    });

    const [, search = ""] = path.split("?");
    const parsed = parseBrowserSessionLaunchContext(`?${search}`);

    expect(parsed).toMatchObject({
      originSurface: "chat",
      sourceId: "44",
      returnContext: {
        path: "/chat?c=44",
      },
    });
  });

  it("uses explicit return paths before surface defaults", () => {
    const returnPath = resolveBrowserSessionReturnPath({
      originSurface: "workflow",
      sourceId: "98",
      returnContext: {
        path: "/workflows/editor/98?focus=execution",
        label: "Return to Workflow",
      },
    });

    expect(returnPath).toBe("/workflows/editor/98?focus=execution");
  });

  it("falls back to the origin surface when launch metadata is stale", () => {
    const returnPath = resolveBrowserSessionReturnPath({
      originSurface: "agency",
      sourceId: "agency-123",
      returnContext: {
        path: "https://example.com/not-allowed",
        label: "Unsafe",
      } as never,
    });

    expect(returnPath).toBe("/agencies/agency-123");
  });
});

