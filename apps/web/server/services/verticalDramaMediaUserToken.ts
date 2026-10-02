import { createInternalTokenFromAuth } from "../_core/tokens";

/** Mint a short-lived internal token; never forward the browser request token. */
export function createVerticalDramaMediaUserToken(input: {
  userId: number;
  tenantId?: string | null;
  requestToken?: string | null;
}): string {
  return createInternalTokenFromAuth(
    { userId: input.userId, tenantId: input.tenantId },
    ["media:generate"]
  );
}
