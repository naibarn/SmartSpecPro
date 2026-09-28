import type { AudioScoringErrorCode } from "../../types/audioScoring";

export interface ApprovedScorePlanRequest {
  plan: unknown;
  expectedSkillId: "vertical-drama-emotion-score-director";
  expectedSkillVersion: string;
}

export class AudioScoringError extends Error {
  readonly code: AudioScoringErrorCode;

  constructor(code: AudioScoringErrorCode, message: string) {
    super(message);
    this.name = "AudioScoringError";
    this.code = code;
  }
}

/**
 * Fetches a server-approved, already executed Feature 176 plan.
 * Semantic execution belongs to the Web skill pipeline. The Worker must not
 * invent a plan, call a generic prompt, or fall back to local heuristics.
 */
export async function fetchApprovedScorePlan(
  request: ApprovedScorePlanRequest,
  serverUrl: string,
  authToken: string,
): Promise<unknown> {
  if (!serverUrl || !authToken) {
    throw new AudioScoringError(
      "SKILL_UNAVAILABLE",
      "Feature 176 approved skill plan is required before Worker scoring.",
    );
  }

  try {
    const res = await fetch(
      `${serverUrl.replace(/\/$/, "")}/api/v1/vertical-drama/audio-score/approved-plan`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(request),
      },
    );

    if (!res.ok) {
      const message = await res.text().catch(() => "");
      throw new AudioScoringError(
        res.status === 409 ? "SKILL_REVISION_MISMATCH" : "SKILL_UNAVAILABLE",
        message || `Approved Feature 176 plan request failed (${res.status}).`,
      );
    }

    return await res.json();
  } catch (err) {
    if (err instanceof AudioScoringError) throw err;
    throw new AudioScoringError(
      "SKILL_UNAVAILABLE",
      `Feature 176 approved skill service is unavailable: ${String(err)}`,
    );
  }
}
