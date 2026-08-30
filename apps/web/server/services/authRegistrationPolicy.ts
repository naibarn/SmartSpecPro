import { TRPCError } from "@trpc/server";

/**
 * Registration admission is a user-facing policy decision, not an internal
 * server failure. Keep it out of the system auto-report pipeline while still
 * preserving the exact message for the client.
 */
export function throwRegistrationDenied(message: string): never {
  throw new TRPCError({
    code: "FORBIDDEN",
    message,
  });
}
