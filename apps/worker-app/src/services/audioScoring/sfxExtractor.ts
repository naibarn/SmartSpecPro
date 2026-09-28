import type { SFXEvent } from "../../types/audioScoring";
import type { ScriptShotInput } from "./dramaticBeatExtractor";

/**
 * SFX Extractor
 * Identifies physical action verbs and dramatic transition markers to place sound effects.
 */
export function extractSfxEvents(shots: ScriptShotInput[]): SFXEvent[] {
  const events: SFXEvent[] = [];
  let currentMs = 0;

  shots.forEach((shot, idx) => {
    const startMs = currentMs;
    const durMs = Math.round(shot.durationSeconds * 1000);
    currentMs += durMs;

    const text = (shot.description || "").toLowerCase();

    // 1. Transition Whoosh at scene shifts
    if (idx > 0 && durMs >= 2000) {
      events.push({
        sfxId: `sfx_whoosh_${idx}`,
        timelineMs: startMs,
        durationMs: 800,
        category: "whoosh_transition",
        description: "Cinematic subtle whoosh transition into new shot",
        volume: 0.6,
      });
    }

    // 2. Physical impacts and doors
    if (text.includes("door") || text.includes("ประตู") || text.includes("เคาะ") || text.includes("เปิด")) {
      events.push({
        sfxId: `sfx_door_${idx}`,
        timelineMs: startMs + 600,
        durationMs: 1200,
        category: "foley",
        description: "Wood door open / heavy slam foley",
        volume: 0.75,
      });
    }

    if (text.includes("slap") || text.includes("punch") || text.includes("ชน") || text.includes("กระแทก") || text.includes("ล้ม")) {
      events.push({
        sfxId: `sfx_impact_${idx}`,
        timelineMs: startMs + 1000,
        durationMs: 1500,
        category: "impact_dramatic",
        description: "Dramatic low boom hit with resonant cinematic tail",
        volume: 0.85,
      });
    }

    if (text.includes("heartbeat") || text.includes("กลัว") || text.includes("ใจเต้น") || text.includes("ระทึก")) {
      events.push({
        sfxId: `sfx_heartbeat_${idx}`,
        timelineMs: startMs + 300,
        durationMs: 3000,
        category: "heartbeat_suspense",
        description: "Muffled suspenseful human heartbeat pulse",
        volume: 0.7,
      });
    }
  });

  return events;
}
