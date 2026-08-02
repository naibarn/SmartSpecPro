/**
 * Feature 142 — section-04: `mergeQaLedger` (pure, zero mocks). See
 * `specs/feature/142-video-intelligence-structured-planning-qa-engine/sections/section-04-stage-wiring-credits.md`
 * §5.1.
 */
import { describe, expect, it } from "vitest";

import { QA_LEDGER_MAX_ENTRIES, mergeQaLedger, type QaLedgerEntry } from "../qaLedger";

function makeEntry(overrides: Partial<QaLedgerEntry> = {}): QaLedgerEntry {
  return {
    at: "2026-01-01T00:00:00.000Z",
    round: 1,
    revision: 1,
    review: { score: 8, scorecard: { clarity: 8 }, issues: [] },
    creditsUsed: 5,
    modelId: "openai/gpt-4o-mini",
    traceId: "trace-1",
    ...overrides,
  };
}

describe("mergeQaLedger", () => {
  it("creates { entries:[entry], totalCount:1 } from a null ledger", () => {
    const entry = makeEntry();
    const result = mergeQaLedger(null, entry);
    expect(result).toEqual({ entries: [entry], totalCount: 1 });
  });

  it("appends to an existing ledger and increments totalCount", () => {
    const first = makeEntry({ round: 1, traceId: "trace-1" });
    const second = makeEntry({ round: 2, traceId: "trace-2" });

    const afterFirst = mergeQaLedger(null, first);
    const afterSecond = mergeQaLedger(afterFirst, second);

    expect(afterSecond.entries).toEqual([first, second]);
    expect(afterSecond.totalCount).toBe(2);
  });

  it("treats a legacy array value as an empty ledger instead of throwing", () => {
    const legacyArray = [{ score: 5 }];
    const entry = makeEntry();

    const result = mergeQaLedger(legacyArray as unknown, entry);

    expect(result).toEqual({ entries: [entry], totalCount: 1 });
  });

  it("treats a malformed/non-object value as an empty ledger instead of throwing", () => {
    const entry = makeEntry();

    expect(mergeQaLedger("not-an-object", entry)).toEqual({ entries: [entry], totalCount: 1 });
    expect(mergeQaLedger(42, entry)).toEqual({ entries: [entry], totalCount: 1 });
    expect(mergeQaLedger(undefined, entry)).toEqual({ entries: [entry], totalCount: 1 });
    expect(mergeQaLedger({ entries: "nope" }, entry)).toEqual({ entries: [entry], totalCount: 1 });
  });

  it("retains only the newest QA_LEDGER_MAX_ENTRIES entries while totalCount keeps counting", () => {
    let ledger: unknown = null;
    const overflow = QA_LEDGER_MAX_ENTRIES + 5;
    for (let i = 1; i <= overflow; i++) {
      ledger = mergeQaLedger(ledger, makeEntry({ round: i, traceId: `trace-${i}` }));
    }

    const finalLedger = ledger as { entries: QaLedgerEntry[]; totalCount: number };
    expect(finalLedger.entries).toHaveLength(QA_LEDGER_MAX_ENTRIES);
    expect(finalLedger.totalCount).toBe(overflow);
    // Newest-retained window: the oldest 5 rounds (1..5) were dropped.
    expect(finalLedger.entries[0]!.round).toBe(6);
    expect(finalLedger.entries[finalLedger.entries.length - 1]!.round).toBe(overflow);
  });

  it("does not mutate the ledger object it was given", () => {
    const existing = mergeQaLedger(null, makeEntry({ round: 1 }));
    const existingSnapshot = JSON.parse(JSON.stringify(existing));

    mergeQaLedger(existing, makeEntry({ round: 2 }));

    expect(existing).toEqual(existingSnapshot);
  });
});
