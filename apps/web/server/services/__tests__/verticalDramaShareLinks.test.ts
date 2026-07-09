/**
 * Vertical Drama Series — read-only share links SERVICE coverage (task #32,
 * Collab-lite L1, F131AA). Same "mock the whole module graph, test the
 * exported function directly" convention as
 * `server/services/__tests__/verticalDramaAdBanner.test.ts`.
 *
 * Focus (mirrors the task's explicit security checklist):
 *  - token generation/hashing; the RAW token is never what gets persisted
 *    (only `hashShareToken(token)` is ever passed to `db.insert`).
 *  - expiry / revoked / unknown-token all resolve to the exact SAME
 *    generic error (never distinguishable).
 *  - the whitelist projection — explicit assert-ABSENT list of every
 *    forbidden field/substring the plan.md "MUST-NOT-INCLUDE" list names.
 *  - the ≤5 active-link cap, and immediate/idempotent revoke.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

import {
  MAX_ACTIVE_SERIES_SHARE_LINKS,
  SHARE_LINK_GENERIC_ERROR_MESSAGE,
  generateRawShareToken,
  hashShareToken,
  isSeriesShareLinkActive,
  createSeriesShareLink,
  listSeriesShareLinks,
  revokeSeriesShareLink,
  resolveSharedSeriesProjection,
  deriveRoughEpisodeStatus,
  resolveEpisodeLoglineFromBible,
  extractDialogueExcerpt,
} from "../verticalDramaShareLinks";

/** Thenable select-chain stub — same shape as `verticalDramaSeries.deleteSeries.test.ts`'s helper. */
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

function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function updateChain() {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(undefined)),
  };
  return chain;
}

const TENANT_ID = "tenant-1";
const SERIES_ID = 10;
const USER_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("token generation + hashing", () => {
  it("generateRawShareToken returns a base64url string with 256 bits of entropy (32 random bytes)", () => {
    const token = generateRawShareToken();
    // base64url alphabet only — no '+', '/', or '=' padding.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> 43 base64url chars (no padding).
    expect(token.length).toBe(43);
  });

  it("generateRawShareToken never repeats across calls", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRawShareToken()));
    expect(tokens.size).toBe(50);
  });

  it("hashShareToken produces a deterministic 64-char lowercase hex SHA-256 digest", () => {
    const hash1 = hashShareToken("abc123");
    const hash2 = hashShareToken("abc123");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashShareToken produces different hashes for different tokens", () => {
    expect(hashShareToken("token-a")).not.toBe(hashShareToken("token-b"));
  });

  it("the raw token never equals its own hash", () => {
    const token = generateRawShareToken();
    expect(hashShareToken(token)).not.toBe(token);
  });
});

describe("isSeriesShareLinkActive", () => {
  it("is active when revokedAt is null and expiresAt is in the future", () => {
    expect(
      isSeriesShareLinkActive({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(true);
  });

  it("is inactive when revokedAt is set, regardless of expiresAt", () => {
    expect(
      isSeriesShareLinkActive({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toBe(false);
  });

  it("is inactive when expiresAt is in the past", () => {
    expect(
      isSeriesShareLinkActive({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ).toBe(false);
  });
});

describe("createSeriesShareLink", () => {
  it("stores ONLY the SHA-256 hash of the token — the raw token is never passed to db.insert", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // active-link count query — 0 active

    let capturedValues: any = null;
    const chain = insertChain([
      { id: 1, tenantId: TENANT_ID, seriesId: SERIES_ID, expiresAt: new Date("2026-08-01"), createdAt: new Date("2026-07-09") },
    ]);
    chain.values = vi.fn((values: any) => {
      capturedValues = values;
      return chain;
    });
    mockDb.insert.mockReturnValueOnce(chain);

    const result = await createSeriesShareLink({
      tenantId: TENANT_ID,
      seriesId: SERIES_ID,
      createdByUserId: USER_ID,
      expiresInDays: 7,
    });

    expect(capturedValues).toBeTruthy();
    expect(capturedValues.tokenHash).toBe(hashShareToken(result.token));
    // The raw token itself must never appear as a persisted field.
    expect(capturedValues.token).toBeUndefined();
    expect(Object.values(capturedValues)).not.toContain(result.token);
  });

  it("returns the raw token, expiresAt, and createdAt on success", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const createdAt = new Date("2026-07-09T00:00:00Z");
    const expiresAt = new Date("2026-08-08T00:00:00Z");
    mockDb.insert.mockReturnValueOnce(
      insertChain([{ id: 5, tenantId: TENANT_ID, seriesId: SERIES_ID, expiresAt, createdAt }]),
    );

    const result = await createSeriesShareLink({
      tenantId: TENANT_ID,
      seriesId: SERIES_ID,
      createdByUserId: USER_ID,
      expiresInDays: 30,
    });

    expect(result).toMatchObject({ id: "5", expiresAt, createdAt });
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
  });

  it(`throws PRECONDITION_FAILED and never inserts once ${MAX_ACTIVE_SERIES_SHARE_LINKS} active links already exist`, async () => {
    const activeRows = Array.from({ length: MAX_ACTIVE_SERIES_SHARE_LINKS }, (_, i) => ({ id: i + 1 }));
    mockDb.select.mockReturnValueOnce(selectChain(activeRows));

    await expect(
      createSeriesShareLink({
        tenantId: TENANT_ID,
        seriesId: SERIES_ID,
        createdByUserId: USER_ID,
        expiresInDays: 7,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("allows creation when exactly one slot under the cap remains", async () => {
    const activeRows = Array.from({ length: MAX_ACTIVE_SERIES_SHARE_LINKS - 1 }, (_, i) => ({ id: i + 1 }));
    mockDb.select.mockReturnValueOnce(selectChain(activeRows));
    mockDb.insert.mockReturnValueOnce(
      insertChain([{ id: 99, tenantId: TENANT_ID, seriesId: SERIES_ID, expiresAt: new Date(), createdAt: new Date() }]),
    );

    await expect(
      createSeriesShareLink({
        tenantId: TENANT_ID,
        seriesId: SERIES_ID,
        createdByUserId: USER_ID,
        expiresInDays: 7,
      }),
    ).resolves.toMatchObject({ id: "99" });
  });
});

describe("listSeriesShareLinks", () => {
  it("never selects the tokenHash column", async () => {
    let capturedColumns: any = null;
    mockDb.select.mockImplementationOnce((columns: any) => {
      capturedColumns = columns;
      return selectChain([]);
    });

    await listSeriesShareLinks({ tenantId: TENANT_ID, seriesId: SERIES_ID });

    expect(capturedColumns).toBeTruthy();
    expect(capturedColumns).not.toHaveProperty("tokenHash");
    expect(capturedColumns).not.toHaveProperty("token");
  });

  it("marks a non-revoked, non-expired link as active and a revoked one as inactive", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 1,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
          revokedAt: null,
          accessCount: 3,
          lastAccessedAt: new Date(),
        },
        {
          id: 2,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
          revokedAt: new Date(),
          accessCount: 0,
          lastAccessedAt: null,
        },
      ]),
    );

    const { links } = { links: await listSeriesShareLinks({ tenantId: TENANT_ID, seriesId: SERIES_ID }) };

    expect(links.find(l => l.id === "1")?.active).toBe(true);
    expect(links.find(l => l.id === "2")?.active).toBe(false);
  });
});

describe("revokeSeriesShareLink", () => {
  it("throws NOT_FOUND when the link does not belong to this tenant/series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      revokeSeriesShareLink({ tenantId: TENANT_ID, seriesId: SERIES_ID, linkId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("is idempotent — a link that's already revoked is not re-updated", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: 1, revokedAt: new Date("2026-07-01") }]));

    const result = await revokeSeriesShareLink({ tenantId: TENANT_ID, seriesId: SERIES_ID, linkId: 1 });

    expect(result).toEqual({ revoked: true });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("revokes an active link immediately", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: 1, revokedAt: null }]));
    mockDb.update.mockReturnValueOnce(updateChain());

    const result = await revokeSeriesShareLink({ tenantId: TENANT_ID, seriesId: SERIES_ID, linkId: 1 });

    expect(result).toEqual({ revoked: true });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

describe("deriveRoughEpisodeStatus", () => {
  it("is 'draft' when neither script nor assemblyManifest is present", () => {
    expect(deriveRoughEpisodeStatus({})).toBe("draft");
    expect(deriveRoughEpisodeStatus({ script: null, assemblyManifest: null })).toBe("draft");
  });

  it("is 'scripted' when script is present but assemblyManifest is not", () => {
    expect(deriveRoughEpisodeStatus({ script: { hook: "x" } })).toBe("scripted");
  });

  it("is 'video' when assemblyManifest is present, regardless of script", () => {
    expect(deriveRoughEpisodeStatus({ script: { hook: "x" }, assemblyManifest: { done: true } })).toBe("video");
    expect(deriveRoughEpisodeStatus({ assemblyManifest: { done: true } })).toBe("video");
  });
});

describe("resolveEpisodeLoglineFromBible", () => {
  const bible = {
    logline: "series logline",
    episodeBreakdown: [
      { episodeNumber: 1, workingTitle: "Ep 1", logline: "first episode logline", keyBeats: ["a", "b"] },
      { episodeNumber: 2, workingTitle: "Ep 2", logline: "", keyBeats: ["c"] },
    ],
  };

  it("returns the matching episode's logline", () => {
    expect(resolveEpisodeLoglineFromBible(bible, 1)).toBe("first episode logline");
  });

  it("returns null for a blank logline", () => {
    expect(resolveEpisodeLoglineFromBible(bible, 2)).toBeNull();
  });

  it("returns null when there is no matching breakdown entry", () => {
    expect(resolveEpisodeLoglineFromBible(bible, 99)).toBeNull();
  });

  it("returns null for a null bible or a bible with no episodeBreakdown array", () => {
    expect(resolveEpisodeLoglineFromBible(null, 1)).toBeNull();
    expect(resolveEpisodeLoglineFromBible({ logline: "x" }, 1)).toBeNull();
  });
});

describe("extractDialogueExcerpt — whitelist enforcement", () => {
  it("returns undefined when there is no dialogueAudioPlan", () => {
    expect(extractDialogueExcerpt(null)).toBeUndefined();
    expect(extractDialogueExcerpt(undefined)).toBeUndefined();
  });

  it("returns undefined when dialogueLines is empty", () => {
    expect(extractDialogueExcerpt({ dialogueLines: [] })).toBeUndefined();
  });

  it("extracts ONLY speaker+text and drops every other field on the line and the plan", () => {
    const plan = {
      planId: "plan-1",
      audioStrategy: "separate_tts_voiceover",
      dialogueLines: [
        {
          lineId: "line-1",
          shotNumber: 3,
          speakerName: "Aria",
          speakerCharacterId: "char-1",
          isNarration: false,
          text: "อย่าไปที่นั่นเลย",
          start: 1.2,
          end: 3.4,
          targetDurationSeconds: 2.2,
          subtitleCueId: "cue-1",
        },
      ],
      speakerVoiceMap: {
        entries: [{ speakerName: "Aria", voiceId: "voice-xyz", voiceProvider: "elevenlabs", voiceModelId: "eleven-v2" }],
      },
      separateTtsPlan: {
        provider: "elevenlabs",
        items: [{ lineId: "line-1", audioTask: { audioUrl: "https://cdn.example.com/secret.mp3", mediaAssetId: "asset-1" } }],
      },
      subtitleCues: [{ cueId: "cue-1", text: "..." }],
    };

    const result = extractDialogueExcerpt(plan);

    expect(result).toEqual([{ speaker: "Aria", text: "อย่าไปที่นั่นเลย" }]);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "voiceId",
      "voiceProvider",
      "voiceModelId",
      "audioUrl",
      "mediaAssetId",
      "subtitleCueId",
      "shotNumber",
      "lineId",
      "start",
      "end",
      "elevenlabs",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("skips malformed lines instead of throwing", () => {
    expect(
      extractDialogueExcerpt({ dialogueLines: [null, { speakerName: 1, text: "x" }, { speakerName: "A", text: "" }] }),
    ).toBeUndefined();
  });
});

describe("resolveSharedSeriesProjection", () => {
  it("throws the generic error for a blank token WITHOUT touching the database", async () => {
    await expect(resolveSharedSeriesProjection("   ")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: SHARE_LINK_GENERIC_ERROR_MESSAGE,
    });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws the generic error for an unknown token", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // link lookup — no row

    await expect(resolveSharedSeriesProjection("unknown-token")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: SHARE_LINK_GENERIC_ERROR_MESSAGE,
    });
  });

  it("throws the exact SAME generic error for an expired token as for an unknown token", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 1,
          tenantId: TENANT_ID,
          seriesId: SERIES_ID,
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000),
        },
      ]),
    );

    await expect(resolveSharedSeriesProjection("expired-token")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: SHARE_LINK_GENERIC_ERROR_MESSAGE,
    });
  });

  it("throws the exact SAME generic error for a revoked token as for an unknown token", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 1,
          tenantId: TENANT_ID,
          seriesId: SERIES_ID,
          revokedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]),
    );

    await expect(resolveSharedSeriesProjection("revoked-token")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: SHARE_LINK_GENERIC_ERROR_MESSAGE,
    });
  });

  it("bumps accessCount/lastAccessedAt and returns the whitelist projection on a valid link", async () => {
    const linkRow = {
      id: 7,
      tenantId: TENANT_ID,
      seriesId: SERIES_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([linkRow])) // link lookup
      .mockReturnValueOnce(
        selectChain([
          {
            title: "Corporate Betrayal",
            genre: "Drama",
            tone: "Dark",
            targetEpisodeCount: 12,
            bible: {
              logline: "series logline",
              mainPlot: "main plot text",
              seasonArc: "season arc text",
              episodeBreakdown: [{ episodeNumber: 1, logline: "ep 1 logline" }],
            },
          },
        ]),
      ) // series lookup
      .mockReturnValueOnce(
        selectChain([
          {
            episodeNumber: 1,
            title: "Pilot",
            script: { hook: "hooked" },
            assemblyManifest: null,
            dialogueAudioPlan: { dialogueLines: [{ speakerName: "Aria", text: "line one" }] },
          },
        ]),
      ); // episode list

    const updateSetSpy = vi.fn(() => updateChain());
    mockDb.update.mockReturnValueOnce({ set: updateSetSpy });
    updateSetSpy.mockReturnValueOnce(updateChain());

    const projection = await resolveSharedSeriesProjection("valid-token");

    expect(projection).toEqual({
      series: { title: "Corporate Betrayal", genre: "Drama", tone: "Dark", targetEpisodeCount: 12 },
      overview: { logline: "series logline", mainPlot: "main plot text", seasonArc: "season arc text" },
      episodes: [
        {
          episodeNumber: 1,
          title: "Pilot",
          roughStatus: "scripted",
          logline: "ep 1 logline",
          dialogue: [{ speaker: "Aria", text: "line one" }],
        },
      ],
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("prefers expandedSeasonArc over seasonArc when both are present", async () => {
    const linkRow = {
      id: 7,
      tenantId: TENANT_ID,
      seriesId: SERIES_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([linkRow]))
      .mockReturnValueOnce(
        selectChain([
          {
            title: "S",
            genre: null,
            tone: null,
            targetEpisodeCount: 5,
            bible: { seasonArc: "legacy arc", expandedSeasonArc: "expanded arc" },
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain()) });

    const projection = await resolveSharedSeriesProjection("valid-token");
    expect(projection.overview.seasonArc).toBe("expanded arc");
  });

  it("MUST-NOT-INCLUDE: the serialized projection never contains credits/cost, model/provider ids, productTieIn config, forbiddenClaims, approval internals, emails, prompts, or asset URLs — even when the underlying rows carry them", async () => {
    const linkRow = {
      id: 7,
      tenantId: TENANT_ID,
      seriesId: SERIES_ID,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([linkRow]))
      .mockReturnValueOnce(
        selectChain([
          {
            title: "Corporate Betrayal",
            genre: "Drama",
            tone: "Dark",
            targetEpisodeCount: 12,
            bible: {
              logline: "a logline",
              mainPlot: "a plot",
              seasonArc: "an arc",
              episodeBreakdown: [
                {
                  episodeNumber: 1,
                  logline: "ep logline",
                  keyBeats: ["secret-beat-should-not-leak"],
                  shotDrafts: [{ shot_number: 1, dialogue_lines: [{ speaker: "X", line: "hidden" }] }],
                  contentBudget: { estimatedSpeechSeconds: 42 },
                },
              ],
            },
          },
        ]),
      )
      .mockReturnValueOnce(
        selectChain([
          {
            episodeNumber: 1,
            title: "Pilot",
            script: {
              episodeTitle: "Pilot",
              hook: "hidden-hook-text",
              productTieInUsage: { approvedByUserId: "user-should-not-leak" },
            },
            assemblyManifest: null,
            dialogueAudioPlan: {
              dialogueLines: [
                {
                  speakerName: "Aria",
                  text: "buy NovaGlow serum today",
                  audioTask: { audioUrl: "https://cdn.example.com/leak.mp3" },
                },
              ],
              speakerVoiceMap: { entries: [{ voiceProvider: "elevenlabs-should-not-leak" }] },
            },
          },
        ]),
      );
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain()) });

    const projection = await resolveSharedSeriesProjection("valid-token");
    const serialized = JSON.stringify(projection);

    // Product NAME inside dialogue TEXT is acceptable story content...
    expect(serialized).toContain("buy NovaGlow serum today");
    // ...but nothing else from the source rows may leak through.
    for (const forbidden of [
      "costUsd",
      "creditsUsed",
      "credits",
      "voiceProvider",
      "elevenlabs-should-not-leak",
      "forbiddenClaims",
      "approvedByUserId",
      "user-should-not-leak",
      "audioUrl",
      "leak.mp3",
      "secret-beat-should-not-leak",
      "shotDrafts",
      "hidden-hook-text",
      "contentBudget",
      "productTieInUsage",
      "hidden",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
