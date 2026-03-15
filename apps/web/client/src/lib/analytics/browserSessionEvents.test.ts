import { describe, expect, it } from "vitest";

import {
  setBrowserSessionEventEmitterForTests,
  trackBrowserSessionMobileObserveOnlySeen,
  trackBrowserSessionOpened,
  trackBrowserSessionTakeControlBlocked,
} from "./browserSessionEvents";

describe("browserSessionEvents", () => {
  it("emits Browser Session analytics payloads with low-cardinality fields", () => {
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];

    setBrowserSessionEventEmitterForTests((event, payload) => {
      events.push({ event, payload: payload as Record<string, unknown> });
    });

    trackBrowserSessionOpened({
      origin_surface: "chat",
      compact_layout: false,
      session_kind: "created",
      launch_path: "suggested",
      launch_intent: "research_in_browser",
    });
    trackBrowserSessionTakeControlBlocked({
      origin_surface: "automation",
      compact_layout: true,
      reason_category: "step_up",
    });
    trackBrowserSessionMobileObserveOnlySeen({
      origin_surface: "agency",
      compact_layout: true,
    });

    expect(events).toEqual([
      {
        event: "browser_session_opened",
        payload: {
          origin_surface: "chat",
          compact_layout: false,
          session_kind: "created",
          launch_path: "suggested",
          launch_intent: "research_in_browser",
        },
      },
      {
        event: "browser_session_take_control_blocked",
        payload: {
          origin_surface: "automation",
          compact_layout: true,
          reason_category: "step_up",
        },
      },
      {
        event: "browser_session_mobile_observe_only_seen",
        payload: {
          origin_surface: "agency",
          compact_layout: true,
        },
      },
    ]);

    setBrowserSessionEventEmitterForTests(null);
  });
});
