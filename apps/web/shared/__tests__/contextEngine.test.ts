import { describe, expect, it } from "vitest";

import {
  CONTEXT_BUDGET_PROFILES,
  CONTEXT_PACK_SLOT_KINDS,
  CONTEXT_RETRIEVAL_SOURCES,
  CONTEXT_STATE_TIERS,
  CONTEXT_TRUST_LEVELS,
  buildContextOwnerScope,
  buildContextStateItem,
  canPromoteContextItem,
  canPruneContextItem,
  isPromotableContextStateTier,
  isPrunableContextStateTier,
  isTerminalContextStateTier,
  normalizeContextFreshness,
  normalizeContextTrust,
} from "../contextEngine";

describe("contextEngine shared contract", () => {
  it("exports stable tier, source, slot, trust, and budget literals", () => {
    expect(CONTEXT_STATE_TIERS).toEqual(
      expect.arrayContaining([
        "session_state",
        "project_state",
        "durable_memory",
        "working_summary",
      ]),
    );
    expect(CONTEXT_RETRIEVAL_SOURCES).toEqual(
      expect.arrayContaining(["lexical", "structured", "graph", "semantic", "hybrid"]),
    );
    expect(CONTEXT_PACK_SLOT_KINDS).toEqual(
      expect.arrayContaining([
        "session_state",
        "system_instruction",
        "active_note",
        "project_state",
        "working_summary",
        "tool_result",
      ]),
    );
    expect(CONTEXT_TRUST_LEVELS).toEqual(["trusted", "derived", "untrusted"]);
    expect(CONTEXT_BUDGET_PROFILES).toEqual(
      expect.arrayContaining(["balanced", "follow_up", "personalized", "retrieval"]),
    );
  });

  it("classifies tiers into terminal, promotable, and prunable buckets deterministically", () => {
    expect(isTerminalContextStateTier("project_state")).toBe(true);
    expect(isTerminalContextStateTier("durable_memory")).toBe(true);
    expect(isPromotableContextStateTier("session_state")).toBe(true);
    expect(isPromotableContextStateTier("working_summary")).toBe(true);
    expect(isPrunableContextStateTier("recent_notes")).toBe(true);
    expect(isPrunableContextStateTier("tool_result")).toBe(true);
  });

  it("normalizes trust and freshness with safe defaults", () => {
    expect(normalizeContextTrust("trusted")).toBe("trusted");
    expect(normalizeContextTrust("bogus" as never)).toBe("derived");
    expect(normalizeContextFreshness("fresh")).toBe("fresh");
    expect(normalizeContextFreshness("bogus" as never)).toBe("recent");
  });

  it("rejects promotion without scope or source provenance", () => {
    const scope = buildContextOwnerScope({ type: "team", id: "team-1" });
    const promotable = buildContextStateItem({
      tier: "working_summary",
      title: "Working summary",
      content: "Keep the launch scope focused on video production.",
      ownerScope: scope,
      sourceRef: "room:abc",
      source: "semantic",
      trust: "derived",
      freshness: "recent",
      includedReason: "summary promoted from room state",
    });

    expect(promotable).not.toBeNull();
    expect(promotable && canPromoteContextItem(promotable)).toBe(true);

    const missingScope = buildContextStateItem({
      tier: "working_summary",
      title: "Working summary",
      content: "Keep the launch scope focused on video production.",
      ownerScope: null,
      sourceRef: "room:abc",
      source: "semantic",
      includedReason: "summary promoted from room state",
    });
    expect(missingScope).toBeNull();

    const staleUntrusted = buildContextStateItem({
      tier: "tool_result",
      title: "Tool result",
      content: "Raw tool payload",
      ownerScope: scope,
      sourceRef: "tool:alpha",
      source: "hybrid",
      trust: "untrusted",
      freshness: "stale",
      includedReason: "tool output captured for traceability",
    });
    expect(staleUntrusted).not.toBeNull();
    expect(staleUntrusted && canPromoteContextItem(staleUntrusted)).toBe(false);
    expect(staleUntrusted && canPruneContextItem(staleUntrusted)).toBe(true);
  });
});

