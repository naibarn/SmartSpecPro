import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { UnifiedWorkspaceInspector } from "@/components/chat/UnifiedWorkspaceInspector";

type ChatPromptRequest = { id: number; text: string };
type MapContextDraft = { id: number; contextText: string };

/** One Chat surface shared by the full workspace and the compact assistant modal. */
export function UnifiedChatSurface({
  conversationId,
  threadId,
  title,
  compact = false,
  onSelectConversation,
  onSelectThread,
  onNewChat,
  composerPrompt,
  mapContextDraft,
  onRemoveMapContext,
  onUserMessageSent,
}: {
  conversationId: number | null;
  threadId: string | null;
  title?: string | null;
  compact?: boolean;
  onSelectConversation: (id: number) => void;
  onSelectThread: (id: number, thread: string | null) => void;
  onNewChat: () => void;
  composerPrompt?: ChatPromptRequest | null;
  mapContextDraft?: MapContextDraft | null;
  onRemoveMapContext?: () => void;
  onUserMessageSent?: () => void;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(!compact);
  const [inspectorOpen, setInspectorOpen] = useState(!compact);

  return (
    <Layout
      height="fill"
      padding={0}
      start={sessionsOpen ? <LayoutPanel label="Projects, sessions, and threads" width="18rem" hasDivider><ChatSidebar selectedConversationId={conversationId} selectedThreadId={threadId} onSelectConversation={onSelectConversation} onSelectThread={onSelectThread} onNewChat={onNewChat} /></LayoutPanel> : undefined}
      content={<LayoutContent isScrollable={false} padding={0}>
        <section className="flex h-full min-h-0 flex-col" aria-label="Chat workspace">
          <HStack as="header" gap={2} className="shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <HStack gap={1}>
              <Button label={sessionsOpen ? "Hide sessions" : "Show sessions"} icon={sessionsOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />} variant="ghost" onClick={() => setSessionsOpen(value => !value)} />
              <Button label={inspectorOpen ? "Hide inspector" : "Show inspector"} icon={inspectorOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />} variant="ghost" onClick={() => setInspectorOpen(value => !value)} />
            </HStack>
            <span className="truncate text-xs text-muted-foreground">{conversationId ? `Session ${conversationId}${threadId ? ` · Thread ${threadId}` : ""}` : "New session"}</span>
          </HStack>
          <ChatView
            conversationId={conversationId}
            threadId={threadId}
            density={compact ? "compact" : "default"}
            showExecutionActivity
            composerPrompt={composerPrompt}
            mapContextDraft={mapContextDraft}
            onRemoveMapContext={onRemoveMapContext}
            onUserMessageSent={onUserMessageSent}
            showBrowserSessionEntry={false}
          />
        </section>
      </LayoutContent>}
      end={inspectorOpen ? <LayoutPanel label="Thread and execution inspector" width="21rem" hasDivider><UnifiedWorkspaceInspector conversationId={conversationId} threadId={threadId} conversationTitle={title} /></LayoutPanel> : undefined}
    />
  );
}
