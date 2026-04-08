import { describe, expect, it } from "vitest";

import { resolveVoiceActionIntent } from "../voiceActionResolver";

describe("resolveVoiceActionIntent", () => {
  it("maps allowlisted chat navigation commands", () => {
    expect(resolveVoiceActionIntent("open chat")).toMatchObject({
      type: "navigate",
      path: "/chat",
    });
  });

  it("maps allowlisted notification read commands", () => {
    expect(resolveVoiceActionIntent("อ่านข้อความเตือนให้ที")).toMatchObject({
      type: "read_notifications",
      originalText: "อ่านข้อความเตือนให้ที",
      unreadOnly: false,
      urgentOnly: false,
    });
  });

  it("maps nearby search commands to confirmation-gated chat submission", () => {
    expect(resolveVoiceActionIntent("search nearby restaurants")).toEqual({
      type: "submit_chat",
      text: "search nearby restaurants",
      originalText: "search nearby restaurants",
      useLocation: true,
      requiresConfirmation: true,
      actionLabel: "Submit Search With Location Context",
    });
  });

  it("maps reminder commands to confirmation-gated chat submission", () => {
    expect(resolveVoiceActionIntent("remind me tomorrow at 8 to call Mali")).toEqual({
      type: "submit_chat",
      text: "remind me tomorrow at 8 to call Mali",
      originalText: "remind me tomorrow at 8 to call Mali",
      useLocation: false,
      requiresConfirmation: true,
      actionLabel: "Submit Reminder Or Schedule",
    });
  });

  it("extracts team-room navigation", () => {
    expect(resolveVoiceActionIntent("open team room backlog in team growth")).toEqual({
      type: "open_team_room",
      teamQuery: "growth",
      roomQuery: "backlog",
      originalText: "open team room backlog in team growth",
    });
  });

  it("extracts draft message actions", () => {
    expect(resolveVoiceActionIntent("draft message to Mali about the meeting")).toEqual({
      type: "draft_message",
      text: "draft message to Mali about the meeting",
      targetLabel: "Mali about the meeting",
      originalText: "draft message to Mali about the meeting",
      requiresConfirmation: true,
    });
  });

  it("marks notifications read with confirmation", () => {
    expect(resolveVoiceActionIntent("mark notifications as read")).toEqual({
      type: "mark_notifications_read",
      originalText: "mark notifications as read",
      requiresConfirmation: true,
    });
  });

  it("falls back to plain chat text for unknown actions", () => {
    expect(resolveVoiceActionIntent("hello there assistant")).toEqual({
      type: "chat_text",
      text: "hello there assistant",
    });
  });
});
