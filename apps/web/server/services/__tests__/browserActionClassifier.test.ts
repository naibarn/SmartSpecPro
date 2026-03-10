import { describe, expect, it } from "vitest";

import { classifyBrowserAction } from "../browserActionClassifier";

describe("browser action classifier", () => {
  it("maps read actions deterministically", () => {
    expect(classifyBrowserAction({ actionType: "navigate" })).toEqual({
      actionClass: "read",
      confidence: 0.99,
      reasonCodes: ["read_action"],
    });
  });

  it("maps draft actions deterministically", () => {
    expect(classifyBrowserAction({ actionType: "fill" })).toEqual({
      actionClass: "draft",
      confidence: 0.92,
      reasonCodes: ["draft_action"],
    });
  });

  it("maps commit actions deterministically", () => {
    expect(classifyBrowserAction({ actionType: "submit_form" })).toEqual({
      actionClass: "commit",
      confidence: 0.95,
      reasonCodes: ["commit_action"],
    });
  });

  it("treats uploads and clipboard actions as restricted", () => {
    expect(classifyBrowserAction({ actionType: "upload" }).actionClass).toBe("restricted");
    expect(classifyBrowserAction({ actionType: "copy", touchesClipboard: true }).actionClass).toBe("restricted");
  });

  it("downgrades unknown action types to low-confidence read", () => {
    expect(classifyBrowserAction({ actionType: "do_magic" })).toEqual({
      actionClass: "read",
      confidence: 0.35,
      reasonCodes: ["unknown_action_type"],
    });
  });
});
