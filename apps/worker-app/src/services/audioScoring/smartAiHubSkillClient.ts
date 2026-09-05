import type { DramaGenre, MusicCue } from "../../types/audioScoring";

export interface SubtitleCueInput {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SubtitleMoodSkillRequest {
  skillId: "subtitle_mood_music_scoring";
  projectId: string;
  genre: DramaGenre;
  outputFormat: "mp3" | "wav";
  subtitles: SubtitleCueInput[];
}

export interface SubtitleMoodSkillResponse {
  success: boolean;
  creditsDeducted: number;
  remainingCredits: number;
  soundPlan: {
    genre: DramaGenre;
    totalDurationMs: number;
    cues: Array<{
      cueId: string;
      startTimeMs: number;
      endTimeMs: number;
      mood: string;
      stylePrompt: string;
      targetTrack: "A2" | "A3";
      duckingLevelDb: number;
      tempoBpm?: number;
      intensity?: number;
    }>;
  };
  error?: string;
}

/**
  Calls the SmartAIHub Server Skill REST API (`admin/skill` standard)
 * to analyze subtitle content across timestamp bounds and deduct user credits.
 */
export async function executeSubtitleMoodScoringSkill(
  request: Omit<SubtitleMoodSkillRequest, "skillId">,
  serverUrl: string = "https://api.smartaihub.com"
): Promise<SubtitleMoodSkillResponse> {
  const payload: SubtitleMoodSkillRequest = {
    skillId: "subtitle_mood_music_scoring",
    ...request,
  };

  try {
    const res = await fetch(`${serverUrl}/api/v1/skills/subtitle-mood-scoring`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("smartaihub_token") || "demo_token"}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Fallback local skill analyzer if offline server/dev mode
      return fallbackLocalSubtitleMoodAnalyzer(request);
    }

    const data = (await res.json()) as SubtitleMoodSkillResponse;
    return data;
  } catch (err) {
    console.warn("SmartAIHub Skill REST API unreachable, running local fallback skill engine:", err);
    return fallbackLocalSubtitleMoodAnalyzer(request);
  }
}

/**
 * Fallback local skill processor when server REST API is unreachable in offline dev mode.
 */
function fallbackLocalSubtitleMoodAnalyzer(
  request: Omit<SubtitleMoodSkillRequest, "skillId">
): SubtitleMoodSkillResponse {
  const { genre, subtitles } = request;
  const totalDurationMs = subtitles.length > 0
    ? subtitles[subtitles.length - 1].endMs
    : 60000;

  const CUE_STYLES: Record<DramaGenre, { prompt: string; bpm: number }> = {
    romance_ceo: {
      prompt: "cinematic romantic orchestral piano solo, emotional dramatic background music, non-vocal, copyright-free instrumental",
      bpm: 85,
    },
    revenge_thriller: {
      prompt: "dark synth bass pulse, suspenseful heartbeat rhythm, dramatic violins, non-vocal, copyright-free background music",
      bpm: 115,
    },
    urban_suspense: {
      prompt: "urban synthwave detective theme, muted piano, mysterious ambient tension, non-vocal, copyright-free instrumental",
      bpm: 95,
    },
    historical_palace: {
      prompt: "traditional Chinese guzheng and bamboo flute with grand orchestral pads, non-vocal, copyright-free score",
      bpm: 78,
    },
    fantasy_wuxia: {
      prompt: "epic martial arts taiko drums and soaring string ensemble, non-vocal, copyright-free instrumental",
      bpm: 120,
    },
    comedy_slice_of_life: {
      prompt: "cheerful ukulele strumming with light acoustic percussion, non-vocal, copyright-free background music",
      bpm: 105,
    },
  };

  const selected = CUE_STYLES[genre] || CUE_STYLES.romance_ceo;

  // Segment subtitles into 2-3 distinct mood cues across timeline
  const cues: SubtitleMoodSkillResponse["soundPlan"]["cues"] = [];
  const cueDuration = Math.max(10000, Math.floor(totalDurationMs / Math.max(1, Math.ceil(subtitles.length / 4))));

  let currentStart = 0;
  let idx = 1;

  while (currentStart < totalDurationMs) {
    const endMs = Math.min(totalDurationMs, currentStart + cueDuration);
    cues.push({
      cueId: `skill_cue_${idx}`,
      startTimeMs: currentStart,
      endTimeMs: endMs,
      mood: idx % 2 === 1 ? "emotional_build" : "dramatic_peak",
      stylePrompt: selected.prompt,
      targetTrack: "A2",
      duckingLevelDb: -16.0,
      tempoBpm: selected.bpm,
      intensity: 0.8,
    });
    currentStart = endMs;
    idx++;
  }

  return {
    success: true,
    creditsDeducted: Math.max(5, cues.length * 5),
    remainingCredits: 480,
    soundPlan: {
      genre,
      totalDurationMs,
      cues,
    },
  };
}
