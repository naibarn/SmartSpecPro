import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { Activity, Bot, MessageSquare, Radio, Workflow, Plus, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatView } from "@/components/chat/ChatView";
import { UnifiedWorkspaceInspector } from "@/components/chat/UnifiedWorkspaceInspector";
import { trpc } from "@/lib/trpc";
import { useTaskHarnessOutputEvents } from "@/lib/useTaskHarnessOutputEvents";

type WorkspaceMode = "chat" | "tasks" | "mission";
type PresentationMode = "simple" | "developer";

function modeFromSearch(search: string): WorkspaceMode {
  const params = new URLSearchParams(search);
  if (params.get("mode") === "mission" || params.get("panel") === "mission-control") return "mission";
  if (params.get("mode") === "tasks" || params.get("panel") === "control-plane") return "tasks";
  return "chat";
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function ProjectTaskControl({ onOpenConversation, initialProjectId, onSelectProject }: { onOpenConversation: (id: number, threadId: string | null) => void; initialProjectId: string | null; onSelectProject: (projectId: string) => void }) {
  const query = trpc.workerJobs.observability.useQuery({}, { staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false, retry: false });
  const items = query.data?.items ?? [];
  const projects = useMemo(() => {
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.projectId ?? item.specId ?? "unassigned";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].sort((a, b) => (b[1][0]?.createdAt ?? "").localeCompare(a[1][0]?.createdAt ?? ""));
  }, [items]);
  const [selectedProject, setSelectedProject] = useState<string | null>(initialProjectId);
  const activeProject = projects.find(([id]) => id === selectedProject) ?? projects[0];
  const stages = ["Plan", "Implement", "Review", "UAT", "Bugs / Fixes", "Complete"];

  return (
    <LayoutContent isScrollable padding={4}>
      <VStack as="section" gap={4}>
        <header>
          <p>PROJECT EXECUTION</p>
          <h1>Task Control</h1>
          <p>ติดตามเป้าหมายและขั้นตอนของ Project จากงานที่มีอยู่จริง</p>
          <a href="/chat-legacy?panel=control-plane&view=full">สร้าง Goal และตรวจสิทธิ์การเริ่มงาน</a>
        </header>
        {query.error ? <p role="alert">โหลดสถานะงานไม่สำเร็จ ข้อมูลจาก API ไม่พร้อมใช้งาน</p> : null}
        {query.isLoading ? <p role="status">กำลังโหลด Project และงาน…</p> : null}
        {!query.isLoading && !query.error && projects.length === 0 ? (
          <VStack as="section" gap={2} padding={4}>
            <h2>ยังไม่มี Goal หรือ Run ในมุมมองนี้</h2>
            <p>เริ่มจาก Chat แล้วงานที่ได้รับอนุมัติจะปรากฏใน Project Control โดยอัตโนมัติ</p>
            <a href="/chat">ไปที่ Chat เพื่อเริ่มงาน</a>
          </VStack>
        ) : null}
        {projects.length > 0 ? (
          <Layout start={<LayoutPanel label="Project list" width="17rem" hasDivider isScrollable>
            <VStack as="nav" gap={1} padding={2} aria-label="Projects">
              <h2>Projects</h2>
              {projects.map(([projectId]) => <Button key={projectId} label={projectId === "unassigned" ? "Unassigned work" : projectId} variant={activeProject?.[0] === projectId ? "primary" : "ghost"} onClick={() => { setSelectedProject(projectId); onSelectProject(projectId); }} />)}
            </VStack>
          </LayoutPanel>} content={<LayoutContent isScrollable padding={4}>
            {activeProject ? <VStack as="section" gap={4}>
              <header><p>PROJECT</p><h2>{activeProject[0] === "unassigned" ? "งานที่ยังไม่ผูก Project" : activeProject[0]}</h2><p>{activeProject[1].length} รายการจาก Task Control API</p></header>
              <HStack as="ol" gap={2} wrap="wrap" aria-label="Project lifecycle stages">
                {stages.map(stage => {
                  const needle = stage === "Bugs / Fixes" ? /bug|fix|verify/i : new RegExp(stage.toLowerCase(), "i");
                  const stageJobs = activeProject[1].filter(item => needle.test(`${item.stage ?? ""} ${item.jobType}`));
                  return <li key={stage}><VStack as="section" gap={1} padding={2}><strong>{stage}</strong><small>{stageJobs.length ? `${stageJobs.length} recorded item(s)` : "Not recorded"}</small></VStack></li>;
                })}
              </HStack>
              <VStack as="section" gap={2}>
                <h3>เป้าหมายและงานล่าสุด</h3>
                {activeProject[1].map(item => <VStack key={item.id} as="article" gap={1} padding={3}>
                  <HStack gap={2} wrap="wrap"><strong>{item.threadTitle ?? item.conversationTitle ?? item.jobType}</strong><small>{statusLabel(item.status)}</small></HStack>
                  <p>{item.stage ?? "ขั้นตอนยังไม่ถูกรายงาน"} · {item.executionIdentity.harness ?? "Harness ยังไม่ระบุ"} · {item.executionIdentity.agent ?? "Agent ยังไม่ระบุ"}</p>
                  <p>{item.operatorAttention.required ? `ต้องตรวจสอบ: ${item.operatorAttention.reason ?? "มีรายการรอการตัดสินใจ"}` : "ไม่มีรายการที่ต้องให้ความสนใจตามข้อมูลล่าสุด"}</p>
                  <a href={`/chat?mode=mission&jobId=${encodeURIComponent(item.id)}`}>ดู execution เดียวกันใน Mission Control</a>
                  {item.conversationId ? <Button label="เปิดบทสนทนาและหลักฐาน" variant="secondary" onClick={() => onOpenConversation(item.conversationId!, item.threadId)} /> : <small>ไม่มีบทสนทนาที่เชื่อมโยง</small>}
                </VStack>)}
              </VStack>
            </VStack> : null}
          </LayoutContent>} />
        ) : null}
      </VStack>
    </LayoutContent>
  );
}

function MissionControl({ onOpenConversation, onSelectExecutions, presentationMode, initialJobId, initialJobIds }: { onOpenConversation: (id: number, threadId: string | null) => void; onSelectExecutions: (jobIds: string[], selectedJobId: string | null) => void; presentationMode: PresentationMode; initialJobId: string | null; initialJobIds: string[] }) {
  const query = trpc.workerJobs.observability.useQuery({}, { staleTime: 10_000, refetchInterval: 8_000, refetchIntervalInBackground: false, retry: false });
  const runnersQuery = trpc.runnerNodes.list.useQuery(undefined, { staleTime: 10_000, refetchInterval: 15_000, refetchIntervalInBackground: false, retry: false });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId);
  const [selectedHarness, setSelectedHarness] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [selectedRunner, setSelectedRunner] = useState("all");
  const [openTabs, setOpenTabs] = useState<string[]>(() => [...new Set([...initialJobIds, ...(initialJobId ? [initialJobId] : [])])]);
  const jobs = query.data?.items ?? [];
  const filteredJobs = jobs.filter(job =>
    (selectedHarness === "all" || (job.executionIdentity.harness ?? "unknown") === selectedHarness)
    && (selectedAgent === "all" || (job.executionIdentity.agent ?? "unknown") === selectedAgent)
    && (selectedRunner === "all" || (job.runnerId ?? "unassigned") === selectedRunner),
  );
  const selected = filteredJobs.find(item => item.id === selectedJobId) ?? filteredJobs.find(item => openTabs.includes(item.id)) ?? filteredJobs[0] ?? null;
  useEffect(() => {
    if (selectedJobId && jobs.some(item => item.id === selectedJobId)) setOpenTabs(current => current.includes(selectedJobId) ? current : [...current, selectedJobId]);
  }, [selectedJobId, jobs]);
  useEffect(() => {
    const availableIds = new Set(jobs.map(item => item.id));
    const restoredTabs = [...new Set([...initialJobIds, ...(initialJobId ? [initialJobId] : [])])].filter(id => availableIds.has(id));
    if (restoredTabs.length) setOpenTabs(current => current.length === restoredTabs.length && current.every((id, index) => id === restoredTabs[index]) ? current : restoredTabs);
    if (initialJobId && availableIds.has(initialJobId)) setSelectedJobId(initialJobId);
  }, [initialJobId, initialJobIds.join("|"), jobs]);
  const groups = useMemo(() => {
    const result = new Map<string, typeof jobs>();
    for (const job of jobs) {
      const harness = job.executionIdentity.harness ?? "Harness not reported";
      result.set(harness, [...(result.get(harness) ?? []), job]);
    }
    return [...result.entries()];
  }, [jobs]);
  const runners = runnersQuery.data?.runners ?? [];
  const active = jobs.filter(job => ["running", "claimed", "leased", "preparing", "uploading", "indexing"].includes(job.status));
  const output = useTaskHarnessOutputEvents(selected?.id ?? null, presentationMode === "developer");
  const events = output.eventsJobId === selected?.id ? output.events : [];
  const openJob = (id: string) => {
    setSelectedJobId(id);
    const nextTabs = openTabs.includes(id) ? openTabs : [...openTabs, id];
    setOpenTabs(nextTabs);
    onSelectExecutions(nextTabs, id);
  };

  return (
    <LayoutContent isScrollable padding={4}>
      <VStack as="section" gap={4}>
        <header><p>HARNESS OPERATIONS</p><h1>Mission Control</h1><p>มองงานตาม Harness และเครื่องที่กำลังทำงาน โดยใช้ execution เดียวกับ Task Control</p></header>
        <HStack gap={3} wrap="wrap" aria-label="Mission summary">
          <VStack as="section" gap={1} padding={3}><small>Active executions</small><strong>{active.length}</strong></VStack>
          <VStack as="section" gap={1} padding={3}><small>Harness views</small><strong>{groups.length}</strong></VStack>
          <VStack as="section" gap={1} padding={3}><small>Runner inventory</small><strong>{runners.length}</strong></VStack>
          <VStack as="section" gap={1} padding={3}><small>Needs attention</small><strong>{jobs.filter(job => job.operatorAttention.required).length}</strong></VStack>
        </HStack>
        {query.error || runnersQuery.error ? <p role="alert">สถานะ Mission Control บางส่วนโหลดไม่สำเร็จ โปรดลองใหม่; ไม่แสดงข้อมูลจำลอง</p> : null}
        <Layout start={<LayoutPanel label="Harness and runner fleet" width="19rem" hasDivider isScrollable>
          <VStack as="section" gap={3} padding={3}>
            <h2>Harnesses</h2>
            {groups.length === 0 && !query.isLoading ? <p>ยังไม่มี execution ที่ระบุ Harness จากข้อมูลจริง</p> : null}
            {groups.map(([harness, harnessJobs]) => <VStack key={harness} as="section" gap={1}>
              <Button label={`${harness} · ${harnessJobs.length}`} variant={selectedHarness === harness ? "primary" : "ghost"} icon={<Bot aria-hidden="true" />} onClick={() => setSelectedHarness(current => current === harness ? "all" : harness)} />
            </VStack>)}
            <h2>Runners / Machines</h2>
            {runners.map(runner => <VStack key={runner.runnerId} as="section" gap={1} padding={2}>
              <Button label={runner.displayName ?? `Runner ${runner.runnerId}`} variant={selectedRunner === runner.runnerId ? "primary" : "ghost"} icon={<Radio aria-hidden="true" />} onClick={() => setSelectedRunner(current => current === runner.runnerId ? "all" : runner.runnerId)} />
              <small>Connection: {runner.status ?? "unknown"} · Trust: {runner.trustState ?? "unknown"} · Catalog snapshot: {runner.capabilitySnapshotCurrent ? "fresh" : "stale or missing"}</small>
              <small>Capability ACK: {runner.capabilityAckState ?? "unknown"} · Dispatch readiness: {runner.readinessStatus ?? "not reported"} · Heartbeat: {runner.lastSeenAt ?? "not reported"}</small>
            </VStack>)}
          </VStack>
        </LayoutPanel>} content={<LayoutContent isScrollable padding={4}>
          <VStack as="section" gap={4}>
            <HStack gap={3} wrap="wrap" aria-label="Filter executions">
              <label>Harness <select aria-label="Filter by harness" value={selectedHarness} onChange={event => setSelectedHarness(event.target.value)}><option value="all">All harnesses</option>{groups.map(([harness]) => <option key={harness} value={harness}>{harness}</option>)}</select></label>
              <label>Agent <select aria-label="Filter by agent" value={selectedAgent} onChange={event => setSelectedAgent(event.target.value)}><option value="all">All agents</option>{[...new Set(jobs.map(job => job.executionIdentity.agent ?? "unknown"))].map(agent => <option key={agent} value={agent}>{agent}</option>)}</select></label>
              <label>Runner <select aria-label="Filter by runner" value={selectedRunner} onChange={event => setSelectedRunner(event.target.value)}><option value="all">All machines</option><option value="unassigned">No Runner assigned</option>{runners.map(runner => <option key={runner.runnerId} value={runner.runnerId}>{runner.displayName ?? runner.runnerId}</option>)}</select></label>
            </HStack>
            <VStack as="section" gap={1} aria-label="Runs in current view">
              <h2>Runs · {filteredJobs.length}</h2>
              {filteredJobs.map(job => <Button key={job.id} label={`${job.threadTitle ?? job.conversationTitle ?? job.jobType} · ${statusLabel(job.status)}`} variant={selected?.id === job.id ? "primary" : "secondary"} onClick={() => openJob(job.id)} />)}
            </VStack>
            <HStack as="nav" gap={2} wrap="wrap" aria-label="Open executions">
              <strong>Open sessions</strong>
              {openTabs.map(id => { const job = jobs.find(item => item.id === id); return job ? <HStack key={id} gap={1}><Button label={job.threadTitle ?? job.conversationTitle ?? job.jobType} variant={selected?.id === id ? "primary" : "secondary"} onClick={() => { setSelectedJobId(id); onSelectExecutions(openTabs, id); }} /><Button label={`Close view ${job.threadTitle ?? job.jobType}`} variant="ghost" onClick={() => { const nextTabs = openTabs.filter(tab => tab !== id); const nextSelectedId = selectedJobId === id ? nextTabs.at(-1) ?? null : selectedJobId; setOpenTabs(nextTabs); setSelectedJobId(nextSelectedId); onSelectExecutions(nextTabs, nextSelectedId); }} /></HStack> : null; })}
            </HStack>
            {selected ? <VStack as="article" gap={3} padding={4}>
              <HStack gap={2} wrap="wrap"><Activity aria-hidden="true" /><h2>{selected.threadTitle ?? selected.conversationTitle ?? selected.jobType}</h2><strong>{statusLabel(selected.status)}</strong></HStack>
              <p>{selected.executionIdentity.harness ?? "Harness not reported"} · {selected.executionIdentity.agent ?? "Agent not reported"} · {selected.runnerId ? "Runner assigned" : "Runner not reported"}</p>
              <p>Stage: {selected.stage ?? "Not reported"} · Last heartbeat: {selected.heartbeatAt ?? "Not reported"}</p>
              {presentationMode === "developer" ? <VStack as="section" gap={2}><p>Model: {selected.executionIdentity.model ?? "Not reported"} · Attempt {selected.attempt}/{selected.maxAttempts}</p><h3>Live Harness output</h3>{output.query.isLoading ? <p role="status">กำลังโหลด output…</p> : null}{output.query.error ? <p role="alert">output stream unavailable; open detailed evidence for durable history.</p> : null}{events.length ? events.map(event => <p key={event.id}>{event.text ?? event.detail ?? event.kind}</p>) : !output.query.isLoading && !output.query.error ? <p>ยังไม่มี output event สำหรับ execution นี้</p> : null}</VStack> : null}
              {selected.operatorAttention.required ? <p role="status">Needs attention: {selected.operatorAttention.reason ?? "Decision required"}</p> : null}
              {selected.conversationId ? <Button label="Open this conversation" variant="secondary" onClick={() => onOpenConversation(selected.conversationId!, selected.threadId)} /> : <p>No linked conversation was reported for this execution.</p>}
              {selected.executionIdentity.harness === "codex" || selected.executionIdentity.harness === "codex.v1" || selected.executionIdentity.harness === "microsoft_copilot" ? <a href={`/chat-legacy?panel=control-plane&view=full&harness=${selected.executionIdentity.harness.startsWith("microsoft") ? "microsoft-copilot.v1" : "codex.v1"}`}>เริ่ม Goal โดยเลือก {selected.executionIdentity.harness} (ตรวจ catalog และสิทธิ์อีกครั้ง)</a> : null}
              <a href={`/agent-monitor?jobId=${encodeURIComponent(selected.id)}`}>Open detailed execution evidence</a>
            </VStack> : <VStack as="section" gap={2} padding={4}><h2>{jobs.length && (selectedHarness !== "all" || selectedAgent !== "all" || selectedRunner !== "all") ? "ไม่มี Run ตรงกับตัวกรองนี้" : "ยังไม่มี Run ให้ตรวจสอบ"}</h2><p>{jobs.length ? "เปลี่ยน Harness, Agent หรือ Runner เพื่อดูงานอื่น" : "เมื่อมี execution ระบบจะแสดงตาม Harness, Agent, Runner และ Run จากข้อมูลจริงที่บันทึกไว้"}</p></VStack>}
          </VStack>
        </LayoutContent>} />
      </VStack>
    </LayoutContent>
  );
}

export default function UnifiedWorkspace() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const mode = modeFromSearch(search);
  const params = new URLSearchParams(search);
  const conversationValue = Number(params.get("c"));
  const conversationId = Number.isSafeInteger(conversationValue) && conversationValue > 0 ? conversationValue : null;
  const threadId = params.get("t");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>(() => window.localStorage.getItem("smartaihub-workspace-mode") === "developer" ? "developer" : "simple");
  const isMobile = useIsMobile();
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const createConversation = trpc.chat.createConversation.useMutation();
  const titleQuery = trpc.chat.getConversation.useQuery({ id: conversationId ?? 0 }, { enabled: Boolean(conversationId), staleTime: 30_000, retry: false });
  const title = titleQuery.data?.title ?? null;
  useEffect(() => {
    const legacyPanel = params.get("panel");
    const legacyBrowserOrAlert = params.has("browserSessionId") || params.has("dm") || params.has("alert");
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
  const navigate = (nextMode: WorkspaceMode, id = conversationId, thread = threadId) => {
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
  const setMode = (next: PresentationMode) => {
    setPresentationMode(next);
    window.localStorage.setItem("smartaihub-workspace-mode", next);
  };

  const workspaceNav = <SideNav
    collapsible={{ defaultIsCollapsed: false }}
    resizable={{ defaultWidth: 244, minWidth: 216, maxWidth: 320, autoSaveId: "smartaihub-workspace-nav" }}
    header={<SideNavHeading heading="SmartAIHub" headingHref="/chat" subheading="Development workspace" />}
    topContent={<Button label="New session" icon={<Plus aria-hidden="true" />} variant="primary" onClick={() => void newChat()} />}
  >
    <SideNavSection title="Workspace">
      <SideNavItem label="Chat" href="/chat" icon={<MessageSquare aria-hidden="true" />} isSelected={mode === "chat"} />
      <SideNavItem label="Task Control" href={`/chat?mode=tasks${params.get("projectId") ? `&projectId=${encodeURIComponent(params.get("projectId")!)}` : ""}${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`} icon={<Workflow aria-hidden="true" />} isSelected={mode === "tasks"} />
      <SideNavItem label="Mission Control" href={`/chat?mode=mission${conversationId ? `&c=${conversationId}` : ""}${threadId ? `&t=${encodeURIComponent(threadId)}` : ""}`} icon={<Radio aria-hidden="true" />} isSelected={mode === "mission"} />
    </SideNavSection>
  </SideNav>;

  const currentViewLabel = mode === "chat" ? "Chat" : mode === "tasks" ? "Task Control" : "Mission Control";
  const workspaceTopNav = <TopNav label="SmartAIHub workspace navigation" heading={<TopNavHeading heading="SmartAIHub" headingHref="/chat" subheading={currentViewLabel} />} startContent={<p>{mode === "chat" ? (conversationId ? `Session ${conversationId}` : "Start or resume a conversation") : mode === "tasks" ? "Project lifecycle and work evidence" : "Harness, agent, machine, and run activity"}</p>} endContent={<HStack gap={1}><Button label="Simple" variant={presentationMode === "simple" ? "primary" : "secondary"} onClick={() => setMode("simple")} /><Button label="Developer" variant={presentationMode === "developer" ? "primary" : "secondary"} onClick={() => setMode("developer")} /></HStack>} />;

  return (
    <AppShell height="fill" contentPadding={0} variant="surface" sideNav={workspaceNav} topNav={workspaceTopNav}>
      {mode === "chat" ? <>
        <Layout height="fill" padding={0} start={!isMobile ? <LayoutPanel label="Projects, sessions, and threads" width="19rem" hasDivider isScrollable><ChatSidebar selectedConversationId={conversationId} selectedThreadId={threadId} onSelectConversation={id => navigate("chat", id, null)} onSelectThread={(id, thread) => navigate("chat", id, thread)} onNewChat={() => void newChat()} /></LayoutPanel> : undefined} content={<LayoutContent isScrollable={false} padding={0}><VStack as="section" gap={0} className="h-full min-h-0">
          {isMobile ? <HStack as="nav" gap={2} padding={2} aria-label="Chat workspace panels"><Button label="Sessions" icon={<PanelLeftOpen aria-hidden="true" />} variant="secondary" onClick={() => setMobileSessionsOpen(true)} /><Button label="Inspector" icon={<PanelRightOpen aria-hidden="true" />} variant="secondary" onClick={() => setMobileInspectorOpen(true)} /></HStack> : null}
          <section className="min-h-0 flex-1"><ChatView conversationId={conversationId} threadId={threadId} density="default" showExecutionActivity showBrowserSessionEntry={false} /></section>
        </VStack></LayoutContent>} end={!isMobile ? <LayoutPanel label="Thread and execution inspector" width="22rem" hasDivider isScrollable><UnifiedWorkspaceInspector conversationId={conversationId} threadId={threadId} conversationTitle={title} /></LayoutPanel> : undefined} />
        {isMobile ? <>
          <Dialog open={mobileSessionsOpen} onOpenChange={setMobileSessionsOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Projects and sessions</DialogTitle></DialogHeader><ChatSidebar selectedConversationId={conversationId} selectedThreadId={threadId} onSelectConversation={id => { setMobileSessionsOpen(false); navigate("chat", id, null); }} onSelectThread={(id, thread) => { setMobileSessionsOpen(false); navigate("chat", id, thread); }} onNewChat={() => { setMobileSessionsOpen(false); void newChat(); }} /></DialogContent></Dialog>
          <Dialog open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Thread and execution inspector</DialogTitle></DialogHeader><UnifiedWorkspaceInspector conversationId={conversationId} threadId={threadId} conversationTitle={title} /></DialogContent></Dialog>
        </> : null}
      </> : null}
      {mode === "tasks" ? <ProjectTaskControl initialProjectId={params.get("projectId")} onSelectProject={selectProject} onOpenConversation={(id, thread) => navigate("chat", id, thread)} /> : null}
      {mode === "mission" ? <MissionControl onOpenConversation={(id, thread) => navigate("chat", id, thread)} onSelectExecutions={selectExecutions} presentationMode={presentationMode} initialJobId={params.get("jobId")} initialJobIds={(params.get("jobIds") ?? "").split(",").filter(Boolean)} /> : null}
    </AppShell>
  );
}
