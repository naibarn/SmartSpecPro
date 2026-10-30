import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { Textarea } from "@/components/ui/textarea";

type StartIntent = "chat" | "development" | "mini_app" | "agent_task";

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
  const projectParam = params.get("projectId") ?? "";
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
  const [startPrompt, setStartPrompt] = useState("");
  const [startIntent, setStartIntent] = useState<StartIntent>("chat");
  const [selectedProjectId, setSelectedProjectId] = useState(projectParam);
  const [firstMessage, setFirstMessage] = useState<{ id: number; text: string; autoSend: true } | null>(null);
  const createInFlight = useRef(false);
  const createConversation = trpc.chat.createConversation.useMutation();
  useEffect(() => setSelectedProjectId(projectParam), [projectParam]);
  const recentThreads = trpc.chat.listRecentConversationThreads.useInfiniteQuery(
    { limit: 50 },
    { initialCursor: null, getNextPageParam: page => page.nextCursor ?? undefined, staleTime: 30_000, retry: false }
  );
  const authorizedProjects = [...new Map(
    (recentThreads.data?.pages ?? []).flatMap(page => page.items)
      .filter(thread => thread.projectId && thread.projectTitle)
      .map(thread => [thread.projectId!, thread.projectTitle!] as const)
  )];
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
    thread = threadId,
    selectedJobId?: string | null
  ) => {
    const next = new URLSearchParams();
    if (id) next.set("c", String(id));
    if (thread) next.set("t", thread);
    const sameExecutionContext = id === conversationId && thread === threadId;
    const jobId =
      selectedJobId === undefined
        ? sameExecutionContext
          ? params.get("jobId")
          : null
        : selectedJobId;
    if (jobId) next.set("jobId", jobId);
    const selectedProject = params.get("projectId");
    if (selectedProject) next.set("projectId", selectedProject);
    if (nextMode !== "chat") next.set("mode", nextMode);
    setLocation(`/chat${next.size ? `?${next.toString()}` : ""}`);
  };
  const selectExecutions = (jobIds: string[], selectedJobId: string | null) => {
    const next = new URLSearchParams();
    next.set("mode", "mission");
    if (conversationId) next.set("c", String(conversationId));
    if (threadId) next.set("t", threadId);
    if (params.get("projectId")) next.set("projectId", params.get("projectId")!);
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
    if (createInFlight.current) return;
    setFirstMessage(null);
    createInFlight.current = true;
    try {
    const created = await createConversation.mutateAsync({ title: "New chat" });
    navigate("chat", created.id, null);
    } finally {
      createInFlight.current = false;
    }
  };
  const createGoalConversation = async (intent: Exclude<StartIntent, "chat">, prompt = "") => {
    if (!isAdmin || createInFlight.current) return;
    createInFlight.current = true;
    try {
      const created = await createConversation.mutateAsync({
        title: prompt.trim().slice(0, 80) || (intent === "mini_app" ? "New Mini App Goal" : "New Development Goal"),
        ...(selectedProjectId && authorizedProjects.some(([id]) => id === selectedProjectId) ? { projectId: selectedProjectId } : {}),
      });
      setPilotConversationId(created.id);
      sessionStorage.setItem(`workspace-goal-draft:${created.id}`, JSON.stringify({ prompt, intent }));
      setLocation(`/chat?mode=tasks&c=${created.id}&newGoal=1`);
    } catch {
      // Keep the current page and draft intact when persistence fails.
    } finally {
      createInFlight.current = false;
    }
  };
  const submitStartCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prompt = startPrompt.trim();
    if (!prompt || createInFlight.current) return;
    if (startIntent !== "chat") {
      await createGoalConversation(startIntent, prompt);
      return;
    }
    createInFlight.current = true;
    try {
      const created = await createConversation.mutateAsync({
        title: prompt.slice(0, 80),
        ...(selectedProjectId && authorizedProjects.some(([id]) => id === selectedProjectId) ? { projectId: selectedProjectId } : {}),
      });
      setFirstMessage({ id: Date.now(), text: prompt, autoSend: true });
      setStartPrompt("");
      navigate("chat", created.id, null);
    } catch {
      // Keep the draft visible so the user can retry without losing the prompt.
    } finally {
      createInFlight.current = false;
    }
  };
  const openNewGoal = async (intent: Exclude<StartIntent, "chat"> = "development") => {
    await createGoalConversation(intent);
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
          headingHref={conversationId ? `/chat?c=${conversationId}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}${params.get("jobId") ? `&jobId=${encodeURIComponent(params.get("jobId")!)}` : ""}` : "/chat"}
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
          href={conversationId ? `/chat?c=${conversationId}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}${params.get("jobId") ? `&jobId=${encodeURIComponent(params.get("jobId")!)}` : ""}` : "/chat"}
          icon={<MessageSquare aria-hidden="true" />}
          isSelected={mode === "chat"}
        />
        <SideNavItem
          label="Task Control"
          href={`/chat?mode=tasks${params.get("projectId") ? `&projectId=${encodeURIComponent(params.get("projectId")!)}` : ""}${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}${params.get("jobId") ? `&jobId=${encodeURIComponent(params.get("jobId")!)}` : ""}`}
          icon={<Workflow aria-hidden="true" />}
          isSelected={mode === "tasks"}
        />
        <SideNavItem
          label="Mission Control"
          href={`/chat?mode=mission${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}${params.get("jobId") ? `&jobId=${encodeURIComponent(params.get("jobId")!)}` : ""}`}
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
          {mode === "tasks" && isAdmin ? (
            <Button label="สร้างงานใหม่ / New Goal" variant="primary" onClick={() => void openNewGoal("development")} />
          ) : null}
          {mode === "mission" && isAdmin ? (
            <Button label="New Agent Task" variant="primary" onClick={() => void openNewGoal("agent_task")} />
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
                    {!conversationId ? (
                      <section className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-5 overflow-y-auto px-4 py-8 sm:px-8" aria-labelledby="workspace-start-heading">
                        <header className="space-y-2">
                          <p className="text-sm font-medium text-primary">SmartAIHub Workspace</p>
                          <h1 id="workspace-start-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">ต้องการให้ AI ช่วยทำอะไร?</h1>
                          <p className="max-w-2xl text-sm text-muted-foreground">เริ่มแชตได้ทันที หรือเลือกชนิดงานเพื่อเปิด Goal review ก่อนส่งให้ Harness ทำงาน</p>
                        </header>
                        <form onSubmit={event => void submitStartCommand(event)} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label="Start work">
                          <label htmlFor="workspace-first-prompt" className="sr-only">คำสั่งเริ่มต้น</label>
                          <Textarea id="workspace-first-prompt" value={startPrompt} onChange={event => setStartPrompt(event.target.value)} placeholder="พิมพ์คำสั่งหรือเป้าหมายที่ต้องการ…" className="min-h-32 resize-y bg-background text-base" />
                          <div className="flex flex-wrap gap-2" role="group" aria-label="ชนิดงาน">
                            {([ ["chat", "Chat"], ["development", "Development"], ["mini_app", "Mini App"], ["agent_task", "Agent Task"] ] as const).map(([intent, label]) => (
                              <Button key={intent} type="button" variant={startIntent === intent ? "primary" : "secondary"} onClick={() => setStartIntent(intent)} aria-pressed={startIntent === intent}>{label}</Button>
                            ))}
                          </div>
                          {authorizedProjects.length > 0 ? (
                            <label className="block space-y-1 text-sm">
                              <span>Project (optional)</span>
                              <select aria-label="Project" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3">
                                <option value="">No project</option>
                                {authorizedProjects.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                              </select>
                            </label>
                          ) : null}
                          <HStack gap={2} wrap="wrap" className="justify-between">
                            <Button type="button" variant="secondary" onClick={() => void newChat()} disabled={createConversation.isPending}>New Chat</Button>
                            <Button type="submit" variant="primary" disabled={!startPrompt.trim() || createConversation.isPending || (startIntent !== "chat" && !isAdmin)}>
                              {startIntent === "chat" ? "ส่งข้อความ" : startIntent === "mini_app" ? "ตรวจ Goal สำหรับ Mini App" : "ตรวจ Goal ก่อนเริ่มงาน"}
                            </Button>
                          </HStack>
                          {startIntent !== "chat" && !isAdmin ? <p role="status" className="text-sm text-muted-foreground">การสร้าง Goal ต้องใช้บัญชี Admin ที่ได้รับอนุญาต</p> : null}
                        </form>
                        <HStack gap={2} wrap="wrap" aria-label="Quick start actions">
                          {isAdmin ? <Button variant="secondary" onClick={() => void startFirstRunPilot()}>Develop SmartAIHub</Button> : null}
                          <Button variant="secondary" onClick={() => { setStartIntent("mini_app"); document.getElementById("workspace-first-prompt")?.focus(); }}>Develop an App</Button>
                          <Button variant="secondary" onClick={() => { setStartIntent("agent_task"); document.getElementById("workspace-first-prompt")?.focus(); }}>Run Agent Task</Button>
                        </HStack>
                        <p className="text-sm text-muted-foreground">Resume recent work ได้จากรายการ Sessions ทางซ้าย</p>
                      </section>
                    ) : (
                    <ChatView
                      conversationId={conversationId}
                      threadId={threadId}
                      density="default"
                      showExecutionActivity
                      showBrowserSessionEntry
                      composerPrompt={firstMessage}
                      onUserMessageSent={() => setFirstMessage(null)}
                    />
                    )}
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
                    jobId={params.get("jobId")}
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
                    jobId={params.get("jobId")}
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
          onOpenConversation={(id, thread, jobId) =>
            navigate("chat", id, thread, jobId)
          }
          presentationMode={presentationMode}
        />
      ) : null}
      {mode === "mission" ? (
        <MissionControlWorkspace
          onOpenConversation={(id, thread, jobId) =>
            navigate("chat", id, thread, jobId)
          }
          onSelectExecutions={selectExecutions}
          presentationMode={presentationMode}
          initialJobId={params.get("jobId")}
          initialJobIds={(params.get("jobIds") ?? "")
            .split(",")
            .filter(Boolean)}
        />
      ) : null}
      {mode === "tasks" && isAdmin && params.get("newGoal") === "1" && conversationId ? (() => {
        let draft: { prompt?: string; intent?: StartIntent } = {};
        try { draft = JSON.parse(sessionStorage.getItem(`workspace-goal-draft:${conversationId}`) ?? "{}"); } catch { /* ignore corrupt local draft */ }
        return <Dialog open={params.get("newGoal") === "1"} onOpenChange={open => {
          if (!open) {
            sessionStorage.removeItem(`workspace-goal-draft:${conversationId}`);
            navigate("tasks", conversationId, threadId);
          }
        }}>
          <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
            <DialogHeader><DialogTitle>ตรวจสอบ Goal ก่อนส่งอนุมัติ</DialogTitle></DialogHeader>
            <Spec224WorkspacePanel
              conversationId={conversationId}
              simpleMode
              initialPrompt={draft.prompt}
              initialRequestKind={draft.intent === "mini_app" ? "mini_app" : "development"}
              onCreateConversation={async title => {
                const created = await createConversation.mutateAsync({ title });
                return created.id;
              }}
            />
          </DialogContent>
        </Dialog>;
      })() : null}
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
              requestedHarnessAdapterId={params.get("harness")}
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
