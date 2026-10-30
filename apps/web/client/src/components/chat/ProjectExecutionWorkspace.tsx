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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";

type ProjectExecutionWorkspaceProps = {
  initialProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onOpenConversation: (conversationId: number, threadId: string | null) => void;
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
  "cancelled",
  "canceled",
]);
const LIFECYCLE = ["PLAN", "IMPLEMENT", "REVIEW", "UAT", "BUGS", "COMPLETE"];

function label(value: string | null | undefined, fallback = "ยังไม่มีข้อมูล") {
  return value ? value.replaceAll("_", " ") : fallback;
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

function projectBinding(run: any): string | null {
  const workspace = run?.metadata?.spec224Workspace;
  return workspace &&
    typeof workspace === "object" &&
    typeof workspace.projectId === "string"
    ? workspace.projectId
    : null;
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
  onSelectProject,
  onOpenConversation,
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
    return result;
  }, [threads]);
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
    return [...result.entries()].sort((a, b) => {
      if (a[0] === "unassigned") return 1;
      if (b[0] === "unassigned") return -1;
      if (a[0] === "unmapped-goals") return 1;
      if (b[0] === "unmapped-goals") return -1;
      const latest = (items: typeof jobs) =>
        Math.max(
          0,
          ...items.map(
            item => Date.parse(item.updatedAt ?? item.createdAt ?? "") || 0
          )
        );
      return latest(b[1].jobs) - latest(a[1].jobs);
    });
  }, [goals, jobs, projectNames]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const selectedProject =
    projects.find(([id]) => id === selectedProjectId) ?? projects[0] ?? null;
  const selectedGoals = selectedProject?.[1].goals ?? [];
  const selectedGoal =
    selectedGoals.find(goal => goal.goalId === selectedGoalId) ?? null;
  const selectedJobs = selectedProject?.[1].jobs ?? [];
  const selectedGoalJob = selectedGoal
    ? (selectedJobs.find(job => job.id === selectedGoal.workerJobId) ?? null)
    : null;
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            PROJECT EXECUTION
          </p>
          <h1 className="text-2xl font-semibold">Task Control</h1>
          <p className="text-sm text-muted-foreground">
            ดู Project, เป้าหมายจริง, ขั้นตอนที่มีหลักฐาน
            และสิ่งที่รอการตัดสินใจ
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
                variant={selectedProject?.[0] === id ? "secondary" : "ghost"}
                className="mb-1 h-auto w-full justify-start whitespace-normal py-2 text-left"
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
                    variant={
                      selectedGoal?.goalId === goal.goalId
                        ? "secondary"
                        : "ghost"
                    }
                    className="mb-1 h-auto w-full justify-start whitespace-normal py-2 text-left"
                    onClick={() => setSelectedGoalId(goal.goalId)}
                  >
                    <GitPullRequest className="mr-2 h-4 w-4 shrink-0" />
                    <strong className="line-clamp-2 flex-1 font-normal">
                      {goal.goal}
                    </strong>
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
                  <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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
                      <p className="font-medium">{selectedGoal.goal}</p>
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
                              className={`rounded-md border p-2 ${current ? "border-primary bg-primary/5" : observed ? "border-emerald-300 bg-emerald-50" : "border-dashed bg-muted/30"}`}
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
                        สถานะ Goal: {label(selectedGoal.state)} · Run{" "}
                        {selectedGoal.runId}
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
                          ยังไม่มี Worker Run ที่ยืนยันว่าเชื่อมกับ Goal นี้
                        </p>
                      )}
                      <p className="text-sm">
                        ขั้นตอนถัดไป:{" "}
                        {nextActionLabel(selectedGoal.nextSafeAction)}
                      </p>
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
                                  {ref}
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
                            {goal.goal}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Goal · {label(goal.state)} ·{" "}
                            {nextActionLabel(goal.nextSafeAction)}
                          </p>
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
                              {group
                                ? `${group.completedSteps}/${group.totalSteps} งานย่อยเสร็จ · ${group.progressPercent == null ? "ความคืบหน้าไม่ระบุ" : `${group.progressPercent}%`}`
                                : `สถานะ ${label(job.status)} · ไม่มี Task group ที่ยืนยันได้`}
                            </p>
                            {job.operatorAttention.required ? (
                              <p className="mt-1 flex items-center gap-1 text-sm text-amber-700">
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
                                    job.threadId
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
                <h2 className="mt-1 font-semibold">{selectedGoal.goal}</h2>
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
                    <Clock3 className="h-4 w-4 text-amber-600" />
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
                  <p className="mt-4 text-sm text-amber-700">
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
