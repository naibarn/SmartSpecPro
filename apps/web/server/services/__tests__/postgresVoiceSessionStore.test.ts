import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({ execute: mockExecute })),
}));

import { consumeVoiceSessionToken } from "../postgresVoiceSessionStore";

describe("consumeVoiceSessionToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structurally valid one-time session payload", async () => {
    mockExecute.mockResolvedValue([{ value: { userId: 7, tenantId: "tenant-1" } }]);

    await expect(consumeVoiceSessionToken("one-time-token")).resolves.toEqual({
      userId: 7,
      tenantId: "tenant-1",
    });
  });

  it("rejects malformed stored payloads", async () => {
    mockExecute.mockResolvedValue([{ value: { userId: "7", tenantId: "" } }]);

    await expect(consumeVoiceSessionToken("one-time-token")).resolves.toBeNull();
  });
});
