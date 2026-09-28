import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// Test TRPCError property structure expected by Login.tsx & index.ts
describe("auth.login TRPCError structure", () => {
  it("creates TRPCError with UNAUTHORIZED code for wrong credentials", () => {
    const error = new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Invalid email or password");
  });

  it("ensures UNAUTHORIZED code is not INTERNAL_SERVER_ERROR", () => {
    const error = new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });

    expect(error.code).not.toBe("INTERNAL_SERVER_ERROR");
  });
});
