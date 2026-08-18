import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock for `listDramaSeriesCharactersForPicker` (marketplace two-character
// conversation picker, plan `planning/marketplace-two-character-conversation/plan.md`
// §3.7) — a queue-based `db.select(...)` chain, following the same
// `vi.hoisted(() => vi.fn())` + `vi.mock("../../db", () => ({ getDb: ... }))`
// convention already established in `autoTeamRetentionService.test.ts`
// (this service uses `getDb()`, not the `db` singleton object some other
// services import, so `getDb` — not `db` — is what's mocked here).
//
// The chain returned per `select()` call is deliberately shape-agnostic
// (`.from()/.where()/.limit()/.orderBy()/.innerJoin()` all just return the
// same thenable) since `listDramaSeriesCharactersForPicker` issues 4
// differently-shaped query chains (select().from().where().limit(1);
// select().from().where().orderBy(); select().from().innerJoin().where().orderBy();
// select().from().where() resolved directly) — what matters for these tests
// is call ORDER (queued FIFO), not the exact chain shape, since the function
// awaits each query sequentially before issuing the next.
// ---------------------------------------------------------------------------
const { mockGetDb, queueSelect, resetDbHarness } = vi.hoisted(() => {
  let selectQueue: unknown[][] = [];

  function chain(rows: unknown[]): any {
    const promise = Promise.resolve(rows);
    const obj: any = {
      from: () => obj,
      where: () => obj,
      limit: () => obj,
      orderBy: () => obj,
      innerJoin: () => obj,
      then: (onFulfilled: any, onRejected: any) => promise.then(onFulfilled, onRejected),
      catch: (onRejected: any) => promise.catch(onRejected),
    };
    return obj;
  }

  const mockSelect = vi.fn(() => chain(selectQueue.shift() ?? []));
  const mockDb = { select: mockSelect };
  const mockGetDb = vi.fn(() => mockDb);

  return {
    mockGetDb,
    queueSelect: (rows: unknown[]) => {
      selectQueue.push(rows);
    },
    resetDbHarness: () => {
      selectQueue = [];
      mockSelect.mockClear();
      mockGetDb.mockClear();
    },
  };
});

vi.mock("../../db", () => ({ getDb: mockGetDb }));

import {
  listDramaSeriesCharactersForPicker,
  projectDramaShotDialogueLinesForExtension,
  projectDramaShotReferenceImagesForExtension,
  resolveDramaShotCharacterRefsForExtension,
} from "../verticalDramaExtensionReadService";
import { estimateVerticalDramaSpeechSeconds } from "../../../shared/verticalDramaSeries/dialogueQuality";

describe("projectDramaShotDialogueLinesForExtension", () => {
  it("returns only the requested shot's safe dialogue fields with planned durations", () => {
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 2,
      dialogueAudioPlan: {
        dialogueLines: [
          {
            lineId: "line-1",
            shotNumber: 2,
            speakerName: "ใบข้าว",
            speakerCharacterId: "char-1",
            text: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?",
            start: 0,
            end: 3.2,
            targetDurationSeconds: 3.2,
            voiceId: "private-voice-id",
          },
          {
            lineId: "line-2",
            shotNumber: 3,
            speakerName: "อารมณ์",
            text: "ต้องไม่รั่วไหล",
            targetDurationSeconds: 2,
          },
        ],
      },
      clipDialogue: [{ characterKey: "ใบข้าว", lineTh: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?", emotion: "ลังเล" }],
    });

    expect(lines).toEqual([{
      speaker: "ใบข้าว",
      emotion: "ลังเล",
      text: "แม่คะ ถ้าไม่ลอง เดี๋ยวมันก็ไม่รู้ใช่ไหมคะ?",
      durationSeconds: 3.2,
    }]);
    expect(JSON.stringify(lines)).not.toContain("private-voice-id");
  });

  it("estimates a clip dialogue speaking length from text when no plan exists", () => {
    const lineTh = "หนูไม่ยอมแพ้หรอก";
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 1,
      dialogueAudioPlan: null,
      clipDialogue: [{ characterKey: "ใบข้าว", lineTh, emotion: "เด็ดเดี่ยว" }],
    });
    expect(lines).toEqual([{
      speaker: "ใบข้าว",
      emotion: "เด็ดเดี่ยว",
      text: lineTh,
      durationSeconds: estimateVerticalDramaSpeechSeconds(lineTh),
    }]);
    // The estimate must be a real positive number so the extension shows a
    // speaking length instead of "ยังไม่มีเวลาพูด".
    expect(lines[0].durationSeconds).toBeGreaterThan(0);
  });

  it("resolves opaque audio-plan speaker identifiers to canonical character names", () => {
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 6,
      dialogueAudioPlan: {
        dialogueLines: [
          {
            shotNumber: 6,
            speakerName: "character-2",
            speakerCharacterId: "character-2",
            text: "ผมออกแบบดี๊ก็ได้, แต่ชีวิตผมอยากสร้างกับเธอคนเดียว",
            targetDurationSeconds: 2.7,
          },
          {
            shotNumber: 6,
            speakerName: "character",
            speakerCharacterId: "character",
            text: "คิน...",
            targetDurationSeconds: 0.8,
          },
        ],
      },
      clipDialogue: [
        {
          characterKey: "character-2",
          lineTh: "ผมออกแบบดี๊ก็ได้, แต่ชีวิตผมอยากสร้างกับเธอคนเดียว",
        },
        { characterKey: "character", lineTh: "คิน..." },
      ],
      characterNameByKey: new Map([
        ["character-2", "ภาคิน"],
        ["character", "ไอริน"],
      ]),
    });

    expect(lines.map(line => line.speaker)).toEqual(["ภาคิน", "ไอริน"]);
  });

  it("resolves clip-only speaker keys and never exposes unresolved opaque identifiers", () => {
    const resolved = projectDramaShotDialogueLinesForExtension({
      shotNumber: 1,
      dialogueAudioPlan: null,
      clipDialogue: [
        { characterKey: "character-2", lineTh: "แต่งงานกับผมนะ" },
        { characterKey: "ใบข้าว", lineTh: "ชื่อแบบเก่ายังต้องอ่านได้" },
      ],
      characterNameByKey: new Map([["character-2", "ภาคิน"]]),
    });
    const unresolved = projectDramaShotDialogueLinesForExtension({
      shotNumber: 1,
      dialogueAudioPlan: null,
      clipDialogue: [
        { characterKey: "character1", lineTh: "ไม่มีข้อมูลตัวละคร" },
        { characterKey: "char_aria", lineTh: "ไม่มีตัวละครแบบ slug" },
        { characterKey: "c-0123abcd", lineTh: "ไม่มีตัวละครแบบ hash" },
      ],
      characterNameByKey: new Map(),
    });

    expect(resolved.map(line => line.speaker)).toEqual(["ภาคิน", "ใบข้าว"]);
    expect(unresolved.map(line => line.speaker)).toEqual([
      "ไม่ระบุผู้พูด",
      "ไม่ระบุผู้พูด",
      "ไม่ระบุผู้พูด",
    ]);
  });

  it("keeps narration explicit even when persisted speaker metadata is opaque", () => {
    const lines = projectDramaShotDialogueLinesForExtension({
      shotNumber: 1,
      dialogueAudioPlan: {
        dialogueLines: [
          {
            shotNumber: 1,
            speakerName: "character-3",
            speakerCharacterId: "character-3",
            isNarration: true,
            text: "หนึ่งปีต่อมา",
            targetDurationSeconds: 1,
          },
        ],
      },
      clipDialogue: [],
      characterNameByKey: new Map([["character-3", "ผู้เล่าเรื่องจำลอง"]]),
    });

    expect(lines[0]?.speaker).toBe("ผู้บรรยาย");
  });
});

describe("projectDramaShotReferenceImagesForExtension", () => {
  it("keeps only reference frames and one portrait for each character required by this shot", () => {
    const images = projectDramaShotReferenceImagesForExtension({
      shotReferenceRows: [
        {
          id: 10,
          mediaAssetId: 100,
          role: "reference",
          source: "reference_frame",
          assetOriginalUrl: "/api/storage/files/reference.png",
          assetThumbnailUrl: "/api/storage/files/reference-thumb.png",
        },
        {
          id: 11,
          mediaAssetId: 101,
          role: "reference",
          source: "grid_cut",
          assetOriginalUrl: "/api/storage/files/grid-cut.png",
          assetThumbnailUrl: null,
        },
        {
          id: 12,
          mediaAssetId: 102,
          role: "reference",
          source: "generated",
          assetOriginalUrl: "/api/storage/files/generated.png",
          assetThumbnailUrl: null,
        },
      ],
      requiredCharacterRefs: ["hero"],
      characterAssetsByCharacterKey: new Map([
        ["hero", [
          { assetRowId: 20, mediaAssetId: 200, role: "primary_portrait", characterName: "ภาคิน" },
          { assetRowId: 21, mediaAssetId: 201, role: "expression", characterName: "ภาคิน" },
        ]],
        ["extra", [
          { assetRowId: 22, mediaAssetId: 202, role: "primary_portrait", characterName: "ตัวประกอบ" },
        ]],
      ]),
      assetById: new Map([
        [200, { originalUrl: "/api/storage/files/hero.png", thumbnailUrl: "/api/storage/files/hero-thumb.png" }],
        [201, { originalUrl: "/api/storage/files/hero-expression.png", thumbnailUrl: null }],
        [202, { originalUrl: "/api/storage/files/extra.png", thumbnailUrl: null }],
      ]),
    });

    expect(images).toEqual([
      {
        id: "10",
        url: "/api/storage/files/reference.png",
        thumbnailUrl: "/api/storage/files/reference-thumb.png",
        role: "reference",
        source: "reference_frame",
      },
      {
        id: "char-20",
        url: "/api/storage/files/hero.png",
        thumbnailUrl: "/api/storage/files/hero-thumb.png",
        role: "primary_portrait",
        source: "character",
        title: "ภาคิน",
      },
    ]);
  });

  it("deduplicates a character portrait already linked as a reference frame", () => {
    const images = projectDramaShotReferenceImagesForExtension({
      shotReferenceRows: [{
        id: 10,
        mediaAssetId: 200,
        role: "reference",
        source: "reference_frame",
        assetOriginalUrl: "/api/storage/files/hero.png",
        assetThumbnailUrl: null,
      }],
      requiredCharacterRefs: ["hero"],
      characterAssetsByCharacterKey: new Map([
        ["hero", [{ assetRowId: 20, mediaAssetId: 200, role: "primary_portrait", characterName: "ภาคิน" }]],
      ]),
      assetById: new Map([
        [200, { originalUrl: "/api/storage/files/hero.png", thumbnailUrl: null }],
      ]),
    });

    expect(images).toHaveLength(1);
    expect(images[0].source).toBe("reference_frame");
  });

  it("uses a protected thumbnail when a character asset has no original URL", () => {
    const images = projectDramaShotReferenceImagesForExtension({
      shotReferenceRows: [],
      requiredCharacterRefs: ["hero"],
      characterAssetsByCharacterKey: new Map([
        ["hero", [{ assetRowId: 20, mediaAssetId: 200, role: "primary_portrait", characterName: "ภาคิน" }]],
      ]),
      assetById: new Map([
        [200, { originalUrl: null, thumbnailUrl: "/api/storage/files/hero-thumb.png" }],
      ]),
    });

    expect(images[0]?.url).toBe("/api/storage/files/hero-thumb.png");
  });
});

describe("resolveDramaShotCharacterRefsForExtension", () => {
  it("uses the shot's explicit required character list even when it is intentionally empty", () => {
    expect(resolveDramaShotCharacterRefsForExtension([], ["legacy-extra"])).toEqual([]);
  });

  it("falls back to the storyboard cast for legacy frames without requiredCharacterRefs", () => {
    expect(resolveDramaShotCharacterRefsForExtension(undefined, ["hero", "support"])).toEqual([
      "hero",
      "support",
    ]);
  });
});

/**
 * `listDramaSeriesCharactersForPicker` — marketplace two-character
 * conversation picker (plan `planning/marketplace-two-character-conversation/plan.md`
 * §3.7). Security-sensitive: every query is scoped to the caller's
 * (tenantId, userId), and an unowned/missing series must resolve to a
 * 404-shaped error (never 403).
 */
describe("listDramaSeriesCharactersForPicker", () => {
  const OWNER = { userId: 42, tenantId: "tenant-1" };

  beforeEach(() => {
    resetDbHarness();
  });

  it("returns the series' characters with name/role/narrativeRole/roleTier/occupation/description/ageRange and portrait fields for a series owned by the caller", async () => {
    queueSelect([{ id: 42, title: "ซีรีส์ทดสอบ", bible: null }]); // seriesRow
    queueSelect([
      {
        id: 1,
        characterKey: "hero",
        name: "พระเอก",
        role: "protagonist",
        narrativeRole: "lead",
        roleTier: "lead_male",
        occupation: "นักสืบ",
        data: { description: "นักสืบที่เก่งกาจ", visualBible: { ageRange: "30s" } },
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
      },
    ]); // characterRows
    queueSelect([
      { characterId: 1, mediaAssetId: 500, approved: true, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]); // portraitRows (innerJoin)
    queueSelect([
      { id: 500, originalUrl: "https://cdn.example.com/500.png", thumbnailUrl: "https://cdn.example.com/500_thumb.png" },
    ]); // mediaAssets url lookup

    const result = await listDramaSeriesCharactersForPicker(OWNER, { seriesId: "42" });

    expect(result.seriesId).toBe("42");
    expect(result.seriesTitle).toBe("ซีรีส์ทดสอบ");
    expect(result.characters).toHaveLength(1);
    const hero = result.characters[0];
    expect(hero.name).toBe("พระเอก");
    expect(hero.role).toBe("protagonist");
    expect(hero.narrativeRole).toBe("lead");
    expect(hero.roleTier).toBe("lead_male");
    expect(hero.occupation).toBe("นักสืบ");
    expect(hero.description).toBe("Description: นักสืบที่เก่งกาจ");
    expect(hero.ageRange).toBe("30s");
    expect(hero.hasPortrait).toBe(true);
    expect(hero.portraitUrl).toBe("https://cdn.example.com/500.png");
    expect(hero.portraitAssetId).toBe("500");
    expect(hero.looks).toEqual([]);
  });

  it("nests a 'look' (variant) row under its parent's looks[] instead of returning it as its own top-level entry", async () => {
    queueSelect([{ id: 7, title: "Look Series", bible: null }]); // seriesRow
    queueSelect([
      {
        id: 10,
        characterKey: "base",
        name: "เบส",
        role: "lead",
        narrativeRole: "lead",
        roleTier: "lead_female",
        occupation: "ครู",
        data: { description: "ครูใจดี" },
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
      },
      {
        id: 11,
        characterKey: "base_look_winter",
        name: "เบส (ลุคหนาว)",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        data: null,
        parentCharacterId: 10,
        variantLabel: "ลุคหนาว",
        variantType: "outfit",
      },
    ]); // characterRows (1 base + 1 look)
    queueSelect([]); // portraitRows — none for either row

    const result = await listDramaSeriesCharactersForPicker(OWNER, { seriesId: "7" });

    // Exactly 1 top-level entry — the look row must NOT appear separately.
    expect(result.characters).toHaveLength(1);
    expect(result.characters[0].characterId).toBe("10");
    expect(result.characters[0].looks).toHaveLength(1);
    expect(result.characters[0].looks[0]).toMatchObject({
      characterId: "11",
      variantLabel: "ลุคหนาว",
      variantType: "outfit",
    });
  });

  async function expectNotFound(auth: { userId: number; tenantId: string }, seriesId: string) {
    let caught: unknown;
    try {
      await listDramaSeriesCharactersForPicker(auth, { seriesId });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("Drama series not found");
    expect((caught as any).status).toBe(404);
    expect((caught as any).code).toBe("not_found");
  }

  it("throws a 404-shaped error (status 404, code not_found — never 403) when the seriesId belongs to a different tenant", async () => {
    queueSelect([]); // seriesRow query scoped to (tenantId, userId, seriesId) finds nothing
    await expectNotFound({ userId: 42, tenantId: "some-other-tenant" }, "42");
  });

  it("throws a 404-shaped error (status 404, code not_found — never 403) when the seriesId belongs to a different userId", async () => {
    queueSelect([]);
    await expectNotFound({ userId: 999, tenantId: "tenant-1" }, "42");
  });

  it("throws a 404-shaped error when the seriesId does not exist at all", async () => {
    queueSelect([]);
    await expectNotFound({ userId: 42, tenantId: "tenant-1" }, "999999");
  });

  it("resolves portrait fields correctly: hasPortrait/portraitUrl/portraitAssetId are populated for a character with an approved primary_portrait asset, and null/false for one without", async () => {
    queueSelect([{ id: 20, title: "Portrait Series", bible: null }]); // seriesRow
    queueSelect([
      {
        id: 100,
        characterKey: "withPortrait",
        name: "มีรูป",
        role: "support",
        narrativeRole: "supporting",
        roleTier: "support",
        occupation: "พนักงาน",
        data: { description: "desc" },
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
      },
      {
        id: 101,
        characterKey: "noPortrait",
        name: "ไม่มีรูป",
        role: "support",
        narrativeRole: "supporting",
        roleTier: "support",
        occupation: "พนักงาน",
        data: { description: "desc" },
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
      },
    ]); // characterRows
    queueSelect([
      { characterId: 100, mediaAssetId: 700, approved: true, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]); // portraitRows — only character 100 has one
    queueSelect([
      { id: 700, originalUrl: "https://cdn.example.com/700.png", thumbnailUrl: "https://cdn.example.com/700_thumb.png" },
    ]); // mediaAssets url lookup

    const result = await listDramaSeriesCharactersForPicker(OWNER, { seriesId: "20" });

    const withPortrait = result.characters.find(c => c.characterId === "100")!;
    const noPortrait = result.characters.find(c => c.characterId === "101")!;
    expect(withPortrait.hasPortrait).toBe(true);
    expect(withPortrait.portraitUrl).toBe("https://cdn.example.com/700.png");
    expect(withPortrait.portraitAssetId).toBe("700");
    expect(noPortrait.hasPortrait).toBe(false);
    expect(noPortrait.portraitUrl).toBeNull();
    expect(noPortrait.portraitAssetId).toBeNull();
  });
});
