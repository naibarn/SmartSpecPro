/**
 * VoiceChat — Floating voice interface component
 *
 * Provides a microphone button for initiating voice chat sessions.
 * Handles consent modal, recording state, and playback indicators.
 *
 * Feature-flagged: Only renders when voiceChat is enabled for the tenant.
 */

import React, { useState } from "react";
import { Mic, MicOff, Volume2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVoiceChat, type VoiceChatMode } from "@/hooks/useVoiceChat";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────

interface VoiceChatProps {
  /** Called when voice transcription produces text */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Called when LLM response arrives via voice */
  onResponse?: (text: string) => void;
  /** Whether the chat interface is busy (e.g., LLM processing) */
  disabled?: boolean;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function VoiceChat({
  onTranscript,
  onResponse,
  disabled = false,
  className,
}: VoiceChatProps): React.ReactElement | null {
  const {
    state,
    isRecording,
    isPlaying,
    error,
    startSession,
    endSession,
    toggleRecording,
    grantConsent,
  } = useVoiceChat({ onTranscript, onResponse });

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isGranting, setIsGranting] = useState(false);

  // Show consent modal when consent is needed
  React.useEffect(() => {
    if (state === "requesting_consent") {
      setShowConsentModal(true);
    } else {
      setShowConsentModal(false);
    }
  }, [state]);

  const handleMicClick = async () => {
    if (state === "idle") {
      await startSession();
    } else if (state === "active") {
      toggleRecording();
    } else if (state === "error") {
      endSession();
    }
  };

  const handleConsentGrant = async () => {
    setIsGranting(true);
    try {
      await grantConsent();
      setShowConsentModal(false);
      await startSession();
    } finally {
      setIsGranting(false);
    }
  };

  const handleConsentDecline = () => {
    setShowConsentModal(false);
    endSession();
  };

  const getButtonColor = () => {
    if (state === "error") return "text-red-500 hover:text-red-600";
    if (state === "active" && isRecording) return "text-red-500";
    if (state === "active") return "text-blue-500";
    if (state === "connecting") return "text-yellow-500 animate-pulse";
    return "text-muted-foreground hover:text-foreground";
  };

  const getButtonTitle = () => {
    if (state === "idle") return "Start voice chat";
    if (state === "connecting") return "Connecting...";
    if (state === "active" && isRecording) return "Stop recording";
    if (state === "active") return "Start recording";
    if (state === "error") return error ?? "Voice error";
    return "Voice chat";
  };

  return (
    <>
      {/* Microphone button */}
      <div className={cn("relative", className)}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleMicClick}
          disabled={disabled || state === "connecting"}
          title={getButtonTitle()}
          aria-label={getButtonTitle()}
          className={cn("h-9 w-9 rounded-full transition-colors", getButtonColor())}
        >
          {state === "active" && isRecording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>

        {/* TTS playback indicator */}
        {isPlaying && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <Volume2 className="h-3 w-3 text-blue-500 animate-pulse" />
          </span>
        )}

        {/* Active session indicator */}
        {state === "active" && !isRecording && (
          <Button
            variant="ghost"
            size="icon"
            onClick={endSession}
            title="End voice session"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-background border p-0"
          >
            <X className="h-2 w-2" />
          </Button>
        )}
      </div>

      {/* Error display */}
      {state === "error" && error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* PDPA/GDPR Consent Modal */}
      <Dialog open={showConsentModal} onOpenChange={setShowConsentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Voice Chat Consent</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Voice chat requires your consent to process audio. Please review the following:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    Your voice will be sent to third-party speech recognition services (Groq, OpenAI).
                  </li>
                  <li>
                    Audio is <strong>not stored</strong> — only the transcribed text is saved.
                  </li>
                  <li>
                    AI responses may be converted to speech using text-to-speech services.
                  </li>
                  <li>
                    You can withdraw consent at any time from your account settings.
                  </li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleConsentDecline} disabled={isGranting}>
              Decline
            </Button>
            <Button onClick={handleConsentGrant} disabled={isGranting}>
              {isGranting ? "Granting..." : "I Consent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default VoiceChat;
