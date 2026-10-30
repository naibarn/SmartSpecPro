import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useTaskHarnessOutputEvents } from "@/lib/useTaskHarnessOutputEvents";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import {
  Activity,
  Files,
  FlaskConical,
  Gauge,
  GitBranch,
  Package,
  ReceiptText,
  TerminalSquare,
} from "lucide-react";

const INSPECTOR_TABS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "files", label: "Files", icon: Files },
  { id: "diff", label: "Diff", icon: GitBranch },
  { id: "tests", label: "Tests", icon: FlaskConical },
  { id: "artifacts", label: "Artifacts", icon: Package },
  { id: "usage", label: "Usage", icon: Gauge },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "verify", label: "Verify", icon: FlaskConical },
] as const;

type InspectorTab = (typeof INSPECTOR_TABS)[number]["id"];

function EmptyEvidence({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {label}
    </p>
  );
}

/** Read-only run inspector shared by Chat and the unified developer workspace. */
export function UnifiedWorkspaceInspector({
  conversationId,
  threadId,
  conversationTitle,
  jobId,
  className,
}: {
  conversationId: number | null;
  threadId: string | null;
  conversationTitle?: string | null;
  jobId?: string | null;
  className?: string;
}) {
  const [tab, setTab] = useState<InspectorTab>("overview");
  const threadQuery = trpc.chat.listConversationThreads.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: Boolean(conversationId), staleTime: 15_000, retry: false }
  );
  const activeThread =
    threadQuery.data?.threads.find(item => item.threadId === threadId) ??
    threadQuery.data?.threads[0] ??
    null;
  const query = trpc.workerJobs.observability.useQuery(
    jobId ? { jobId } : conversationId ? { conversationId, threadId } : {},
    {
      enabled: Boolean(conversationId || jobId),
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const items = query.error ? [] : (query.data?.items ?? []);
  const job =
    items.find(item => item.id === jobId) ??
    items.find(item =>
      ["running", "claimed", "leased", "preparing", "uploading"].includes(
        item.status
      )
    ) ??
    items[0] ??
    null;
  const detailQuery = trpc.workerJobs.observabilityDetail.useQuery(
    {
      jobId: job?.id ?? "",
      ...(query.data?.snapshot.projectionToken
        ? { projectionToken: query.data.snapshot.projectionToken }
        : {}),
    },
    {
      enabled: Boolean(job && query.data?.snapshot.projectionToken),
      staleTime: 15_000,
      refetchInterval: 15_000,
      refetchIntervalInBackground: false,
      retry: false,
    }
  );
  const output = useTaskHarnessOutputEvents(
    job?.id ?? null,
    Boolean(job && tab !== "overview" && tab !== "activity")
  );
  const detail = detailQuery.data;
  const events = output.eventsJobId === job?.id ? output.events : [];
  const terminalEvents = useMemo(
    () => events.filter(event => event.text || event.detail),
    [events]
  );
  const fileEvents = useMemo(
    () => events.filter(event => event.path),
    [events]
  );
  const diffEvents = useMemo(
    () => events.filter(event => event.diff),
    [events]
  );
  const testEvents = useMemo(
    () =>
      events.filter(event =>
        /test|check|lint|build/i.test(`${event.kind} ${event.name ?? ""}`)
      ),
    [events]
  );

  const noRun = "No development run has started yet.";
  const unavailable =
    "This evidence is currently unavailable. Refresh or open Task Control for details.";

  return (
    <aside
      className={
        className ??
        "flex h-full min-h-0 flex-col border-l border-border bg-card"
      }
      aria-label="Thread and run inspector"
    >
      <header className="shrink-0 border-b border-border px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Thread inspector
        </p>
        <h2 className="mt-1 truncate text-base font-semibold">
          {activeThread?.title || conversationTitle || "Current session"}
        </h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {threadId
            ? `Thread · ${threadId}`
            : conversationId
              ? `Conversation · ${conversationId}`
              : "Choose a session to inspect its work"}
        </p>
        {activeThread ? (
          <p className="mt-2">
            <small className="rounded-full bg-muted px-2 py-1 text-xs">
              {activeThread.status.replaceAll("_", " ")}
            </small>
          </p>
        ) : null}
      </header>
      <Tabs
        value={tab}
        onValueChange={value => setTab(value as InspectorTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList
          aria-label="Development output panels"
          className="grid h-auto shrink-0 grid-cols-4 gap-1 rounded-none border-b border-border bg-background p-2"
        >
          {INSPECTOR_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="flex min-w-0 flex-col gap-1 px-1 py-2 text-xs leading-tight"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <small className="truncate">{label}</small>
            </TabsTrigger>
          ))}
        </TabsList>
        <VStack
          as="section"
          gap={4}
          padding={4}
          isScrollable
          className="min-h-0 flex-1"
        >
          {query.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading authorized run evidence…
            </p>
          ) : null}
          {query.error ? (
            <VStack as="section" gap={2} role="alert">
              <p className="text-sm text-destructive">
                Run information could not be loaded.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </VStack>
          ) : null}
          {!query.isLoading && !query.error && !job ? (
            <p className="mb-3 text-sm text-muted-foreground">{noRun}</p>
          ) : null}

          <TabsContent value="overview" className="mt-0 space-y-4">
            {job ? (
              <>
                <section className="space-y-2 rounded-lg border border-border p-3">
                  <HStack
                    as="header"
                    gap={2}
                    className="items-center justify-between"
                  >
                    <h3 className="font-medium">Current run</h3>
                    <small className="rounded-full bg-muted px-2 py-1 text-xs">
                      {job.status.replaceAll("_", " ")}
                    </small>
                  </HStack>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Run</dt>
                    <dd className="truncate">
                      {detail?.executionIdentity?.runId ?? "Not recorded"}
                    </dd>
                    <dt className="text-muted-foreground">Agent</dt>
                    <dd>
                      {detail?.executionIdentity?.agent ?? "Not recorded"}
                    </dd>
                    <dt className="text-muted-foreground">Harness</dt>
                    <dd>
                      {detail?.executionIdentity?.harness ?? "Not recorded"}
                    </dd>
                    <dt className="text-muted-foreground">Model</dt>
                    <dd>
                      {detail?.executionIdentity?.model ?? "Not recorded"}
                    </dd>
                    <dt className="text-muted-foreground">Runner</dt>
                    <dd>{detail?.runner?.displayName ?? "Not recorded"}</dd>
                    <dt className="text-muted-foreground">Job</dt>
                    <dd className="break-all font-mono text-xs">{job.id}</dd>
                  </dl>
                </section>
                {detailQuery.isLoading ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Loading run details…
                  </p>
                ) : null}
                {detailQuery.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    Run details are unavailable for this snapshot.
                  </p>
                ) : null}
                {detail?.timeline?.length ? (
                  <section className="space-y-2">
                    <h3 className="font-medium">Latest activity</h3>
                    <p className="text-sm text-muted-foreground">
                      {detail.timeline.at(-1)?.type?.replaceAll("_", " ")} ·{" "}
                      {detail.timeline.at(-1)?.at}
                    </p>
                  </section>
                ) : null}
              </>
            ) : (
              <EmptyEvidence
                label={
                  query.error
                    ? unavailable
                    : "Select a session or start a task to see its run, agent, harness, model, and Runner here."
                }
              />
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-0 space-y-3">
            {job && detail?.timeline?.length ? (
              <ol className="space-y-3">
                {detail.timeline.map(event => (
                  <li
                    key={event.id}
                    className="border-l-2 border-primary/30 pl-3"
                  >
                    <p className="text-sm font-medium">
                      {event.type.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.at}
                      {event.phase ? ` · ${event.phase}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyEvidence label={job ? unavailable : noRun} />
            )}
          </TabsContent>

          <TabsContent value="terminal" className="mt-0 space-y-3">
            {job && terminalEvents.length ? (
              terminalEvents.map(event => (
                <pre
                  key={event.id}
                  className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs"
                >
                  {event.text ?? event.detail}
                </pre>
              ))
            ) : (
              <EmptyEvidence
                label={
                  job
                    ? output.query.error
                      ? unavailable
                      : "No terminal output has been reported for this run."
                    : noRun
                }
              />
            )}
          </TabsContent>

          <TabsContent value="files" className="mt-0 space-y-2">
            {job && fileEvents.length ? (
              fileEvents.map(event => (
                <p
                  key={event.id}
                  className="break-all rounded-md border border-border px-3 py-2 font-mono text-xs"
                >
                  {event.path}
                </p>
              ))
            ) : (
              <EmptyEvidence
                label={
                  job
                    ? "No changed-file evidence has been reported for this run."
                    : noRun
                }
              />
            )}
          </TabsContent>

          <TabsContent value="diff" className="mt-0 space-y-3">
            {job && diffEvents.length ? (
              diffEvents.map(event => (
                <pre
                  key={event.id}
                  className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs"
                >
                  {event.diff}
                </pre>
              ))
            ) : (
              <EmptyEvidence
                label={
                  job ? "No Git diff has been reported for this run." : noRun
                }
              />
            )}
          </TabsContent>

          <TabsContent value="tests" className="mt-0 space-y-3">
            {job && testEvents.length ? (
              testEvents.map(event => (
                <section
                  key={event.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium">
                    {event.name ?? event.kind.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.status ?? "Result not reported"}
                    {event.exitCode === undefined
                      ? ""
                      : ` · exit ${event.exitCode}`}
                  </p>
                  {event.text ? (
                    <pre className="mt-2 whitespace-pre-wrap text-xs">
                      {event.text}
                    </pre>
                  ) : null}
                </section>
              ))
            ) : (
              <EmptyEvidence
                label={
                  job
                    ? "No test or build result has been reported for this run."
                    : noRun
                }
              />
            )}
          </TabsContent>

          <TabsContent value="artifacts" className="mt-0 space-y-2">
            {job && detail?.acceptance?.evidence?.length ? (
              detail.acceptance.evidence.map((item, index) => (
                <section
                  key={`${item.kind}-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium">{item.kind}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {item.reference}
                  </p>
                </section>
              ))
            ) : (
              <EmptyEvidence
                label={
                  job
                    ? "No verified artifacts are attached to this run."
                    : noRun
                }
              />
            )}
          </TabsContent>

          <TabsContent value="usage" className="mt-0 space-y-3">
            {job && detail ? (
              <>
                <section className="space-y-2 rounded-lg border border-border p-3">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Gauge className="h-4 w-4" />
                    Usage
                  </h3>
                  <p className="text-sm">
                    {detail.usage.counts.unique} recorded model calls
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {detail.usage.coverage.reason}
                  </p>
                </section>
              </>
            ) : (
              <EmptyEvidence label={job ? unavailable : noRun} />
            )}
          </TabsContent>

          <TabsContent value="receipts" className="mt-0 space-y-3">
            {job && detail ? (
              detail.usage.receipts.length ? (
                detail.usage.receipts.map(receipt => (
                  <section
                    key={`${receipt.identity.scope}:${receipt.identity.consumptionId}`}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="text-sm font-medium">Execution receipt</p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {receipt.identity.consumptionId}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {receipt.tokens.totalTokens ?? "Unknown"} tokens ·{" "}
                      {receipt.asOf}
                    </p>
                  </section>
                ))
              ) : (
                <EmptyEvidence label="No execution receipts have been recorded." />
              )
            ) : (
              <EmptyEvidence label={job ? unavailable : noRun} />
            )}
          </TabsContent>

          <TabsContent value="verify" className="mt-0 space-y-3">
            {job && detail?.acceptance?.evidence?.length ? (
              <>
                <h3 className="font-medium">Recorded verification evidence</h3>
                {detail.acceptance.evidence.map((item, index) => (
                  <section
                    key={`${item.kind}-${index}`}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="text-sm font-medium">{item.kind}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {item.reference}
                    </p>
                  </section>
                ))}
              </>
            ) : (
              <EmptyEvidence
                label={
                  job
                    ? "Independent verification has not been reported for this run."
                    : noRun
                }
              />
            )}
          </TabsContent>
        </VStack>
      </Tabs>
    </aside>
  );
}
