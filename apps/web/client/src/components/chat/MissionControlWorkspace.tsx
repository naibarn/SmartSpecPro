import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  Bot,
  CircleAlert,
  Cpu,
  History,
  Radio,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { UnifiedWorkspaceInspector } from "@/components/chat/UnifiedWorkspaceInspector";

type PresentationMode = "simple" | "developer";
type MissionSection =
  | "overview"
  | "harnesses"
  | "agents"
  | "runners"
  | "active"
  | "waiting"
  | "history";
type Props = {
  onOpenConversation: (id: number, threadId: string | null) => void;
  onSelectExecutions: (jobIds: string[], selectedJobId: string | null) => void;
  presentationMode: PresentationMode;
  initialJobId: string | null;
  initialJobIds: string[];
};

const ACTIVE = new Set([
  "running",
  "claimed",
  "leased",
  "preparing",
  "uploading",
  "indexing",
]);
const WAITING = new Set([
  "pending",
  "queued",
  "waiting_external",
  "retry_scheduled",
  "blocked",
]);
const TERMINAL = new Set([
  "completed",
  "succeeded",
  "failed",
  "failed_terminal",
  "cancelled",
  "canceled",
]);
const title = (job: any) =>
  job.threadTitle ?? job.conversationTitle ?? job.jobType ?? "Untitled work";
const shown = (value: string | null | undefined, empty = "Not reported") =>
  value ? value.replaceAll("_", " ") : empty;

export function MissionControlWorkspace({
  onOpenConversation,
  onSelectExecutions,
  presentationMode,
  initialJobId,
  initialJobIds,
}: Props) {
  const query = trpc.workerJobs.observability.useQuery(
    {},
    {
      staleTime: 8_000,
      refetchInterval: 8_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const runnersQuery = trpc.runnerNodes.list.useQuery(undefined, {
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const jobs = query.data?.items ?? [];
  const runners = runnersQuery.data?.runners ?? [];
  const [section, setSection] = useState<MissionSection>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId);
  const [openTabs, setOpenTabs] = useState<string[]>(() => [
    ...new Set([...initialJobIds, ...(initialJobId ? [initialJobId] : [])]),
  ]);
  const [harnessFilter, setHarnessFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [runnerFilter, setRunnerFilter] = useState("all");
  const selected = jobs.find((job: any) => job.id === selectedId) ?? null;

  useEffect(() => {
    const known = new Set(jobs.map((job: any) => job.id));
    const restored = [
      ...new Set([...initialJobIds, ...(initialJobId ? [initialJobId] : [])]),
    ].filter(id => known.has(id));
    if (restored.length)
      setOpenTabs(current => {
        const merged = [...new Set([...current, ...restored])];
        return merged.length === current.length &&
          merged.every((id, index) => id === current[index])
          ? current
          : merged;
      });
    if (!selectedId && initialJobId && known.has(initialJobId))
      setSelectedId(initialJobId);
  }, [initialJobId, initialJobIds.join("|"), jobs, selectedId]);

  const advertisedHarnesses = useMemo(() => {
    const found = new Set<string>();
    for (const runner of runners)
      for (const item of [
        ...(runner.toolInventory ?? []),
        ...(runner.capabilityInventory ?? []),
      ]) {
        const identity = `${item.id ?? ""} ${item.label ?? ""}`.toLowerCase();
        if (identity.includes("codex")) found.add("codex.v1");
        if (identity.includes("claude")) found.add("claude.v1");
        if (identity.includes("copilot")) found.add("microsoft-copilot.v1");
        if (identity.includes("hermes")) found.add("hermes");
        if (/\bpi\b|tool\.execute\.pi(?:\.|$)/.test(identity)) found.add("pi");
      }
    return [...found];
  }, [runners]);
  const harnesses = useMemo(
    () =>
      [
        ...new Set([
          ...jobs.map((job: any) => job.executionIdentity.harness ?? "unknown"),
          ...advertisedHarnesses,
        ]),
      ].sort(),
    [advertisedHarnesses, jobs]
  );
  const agents = useMemo(
    () =>
      [
        ...new Set(
          jobs.map((job: any) => job.executionIdentity.agent ?? "unknown")
        ),
      ].sort(),
    [jobs]
  );
  const activeJobs = jobs.filter((job: any) => ACTIVE.has(job.status));
  const waitingJobs = jobs.filter(
    (job: any) => WAITING.has(job.status) || job.operatorAttention.required
  );
  const historyJobs = jobs.filter((job: any) => TERMINAL.has(job.status));
  const selectedRunner =
    runners.find((runner: any) => runner.runnerId === selected?.runnerId) ??
    null;
  const filteredJobs = jobs.filter(
    (job: any) =>
      (harnessFilter === "all" ||
        (job.executionIdentity.harness ?? "unknown") === harnessFilter) &&
      (agentFilter === "all" ||
        (job.executionIdentity.agent ?? "unknown") === agentFilter) &&
      (runnerFilter === "all" ||
        (job.runnerId ?? "unassigned") === runnerFilter)
  );

  const select = (id: string) => {
    const tabs = openTabs.includes(id) ? openTabs : [...openTabs, id];
    setSelectedId(id);
    setOpenTabs(tabs);
    onSelectExecutions(tabs, id);
  };
  const close = (id: string) => {
    const tabs = openTabs.filter(tab => tab !== id);
    const next = selectedId === id ? (tabs.at(-1) ?? null) : selectedId;
    setOpenTabs(tabs);
    setSelectedId(next);
    onSelectExecutions(tabs, next);
  };

  const nav: Array<{
    id: MissionSection;
    label: string;
    count?: number;
    icon: typeof Activity;
  }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "harnesses", label: "Harnesses", count: harnesses.length, icon: Bot },
    { id: "agents", label: "Agents", count: agents.length, icon: Cpu },
    { id: "runners", label: "Runners", count: runners.length, icon: Radio },
    {
      id: "active",
      label: "Active work",
      count: activeJobs.length,
      icon: Workflow,
    },
    {
      id: "waiting",
      label: "Waiting / Attention",
      count: waitingJobs.length,
      icon: CircleAlert,
    },
    {
      id: "history",
      label: "History",
      count: historyJobs.length,
      icon: History,
    },
  ];

  const sectionJobs =
    section === "active"
      ? activeJobs
      : section === "waiting"
        ? waitingJobs
        : section === "history"
          ? historyJobs
          : jobs;
  const visibleJobs =
    section === "overview"
      ? [
          ...new Map(
            [...activeJobs, ...waitingJobs].map((job: any) => [job.id, job])
          ).values(),
        ]
      : sectionJobs;
  const chooseHarness = (harness: string) => {
    setHarnessFilter(harness);
    setSection("harnesses");
  };
  const chooseAgent = (agent: string) => {
    setAgentFilter(agent);
    setSection("agents");
  };
  const chooseRunner = (runner: string) => {
    setRunnerFilter(runner);
    setSection("runners");
  };

  return (
    <main
      className="flex h-full min-h-0 flex-col bg-muted/20"
      aria-label="Mission Control"
    >
      <header className="border-b bg-background px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {presentationMode === "simple"
            ? "TEAM WORK STATUS"
            : "MULTI-HARNESS OPERATIONS"}
        </p>
        <h1 className="text-2xl font-semibold">Mission Control</h1>
        <p className="text-sm text-muted-foreground">
          {presentationMode === "simple"
            ? "ดูว่า AI แต่ละตัวกำลังทำงานอะไร งานใดเสร็จแล้ว และงานใดต้องการความช่วยเหลือ"
            : "ติดตาม Harness, Agent, Runner และ execution จากแหล่งข้อมูลเดียวกับ Task Control พร้อมรายละเอียดตรวจสอบ"}
        </p>
      </header>
      <section className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)_21rem]">
        <nav
          className="flex gap-1 overflow-auto border-b bg-background p-2 lg:flex-col lg:border-b-0 lg:border-r"
          aria-label="Mission Control sections"
        >
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant="ghost"
                aria-pressed={section === item.id}
                className={`justify-start text-foreground ${section === item.id ? "border border-primary/30 bg-primary/10" : "hover:bg-accent"}`}
                onClick={() => setSection(item.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
                {item.count !== undefined ? (
                  <Badge className="ml-auto" variant="outline">
                    {item.count}
                  </Badge>
                ) : null}
              </Button>
            );
          })}
          <Separator className="my-2 hidden lg:block" />
          <p className="hidden px-2 text-xs text-muted-foreground lg:block">
            เลือก Harness, Agent หรือ Runner เพื่อกรองงานที่รายงานว่าผูกอยู่จริง
          </p>
        </nav>

        <section className="min-h-0 overflow-auto p-4 lg:p-6">
          {query.error || runnersQuery.error ? (
            <p
              role="alert"
              className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              โหลดข้อมูลบางส่วนไม่สำเร็จ ข้อมูลที่ไม่พร้อมจะแสดงเป็น unavailable
            </p>
          ) : null}
          {query.isLoading ? (
            <p role="status" className="mb-3 text-sm text-muted-foreground">
              กำลังอ่านสถานะงานจริง…
            </p>
          ) : null}
          <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <section>
              <h2 className="text-xl font-semibold">
                {nav.find(item => item.id === section)?.label}
              </h2>
              <p className="text-sm text-muted-foreground">
                {presentationMode === "simple"
                  ? section === "overview"
                    ? "งานที่กำลังทำและงานที่รอความช่วยเหลือ"
                    : "เลือกงานเพื่อกลับไปดูรายละเอียดหรือเปิด Session เดิม"
                  : section === "overview"
                    ? "Execution state และงานที่ต้องตรวจสอบจาก runtime"
                    : "รายการ สถานะ และตัวกรองจากข้อมูลที่รายงานโดยระบบ"}
              </p>
            </section>
            <section
              className="flex flex-wrap gap-2"
              aria-label="Mission counts"
            >
              <Badge variant="secondary">{activeJobs.length} active</Badge>
              <Badge variant="outline">
                {waitingJobs.length} waiting / attention
              </Badge>
              <Badge variant="outline">{runners.length} runners</Badge>
            </section>
          </header>

          {section === "harnesses" ? (
            <section
              className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Harness inventory"
            >
              {harnesses.map(harness => {
                const records = jobs.filter(
                  (job: any) =>
                    (job.executionIdentity.harness ?? "unknown") === harness
                );
                const capabilityFacts = runners.flatMap((runner: any) =>
                  [
                    ...(runner.toolInventory ?? []),
                    ...(runner.capabilityInventory ?? []),
                  ]
                    .filter((item: any) => {
                      const identity =
                        `${item.id ?? ""} ${item.label ?? ""}`.toLowerCase();
                      const needle = harness
                        .replace(".v1", "")
                        .replace("microsoft-", "");
                      return harness === "unknown"
                        ? false
                        : needle === "pi"
                          ? /\bpi\b|tool\.execute\.pi(?:\.|$)/.test(identity)
                          : identity.includes(needle);
                    })
                    .map((item: any) => ({ runner, item }))
                );
                return (
                  <Card
                    key={harness}
                    className={
                      harnessFilter === harness ? "border-primary" : ""
                    }
                  >
                    <CardContent className="flex items-start justify-between gap-3 p-4">
                      <section>
                        <p className="font-medium">
                          {harness === "unknown"
                            ? "Harness not reported"
                            : harness}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {records.length} reported runs ·{" "}
                          {
                            records.filter((job: any) => ACTIVE.has(job.status))
                              .length
                          }{" "}
                          active
                        </p>
                        {capabilityFacts.length ? (
                          capabilityFacts
                            .slice(0, 3)
                            .map(({ runner, item }: any) => (
                              <p
                                key={`${runner.runnerId}-${item.id}`}
                                className="mt-1 text-xs text-muted-foreground"
                              >
                                {runner.displayName ??
                                  "Runner name unavailable"}
                                :{" "}
                                {shown(
                                  item.availability,
                                  "availability unknown"
                                )}{" "}
                                · auth {shown(item.auth, "unknown")}
                              </p>
                            ))
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {records.length
                              ? "Observed in runs; current availability not advertised"
                              : "Not currently advertised by a connected Runner"}
                          </p>
                        )}
                      </section>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => chooseHarness(harness)}
                      >
                        ดูงาน
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
              {!harnesses.length ? (
                <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  ยังไม่มี Harness ที่รายงาน execution ในช่วงข้อมูลนี้
                </p>
              ) : null}
            </section>
          ) : null}
          {section === "agents" ? (
            <section
              className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Agent inventory"
            >
              {agents.map(agent => {
                const records = jobs.filter(
                  (job: any) =>
                    (job.executionIdentity.agent ?? "unknown") === agent
                );
                const harness = [
                  ...new Set(
                    records.map(
                      (job: any) => job.executionIdentity.harness ?? "unknown"
                    )
                  ),
                ].join(", ");
                return (
                  <Card
                    key={agent}
                    className={agentFilter === agent ? "border-primary" : ""}
                  >
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <section>
                        <p className="font-medium">
                          {agent === "unknown" ? "Agent not reported" : agent}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {harness} · {records.length} runs
                        </p>
                      </section>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => chooseAgent(agent)}
                      >
                        ดูงาน
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
              {!agents.length ? (
                <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  ยังไม่มี Agent ที่รายงาน execution ในช่วงข้อมูลนี้
                </p>
              ) : null}
            </section>
          ) : null}
          {section === "runners" ? (
            <section className="mb-4 grid gap-2" aria-label="Runner inventory">
              {runners.map((runner: any) => (
                <Card
                  key={runner.runnerId}
                  className={
                    runnerFilter === runner.runnerId ? "border-primary" : ""
                  }
                >
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <section>
                      <p className="font-medium">
                        {runner.displayName ?? "Runner name not reported"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Connection: {shown(runner.status, "unknown")} · Trust:{" "}
                        {shown(runner.trustState, "unknown")} · Heartbeat:{" "}
                        {runner.lastSeenAt ?? "not reported"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Capability snapshot:{" "}
                        {runner.capabilitySnapshotCurrent
                          ? "current"
                          : "stale or missing"}{" "}
                        · Dispatch readiness:{" "}
                        {shown(runner.readinessStatus, "not reported")}
                      </p>
                    </section>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => chooseRunner(runner.runnerId)}
                    >
                      ดูงานบน Runner นี้
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {!runners.length ? (
                <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                  ไม่พบ Runner ที่เชื่อมต่อ หรือยังโหลด inventory ไม่ได้
                </p>
              ) : null}
            </section>
          ) : null}

          {section === "overview" ||
          section === "harnesses" ||
          section === "agents" ||
          section === "runners" ? (
            <section
              className="mb-3 grid gap-2 md:grid-cols-3"
              aria-label="Execution summary"
            >
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Active work</p>
                  <p className="text-2xl font-semibold">{activeJobs.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Needs attention
                  </p>
                  <p className="text-2xl font-semibold">{waitingJobs.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Observed Harnesses / Agents
                  </p>
                  <p className="text-2xl font-semibold">
                    {harnesses.length} / {agents.length}
                  </p>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {presentationMode === "developer" ? (
            <section
              className="mb-3 flex flex-wrap items-end gap-2"
              aria-label="Execution filters"
            >
              <label className="grid gap-1 text-xs text-muted-foreground">
                Harness
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                  aria-label="Filter by harness"
                  value={harnessFilter}
                  onChange={event => setHarnessFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {harnesses.map(value => (
                    <option key={value} value={value}>
                      {value === "unknown" ? "Not reported" : value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Agent
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                  aria-label="Filter by agent"
                  value={agentFilter}
                  onChange={event => setAgentFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  {agents.map(value => (
                    <option key={value} value={value}>
                      {value === "unknown" ? "Not reported" : value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Runner
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                  aria-label="Filter by runner"
                  value={runnerFilter}
                  onChange={event => setRunnerFilter(event.target.value)}
                >
                  <option value="all">All</option>
                  <option value="unassigned">Not assigned</option>
                  {runners.map((runner: any) => (
                    <option key={runner.runnerId} value={runner.runnerId}>
                      {runner.displayName ?? runner.runnerId}
                    </option>
                  ))}
                </select>
              </label>
              <p className="ml-auto self-end text-xs text-muted-foreground">
                {filteredJobs.length} matching executions
              </p>
            </section>
          ) : null}
          {openTabs.length ? (
            <nav
              className="mb-3 flex gap-2 overflow-x-auto border-b pb-2"
              aria-label="Open execution tabs"
            >
              {openTabs.map(id => {
                const job = jobs.find((item: any) => item.id === id);
                if (!job) return null;
                return (
                  <section
                    key={id}
                    className={`flex shrink-0 items-center rounded-md border ${selected?.id === id ? "border-primary/30 bg-primary/10" : "bg-background"}`}
                  >
                    <Button
                      size="sm"
                      variant="ghost"
                      className="max-w-52 truncate"
                      onClick={() => {
                        setSelectedId(id);
                        onSelectExecutions(openTabs, id);
                      }}
                    >
                      {title(job)}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Close ${title(job)}`}
                      onClick={() => close(id)}
                    >
                      ×
                    </Button>
                  </section>
                );
              })}
            </nav>
          ) : null}
          <section className="space-y-2" aria-label="Executions">
            {visibleJobs
              .filter((job: any) =>
                filteredJobs.some((filtered: any) => filtered.id === job.id)
              )
              .map((job: any) => (
                <Card
                  key={job.id}
                  className={
                    selected?.id === job.id
                      ? "border-primary ring-1 ring-primary/20"
                      : ""
                  }
                >
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <section className="min-w-0 flex-1">
                      <p className="truncate font-medium">{title(job)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {shown(job.executionIdentity.harness)} ·{" "}
                        {shown(job.executionIdentity.agent)} ·{" "}
                        {job.runnerId
                          ? (runners.find(
                              (runner: any) => runner.runnerId === job.runnerId
                            )?.displayName ?? `Runner ${job.runnerId}`)
                          : "Runner not reported"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {shown(job.stage, "Stage not reported")} · updated{" "}
                        {job.updatedAt ??
                          job.heartbeatAt ??
                          job.createdAt ??
                          "time not reported"}
                      </p>
                      {job.operatorAttention.required ? (
                        <p className="mt-1 flex items-center gap-1 text-sm text-accent-foreground">
                          <CircleAlert className="h-4 w-4" />
                          {job.operatorAttention.reason ?? "Needs attention"}
                        </p>
                      ) : null}
                    </section>
                    <section className="flex items-center gap-2">
                      <Badge
                        variant={
                          ACTIVE.has(job.status) ? "default" : "secondary"
                        }
                      >
                        {shown(job.status)}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => select(job.id)}
                      >
                        Inspect
                      </Button>
                    </section>
                  </CardContent>
                </Card>
              ))}
            {!visibleJobs.filter((job: any) =>
              filteredJobs.some((filtered: any) => filtered.id === job.id)
            ).length ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {query.isLoading
                  ? "กำลังโหลด…"
                  : section === "overview"
                    ? "ยังไม่มีงานที่กำลังทำ"
                    : "ไม่มี execution ในมุมมองและตัวกรองนี้"}
              </p>
            ) : null}
          </section>
        </section>

        <aside
          className="min-h-0 overflow-auto border-t bg-background p-4 lg:border-l lg:border-t-0"
          aria-label="Execution inspector"
        >
          {selected ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                EXECUTION INSPECTOR
              </p>
              <h2 className="mt-1 break-words font-semibold">
                {title(selected)}
              </h2>
              <section className="mt-2 flex flex-wrap gap-2">
                <Badge
                  variant={
                    ACTIVE.has(selected.status) ? "default" : "secondary"
                  }
                >
                  {shown(selected.status)}
                </Badge>
                {selected.operatorAttention.required ? (
                  <Badge variant="destructive">Needs attention</Badge>
                ) : null}
              </section>
              <Separator className="my-3" />
              <dl className="space-y-3 text-sm">
                <section>
                  <dt className="text-muted-foreground">Harness</dt>
                  <dd>{shown(selected.executionIdentity.harness)}</dd>
                </section>
                <section>
                  <dt className="text-muted-foreground">Agent / Model</dt>
                  <dd>
                    {shown(selected.executionIdentity.agent)} ·{" "}
                    {shown(selected.executionIdentity.model)}
                  </dd>
                </section>
                <section>
                  <dt className="text-muted-foreground">Runner</dt>
                  <dd>
                    {selectedRunner?.displayName ??
                      (selected.runnerId
                        ? "Runner name unavailable"
                        : "Not reported")}
                  </dd>
                </section>
                <section>
                  <dt className="text-muted-foreground">Stage / Attempt</dt>
                  <dd>
                    {shown(selected.stage)} · {selected.attempt}/
                    {selected.maxAttempts}
                  </dd>
                </section>
                {selected.parentJobId || selected.parentRunId ? (
                  <section>
                    <dt className="text-muted-foreground">Parent execution</dt>
                    <dd>{selected.parentJobId ?? selected.parentRunId}</dd>
                  </section>
                ) : null}
                {selectedRunner ? (
                  <section>
                    <dt className="text-muted-foreground">Runner health</dt>
                    <dd>
                      {shown(selectedRunner.status)} ·{" "}
                      {selectedRunner.capabilitySnapshotCurrent
                        ? "capabilities current"
                        : "capabilities stale or missing"}
                    </dd>
                  </section>
                ) : null}
                <section>
                  <dt className="text-muted-foreground">Last activity</dt>
                  <dd>
                    {selected.heartbeatAt ??
                      selected.updatedAt ??
                      "Not reported"}
                  </dd>
                </section>
              </dl>
              <Separator className="my-3" />
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Continue or inspect</h3>
                {selected.conversationId ? (
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={() =>
                      onOpenConversation(
                        selected.conversationId,
                        selected.threadId
                      )
                    }
                  >
                    เปิด Session เดิมใน Chat
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    ไม่มี Session ที่เชื่อมโยงจากข้อมูลนี้
                  </p>
                )}
                <Link
                  className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
                  href={`/agent-monitor?jobId=${encodeURIComponent(selected.id)}`}
                >
                  เปิดหลักฐาน Run, files และ tests
                </Link>
                {selected.executionIdentity.harness === "codex" ||
                selected.executionIdentity.harness === "codex.v1" ||
                selected.executionIdentity.harness === "claude" ||
                selected.executionIdentity.harness === "claude.v1" ? (
                  <Link
                    className="inline-flex w-full items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-muted"
                    href={`/chat-legacy?panel=control-plane&view=full&harness=${selected.executionIdentity.harness.startsWith("claude") ? "claude.v1" : "codex.v1"}`}
                  >
                    สร้าง Goal โดยเลือก Harness นี้
                  </Link>
                ) : null}
              </section>
              {presentationMode === "developer" ? (
                <>
                  <Separator className="my-3" />
                  <UnifiedWorkspaceInspector
                    conversationId={selected.conversationId ?? null}
                    threadId={selected.threadId ?? null}
                    conversationTitle={title(selected)}
                    jobId={selected.id}
                    className="-mx-4 -mb-4 min-h-[30rem] border-0"
                  />
                </>
              ) : null}
            </>
          ) : (
            <section className="grid min-h-48 place-items-center text-center">
              <section>
                <Radio className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="font-medium">เลือกงานเพื่อดูรายละเอียด</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Harness, Agent, Model, Runner และสถานะจะมาจาก execution จริง
                </p>
              </section>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
