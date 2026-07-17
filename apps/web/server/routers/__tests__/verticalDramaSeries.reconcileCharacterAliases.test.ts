/**
 * `reconcileCharactersFromStoryBible` — alias-aware match cascade
 * (`planning/vd-character-identity-repair/plan.md` Phase 6.2, closing the
 * NEW-PROJECT/wizard path hole).
 *
 * Before this phase, the function matched ONLY by exact normalized name and
 * silently `continue`d on a miss — so a bible refinement that RENAMES a
 * wizard-seeded roster row (series 7's `ผู้บงการ(คนร้าย)` -> bible
 * `ผู้บงการ`) never got its roles written, and the next deep draft would
 * mint a genuine duplicate row for `ผู้บงการ` (the plan's original bug,
 * reproduced from a brand-new project). These tests cover the 3-step
 * cascade (exact name -> persisted alias table -> the bible's OWN declared
 * `aliases[]` matched against roster names) plus the two decisions the
 * Phase 6.2 brief required: never insert a character row here, and never
 * rename an existing roster row's `name` column.
 *
 * Mocking convention mirrors `verticalDramaSeries.locationsDraft.test.ts` —
 * a bare `mockDb` (select/update/insert/transaction), the real router
 * module imported directly, no `_core/trpc`/service mocks needed since this
 * test only calls the exported `reconcileCharactersFromStoryBible` function
 * directly (not through a procedure).
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
  const proc: any = {
    use: () => proc,
    input: () => proc,
    query: (fn: Function) => fn,
    mutation: (fn: Function) => fn,
  };
  return { router: (routes: unknown) => routes, protectedProcedure: proc };
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

vi.mock("../../services/verticalDramaPresetSynthesis", () => ({
  PresetSynthesisInputError: class extends Error {},
  synthesizeVerticalDramaPreset: vi.fn(),
  synthesizeVerticalDramaPresetV2: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

import { reconcileCharactersFromStoryBible } from "../verticalDramaSeries";

const TENANT = "tenant-1";
const USER_ID = 42;
const SERIES_ID = 7;

/** Select-chain stub: `db.select().from(table).where(cond)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  return { from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(rows)) })) };
}

/** Records every `tx.update(table).set(values).where(cond)` + `tx.insert(table).values(values).onConflictDoNothing()` call made inside the transaction callback. */
function makeTx() {
  const updateCalls: Array<{ values: any }> = [];
  const insertCalls: Array<{ values: any }> = [];
  const tx = {
    update: vi.fn(() => ({
      set: vi.fn((values: any) => ({
        where: vi.fn(() => {
          updateCalls.push({ values });
          return Promise.resolve(undefined);
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: any) => ({
        onConflictDoNothing: vi.fn(() => {
          insertCalls.push({ values });
          return Promise.resolve(undefined);
        }),
      })),
    })),
  };
  return { tx, updateCalls, insertCalls };
}

function rosterCharacter(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 70,
    tenantId: TENANT,
    userId: USER_ID,
    seriesId: SERIES_ID,
    characterKey: "villain",
    name: "ผู้บงการ(คนร้าย)",
    role: null,
    narrativeRole: null,
    roleTier: null,
    occupation: null,
    roleProvenance: "migrated",
    roleReviewStatus: "needs_role_review",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileCharactersFromStoryBible — cascade step 1 (exact normalized name)", () => {
  it("updates roles on an exact name match — no alias row inserted (baseline, pre-Phase-6 behavior preserved)", async () => {
    const character = rosterCharacter({ name: "วรุตม์" });
    mockDb.select
      .mockReturnValueOnce(selectChain([character])) // roster
      .mockReturnValueOnce(selectChain([])); // alias rows
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      { name: "วรุตม์", narrativeRole: "antagonist" as any, roleTier: "villain_male_open" as any },
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values.narrativeRole).toBe("antagonist");
    expect(updateCalls[0].values.name).toBeUndefined(); // never renames
    expect(insertCalls).toHaveLength(0); // exact match needs no alias row
  });
});

describe("reconcileCharactersFromStoryBible — cascade step 2 (persisted alias table)", () => {
  it("resolves a bible name to the roster row a PREVIOUS run already aliased, and updates its roles", async () => {
    const character = rosterCharacter();
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(
        selectChain([
          { characterId: character.id, normalizedAlias: "ผู้บงการ", alias: "ผู้บงการ" },
        ]),
      );
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      { name: "ผู้บงการ", narrativeRole: "antagonist" as any, roleTier: "villain_male_open" as any },
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values.narrativeRole).toBe("antagonist");
    // Idempotent re-materialization of the same linkage (onConflictDoNothing
    // absorbs the repeat) — still attempted every run, same precedent as
    // `ensureRosterCharactersFromStory`'s own alias-seeding loop.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      characterId: character.id,
      alias: "ผู้บงการ",
      normalizedAlias: "ผู้บงการ",
      source: "bible_declared",
    });
  });
});

describe("reconcileCharactersFromStoryBible — cascade step 3 (bible's OWN declared aliases -> existing roster name)", () => {
  it("resolves the wizard-rename case: bible refines 'ผู้บงการ(คนร้าย)' to 'ผู้บงการ' and declares the original as an alias", async () => {
    const character = rosterCharacter({ name: "ผู้บงการ(คนร้าย)" });
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(selectChain([])); // no persisted aliases yet
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      {
        name: "ผู้บงการ",
        aliases: ["ผู้บงการ(คนร้าย)"],
        narrativeRole: "antagonist" as any,
        roleTier: "villain_male_open" as any,
      },
    ]);

    // Role fields ARE written onto the EXISTING row (id 70) — not a NULL/no-op.
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values.narrativeRole).toBe("antagonist");
    expect(updateCalls[0].values.roleReviewStatus).toBe("ready");
    // The roster row's own `name` column is NEVER rewritten to the bible's
    // canonical spelling — see this function's own "RENAME-vs-KEEP" doc
    // comment for why keeping the human's original wizard input wins.
    expect(updateCalls[0].values.name).toBeUndefined();

    // The bible's refined name is recorded as a NEW alias pointing at the
    // SAME existing row, so a later run's step-2 cascade (and
    // `ensureRosterCharactersFromStory`'s dedup guard) resolves it directly.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({
      characterId: character.id,
      alias: "ผู้บงการ",
      normalizedAlias: "ผู้บงการ",
      source: "bible_declared",
    });
  });

  it("never fuzzy-matches — a declared alias that doesn't EXACTLY match any roster name (even a near-miss with an extra space) resolves nothing", async () => {
    const character = rosterCharacter({ name: "ผู้บงการ(คนร้าย)" });
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(selectChain([]));
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      // "ผู้บงการ (คนร้าย)" (with a space before the parenthesis) normalizes
      // to a DIFFERENT string than the roster's "ผู้บงการ(คนร้าย)" (no
      // space) — `normalizeStoryCharacterName` collapses whitespace RUNS,
      // it does not strip whitespace entirely, so this is a genuine (if
      // narrow) near-miss, not a bug in the test.
      { name: "หัวหน้าแก๊ง", aliases: ["ผู้บงการ (คนร้าย)"] },
    ]);

    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

describe("reconcileCharactersFromStoryBible — user_confirmed skip (roles) vs alias linkage", () => {
  it("skips the ROLE update for a user_confirmed character, but STILL records the alias linkage", async () => {
    const character = rosterCharacter({
      name: "ผู้บงการ(คนร้าย)",
      roleProvenance: "user_confirmed",
      narrativeRole: "antagonist",
      roleTier: "villain_male_open",
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(selectChain([]));
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      {
        name: "ผู้บงการ",
        aliases: ["ผู้บงการ(คนร้าย)"],
        narrativeRole: "supporting" as any, // would DOWNGRADE if applied — must not be
        roleTier: "support_memorable" as any,
      },
    ]);

    expect(updateCalls).toHaveLength(0); // a human's decision is never downgraded
    expect(insertCalls).toHaveLength(1); // but the identity link is still useful
    expect(insertCalls[0].values).toMatchObject({
      characterId: character.id,
      alias: "ผู้บงการ",
      source: "bible_declared",
    });
  });
});

describe("reconcileCharactersFromStoryBible — never inserts a character row", () => {
  it("leaves a bible character with NO roster match at all (name, persisted alias, or declared alias) for ensureRosterCharactersFromStory to create later", async () => {
    const character = rosterCharacter({ name: "ลลิน ศิริกุล" });
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(selectChain([]));
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      { name: "ตัวละครใหม่ที่ไม่มีในโรสเตอร์", narrativeRole: "supporting" as any },
    ]);

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

describe("reconcileCharactersFromStoryBible — legacy bibles with no aliases field", () => {
  it("still parses/behaves as exact-match-only when `aliases` is entirely absent from every profile (byte-compatible with pre-Phase-6.1 bibles)", async () => {
    const character = rosterCharacter({ name: "วรุตม์" });
    mockDb.select
      .mockReturnValueOnce(selectChain([character]))
      .mockReturnValueOnce(selectChain([]));
    const { tx, updateCalls, insertCalls } = makeTx();
    mockDb.transaction.mockImplementation(async (cb: any) => cb(tx));

    await reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, [
      { name: "วรุตม์", narrativeRole: "antagonist" as any, roleTier: "villain_male_open" as any },
      { name: "ไม่มีตัวตนในโรสเตอร์" }, // no aliases key at all — must not throw
    ]);

    expect(updateCalls).toHaveLength(1); // only the exact match updates
    expect(insertCalls).toHaveLength(0);
  });

  it("no-ops (never throws) for an empty refinedCharacters array", async () => {
    await expect(
      reconcileCharactersFromStoryBible(TENANT, USER_ID, SERIES_ID, []),
    ).resolves.toBeUndefined();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
