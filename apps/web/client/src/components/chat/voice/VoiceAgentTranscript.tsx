export function VoiceAgentTranscript({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      {message}
    </div>
  );
}
