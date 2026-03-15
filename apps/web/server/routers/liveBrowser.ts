import {
  liveBrowserCancelSessionRequestSchema,
  liveBrowserCreateSessionRequestSchema,
  liveBrowserGetSessionRequestSchema,
  liveBrowserListEventsRequestSchema,
  liveBrowserPauseAgentRequestSchema,
  liveBrowserResolveApprovalRequestSchema,
  liveBrowserReturnControlRequestSchema,
  liveBrowserSendCommandRequestSchema,
  liveBrowserStreamTokenRequestSchema,
  liveBrowserSubmitAssistResponseRequestSchema,
  liveBrowserTakeControlRequestSchema,
} from "../../shared/liveBrowser";
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

export const liveBrowserRouter = router({
  createSession: protectedProcedure
    .input(liveBrowserCreateSessionRequestSchema)
    .mutation(({ ctx, input }) => createLiveBrowserSession(ctx, input)),

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
