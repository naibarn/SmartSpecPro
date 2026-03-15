import { describe, expect, it } from "vitest";

import { detectBrowserSessionLaunchSuggestion } from "./browserSessionInvocation";

describe("browserSessionInvocation", () => {
  it("detects research-oriented browser requests in Thai", () => {
    expect(detectBrowserSessionLaunchSuggestion({
      message: "ช่วยหาโรงแรมในเว็บแล้วเปรียบเทียบราคาให้หน่อย",
      originSurface: "chat",
      sourceId: "12",
    })).toMatchObject({
      originSurface: "chat",
      sourceId: "12",
      launchIntent: "research_in_browser",
      title: "Research in Browser",
    });
  });

  it("detects login and captcha flows as continue-in-browser", () => {
    expect(detectBrowserSessionLaunchSuggestion({
      message: "Open browser and continue with login because this site has captcha",
      originSurface: "agency",
      sourceId: "agency-1",
    })).toMatchObject({
      originSurface: "agency",
      sourceId: "agency-1",
      launchIntent: "continue_in_browser",
      title: "Continue in Browser",
    });
  });

  it("returns null for regular chat without browser intent", () => {
    expect(detectBrowserSessionLaunchSuggestion({
      message: "Summarize the notes from this meeting",
      originSurface: "chat",
      sourceId: "12",
    })).toBeNull();
  });
});
