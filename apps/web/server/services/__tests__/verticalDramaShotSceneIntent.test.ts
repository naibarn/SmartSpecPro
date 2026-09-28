import { describe, expect, it } from "vitest";

import {
  applyVerticalDramaShotSceneIntent,
  buildVerticalDramaShotSceneIntentPrompt,
  normalizeVerticalDramaShotSceneIntentCandidate,
  verticalDramaShotSceneIntentOutputSchema,
  type VerticalDramaShotSceneIntentOutput,
} from "../verticalDramaShotSceneIntent";

function intent(
  shotNumber: number,
  overrides: Partial<
    VerticalDramaShotSceneIntentOutput["shots"][number]["scene_intent"]
  > = {}
) {
  return {
    shot_number: shotNumber,
    scene_intent: {
      contract_version: "vd-shot-scene-intent-v1",
      physical_character_refs: [],
      screen_caller_refs: [],
      offscreen_speaker_refs: [],
      mentioned_only_refs: [],
      supporting_presence: [],
      communication_mode: "none" as const,
      visual_plan: {
        mode: "no_character" as const,
        reason_codes: [],
        primary_character_refs: [],
        secondary_character_refs: [],
      },
      dialogue_routing: [],
      confidence: "high" as const,
      needs_review: false,
      reason_codes: [],
      ...overrides,
    },
  };
}

describe("vertical-drama-shot-scene-intent", () => {
  it("keeps a mentioned character out of the physical cast", () => {
    const storyboard = {
      shots: [
        {
          shot_number: 1,
          characters: ["alice"],
          required_character_refs: ["alice"],
          screen_caller_refs: [],
          supporting_presence: [],
        },
      ],
    } as any;

    const result = applyVerticalDramaShotSceneIntent({
      storyboard,
      intents: [
        intent(1, {
          mentioned_only_refs: ["bob"],
          physical_character_refs: ["alice"],
          visual_plan: {
            mode: "single_view",
            reason_codes: ["mention_only_not_visible"],
            primary_character_refs: ["alice"],
            secondary_character_refs: [],
          },
        }),
      ],
      validCharacterIds: ["alice", "bob"],
    });

    expect(result.shots[0]).toMatchObject({
      characters: ["alice"],
      required_character_refs: ["alice"],
      screen_caller_refs: [],
    });
    expect(result.shots[0].scene_intent.mentioned_only_refs).toEqual(["bob"]);
  });

  it("models a video caller as a screen reference, never a physical character", () => {
    const storyboard = { shots: [{ shot_number: 1 }] } as any;

    const result = applyVerticalDramaShotSceneIntent({
      storyboard,
      intents: [
        intent(1, {
          screen_caller_refs: ["bob"],
          communication_mode: "video_call",
          visual_plan: {
            mode: "device_screen",
            reason_codes: ["remote_video_call"],
            primary_character_refs: ["alice"],
            secondary_character_refs: [],
          },
          physical_character_refs: ["alice"],
        }),
      ],
      validCharacterIds: ["alice", "bob"],
    });

    expect(result.shots[0]).toMatchObject({
      characters: ["alice"],
      required_character_refs: ["alice"],
      screen_caller_refs: ["bob"],
    });
  });

  it("preserves barrier dialogue as a dual physical view and keeps text-only people absent", () => {
    const storyboard = { shots: [{ shot_number: 1 }] } as any;

    const barrierResult = applyVerticalDramaShotSceneIntent({
      storyboard,
      intents: [
        intent(1, {
          physical_character_refs: ["alice", "bob"],
          communication_mode: "barrier_dialogue",
          visual_plan: {
            mode: "dual_view",
            reason_codes: ["closed_door_both_sides_shown"],
            primary_character_refs: ["alice"],
            secondary_character_refs: ["bob"],
            primary_location_key: "hallway",
            secondary_location_key: "room",
          },
        }),
      ],
      validCharacterIds: ["alice", "bob"],
    });

    expect(barrierResult.shots[0]).toMatchObject({
      view_mode: "dual",
      dual_view: { scenario: "physical_barrier" },
    });

    const separateLocationResult = applyVerticalDramaShotSceneIntent({
      storyboard: { shots: [{ shot_number: 1 }] } as any,
      intents: [
        intent(1, {
          physical_character_refs: ["alice", "bob"],
          communication_mode: "separate_locations",
          visual_plan: {
            mode: "dual_view",
            reason_codes: ["cross_cut_dialogue"],
            primary_character_refs: ["alice"],
            secondary_character_refs: ["bob"],
            primary_location_key: "office",
            secondary_location_key: "station",
          },
        }),
      ],
      validCharacterIds: ["alice", "bob"],
    });

    expect(separateLocationResult.shots[0].dual_view).toMatchObject({
      scenario: "separate_locations",
    });

    const textResult = applyVerticalDramaShotSceneIntent({
      storyboard: { shots: [{ shot_number: 1 }] } as any,
      intents: [
        intent(1, {
          physical_character_refs: ["alice"],
          mentioned_only_refs: ["bob"],
          communication_mode: "text_message",
          visual_plan: {
            mode: "text_ui",
            reason_codes: ["message_ui_visible"],
            primary_character_refs: ["alice"],
            secondary_character_refs: [],
          },
        }),
      ],
      validCharacterIds: ["alice", "bob"],
    });

    expect(textResult.shots[0]).toMatchObject({
      characters: ["alice"],
      screen_caller_refs: [],
    });
  });

  it("rejects an ambiguous or contradictory interpretation before persistence", () => {
    expect(() =>
      applyVerticalDramaShotSceneIntent({
        storyboard: { shots: [{}] } as any,
        intents: [
          intent(1, {
            physical_character_refs: ["alice"],
            screen_caller_refs: ["alice"],
          }),
        ],
        validCharacterIds: ["alice"],
      })
    ).toThrowError(/scene intent/i);
  });

  it("gives the model previous-shot context and explicit mention-only rules", () => {
    const prompt = buildVerticalDramaShotSceneIntentPrompt({
      episodeTitle: "Episode 28",
      currentEpisodeNumber: 28,
      characters: [
        { characterId: "alice", name: "Alice" },
        { characterId: "bob", name: "Bob" },
      ],
      shots: [
        { shotNumber: 1, synopsis: "Alice enters the room." },
        { shotNumber: 2, synopsis: "Alice says Bob betrayed her." },
      ],
      previousEpisodeContext: {
        episodeNumber: 27,
        finalShots: [{ shotNumber: 9, synopsis: "Bob leaves the building." }],
      },
    });

    expect(prompt).toContain("Bob");
    expect(prompt).toContain("mentioned_only_refs");
    expect(prompt).toContain("PREVIOUS EPISODE ENDING");
    expect(prompt).toContain("Shot 1");
    expect(prompt).toContain('"vd-shot-scene-intent-v1"');
    expect(prompt).toContain("supporting_presence:object[]");
    expect(prompt).toContain("dialogue_routing:object[]");
  });

  it("repairs only safe JSON-shape drift before strict validation", () => {
    const malformed = {
      contract_version: 1,
      shots: Array.from({ length: 9 }, (_, index) => ({
        shot_number: index + 1,
        contract_version: 1,
        physical_character_refs: [],
        screen_caller_refs: [],
        offscreen_speaker_refs: [],
        mentioned_only_refs: [],
        supporting_presence: '["background extra"]',
        communication_mode: "none",
        visual_plan: { mode: "no_character" },
        dialogue_routing: "[]",
        confidence: "high",
        needs_review: false,
        reason_codes: [],
      })),
    };

    const normalized =
      normalizeVerticalDramaShotSceneIntentCandidate(malformed);
    const parsed = verticalDramaShotSceneIntentOutputSchema.safeParse(
      normalized.value
    );

    expect(parsed.success).toBe(true);
    expect(normalized.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "contract_version" }),
        expect.objectContaining({ path: "shots.0.scene_intent" }),
        expect.objectContaining({
          path: "shots.0.scene_intent.supporting_presence",
        }),
      ])
    );
    if (parsed.success) {
      expect(parsed.data.shots[0].scene_intent.contract_version).toBe(
        "vd-shot-scene-intent-v1"
      );
      expect(parsed.data.shots[0].scene_intent.supporting_presence).toEqual([
        { role: "background extra" },
      ]);
    }
  });

  it("does not hide an invalid non-JSON dialogue routing string", () => {
    const candidate = {
      contract_version: "vd-shot-scene-intent-v1",
      shots: Array.from({ length: 9 }, (_, index) => ({
        ...intent(index + 1),
        scene_intent: {
          ...intent(index + 1).scene_intent,
          dialogue_routing: "not-json",
        },
      })),
    };

    const parsed = verticalDramaShotSceneIntentOutputSchema.safeParse(
      normalizeVerticalDramaShotSceneIntentCandidate(candidate).value
    );
    expect(parsed.success).toBe(false);
  });
});
