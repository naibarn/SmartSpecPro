import { Loader2, Mic, MicOff, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";

export function VoiceAgentControls({
  isStarting,
  isActive,
  isMuted,
  disabled,
  onStart,
  onStop,
  onToggleMute,
}: {
  isStarting: boolean;
  isActive: boolean;
  isMuted: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}) {
  if (isActive) {
    return (
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={onToggleMute}>
          {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 text-red-600" onClick={onStop}>
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" size="sm" className="h-8 gap-2" disabled={disabled || isStarting} onClick={onStart}>
      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
      Voice
    </Button>
  );
}
