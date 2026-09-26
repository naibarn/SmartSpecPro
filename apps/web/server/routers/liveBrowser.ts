import {
  liveBrowserCancelSessionRequestSchema,
  liveBrowserCreateSessionRequestSchema,
  liveBrowserGetSessionRequestSchema,
  liveBrowserListEventsRequestSchema,
  liveBrowserPauseAgentRequestSchema,
  liveBrowserResolveApprovalRequestSchema,
  liveBrowserRunnerExecutionRequestSchema,
  liveBrowserReturnControlRequestSchema,
  liveBrowserSendCommandRequestSchema,
  liveBrowserStreamTokenRequestSchema,
  liveBrowserSubmitAssistResponseRequestSchema,
  liveBrowserTakeControlRequestSchema,
} from "../../shared/liveBrowser";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  cancelLiveBrowserSession,
  createLiveBrowserSession,
  getLiveBrowserSession,
  issueLiveBrowserStreamToken,
  listLiveBrowserEvents,
  pauseLiveBrowserAgent,
  resolveLiveBrowserApproval,
  returnLiveBrowserControl,
  sendLiveBrowserCommand,
  submitLiveBrowserAssistResponse,
  takeLiveBrowserControl,
} from "../services/liveBrowserGateway";
import { createCanonicalComputerUseBrowserJob } from "../services/computerUseFeature195Gateway";
import {
  buildP213CertificationDescriptor,
  isP213CertificationRequester,
} from "../services/p213CertificationApproval";

function requestError(message: string): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}

function p213CertificationFixtureUrl(): string {
  const value = process.env.P213_CERTIFICATION_FIXTURE_URL?.trim();
  if (!value || !value.startsWith("https://smartaihub.app/")) {
    throw new Error("P213_CERTIFICATION_FIXTURE_URL_NOT_CONFIGURED");
  }
  return value;
}

const P213_CERTIFICATION_SUCCESS_CONDITION = {
  text: "Certification complete",
};

export const liveBrowserRouter = router({
  createSession: protectedProcedure
    .input(liveBrowserCreateSessionRequestSchema)
    .mutation(({ ctx, input }) => createLiveBrowserSession(ctx, input)),

  /** P213 canonical producer: admits an ordinary Feature 195 worker job. */
  runOnLocalRunner: protectedProcedure
    .input(liveBrowserRunnerExecutionRequestSchema)
    .mutation(({ ctx, input }) => createCanonicalComputerUseBrowserJob(ctx, input)),

  /**
   * P213-only producer. The client supplies an ordinary Runner request; the
   * certification marker and fixture URL are created server-side only after
   * the explicit deployment/user/tenant guards pass.
   */
  runP213ApprovalCertification: protectedProcedure
    .input(liveBrowserRunnerExecutionRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const normalAdmin = ctx.user?.role === "admin" || ctx.user?.role === "domain_admin";
      const scopedCertificationRequester = ctx.user
        ? isP213CertificationRequester({
          tenantId: ctx.tenantId ?? "",
          requesterId: ctx.user.id,
          projectRef: input.projectRef,
        })
        : false;
      if (!normalAdmin && !scopedCertificationRequester) {
        requestError("P213_CERTIFICATION_REQUESTER_NOT_AUTHORIZED");
      }
      if (input.operation !== "observe" || input.action !== "none") {
        requestError("P213_CERTIFICATION_REQUIRES_OBSERVE_ONLY_ADMISSION");
      }
      try {
        const descriptor = buildP213CertificationDescriptor({
          tenantId: ctx.tenantId ?? "",
          requesterId: ctx.user.id,
          projectRef: input.projectRef,
        });
        return await createCanonicalComputerUseBrowserJob(ctx, input, {
          certificationDescriptor: descriptor,
          fixtureUrlOverride: p213CertificationFixtureUrl(),
          expectedSuccessCondition: P213_CERTIFICATION_SUCCESS_CONDITION,
        });
      } catch (error) {
        requestError(error instanceof Error ? error.message : "P213_CERTIFICATION_ADMISSION_FAILED");
      }
    }),

  getSession: protectedProcedure
    .input(liveBrowserGetSessionRequestSchema)
    .query(({ ctx, input }) => getLiveBrowserSession(ctx, input)),

  sendCommand: protectedProcedure
    .input(liveBrowserSendCommandRequestSchema)
    .mutation(({ ctx, input }) => sendLiveBrowserCommand(ctx, input)),

  pauseAgent: protectedProcedure
    .input(liveBrowserPauseAgentRequestSchema)
    .mutation(({ ctx, input }) => pauseLiveBrowserAgent(ctx, input)),

  takeControl: protectedProcedure
    .input(liveBrowserTakeControlRequestSchema)
    .mutation(({ ctx, input }) => takeLiveBrowserControl(ctx, input)),

  returnControl: protectedProcedure
    .input(liveBrowserReturnControlRequestSchema)
    .mutation(({ ctx, input }) => returnLiveBrowserControl(ctx, input)),

  submitAssistResponse: protectedProcedure
    .input(liveBrowserSubmitAssistResponseRequestSchema)
    .mutation(({ ctx, input }) => submitLiveBrowserAssistResponse(ctx, input)),

  resolveApproval: protectedProcedure
    .input(liveBrowserResolveApprovalRequestSchema)
    .mutation(({ ctx, input }) => resolveLiveBrowserApproval(ctx, input)),

  cancelSession: protectedProcedure
    .input(liveBrowserCancelSessionRequestSchema)
    .mutation(({ ctx, input }) => cancelLiveBrowserSession(ctx, input)),

  listEvents: protectedProcedure
    .input(liveBrowserListEventsRequestSchema)
    .query(({ ctx, input }) => listLiveBrowserEvents(ctx, input)),

  issueStreamToken: protectedProcedure
    .input(liveBrowserStreamTokenRequestSchema)
    .mutation(({ ctx, input }) => issueLiveBrowserStreamToken(ctx, input)),
});
