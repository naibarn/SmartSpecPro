import { describe, expect, it } from "vitest";

import {
  buildPreflightRevisionFingerprint,
  comparePreflightRevision,
} from "../preflightRevisionService";

describe("preflightRevisionService", () => {
  it("normalizes list ordering before hashing", () => {
    const a = buildPreflightRevisionFingerprint({
      requestTitle: "Launch",
      requestObjective: "Create assets",
      linkedConversationIds: ["chat-b", "chat-a"],
      generatedAt: "2026-04-21T00:00:00.000Z",
    });
    const b = buildPreflightRevisionFingerprint({
      requestTitle: "Launch",
      requestObjective: "Create assets",
      linkedConversationIds: ["chat-a", "chat-b"],
      generatedAt: "2026-04-21T00:01:00.000Z",
    });

    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.inputs.linkedConversationIds).toEqual(["chat-a", "chat-b"]);
  });

  it("detects stale previews after request mutations", () => {
    const approved = buildPreflightRevisionFingerprint({
      requestTitle: "Launch",
      requestObjective: "Create assets",
    });
    const current = buildPreflightRevisionFingerprint({
      requestTitle: "Launch v2",
      requestObjective: "Create assets",
    });

    expect(comparePreflightRevision(approved, current)).toEqual(
      expect.objectContaining({
        stale: true,
        reasonCode: "revision_mismatch",
      }),
    );
  });
});
