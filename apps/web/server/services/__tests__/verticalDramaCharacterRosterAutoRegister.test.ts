/**
 * Coverage for `verticalDramaCharacterRosterAutoRegister.ts`'s pure
 * candidate-selection + junk-guard helper
 * (`planning/vd-auto-register-story-characters/plan.md`), PLUS (added
 * `planning/vd-character-identity-repair/plan.md` Phase 1) the role-
 * threading + slugify-hash-fallback behavior of the DB-backed
 * `ensureRosterCharactersFromStory` and the exported `slugifyForCharacterKey`
 * helper. The DB-backed suite mirrors
 * `verticalDramaLocationReconciliation.test.ts`'s hoisted in-memory
 * select/insert/transaction mocking convention.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  characterRows: [] as Record<string, unknown>[],
  aliasRows: [] as Record<string, unknown>[],
  nextId: 100,
}));

vi.mock("../../db", () => {
  // Drizzle stores a pgTable's SQL name under this symbol (verified against
  // the real `drizzle/schema.ts` exports, not assumed). The mock needs it
  // because `ensureRosterCharactersFromStory` now reads/writes TWO tables —
  // before Phase 2.3/2.4 it only ever touched `vertical_drama_characters`,
  // so a table-blind mock that resolved character rows for every select was
  // sufficient. It no longer is: an alias select answered with character
  // rows yields `row.alias === undefined` and blows up in normalization.
  const TABLE_NAME = Symbol.for("drizzle:Name");
  const ALIASES_TABLE = "vertical_drama_character_aliases";
  const tableNameOf = (table: unknown): string =>
    (table as Record<symbol, string> | null)?.[TABLE_NAME] ?? "";

  function makeSelectBuilder() {
    const builder: Record<string, unknown> = {};
    let table = "";
    builder.from = (t: unknown) => {
      table = tableNameOf(t);
      return builder;
    };
    builder.where = () => builder;
    builder.then = (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void
    ) => {
      try {
        resolve(
          table === ALIASES_TABLE
            ? [...hoisted.aliasRows]
            : [...hoisted.characterRows]
        );
      } catch (err) {
        reject?.(err);
      }
    };
    return builder;
  }
  function makeInsertBuilder(target: unknown) {
    const builder: Record<string, unknown> = {};
    const table = tableNameOf(target);
    let values: Record<string, unknown> = {};
    builder.values = (v: Record<string, unknown>) => {
      values = v;
      return builder;
    };
    builder.returning = () => {
      const row = {
        id: hoisted.nextId++,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
      };
      (table === ALIASES_TABLE
        ? hoisted.aliasRows
        : hoisted.characterRows
      ).push(row);
      return Promise.resolve([row]);
    };
    // Mirrors the real UNIQUE `(seriesId, normalizedAlias)` index that the
    // production code relies on for idempotent alias seeding: a second
    // insert of the same alias is silently dropped rather than raising
    // 23505. Without modelling this, the idempotency test would pass
    // vacuously.
    builder.onConflictDoNothing = () => {
      if (table === ALIASES_TABLE) {
        const clash = hoisted.aliasRows.some(
          row =>
            row.seriesId === values.seriesId &&
            row.normalizedAlias === values.normalizedAlias
        );
        if (!clash) {
          hoisted.aliasRows.push({
            id: hoisted.nextId++,
            createdAt: new Date(),
            ...values,
          });
        }
      }
      return Promise.resolve([]);
    };
    return builder;
  }
  return {
    db: {
      select: vi.fn(() => makeSelectBuilder()),
      transaction: vi.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            insert: vi.fn((table: unknown) => makeInsertBuilder(table)),
          };
          return callback(tx);
        }
      ),
    },
  };
});

import {
  ensureRosterCharactersFromStory,
  normalizeStoryCharacterName,
  selectStoryIntroducedCharacterNames,
  slugifyForCharacterKey,
  type VdRosterAutoRegisterShot,
} from "../verticalDramaCharacterRosterAutoRegister";

const owner = { tenantId: "tenant-1", userId: 1, seriesId: 18 };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.characterRows = [];
  hoisted.aliasRows = [];
  hoisted.nextId = 100;
});

describe("selectStoryIntroducedCharacterNames", () => {
  it("selects a speaker with >=2 dialogue lines who is not in the roster", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      {
        dialogue_lines: [
          { speaker: "มินตรา" },
          { speaker: "มินตรา" },
        ],
      },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: ["นารา"],
    });
    expect(result).toEqual(["มินตรา"]);
  });

  it("selects a name that appears in a shot's characters[]", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      { characters: [{ name: "สมชาย" }] },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: [],
    });
    expect(result).toEqual(["สมชาย"]);
  });

  it("does NOT select a one-off lone speaker (only 1 dialogue line, never in characters[])", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      { dialogue_lines: [{ speaker: "คนแปลกหน้า" }] },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: [],
    });
    expect(result).toEqual([]);
  });

  it("does NOT select junk/silence/sound speaker labels even with >=2 lines or in characters[]", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      {
        characters: [{ name: "narrator" }, { name: "ทุกคน" }],
        dialogue_lines: [
          { speaker: "unknown" },
          { speaker: "unknown" },
          { speaker: "เสียง" },
          { speaker: "เสียง" },
          { speaker: "SFX: door" },
          { speaker: "SFX: door" },
        ],
      },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: [],
    });
    expect(result).toEqual([]);
  });

  it("does NOT duplicate an existing roster name that differs only by case/spacing", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      {
        characters: [{ name: "  MinTra  " }],
        dialogue_lines: [{ speaker: "mintra" }, { speaker: "mintra" }],
      },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: ["mintra"],
    });
    expect(result).toEqual([]);
  });

  it("selects nothing for an empty deep-draft", () => {
    const result = selectStoryIntroducedCharacterNames({
      shots: [],
      existingRosterNames: ["นารา"],
    });
    expect(result).toEqual([]);
  });

  it("dedups a name that appears both in characters[] and as a repeated speaker across shots, returning it once", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      { characters: [{ name: "วิน" }] },
      { dialogue_lines: [{ speaker: "วิน" }, { speaker: "วิน" }] },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: [],
    });
    expect(result).toEqual(["วิน"]);
  });

  it("keeps the first-seen canonical (un-normalized) display name", () => {
    const shots: VdRosterAutoRegisterShot[] = [
      { characters: [{ name: "Nara  Kim" }] },
      { dialogue_lines: [{ speaker: "nara kim" }, { speaker: "nara kim" }] },
    ];
    const result = selectStoryIntroducedCharacterNames({
      shots,
      existingRosterNames: [],
    });
    expect(result).toEqual(["Nara  Kim"]);
  });
});

describe("normalizeStoryCharacterName", () => {
  it("case-folds and collapses internal whitespace runs", () => {
    expect(normalizeStoryCharacterName("  Mín  Tra ")).toBe("mín tra");
  });
});

/**
 * `planning/vd-character-identity-repair/plan.md` Phase 1 — regression
 * coverage for the confirmed production bug: every Thai (or otherwise
 * non-Latin) name used to collapse to the literal `"character"`, so 13
 * unrelated characters in one series all collided on `character-2` …
 * `character-14`. See `slugifyForCharacterKey`'s own doc comment for the
 * full root-cause writeup.
 */
describe("slugifyForCharacterKey", () => {
  it("keeps the byte-identical Latin slug for a Latin-script name (unchanged behavior)", () => {
    expect(slugifyForCharacterKey("Nara Kim")).toBe("nara-kim");
  });

  it("is STABLE: the same Thai name always yields the same key across calls", () => {
    const first = slugifyForCharacterKey("คิริน วัฒนเมธา");
    const second = slugifyForCharacterKey("คิริน วัฒนเมธา");
    expect(first).toBe(second);
  });

  it("never falls back to the old meaningless literal 'character' for a pure-Thai name", () => {
    expect(slugifyForCharacterKey("คิริน วัฒนเมธา")).not.toBe("character");
    expect(slugifyForCharacterKey("คิริน วัฒนเมธา")).toMatch(/^c-[0-9a-f]{8}$/);
  });

  it("is DISTINCT: two different Thai names never collide on the old 'character' fallback", () => {
    const kirin = slugifyForCharacterKey("คิริน วัฒนเมธา");
    const lalin = slugifyForCharacterKey("ลลิน ศิริกุล");
    const theera = slugifyForCharacterKey("ธีร์");
    expect(kirin).not.toBe(lalin);
    expect(kirin).not.toBe(theera);
    expect(lalin).not.toBe(theera);
  });

  it("produces a stable, non-empty key for a mixed Latin+Thai name", () => {
    const mixed = slugifyForCharacterKey("Lalin ลลิน");
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed).toBe(slugifyForCharacterKey("Lalin ลลิน"));
  });

  it("stays within the varchar(64) characterKey column limit", () => {
    const longThaiName = "ตัวละครที่มีชื่อยาวมากเพื่อทดสอบขีดจำกัดความยาวของคอลัมน์".repeat(3);
    expect(slugifyForCharacterKey(longThaiName).length).toBeLessThanOrEqual(64);
  });
});

/**
 * `planning/vd-character-identity-repair/plan.md` Phase 1 — role-threading
 * regression coverage: the bible's `refinedCharacters` role data must reach
 * the INSERT, and a name introduced only by the deep-draft shots (never
 * declared in the bible) must still land with null roles + review pending,
 * preserving the pre-fix distinction described in this function's own doc
 * comment ("Role threading").
 */
describe("ensureRosterCharactersFromStory", () => {
  it("inserts a bible-declared (refinedCharacters) character with its role fields populated and roleReviewStatus 'ready'", async () => {
    const summary = await ensureRosterCharactersFromStory(owner, {
      refinedCharacters: [
        {
          name: "คิริน วัฒนเมธา",
          role: "พระเอก",
          narrativeRole: "protagonist",
          roleTier: "lead_male",
          occupation: "นักธุรกิจ",
        },
      ],
      deepDraftShots: [],
    });

    expect(summary.createdCharacters).toEqual([
      { characterKey: hoisted.characterRows[0]?.characterKey, name: "คิริน วัฒนเมธา" },
    ]);
    expect(hoisted.characterRows).toHaveLength(1);
    const row = hoisted.characterRows[0];
    expect(row.name).toBe("คิริน วัฒนเมธา");
    expect(row.role).toBe("พระเอก");
    expect(row.narrativeRole).toBe("protagonist");
    expect(row.roleTier).toBe("lead_male");
    expect(row.occupation).toBe("นักธุรกิจ");
    expect(row.roleProvenance).toBe("ai_assigned");
    expect(row.roleReviewStatus).toBe("ready");
  });

  it("falls back to needs_role_review for a bible-declared character missing EITHER narrativeRole or roleTier", async () => {
    await ensureRosterCharactersFromStory(owner, {
      refinedCharacters: [{ name: "เมฆ", role: "เพื่อนสนิท", narrativeRole: "supporting" }],
      deepDraftShots: [],
    });

    expect(hoisted.characterRows).toHaveLength(1);
    expect(hoisted.characterRows[0].narrativeRole).toBe("supporting");
    expect(hoisted.characterRows[0].roleTier).toBeNull();
    expect(hoisted.characterRows[0].roleReviewStatus).toBe("needs_role_review");
  });

  it("inserts a shot-only character (not in refinedCharacters) with NULL roles and needs_role_review, never inheriting another character's role", async () => {
    const summary = await ensureRosterCharactersFromStory(owner, {
      refinedCharacters: [
        {
          name: "คิริน วัฒนเมธา",
          narrativeRole: "protagonist",
          roleTier: "lead_male",
        },
      ],
      deepDraftShots: [
        {
          characters: [{ name: "คนขับแท็กซี่" }],
          dialogue_lines: [
            { speaker: "คนขับแท็กซี่" },
            { speaker: "คนขับแท็กซี่" },
          ],
        },
      ],
    });

    expect(summary.createdCharacters.map(c => c.name).sort()).toEqual(
      ["คนขับแท็กซี่", "คิริน วัฒนเมธา"].sort()
    );
    const taxiDriver = hoisted.characterRows.find(r => r.name === "คนขับแท็กซี่");
    expect(taxiDriver).toBeDefined();
    expect(taxiDriver?.role).toBeNull();
    expect(taxiDriver?.narrativeRole).toBeNull();
    expect(taxiDriver?.roleTier).toBeNull();
    expect(taxiDriver?.occupation).toBeNull();
    expect(taxiDriver?.roleReviewStatus).toBe("needs_role_review");

    // The bible-declared character in the SAME call still gets its own role
    // — confirms the shot-only character didn't inherit it, and vice versa.
    const kirin = hoisted.characterRows.find(r => r.name === "คิริน วัฒนเมธา");
    expect(kirin?.narrativeRole).toBe("protagonist");
    expect(kirin?.roleReviewStatus).toBe("ready");
  });

  it("does NOT re-insert or overwrite an already-registered character (INSERT-only, idempotent)", async () => {
    hoisted.characterRows = [
      {
        id: 1,
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        characterKey: "kirin-existing",
        name: "คิริน วัฒนเมธา",
        narrativeRole: null,
        roleTier: null,
        roleReviewStatus: "needs_role_review",
      },
    ];

    const summary = await ensureRosterCharactersFromStory(owner, {
      refinedCharacters: [
        { name: "คิริน วัฒนเมธา", narrativeRole: "protagonist", roleTier: "lead_male" },
      ],
      deepDraftShots: [],
    });

    expect(summary.createdCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(1);
    // Existing row is completely untouched — still null roles.
    expect(hoisted.characterRows[0].narrativeRole).toBeNull();
  });

  /*
   * `planning/vd-character-identity-repair/plan.md` Phase 2.3/2.4.
   *
   * THE regression this phase exists to prevent. Phase 2.0/2.1 tell the model
   * (via the deep-draft prompt's CHARACTER BIBLE block) that it may write
   * either the canonical name or any declared alias, and the completeness gate
   * accepts both. If auto-register still deduped on roster `name` alone, the
   * model doing EXACTLY what we ask — writing "คิริน" — would not match
   * "คิริน วัฒนเมธา" and would mint a second row. Aliases would then cause the
   * very duplicate-roster bug they were added to fix.
   *
   * This is not hypothetical: series 18's live draft writes "คิริน" in 176
   * shots and the bible's full name in exactly 0 of its 20 episodes.
   */
  it("does NOT create a duplicate row when a shot uses a bible-DECLARED alias of an existing character", async () => {
    hoisted.characterRows = [
      {
        id: 1,
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        characterKey: "kirin-existing",
        name: "คิริน วัฒนเมธา",
        narrativeRole: "protagonist",
        roleTier: "lead_male",
        roleReviewStatus: "ready",
      },
    ];

    const summary = await ensureRosterCharactersFromStory(owner, {
      refinedCharacters: [
        {
          name: "คิริน วัฒนเมธา",
          narrativeRole: "protagonist",
          roleTier: "lead_male",
          aliases: ["คิริน"],
        },
      ],
      // The story writes the SHORT form, exactly as the bible declares it may.
      deepDraftShots: [
        { characters: [{ name: "คิริน" }] },
        {
          characters: [{ name: "คิริน" }],
          dialogue_lines: [{ speaker: "คิริน" }, { speaker: "คิริน" }],
        },
      ],
    });

    expect(summary.createdCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(1);
  });

  it("seeds bible-declared aliases into the alias table, idempotently", async () => {
    const refinedCharacters = [
      {
        name: "ลลิน ศิริกุล",
        narrativeRole: "co_protagonist" as const,
        roleTier: "lead_female" as const,
        // A self-alias carries no information and must be skipped.
        aliases: ["ลลิน", "ลลิน ศิริกุล"],
      },
    ];

    await ensureRosterCharactersFromStory(owner, {
      refinedCharacters,
      deepDraftShots: [],
    });

    expect(hoisted.characterRows).toHaveLength(1);
    expect(hoisted.aliasRows).toHaveLength(1);
    expect(hoisted.aliasRows[0]).toMatchObject({
      alias: "ลลิน",
      normalizedAlias: "ลลิน",
      source: "bible_declared",
      characterId: hoisted.characterRows[0].id,
    });

    // Re-running the same deep draft must insert nothing new and must not
    // throw on the UNIQUE (seriesId, normalizedAlias) index.
    await ensureRosterCharactersFromStory(owner, {
      refinedCharacters,
      deepDraftShots: [],
    });

    expect(hoisted.characterRows).toHaveLength(1);
    expect(hoisted.aliasRows).toHaveLength(1);
  });

  it("still treats a PERSISTED alias row as claimed, even when refinedCharacters is not threaded", async () => {
    hoisted.characterRows = [
      {
        id: 1,
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        characterKey: "lalin-existing",
        name: "ลลิน ศิริกุล",
      },
    ];
    hoisted.aliasRows = [
      {
        id: 50,
        tenantId: owner.tenantId,
        seriesId: owner.seriesId,
        characterId: 1,
        alias: "ลลิน",
        normalizedAlias: "ลลิน",
        source: "bible_declared",
      },
    ];

    // A shots-only extend run: no refinedCharacters at all.
    const summary = await ensureRosterCharactersFromStory(owner, {
      deepDraftShots: [{ characters: [{ name: "ลลิน" }] }],
    });

    expect(summary.createdCharacters).toEqual([]);
    expect(hoisted.characterRows).toHaveLength(1);
  });
});
