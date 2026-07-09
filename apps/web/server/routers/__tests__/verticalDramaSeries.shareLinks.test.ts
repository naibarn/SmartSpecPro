/**
 * Vertical Drama Series — read-only share link OWNER mutations coverage
 * (task #32, Collab-lite L1, F131AA): `createSeriesShareLink`,
 * `listSeriesShareLinks`, `revokeSeriesShareLink`.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.deleteSeries.test.ts` /
 * `verticalDramaSeries.adBanner.test.ts`. The share-links SERVICE module is
 * mocked as a black box here — its own token/hash/expiry/whitelist behavior
 * is covered by `server/services/__tests__/verticalDramaShareLinks.test.ts`.
 * This file covers only: ownership guard (`loadOwnedSeries`), input
 * validation (`Number.isFinite` id parsing), and the zod bounds on
 * `expiresInDays`/`seriesId`/`linkId`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock("../../services/verticalDramaShareLinks", () => ({
  createSeriesShareLink: vi.fn(),
  listSeriesShareLinks: vi.fn(),
  revokeSeriesShareLink: vi.fn(),
}));

import {
  verticalDramaSeriesRouter,
  createSeriesShareLinkInput,
  listSeriesShareLinksInput,
  revokeSeriesShareLinkInput,
} from "../verticalDramaSeries";
import {
  createSeriesShareLink as serviceCreate,
  listSeriesShareLinks as serviceList,
  revokeSeriesShareLink as serviceRevoke,
} from "../../services/verticalDramaShareLinks";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

const SERIES_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("zod bounds", () => {
  it("createSeriesShareLinkInput accepts exactly 7 or 30 for expiresInDays", () => {
    expect(createSeriesShareLinkInput.safeParse({ seriesId: "10", expiresInDays: 7 }).success).toBe(true);
    expect(createSeriesShareLinkInput.safeParse({ seriesId: "10", expiresInDays: 30 }).success).toBe(true);
  });

  it.each([14, 0, -7, 1, 365, 7.5])(
    "createSeriesShareLinkInput rejects expiresInDays=%s",
    (expiresInDays) => {
      expect(createSeriesShareLinkInput.safeParse({ seriesId: "10", expiresInDays }).success).toBe(false);
    },
  );

  it("createSeriesShareLinkInput rejects a string expiresInDays (must be the literal number)", () => {
    expect(createSeriesShareLinkInput.safeParse({ seriesId: "10", expiresInDays: "7" }).success).toBe(false);
  });

  it("createSeriesShareLinkInput rejects a blank seriesId", () => {
    expect(createSeriesShareLinkInput.safeParse({ seriesId: "", expiresInDays: 7 }).success).toBe(false);
  });

  it("createSeriesShareLinkInput rejects missing fields", () => {
    expect(createSeriesShareLinkInput.safeParse({}).success).toBe(false);
    expect(createSeriesShareLinkInput.safeParse({ seriesId: "10" }).success).toBe(false);
  });

  it("listSeriesShareLinksInput requires a non-blank seriesId", () => {
    expect(listSeriesShareLinksInput.safeParse({ seriesId: "5" }).success).toBe(true);
    expect(listSeriesShareLinksInput.safeParse({ seriesId: "" }).success).toBe(false);
    expect(listSeriesShareLinksInput.safeParse({}).success).toBe(false);
  });

  it("revokeSeriesShareLinkInput requires both a non-blank seriesId and linkId", () => {
    expect(revokeSeriesShareLinkInput.safeParse({ seriesId: "5", linkId: "1" }).success).toBe(true);
    expect(revokeSeriesShareLinkInput.safeParse({ seriesId: "5", linkId: "" }).success).toBe(false);
    expect(revokeSeriesShareLinkInput.safeParse({ seriesId: "", linkId: "1" }).success).toBe(false);
  });
});

describe("createSeriesShareLink — ownership guard", () => {
  it("throws NOT_FOUND and never calls the service when the series is not owned by the caller", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.createSeriesShareLink({
        ctx: ctx(),
        input: { seriesId: "999", expiresInDays: 7 },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(serviceCreate).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.createSeriesShareLink({
        ctx: ctx(),
        input: { seriesId: "not-a-number", expiresInDays: 7 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(serviceCreate).not.toHaveBeenCalled();
  });

  it("never discloses another tenant's series — scoped strictly to the caller's own tenantId", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // no row for "other-tenant"

    await expect(
      router.createSeriesShareLink({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", expiresInDays: 7 },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(serviceCreate).not.toHaveBeenCalled();
  });
});

describe("createSeriesShareLink — happy path", () => {
  it("delegates to the service with the resolved tenantId/seriesId/createdByUserId/expiresInDays", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    (serviceCreate as any).mockResolvedValueOnce({
      id: "1",
      token: "raw-token-abc",
      expiresAt: new Date("2026-08-01"),
      createdAt: new Date("2026-07-09"),
    });

    const result = await router.createSeriesShareLink({
      ctx: ctx(),
      input: { seriesId: "10", expiresInDays: 30 },
    });

    expect(serviceCreate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      seriesId: 10,
      createdByUserId: 42,
      expiresInDays: 30,
    });
    expect(result).toMatchObject({ id: "1", token: "raw-token-abc" });
  });
});

describe("listSeriesShareLinks", () => {
  it("throws NOT_FOUND for an unowned series without calling the service", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.listSeriesShareLinks({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(serviceList).not.toHaveBeenCalled();
  });

  it("returns { links } from the service for an owned series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    (serviceList as any).mockResolvedValueOnce([{ id: "1", active: true }]);

    const result = await router.listSeriesShareLinks({ ctx: ctx(), input: { seriesId: "10" } });

    expect(serviceList).toHaveBeenCalledWith({ tenantId: "tenant-1", seriesId: 10 });
    expect(result).toEqual({ links: [{ id: "1", active: true }] });
  });
});

describe("revokeSeriesShareLink", () => {
  it("throws NOT_FOUND for an unowned series without calling the service", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.revokeSeriesShareLink({ ctx: ctx(), input: { seriesId: "10", linkId: "1" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(serviceRevoke).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric linkId", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));

    await expect(
      router.revokeSeriesShareLink({ ctx: ctx(), input: { seriesId: "10", linkId: "nope" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(serviceRevoke).not.toHaveBeenCalled();
  });

  it("delegates to the service with numeric seriesId/linkId for an owned series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));
    (serviceRevoke as any).mockResolvedValueOnce({ revoked: true });

    const result = await router.revokeSeriesShareLink({
      ctx: ctx(),
      input: { seriesId: "10", linkId: "3" },
    });

    expect(serviceRevoke).toHaveBeenCalledWith({ tenantId: "tenant-1", seriesId: 10, linkId: 3 });
    expect(result).toEqual({ revoked: true });
  });
});
