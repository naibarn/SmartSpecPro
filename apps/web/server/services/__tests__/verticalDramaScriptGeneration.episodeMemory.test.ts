/**
 * Series memory — Producer B coverage
 * (`planning/vd-series-memory-and-lineage/plan.md` Stage 1.2/1.3).
 *
 * `plan_episode_script` is the SECOND producer of `VdEpisodeMemory` (Producer
 * A is `verticalDramaStoryBible.ts`'s deep-draft chunk loop, already
 * covered). This file covers `resolveScriptEpisodeMemory` in isolation — pure
 * function, no LLM/DB access — mirroring
 * `verticalDramaScriptGeneration.skillExampleValidation.test.ts`'s "import
 * the real module directly, no mocking needed" convention.
 */
import { describe, expect, it } from "vitest";
import {
  resolveScriptEpisodeMemory,
  scriptBuilderOutputSchema,
  type ScriptBuilderOutput,
} from "../verticalDramaScriptGeneration";

function baseScript(
  overrides: Record<string, unknown> = {}
): ScriptBuilderOutput {
  const raw = {
    contract_version: 1,
    episode_title: "Midnight Verdict",
    hook: "Aria's phone lights up mid-signature.",
    structure: { mode: "beat", beats: [] },
    scene_dialogue_summary: [],
    cliffhanger: "The rival's own backers call an emergency vote.",
    character_state_deltas: [
      { character_id: "char_aria", before: "loyal", after: "suspicious" },
    ],
    product_tie_in_plan: { tie_ins: [], note: "no product this episode" },
    continuity_notes: ["Aria keeps the charcoal blazer", "clinic subplot open"],
    warnings: [],
    repair_queue: [],
    ...overrides,
  };
  return scriptBuilderOutputSchema.parse(raw) as ScriptBuilderOutput;
}

describe("resolveScriptEpisodeMemory — LLM-authored episode_memory block present and valid", () => {
  it("trusts the block as-is (does not re-derive from continuity_notes/open_loops)", () => {
    const script = baseScript({
      continuity_notes: ["this fact must NOT leak into canonicalFacts"],
      open_loops: [{ question: "unused decoy thread" }],
      episode_memory: {
        recap: "Aria exposes the rival's own trap.",
        canonical_facts: ["Aria is CFO of Vantor Group"],
        threads_opened: [
          {
            thread_id: "reno-unfinished",
            description: "the house renovation still isn't done",
            thread_class: "domestic",
          },
        ],
        threads_resolved: [],
        relationship_changes: [
          {
            pair: ["char_aria", "char_noah"],
            status: "ทั้งคู่รู้สึกดีต่อกันแต่ยังไม่มีใครพูดออกมา",
            disclosure: "undeclared",
            known_by: [],
          },
        ],
        knowledge_changes: [],
      },
      thread_actions: [
        {
          action: "open",
          proposedThreadId: "new-boardroom-lead",
          note: "find the hidden shareholder",
        },
        {
          action: "resolve",
          threadId: "reno-unfinished",
          evidenceRefs: [{ episodeNumber: 7, kind: "payoff" }],
        },
      ],
    });

    const memory = resolveScriptEpisodeMemory(script, 7);

    expect(memory.episodeNumber).toBe(7);
    expect(memory.recap).toBe("Aria exposes the rival's own trap.");
    expect(memory.canonicalFacts).toEqual(["Aria is CFO of Vantor Group"]);
    expect(memory.canonicalFacts).not.toContain(
      "this fact must NOT leak into canonicalFacts"
    );
    expect(memory.threadsOpened).toHaveLength(2);
    expect(memory.threadsOpened[0]).toMatchObject({
      threadId: "reno-unfinished",
      threadClass: "domestic",
      openedEpisode: 7,
    });
    expect(memory.threadsOpened[1]).toMatchObject({
      threadId: "new-boardroom-lead",
      description: "find the hidden shareholder",
      openedEpisode: 7,
    });
    expect(memory.threadsResolved).toEqual(["reno-unfinished"]);
    expect(memory.relationshipChanges).toEqual([
      {
        pair: ["char_aria", "char_noah"],
        status: "ทั้งคู่รู้สึกดีต่อกันแต่ยังไม่มีใครพูดออกมา",
        disclosure: "undeclared",
        knownBy: [],
        sinceEpisode: 7,
      },
    ]);
  });
});

describe("resolveScriptEpisodeMemory — episode_memory absent (fallback + enrichment)", () => {
  it("derives recap from hook/cliffhanger and enriches with continuity_notes + open_loops", () => {
    const script = baseScript({
      continuity_notes: ["Aria keeps the charcoal blazer", "clinic subplot open"],
      open_loops: [
        { question: "who tipped the rival's backers off", planted_at_beat: 3 },
      ],
    });

    const memory = resolveScriptEpisodeMemory(script, 4);

    expect(memory.episodeNumber).toBe(4);
    expect(memory.recap).toContain("Aria's phone lights up mid-signature.");
    expect(memory.recap).toContain(
      "The rival's own backers call an emergency vote."
    );
    expect(memory.canonicalFacts).toEqual([
      "Aria keeps the charcoal blazer",
      "clinic subplot open",
    ]);
    expect(memory.threadsOpened).toHaveLength(1);
    expect(memory.threadsOpened[0]).toMatchObject({
      description: "who tipped the rival's backers off",
      threadClass: "plot",
      openedEpisode: 4,
    });
  });

  it("NEVER derives relationshipChanges from character_state_deltas (per-character label, not a pair)", () => {
    const script = baseScript({
      character_state_deltas: [
        { character_id: "char_aria", before: "ศัตรู", after: "พันธมิตร" },
      ],
    });

    const memory = resolveScriptEpisodeMemory(script, 2);

    expect(memory.relationshipChanges).toEqual([]);
  });

  it("skips an open_loop with no usable question text rather than emitting an empty thread", () => {
    const script = baseScript({
      open_loops: [{ planted_at_beat: 1 }, { question: "  " }],
    });

    const memory = resolveScriptEpisodeMemory(script, 1);

    expect(memory.threadsOpened).toEqual([]);
  });
});

describe("resolveScriptEpisodeMemory — malformed episode_memory block (never throws)", () => {
  it("falls back deterministically when the block fails schema validation (missing required recap)", () => {
    const script = baseScript({
      continuity_notes: ["fallback fact"],
      episode_memory: {
        // `recap` deliberately omitted — required by episodeMemoryBlockSchema.
        relationship_changes: [{ pair: ["a"], status: "incomplete" }],
      },
    });

    expect(() => resolveScriptEpisodeMemory(script, 9)).not.toThrow();
    const memory = resolveScriptEpisodeMemory(script, 9);
    expect(memory.canonicalFacts).toContain("fallback fact");
    expect(memory.relationshipChanges).toEqual([]);
  });

  it("falls back deterministically when the block is a completely wrong shape (string instead of object)", () => {
    const script = baseScript({
      episode_memory: "not an object",
    });

    expect(() => resolveScriptEpisodeMemory(script, 3)).not.toThrow();
  });
});
