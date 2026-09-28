import { describe, expect, it } from "vitest";
import {
  ExternalRuntimeSessionService,
  RuntimeSessionError,
} from "../externalRuntimeSessionService";

describe("externalRuntimeSessionService", () => {
  it("keeps configuration fingerprints stable for nested object key order", () => {
    const service = new ExternalRuntimeSessionService();
    const session = service.create({
      tenantId: "tenant-1",
      workspaceId: "ws-nested",
      provider: "acp",
      runnerId: "runner-1",
      configuration: { command: { env: { B: "2", A: "1" } } },
      authEpoch: 1,
      childId: "child-nested",
    });

    expect(
      service.resume({
        ...session,
        configuration: { command: { env: { A: "1", B: "2" } } },
        authEpoch: 1,
      })
    ).toMatchObject({ status: "resumed" });
  });

  it("creates, resumes, fences, and cleans up provider children", () => {
    const service = new ExternalRuntimeSessionService();
    const session = service.create({
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      provider: "gascity",
      runnerId: "runner-1",
      configuration: { model: "x" },
      authEpoch: 1,
      childId: "child-1",
    });
    expect(
      service.resume({
        ...session,
        configuration: { model: "x" },
        authEpoch: 1,
      })
    ).toMatchObject({ status: "resumed", generation: 2 });
    expect(service.cleanup(session.sessionId)).toMatchObject({
      status: "stopped",
    });
    expect(service.cleanup(session.sessionId)).toMatchObject({
      status: "already_stopped",
    });
  });

  it("rejects config/auth mismatch and duplicate provider children", () => {
    const service = new ExternalRuntimeSessionService();
    const session = service.create({
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      provider: "gascity",
      runnerId: "runner-1",
      configuration: { model: "x" },
      authEpoch: 1,
      childId: "child-2",
    });
    expect(() =>
      service.create({
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        provider: "gascity",
        runnerId: "runner-1",
        configuration: { model: "x" },
        authEpoch: 1,
        childId: "child-2",
      })
    ).toThrowError(new RuntimeSessionError("PROVIDER_CHILD_DUPLICATE"));
    expect(() =>
      service.resume({
        ...session,
        configuration: { model: "y" },
        authEpoch: 1,
      })
    ).toThrowError(new RuntimeSessionError("CONFIGURATION_EPOCH_MISMATCH"));
    expect(() =>
      service.resume({
        ...session,
        configuration: { model: "x" },
        authEpoch: 2,
      })
    ).toThrowError(new RuntimeSessionError("AUTH_EPOCH_MISMATCH"));
  });
});
