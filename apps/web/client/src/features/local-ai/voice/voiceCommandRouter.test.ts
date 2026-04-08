import { describe, expect, it } from "vitest";

import { routeVoiceCommand } from "./voiceCommandRouter";

describe("routeVoiceCommand", () => {
  it("maps navigation commands to allowlisted routes", () => {
    expect(routeVoiceCommand("open chat")).toMatchObject({
      type: "navigate",
      path: "/chat",
    });
  });

  it("maps search nearby commands with confirmation", () => {
    expect(routeVoiceCommand("search nearby restaurants")).toEqual({
      type: "submit_chat",
      text: "search nearby restaurants",
      originalText: "search nearby restaurants",
      useLocation: true,
      requiresConfirmation: true,
      actionLabel: "Submit Search With Location Context",
    });
  });

  it("maps reminder commands to confirmation-gated chat submissions", () => {
    expect(routeVoiceCommand("remind me tomorrow at 8 to send the report")).toEqual({
      type: "submit_chat",
      text: "remind me tomorrow at 8 to send the report",
      originalText: "remind me tomorrow at 8 to send the report",
      useLocation: false,
      requiresConfirmation: true,
      actionLabel: "Submit Reminder Or Schedule",
    });
  });

  it("extracts specific team room navigation", () => {
    expect(routeVoiceCommand("open team room backlog in team growth")).toEqual({
      type: "open_team_room",
      roomQuery: "backlog",
      teamQuery: "growth",
      originalText: "open team room backlog in team growth",
    });
  });

  it("extracts draft message commands", () => {
    expect(routeVoiceCommand("draft message to Mali about the meeting")).toEqual({
      type: "draft_message",
      text: "draft message to Mali about the meeting",
      targetLabel: "Mali about the meeting",
      originalText: "draft message to Mali about the meeting",
      requiresConfirmation: true,
    });
  });

  it("maps read notifications commands", () => {
    expect(routeVoiceCommand("read my notifications")).toEqual({
      type: "read_notifications",
      originalText: "read my notifications",
      unreadOnly: false,
      urgentOnly: false,
    });
  });

  it("maps mark notifications read commands", () => {
    expect(routeVoiceCommand("mark notifications as read")).toEqual({
      type: "mark_notifications_read",
      originalText: "mark notifications as read",
      requiresConfirmation: true,
    });
  });

  it("keeps unknown dictation as composer text", () => {
    expect(routeVoiceCommand("hello there assistant")).toEqual({
      type: "chat_text",
      text: "hello there assistant",
    });
  });
});
