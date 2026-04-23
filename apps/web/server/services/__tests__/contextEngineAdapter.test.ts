import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../executors/contextBuilder", () => ({
  buildChatContext: vi.fn(),
  buildTeamContext: vi.fn(),
}));

import {
  buildContextStateMessages,
  buildChatExecutionContextPack,
  buildTeamExecutionContextPack,
  classifyContextEngineStatus,
  extractContextHintsFromDynamicParams,
  mergeContextStateHints,
  evaluateContextPack,
  evaluateContextStateHints,
} from "../contextEngineAdapter";
import { buildChatContext, buildTeamContext } from "../executors/contextBuilder";

const mockBuildChatContext = vi.mocked(buildChatContext);
const mockBuildTeamContext = vi.mocked(buildTeamContext);

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    channel: "chat" as const,
    userId: 1,
    tenantId: "tenant-1",
    userMessage: "Search the project state",
    conversationContext: null,
    teamContext: {
      assistantId: "assistant-1",
      roomId: "room-1",
      teamId: "team-1",
      runId: "run-1",
      objective: "Search the project state",
      currentMessage: "Search the project state",
      initiatedByUserId: 1,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextEngineAdapter", () => {
  it("extracts context hints from nested dynamic params", () => {
    const hints = extractContextHintsFromDynamicParams({
      contextState: {
        active_note: {
          title: "Current ask",
          content: "Search the project state",
          source: "work_item",
          refs: ["work-1"],
        },
        recent_notes: [
          {
            title: "Recent 1",
            content: "Remember the brand tone",
          },
          {
            title: "Recent 2",
            content: "Remember the brand tone",
          },
        ],
        project_state: {
          title: "Project state",
          summary: "The project is in review.",
        },
      },
    });

    expect(hints?.activeNote?.title).toBe("Current ask");
    expect(hints?.activeNote?.content).toContain("Search the project state");
    expect(hints?.recentNotes).toHaveLength(2);
    expect(hints?.projectState?.content).toContain("The project is in review.");
  });

  it("renders context state blocks as reusable system messages", () => {
    const messages = buildContextStateMessages({
      activeNote: {
        title: "Current ask",
        content: "Search the project state",
      },
      projectState: {
        title: "Project state",
        content: "The project is in review.",
      },
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("[ACTIVE NOTE]");
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("[PROJECT STATE]");
  });

  it("merges upstream and override hints without dropping tool results", () => {
    const merged = mergeContextStateHints(
      {
        toolResults: [
          {
            title: "Upstream tool result",
            content: "Drive file: Songkran outline",
            source: "mcp",
          },
        ],
        recentNotes: [
          {
            title: "Recent note",
            content: "Keep the warm tone.",
          },
        ],
      },
      {
        activeNote: {
          title: "Current ask",
          content: "Draft a new opening",
        },
        recentNotes: [
          {
            title: "Recent note",
            content: "Keep the warm tone.",
          },
          {
            title: "Recent note 2",
            content: "Add a stronger cultural hook.",
          },
        ],
      },
    );

    expect(merged?.activeNote).toMatchObject({
      title: "Current ask",
      content: "Draft a new opening",
    });
    expect(merged?.toolResults).toHaveLength(1);
    expect(merged?.toolResults?.[0]?.content).toContain("Songkran outline");
    expect(merged?.recentNotes).toHaveLength(2);
  });

  it("buildChatExecutionContextPack injects state blocks and keeps the chat prompt intact", async () => {
    mockBuildChatContext.mockResolvedValue([
      { role: "system", content: "You are a helpful writer." },
      { role: "user", content: "Search the project state" },
    ] as any);

    const pack = await buildChatExecutionContextPack(makeRequest(), {
      skillSystemPrompt: "You are a helpful writer.",
      knowledgebase: null,
      dynamicParams: {
        contextState: {
          activeNote: {
            title: "Current ask",
            content: "Search the project state",
          },
          projectState: {
            title: "Project state",
            content: "The project is in review.",
          },
        },
      },
    });

    expect(mockBuildChatContext).toHaveBeenCalledOnce();
    expect(pack.surface).toBe("chat");
    expect(pack.intent).toBe("retrieval");
    expect(pack.messages[0]).toEqual({
      role: "system",
      content: "You are a helpful writer.",
    });
    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[ACTIVE NOTE]"),
      ),
    ).toBe(true);
    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[PROJECT STATE]"),
      ),
    ).toBe(true);
    expect(pack.slots.some((slot) => slot.kind === "active_note")).toBe(true);
    expect(pack.slots.some((slot) => slot.kind === "project_state")).toBe(true);
    expect(pack.retrievalModes).toContain("semantic");
    expect(pack.retrievalModes).toContain("lexical");
    expect(pack.estimatedTokens).toBeGreaterThan(0);
  });

  it("buildChatExecutionContextPack merges request and override context params", async () => {
    mockBuildChatContext.mockResolvedValue([
      { role: "system", content: "You are a helpful writer." },
      { role: "user", content: "Search the project state" },
    ] as any);

    const pack = await buildChatExecutionContextPack(
      makeRequest({
        dynamicParams: {
          contextState: {
            toolResults: [
              {
                title: "Upstream tool result",
                content: "Drive file: Songkran outline",
              },
            ],
          },
        },
      }),
      {
        skillSystemPrompt: "You are a helpful writer.",
        knowledgebase: null,
        dynamicParams: {
          contextState: {
            activeNote: {
              title: "Current ask",
              content: "Draft a new opening",
            },
          },
        },
      },
    );

    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[ACTIVE NOTE]"),
      ),
    ).toBe(true);
    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[TOOL RESULT]"),
      ),
    ).toBe(true);
  });

  it("buildTeamExecutionContextPack prepends the skill prompt and places state before the objective", async () => {
    mockBuildTeamContext.mockResolvedValue([
      { role: "system", content: "Room language: English." },
      { role: "system", content: "Team members available: Director." },
      { role: "user", content: "[OBJECTIVE]\nWrite a report about AI trends" },
      { role: "assistant", content: "Draft outline" },
    ] as any);

    const pack = await buildTeamExecutionContextPack(
      makeRequest({
        channel: "team_room",
      }),
      "tenant-1",
      {
        skillSystemPrompt: "You are a team orchestrator.",
        dynamicParams: {
          contextState: {
            workingSummary: {
              title: "Latest summary",
              content: "The team decided to focus on the trend section first.",
            },
            recentNotes: [
              {
                title: "Recent note",
                content: "Keep the tone concise.",
              },
              {
                title: "Recent note",
                content: "Keep the tone concise.",
              },
            ],
          },
        },
      },
    );

    expect(mockBuildTeamContext).toHaveBeenCalledOnce();
    expect(pack.surface).toBe("team_room");
    expect(pack.intent).toBe("retrieval");
    expect(pack.messages[0]).toEqual({
      role: "system",
      content: "You are a team orchestrator.",
    });
    const workingSummaryIndex = pack.messages.findIndex(
      (message) =>
        message.role === "system" &&
        typeof message.content === "string" &&
        message.content.includes("[WORKING SUMMARY]"),
    );
    const objectiveIndex = pack.messages.findIndex(
      (message) =>
        message.role === "user" &&
        typeof message.content === "string" &&
        message.content.includes("[OBJECTIVE]"),
    );

    expect(workingSummaryIndex).toBeGreaterThan(0);
    expect(workingSummaryIndex).toBeLessThan(objectiveIndex);
    expect(
      pack.messages.filter(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[RECENT NOTES]"),
      ),
    ).toHaveLength(1);
    expect(pack.slots.some((slot) => slot.kind === "working_summary")).toBe(true);
    expect(pack.compaction.injectedMessages).toBeGreaterThan(0);
    expect(pack.compaction.tokenHeadroom).toBeGreaterThanOrEqual(0);
  });

  it("buildTeamExecutionContextPack merges runtime session state with override hints", async () => {
    mockBuildTeamContext.mockResolvedValue([
      { role: "system", content: "Room language: English." },
      { role: "system", content: "Team members available: Director." },
      { role: "user", content: "[OBJECTIVE]\nWrite a report about AI trends" },
      { role: "assistant", content: "Draft outline" },
    ] as any);

    const pack = await buildTeamExecutionContextPack(
      makeRequest({
        channel: "team_room",
        dynamicParams: {
          contextState: {
            sessionState: {
              title: "Session state",
              content: "Session keeps the room steady.",
            },
          },
        },
      }),
      "tenant-1",
      {
        skillSystemPrompt: "You are a team orchestrator.",
        dynamicParams: {
          contextState: {
            toolResults: [
              {
                title: "Upstream tool result",
                content: "Drive file: Songkran outline",
              },
            ],
          },
        },
      },
    );

    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[SESSION STATE]"),
      ),
    ).toBe(true);
    expect(
      pack.messages.some(
        (message) =>
          message.role === "system" &&
          typeof message.content === "string" &&
          message.content.includes("[TOOL RESULT]"),
      ),
    ).toBe(true);
  });

  it("evaluates pack and state-only context metrics for monitoring", async () => {
    mockBuildChatContext.mockResolvedValue([
      { role: "system", content: "You are a helpful writer." },
      { role: "user", content: "Search the project state" },
      { role: "assistant", content: "The current summary is stable." },
    ] as any);

    const pack = await buildChatExecutionContextPack(makeRequest(), {
      skillSystemPrompt: "You are a helpful writer.",
      knowledgebase: null,
      dynamicParams: {
        contextState: {
          activeNote: {
            title: "Current ask",
            content: "Search the project state",
          },
          projectState: {
            title: "Project state",
            content: "The project is in review.",
          },
          workingSummary: {
            title: "Working summary",
            content: "The current summary is stable.",
          },
          durableMemory: [
            {
              title: "Preference",
              content: "Keep responses concise.",
              freshness: "stale",
            },
          ],
        },
      },
    });

    const evaluation = evaluateContextPack(pack);
    expect(evaluation.totalSlots).toBeGreaterThan(0);
    expect(evaluation.activeNoteSlots).toBeGreaterThan(0);
    expect(evaluation.projectStateSlots).toBeGreaterThan(0);
    expect(evaluation.workingSummarySlots).toBeGreaterThan(0);
    expect(evaluation.staleSlots).toBeGreaterThanOrEqual(0);
    expect(evaluation.groundingScore).toBeGreaterThan(0);
    expect(evaluation.retrievalCoverage).toBeGreaterThanOrEqual(0);
    expect(classifyContextEngineStatus({
      groundingScore: evaluation.groundingScore,
      staleContextRatio: evaluation.staleContextRatio,
      tokenHeadroom: evaluation.tokenHeadroom,
      retrievalCoverage: evaluation.retrievalCoverage,
    })).not.toBe("critical");

    const stateOnly = evaluateContextStateHints({
      activeNote: {
        title: "Current ask",
        content: "Search the project state",
      },
      projectState: {
        title: "Project state",
        content: "The project is in review.",
      },
      recentNotes: [
        {
          title: "Recent note",
          content: "Keep the tone concise.",
        },
      ],
    });
    expect(stateOnly.injectedMessages).toBe(3);
    expect(stateOnly.groundingScore).toBeGreaterThan(0);
    expect(stateOnly.tokenHeadroom).toBeGreaterThan(0);
  });
});
