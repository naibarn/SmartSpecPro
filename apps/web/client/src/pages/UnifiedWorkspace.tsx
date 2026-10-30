import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import {
  MessageSquare,
  Radio,
  Workflow,
  Plus,
  PanelLeftOpen,
  PanelRightOpen,
} from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { UnifiedWorkspaceInspector } from "@/components/chat/UnifiedWorkspaceInspector";
import { ProjectExecutionWorkspace } from "@/components/chat/ProjectExecutionWorkspace";
import { MissionControlWorkspace } from "@/components/chat/MissionControlWorkspace";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Spec224WorkspacePanel } from "@/components/chat/Spec224WorkspacePanel";

type WorkspaceMode = "chat" | "tasks" | "mission";
type PresentationMode = "simple" | "developer";

function modeFromSearch(search: string): WorkspaceMode {
  const params = new URLSearchParams(search);
  if (
    params.get("mode") === "mission" ||
    params.get("panel") === "mission-control"
  )
    return "mission";
  if (params.get("mode") === "tasks" || params.get("panel") === "control-plane")
    return "tasks";
  return "chat";
}

export default function UnifiedWorkspace() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const mode = modeFromSearch(search);
  const params = new URLSearchParams(search);
  const conversationValue = Number(params.get("c"));
  const conversationId =
    Number.isSafeInteger(conversationValue) && conversationValue > 0
      ? conversationValue
      : null;
  const threadId = params.get("t");
  const pilotRequested = params.get("pilot") === "1";
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(
    () =>
      window.localStorage.getItem("smartaihub-workspace-mode") === "developer"
        ? "developer"
        : "simple"
  );
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [pilotOpen, setPilotOpen] = useState(false);
  const [pilotConversationId, setPilotConversationId] = useState<number | null>(null);
  const createConversation = trpc.chat.createConversation.useMutation();
  const titleQuery = trpc.chat.getConversation.useQuery(
    { id: conversationId ?? 0 },
    { enabled: Boolean(conversationId), staleTime: 30_000, retry: false }
  );
  const title = titleQuery.data?.title ?? null;
  useEffect(() => {
    const legacyPanel = params.get("panel");
    const legacyBrowserOrAlert =
      params.has("browserSessionId") || params.has("dm") || params.has("alert");
    if ((!legacyPanel && !legacyBrowserOrAlert) || params.get("mode")) return;
    if (legacyPanel === "control-plane" || legacyPanel === "mission-control") {
      const next = new URLSearchParams(search);
      next.delete("panel");
      next.set("mode", legacyPanel === "mission-control" ? "mission" : "tasks");
      setLocation(`/chat?${next.toString()}`);
      return;
    }
    setLocation(`/chat-legacy${window.location.search}`);
  }, [search, params, setLocation]);
  useEffect(() => {
    if (!isAdmin || !pilotRequested || !conversationId || mode !== "chat") return;
    setPilotConversationId(conversationId);
    setPilotOpen(true);
  }, [isAdmin, conversationId, mode, pilotRequested]);
  useEffect(() => {
    if (mode !== "chat") setPilotOpen(false);
  }, [mode]);
  const navigate = (
    nextMode: WorkspaceMode,
    id = conversationId,
    thread = threadId
  ) => {
    const next = new URLSearchParams();
    if (id) next.set("c", String(id));
    if (thread) next.set("t", thread);
    if (nextMode !== "chat") next.set("mode", nextMode);
    setLocation(`/chat${next.size ? `?${next.toString()}` : ""}`);
  };
  const selectExecutions = (jobIds: string[], selectedJobId: string | null) => {
    const next = new URLSearchParams();
    next.set("mode", "mission");
    if (conversationId) next.set("c", String(conversationId));
    if (selectedJobId) next.set("jobId", selectedJobId);
    if (jobIds.length) next.set("jobIds", jobIds.join(","));
    setLocation(`/chat?${next.toString()}`);
  };
  const selectProject = (projectId: string) => {
    const next = new URLSearchParams();
    next.set("mode", "tasks");
    next.set("projectId", projectId);
    if (conversationId) next.set("c", String(conversationId));
    if (threadId) next.set("t", threadId);
    setLocation(`/chat?${next.toString()}`);
  };
  const newChat = async () => {
    const created = await createConversation.mutateAsync({ title: "New chat" });
    navigate("chat", created.id, null);
  };
  const startFirstRunPilot = async () => {
    if (!isAdmin || createConversation.isPending) return;
    try {
      const created = await createConversation.mutateAsync({ title: "Autonomous development pilot" });
      setPilotConversationId(created.id);
      setLocation(`/chat?c=${created.id}&pilot=1`);
      setPilotOpen(true);
    } catch {
      // The conversation mutation surfaces its standard error state; do not open
      // a pilot review without a durable canonical conversation to bind to.
    }
  };
  const setMode = (next: PresentationMode) => {
    setPresentationMode(next);
    window.localStorage.setItem("smartaihub-workspace-mode", next);
  };

  const workspaceNav = (
    <SideNav
      collapsible={{ defaultIsCollapsed: false }}
      resizable={{
        defaultWidth: 244,
        minWidth: 216,
        maxWidth: 320,
        autoSaveId: "smartaihub-workspace-nav",
      }}
      header={
        <SideNavHeading
          heading="SmartAIHub"
          headingHref="/chat"
          subheading="Development workspace"
        />
      }
      topContent={
        <Button
          label="New session"
          icon={<Plus aria-hidden="true" />}
          variant="primary"
          onClick={() => void newChat()}
        />
      }
    >
      <SideNavSection title="Workspace">
        <SideNavItem
          label="Chat"
          href="/chat"
          icon={<MessageSquare aria-hidden="true" />}
          isSelected={mode === "chat"}
        />
        <SideNavItem
          label="Task Control"
          href={`/chat?mode=tasks${params.get("projectId") ? `&projectId=${encodeURIComponent(params.get("projectId")!)}` : ""}${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`}
          icon={<Workflow aria-hidden="true" />}
          isSelected={mode === "tasks"}
        />
        <SideNavItem
          label="Mission Control"
          href={`/chat?mode=mission${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`}
          icon={<Radio aria-hidden="true" />}
          isSelected={mode === "mission"}
        />
      </SideNavSection>
    </SideNav>
  );

  const currentViewLabel =
    mode === "chat"
      ? "Chat"
      : mode === "tasks"
        ? "Task Control"
        : "Mission Control";
  const workspaceTopNav = (
    <TopNav
      label="SmartAIHub workspace navigation"
      heading={
        <TopNavHeading
          heading="SmartAIHub"
          headingHref="/chat"
          subheading={currentViewLabel}
        />
      }
      startContent={
        <p>
          {mode === "chat"
            ? conversationId
              ? `Session ${conversationId}`
              : "Start or resume a conversation"
            : mode === "tasks"
              ? "Project lifecycle and work evidence"
              : "Harness, agent, machine, and run activity"}
        </p>
      }
      endContent={
        <HStack gap={1}>
          {isAdmin ? (
            <Button
              label="ทดสอบการทำงานจริง"
              variant="primary"
              disabled={createConversation.isPending}
              onClick={() => void startFirstRunPilot()}
            />
          ) : null}
          <Button
            label="Simple"
            variant={presentationMode === "simple" ? "primary" : "secondary"}
            onClick={() => setMode("simple")}
          />
          <Button
            label="Developer"
            variant={presentationMode === "developer" ? "primary" : "secondary"}
            onClick={() => setMode("developer")}
          />
        </HStack>
      }
    />
  );

  return (
    <AppShell
      height="fill"
      contentPadding={0}
      variant="surface"
      sideNav={workspaceNav}
      topNav={workspaceTopNav}
    >
      {mode === "chat" ? (
        <>
          <Layout
            height="fill"
            padding={0}
            start={
              !isMobile ? (
                <LayoutPanel
                  label="Projects, sessions, and threads"
                  width="19rem"
                  hasDivider
                  isScrollable
                >
                  <ChatSidebar
                    selectedConversationId={conversationId}
                    selectedThreadId={threadId}
                    onSelectConversation={id => navigate("chat", id, null)}
                    onSelectThread={(id, thread) =>
                      navigate("chat", id, thread)
                    }
                    onNewChat={() => void newChat()}
                  />
                </LayoutPanel>
              ) : undefined
            }
            content={
              <LayoutContent isScrollable={false} padding={0}>
                <VStack as="section" gap={0} className="h-full min-h-0">
                  {isMobile ? (
                    <HStack
                      as="nav"
                      gap={2}
                      padding={2}
                      aria-label="Chat workspace panels"
                    >
                      <Button
                        label="Sessions"
                        icon={<PanelLeftOpen aria-hidden="true" />}
                        variant="secondary"
                        onClick={() => setMobileSessionsOpen(true)}
                      />
                      <Button
                        label="Inspector"
                        icon={<PanelRightOpen aria-hidden="true" />}
                        variant="secondary"
                        onClick={() => setMobileInspectorOpen(true)}
                      />
                    </HStack>
                  ) : null}
                  <section className="min-h-0 flex-1">
                    <ChatView
                      conversationId={conversationId}
                      threadId={threadId}
                      density="default"
                      showExecutionActivity
                      showBrowserSessionEntry
                    />
                  </section>
                </VStack>
              </LayoutContent>
            }
            end={
              !isMobile ? (
                <LayoutPanel
                  label="Thread and execution inspector"
                  width="22rem"
                  hasDivider
                  isScrollable
                >
                  <UnifiedWorkspaceInspector
                    conversationId={conversationId}
                    threadId={threadId}
                    conversationTitle={title}
                  />
                </LayoutPanel>
              ) : undefined
            }
          />
          {isMobile ? (
            <>
              <Dialog
                open={mobileSessionsOpen}
                onOpenChange={setMobileSessionsOpen}
              >
                <DialogContent className="max-h-[85dvh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Projects and sessions</DialogTitle>
                  </DialogHeader>
                  <ChatSidebar
                    selectedConversationId={conversationId}
                    selectedThreadId={threadId}
                    onSelectConversation={id => {
                      setMobileSessionsOpen(false);
                      navigate("chat", id, null);
                    }}
                    onSelectThread={(id, thread) => {
                      setMobileSessionsOpen(false);
                      navigate("chat", id, thread);
                    }}
                    onNewChat={() => {
                      setMobileSessionsOpen(false);
                      void newChat();
                    }}
                  />
                </DialogContent>
              </Dialog>
              <Dialog
                open={mobileInspectorOpen}
                onOpenChange={setMobileInspectorOpen}
              >
                <DialogContent className="max-h-[85dvh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Thread and execution inspector</DialogTitle>
                  </DialogHeader>
                  <UnifiedWorkspaceInspector
                    conversationId={conversationId}
                    threadId={threadId}
                    conversationTitle={title}
                  />
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </>
      ) : null}
      {mode === "tasks" ? (
        <ProjectExecutionWorkspace
          initialProjectId={params.get("projectId")}
          initialJobId={params.get("jobId")}
          onSelectProject={selectProject}
          onOpenConversation={(id, thread) => navigate("chat", id, thread)}
          presentationMode={presentationMode}
        />
      ) : null}
      {mode === "mission" ? (
        <MissionControlWorkspace
          onOpenConversation={(id, thread) => navigate("chat", id, thread)}
          onSelectExecutions={selectExecutions}
          presentationMode={presentationMode}
          initialJobId={params.get("jobId")}
          initialJobIds={(params.get("jobIds") ?? "")
            .split(",")
            .filter(Boolean)}
        />
      ) : null}
      <Dialog open={pilotOpen} onOpenChange={open => {
        setPilotOpen(open);
        if (!open && pilotRequested && mode === "chat") navigate("chat", pilotConversationId ?? conversationId, null);
      }}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ทดสอบการทำงานจริง · First Run Pilot</DialogTitle>
          </DialogHeader>
          {pilotConversationId ? (
            <Spec224WorkspacePanel
              conversationId={pilotConversationId}
              simpleMode
              pilotMode
              onCreateConversation={async title => {
                const created = await createConversation.mutateAsync({ title });
                return created.id;
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
