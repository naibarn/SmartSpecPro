import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));

vi.mock("../../db", () => ({ getDb: mockGetDb }));

import {
  captureTeamProjectProviderContextBinding,
  revalidateTeamProjectProviderContextBinding,
  TeamProjectProviderAuthorizationError,
  type TeamProjectProviderContextBinding,
} from "../teamProjectProviderAuthorization";

const request = {
  tenantId: "tenant-a",
  roomId: "room-a",
  teamId: "team-a",
  userId: 42,
  runId: "run-a",
};

function authorityRow(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: request.tenantId,
    roomId: request.roomId,
    teamId: request.teamId,
    roomStatus: "active",
    orchestratorUserId: null,
    projectId: "project-a",
    participantType: "observer",
    participantUserId: request.userId,
    activeTeamHumanUserId: request.userId,
    teamRunId: request.runId,
    canonicalProjectId: "project-a",
    canonicalTenantId: request.tenantId,
    canonicalLifecycle: "ACTIVE",
    activeMembershipPrincipalId: `user:${request.userId}`,
    ...overrides,
  };
}

function mockDbRows(...rows: Array<Record<string, unknown> | null>) {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => {
    const row = rows.shift() ?? null;
    return row ? [row] : [];
  });
  mockGetDb.mockReturnValue(chain);
  return chain;
}

describe("team project provider authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
  });

  it("captures a tenant, room, run, project and active-member binding", async () => {
    mockDbRows(authorityRow());

    await expect(
      captureTeamProjectProviderContextBinding(request)
    ).resolves.toEqual({
      version: "team-room-provider-context.v1",
      tenantId: "tenant-a",
      roomId: "room-a",
      teamId: "team-a",
      userId: 42,
      runId: "run-a",
      historyScope: "run",
      projectId: "project-a",
      projectAuthority: "canonical-member",
    });
  });

  it("accepts active human team members whose room participant record is an observer", async () => {
    mockDbRows(authorityRow({ participantType: "observer" }));

    await expect(captureTeamProjectProviderContextBinding(request)).resolves.toMatchObject({
      tenantId: request.tenantId,
      roomId: request.roomId,
      userId: request.userId,
    });
  });

  it("keeps a legacy room project bound to the room without treating it as canonical authority", async () => {
    mockDbRows(
      authorityRow({
        projectId: 77,
        canonicalProjectId: null,
        canonicalTenantId: null,
        canonicalLifecycle: null,
        activeMembershipPrincipalId: null,
      })
    );

    await expect(
      captureTeamProjectProviderContextBinding(request)
    ).resolves.toMatchObject({
      projectId: "77",
      projectAuthority: "room-only",
      historyScope: "run",
    });
  });

  it.each([
    ["revoked membership", authorityRow({ activeMembershipPrincipalId: null })],
    ["revoked team membership", authorityRow({ activeTeamHumanUserId: null })],
    ["foreign tenant", authorityRow({ canonicalTenantId: "tenant-b" })],
    ["inactive project", authorityRow({ canonicalLifecycle: "ARCHIVED" })],
    ["missing room participant", authorityRow({ participantUserId: null })],
    ["paused room", authorityRow({ roomStatus: "paused" })],
    ["run from another room or user", authorityRow({ teamRunId: null })],
  ])("fails closed for %s", async (_label, row) => {
    mockDbRows(row as Record<string, unknown>);

    await expect(
      captureTeamProjectProviderContextBinding(request)
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
  });

  it("allows the authenticated room owner when no team membership is present", async () => {
    mockDbRows(authorityRow({
      orchestratorUserId: request.userId,
      activeTeamHumanUserId: null,
    }));

    await expect(captureTeamProjectProviderContextBinding(request)).resolves.toMatchObject({
      roomId: request.roomId,
      userId: request.userId,
      projectAuthority: "canonical-member",
    });
  });

  it("allows room history when no run scope is requested", async () => {
    mockDbRows(authorityRow({ teamRunId: null }));

    await expect(captureTeamProjectProviderContextBinding({ ...request, runId: null }))
      .resolves.toMatchObject({ historyScope: "room", runId: null });
  });

  it("fails closed when the room is missing or the authorization query fails", async () => {
    mockDbRows(null);
    await expect(
      captureTeamProjectProviderContextBinding(request)
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);

    mockGetDb.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    await expect(
      captureTeamProjectProviderContextBinding(request)
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
  });

  it("revalidates the exact binding before provider dispatch", async () => {
    const binding = await (async () => {
      mockDbRows(authorityRow());
      return captureTeamProjectProviderContextBinding(request);
    })();
    mockDbRows(authorityRow());

    await expect(
      revalidateTeamProjectProviderContextBinding(binding, request)
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      "membership revocation",
      authorityRow({ activeMembershipPrincipalId: null }),
    ],
    [
      "project reassignment",
      authorityRow({ projectId: "project-b", canonicalProjectId: "project-b" }),
    ],
    ["room reassignment", authorityRow({ roomId: "room-b" })],
    ["tenant change", authorityRow({ tenantId: "tenant-b" })],
  ])("rejects stale provider context after %s", async (_label, currentRow) => {
    mockDbRows(authorityRow());
    const binding: TeamProjectProviderContextBinding =
      await captureTeamProjectProviderContextBinding(request);
    mockDbRows(currentRow as Record<string, unknown>);

    await expect(
      revalidateTeamProjectProviderContextBinding(binding, request)
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
  });

  it("rejects a binding replayed for another user, run, room or tenant before querying", async () => {
    mockDbRows(authorityRow());
    const binding = await captureTeamProjectProviderContextBinding(request);
    const db = mockDbRows(authorityRow());

    await expect(
      revalidateTeamProjectProviderContextBinding(binding, {
        ...request,
        userId: 43,
      })
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
    await expect(
      revalidateTeamProjectProviderContextBinding(binding, {
        ...request,
        runId: "run-b",
      })
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
    await expect(
      revalidateTeamProjectProviderContextBinding(binding, {
        ...request,
        roomId: "room-b",
      })
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
    await expect(
      revalidateTeamProjectProviderContextBinding(binding, {
        ...request,
        tenantId: "tenant-b",
      })
    ).rejects.toBeInstanceOf(TeamProjectProviderAuthorizationError);
    expect(db.limit).not.toHaveBeenCalled();
  });
});
