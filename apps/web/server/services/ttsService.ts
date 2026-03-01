/**
 * TTS (Text-to-Speech) Service
 *
 * Provider abstraction for speech synthesis. Routes through the Python
 * backend unified_client, which handles ElevenLabs and OpenAI TTS.
 *
 * Credit cost: 5 credits per 1000 characters (rounded up).
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum text length for TTS synthesis */
export const MAX_TTS_CHARS = 5000;

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string; // "audio/mpeg" or "audio/pcm"
  duration: number;    // estimated seconds
}

export interface SynthesizeOptions {
  format: "mp3" | "pcm16";
  voice?: string;
  speed?: number;
  provider?: "elevenlabs" | "openai";
}

// ── Credit calculation ────────────────────────────────────────────────────

/**
 * Calculate TTS credit cost: 5 credits per 1000 characters, minimum 1.
 */
export function calculateTTSCredits(characterCount: number): number {
  return Math.max(1, Math.ceil((characterCount / 1000) * 5));
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Synthesize text to speech audio.
 */
export async function synthesize(
  text: string,
  options: SynthesizeOptions,
): Promise<TTSResult> {
  if (text.length > MAX_TTS_CHARS) {
    throw new Error(
      `Text exceeds maximum allowed length (${MAX_TTS_CHARS} characters)`,
    );
  }

  const provider = options.provider ?? "openai";

  const response = await fetch(`${PYTHON_BACKEND_URL}/api/internal/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      text,
      provider,
      voice: options.voice ?? "alloy",
      speed: options.speed ?? 1.0,
      format: options.format,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(`TTS provider ${provider} failed (${response.status}): ${(error as any).detail ?? "error"}`);
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  // Estimate duration from buffer size (rough: MP3 ~128kbps)
  const duration = audioBuffer.byteLength / (128 * 1024 / 8);

  return { audioBuffer, contentType, duration };
}
