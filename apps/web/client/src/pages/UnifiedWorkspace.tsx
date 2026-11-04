import { useEffect, useRef, useState } from "react";
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
  Loader2,
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
import { toast } from "sonner";

type GoalIntent = "development" | "mini_app";
type ChatCommandIntent = "chat" | "development" | "mini_app";

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

function addSkillFirstGuidance(prompt: string, intent: ChatCommandIntent) {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt || intent !== "development") return cleanPrompt;
  if (cleanPrompt.length > 3_700) return cleanPrompt;
  return `${cleanPrompt}\n\nแนวทาง Skill-first: ตรวจ AGENTS.md และค้นหา/อ่าน Skill ที่เกี่ยวข้องก่อนทำงาน หากไม่มีให้ทำตามมาตรฐาน repository สรุปเกณฑ์ตรวจรับจากคำขอและบริบทจริง แก้เฉพาะขอบเขตที่อนุมัติ รันทดสอบที่เหมาะสม และรายงานไฟล์กับผลทดสอบ หากขอบเขตไม่ชัดหรือเกินสิทธิ์ ให้หยุดขอการตัดสินใจในขั้น review`;
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
  const [chatCommandIntent, setChatCommandIntent] = useState<ChatCommandIntent>("chat");
  const [selectedProjectId, setSelectedProjectId] = useState(projectParam);
  const [firstMessage, setFirstMessage] = useState<{
    id: number;
    text: string;
    autoSend: boolean;
  } | null>(null);
  const [starterChatError, setStarterChatError] = useState(false);
  const [startingStarterChat, setStartingStarterChat] = useState(false);
  const createInFlight = useRef(false);
  const attemptedStarterChatKey = useRef<string | null>(null);
  const createConversation = trpc.chat.createConversation.useMutation();
  const starterChatStorageKey =
    user?.id != null
      ? `smartaihub-empty-chat:v1:${encodeURIComponent(String(user.currentTenantId ?? "personal"))}:${encodeURIComponent(String(user.id))}`
      : null;
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
  useEffect(() => setChatCommandIntent("chat"), [conversationId, threadId]);
  const titleQuery = trpc.chat.getConversation.useQuery(
    { id: conversationId ?? 0 },
    { enabled: Boolean(conversationId), staleTime: 30_000, retry: false }
  );
  const title = titleQuery.data?.title ?? null;
  const conversationProjectId = typeof titleQuery.data?.projectId === "string" ? titleQuery.data.projectId : null;
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
  const startStarterChat = async () => {
    if (!starterChatStorageKey || createInFlight.current) return;
    createInFlight.current = true;
    setStartingStarterChat(true);
    setStarterChatError(false);
    try {
      let existingId: number | null = null;
      try {
        const storedId = Number(
          window.sessionStorage.getItem(starterChatStorageKey)
        );
        if (Number.isSafeInteger(storedId) && storedId > 0) {
          existingId = storedId;
        }
      } catch {
        // Continue with a new conversation when browser storage is unavailable.
      }
      if (existingId) {
        navigate("chat", existingId, null);
        return;
      }
      const projectId =
        selectedProjectId &&
        (selectedProjectId === projectParam ||
          authorizedProjects.some(([id]) => id === selectedProjectId))
          ? selectedProjectId
          : undefined;
      const created = await createConversation.mutateAsync({
        title: "New chat",
        ...(projectId ? { projectId } : {}),
      });
      try {
        window.sessionStorage.setItem(starterChatStorageKey, String(created.id));
      } catch {
        // The conversation remains usable when browser storage is unavailable.
      }
      navigate("chat", created.id, null);
    } catch {
      attemptedStarterChatKey.current = null;
      setStarterChatError(true);
    } finally {
      createInFlight.current = false;
      setStartingStarterChat(false);
    }
  };
  useEffect(() => {
    if (mode !== "chat" || !starterChatStorageKey) return;
    if (conversationId) {
      attemptedStarterChatKey.current = null;
      return;
    }
    if (attemptedStarterChatKey.current === starterChatStorageKey) return;
    attemptedStarterChatKey.current = starterChatStorageKey;
    void startStarterChat();
  }, [mode, conversationId, starterChatStorageKey]);
  useEffect(() => {
    if (
      mode !== "chat" ||
      !conversationId ||
      !starterChatStorageKey ||
      titleQuery.error?.data?.code !== "NOT_FOUND"
    ) {
      return;
    }
    try {
      if (
        window.sessionStorage.getItem(starterChatStorageKey) !==
        String(conversationId)
      ) {
        return;
      }
      window.sessionStorage.removeItem(starterChatStorageKey);
    } catch {
      return;
    }
    setStarterChatError(false);
    navigate("chat", null, null);
  }, [mode, conversationId, starterChatStorageKey, titleQuery.error]);
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
      const created = await createConversation.mutateAsync({
        title: "New chat",
      });
      if (starterChatStorageKey) {
        try {
          window.sessionStorage.setItem(starterChatStorageKey, String(created.id));
        } catch {
          // The conversation remains usable when browser storage is unavailable.
        }
      }
      navigate("chat", created.id, null);
    } catch {
      toast.error("สร้างแชตใหม่ไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      createInFlight.current = false;
    }
  };
  const createGoalConversation = async (intent: GoalIntent, prompt = "") => {
    if (!isAdmin || createInFlight.current) return;
    createInFlight.current = true;
    try {
      const created = await createConversation.mutateAsync({
        title: prompt.trim().slice(0, 80) || (intent === "mini_app" ? "New Mini App Goal" : "New Development Goal"),
        ...(selectedProjectId && authorizedProjects.some(([id]) => id === selectedProjectId) ? { projectId: selectedProjectId } : {}),
      });
      setPilotConversationId(created.id);
      sessionStorage.setItem(`workspace-goal-draft:${created.id}`, JSON.stringify({ prompt: addSkillFirstGuidance(prompt, intent), intent }));
      setLocation(`/chat?mode=tasks&c=${created.id}&newGoal=1`);
    } catch {
      toast.error("สร้าง Goal ไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      createInFlight.current = false;
    }
  };
  const openGoalReviewFromChat = (prompt: string, intent: Exclude<ChatCommandIntent, "chat">) => {
    if (!isAdmin || !conversationId || !prompt.trim()) return;
    setChatCommandIntent("chat");
    const continuation = intent === "development"
      && /(?:ต่อจากเดิม|ทำต่อ|ทำงานเดิมต่อ|continue|resume)/i.test(prompt)
      ? /(?:spec(?:ification)?\s*[-#]?\s*|สเปก\s*|ข้อกำหนด\s*)(\d{3})/i.exec(prompt)?.[1]
      : undefined;
    sessionStorage.setItem(`workspace-goal-draft:${conversationId}`, JSON.stringify({
      ...(!continuation ? { prompt: addSkillFirstGuidance(prompt, intent) } : {}),
      intent,
      ...(continuation ? { resumeSpecId: continuation } : {}),
      returnToChat: true,
      originalPrompt: prompt.trim(),
    }));
    const next = new URLSearchParams();
    next.set("mode", "tasks");
    next.set("c", String(conversationId));
    if (threadId) next.set("t", threadId);
    const projectId = conversationProjectId ?? params.get("projectId");
    if (projectId) next.set("projectId", projectId);
    next.set("newGoal", "1");
    setLocation(`/chat?${next.toString()}`);
  };
  const openNewGoal = async (intent: GoalIntent = "development") => {
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
      toast.error("เปิด Autonomous Dev Pilot ไม่สำเร็จ ลองอีกครั้ง");
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
          {isAdmin && presentationMode === "developer" ? (
            <Button
              label="Autonomous Dev Pilot · Admin"
              variant="secondary"
              disabled={createConversation.isPending}
              onClick={() => void startFirstRunPilot()}
            />
          ) : null}
          {mode === "tasks" && isAdmin ? (
            <Button label="สร้างงานใหม่ / New Goal" variant="primary" onClick={() => void openNewGoal("development")} />
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
                      <VStack
                        as="section"
                        gap={3}
                        className="mx-auto flex h-full max-w-xl items-center justify-center px-6 text-center"
                        aria-labelledby="workspace-start-heading"
                      >
                        <h1
                          id="workspace-start-heading"
                          className="text-lg font-semibold"
                        >
                          {starterChatError
                            ? "เริ่มแชตไม่สำเร็จ"
                            : "กำลังเตรียมห้องแชต"}
                        </h1>
                        {starterChatError ? (
                          <>
                            <p role="alert" className="text-sm text-muted-foreground">
                              ยังสร้าง session ไม่ได้ ลองอีกครั้ง หรือเลือก session เดิมจากรายการทางซ้าย
                            </p>
                            <Button
                              type="button"
                              variant="primary"
                              onClick={() => {
                                attemptedStarterChatKey.current = null;
                                void startStarterChat();
                              }}
                            >
                              ลองอีกครั้ง
                            </Button>
                          </>
                        ) : (
                          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            {startingStarterChat || !starterChatStorageKey
                              ? "กำลังเปิด composer เต็มรูปแบบ…"
                              : "กำลังตรวจสอบ session…"}
                          </p>
                        )}
                      </VStack>
                    ) : (
                      <ChatView
                        conversationId={conversationId}
                        threadId={threadId}
                        density="default"
                        showExecutionActivity
                        composerPrompt={firstMessage}
                        workspaceCommandMode={
                          isAdmin ? chatCommandIntent : undefined
                        }
                        onWorkspaceCommandModeChange={
                          isAdmin ? setChatCommandIntent : undefined
                        }
                        onWorkspaceGoalSubmit={
                          isAdmin ? openGoalReviewFromChat : undefined
                        }
                        onUserMessageSent={() => {
                          setFirstMessage(null);
                          if (starterChatStorageKey && conversationId) {
                            try {
                              if (
                                window.sessionStorage.getItem(starterChatStorageKey) ===
                                String(conversationId)
                              ) {
                                window.sessionStorage.removeItem(starterChatStorageKey);
                              }
                            } catch {
                              // Storage may be unavailable in private contexts.
                            }
                          }
                        }}
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
        let draft: { prompt?: string; intent?: GoalIntent; resumeSpecId?: string; returnToChat?: boolean; originalPrompt?: string } = {};
        try { draft = JSON.parse(sessionStorage.getItem(`workspace-goal-draft:${conversationId}`) ?? "{}"); } catch { /* ignore corrupt local draft */ }
        return <Dialog open={params.get("newGoal") === "1"} onOpenChange={open => {
          if (!open) {
            const returnToChat = draft.returnToChat === true;
            const originalPrompt = typeof draft.originalPrompt === "string" ? draft.originalPrompt : "";
            sessionStorage.removeItem(`workspace-goal-draft:${conversationId}`);
            if (returnToChat) {
              setFirstMessage({ id: Date.now(), text: originalPrompt, autoSend: false });
              navigate("chat", conversationId, threadId);
            } else {
              navigate("tasks", conversationId, threadId);
            }
          }
        }}>
          <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-x-hidden overflow-y-auto p-4 sm:max-h-[92dvh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:p-5 md:max-w-4xl md:p-6 xl:max-w-6xl">
            <DialogHeader><DialogTitle>ตรวจสอบ Goal ก่อนส่งอนุมัติ</DialogTitle></DialogHeader>
            <Spec224WorkspacePanel
              conversationId={conversationId}
              threadId={threadId}
              simpleMode
              initialPrompt={draft.prompt}
              initialRequestKind={draft.intent === "mini_app" ? "mini_app" : "development"}
              resumeSpecId={draft.resumeSpecId}
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
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-x-hidden overflow-y-auto p-4 sm:max-h-[92dvh] sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:p-5 md:max-w-4xl md:p-6 xl:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Autonomous Dev Pilot · ทดสอบสำหรับ Admin</DialogTitle>
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
