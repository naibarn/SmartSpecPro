import { describe, expect, it } from "vitest";
import { sanitizeTrpcErrorMessage } from "../_core/trpc";

describe("tRPC error message sanitization", () => {
  it("hides database query details from internal errors", () => {
    expect(
      sanitizeTrpcErrorMessage(
        "INTERNAL_SERVER_ERROR",
        'Failed query: select * from "user_notifications" where "currentTenantId" = $1'
      )
    ).toBe("Internal server error");
  });

  it("hides common PostgreSQL constraint details from internal errors", () => {
    expect(
      sanitizeTrpcErrorMessage(
        "INTERNAL_SERVER_ERROR",
        'duplicate key value violates unique constraint "users_openId_unique"',
      ),
    ).toBe("Internal server error");
  });

  it("preserves the trace-friendly application message for non-database errors", () => {
    expect(
      sanitizeTrpcErrorMessage(
        "INTERNAL_SERVER_ERROR",
        "Notification service is temporarily unavailable"
      )
    ).toBe("Notification service is temporarily unavailable");
  });

  it("does not rewrite validation or permission errors", () => {
    expect(
      sanitizeTrpcErrorMessage(
        "BAD_REQUEST",
        "Failed query: this is a client-provided message"
      )
    ).toBe("Failed query: this is a client-provided message");
  });
});
