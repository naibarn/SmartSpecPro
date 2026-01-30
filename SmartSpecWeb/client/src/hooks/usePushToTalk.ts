/**
 * Push-to-talk hook for speech-to-text transcription.
 * Records audio via MediaRecorder, sends to /api/stt/transcribe, returns text.
 */
import { useRef, useState, useCallback } from "react";

interface UsePushToTalkOptions {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
}

export function usePushToTalk({ onTranscription, onError }: UsePushToTalkOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          onError?.("No audio recorded");
          return;
        }

        setIsTranscribing(true);
        try {
          // Convert to base64
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );

          const res = await fetch("/api/stt/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: mimeType.split(";")[0],
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Transcription failed" }));
            throw new Error(err.error || "Transcription failed");
          }

          const data = await res.json();
          if (data.text) {
            onTranscription(data.text);
          }
        } catch (err: any) {
          onError?.(err.message || "Transcription failed");
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250); // collect chunks every 250ms
      setIsRecording(true);
    } catch (err: any) {
      onError?.(err.message || "Microphone access denied");
    }
  }, [onTranscription, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return { isRecording, isTranscribing, startRecording, stopRecording };
}
