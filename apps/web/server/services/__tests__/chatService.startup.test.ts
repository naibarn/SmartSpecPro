import { describe, expect, it } from "vitest";

describe("chatService startup", () => {
  it("imports without throwing", async () => {
    await import("../chatService");
    expect(true).toBe(true);
  });
});
