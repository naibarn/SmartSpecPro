import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AppShell } from "@astryxdesign/core/AppShell";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Button } from "@astryxdesign/core/Button";
import { Activity, Bot, MessageSquare, Radio, Workflow } from "lucide-react";
import { UnifiedChatSurface } from "@/components/chat/UnifiedChatSurface";
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

function ProjectTaskControl({ onOpenConversation }: { onOpenConversation: (id: number, threadId: string | null) => void }) {
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
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
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
              {projects.map(([projectId, jobs]) => <Button key={projectId} label={projectId === "unassigned" ? "Unassigned work" : projectId} variant={activeProject?.[0] === projectId ? "primary" : "ghost"} onClick={() => setSelectedProject(projectId)} />)}
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
  const [openTabs, setOpenTabs] = useState<string[]>(() => [...new Set([...initialJobIds, ...(initialJobId ? [initialJobId] : [])])]);
  const jobs = query.data?.items ?? [];
  const selected = jobs.find(item => item.id === selectedJobId) ?? jobs.find(item => openTabs.includes(item.id)) ?? jobs[0] ?? null;
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
              <HStack gap={2}><Bot aria-hidden="true" /><strong>{harness}</strong><small>{harnessJobs.length}</small></HStack>
              {harnessJobs.map(job => <Button key={job.id} label={job.threadTitle ?? job.conversationTitle ?? job.jobType} variant={selected?.id === job.id ? "primary" : "ghost"} onClick={() => openJob(job.id)} />)}
            </VStack>)}
            <h2>Runners / Machines</h2>
            {runners.map(runner => <VStack key={runner.runnerId} as="section" gap={1} padding={2}><HStack gap={2}><Radio aria-hidden="true" /><strong>{runner.displayName ?? "Runner"}</strong></HStack><small>Connection: {runner.status ?? "unknown"} · Trust: {runner.trustState ?? "unknown"} · Catalog snapshot: {runner.capabilitySnapshotCurrent ? "fresh" : "stale or missing"}</small><small>Capability ACK: {runner.capabilityAckState ?? "unknown"} · Dispatch readiness: {runner.readinessStatus ?? "not reported"} · Heartbeat: {runner.lastSeenAt ?? "not reported"}</small></VStack>)}
          </VStack>
        </LayoutPanel>} content={<LayoutContent isScrollable padding={4}>
          <VStack as="section" gap={4}>
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
            </VStack> : <VStack as="section" gap={2} padding={4}><h2>เลือก execution เพื่อดูสถานะ</h2><p>เมื่อมีงาน ระบบจะแสดงรายการแยกตาม Harness ที่บันทึกไว้จริง</p></VStack>}
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
  const createConversation = trpc.chat.createConversation.useMutation();
  const titleQuery = trpc.chat.getConversation.useQuery({ id: conversationId ?? 0 }, { enabled: Boolean(conversationId), staleTime: 30_000, retry: false });
  const title = titleQuery.data?.title ?? null;
  useEffect(() => {
    const legacyPanel = params.get("panel");
    const legacyBrowserOrAlert = params.has("browserSessionId") || params.has("dm") || params.has("alert");
    if ((!legacyPanel && !legacyBrowserOrAlert) || params.get("mode")) return;
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
  const newChat = async () => {
    const created = await createConversation.mutateAsync({ title: "New chat" });
    navigate("chat", created.id, null);
  };
  const setMode = (next: PresentationMode) => {
    setPresentationMode(next);
    window.localStorage.setItem("smartaihub-workspace-mode", next);
  };

  return (
    <AppShell height="fill" contentPadding={0} variant="surface" topNav={<TopNav label="SmartAIHub workspace navigation" heading={<TopNavHeading href="/chat">SmartAIHub</TopNavHeading>} startContent={<HStack gap={1} wrap="wrap"><TopNavItem label="Chat" href="/chat" icon={<MessageSquare aria-hidden="true" />} isSelected={mode === "chat"} /><TopNavItem label="Task Control" href={`/chat?mode=tasks${conversationId ? `&c=${conversationId}` : ""}`} icon={<Workflow aria-hidden="true" />} isSelected={mode === "tasks"} /><TopNavItem label="Mission Control" href={`/chat?mode=mission${conversationId ? `&c=${conversationId}` : ""}`} icon={<Radio aria-hidden="true" />} isSelected={mode === "mission"} /></HStack>} endContent={<HStack gap={2}><Button label="Simple" variant={presentationMode === "simple" ? "primary" : "secondary"} onClick={() => setMode("simple")} /><Button label="Developer" variant={presentationMode === "developer" ? "primary" : "secondary"} onClick={() => setMode("developer")} /><a href="/chat-legacy?panel=control-plane&view=full">Advanced Goal admission and legacy tools</a></HStack>} />}>
      {mode === "chat" ? <UnifiedChatSurface conversationId={conversationId} threadId={threadId} title={title} onNewChat={() => void newChat()} onSelectConversation={id => navigate("chat", id, null)} onSelectThread={(id, thread) => navigate("chat", id, thread)} /> : null}
      {mode === "tasks" ? <ProjectTaskControl onOpenConversation={(id, thread) => navigate("chat", id, thread)} /> : null}
      {mode === "mission" ? <MissionControl onOpenConversation={(id, thread) => navigate("chat", id, thread)} onSelectExecutions={selectExecutions} presentationMode={presentationMode} initialJobId={params.get("jobId")} initialJobIds={(params.get("jobIds") ?? "").split(",").filter(Boolean)} /> : null}
    </AppShell>
  );
}
