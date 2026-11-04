import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  Clock3,
  FolderKanban,
  GitPullRequest,
  ListChecks,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { GoalExecutionEvidencePanel } from "./GoalExecutionEvidencePanel";

type ProjectExecutionWorkspaceProps = {
  initialProjectId: string | null;
  initialJobId?: string | null;
  onSelectProject: (projectId: string) => void;
  onOpenConversation: (
    conversationId: number,
    threadId: string | null,
    jobId?: string
  ) => void;
  presentationMode: "simple" | "developer";
};

const ACTIVE = new Set([
  "running",
  "claimed",
  "leased",
  "preparing",
  "uploading",
  "publishing",
  "indexing",
]);
const WAITING = new Set([
  "pending",
  "queued",
  "waiting_external",
  "retry_scheduled",
]);
const TERMINAL = new Set([
  "completed",
  "succeeded",
  "failed",
  "failed_terminal",
  "expired",
  "cancelled",
  "canceled",
]);
const LIFECYCLE = ["PLAN", "IMPLEMENT", "REVIEW", "UAT", "BUGS", "COMPLETE"];

function label(value: string | null | undefined, fallback = "ยังไม่มีข้อมูล") {
  return value ? value.replaceAll("_", " ") : fallback;
}

function formatJobCreatedAt(value: string | Date | null | undefined): string {
  if (!value) return "ไม่พบเวลาสร้างงาน";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่พบเวลาสร้างงาน";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatWaitDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  if (totalMinutes < 1) return "น้อยกว่า 1 นาที";
  if (totalMinutes < 60) return `${totalMinutes} นาที`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

function goalTitle(goal: any): string {
  const value = [goal.goal, goal.title, goal.objective, goal.summary].find(
    candidate => typeof candidate === "string" && candidate.trim()
  );
  return value?.trim() ?? `เป้าหมาย ${String(goal.goalId).slice(0, 8)}`;
}

export function specSourceLabel(source: { specId: string; fileName: string }): string {
  return `${canonicalSpecIdLabel(source.specId)} · ${source.fileName || "spec.md"}`;
}

function canonicalSpecIdLabel(specId: string): string {
  const match = /^(?:SPEC-)?(\d+)(?:-|$)/i.exec(specId);
  return match ? `SPEC-${match[1]}` : specId;
}

export function requestedSpecDisplayLabel(requestedSpec: { specId: string; title: string }): string {
  const specLabel = /^\d+(?:-|$)/.test(requestedSpec.specId)
    ? `SPEC-${requestedSpec.specId.match(/^\d+/)?.[0]}`
    : requestedSpec.specId;
  return `${specLabel} · ${requestedSpec.title}`;
}

function hasUnrecordedRequestedSpec(goal: any): boolean {
  return !goal?.requestedSpec && Boolean(goal?.workPackageExternalId || goal?.specSources?.length || goal?.specId);
}

const CONTROL_PHASE: Record<string, string> = {
  DISCOVERY: "PLAN",
  PLANNING: "PLAN",
  PLAN_VERIFY: "PLAN",
  IMPLEMENT: "IMPLEMENT",
  BUILD: "IMPLEMENT",
  TEST: "IMPLEMENT",
  REVIEW: "REVIEW",
  VERIFY: "REVIEW",
  REGRESSION: "REVIEW",
  FINAL_VERIFY: "REVIEW",
  DEBUG_REPAIR: "BUGS",
  FIX_REVIEW_FINDINGS: "BUGS",
  COMPLETED: "COMPLETE",
};

function phaseForState(state: string): string {
  return CONTROL_PHASE[state.toUpperCase()] ?? "";
}

export function projectBinding(run: any): string | null {
  const metadata = run?.metadata;
  const workspace = metadata?.spec224Workspace;
  const projectId = run?.projectId ?? metadata?.projectId ?? workspace?.projectId;
  return typeof projectId === "string" && projectId.trim()
    ? projectId
    : null;
}

export function findGoalWorkerJob<T extends { id: string }>(
  goal: { workerJobId?: string | null } | null | undefined,
  jobs: T[],
): T | null {
  if (!goal?.workerJobId) return null;
  return jobs.find(job => job.id === goal.workerJobId) ?? null;
}

function nextActionLabel(action: any): string {
  if (!action) return "ยังไม่ระบุจากระบบควบคุม";
  return (
    [action.command, action.phase, action.reason].filter(Boolean).join(" · ") ||
    "ยังไม่ระบุจากระบบควบคุม"
  );
}

export function ProjectExecutionWorkspace({
  initialProjectId,
  initialJobId = null,
  onSelectProject,
  onOpenConversation,
  presentationMode,
}: ProjectExecutionWorkspaceProps) {
  const jobsQuery = trpc.workerJobs.observability.useQuery(
    {},
    {
      staleTime: 10_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const groupsQuery = trpc.workerJobs.taskGroups.useQuery(
    { limit: 50 },
    {
      staleTime: 10_000,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const goalsQuery = trpc.spec226DevelopmentControl.list.useQuery(
    { limit: 100 },
    {
      staleTime: 15_000,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const threadsQuery = trpc.chat.listRecentConversationThreads.useInfiniteQuery(
    { limit: 50 },
    {
      initialCursor: null,
      getNextPageParam: page => page.nextCursor ?? undefined,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const jobs = jobsQuery.data?.items ?? [];
  const taskGroups = groupsQuery.data?.groups ?? [];
  const goals = goalsQuery.data ?? [];
  const threads = (threadsQuery.data?.pages ?? []).flatMap(page => page.items);
  const projectNames = useMemo(() => {
    const result = new Map<string, string>();
    for (const thread of threads)
      if (thread.projectId && thread.projectTitle)
        result.set(thread.projectId, thread.projectTitle);
    for (const goal of goals) {
      const projectId = projectBinding(goal);
      if (projectId && typeof goal.projectName === "string" && goal.projectName.trim())
        result.set(projectId, goal.projectName.trim());
    }
    return result;
  }, [goals, threads]);
  const projects = useMemo(() => {
    const result = new Map<
      string,
      { name: string; jobs: typeof jobs; goals: typeof goals }
    >();
    const projectName = (id: string) => {
      const authorizedTitle = projectNames.get(id);
      if (authorizedTitle) return authorizedTitle;
      const namedJob = jobs.find(
        job =>
          job.projectId === id && typeof (job as any).projectName === "string"
      );
      if (namedJob) return (namedJob as any).projectName as string;
      return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)
        ? "Project name unavailable"
        : id;
    };
    const ensure = (id: string, name: string) =>
      result.get(id) ?? { name, jobs: [], goals: [] };
    for (const job of jobs) {
      const id = job.projectId ?? "unassigned";
      const group = ensure(
        id,
        id === "unassigned" ? "Unassigned / Legacy work" : projectName(id)
      );
      group.jobs.push(job);
      result.set(id, group);
    }
    for (const goal of goals) {
      const binding =
        jobs.find(job => job.id === goal.workerJobId)?.projectId ??
        projectBinding(goal);
      const id = binding ?? "unmapped-goals";
      const group = ensure(
        id,
        id === "unmapped-goals"
          ? "Goals without a Project link"
          : projectName(id)
      );
      group.goals.push(goal);
      result.set(id, group);
    }
    for (const group of result.values()) {
      group.jobs.sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));
      group.goals.sort((left, right) => {
        const leftCreatedAt = left.workerJobCreatedAt ?? jobs.find(job => job.id === left.workerJobId)?.createdAt ?? "";
        const rightCreatedAt = right.workerJobCreatedAt ?? jobs.find(job => job.id === right.workerJobId)?.createdAt ?? "";
        return Date.parse(rightCreatedAt) - Date.parse(leftCreatedAt);
      });
    }
    return [...result.entries()].sort((a, b) => {
      if (a[0] === "unassigned") return 1;
      if (b[0] === "unassigned") return -1;
      if (a[0] === "unmapped-goals") return 1;
      if (b[0] === "unmapped-goals") return -1;
      const latestCreatedAt = (project: { jobs: typeof jobs; goals: typeof goals }) =>
        Math.max(0,
          ...project.jobs.map(item => Date.parse(item.createdAt ?? "") || 0),
          ...project.goals.map(goal => Date.parse(goal.workerJobCreatedAt ?? jobs.find(job => job.id === goal.workerJobId)?.createdAt ?? "") || 0),
        );
      return latestCreatedAt(b[1]) - latestCreatedAt(a[1]);
    });
  }, [goals, jobs, projectNames]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  useEffect(() => {
    if (!initialJobId) return;
    const match = projects.find(([, project]) => project.goals.some(goal => goal.workerJobId === initialJobId || goal.goalId === initialJobId));
    const goal = match?.[1].goals.find(item => item.workerJobId === initialJobId || item.goalId === initialJobId);
    if (match && goal) {
      setSelectedProjectId(match[0]);
      setSelectedGoalId(goal.goalId);
    }
  }, [initialJobId, projects]);
  const selectedProject =
    projects.find(([id]) => id === selectedProjectId) ?? projects[0] ?? null;
  const selectedGoals = selectedProject?.[1].goals ?? [];
  const selectedGoal =
    selectedGoals.find(goal => goal.goalId === selectedGoalId) ?? null;
  const selectedJobs = selectedProject?.[1].jobs ?? [];
  const linkedGoalJobQuery = trpc.workerJobs.observability.useQuery(
    { jobId: selectedGoal?.workerJobId ?? undefined },
    {
      enabled: Boolean(selectedGoal?.workerJobId),
      staleTime: 5_000,
      refetchInterval: 10_000,
      refetchIntervalInBackground: false,
      retry: false,
    },
  );
  const selectedGoalJob = findGoalWorkerJob(
    selectedGoal,
    [...jobs, ...(linkedGoalJobQuery.data?.items ?? [])],
  );
  const selectedGoalWorkspaceQuery = trpc.spec226DevelopmentControl.getConversationWorkspace.useQuery({
    conversationId: selectedGoalJob?.conversationId ?? 0,
  }, {
    enabled: Boolean(selectedGoalJob?.conversationId && selectedGoal?.runId),
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const selectedDevelopmentRun = selectedGoal?.runId
    ? selectedGoalWorkspaceQuery.data?.developmentRuns.find(run => run.runId === selectedGoal.runId)
    : undefined;
  const selectedRunPolicyKnown = Boolean(selectedGoal?.runId && selectedGoalJob?.conversationId)
    && selectedGoalWorkspaceQuery.isSuccess
    && Boolean(selectedDevelopmentRun);
  const selectedRunPolicyUnavailable = Boolean(selectedGoal?.runId && selectedGoalJob?.conversationId)
    && selectedGoalWorkspaceQuery.isSuccess
    && !selectedDevelopmentRun;
  const selectedRunPolicyLoading = Boolean(selectedGoal?.runId && selectedGoalJob?.conversationId)
    && selectedGoalWorkspaceQuery.isLoading;
  const selectedRunPolicyError = Boolean(selectedGoal?.runId && selectedGoalJob?.conversationId)
    && selectedGoalWorkspaceQuery.isError;
  const selectedRunUsesLegacyPlatformBudget = Boolean(selectedDevelopmentRun)
    && selectedGoalWorkspaceQuery.data?.workspace.scope === "PLATFORM_ENGINEERING"
    && selectedDevelopmentRun?.economicsMode !== "provider_managed";
  const cancellableWorkerStatuses = [
    "pending", "queued", "retry_scheduled", "leased", "running", "waiting_external",
    "claimed", "preparing", "uploading", "publishing", "indexing",
  ];
  const selectedLegacyWorkerCanRequestCancellation = Boolean(selectedDevelopmentRun?.jobId)
    && selectedRunUsesLegacyPlatformBudget
    && !selectedDevelopmentRun?.workerJobCanCancelAsUnclaimed
    && !["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(selectedDevelopmentRun?.state ?? "")
    && selectedDevelopmentRun?.goalApproval?.status !== "pending"
    && cancellableWorkerStatuses.includes(selectedDevelopmentRun?.workerJobStatus ?? "");
  const selectedWorkerQueueWaitMs = selectedDevelopmentRun
    && selectedDevelopmentRun.workerJobIsInitial === false
    && selectedDevelopmentRun.workerJobStatus === "queued"
    && selectedDevelopmentRun.workerJobCanCancelAsUnclaimed
    && !selectedDevelopmentRun.workerJobStartedAt
    && selectedDevelopmentRun.workerJobCreatedAt
      ? Math.max(0, Date.now() - Date.parse(selectedDevelopmentRun.workerJobCreatedAt))
      : null;
  const selectedWorkerAdmissionWaitMs = selectedDevelopmentRun
    && selectedDevelopmentRun.workerJobIsInitial === false
    && selectedDevelopmentRun.workerJobStatus === "pending"
    && selectedDevelopmentRun.workerJobCanCancelAsUnclaimed
    && selectedDevelopmentRun.goalApproval?.status !== "pending"
    && selectedDevelopmentRun.workerJobCreatedAt
      ? Math.max(0, Date.now() - Date.parse(selectedDevelopmentRun.workerJobCreatedAt))
      : null;
  const selectedInitialWorkerCreationSkewMs = selectedDevelopmentRun?.createdAt && selectedDevelopmentRun.initialWorkerJobCreatedAt
    ? Math.abs(Date.parse(selectedDevelopmentRun.createdAt) - Date.parse(selectedDevelopmentRun.initialWorkerJobCreatedAt))
    : null;
  const selectedInitialWorkerQueueWaitMs = selectedDevelopmentRun?.initialWorkerJobStatus === "queued"
    && !selectedDevelopmentRun.initialWorkerJobStartedAt
    && selectedDevelopmentRun.initialWorkerJobCreatedAt
    ? Math.max(0, Date.now() - Date.parse(selectedDevelopmentRun.initialWorkerJobCreatedAt))
    : null;
  const selectedInitialWorkerAdmissionWaitMs = selectedDevelopmentRun?.initialWorkerJobStatus === "pending"
    && selectedDevelopmentRun.goalApproval?.status !== "pending"
    && !selectedDevelopmentRun.initialWorkerJobStartedAt
    && selectedDevelopmentRun.initialWorkerJobCreatedAt
    ? Math.max(0, Date.now() - Date.parse(selectedDevelopmentRun.initialWorkerJobCreatedAt))
    : null;
  const utils = trpc.useUtils();
  const cancelUnclaimedLegacyRunMutation = trpc.spec226DevelopmentControl.cancelUnclaimedLegacyPlatformRun.useMutation();
  const cancelLegacyWorkerJobMutation = trpc.workerJobs.cancelQueued.useMutation();
  const resumeRunMutation = trpc.spec226DevelopmentControl.resumeWorkspaceRun.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.workerJobs.observability.invalidate(),
        utils.spec226DevelopmentControl.list.invalidate(),
      ]);
      if (result.dispatchStatus === "ENQUEUED") {
        toast.success("ส่ง Run เดิมเข้าคิวแล้ว");
      } else if (result.dispatchStatus === "PENDING_AUTHORIZATION") {
        toast.info("Run เดิมยังรอการอนุมัติสิทธิ์ก่อนเริ่มงาน");
      } else {
        const authorization = result.authorization && typeof result.authorization === "object"
          ? result.authorization as Record<string, unknown>
          : {};
        toast.error(typeof authorization.ownerAction === "string"
          ? authorization.ownerAction
          : "ยังส่ง Run เดิมต่อไม่ได้ โปรดตรวจสถานะใน Mission Control");
      }
    },
    onError: () => toast.error("ส่ง Run เดิมต่อไม่สำเร็จ โปรดลองตรวจสถานะใน Mission Control"),
  });

  const activeCount = selectedJobs.filter(job => ACTIVE.has(job.status)).length;
  const waitingCount = selectedJobs.filter(
    job => WAITING.has(job.status) || job.operatorAttention.required
  ).length;
  const completedCount = selectedJobs.filter(job =>
    TERMINAL.has(job.status)
  ).length;
  const jobToGroup = useMemo(() => {
    const result = new Map<string, (typeof taskGroups)[number]>();
    for (const group of taskGroups)
      for (const job of group.jobs) result.set(job.id, group);
    return result;
  }, [taskGroups]);
  const recordedStages = new Set(
    selectedJobs
      .map(job => String(job.stage ?? "").toUpperCase())
      .filter(Boolean)
  );
  const goalStage = selectedGoal ? phaseForState(selectedGoal.state) : "";

  useEffect(() => {
    if (initialProjectId) setSelectedProjectId(initialProjectId);
  }, [initialProjectId]);

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setSelectedGoalId(null);
    onSelectProject(id);
  };

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-muted/20"
      aria-label="Task Control project workspace"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-4">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {presentationMode === "simple"
              ? "PROJECT PROGRESS"
              : "PROJECT EXECUTION"}
          </p>
          <h1 className="text-2xl font-semibold">Task Control</h1>
          <p className="text-sm text-muted-foreground">
            {presentationMode === "simple"
              ? "ดูว่าแต่ละ Project กำลังทำอะไร เสร็จถึงไหน และต้องทำอะไรต่อ"
              : "ดูสถานะ execution, lifecycle evidence, worker binding และข้อมูลตรวจสอบของ Project"}
          </p>
        </section>
        <Button asChild variant="default">
          <Link href="/chat">
            <MessageSquareText className="mr-2 h-4 w-4" />
            เริ่มจาก Chat
          </Link>
        </Button>
      </header>
      {jobsQuery.error || groupsQuery.error || goalsQuery.error ? (
        <p
          className="border-b bg-destructive/10 px-5 py-2 text-sm text-destructive"
          role="alert"
        >
          โหลดข้อมูลบางส่วนไม่ได้ ข้อมูลที่หายจะไม่ถูกแทนด้วยสถานะสมมติ
        </p>
      ) : null}
      {jobsQuery.isLoading || goalsQuery.isLoading ? (
        <p className="px-5 py-3 text-sm text-muted-foreground" role="status">
          กำลังโหลด Project และเป้าหมายที่ได้รับอนุญาต…
        </p>
      ) : null}
      <section className="min-h-0 flex-1">
        <section
          className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_20rem]"
          aria-label="Project and Goal details"
        >
          <nav
            className="min-h-0 overflow-auto border-b bg-background p-3 lg:border-b-0 lg:border-r"
            aria-label="Projects and goals"
          >
            <h2 className="mb-2 px-2 text-sm font-semibold">Projects</h2>
            {projects.map(([id, project]) => (
              <Button
                key={id}
                variant="ghost"
                aria-pressed={selectedProject?.[0] === id}
                className={`mb-1 h-auto w-full justify-start whitespace-normal py-2 text-left text-foreground ${selectedProject?.[0] === id ? "border border-primary/30 bg-primary/10" : "hover:bg-accent"}`}
                onClick={() => selectProject(id)}
              >
                <FolderKanban className="mr-2 h-4 w-4 shrink-0" />
                <strong className="min-w-0 flex-1 truncate font-normal">
                  {project.name}
                </strong>
                <Badge variant="outline">
                  {project.goals.length + project.jobs.length}
                </Badge>
              </Button>
            ))}
            {!projects.length &&
            !jobsQuery.isLoading &&
            !goalsQuery.isLoading ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                ยังไม่มี Project หรือ Goal ที่เชื่อมโยง
              </p>
            ) : null}
            {selectedProject ? (
              <>
                <Separator className="my-3" />
                <h2 className="mb-2 px-2 text-sm font-semibold">Goals</h2>
                {selectedGoals.map(goal => (
                  <Button
                    key={goal.goalId}
                    variant="ghost"
                    aria-label={goalTitle(goal)}
                    aria-pressed={selectedGoal?.goalId === goal.goalId}
                    className={`mb-1 h-auto w-full justify-start whitespace-normal py-2 text-left text-foreground ${selectedGoal?.goalId === goal.goalId ? "border border-primary/30 bg-primary/10" : "hover:bg-accent"}`}
                    onClick={() => setSelectedGoalId(goal.goalId)}
                  >
                    <GitPullRequest className="mr-2 h-4 w-4 shrink-0" />
                    <span className="line-clamp-2 min-w-0 flex-1 text-left text-foreground">
                      {goalTitle(goal)}
                    </span>
                  </Button>
                ))}
                {!selectedGoals.length ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    ยังไม่มี Goal ที่มี Project binding ตรงกัน
                  </p>
                ) : null}
              </>
            ) : null}
          </nav>

          <section className="min-h-0 overflow-auto p-4 lg:p-6">
            {selectedProject ? (
              <>
                <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      PROJECT
                    </p>
                    <h2 className="text-xl font-semibold">
                      {selectedProject[1].name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedProject[1].goals.length} canonical Goals ·{" "}
                      {selectedJobs.length} linked work records
                    </p>
                  </section>
                  <section
                    className="flex gap-2"
                    aria-label="Project work summary"
                  >
                    <Badge variant="secondary">{activeCount} กำลังทำ</Badge>
                    <Badge variant="outline">{waitingCount} รอ/ติดขัด</Badge>
                    <Badge variant="outline">{completedCount} สิ้นสุด</Badge>
                  </section>
                </header>
                {selectedProject[0] === "unassigned" ||
                selectedProject[0] === "unmapped-goals" ? (
                  <p className="mb-4 rounded-md border border-accent bg-accent/50 p-3 text-sm text-accent-foreground">
                    รายการนี้ยังไม่มีหลักฐานยืนยันการผูกกับ Project จึงแยกไว้
                    ไม่รวมเข้า Goal ของ Project อื่น
                  </p>
                ) : null}

                {selectedGoal ? (
                  <Card className="mb-5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        เป้าหมายที่เลือก
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="font-medium">{goalTitle(selectedGoal)}</p>
                      <section className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                        <p>
                          <span className="text-muted-foreground">Goal</span>{" "}
                          <span className="font-mono">#{String(selectedGoal.goalId).slice(0, 8)}</span>
                          {presentationMode === "developer" ? (
                            <span className="ml-2 break-all font-mono text-xs text-muted-foreground">{selectedGoal.goalId}</span>
                          ) : null}
                        </p>
                        {selectedGoal.requestedSpec ? (
                          <p><span className="text-muted-foreground">คำสั่งจาก SPEC:</span> {requestedSpecDisplayLabel(selectedGoal.requestedSpec)}</p>
                        ) : hasUnrecordedRequestedSpec(selectedGoal) ? (
                          <p className="text-muted-foreground">ไม่พบ SPEC ของคำสั่งในประวัติเดิม</p>
                        ) : null}
                        {selectedGoal.specSources?.length ? (
                          <p>
                            <span className="text-muted-foreground">แหล่ง Requirement ของ WorkPackage:</span>{" "}
                            {selectedGoal.specSources.map((source: { specId: string; fileName: string }, index: number) => (
                              <span key={`${source.specId}:${source.fileName}`}>
                                {index ? ", " : ""}{specSourceLabel(source)}
                              </span>
                            ))}
                          </p>
                        ) : selectedGoal.specId ? (
                          <p><span className="text-muted-foreground">SPEC ID ที่ Run บันทึกไว้:</span> {selectedGoal.specId}</p>
                        ) : (
                          <p className="text-muted-foreground">Run นี้ไม่มีข้อมูล SPEC ที่บันทึกไว้</p>
                        )}
                        {selectedGoal.workPackagePrerequisites?.length ? (
                          <p><span className="text-muted-foreground">WorkPackage ที่ต้องทำก่อน:</span> {selectedGoal.workPackagePrerequisites.map((item: { externalId: string; specIds: string[] }) => `${item.externalId}${item.specIds.length ? ` (${item.specIds.map(canonicalSpecIdLabel).join(", ")})` : ""}`).join(" → ")}</p>
                        ) : selectedGoal.workPackagePrerequisites ? (
                          <p><span className="text-muted-foreground">WorkPackage ที่ต้องทำก่อน:</span> ไม่มี dependency ที่ประกาศไว้</p>
                        ) : null}
                      </section>
                      <section
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                        aria-label="Goal lifecycle evidence"
                      >
                        {LIFECYCLE.map(stage => {
                          const observed =
                            goalStage === stage || recordedStages.has(stage);
                          const current = goalStage === stage;
                          return (
                            <section
                              key={stage}
                              className={`rounded-md border p-2 ${current ? "border-primary bg-primary/10" : observed ? "border-secondary bg-secondary/50" : "border-dashed bg-muted/30"}`}
                            >
                              <p className="text-sm font-medium">{stage}</p>
                              <p className="text-xs text-muted-foreground">
                                {current
                                  ? "ขั้นตอนปัจจุบัน"
                                  : observed
                                    ? "มีหลักฐานบันทึก"
                                    : "ยังไม่มีหลักฐาน"}
                              </p>
                            </section>
                          );
                        })}
                      </section>
                      <p className="text-sm text-muted-foreground">
                        สถานะ Goal: {label(selectedGoal.state)}
                        {presentationMode === "developer" && selectedGoal.runId
                          ? ` · Run ${selectedGoal.runId}`
                          : null}
                      </p>
                      {selectedGoalJob ? (
                        <section className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2">
                          <p>
                            <span className="text-muted-foreground">
                              Harness:
                            </span>{" "}
                            {label(selectedGoalJob.executionIdentity.harness)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Agent:
                            </span>{" "}
                            {label(selectedGoalJob.executionIdentity.agent)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Run status:
                            </span>{" "}
                            {label(selectedGoalJob.status)}
                          </p>
                          <p>
                            <span className="text-muted-foreground">
                              Current phase:
                            </span>{" "}
                            {label(selectedGoalJob.stage, "ยังไม่รายงาน")}
                          </p>
                        </section>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {selectedGoal.workerJobId
                            ? "Goal นี้ผูกกับ Worker Job แล้ว แต่ยังโหลดรายละเอียดงานไม่พบในรายการปัจจุบัน"
                          : "Goal นี้ยังไม่มี Worker Job ที่เชื่อมอยู่"}
                        </p>
                      )}
                      {selectedGoalJob ? (
                        <GoalExecutionEvidencePanel
                          job={{ id: selectedGoalJob.id, status: selectedGoalJob.status }}
                          approvalStatus={selectedDevelopmentRun?.goalApproval?.status}
                          admissionStatus={selectedDevelopmentRun?.executionAdmissionStatus}
                          admissionErrorCode={selectedDevelopmentRun?.executionAdmissionErrorCode}
                          presentationMode={presentationMode}
                        />
                      ) : null}
                      <p className="text-sm">
                        ขั้นตอนถัดไป:{" "}
                        {nextActionLabel(selectedGoal.nextSafeAction)}
                      </p>
                      {selectedGoalJob?.createdAt || selectedGoal.workerJobCreatedAt ? (
                        <p className="text-sm text-muted-foreground">
                          Worker Job ของ phase ปัจจุบันสร้างเมื่อ: {formatJobCreatedAt(selectedGoalJob?.createdAt ?? selectedGoal.workerJobCreatedAt)} (เวลาไทย)
                        </p>
                      ) : selectedGoal.workerJobId ? (
                        <p className="text-sm text-muted-foreground">Worker Job สร้างเมื่อ: ไม่พบเวลาสร้างงาน</p>
                      ) : null}
                      {selectedDevelopmentRun?.createdAt ? (
                        <p className="text-sm text-muted-foreground">Run นี้สร้างเมื่อ: {formatJobCreatedAt(selectedDevelopmentRun.createdAt)} (เวลาไทย)</p>
                      ) : null}
                      {selectedDevelopmentRun?.initialWorkerJobCreatedAt ? (
                        <p className="text-sm text-muted-foreground">
                          Worker Job แรกของ Run นี้สร้างเมื่อ: {formatJobCreatedAt(selectedDevelopmentRun.initialWorkerJobCreatedAt)}
                          {selectedDevelopmentRun.initialWorkerJobStartedAt
                            ? ` · เริ่มทำงานเมื่อ ${formatJobCreatedAt(selectedDevelopmentRun.initialWorkerJobStartedAt)}`
                            : " · ยังไม่มีเวลาเริ่มทำงาน"} (เวลาไทย)
                        </p>
                      ) : null}
                      {selectedDevelopmentRun?.workerJobStartedAt ? (
                        <p className="text-sm text-muted-foreground">Worker Job นี้เริ่มทำงานเมื่อ: {formatJobCreatedAt(selectedDevelopmentRun.workerJobStartedAt)} (เวลาไทย)</p>
                      ) : null}
                      {selectedDevelopmentRun?.workerJobStatus ? (
                        <p className="text-sm text-muted-foreground">สถานะ Worker Job ของ phase ปัจจุบัน: {label(selectedDevelopmentRun.workerJobStatus)}</p>
                      ) : null}
                      {selectedDevelopmentRun?.workerJobIsInitial === false && selectedWorkerQueueWaitMs !== null && Number.isFinite(selectedWorkerQueueWaitMs) && selectedWorkerQueueWaitMs > 30_000 ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          Worker Job phase ปัจจุบันอยู่ในคิวมาแล้ว {formatWaitDuration(selectedWorkerQueueWaitMs)} โดยยังไม่มีเวลาเริ่มทำงาน นี่คือเวลารอ Worker ของ Job นี้
                        </p>
                      ) : null}
                      {selectedDevelopmentRun?.workerJobIsInitial === false && selectedWorkerAdmissionWaitMs !== null && Number.isFinite(selectedWorkerAdmissionWaitMs) && selectedWorkerAdmissionWaitMs > 30_000 ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          Worker Job ยัง pending มาแล้ว {formatWaitDuration(selectedWorkerAdmissionWaitMs)} และยังไม่เข้า queue; เวลานี้เป็นช่วงก่อน dispatch ไม่ใช่เวลาที่ Runner รับคิว
                        </p>
                      ) : null}
                      {selectedInitialWorkerQueueWaitMs !== null && Number.isFinite(selectedInitialWorkerQueueWaitMs) && selectedInitialWorkerQueueWaitMs > 30_000 ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          Worker Job แรกของ Run อยู่ในคิวมาแล้ว {formatWaitDuration(selectedInitialWorkerQueueWaitMs)} โดยยังไม่เริ่มทำงาน
                        </p>
                      ) : null}
                      {selectedInitialWorkerAdmissionWaitMs !== null && Number.isFinite(selectedInitialWorkerAdmissionWaitMs) && selectedInitialWorkerAdmissionWaitMs > 30_000 ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          Worker Job แรกยัง pending มาแล้ว {formatWaitDuration(selectedInitialWorkerAdmissionWaitMs)} และยังไม่เข้า queue; เวลานี้คือช่วงก่อน Worker รับคิว
                        </p>
                      ) : null}
                      {selectedInitialWorkerCreationSkewMs !== null && Number.isFinite(selectedInitialWorkerCreationSkewMs) && selectedInitialWorkerCreationSkewMs > 30_000 ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          เวลา Run กับ Worker Job แรกต่างกันเกิน 30 วินาที; Job ของ phase ปัจจุบันอาจถูกสร้างทีหลังตามปกติ จึงต้องใช้เวลา Job แรกตรวจการส่งเข้าคิว
                        </p>
                      ) : null}
                      {selectedRunPolicyUnavailable ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          อ่านข้อมูล Run ที่ตรงกับรายการนี้จาก workspace ไม่สำเร็จ จึงยังยืนยันเงื่อนไขทำงานต่อไม่ได้ โปรดเปิด Chat session เพื่อตรวจรายการเดียวกัน
                        </p>
                      ) : null}
                      {selectedRunPolicyLoading ? (
                        <p className="text-sm text-muted-foreground" role="status">กำลังตรวจ Run และ Worker Job ที่ผูกกัน ก่อนแสดงคำสั่งทำงานต่อ…</p>
                      ) : null}
                      {selectedRunPolicyError ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
                          ตรวจ policy ของ Run ไม่สำเร็จ จึงซ่อนปุ่มทำงานต่อไว้ก่อน โปรดลองโหลดรายการใหม่
                        </p>
                      ) : null}
                      {selectedRunUsesLegacyPlatformBudget && selectedGoal.runId && selectedGoalJob?.conversationId ? (
                        <section className="mt-2 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
                          <p>Run นี้ยัง resume ตรง ๆ ไม่ได้ เพราะผูก tenant budget รุ่นเดิม; ปุ่มทำงานเดิมต่อจะไม่ส่งงานเข้าคิว</p>
                          {selectedDevelopmentRun?.state === "COMPLETED" ? (
                            <p>Run นี้เสร็จสมบูรณ์แล้ว ไม่มีงานเดิมให้ทำต่อ</p>
                          ) : selectedDevelopmentRun?.goalApproval?.status === "pending" ? (
                            <p>รอการอนุมัติเดิมก่อน เพื่อไม่สร้างงานซ้ำ</p>
                          ) : selectedDevelopmentRun?.workerJobCanCancelAsUnclaimed && selectedDevelopmentRun.state !== "COMPLETED" ? (
                            <Button
                              type="button"
                              variant="default"
                              disabled={cancelUnclaimedLegacyRunMutation.isPending}
                              onClick={async () => {
                                try {
                                  const result = await cancelUnclaimedLegacyRunMutation.mutateAsync({
                                    conversationId: selectedGoalJob.conversationId!,
                                    runId: selectedGoal.runId!,
                                  });
                                  if (!result.canceled) {
                                    toast.error(result.ownerAction ?? "คิวงานเปลี่ยนสถานะแล้ว โปรดตรวจสอบก่อนเริ่มใหม่");
                                    await selectedGoalWorkspaceQuery.refetch();
                                    return;
                                  }
                                  toast.success("ยกเลิกคิวที่ยังไม่มี Worker แล้ว เปิด SPEC workspace เพื่อเริ่ม Run ใหม่แบบ Provider quota");
                                  window.location.assign(`/chat?mode=tasks&c=${selectedGoalJob.conversationId}&newGoal=1`);
                                } catch {
                                  toast.error("ยกเลิกคิวเก่าไม่สำเร็จ โปรดรีเฟรช Task Control แล้วตรวจ Worker Jobs");
                                }
                              }}
                            >
                              {cancelUnclaimedLegacyRunMutation.isPending ? "กำลังยกเลิกคิวเก่า…" : "ยกเลิกคิวที่ยังไม่มี Worker แล้วเปิด SPEC เพื่อเริ่มใหม่"}
                            </Button>
                          ) : selectedLegacyWorkerCanRequestCancellation && selectedDevelopmentRun?.jobId ? (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={cancelLegacyWorkerJobMutation.isPending}
                              onClick={async () => {
                                try {
                                  await cancelLegacyWorkerJobMutation.mutateAsync({ jobId: selectedDevelopmentRun.jobId! });
                                  toast.success("ส่งคำสั่งหยุด Worker Job เดิมแล้ว; รอให้สถานะปิดก่อนเริ่ม Provider Run ใหม่");
                                  await Promise.all([
                                    selectedGoalWorkspaceQuery.refetch(),
                                    linkedGoalJobQuery.refetch(),
                                    utils.workerJobs.observability.invalidate(),
                                  ]);
                                } catch (error) {
                                  toast.error(error instanceof Error ? error.message : "ส่งคำสั่งหยุด Worker Job เดิมไม่สำเร็จ");
                                  await selectedGoalWorkspaceQuery.refetch();
                                }
                              }}
                            >
                              {cancelLegacyWorkerJobMutation.isPending ? "กำลังส่งคำสั่งหยุด Worker…" : "ส่งคำสั่งหยุด Worker Job เดิม"}
                            </Button>
                          ) : TERMINAL.has(selectedGoalJob.status) ? (
                            <a className="inline-flex text-primary underline" href={`/chat?mode=tasks&c=${selectedGoalJob.conversationId}&newGoal=1`}>
                              เปิด SPEC workspace เพื่อเริ่ม Run ใหม่แบบ Provider quota
                            </a>
                          ) : (
                            <p>Worker รับหรือเริ่มงานแล้ว จึงยังแทนที่คิวโดยอัตโนมัติไม่ได้ ตรวจสถานะหรือยกเลิกจาก <a className="underline" href="/worker-jobs">Worker Jobs</a> ก่อน</p>
                          )}
                        </section>
                      ) : null}
                      {selectedGoal.workerJobId && selectedGoal.runId && selectedGoalJob?.conversationId && selectedRunPolicyKnown && !selectedRunUsesLegacyPlatformBudget && !TERMINAL.has(selectedGoalJob.status) ? (
                        <Button
                          type="button"
                          variant="default"
                          disabled={resumeRunMutation.isPending}
                          onClick={() => resumeRunMutation.mutate({
                            conversationId: selectedGoalJob.conversationId!,
                            runId: selectedGoal.runId!,
                          })}
                        >
                          {resumeRunMutation.isPending ? "กำลังตรวจสิทธิ์และส่ง Run เดิม…" : "ทำงานเดิมต่อ"}
                        </Button>
                      ) : null}
                      {presentationMode === "developer" ? (
                        <section
                          className="rounded-md border bg-muted/30 p-3 text-sm"
                          aria-label="Developer execution details"
                        >
                          <h3 className="mb-2 font-semibold">
                            ข้อมูลตรวจสอบสำหรับนักพัฒนา
                          </h3>
                          <dl className="grid gap-2 sm:grid-cols-2">
                            <section>
                              <dt className="text-muted-foreground">Goal ID</dt>
                              <dd className="break-all">
                                {selectedGoal.goalId}
                              </dd>
                            </section>
                            <section>
                              <dt className="text-muted-foreground">
                                Worker Job ID
                              </dt>
                              <dd className="break-all">
                                {selectedGoal.workerJobId ?? "ยังไม่ผูก"}
                              </dd>
                            </section>
                            <section>
                              <dt className="text-muted-foreground">Run ID</dt>
                              <dd className="break-all">
                                {selectedGoal.runId ?? "ยังไม่มี"}
                              </dd>
                            </section>
                            {selectedGoalJob ? (
                              <>
                                <section>
                                  <dt className="text-muted-foreground">Job status reason</dt>
                                  <dd className="break-all">{selectedGoalJob.statusReason ?? "ไม่ระบุ"}</dd>
                                </section>
                                <section>
                                  <dt className="text-muted-foreground">Job error code</dt>
                                  <dd className="break-all">{selectedGoalJob.errorCode ?? "ไม่มี"}</dd>
                                </section>
                              </>
                            ) : null}
                            <section>
                              <dt className="text-muted-foreground">
                                Evidence refs
                              </dt>
                              <dd>{selectedGoal.evidenceRefs?.length ?? 0}</dd>
                            </section>
                          </dl>
                        </section>
                      ) : null}
                      {selectedGoal.workerJobId ? (
                        <Link
                          className="inline-flex items-center text-sm text-primary underline"
                          href={`/chat?mode=mission&jobId=${encodeURIComponent(selectedGoal.workerJobId)}`}
                        >
                          เปิด Run ใน Mission Control{" "}
                          <ArrowUpRight className="ml-1 h-4 w-4" />
                        </Link>
                      ) : null}
                      {selectedGoal.evidenceRefs?.length ? (
                        <section>
                          <h3 className="mb-1 text-sm font-semibold">
                            Evidence
                          </h3>
                          <ul className="list-inside list-disc text-sm">
                            {selectedGoal.evidenceRefs
                              .slice(0, 6)
                              .map((ref: string) => (
                                <li key={ref} className="break-all">
                                  {presentationMode === "developer"
                                    ? ref
                                    : ref.split(/[/:]/).at(-1)}
                                </li>
                              ))}
                          </ul>
                        </section>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          ยังไม่มี evidence อ้างอิงใน Goal นี้
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                <section className="mb-5" aria-label="Project lifecycle">
                  <header className="mb-2 flex items-end justify-between">
                    <h3 className="font-semibold">Lifecycle evidence</h3>
                    <p className="text-xs text-muted-foreground">
                      ไม่พบหลักฐานจะคงสถานะ “ยังไม่มีข้อมูล”
                    </p>
                  </header>
                  <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                    {LIFECYCLE.map(stage => {
                      const stageJobs = selectedJobs.filter(
                        job =>
                          phaseForState(String(job.stage ?? "")) === stage ||
                          String(job.stage ?? "").toUpperCase() === stage
                      );
                      const stageGoalCount = selectedGoals.filter(
                        goal => phaseForState(goal.state) === stage
                      ).length;
                      return (
                        <li
                          key={stage}
                          className="rounded-md border bg-background p-3"
                        >
                          <p className="text-sm font-semibold">{stage}</p>
                          <p className="text-xs text-muted-foreground">
                            {stageJobs.length + stageGoalCount
                              ? `${stageJobs.length + stageGoalCount} รายการมีหลักฐาน`
                              : "ยังไม่มีหลักฐาน"}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                <section
                  className="space-y-2"
                  aria-label="Project work records"
                >
                  <header className="flex items-center justify-between">
                    <h3 className="font-semibold">Goals and linked work</h3>
                    <p className="text-xs text-muted-foreground">
                      งานเก่าแยกจาก canonical Goals
                    </p>
                  </header>
                  {selectedGoals.map(goal => (
                    <Card
                      key={`goal-${goal.goalId}`}
                      className="transition-colors hover:border-primary/50"
                    >
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <section className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-medium">
                            {goalTitle(goal)}
                          </p>
                          {goal.requestedSpec ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium">คำสั่งจาก SPEC:</span>{" "}
                              {requestedSpecDisplayLabel(goal.requestedSpec)}
                            </p>
                          ) : hasUnrecordedRequestedSpec(goal) ? (
                            <p className="mt-1 text-xs text-muted-foreground">ไม่พบ SPEC ของคำสั่งในประวัติเดิม</p>
                          ) : null}
                          {goal.specSources?.length ? (
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              <span className="font-medium">แหล่ง Requirement ของ WorkPackage:</span>{" "}
                              {goal.specSources
                                .map((source: { specId: string; fileName: string }) =>
                                  specSourceLabel(source)
                                )
                                .join(", ")}
                            </p>
                          ) : goal.specId ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              <span className="font-medium">SPEC ID ที่ Run บันทึกไว้:</span>{" "}
                              {goal.specId}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              ไม่มีข้อมูล SPEC ต้นทาง
                            </p>
                          )}
                          {goal.workPackagePrerequisites?.length ? (
                            <p className="mt-1 break-all text-xs text-muted-foreground">
                              <span className="font-medium">ต้องทำ WorkPackage ก่อน:</span>{" "}
                              {goal.workPackagePrerequisites.map((item: { externalId: string; specIds: string[] }) => `${item.externalId}${item.specIds.length ? ` (${item.specIds.map(canonicalSpecIdLabel).join(", ")})` : ""}`).join(" → ")}
                            </p>
                          ) : goal.workPackagePrerequisites ? (
                            <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">ต้องทำ WorkPackage ก่อน:</span> ไม่มี dependency ที่ประกาศไว้</p>
                          ) : null}
                          <p className="mt-1 text-sm text-muted-foreground">
                            Goal · {label(goal.state)} ·{" "}
                            {nextActionLabel(goal.nextSafeAction)}
                          </p>
                          {findGoalWorkerJob(goal, jobs)?.createdAt || goal.workerJobCreatedAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Worker Job ที่ผูกกับ Run นี้สร้างเมื่อ: {formatJobCreatedAt(findGoalWorkerJob(goal, jobs)?.createdAt ?? goal.workerJobCreatedAt)} (เวลาไทย)
                            </p>
                          ) : null}
                        </section>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedGoalId(goal.goalId)}
                        >
                          ดูรายละเอียด
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {selectedJobs.map(job => {
                    const group = jobToGroup.get(job.id);
                    return (
                      <Card key={job.id}>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <section className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {job.threadTitle ??
                                job.conversationTitle ??
                                job.contextLabel ??
                                "Work item without a title"}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {label(job.stage, "ขั้นตอนไม่ได้รายงาน")} ·{" "}
                              {label(
                                job.executionIdentity.harness,
                                "Harness ไม่ได้รายงาน"
                              )}{" "}
                              ·{" "}
                              {label(
                                job.executionIdentity.agent,
                                "Agent ไม่ได้รายงาน"
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              สถานะ {label(job.status)} · {group
                                ? `${group.completedSteps}/${group.totalSteps} งานย่อยเสร็จ · ${group.progressPercent == null ? "ความคืบหน้าไม่ระบุ" : `${group.progressPercent}%`}`
                                : "ไม่มี Task group ที่ยืนยันได้"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              สร้างเมื่อ: {formatJobCreatedAt(job.createdAt)} (เวลาไทย)
                            </p>
                            {job.operatorAttention.required ? (
                              <p className="mt-1 flex items-center gap-1 text-sm text-accent-foreground">
                                <CircleAlert className="h-4 w-4" />
                                {job.operatorAttention.reason ??
                                  "ต้องการการตัดสินใจ"}
                              </p>
                            ) : null}
                          </section>
                          <section className="flex flex-wrap gap-2">
                            <Badge
                              variant={
                                ACTIVE.has(job.status) ? "default" : "secondary"
                              }
                            >
                              {label(job.status)}
                            </Badge>
                            <Link
                              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                              href={`/chat?mode=mission&jobId=${encodeURIComponent(job.id)}`}
                            >
                              ดู Run
                            </Link>
                            {job.conversationId ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  onOpenConversation(
                                    job.conversationId!,
                                    job.threadId,
                                    job.id
                                  )
                                }
                              >
                                เปิด Session
                              </Button>
                            ) : null}
                          </section>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {!selectedGoals.length && !selectedJobs.length ? (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Project นี้ยังไม่มี Goal หรือ work record
                      ที่เชื่อมโยงจากข้อมูลปัจจุบัน
                    </p>
                  ) : null}
                </section>
              </>
            ) : (
              <section className="grid min-h-[50vh] place-items-center">
                <p className="text-muted-foreground">
                  เลือก Project เพื่อดูเป้าหมายและงานที่ผูกอยู่
                </p>
              </section>
            )}
          </section>

          <aside
            className="hidden min-h-0 overflow-auto border-l bg-background p-4 lg:block"
            aria-label="Project inspector"
          >
            {selectedGoal ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  GOAL INSPECTOR
                </p>
                <h2 className="mt-1 font-semibold">
                  {goalTitle(selectedGoal)}
                </h2>
                <Separator className="my-3" />
                <dl className="space-y-3 text-sm">
                  <section>
                    <dt className="text-muted-foreground">สถานะ</dt>
                    <dd>{label(selectedGoal.state)}</dd>
                  </section>
                  <section>
                    <dt className="text-muted-foreground">ขั้นตอนถัดไป</dt>
                    <dd>{nextActionLabel(selectedGoal.nextSafeAction)}</dd>
                  </section>
                  <section>
                    <dt className="text-muted-foreground">Work Package</dt>
                    <dd>
                      {selectedGoal.workPackageExternalId ?? "ยังไม่มีข้อมูล"}
                    </dd>
                  </section>
                  {selectedGoal.requestedSpec ? (
                    <section>
                      <dt className="text-muted-foreground">คำสั่งจาก SPEC</dt>
                      <dd>{requestedSpecDisplayLabel(selectedGoal.requestedSpec)}</dd>
                    </section>
                  ) : hasUnrecordedRequestedSpec(selectedGoal) ? (
                    <section>
                      <dt className="text-muted-foreground">คำสั่งจาก SPEC</dt>
                      <dd>ไม่พบ SPEC ของคำสั่งในประวัติเดิม</dd>
                    </section>
                  ) : null}
                  {selectedGoal.specSources?.length ? (
                    <section>
                      <dt className="text-muted-foreground">แหล่ง Requirement ของ WorkPackage</dt>
                      <dd className="break-all">
                        {selectedGoal.specSources.map((source: { specId: string; fileName: string }) => specSourceLabel(source)).join(", ")}
                      </dd>
                    </section>
                  ) : selectedGoal.specId ? (
                    <section>
                      <dt className="text-muted-foreground">SPEC ID ที่ Run บันทึกไว้</dt>
                      <dd>{selectedGoal.specId}</dd>
                    </section>
                  ) : null}
                  {selectedGoal.workPackagePrerequisites ? (
                    <section>
                      <dt className="text-muted-foreground">WorkPackage ที่ต้องทำก่อน</dt>
                      <dd className="break-all">{selectedGoal.workPackagePrerequisites.length
                        ? selectedGoal.workPackagePrerequisites.map((item: { externalId: string; specIds: string[] }) => `${item.externalId}${item.specIds.length ? ` (${item.specIds.map(canonicalSpecIdLabel).join(", ")})` : ""}`).join(" → ")
                        : "ไม่มี dependency ที่ประกาศไว้"}</dd>
                    </section>
                  ) : null}
                  <section>
                    <dt className="text-muted-foreground">หลักฐาน</dt>
                    <dd>{selectedGoal.evidenceRefs?.length ?? 0} รายการ</dd>
                  </section>
                </dl>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  PROJECT SUMMARY
                </p>
                <h2 className="mt-1 font-semibold">
                  {selectedProject?.[1].name ?? "เลือก Project"}
                </h2>
                <Separator className="my-3" />
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    {activeCount} กำลังทำ
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-accent-foreground" />
                    {waitingCount} รอหรือรอการตัดสินใจ
                  </li>
                  <li className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4" />
                    {selectedGoals.length} canonical Goals
                  </li>
                  <li className="flex items-center gap-2">
                    <GitPullRequest className="h-4 w-4" />
                    {selectedJobs.length} linked work records
                  </li>
                </ul>
                {selectedProject?.[0] === "unassigned" ||
                selectedProject?.[0] === "unmapped-goals" ? (
                  <p className="mt-4 text-sm text-accent-foreground">
                    Project binding is missing or unverified.
                    รายการจะไม่ถูกรวมกับ Project อื่น
                  </p>
                ) : null}
              </>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
