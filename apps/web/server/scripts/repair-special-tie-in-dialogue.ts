import "dotenv/config";
import postgres from "postgres";
import {
  resolveSpecialDialogueSpeakerEligibility,
  screenSpecialDialogueCompliance,
} from "../../shared/verticalDramaSeries/advertisingDialoguePolicy";

type JsonRecord = Record<string, any>;

const apply = process.argv.includes("--apply");
const episodeArg = process.argv.find(value => value.startsWith("--episode-id="));
const episodeId = episodeArg ? Number(episodeArg.split("=", 2)[1]) : undefined;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function emptyShotDialogues() {
  return Array.from({ length: 9 }, (_, index) => ({
    shotNumber: index + 1,
    lines: [],
  }));
}

function silentPlan() {
  return {
    schemaVersion: 1,
    audioStrategy: "silent",
    language: "none",
    dialogue_lines: [],
    shotLines: [],
    voiceContinuityMap: [],
    subtitleSafeArea: { position: "bottom_safe", maxLines: 2, avoidFaceArea: true },
    warnings: ["ตอนพิเศษนี้ตั้งใจสร้างเป็นวิดีโอเงียบ ไม่มีบทพูดและเสียงพากย์"],
  };
}

function silentPack(pack: unknown) {
  const current = record(pack);
  const existing = Array.isArray(current.clips) ? current.clips.map(record) : [];
  const clips = Array.from({ length: 9 }, (_, index) => {
    const shotNumber = index + 1;
    const prior = existing.find(clip =>
      Array.isArray(clip.sourceShotNumbers)
        ? clip.sourceShotNumbers.includes(shotNumber)
        : Number(clip.clipNumber) === shotNumber
    );
    return {
      ...(prior ?? {
        clipNumber: shotNumber,
        sourceShotNumbers: [shotNumber],
        prompt: "",
        durationSeconds: current.durationProfileId?.includes("10s") ? 10 : 8,
        extraReferenceAssetIds: [],
      }),
      dialogue: [],
    };
  });
  return { ...current, ...(Array.isArray(clips) ? { clips } : {}), nativeAudioEnabled: false };
}

function dialoguePack(pack: unknown, linesByShot: Map<number, any[]>) {
  const current = record(pack);
  const existing = Array.isArray(current.clips) ? current.clips.map(record) : [];
  const clips = Array.from({ length: 9 }, (_, index) => {
    const shotNumber = index + 1;
    const prior = existing.find(clip =>
      Array.isArray(clip.sourceShotNumbers)
        ? clip.sourceShotNumbers.includes(shotNumber)
        : Number(clip.clipNumber) === shotNumber
    );
    return {
      ...(prior ?? {
        clipNumber: shotNumber,
        sourceShotNumbers: [shotNumber],
        prompt: "",
        durationSeconds: current.durationProfileId?.includes("10s") ? 10 : 8,
        extraReferenceAssetIds: [],
      }),
      dialogue: (linesByShot.get(shotNumber) ?? []).map(line => ({
        characterKey: line.speaker_character_key,
        lineTh: line.dialogue_line,
        delivery: line.delivery,
      })),
    };
  });
  return { ...current, ...(Array.isArray(clips) ? { clips } : {}) };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const sql = postgres(process.env.DATABASE_URL, { max: 2 });
  try {
    const rows = await sql.unsafe(
      `SELECT "id", "specialData", "motionPromptPack", "dialogueAudioPlan"
       FROM vertical_drama_episodes
       WHERE "episodeKind" = 'special_tie_in' ${episodeId ? `AND "id" = ${episodeId}` : ""}
       ORDER BY "id"`
    );
    for (const row of rows) {
      const specialData = record(row.specialData);
      const input = record(specialData.input);
      const bindings = Array.isArray(specialData.referenceBindings)
        ? specialData.referenceBindings.map(record)
        : [];
      const speakerIds = new Set((input.speakerCharacterIds ?? []).map(String));
      const characterIds = [...new Set(bindings.map(binding => String(binding.provenance?.characterId ?? "")).filter(Boolean))];
      const characterRows = characterIds.length
        ? await sql.unsafe(
            `SELECT "id", "name", "role", "narrativeRole", "data"
             FROM vertical_drama_characters WHERE "id" IN (${characterIds.map((_, index) => `$${index + 1}`).join(",")})`,
            characterIds
          )
        : [];
      const characterById = new Map(characterRows.map(character => [String(character.id), character]));
      const bindingByRef = new Map(bindings.map(binding => [String(binding.skillReferenceId), binding]));
      const eligibleSpeakerRefs = new Set<string>();
      for (const binding of bindings) {
        const characterId = String(binding.provenance?.characterId ?? "");
        if (!speakerIds.has(characterId)) continue;
        const character = characterById.get(characterId);
        const eligibility = resolveSpecialDialogueSpeakerEligibility({
          name: character?.name,
          role: character?.role,
          narrativeRole: character?.narrativeRole,
          data: character?.data,
        });
        if (eligibility.eligible) eligibleSpeakerRefs.add(String(binding.skillReferenceId));
      }

      let linesByShot = new Map<number, any[]>();
      let source = "none";
      if (input.dialogueMode === "character_dialogue" && eligibleSpeakerRefs.size > 0) {
        const events = await sql.unsafe(
          `SELECT "parsedOutput" FROM vertical_drama_special_tie_in_debug_events
           WHERE "episodeId" = $1 AND "eventType" = 'output_accepted' AND "parsedOutput" IS NOT NULL
           ORDER BY "id" DESC`,
          [row.id]
        );
        for (const event of events) {
          const parsed = record(event.parsedOutput);
          const shots = Array.isArray(parsed.shots) ? parsed.shots : [];
          if (shots.length !== 9) continue;
          const candidate = new Map<number, any[]>();
          let valid = true;
          for (const shot of shots) {
            const shotNumber = Number(shot.shot_number);
            const turns = Array.isArray(shot.speaking_turns) ? shot.speaking_turns : [];
            const lines = turns.map((turn: unknown) => {
              const item = record(turn);
              const binding = bindingByRef.get(String(item.speaker_reference_id));
              const characterId = String(binding?.provenance?.characterId ?? "");
              return {
                shot_number: shotNumber,
                clip_number: shotNumber,
                speaker_character_id: String(binding?.provenance?.characterKey ?? characterId),
                speaker_character_key: String(binding?.provenance?.characterKey ?? item.speaker_reference_id),
                speaker_name: binding?.provenance?.characterName ?? characterById.get(characterId)?.name,
                dialogue_line: String(item.exact_dialogue ?? "").trim(),
                delivery: "natural, conversational, modest advertising tone",
              };
            });
            if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 9 || lines.length === 0 || lines.some(line => !eligibleSpeakerRefs.has(String(record(turns[lines.indexOf(line)]).speaker_reference_id)) || !line.dialogue_line)) {
              valid = false;
              break;
            }
            candidate.set(shotNumber, lines);
          }
          const allLines = [...candidate.values()].flat().map(line => line.dialogue_line);
          if (valid && candidate.size === 9 && !screenSpecialDialogueCompliance(allLines).hasViolations) {
            linesByShot = candidate;
            source = `debug_event:${event.parsedOutput ? "output_accepted" : "unknown"}`;
            break;
          }
        }
      }

      const shouldKeepDialogue = input.dialogueMode === "character_dialogue" && linesByShot.size === 9;
      const nextInput = shouldKeepDialogue
        ? {
            ...input,
            shotDialogues: [...linesByShot.entries()].sort((a, b) => a[0] - b[0]).map(([shotNumber, lines]) => ({
              shotNumber,
              dialogueLines: lines.map(line => ({
                speakerCharacterId: String(line.speaker_character_id),
                line: String(line.dialogue_line),
                delivery: String(line.delivery),
              })),
            })),
          }
        : (() => {
            const { speakerCharacterIds: _speakers, dialogueBrief: _brief, shotDialogues: _shots, marketplaceReviewIdea, ...rest } = input;
            return {
              ...rest,
              dialogueMode: "none",
              speakerCharacterIds: [],
              marketplaceReviewIdea: marketplaceReviewIdea
                ? { ...record(marketplaceReviewIdea), dialogue: [], dialogueScript: "", shotDialogues: emptyShotDialogues() }
                : marketplaceReviewIdea,
            };
          })();
      const nextOutput = {
        ...record(specialData.output),
        shotDialogues: shouldKeepDialogue
          ? [...linesByShot.entries()].sort((a, b) => a[0] - b[0]).map(([shotNumber, lines]) => ({
              shotNumber,
              lines: lines.map(line => ({
                speakerCharacterKey: String(line.speaker_character_key),
                speakerName: line.speaker_name,
                line: String(line.dialogue_line),
                delivery: String(line.delivery),
              })),
            }))
          : emptyShotDialogues(),
      };
      const nextSpecialData = {
        ...specialData,
        input: nextInput,
        output: nextOutput,
      };
      const plan = shouldKeepDialogue
        ? {
            schemaVersion: 1,
            audioStrategy: "dialogue_tts",
            language: "th-TH",
            dialogue_lines: [...linesByShot.values()].flat(),
            shotLines: [...linesByShot.entries()].flatMap(([shotNumber, lines]) => lines.map(line => ({ shotNumber, clipNumber: shotNumber, speakerCharacterId: line.speaker_character_id, speakerCharacterKey: line.speaker_character_key, speakerName: line.speaker_name, text: line.dialogue_line, delivery: line.delivery }))),
            voiceContinuityMap: [...eligibleSpeakerRefs].map(ref => {
              const binding = bindingByRef.get(ref);
              return { characterId: String(binding?.provenance?.characterId ?? ""), characterKey: binding?.provenance?.characterKey, characterName: binding?.provenance?.characterName, voiceRole: "adult_advertising_speaker" };
            }),
            subtitleSafeArea: { position: "bottom_safe", maxLines: 2, avoidFaceArea: true },
            warnings: [],
          }
        : silentPlan();
      const nextPack = shouldKeepDialogue ? dialoguePack(row.motionPromptPack, linesByShot) : silentPack(row.motionPromptPack);
      console.log(JSON.stringify({ episodeId: row.id, action: shouldKeepDialogue ? "restore_dialogue" : "convert_to_silent", source, shots: linesByShot.size, apply }));
      if (apply) {
        await sql`
          UPDATE vertical_drama_episodes
          SET "specialData" = ${sql.json(nextSpecialData)},
              "dialogueAudioPlan" = ${sql.json(plan)},
              "motionPromptPack" = ${sql.json(nextPack)},
              "updatedAt" = now()
          WHERE "id" = ${row.id} AND "episodeKind" = 'special_tie_in'
        `;
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
