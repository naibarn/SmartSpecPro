import { useState } from "react";
import { Bot, Loader2, Plus, RefreshCw } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function AdminVoiceAgents() {
  const utils = trpc.useUtils();
  const configsQuery = trpc.voiceAgents.admin.listConfigs.useQuery(undefined, { retry: false });
  const createConfig = trpc.voiceAgents.admin.createConfig.useMutation({
    onSuccess: () => {
      setDisplayName("");
      setExternalAgentId("");
      void utils.voiceAgents.admin.listConfigs.invalidate();
    },
  });
  const setEnabled = trpc.voiceAgents.admin.setConfigEnabled.useMutation({
    onSuccess: () => void utils.voiceAgents.admin.listConfigs.invalidate(),
  });

  const [displayName, setDisplayName] = useState("");
  const [externalAgentId, setExternalAgentId] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voice Agents</h1>
          <p className="text-sm text-muted-foreground">
            Tenant-scoped ElevenLabs ElevenAgents configs for Chat voice sessions.
          </p>
        </div>
        <Badge variant="outline" className="gap-2">
          <Bot className="h-3.5 w-3.5" />
          ElevenLabs
        </Badge>
      </div>

      <form
        className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          createConfig.mutate({
            displayName,
            externalAgentId,
            isEnabled: false,
            allowedSurfaces: ["chat"],
            allowedTools: ["chat.create_message"],
            serverLocation: "us",
            retentionPolicy: "default",
            configJson: {},
          });
        }}
      >
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Display name"
        />
        <Input
          value={externalAgentId}
          onChange={(event) => setExternalAgentId(event.target.value)}
          placeholder="ElevenLabs agent ID"
        />
        <Button type="submit" className="gap-2" disabled={!displayName.trim() || !externalAgentId.trim() || createConfig.isPending}>
          {createConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </form>

      <div className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-medium">Configs</div>
          <Button variant="ghost" size="icon" onClick={() => void configsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {configsQuery.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading voice agents...
          </div>
        ) : configsQuery.error ? (
          <div className="px-4 py-6 text-sm text-red-600">{configsQuery.error.message}</div>
        ) : configsQuery.data?.length ? (
          <div className="divide-y">
            {configsQuery.data.map((config) => (
              <div key={config.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{config.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">{config.externalAgentId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={config.isEnabled ? "default" : "secondary"}>
                    {config.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setEnabled.isPending}
                    onClick={() => setEnabled.mutate({ id: config.id, isEnabled: !config.isEnabled })}
                  >
                    {config.isEnabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            No voice-agent configs yet. Add an ElevenLabs agent ID to enable Chat voice sessions.
          </div>
        )}
      </div>
    </div>
  );
}
