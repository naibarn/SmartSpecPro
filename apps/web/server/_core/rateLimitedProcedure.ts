import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./context";

type Bucket = { ts: number[] };
const buckets = new Map<string, Bucket>();

function getIp(ctx: TrpcContext): string {
  const xff = ctx.req.headers["x-forwarded-for"];
  if (typeof xff === "string") return xff.split(",")[0].trim();
  return (ctx.req as any).ip || "unknown";
}

/**
 * Creates a tRPC middleware that enforces rate limiting per IP address.
 * Uses in-memory sliding window (same approach as limits.ts).
 * For multi-instance production, consider shared Redis-backed rate limiting.
 */
export function createRateLimitMiddleware(opts: {
  namespace: string;
  limit: number;
  windowMs: number;
}) {
  return async ({ ctx, next }: { ctx: TrpcContext; next: () => Promise<any> }) => {
    const ip = getIp(ctx);
    const key = `${opts.namespace}:${ip}`;
    const bucket = buckets.get(key) ?? { ts: [] };
    const now = Date.now();

    // Prune expired timestamps
    bucket.ts = bucket.ts.filter((t) => t > now - opts.windowMs);

    if (bucket.ts.length >= opts.limit) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please try again later.",
      });
    }

    bucket.ts.push(now);
    buckets.set(key, bucket);

    return next();
  };
}
