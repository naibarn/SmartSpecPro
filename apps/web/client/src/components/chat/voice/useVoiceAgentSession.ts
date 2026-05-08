import { useMemo, useState } from "react";
import { useConversation } from "@elevenlabs/react";

import { trpc } from "@/lib/trpc";

export function useVoiceAgentSession(conversationId?: number | null) {
  const utils = trpc.useUtils();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configsQuery = trpc.voiceAgents.listEnabled.useQuery(
    { surface: "chat" },
    { retry: false },
  );
  const createSession = trpc.voiceAgents.createSession.useMutation();
  const getConnectionMaterial = trpc.voiceAgents.getConnectionMaterial.useMutation();
  const stopSession = trpc.voiceAgents.stopSession.useMutation();
  const ingestClientEvent = trpc.voiceAgents.ingestClientEvent.useMutation();

  const conversation = useConversation({
    onError: (message) => setError(typeof message === "string" ? message : "Voice session error"),
    onMessage: (message) => {
      if (!sessionId) return;
      ingestClientEvent.mutate({
        sessionId,
        eventType: "sdk_message",
        source: "agent",
        text: typeof message === "string" ? message : JSON.stringify(message),
        payload: typeof message === "object" && message ? message as unknown as Record<string, unknown> : {},
      });
    },
    onStatusChange: (status) => {
      if (!sessionId) return;
      ingestClientEvent.mutate({
        sessionId,
        eventType: "sdk_status",
        source: "system",
        payload: { status },
      });
    },
  });

  const configs = configsQuery.data ?? [];
  const activeConfigId = selectedConfigId ?? configs[0]?.id ?? null;
  const isActive = conversation.status === "connected";
  const isStarting = createSession.isPending || getConnectionMaterial.isPending;

  async function start() {
    if (!conversationId || !activeConfigId) return;
    setError(null);
    const created = await createSession.mutateAsync({
      agentConfigId: activeConfigId,
      conversationId,
      surface: "chat",
      connectionType: "webrtc_token",
      idempotencyKey: `chat:${conversationId}:${activeConfigId}:${Date.now()}`,
    });
    setSessionId(created.id);
    const material = await getConnectionMaterial.mutateAsync({ sessionId: created.id });
    if (material.conversationToken) {
      conversation.startSession({
        conversationToken: material.conversationToken,
        serverLocation: material.serverLocation,
      });
    } else if (material.signedUrl) {
      conversation.startSession({
        signedUrl: material.signedUrl,
        serverLocation: material.serverLocation,
      });
    } else {
      throw new Error("Voice agent connection material is missing");
    }
    window.setTimeout(() => {
      const providerConversationId = conversation.getId();
      if (providerConversationId) {
        ingestClientEvent.mutate({
          sessionId: created.id,
          providerConversationId,
          eventType: "sdk_started",
          source: "system",
          payload: { providerConversationId },
        });
      }
    }, 300);
  }

  async function stop() {
    conversation.endSession();
    if (sessionId) {
      await stopSession.mutateAsync({ sessionId, reason: "user" });
      setSessionId(null);
      await utils.voiceAgents.listEnabled.invalidate();
    }
  }

  return useMemo(() => ({
    configs,
    configsLoading: configsQuery.isLoading,
    selectedConfigId: activeConfigId,
    setSelectedConfigId,
    error,
    status: conversation.status,
    mode: conversation.mode,
    message: conversation.message,
    isMuted: conversation.isMuted,
    setMuted: conversation.setMuted,
    isActive,
    isStarting,
    start,
    stop,
  }), [
    activeConfigId,
    configs,
    configsQuery.isLoading,
    conversation.status,
    conversation.mode,
    conversation.message,
    conversation.isMuted,
    conversation.setMuted,
    error,
    isActive,
    isStarting,
  ]);
}
