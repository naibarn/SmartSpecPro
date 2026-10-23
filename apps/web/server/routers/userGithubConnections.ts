import { protectedProcedure, router } from "../_core/trpc";
import {
  deleteUserGitHubConnection,
  getUserGitHubConnection,
} from "../services/userGithubConnectionService";

export const userGithubConnectionsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => getUserGitHubConnection(ctx.user.id)),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteUserGitHubConnection(ctx.user.id);
    return { success: true };
  }),
});
