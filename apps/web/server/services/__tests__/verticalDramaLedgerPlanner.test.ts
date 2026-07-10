/**
 * Coverage for `verticalDramaLedgerPlanner.ts` — the service that wires the
 * new `vertical-drama-ledger-planner` skill into the (future)
 * `ledger_plan` job phase. Mirrors
 * `verticalDramaSeriesMemoryPlanning.test.ts`'s mocking pattern.
 *
 * Scope note: this test exercises `runVerticalDramaLedgerPlanning` as a
 * STANDALONE unit (mock LLM in, validated ledgers out) — it does NOT drive a
 * real `deep_generate` job end-to-end, since wiring this wrapper into
 * `generateStoryBibleDeep`'s own phase sequence lives inside
 * `verticalDramaStoryBible.ts`, which this section's task brief explicitly
 * excludes from this pass (already finalized by a prior pass). The
 * "`ledger` phase fires before `draft`" assertion below verifies THIS
 * module's own `onProgress` contract (it reports `{ phase: "ledger" }`
 * before returning), which is the exact hook a future caller inside that
 * pipeline would rely on to get the real ordering.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () => "---\nname: vertical-drama-ledger-planner\n---\nSystem prompt body"
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-ledger-planner"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-ledger-planner/skill.md"),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(
  () => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockCalculateCreditsForLLM: vi.fn(() => 5),
  })
);

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
  };
});

const { mockDebugError } = vi.hoisted(() => ({ mockDebugError: vi.fn() }));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import {
  runVerticalDramaLedgerPlanning,
  validateAndCleanLedgers,
  InsufficientCreditsError,
} from "../verticalDramaLedgerPlanner";
import { verticalDramaQualityLedgersSchema } from "@shared/verticalDramaSeries/qualityLedgers";

const VALID_LEDGER_PLAN = {
  contract_version: 1,
  ledgers: {
    evidenceLedger: [
      { id: "e1", label: "บันทึกเปื้อนเลือด", introducedEpisode: 2 },
    ],
    characterActivationLedger: [
      { character: "Mai", requiredActivationByEpisode: 5 },
    ],
    threatLadder: [{ episode: 1, threatLevel: 1 }],
    consequenceLedger: [],
    threadLedger: [{ id: "t1", label: "ปมน้องสาวหายตัวไป" }],
    worldRuleLedger: [
      { id: "w1", rule: "คำสาปส่งต่อกันได้เฉพาะเที่ยงคืน", introducedEpisode: 1 },
    ],
  },
  causal_chain_map: [{ id: "cc1", description: "a leads to b", episodes: [1, 2] }],
  character_profiles: [],
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 10,
    locale: "th" as const,
    title: "เงาในกระจก",
    activeBreakdown: [
      { episodeNumber: 1, workingTitle: "ep1", logline: "logline", keyBeats: ["beat"] },
    ],
    ...over,
  };
}

function mockSuccessfulLlmResponse(plan: Record<string, unknown> = VALID_LEDGER_PLAN) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(plan) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(5);
});

describe("runVerticalDramaLedgerPlanning — credit pre-check", () => {
  it("pre-checks with the conservative fixed estimate, not hasEnoughCredits(userId, 1)", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaLedgerPlanning(baseParams());

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    const [, amountChecked] = mockHasEnoughCredits.mock.calls[0];
    expect(amountChecked).toBeGreaterThan(1);
  });

  it("throws InsufficientCreditsError when the estimate pre-check fails, without calling the LLM", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(runVerticalDramaLedgerPlanning(baseParams())).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaLedgerPlanning — job-progress phase ordering", () => {
  it("reports { phase: \"ledger\" } BEFORE any simulated { phase: \"draft\" } progress event", async () => {
    mockSuccessfulLlmResponse();
    const phasesFired: string[] = [];

    await runVerticalDramaLedgerPlanning(
      baseParams({ onProgress: (p: { phase: string }) => phasesFired.push(p.phase) })
    );
    // Simulates the NEXT stage a real `deep_generate` job would report —
    // this module's own contract only guarantees ITS phase fires first.
    phasesFired.push("draft");

    expect(phasesFired).toEqual(["ledger", "draft"]);
  });

  it("fires onProgress BEFORE the LLM call is made", async () => {
    mockSuccessfulLlmResponse();
    const callOrder: string[] = [];
    mockExecuteWithFallback.mockImplementationOnce(async (...args: unknown[]) => {
      callOrder.push("llm_call");
      return {
        type: "success",
        response: {
          choices: [{ message: { content: JSON.stringify(VALID_LEDGER_PLAN) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        },
      };
    });

    await runVerticalDramaLedgerPlanning(
      baseParams({ onProgress: () => callOrder.push("progress_ledger") })
    );

    expect(callOrder).toEqual(["progress_ledger", "llm_call"]);
  });
});

describe("runVerticalDramaLedgerPlanning — schema validation & row-dropping", () => {
  it("returns fully-valid ledgers on a well-formed response", async () => {
    mockSuccessfulLlmResponse();

    const result = await runVerticalDramaLedgerPlanning(baseParams());

    expect(verticalDramaQualityLedgersSchema.safeParse(result.ledgers).success).toBe(true);
    expect(result.ledgers.evidenceLedger).toHaveLength(1);
    expect(result.ledgers.characterActivationLedger).toHaveLength(1);
    expect(result.droppedRowCount).toBe(0);
    expect(result.creditsUsed).toBe(5);
  });

  it("drops invalid rows instead of throwing when the LLM response has malformed ledger rows", async () => {
    const malformed = {
      contract_version: 1,
      ledgers: {
        evidenceLedger: [
          { id: "e1", label: "valid", introducedEpisode: 1 },
          { label: "missing id and introducedEpisode" }, // invalid — dropped
        ],
        characterActivationLedger: [
          { character: "Mai" }, // missing requiredActivationByEpisode — invalid, dropped
        ],
      },
      causal_chain_map: [],
    };
    mockSuccessfulLlmResponse(malformed);

    const result = await runVerticalDramaLedgerPlanning(baseParams());

    expect(verticalDramaQualityLedgersSchema.safeParse(result.ledgers).success).toBe(true);
    expect(result.ledgers.evidenceLedger).toHaveLength(1);
    expect(result.ledgers.characterActivationLedger).toHaveLength(0);
    expect(result.droppedRowCount).toBe(2);
  });

  it("never crashes the job — a wildly malformed (but valid JSON) response still returns empty, schema-valid ledgers", async () => {
    mockSuccessfulLlmResponse({ garbage: true, unrelated: [1, 2, 3] });

    const result = await runVerticalDramaLedgerPlanning(baseParams());

    expect(verticalDramaQualityLedgersSchema.safeParse(result.ledgers).success).toBe(true);
    expect(result.ledgers.evidenceLedger).toEqual([]);
    expect(result.ledgers.worldRuleLedger).toEqual([]);
  });
});

describe("runVerticalDramaLedgerPlanning — post-LLM deductCredits failure handling", () => {
  it("does not throw and still returns the ledgers when deductCredits fails after a successful LLM call", async () => {
    mockSuccessfulLlmResponse();
    mockDeductCredits.mockRejectedValue(new Error("db down"));

    const result = await runVerticalDramaLedgerPlanning(baseParams());

    expect(result.ledgers.evidenceLedger).toHaveLength(1);
    expect(mockDebugError).toHaveBeenCalledTimes(1);
  });
});

describe("validateAndCleanLedgers", () => {
  it("returns emptyQualityLedgers() shape (never throws) for a completely malformed raw value", () => {
    const { ledgers, droppedRowCount } = validateAndCleanLedgers(null);
    expect(verticalDramaQualityLedgersSchema.safeParse(ledgers).success).toBe(true);
    expect(droppedRowCount).toBe(0);
  });

  it("maps causal_chain_map (snake_case, top-level) into ledgers.causalChainMap", () => {
    const { ledgers } = validateAndCleanLedgers({
      contract_version: 1,
      ledgers: {},
      causal_chain_map: [{ id: "cc1", description: "x leads to y", episodes: [1] }],
    });
    expect(ledgers.causalChainMap).toHaveLength(1);
    expect(ledgers.causalChainMap[0].id).toBe("cc1");
  });
});
