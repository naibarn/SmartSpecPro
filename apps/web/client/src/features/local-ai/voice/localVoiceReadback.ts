import type { LocalAiVoiceReadbackMode } from "../types/capability";

export type LocalVoiceReadbackPriority = "response" | "important";

export interface LocalVoiceReadbackAvailability {
  supported: boolean;
  reason:
    | "speech_synthesis_unavailable"
    | "native_tts_backend_unavailable"
    | null;
}

export interface SpeakLocalVoiceReadbackInput {
  text: string;
  mode: LocalAiVoiceReadbackMode;
  priority?: LocalVoiceReadbackPriority;
  lang?: string;
  rate?: number;
}

export interface TauriLocalVoiceReadbackStatus {
  available: boolean;
  backend: string | null;
  reason: string | null;
}

const MAX_READBACK_CHARS = 320;

function trimReadbackText(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= MAX_READBACK_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_READBACK_CHARS - 3).trimEnd()}...`;
}

function resolveSpeechSynthesis():
  | {
      synth: SpeechSynthesis;
      UtteranceCtor: typeof SpeechSynthesisUtterance;
    }
  | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (
    typeof window.speechSynthesis === "undefined" ||
    typeof window.SpeechSynthesisUtterance === "undefined"
  ) {
    return null;
  }
  return {
    synth: window.speechSynthesis,
    UtteranceCtor: window.SpeechSynthesisUtterance,
  };
}

function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, payload);
}

export function getLocalVoiceReadbackAvailability(): LocalVoiceReadbackAvailability {
  return resolveSpeechSynthesis()
    ? { supported: true, reason: null }
    : { supported: false, reason: "speech_synthesis_unavailable" };
}

export async function getTauriLocalVoiceReadbackStatus(): Promise<TauriLocalVoiceReadbackStatus> {
  if (!isTauriDesktopRuntime()) {
    return {
      available: false,
      backend: null,
      reason: "not_tauri",
    };
  }
  try {
    const status = await invokeTauri<TauriLocalVoiceReadbackStatus>(
      "local_tts_get_status",
    );
    return {
      available: status.available,
      backend: status.backend ?? null,
      reason: status.reason ?? null,
    };
  } catch (error) {
    return {
      available: false,
      backend: null,
      reason: error instanceof Error ? error.message : "local_tts_status_failed",
    };
  }
}

export function shouldSpeakLocalVoiceReadback(input: {
  mode: LocalAiVoiceReadbackMode;
  priority?: LocalVoiceReadbackPriority;
}): boolean {
  if (input.mode === "off") {
    return false;
  }
  if (input.mode === "important_only") {
    return input.priority === "important";
  }
  return true;
}

export function stopLocalVoiceReadback(): void {
  if (isTauriDesktopRuntime()) {
    void invokeTauri<boolean>("local_tts_stop_speaking").catch(() => false);
  }
  const resolved = resolveSpeechSynthesis();
  resolved?.synth.cancel();
}

export async function speakLocalVoiceReadback(
  input: SpeakLocalVoiceReadbackInput,
): Promise<boolean> {
  if (!shouldSpeakLocalVoiceReadback(input)) {
    return false;
  }

  if (isTauriDesktopRuntime()) {
    const tauriStatus = await getTauriLocalVoiceReadbackStatus();
    if (tauriStatus.available) {
      try {
        return await invokeTauri<boolean>("local_tts_speak_text", {
          request: {
            text: trimReadbackText(input.text),
            lang: input.lang ?? null,
            rate: input.rate ?? 1,
          },
        });
      } catch {
        // Fall through to browser speech synthesis when available.
      }
    }
  }

  const resolved = resolveSpeechSynthesis();
  if (!resolved) {
    return false;
  }

  const text = trimReadbackText(input.text);
  if (!text) {
    return false;
  }

  resolved.synth.cancel();

  return await new Promise<boolean>((resolve) => {
    const utterance = new resolved.UtteranceCtor(text);
    utterance.lang = input.lang ?? "th-TH";
    utterance.rate = input.rate ?? 1;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    resolved.synth.speak(utterance);
  });
}
