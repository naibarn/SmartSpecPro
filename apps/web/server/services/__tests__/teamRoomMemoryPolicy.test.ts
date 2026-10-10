import { describe, expect, it } from "vitest";
import {
  filterPromptScopesWithoutTeamRoomMemory,
  isTeamRoomMemoryEnabled,
  isTeamRoomMemoryPromptEligible,
} from "../teamRoomMemoryPolicy";

describe("team-room persistent memory policy", () => {
  it("remains disabled until source provenance and isolation are accepted", () => {
    expect(isTeamRoomMemoryEnabled()).toBe(false);
  });

  it("removes room, team, and run scopes while preserving independent scopes", () => {
    expect(
      filterPromptScopesWithoutTeamRoomMemory([
        { type: "agent", id: "assistant-1" },
        { type: "room", id: "room-1" },
        { type: "team", id: "team-1" },
        { type: "project", id: "project-1" },
        { type: "user", id: "7" },
      ])
    ).toEqual([
      { type: "agent", id: "assistant-1" },
      { type: "project", id: "project-1" },
      { type: "user", id: "7" },
    ]);
  });

  it("excludes room/team rows and room-derived projections from prompt use", () => {
    expect(
      isTeamRoomMemoryPromptEligible({ ownerType: "room", sourceRoomId: null })
    ).toBe(false);
    expect(
      isTeamRoomMemoryPromptEligible({ ownerType: "team", sourceRoomId: null })
    ).toBe(false);
    expect(
      isTeamRoomMemoryPromptEligible({
        ownerType: "run",
        sourceRoomId: null,
      })
    ).toBe(false);
    expect(
      isTeamRoomMemoryPromptEligible({
        ownerType: "project",
        sourceRoomId: null,
      })
    ).toBe(true);
  });
});
