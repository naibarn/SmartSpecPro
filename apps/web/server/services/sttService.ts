/**
 * STT (Speech-to-Text) Service
 *
 * Provider abstraction for speech transcription. Routes through the Python
 * backend unified_client, which handles Groq Whisper and OpenAI Whisper.
 *
 * Credit cost: 0 credits for Groq (free tier), 3 credits/minute for others.
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum audio buffer size: 60s at 16kHz 16-bit mono = ~1.92MB */
export const MAX_AUDIO_DURATION_SECONDS = 60;
export const MAX_AUDIO_BYTES = 16_000 * 2 * MAX_AUDIO_DURATION_SECONDS; // 1,920,000

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://localhost:8000";
const INTERNAL_TOKEN = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? "";

// ── Types ─────────────────────────────────────────────────────────────────

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number; // seconds
  provider?: string; // which provider was actually used (for credit calculation)
}

export interface TranscribeOptions {
  format: "pcm16" | "wav" | "mp3";
  language?: string;
  provider?: "groq" | "openai";
}

// ── Credit calculation ────────────────────────────────────────────────────

/**
 * Calculate STT credit cost.
 * Groq is free; all other providers cost 3 credits per minute (rounded up).
 */
export function calculateSTTCredits(durationSeconds: number, provider: string): number {
  if (provider.toLowerCase() === "groq") return 0;
  return Math.max(1, Math.ceil((durationSeconds / 60) * 3));
}

// ── Provider call ─────────────────────────────────────────────────────────

async function callSTTProvider(
  audioBuffer: Buffer,
  options: TranscribeOptions,
  provider: "groq" | "openai",
): Promise<STTResult> {
  const formData = new FormData();
  const audioBytes = Uint8Array.from(audioBuffer);
  formData.append(
    "audio",
    new Blob([audioBytes], { type: "application/octet-stream" }),
    `audio.${options.format}`,
  );
  formData.append("provider", provider);
  formData.append("format", options.format);
  if (options.language) {
    formData.append("language", options.language);
  }

  const response = await fetch(`${PYTHON_BACKEND_URL}/api/internal/stt`, {
    method: "POST",
    headers: {
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(`STT provider ${provider} failed (${response.status}): ${(error as any).detail ?? "error"}`);
  }

  const data = await response.json();
  return { ...data, provider };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Transcribe an audio buffer to text.
 *
 * Tries the specified (or default groq) provider first, then falls back
 * to openai on failure.
 */
export async function transcribe(
  audioBuffer: Buffer,
  options: TranscribeOptions,
): Promise<STTResult> {
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio buffer exceeds maximum allowed size (${MAX_AUDIO_BYTES} bytes)`,
    );
  }

  const primaryProvider = options.provider ?? "groq";

  try {
    return await callSTTProvider(audioBuffer, options, primaryProvider);
  } catch (primaryError) {
    // Fallback: try the other provider
    const fallbackProvider = primaryProvider === "groq" ? "openai" : "groq";
    try {
      return await callSTTProvider(audioBuffer, options, fallbackProvider);
    } catch {
      // Re-throw original error if both providers fail
      throw primaryError;
    }
  }
}
