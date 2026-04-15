/**
 * TTS (Text-to-Speech) Service
 *
 * Provider abstraction for speech synthesis. Routes through the Python
 * backend unified_client, which handles ElevenLabs and OpenAI TTS.
 *
 * Credit cost: 5 credits per 1000 characters (rounded up).
 */

import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";

// ── Constants ─────────────────────────────────────────────────────────────

/** Maximum text length for TTS synthesis */
export const MAX_TTS_CHARS = 5000;

// ── Types ─────────────────────────────────────────────────────────────────

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string; // "audio/mpeg", "audio/pcm", or "audio/wav"
  duration: number;    // estimated seconds
}

export interface SynthesizeOptions {
  format: "mp3" | "pcm16" | "wav";
  voice?: string;
  speed?: number;
  provider?: "elevenlabs" | "openai" | "omnivoice";
  instruct?: string;
  referenceAudioBase64?: string;
  referenceAudioUrl?: string;
  referenceText?: string;
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
  const runtime = await getAppRuntimeConfig();
  const internalToken = await getPreferredInternalToken();
  if (text.length > MAX_TTS_CHARS) {
    throw new Error(
      `Text exceeds maximum allowed length (${MAX_TTS_CHARS} characters)`,
    );
  }

  const provider = options.provider ?? "openai";

  const response = await fetch(`${runtime.pythonBackendUrl}/api/internal/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": internalToken,
    },
    body: JSON.stringify({
      text,
      provider,
      voice: options.voice ?? "alloy",
      speed: options.speed ?? 1.0,
      format: options.format,
      instruct: options.instruct ?? null,
      reference_audio_base64: options.referenceAudioBase64 ?? null,
      reference_audio_url: options.referenceAudioUrl ?? null,
      reference_text: options.referenceText ?? null,
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
