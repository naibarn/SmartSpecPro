/**
 * Vertical Drama Series — public (unauthenticated) read-only share link
 * surface (task #32, Collab-lite L1, F131AA,
 * planning/vertical-drama-share-links/plan.md).
 *
 * Deliberately a SEPARATE router file from `verticalDramaSeries.ts` (which
 * is 100% `protectedProcedure`-gated) so this module's only export is one
 * narrow, fully-audited public read path — never mixed into the owner-
 * authenticated router's surface. All business logic (token hashing,
 * expiry/revocation checks, accessCount bump, whitelist projection) lives in
 * `services/verticalDramaShareLinks.ts`; this file is a thin, rate-limited
 * passthrough.
 *
 * Feature flag: the `verticalDramaSeriesShareLinks` (F131AA) tenant flag
 * gates ONLY the owner-side create mutation in `verticalDramaSeries.ts` —
 * this public procedure does not re-check it. A share link can only exist
 * if the flag was on at creation time (control at the source), and a link
 * that's already out in the world must keep working even if the owner's
 * tenant later has the flag turned back off — the link's own
 * expiresAt/revokedAt are the only lifecycle controls once created.
 *
 * Rate limiting: reuses the SAME `createRateLimitMiddleware` factory
 * `_core/trpc.ts` already applies to the `login`/`register`/`verify-email`/
 * `reset-password` public procedures (in-memory per-IP sliding window,
 * keyed off `ctx.req.ip`) — see `_core/rateLimitedProcedure.ts`. 30
 * requests/minute/IP is generous for normal viewing (the whole projection is
 * one query per page load) while still bounding brute-force token-guessing;
 * the token's own 256 bits of entropy is the primary defense, this is
 * defense-in-depth.
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { resolveSharedSeriesProjection } from "../services/verticalDramaShareLinks";

const sharedSeriesReadProcedure = publicProcedure.use(
  createRateLimitMiddleware({
    namespace: "vd-share-read",
    limit: 30,
    windowMs: 60_000,
  }),
);

export const verticalDramaShareRouter = router({
  /**
   * The one public read for this whole feature. Never throws anything other
   * than the generic NOT_FOUND (`SHARE_LINK_GENERIC_ERROR_MESSAGE`) or the
   * rate limiter's TOO_MANY_REQUESTS — no error path here ever discloses
   * WHY a token didn't resolve.
   *
   * Deliberately a `.mutation()` despite being a read: tRPC queries go out
   * as GET with the input in the URL query string, which would write the
   * raw share token into nginx access logs in plaintext (CLAUDE.md: "NEVER
   * pass secrets as URL query parameters"). A mutation ships the token in
   * the POST body instead — same fix `verifyEmail`/`resetPassword` use for
   * their tokens (security review 2026-07-09, finding #1).
   */
  getSharedSeries: sharedSeriesReadProcedure
    .input(z.object({ token: z.string().min(1).max(512) }))
    .mutation(async ({ input }) => {
      return resolveSharedSeriesProjection(input.token);
    }),
});
