import { ConversationProvider } from "@elevenlabs/react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceAgentControls } from "./VoiceAgentControls";
import { VoiceAgentStatus } from "./VoiceAgentStatus";
import { VoiceAgentTranscript } from "./VoiceAgentTranscript";
import { useVoiceAgentSession } from "./useVoiceAgentSession";

function VoiceAgentPanelInner({ conversationId }: { conversationId?: number | null }) {
  const voice = useVoiceAgentSession(conversationId);

  if (!conversationId || (!voice.configsLoading && voice.configs.length === 0)) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-2">
      <Select
        value={voice.selectedConfigId ? String(voice.selectedConfigId) : undefined}
        onValueChange={(value) => voice.setSelectedConfigId(Number(value))}
        disabled={voice.isActive || voice.configs.length <= 1}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="Voice agent" />
        </SelectTrigger>
        <SelectContent>
          {voice.configs.map((config) => (
            <SelectItem key={config.id} value={String(config.id)}>
              {config.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <VoiceAgentControls
        isStarting={voice.isStarting}
        isActive={voice.isActive}
        isMuted={voice.isMuted}
        disabled={!voice.selectedConfigId}
        onStart={() => void voice.start()}
        onStop={() => void voice.stop()}
        onToggleMute={() => voice.setMuted(!voice.isMuted)}
      />
      <VoiceAgentStatus status={voice.status} mode={voice.mode} error={voice.error} />
      <VoiceAgentTranscript message={voice.message} />
    </div>
  );
}

export function VoiceAgentPanel({ conversationId }: { conversationId?: number | null }) {
  return (
    <ConversationProvider>
      <VoiceAgentPanelInner conversationId={conversationId} />
    </ConversationProvider>
  );
}
