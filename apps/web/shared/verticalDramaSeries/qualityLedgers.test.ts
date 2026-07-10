import { describe, expect, it } from "vitest";
import {
  causalChainMapEntrySchema,
  characterActivationLedgerRowSchema,
  consequenceLedgerRowSchema,
  emptyQualityLedgers,
  evidenceLedgerRowSchema,
  threadLedgerRowSchema,
  threatLadderRowSchema,
  verticalDramaQualityLedgersSchema,
  verticalDramaStoryStateSchema,
  worldRuleLedgerRowSchema,
  VD_QUALITY_LEDGER_KINDS,
} from "./qualityLedgers";

describe("qualityLedgers schemas (Feature 132 F132B)", () => {
  it("evidenceLedgerRowSchema: valid minimal object parses, missing required field rejects, unknown key passes through", () => {
    const minimal = { id: "e1", label: "bloody note", introducedEpisode: 2 };
    const parsed = evidenceLedgerRowSchema.parse(minimal);
    expect(parsed.status).toBe("open");
    expect(parsed.usedEpisodes).toEqual([]);

    expect(evidenceLedgerRowSchema.safeParse({ label: "x", introducedEpisode: 1 }).success).toBe(
      false,
    );

    const withExtra = evidenceLedgerRowSchema.parse({ ...minimal, extraKey: "keep me" });
    expect((withExtra as Record<string, unknown>).extraKey).toBe("keep me");
  });

  it("evidenceLedgerRowSchema: rejects an out-of-range status enum value", () => {
    expect(
      evidenceLedgerRowSchema.safeParse({
        id: "e1",
        label: "x",
        introducedEpisode: 1,
        status: "not_a_real_status",
      }).success,
    ).toBe(false);
  });

  it("characterActivationLedgerRowSchema: valid minimal object parses, missing required field rejects", () => {
    const parsed = characterActivationLedgerRowSchema.parse({
      character: "Mai",
      requiredActivationByEpisode: 5,
    });
    expect(parsed.status).toBe("dormant");
    expect(
      characterActivationLedgerRowSchema.safeParse({ character: "Mai" }).success,
    ).toBe(false);
  });

  it("threatLadderRowSchema: valid minimal object parses, missing required field rejects", () => {
    expect(threatLadderRowSchema.parse({ episode: 1, threatLevel: 2 }).threatLevel).toBe(2);
    expect(threatLadderRowSchema.safeParse({ threatLevel: 2 }).success).toBe(false);
  });

  it("consequenceLedgerRowSchema: valid minimal object parses, missing required field rejects", () => {
    const parsed = consequenceLedgerRowSchema.parse({
      id: "c1",
      decisionEpisode: 3,
      character: "Nok",
    });
    expect(parsed.status).toBe("pending");
    expect(
      consequenceLedgerRowSchema.safeParse({ id: "c1", decisionEpisode: 3 }).success,
    ).toBe(false);
  });

  it("threadLedgerRowSchema: valid minimal object parses, missing required field rejects", () => {
    expect(threadLedgerRowSchema.parse({ id: "t1", label: "missing sister" }).status).toBe(
      "active",
    );
    expect(threadLedgerRowSchema.safeParse({ id: "t1" }).success).toBe(false);
  });

  it("worldRuleLedgerRowSchema: valid minimal object parses with §5.2 richer shape, missing required field rejects", () => {
    const parsed = worldRuleLedgerRowSchema.parse({
      id: "w1",
      rule: "curses transfer at midnight",
      introducedEpisode: 1,
    });
    expect(parsed.usedAgainEpisodes).toEqual([]);
    expect(parsed.createsChoice).toBe(false);
    expect(parsed.verdict).toBe("keep");
    expect(worldRuleLedgerRowSchema.safeParse({ id: "w1", introducedEpisode: 1 }).success).toBe(
      false,
    );
  });

  it("causalChainMapEntrySchema: valid minimal object parses", () => {
    const parsed = causalChainMapEntrySchema.parse({ id: "cc1", description: "a causes b" });
    expect(parsed.episodes).toEqual([]);
  });

  it("verticalDramaQualityLedgersSchema: emptyQualityLedgers() parses; a full fixture round-trips losslessly", () => {
    expect(verticalDramaQualityLedgersSchema.safeParse(emptyQualityLedgers()).success).toBe(true);

    const fixture = {
      evidenceLedger: [{ id: "e1", label: "note", introducedEpisode: 1 }],
      characterActivationLedger: [
        { character: "Mai", requiredActivationByEpisode: 4 },
      ],
      threatLadder: [{ episode: 1, threatLevel: 1 }],
      consequenceLedger: [{ id: "c1", decisionEpisode: 2, character: "Nok" }],
      threadLedger: [{ id: "t1", label: "missing sister" }],
      worldRuleLedger: [{ id: "w1", rule: "curse", introducedEpisode: 1 }],
      causalChainMap: [{ id: "cc1", description: "a causes b" }],
    };
    const parsed = verticalDramaQualityLedgersSchema.parse(fixture);
    expect(parsed.evidenceLedger).toHaveLength(1);
    expect(parsed.worldRuleLedger).toHaveLength(1);
  });

  it("verticalDramaStoryStateSchema: full fixture with all 11 fields parses", () => {
    const fixture = {
      episode: 3,
      knownByProtagonist: ["the note is a fake"],
      knownByAudience: ["the killer's identity"],
      knownOnlyByAntagonist: ["where the body is"],
      evidenceGained: ["bloody knife"],
      evidenceLostOrDamaged: ["burned photo"],
      trustChanges: [{ characterA: "Mai", characterB: "Nok", change: "trust broken" }],
      emotionalResidue: [{ character: "Mai", residue: "guilt" }],
      threatLevel: 3,
      unresolvedThreadIds: ["t1"],
      requiredNextEpisodeResponse: "Mai must confront Nok",
    };
    const parsed = verticalDramaStoryStateSchema.parse(fixture);
    expect(parsed.trustChanges[0].change).toBe("trust broken");
    expect(parsed.emotionalResidue[0].residue).toBe("guilt");
  });

  it("VD_QUALITY_LEDGER_KINDS: maps the pinned §8.1 finding kinds to their source ledger", () => {
    expect(VD_QUALITY_LEDGER_KINDS.evidence_orphaned).toBe("evidenceLedger");
    expect(VD_QUALITY_LEDGER_KINDS.character_agency_zero_decisions).toBe(
      "characterActivationLedger",
    );
    expect(VD_QUALITY_LEDGER_KINDS.threat_not_escalating).toBe("threatLadder");
    expect(VD_QUALITY_LEDGER_KINDS.decision_without_consequence).toBe("consequenceLedger");
    expect(VD_QUALITY_LEDGER_KINDS.thread_stalled).toBe("threadLedger");
    expect(VD_QUALITY_LEDGER_KINDS.world_rules_undefined).toBe("worldRuleLedger");
  });
});
