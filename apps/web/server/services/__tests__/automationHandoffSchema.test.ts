import { describe, expect, it } from "vitest";
import { automationHandoffs } from "../../../drizzle/schema";

describe("automationHandoffs schema hardening", () => {
  it("includes callback security and idempotency columns", () => {
    const cols = Object.keys(automationHandoffs);
    expect(cols).toContain("idempotencyKey");
    expect(cols).toContain("dispatchTokenHash");
    expect(cols).toContain("callbackNonce");
    expect(cols).toContain("callbackDeadlineAt");
    expect(cols).toContain("attemptCount");
    expect(cols).toContain("lastAttemptAt");
  });
});
