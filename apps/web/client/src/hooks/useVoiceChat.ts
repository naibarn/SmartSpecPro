/**
 * useVoiceChat — Voice session lifecycle hook
 *
 * Manages the complete voice session lifecycle:
 * 1. Consent check and grant flow
 * 2. Session token fetch (POST /api/voice/session)
 * 3. WebSocket connection to /api/voice/stream
 * 4. Audio capture and streaming (PCM 16-bit 16kHz mono)
 * 5. TTS audio playback via AudioContext
 * 6. Graceful teardown on unmount or session end
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────

export type VoiceChatState =
  | "idle"
  | "requesting_consent"
  | "connecting"
  | "active"
  | "error";

export type VoiceChatMode = "push-to-talk" | "vad" | "hybrid";

export interface UseVoiceChatReturn {
  state: VoiceChatState;
  mode: VoiceChatMode;
  isRecording: boolean;
  isPlaying: boolean;
  partialTranscript: string;
  error: string | null;
  startSession: () => Promise<void>;
  endSession: () => void;
  toggleRecording: () => void;
  setMode: (mode: VoiceChatMode) => void;
  grantConsent: () => Promise<void>;
  withdrawConsent: () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export interface UseVoiceChatOptions {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
}

export function useVoiceChat(options: UseVoiceChatOptions = {}): UseVoiceChatReturn {
  const { onTranscript, onResponse } = options;
  const queryClient = useQueryClient();
  const [state, setState] = useState<VoiceChatState>("idle");
  const [mode, setModeState] = useState<VoiceChatMode>("push-to-talk");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // ── Cleanup ─────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    // Stop recording
    scriptProcessorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsRecording(false);
    setIsPlaying(false);
    setPartialTranscript("");
    setState("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  // ── Consent mutations ────────────────────────────────────────────────────

  const grantConsentMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/voice/consent/grant", { method: "POST" });
      if (!response.ok) throw new Error("Failed to grant consent");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const withdrawConsentMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/voice/consent/withdraw", { method: "POST" });
      if (!response.ok) throw new Error("Failed to withdraw consent");
    },
    onSuccess: () => {
      cleanup();
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  // ── Session management ───────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (state !== "idle") return;

    setState("connecting");
    setError(null);

    try {
      // Get session token
      const tokenResponse = await fetch("/api/voice/session", { method: "POST" });
      if (tokenResponse.status === 409) {
        throw new Error("You already have an active voice session");
      }
      if (!tokenResponse.ok) {
        const body = await tokenResponse.json().catch(() => ({}));
        const errorMessage = (body as any).error ?? "Failed to start voice session";
        if (
          tokenResponse.status === 403
          && typeof errorMessage === "string"
          && errorMessage.toLowerCase().includes("consent")
        ) {
          setState("requesting_consent");
          setError(null);
          return;
        }
        throw new Error(errorMessage);
      }
      const { token, wsUrl } = await tokenResponse.json();

      // Open WebSocket
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      const ws = new WebSocket(`${wsProtocol}//${wsHost}${wsUrl}?token=${token}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        setState("active");
        if (mode === "push-to-talk") {
          // User must hold button to record
        } else {
          // Auto-start recording for VAD/hybrid
          startRecording();
        }
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          handleTextMessage(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          // TTS audio response
          playAudio(event.data);
        }
      };

      ws.onerror = () => {
        setError("Voice connection error");
        setState("error");
        cleanup();
      };

      ws.onclose = (event) => {
        if (event.code >= 4000) {
          const messages: Record<number, string> = {
            4001: "Invalid or expired session",
            4002: "Credits exhausted",
            4003: "Rate limit exceeded",
            4004: "Another session is active",
            4005: "Session timed out",
            4006: "Audio frame too large",
          };
          setError(messages[event.code] ?? "Session ended");
        }
        cleanup();
      };
    } catch (err: any) {
      setError(err.message ?? "Failed to start voice session");
      setState("error");
    }
  }, [state, mode, cleanup]);

  // ── Recording ────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16_000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessorNode for PCM output (deprecated but widely supported)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const pcmFloat = event.inputBuffer.getChannelData(0);
        // Convert float32 [-1, 1] to int16 [-32768, 32767]
        const pcm16 = new Int16Array(pcmFloat.length);
        for (let i = 0; i < pcmFloat.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(pcmFloat[i] * 32767)));
        }
        wsRef.current.send(pcm16.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err: any) {
      setError(err.message ?? "Microphone access denied");
    }
  }, []);

  const stopRecording = useCallback(() => {
    scriptProcessorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    scriptProcessorRef.current = null;
    sourceRef.current = null;
    setIsRecording(false);

    // Signal end of turn
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end_turn" }));
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (state !== "active") return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [state, isRecording, startRecording, stopRecording]);

  // ── Text message handling ────────────────────────────────────────────────

  const handleTextMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "transcript":
          setPartialTranscript(msg.isFinal ? "" : msg.text);
          onTranscript?.(msg.text, !!msg.isFinal);
          break;
        case "response_text":
          // Text response from LLM — surface to parent chat component
          setPartialTranscript("");
          onResponse?.(msg.text ?? "");
          break;
        case "credit_warning":
          setError("Low credits — voice mode may end soon");
          break;
        case "error":
          setError(msg.message);
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }, [onTranscript, onResponse]);

  // ── TTS audio playback ───────────────────────────────────────────────────

  const playAudio = useCallback(async (buffer: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const decoded = await audioContextRef.current.decodeAudioData(buffer.slice(0));
      const source = audioContextRef.current.createBufferSource();
      source.buffer = decoded;
      source.connect(audioContextRef.current.destination);
      setIsPlaying(true);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch {
      setIsPlaying(false);
    }
  }, []);

  // ── Public API ───────────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const setMode = useCallback((newMode: VoiceChatMode) => {
    setModeState(newMode);
  }, []);

  const grantConsent = useCallback(async () => {
    await grantConsentMutation.mutateAsync();
    setState("idle");
  }, [grantConsentMutation]);

  const withdrawConsent = useCallback(async () => {
    await withdrawConsentMutation.mutateAsync();
  }, [withdrawConsentMutation]);

  return {
    state,
    mode,
    isRecording,
    isPlaying,
    partialTranscript,
    error,
    startSession,
    endSession,
    toggleRecording,
    setMode,
    grantConsent,
    withdrawConsent,
  };
}
