import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { DashboardCard } from "@/components/dashboard";
import { presentCustomerError } from "@shared/projectIdentityPresentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export function CreatePersonalMiniAppPanel() {
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const createConversation = trpc.chat.createPersonalConversation.useMutation();
  const startRun =
    trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation();
  const isPending = createConversation.isPending || startRun.isPending;

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = prompt.trim();
    if (!goal || isPending) return;
    const requestKey =
      idempotencyKey ||
      `personal-miniapp:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    setIdempotencyKey(requestKey);
    setErrorMessage(null);
    try {
      let activeConversationId = conversationId;
      if (activeConversationId === null) {
        const conversation = await createConversation.mutateAsync({
          title: "Personal Mini-App",
        });
        activeConversationId = conversation.id;
        setConversationId(activeConversationId);
      }
      const result = await startRun.mutateAsync({
        conversationId: activeConversationId,
        mode: "prompt",
        factoryMode: true,
        prompt: goal,
        idempotencyKey: requestKey,
      });
      setIdempotencyKey("");
      setConversationId(null);
      setLocation(`/miniapp/${encodeURIComponent(result.miniAppId)}`);
    } catch (error) {
      setErrorMessage(presentCustomerError(error, "Could not start this Mini-App."));
    }
  }

  return (
    <DashboardCard
      title="Create a Personal Mini-App"
      description="Describe what you want, then start. Your private App Home opens as soon as the run is recorded."
    >
      <form onSubmit={event => void start(event)} className="space-y-3">
        <label htmlFor="personal-miniapp-prompt" className="font-medium">
          What should your app do?
        </label>
        <Textarea
          id="personal-miniapp-prompt"
          value={prompt}
          onChange={event => setPrompt(event.target.value)}
          placeholder="Create a personal expense tracker with income, expenses and monthly charts."
          maxLength={4_000}
          rows={5}
          required
          aria-describedby="personal-miniapp-help"
        />
        <p id="personal-miniapp-help" className="text-sm text-muted-foreground">
          The private app uses your signed-in account, tenant, credits and
          available Gateway. No Windows Runner or separate staging tenant is
          needed.
        </p>
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <Button type="submit" disabled={!prompt.trim() || isPending}>
          {isPending ? "Starting…" : "Start Mini-App"}
        </Button>
      </form>
    </DashboardCard>
  );
}
