/**
 * Team Work Item tRPC Router — backlog/revision lifecycle with room mirroring.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as workItemService from "../services/workItemService";
import * as roomService from "../services/roomService";
import {
  buildAutoTeamStepResultContent,
  buildAutoTeamStepResultMetadata,
} from "../services/autoTeamRoomMessages";

const artifactRefSchema = z.object({
  artifactId: z.string().optional(),
  label: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  url: z.string().optional(),
});

const citationRefSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  note: z.string().optional(),
});

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

function defaultLifecycleContent(params: {
  action: "create" | "revision" | "approved" | "rejected" | "workflow";
  title: string;
  revisionVersion?: number;
  reason?: string;
  targetStep?: workItemService.WorkItemWorkflowStep;
}): string {
  switch (params.action) {
    case "create":
      return `Created work item: ${params.title}`;
    case "revision":
      return `Submitted revision v${params.revisionVersion ?? "?"}: ${params.title}`;
    case "approved":
      return `Approved work item revision v${params.revisionVersion ?? "?"}: ${params.title}`;
    case "rejected":
      return params.reason
        ? `Rejected work item revision v${params.revisionVersion ?? "?"}: ${params.reason}`
        : `Rejected work item revision v${params.revisionVersion ?? "?"}: ${params.title}`;
    case "workflow":
      return `Routed work item to ${params.targetStep ?? "next"} stage: ${params.title}`;
    default:
      return params.title;
  }
}

async function mirrorSystemWorkUpdate(params: {
  tenantId: string;
  userId: number;
  workItem: Awaited<ReturnType<typeof workItemService.getWorkItem>>;
  messageType: roomService.WorkUpdateMessageType;
  content: string;
  replyToMessageId?: string;
  citationRefs?: roomService.WorkCitationRef[];
  artifactRefs?: roomService.WorkArtifactRef[];
  metadataJson?: Record<string, unknown>;
}): Promise<Awaited<ReturnType<typeof roomService.sendMessage>>> {
  const prepared = roomService.prepareWorkUpdate({
    roomId: params.workItem.roomId,
    tenantId: params.tenantId,
    senderAssistantId: "system",
    content: params.content,
    runId: params.workItem.runId ?? undefined,
    workItemId: params.workItem.id,
    messageType: params.messageType,
    replyToMessageId: params.replyToMessageId,
    threadRootMessageId: params.workItem.threadRootMessageId ?? params.replyToMessageId,
    citationRefs: params.citationRefs,
    artifactRefs: params.artifactRefs,
    metadataJson: params.metadataJson,
    sensitivity: params.workItem.riskClass === "critical" ? "high" : "medium",
  });

  return roomService.sendMessage({
    roomId: params.workItem.roomId,
    tenantId: params.tenantId,
    senderType: "system",
    senderUserId: params.userId,
    recipientType: "all",
    runId: params.workItem.runId ?? undefined,
    turnType: prepared.turnType,
    visibility: prepared.visibility,
    content: prepared.content,
    summaryContent: prepared.summaryContent,
    artifactRefsJson: prepared.artifactRefsJson,
    memoryRefsJson: prepared.memoryRefsJson,
    metadataJson: prepared.metadataJson,
  });
}

export const teamWorkItemRouter = router({
  create: protectedProcedure
    .input(z.object({
      teamId: z.string().min(1),
      roomId: z.string().min(1),
      runId: z.string().min(1).optional(),
      routineId: z.string().min(1).optional(),
      sourceType: z.string().min(1).max(50).optional(),
      sourceRef: z.string().max(255).optional(),
      title: z.string().min(1).max(500),
      objective: z.string().max(10000).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      riskClass: z.enum(["low", "medium", "high", "critical"]).optional(),
      assignedMemberId: z.string().min(1).optional(),
      reviewerMemberId: z.string().min(1).optional(),
      approverMemberId: z.string().min(1).optional(),
      requiresApproval: z.boolean().optional(),
      dueAt: z.coerce.date().optional(),
      roomComment: z.string().max(10000).optional(),
      replyToMessageId: z.string().min(1).optional(),
      artifactRefs: z.array(artifactRefSchema).optional(),
      citationRefs: z.array(citationRefSchema).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const workItem = await workItemService.createWorkItem({
        ...input,
        tenantId,
        artifactRefsJson: input.artifactRefs,
        actorUserId: ctx.user!.id,
      });

      const rootMessage = await mirrorSystemWorkUpdate({
        tenantId,
        userId: ctx.user!.id,
        workItem,
        messageType: "work_update",
        content: input.roomComment ?? defaultLifecycleContent({ action: "create", title: workItem.title }),
        replyToMessageId: input.replyToMessageId,
        artifactRefs: input.artifactRefs,
        citationRefs: input.citationRefs,
      });

      const updated = workItem.threadRootMessageId
        ? workItem
        : await workItemService.setThreadRootMessageId(workItem.id, rootMessage.id, tenantId);

      return {
        workItem: updated,
        roomMessage: rootMessage,
      };
    }),

  getLatest: protectedProcedure
    .input(z.object({ workItemId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workItemService.getWorkItemWithLatestRevision(input.workItemId, tenantId);
    }),

  listByRoom: protectedProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workItemService.listWorkItemsByRoom(input.roomId, tenantId);
    }),

  revise: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      expectedRevisionVersion: z.number().int().min(1),
      title: z.string().max(500).optional(),
      objective: z.string().max(10000).optional(),
      status: z.enum([
        "planned",
        "in_progress",
        "in_review",
        "needs_revision",
        "awaiting_approval",
        "completed",
        "failed",
        "blocked",
        "cancelled",
        "superseded",
      ]).optional(),
      assignedMemberId: z.string().min(1).optional(),
      reviewerMemberId: z.string().min(1).optional(),
      approverMemberId: z.string().min(1).optional(),
      activeDraftArtifactId: z.string().min(1).optional(),
      replyToMessageId: z.string().min(1).optional(),
      roomComment: z.string().max(10000).optional(),
      artifactRefs: z.array(artifactRefSchema).optional(),
      citationRefs: z.array(citationRefSchema).optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const current = await workItemService.getWorkItem(input.workItemId, tenantId);
      const revision = await workItemService.reviseWorkItem({
        ...input,
        tenantId,
        actorAssistantId: input.actorAssistantId ?? current.assignedMemberId ?? "system",
        artifactRefsJson: input.artifactRefs,
      });

      const roomMessage = await mirrorSystemWorkUpdate({
        tenantId,
        userId: ctx.user!.id,
        workItem: revision,
        messageType: "revision",
        content: input.roomComment ?? defaultLifecycleContent({
          action: "revision",
          title: revision.title,
          revisionVersion: revision.revisionVersion,
        }),
        replyToMessageId: input.replyToMessageId ?? current.threadRootMessageId ?? undefined,
        artifactRefs: input.artifactRefs,
        citationRefs: input.citationRefs,
      });

      const autoAdvanceStep = workItemService.suggestAutoAdvanceStep(revision);
      if (autoAdvanceStep && input.actorAssistantId) {
        const routed = await workItemService.routeWorkItemByRole({
          tenantId,
          workItemId: revision.id,
          expectedRevisionVersion: revision.revisionVersion,
          actorAssistantId: input.actorAssistantId,
          targetStep: autoAdvanceStep,
        });

        const routeRoomMessage = await mirrorSystemWorkUpdate({
          tenantId,
          userId: ctx.user!.id,
          workItem: routed.workItem,
          messageType: "decision",
          content: `Auto-routed work item to ${routed.targetStep} stage based on the latest update.`,
          replyToMessageId: roomMessage.id,
          artifactRefs: input.artifactRefs,
          citationRefs: input.citationRefs,
        });

        return {
          workItem: routed.workItem,
          roomMessage,
          autoAdvanced: {
            targetStep: routed.targetStep,
            roomMessage: routeRoomMessage,
          },
        };
      }

      return {
        workItem: revision,
        roomMessage,
      };
    }),

  advanceWorkflow: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      expectedRevisionVersion: z.number().int().min(1),
      targetStep: z.enum(["research", "review", "approval"]).optional(),
      roomComment: z.string().max(10000).optional(),
      replyToMessageId: z.string().min(1).optional(),
      actorAssistantId: z.string().min(1),
      artifactRefs: z.array(artifactRefSchema).optional(),
      citationRefs: z.array(citationRefSchema).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const current = await workItemService.getWorkItem(input.workItemId, tenantId);
      const routed = await workItemService.routeWorkItemByRole({
        tenantId,
        workItemId: input.workItemId,
        expectedRevisionVersion: input.expectedRevisionVersion,
        actorAssistantId: input.actorAssistantId,
        targetStep: input.targetStep,
      });

      const roomMessage = await mirrorSystemWorkUpdate({
        tenantId,
        userId: ctx.user!.id,
        workItem: routed.workItem,
        messageType: "decision",
        content: input.roomComment ?? defaultLifecycleContent({
          action: "workflow",
          title: routed.workItem.title,
          targetStep: routed.targetStep,
        }),
        replyToMessageId: input.replyToMessageId ?? current.threadRootMessageId ?? undefined,
        artifactRefs: input.artifactRefs,
        citationRefs: input.citationRefs,
      });

      return {
        workItem: routed.workItem,
        targetStep: routed.targetStep,
        assignments: routed.assignments,
        roomMessage,
      };
    }),

  acquireLock: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      memberId: z.string().min(1),
      ttlMs: z.number().int().min(1000).max(60 * 60_000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workItemService.acquireWorkItemLock({
        ...input,
        tenantId,
      });
    }),

  releaseLock: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      memberId: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workItemService.releaseWorkItemLock(input.workItemId, input.memberId, tenantId);
    }),

  approve: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      expectedRevisionVersion: z.number().int().min(1),
      approverMemberId: z.string().min(1),
      replyToMessageId: z.string().min(1).optional(),
      roomComment: z.string().max(10000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const approved = await workItemService.approveWorkItemRevision({
        ...input,
        tenantId,
      });
      const room = await roomService.getRoom(approved.roomId, tenantId);
      const roomLanguage = room?.language === "th" ? "th" : "en";
      const approvalContent =
        input.roomComment ??
        defaultLifecycleContent({
          action: "approved",
          title: approved.title,
          revisionVersion: approved.revisionVersion,
        });

      const roomMessage = await mirrorSystemWorkUpdate({
        tenantId,
        userId: ctx.user!.id,
        workItem: approved,
        messageType: "approval",
        content: approvalContent,
        replyToMessageId: input.replyToMessageId ?? approved.threadRootMessageId ?? undefined,
      });

      try {
        await mirrorSystemWorkUpdate({
          tenantId,
          userId: ctx.user!.id,
          workItem: approved,
          messageType: "step_result",
          content: buildAutoTeamStepResultContent({
            roomLanguage,
            phase: "review",
            step: {
              stepKey: `work-item:${approved.id}:approval-review`,
              stepTitle: approved.title,
              stepObjective:
                approved.objective ??
                (roomLanguage === "th"
                  ? "ตรวจและอนุมัติรายการงาน"
                  : "Review and approve the work item"),
              stepDeliverable:
                roomLanguage === "th"
                  ? "บันทึกผลอนุมัติและข้อความยืนยัน"
                  : "Approval decision and confirmation",
              ownerPersona: approved.assignedMemberId ?? approved.reviewerMemberId ?? null,
              ownerMemberId: approved.assignedMemberId ?? approved.reviewerMemberId ?? null,
              reviewerPersona: approved.approverMemberId,
              reviewerMemberId: approved.approverMemberId,
              verificationMethod:
                roomLanguage === "th" ? "ตรวจด้วยมือ" : "Manual review",
              retryRule:
                roomLanguage === "th"
                  ? "หากไม่ผ่านให้ส่งกลับแก้ไข"
                  : "If the review fails, send the work item back for repair.",
              attempt: approved.revisionVersion ?? null,
            },
            resultSummary: approvalContent,
            reviewStatus: "passed",
            reviewNote: input.roomComment ?? null,
            nextAction:
              roomLanguage === "th"
                ? "ดำเนินการต่อไปยังขั้นตอนถัดไป"
                : "Proceed to the next step.",
          }),
          replyToMessageId: roomMessage.id,
        });
      } catch (error) {
        console.warn("[teamWorkItem] failed to post approval step result", {
          tenantId,
          workItemId: approved.id,
          roomId: approved.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return {
        workItem: approved,
        roomMessage,
      };
    }),

  reject: protectedProcedure
    .input(z.object({
      workItemId: z.string().min(1),
      expectedRevisionVersion: z.number().int().min(1),
      approverMemberId: z.string().min(1),
      reason: z.string().max(10000).optional(),
      replyToMessageId: z.string().min(1).optional(),
      roomComment: z.string().max(10000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const rejected = await workItemService.rejectWorkItemRevision({
        ...input,
        tenantId,
      });
      const room = await roomService.getRoom(rejected.roomId, tenantId);
      const roomLanguage = room?.language === "th" ? "th" : "en";
      const rejectionContent =
        input.roomComment ??
        defaultLifecycleContent({
          action: "rejected",
          title: rejected.title,
          revisionVersion: rejected.revisionVersion,
          reason: input.reason,
        });

      const roomMessage = await mirrorSystemWorkUpdate({
        tenantId,
        userId: ctx.user!.id,
        workItem: rejected,
        messageType: "decision",
        content: rejectionContent,
        replyToMessageId: input.replyToMessageId ?? rejected.threadRootMessageId ?? undefined,
      });

      try {
        await mirrorSystemWorkUpdate({
          tenantId,
          userId: ctx.user!.id,
          workItem: rejected,
          messageType: "step_result",
          content: buildAutoTeamStepResultContent({
            roomLanguage,
            phase: "review",
            step: {
              stepKey: `work-item:${rejected.id}:rejection-review`,
              stepTitle: rejected.title,
              stepObjective:
                rejected.objective ??
                (roomLanguage === "th"
                  ? "ตรวจและทบทวนรายการงาน"
                  : "Review the work item and record required changes"),
              stepDeliverable:
                roomLanguage === "th"
                  ? "บันทึกเหตุผลที่ไม่ผ่านและแนวทางแก้ไข"
                  : "Rejection decision and repair notes",
              ownerPersona: rejected.assignedMemberId ?? rejected.reviewerMemberId ?? null,
              ownerMemberId: rejected.assignedMemberId ?? rejected.reviewerMemberId ?? null,
              reviewerPersona: rejected.approverMemberId,
              reviewerMemberId: rejected.approverMemberId,
              verificationMethod:
                roomLanguage === "th" ? "ตรวจด้วยมือ" : "Manual review",
              retryRule:
                roomLanguage === "th"
                  ? "แก้ไขแล้วส่งตรวจใหม่"
                  : "Repair the step and resubmit for review.",
              attempt: rejected.revisionVersion ?? null,
            },
            resultSummary: rejectionContent,
            reviewStatus: "failed",
            reviewNote: input.reason ?? input.roomComment ?? null,
            repairInstructions: input.reason ?? null,
            nextAction:
              roomLanguage === "th"
                ? "แก้ไขขั้นตอนนี้แล้วส่งตรวจใหม่"
                : "Repair this step and resubmit for review.",
          }),
          replyToMessageId: roomMessage.id,
        });
      } catch (error) {
        console.warn("[teamWorkItem] failed to post rejection step result", {
          tenantId,
          workItemId: rejected.id,
          roomId: rejected.roomId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const autoAdvanceStep = workItemService.suggestAutoAdvanceStep(rejected);
      if (autoAdvanceStep) {
        const routed = await workItemService.routeWorkItemByRole({
          tenantId,
          workItemId: rejected.id,
          expectedRevisionVersion: rejected.revisionVersion,
          actorAssistantId: input.approverMemberId,
          targetStep: autoAdvanceStep,
        });

        const routeRoomMessage = await mirrorSystemWorkUpdate({
          tenantId,
          userId: ctx.user!.id,
          workItem: routed.workItem,
          messageType: "decision",
          content: `Auto-routed rejected work item back to ${routed.targetStep} stage for follow-up.`,
          replyToMessageId: roomMessage.id,
        });

        return {
          workItem: routed.workItem,
          roomMessage,
          autoAdvanced: {
            targetStep: routed.targetStep,
            roomMessage: routeRoomMessage,
          },
        };
      }

      return {
        workItem: rejected,
        roomMessage,
      };
    }),
});
