import { describe, expect, it, vi } from "vitest";
import {
  OrcaRunnerSessionError,
  OrcaRunnerSessionController,
  type OrcaRunnerTransport,
} from "../orcaRunnerSessionService";

describe("orcaRunnerSessionService", () => {
  it("creates and resumes a fenced session through the Runner transport", async () => {
    const send = vi.fn(async command => ({
      commandId: command.commandId,
      status: "accepted" as const,
    }));
    const transport: OrcaRunnerTransport = { send };
    const controller = new OrcaRunnerSessionController(transport);
    const session = await controller.create({
      tenantId: "tenant-1",
      runnerId: "runner-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      idempotencyKey: "session-1",
    });
    const resumed = await controller.attach({
      ...session,
      idempotencyKey: "attach-1",
    });
    expect(resumed.generation).toBe(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ route: "orca.v1", kind: "create" })
    );
  });

  it("rejects stale fences, duplicate commands, and secret payloads", async () => {
    const transport: OrcaRunnerTransport = {
      send: vi.fn(async command => ({
        commandId: command.commandId,
        status: "accepted" as const,
      })),
    };
    const controller = new OrcaRunnerSessionController(transport);
    const session = await controller.create({
      tenantId: "tenant-1",
      runnerId: "runner-1",
      jobId: "job-1",
      attemptId: "attempt-1",
      idempotencyKey: "session-2",
    });
    await controller.prompt({
      ...session,
      idempotencyKey: "prompt-1",
      payload: { text: "hello" },
    });
    expect(
      await controller.prompt({
        ...session,
        idempotencyKey: "prompt-1",
        payload: { text: "hello" },
      })
    ).toMatchObject({ status: "duplicate" });
    await expect(
      controller.prompt({
        ...session,
        generation: 0,
        idempotencyKey: "prompt-2",
        payload: { text: "hello" },
      })
    ).rejects.toThrowError(new OrcaRunnerSessionError("SESSION_FENCE_STALE"));
    await expect(
      controller.prompt({
        ...session,
        idempotencyKey: "prompt-3",
        payload: { accessToken: "secret" },
      })
    ).rejects.toThrowError(
      new OrcaRunnerSessionError("SECRET_PAYLOAD_REJECTED")
    );
    await expect(
      controller.prompt({
        ...session,
        idempotencyKey: "prompt-4",
        payload: { nested: [{ authorization: "Bearer secret" }] },
      })
    ).rejects.toThrowError(
      new OrcaRunnerSessionError("SECRET_PAYLOAD_REJECTED")
    );
  });
});
