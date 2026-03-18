import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { createRateLimitMiddleware } from "./rateLimitedProcedure";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'system_agent')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Rate-limited auth procedures (public, no auth required)
export const loginProcedure = t.procedure.use(
  createRateLimitMiddleware({ namespace: "login", limit: 10, windowMs: 60_000 }),
);

export const registerProcedure = t.procedure.use(
  createRateLimitMiddleware({ namespace: "register", limit: 5, windowMs: 60_000 }),
);

export const verifyEmailProcedure = t.procedure.use(
  createRateLimitMiddleware({ namespace: "verify-email", limit: 10, windowMs: 60_000 }),
);

export const resetPasswordProcedure = t.procedure.use(
  createRateLimitMiddleware({ namespace: "reset-password", limit: 5, windowMs: 60_000 }),
);

// Rate-limited admin procedure — auth check first (rejects unauthenticated
// before consuming a rate-limit bucket), then rate limit to prevent abuse
export const rateLimitedAdminProcedure = t.procedure
  .use(
    t.middleware(async opts => {
      if (!opts.ctx.user || (opts.ctx.user.role !== 'admin' && opts.ctx.user.role !== 'system_agent')) {
        throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      }
      return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
    }),
  )
  .use(createRateLimitMiddleware({ namespace: "admin", limit: 60, windowMs: 60_000 }));

// Domain admin procedure - has access to manage users in their domain
export const domainAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'domain_admin' && ctx.user.role !== 'system_agent')) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Domain admin access required" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Rate-limited domain admin procedure - auth check first, then rate limit
// Used for sensitive export and query operations that need abuse protection
export const rateLimitedDomainAdminProcedure = t.procedure
  .use(
    t.middleware(async opts => {
      if (!opts.ctx.user || (opts.ctx.user.role !== 'admin' && opts.ctx.user.role !== 'domain_admin' && opts.ctx.user.role !== 'system_agent')) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Domain admin access required" });
      }
      return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
    }),
  )
  .use(createRateLimitMiddleware({ namespace: "domain-admin", limit: 20, windowMs: 60_000 }));
