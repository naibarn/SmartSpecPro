import { describe, it, expect } from "vitest";
import {
  teamRooms,
  teamRoomParticipants,
  teamRoomMessages,
  teamRuns,
  agentActivityEvents,
  agentRunSummaries,
  runSnapshots,
  orchestratorNotifications,
  teamRoomTypeEnum,
  teamRoomStatusEnum,
  roomParticipantTypeEnum,
  roomMessageSenderTypeEnum,
  roomMessageRecipientTypeEnum,
  roomMessageTurnTypeEnum,
  roomMessageVisibilityEnum,
  teamRunStatusEnum,
  teamRunExecutionModeEnum,
  agentEventCategoryEnum,
  notificationSeverityEnum,
} from "../../../drizzle/schema";

describe("Room & Message Schema (section 02)", () => {
  describe("team_rooms", () => {
    it("exports teamRooms pgTable with all required columns", () => {
      const cols = Object.keys(teamRooms);
      expect(cols).toContain("id");
      expect(cols).toContain("tenantId");
      expect(cols).toContain("teamId");
      expect(cols).toContain("orchestratorUserId");
      expect(cols).toContain("roomType");
      expect(cols).toContain("title");
      expect(cols).toContain("goalPrompt");
      expect(cols).toContain("status");
      expect(cols).toContain("viewMode");
      expect(cols).toContain("lastRunId");
    });

    it("roomType enum contains all expected values", () => {
      expect(teamRoomTypeEnum.enumValues).toEqual([
        "direct", "team", "auto_team", "job_review",
      ]);
    });

    it("roomStatus enum contains all expected values", () => {
      expect(teamRoomStatusEnum.enumValues).toEqual([
        "active", "archived", "paused",
      ]);
    });
  });

  describe("team_room_participants", () => {
    it("exports teamRoomParticipants with roomId and participantType", () => {
      const cols = Object.keys(teamRoomParticipants);
      expect(cols).toContain("id");
      expect(cols).toContain("roomId");
      expect(cols).toContain("participantType");
      expect(cols).toContain("participantUserId");
      expect(cols).toContain("participantAssistantId");
      expect(cols).toContain("isMuted");
      expect(cols).toContain("canWriteSharedMemory");
      expect(cols).toContain("lastViewedAt");
    });

    it("participantType enum contains all expected values", () => {
      expect(roomParticipantTypeEnum.enumValues).toEqual([
        "user", "assistant", "observer",
      ]);
    });
  });

  describe("team_room_messages", () => {
    it("has all expected columns", () => {
      const cols = Object.keys(teamRoomMessages);
      expect(cols).toContain("id");
      expect(cols).toContain("roomId");
      expect(cols).toContain("runId");
      expect(cols).toContain("senderType");
      expect(cols).toContain("senderAssistantId");
      expect(cols).toContain("recipientType");
      expect(cols).toContain("turnType");
      expect(cols).toContain("visibility");
      expect(cols).toContain("content");
      expect(cols).toContain("summaryContent");
      expect(cols).toContain("tokenUsageJson");
    });

    it("visibility enum contains all expected values", () => {
      expect(roomMessageVisibilityEnum.enumValues).toEqual([
        "transparent", "milestone", "summary_only", "private_internal",
      ]);
    });

    it("turnType enum contains all expected values", () => {
      expect(roomMessageTurnTypeEnum.enumValues).toEqual([
        "discussion", "handoff", "review", "decision", "execution_update", "summary",
      ]);
    });

    it("recipientType enum contains all expected values", () => {
      expect(roomMessageRecipientTypeEnum.enumValues).toEqual([
        "all", "assistant", "subgroup", "user",
      ]);
    });

    it("senderType enum contains all expected values", () => {
      expect(roomMessageSenderTypeEnum.enumValues).toEqual([
        "user", "assistant", "system",
      ]);
    });
  });
});

describe("Run & Execution Schema (section 02)", () => {
  describe("team_runs", () => {
    it("exports teamRuns pgTable with all required columns", () => {
      const cols = Object.keys(teamRuns);
      expect(cols).toContain("id");
      expect(cols).toContain("roomId");
      expect(cols).toContain("teamId");
      expect(cols).toContain("status");
      expect(cols).toContain("executionMode");
      expect(cols).toContain("objective");
      expect(cols).toContain("stopPolicyJson");
      expect(cols).toContain("budgetSnapshotJson");
      expect(cols).toContain("activeAssistantId");
      expect(cols).toContain("startedAt");
      expect(cols).toContain("endedAt");
    });

    it("runStatus enum contains all expected values", () => {
      expect(teamRunStatusEnum.enumValues).toEqual([
        "queued", "running", "paused", "completed", "failed", "stopped",
      ]);
    });

    it("executionMode enum contains all expected values", () => {
      expect(teamRunExecutionModeEnum.enumValues).toEqual([
        "team_chat", "auto_team", "review",
      ]);
    });
  });
});

describe("Monitoring Schema (section 02)", () => {
  describe("agent_activity_events", () => {
    it("exports agentActivityEvents with all expected columns", () => {
      const cols = Object.keys(agentActivityEvents);
      expect(cols).toContain("id");
      expect(cols).toContain("runId");
      expect(cols).toContain("assistantId");
      expect(cols).toContain("eventType");
      expect(cols).toContain("eventCategory");
      expect(cols).toContain("visibility");
      expect(cols).toContain("detailJson");
      expect(cols).toContain("tokenUsageSnapshot");
      expect(cols).toContain("costSnapshot");
      expect(cols).toContain("durationMs");
      // No updatedAt — append-only by design
      expect(cols).not.toContain("updatedAt");
    });

    it("eventCategory enum contains all expected values", () => {
      expect(agentEventCategoryEnum.enumValues).toEqual([
        "status_change", "communication", "tool_use", "memory_op",
        "artifact_op", "handoff", "approval", "error",
      ]);
    });
  });

  describe("agent_run_summaries", () => {
    it("exports agentRunSummaries with performance fields", () => {
      const cols = Object.keys(agentRunSummaries);
      expect(cols).toContain("id");
      expect(cols).toContain("runId");
      expect(cols).toContain("assistantId");
      expect(cols).toContain("turnCount");
      expect(cols).toContain("totalInputTokens");
      expect(cols).toContain("totalOutputTokens");
      expect(cols).toContain("totalCostCredits");
      expect(cols).toContain("toolCallCount");
      expect(cols).toContain("memoriesRead");
      expect(cols).toContain("memoriesWritten");
      expect(cols).toContain("errorCount");
    });
  });

  describe("run_snapshots", () => {
    it("exports runSnapshots with state capture fields", () => {
      const cols = Object.keys(runSnapshots);
      expect(cols).toContain("id");
      expect(cols).toContain("runId");
      expect(cols).toContain("capturedAt");
      expect(cols).toContain("activeAssistantId");
      expect(cols).toContain("agentStatusesJson");
      expect(cols).toContain("tokenUsageJson");
      expect(cols).toContain("costJson");
      expect(cols).toContain("pendingApprovalsCount");
    });
  });

  describe("orchestrator_notifications", () => {
    it("exports orchestratorNotifications with all fields", () => {
      const cols = Object.keys(orchestratorNotifications);
      expect(cols).toContain("id");
      expect(cols).toContain("tenantId");
      expect(cols).toContain("userId");
      expect(cols).toContain("notificationType");
      expect(cols).toContain("severity");
      expect(cols).toContain("title");
      expect(cols).toContain("body");
      expect(cols).toContain("isRead");
      expect(cols).toContain("isDismissed");
      expect(cols).toContain("actionUrl");
    });

    it("severity enum contains all expected values", () => {
      expect(notificationSeverityEnum.enumValues).toEqual([
        "info", "warning", "error", "critical",
      ]);
    });
  });
});
