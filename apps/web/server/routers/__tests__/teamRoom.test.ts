import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };

  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
  };
});

const { mockResolveTenantIdVarchar } = vi.hoisted(() => ({
  mockResolveTenantIdVarchar: vi.fn(() => "tenant-1"),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

const {
  mockCreateRoom,
  mockGetRoom,
  mockGetViewerState,
  mockSendMessage,
  mockMarkRoomViewed,
  mockListRoomsByTeam,
  mockGetMessages,
} = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockGetRoom: vi.fn(),
  mockGetViewerState: vi.fn(),
  mockSendMessage: vi.fn(),
  mockMarkRoomViewed: vi.fn(),
  mockListRoomsByTeam: vi.fn(),
  mockGetMessages: vi.fn(),
}));

vi.mock("../../services/roomService", () => ({
  createRoom: mockCreateRoom,
  getRoom: mockGetRoom,
  getViewerState: mockGetViewerState,
  sendMessage: mockSendMessage,
  markRoomViewed: mockMarkRoomViewed,
  listRoomsByTeam: mockListRoomsByTeam,
  getMessages: mockGetMessages,
}));

import { teamRoomRouter } from "../teamRoom";

describe("teamRoomRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTenantIdVarchar.mockReturnValue("tenant-1");
  });

  it("viewerState resolves the viewer state for the current user", async () => {
    mockGetViewerState.mockResolvedValue({
      roomId: "room-1",
      userId: 42,
      lastViewedAt: new Date("2026-03-20T10:00:00.000Z"),
    });

    const result = await teamRoomRouter.viewerState({
      input: { roomId: "room-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockGetViewerState).toHaveBeenCalledWith("room-1", "tenant-1", 42);
    expect(result).toEqual(expect.objectContaining({
      roomId: "room-1",
      userId: 42,
    }));
  });

  it("markViewed persists the latest viewed timestamp for the current user", async () => {
    mockMarkRoomViewed.mockResolvedValue({
      roomId: "room-1",
      userId: 42,
      lastViewedAt: new Date("2026-03-20T10:05:00.000Z"),
    });

    const result = await teamRoomRouter.markViewed({
      input: { roomId: "room-1" },
      ctx: {
        tenantId: "tenant-1",
        user: { id: 42, currentTenantId: 1 },
      },
    } as any);

    expect(mockMarkRoomViewed).toHaveBeenCalledWith("room-1", "tenant-1", 42);
    expect(result).toEqual(expect.objectContaining({
      roomId: "room-1",
      userId: 42,
    }));
  });
});
