/**
 * Push-to-talk hook for speech-to-text transcription.
 * Records audio via MediaRecorder, runs a configurable transcription step, returns text.
 */
import { useRef, useState, useCallback, useEffect } from "react";

export interface PushToTalkTranscribeInput {
  audioBase64: string;
  mimeType: string;
  signal: AbortSignal;
}

export type PushToTalkTranscribeFn = (
  input: PushToTalkTranscribeInput,
) => Promise<string>;

interface UsePushToTalkOptions {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
  transcribe?: PushToTalkTranscribeFn;
  maxRecordingMs?: number;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function transcribeWithLegacySpeechToText(
  input: PushToTalkTranscribeInput,
): Promise<string> {
  const res = await fetch("/api/stt/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: input.signal,
    body: JSON.stringify({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
    }),
  });

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: "Transcription failed" }));
    throw new Error(err.error || "Transcription failed");
  }

  const data = await res.json();
  return typeof data.text === "string" ? data.text : "";
}

export function usePushToTalk({
  onTranscription,
  onError,
  transcribe,
  maxRecordingMs,
}: UsePushToTalkOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxRecordingTimerRef = useRef<number | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);

  const clearRecordingTimer = useCallback(() => {
    if (maxRecordingTimerRef.current != null) {
      window.clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      transcriptionAbortRef.current?.abort();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [clearRecordingTimer]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        clearRecordingTimer();
        setIsRecording(false);
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          onError?.("No audio recorded");
          return;
        }

        setIsTranscribing(true);
        transcriptionAbortRef.current?.abort();
        const abortController = new AbortController();
        transcriptionAbortRef.current = abortController;
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const text = await (transcribe ?? transcribeWithLegacySpeechToText)({
            audioBase64: arrayBufferToBase64(arrayBuffer),
            mimeType: mimeType.split(";")[0],
            signal: abortController.signal,
          });
          if (text) {
            onTranscription(text);
          }
        } catch (err: any) {
          if (err instanceof DOMException && err.name === "AbortError") {
            onError?.("Transcription cancelled");
          } else {
            onError?.(err.message || "Transcription failed");
          }
        } finally {
          if (transcriptionAbortRef.current === abortController) {
            transcriptionAbortRef.current = null;
          }
          setIsTranscribing(false);
        }
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
      if (maxRecordingMs && maxRecordingMs > 0) {
        maxRecordingTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            onError?.(
              `Recording stopped after ${Math.round(maxRecordingMs / 1000)} seconds to keep local voice input within device limits.`,
            );
          }
        }, maxRecordingMs);
      }
    } catch (err: any) {
      onError?.(err.message || "Microphone access denied");
    }
  }, [clearRecordingTimer, maxRecordingMs, onError, onTranscription, transcribe]);

  const stopRecording = useCallback(() => {
    clearRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [clearRecordingTimer]);

  return { isRecording, isTranscribing, startRecording, stopRecording };
}
