import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { DashboardCard, DashboardSectionHeader } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { WorkpackSourcePanel } from "@/components/workpack/WorkpackSourcePanel";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";

type ClarificationDrafts = Record<string, string>;
type DomainPackOption =
  | "custom"
  | "finance_ops"
  | "hr_ops"
  | "support_ops"
  | "sales_ops"
  | "procurement_ops"
  | "legal_ops"
  | "customer_success"
  | "operations"
  | "content_operations"
  | "executive_support";

const DEFAULT_SOURCE_TYPE = "sop";

export default function WorkpackIntakeStudio() {
  const utils = trpc.useUtils();
  const { data: workpacks = [], isLoading } = trpc.workpack.list.useQuery();
  const { data: domainPacks = [] } = trpc.workpack.listDomainPackSuggestions.useQuery();
  const intakeCandidates = workpacks.filter((item) => (
    item.workpack.lifecycleState === "draft"
    || item.workpack.lifecycleState === "clarification_needed"
    || item.workpack.lifecycleState === "needs_review"
    || item.workpack.lifecycleState === "ready"
  ));

  const [selectedWorkpackId, setSelectedWorkpackId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [domainPack, setDomainPack] = useState<DomainPackOption | "">("");
  const [sourceType, setSourceType] = useState(DEFAULT_SOURCE_TYPE);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [localFilePath, setLocalFilePath] = useState("");
  const [localFileDeviceId, setLocalFileDeviceId] = useState("");
  const [clarificationDrafts, setClarificationDrafts] = useState<ClarificationDrafts>({});

  const focusId = selectedWorkpackId || intakeCandidates[0]?.workpack.id || "";
  const focusDetailQuery = trpc.workpack.getDetail.useQuery(
    { workpackId: focusId },
    { enabled: Boolean(focusId) },
  );

  useEffect(() => {
    if (!selectedWorkpackId && intakeCandidates[0]?.workpack.id) {
      setSelectedWorkpackId(intakeCandidates[0].workpack.id);
    }
  }, [intakeCandidates, selectedWorkpackId]);

  const createDraftMutation = trpc.workpack.createDraft.useMutation({
    onSuccess: async (result) => {
      toast.success("Workpack draft created");
      setTitle("");
      setGoal("");
      setDescription("");
      setDomainPack("");
      setSourceType(DEFAULT_SOURCE_TYPE);
      setSourceTitle("");
      setSourceText("");
      setLocalFilePath("");
      setLocalFileDeviceId("");
      setSelectedWorkpackId(result.workpack.id);
      await utils.workpack.list.invalidate();
      await utils.workpack.getDetail.invalidate({ workpackId: result.workpack.id });
    },
    onError: (error) => toast.error(error.message),
  });

  const answerClarificationMutation = trpc.workpack.answerClarification.useMutation({
    onSuccess: async () => {
      toast.success("Clarification saved");
      if (focusId) {
        await utils.workpack.getDetail.invalidate({ workpackId: focusId });
      }
      await utils.workpack.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const dismissClarificationMutation = trpc.workpack.dismissClarification.useMutation({
    onSuccess: async () => {
      toast.success("Clarification dismissed");
      if (focusId) {
        await utils.workpack.getDetail.invalidate({ workpackId: focusId });
      }
      await utils.workpack.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const compileMutation = trpc.workpack.compile.useMutation({
    onSuccess: async () => {
      toast.success("Execution plan compiled");
      if (focusId) {
        await utils.workpack.getDetail.invalidate({ workpackId: focusId });
      }
      await utils.workpack.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const simulateMutation = trpc.workpack.simulate.useMutation({
    onSuccess: async () => {
      toast.success("Simulation completed");
      if (focusId) {
        await Promise.all([
          utils.workpack.getDetail.invalidate({ workpackId: focusId }),
          utils.workpack.replay.invalidate({ workpackId: focusId }),
          utils.workpack.readiness.invalidate({ workpackId: focusId }),
        ]);
      }
      await utils.workpack.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const startRunMutation = trpc.workpack.startRun.useMutation({
    onSuccess: async () => {
      toast.success("Workpack launched");
      if (focusId) {
        await Promise.all([
          utils.workpack.getDetail.invalidate({ workpackId: focusId }),
          utils.workpack.readiness.invalidate({ workpackId: focusId }),
          utils.workpack.exceptionInbox.invalidate(),
        ]);
      }
      await utils.workpack.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const focusDetail = focusDetailQuery.data;
  const extractedFields = focusDetail?.playbook?.extractedFields ?? [];
  const clarificationQueue = focusDetail?.playbook?.clarificationQueue ?? [];
  const openClarifications = clarificationQueue.filter((question) => question.status === "pending");
  const topSignals = useMemo(() => extractedFields.slice(0, 6), [extractedFields]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <DashboardSectionHeader
        eyebrow="Case Intake Studio"
        title="Turn routine work into auto-runnable workpacks"
        description="Capture SOPs, chats, files, and browser traces; extract structured fields; clear only the smallest clarification queue; then compile, simulate, and launch."
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <DashboardCard title="Create Draft" description="Seed a new workpack from one strong source of truth">
          <div className="space-y-3">
            <Input placeholder="Workpack title" value={title} onChange={(event) => setTitle(event.target.value)} />
            <Textarea placeholder="Automation goal" value={goal} onChange={(event) => setGoal(event.target.value)} />
            <Textarea placeholder="Optional description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-600">
                <span>Domain pack</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={domainPack}
                  onChange={(event) => setDomainPack((event.target.value || "") as DomainPackOption | "")}
                >
                  <option value="">Auto-detect</option>
                  {domainPacks.map((pack) => (
                    <option key={pack} value={pack}>{pack}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-600">
                <span>Source type</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value)}
                >
                  {["sop", "document", "chat_thread", "case_study", "workflow", "workflow_export", "local_file", "url", "screenshot", "spreadsheet", "browser_trace", "screen_recording"].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
            <Input placeholder="Source title" value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} />
            <Textarea placeholder="Source text, SOP excerpt, trace notes, or case details" value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
            {sourceType === "local_file" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Local file path" value={localFilePath} onChange={(event) => setLocalFilePath(event.target.value)} />
                <Input placeholder="Desktop device id (optional)" value={localFileDeviceId} onChange={(event) => setLocalFileDeviceId(event.target.value)} />
              </div>
            ) : null}
            <Button
              onClick={() => {
                if (!title.trim() || !goal.trim() || !sourceTitle.trim()) {
                  toast.error("Title, goal, and source title are required");
                  return;
                }
                createDraftMutation.mutate({
                  title,
                  goal,
                  description: description || undefined,
                  domainPack: domainPack || undefined,
                  sources: [{
                    type: sourceType as any,
                    title: sourceTitle,
                    sourceText: sourceText || undefined,
                    originSurface: "workpack_intake_ui",
                    localFileRef: sourceType === "local_file" && localFilePath
                      ? {
                          path: localFilePath,
                          deviceId: localFileDeviceId || null,
                          metadataSummary: sourceTitle,
                        }
                      : undefined,
                  }],
                });
              }}
              disabled={createDraftMutation.isPending}
            >
              {createDraftMutation.isPending ? "Creating..." : "Create draft workpack"}
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard title="Pack Suggestions" description="Starter professions and automation families">
          <div className="flex flex-wrap gap-2">
            {domainPacks.map((pack) => (
              <button
                key={pack}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm ${domainPack === pack ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                onClick={() => setDomainPack(pack as DomainPackOption)}
              >
                {pack}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p>Recommended flow</p>
            <p className="mt-2 text-slate-500">1. Intake a real SOP or case</p>
            <p className="text-slate-500">2. Answer only low-confidence clarifications</p>
            <p className="text-slate-500">3. Compile, simulate, then launch supervised</p>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="Draft Queue" description="Cases waiting for clarification, simulation, or operator review">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading draft workpacks...</p>
        ) : intakeCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">No intake drafts are waiting right now.</p>
        ) : (
          <div className="space-y-3">
            {intakeCandidates.map(({ workpack, readiness, latestMetricSnapshot }) => (
              <div key={workpack.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{workpack.title}</h3>
                    <p className="text-sm text-slate-600">{workpack.goal}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Lifecycle: {workpack.lifecycleState} • Next action: {readiness.nextAction}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Completion {Math.round((latestMetricSnapshot?.completionRate ?? 0) * 100)}% • Intervention {Math.round((latestMetricSnapshot?.interventionRate ?? 0) * 100)}%
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={selectedWorkpackId === workpack.id ? "default" : "outline"} size="sm" onClick={() => setSelectedWorkpackId(workpack.id)}>
                      Inspect
                    </Button>
                    <Link
                      href={buildWorkpackEntrypointHref({ entrypoint: "chat", workpackId: workpack.id })}
                      className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-sky-700 no-underline hover:bg-slate-50"
                    >
                      Open draft
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      {focusDetail ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <WorkpackSourcePanel sources={focusDetail.caseSources} />
            <DashboardCard title="Extracted Fields" description="Structured facts and confidence from intake">
              <div className="space-y-3">
                {topSignals.map((field) => (
                  <div key={field.key} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">{field.label}</h4>
                      <span className="text-xs text-slate-500">{Math.round(field.confidence * 100)}% confidence</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{field.valueSummary || "No value extracted yet."}</p>
                    {field.requiresClarification ? (
                      <p className="mt-2 text-xs text-amber-600">Needs clarification before autonomous launch</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>

          <div className="space-y-6">
            <DashboardCard title="Clarification Queue" description="Answer only the missing facts the system still cannot infer safely">
              {openClarifications.length === 0 ? (
                <p className="text-sm text-slate-500">No open clarification items.</p>
              ) : (
                <div className="space-y-3">
                  {openClarifications.map((question) => (
                    <div key={question.id} className="rounded-2xl border border-slate-200 p-4">
                      <h4 className="text-sm font-semibold text-slate-900">{question.prompt}</h4>
                      <p className="mt-2 text-sm text-slate-600">{question.reason}</p>
                      {question.suggestedAnswer ? (
                        <p className="mt-2 text-xs text-slate-500">Suggested: {question.suggestedAnswer}</p>
                      ) : null}
                      <Textarea
                        className="mt-3"
                        placeholder="Answer this clarification"
                        value={clarificationDrafts[question.id] ?? ""}
                        onChange={(event) => setClarificationDrafts((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            const answer = clarificationDrafts[question.id]?.trim();
                            if (!answer) {
                              toast.error("Please enter an answer first");
                              return;
                            }
                            answerClarificationMutation.mutate({
                              workpackId: focusDetail.workpack.id,
                              questionId: question.id,
                              answer,
                            });
                          }}
                          disabled={answerClarificationMutation.isPending}
                        >
                          Save answer
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => dismissClarificationMutation.mutate({
                            workpackId: focusDetail.workpack.id,
                            questionId: question.id,
                          })}
                          disabled={dismissClarificationMutation.isPending}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Launch Controls" description="Compile, rehearse, then run the workpack with minimal human steps">
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  onClick={() => compileMutation.mutate({ workpackId: focusDetail.workpack.id })}
                  disabled={compileMutation.isPending}
                >
                  {compileMutation.isPending ? "Compiling..." : "Compile"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => simulateMutation.mutate({ workpackId: focusDetail.workpack.id, mode: "fixture" })}
                  disabled={simulateMutation.isPending}
                >
                  {simulateMutation.isPending ? "Simulating..." : "Simulate"}
                </Button>
                <Button
                  onClick={() => startRunMutation.mutate({ workpackId: focusDetail.workpack.id, autonomyMode: "supervised" })}
                  disabled={startRunMutation.isPending}
                >
                  {startRunMutation.isPending ? "Launching..." : "Launch supervised"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Local file intelligence: {focusDetail.playbook?.localFileIntelligence?.available ? "available" : "unavailable"} • Parser {focusDetail.playbook?.localFileIntelligence?.parserStatus ?? "unknown"}
              </p>
            </DashboardCard>
          </div>
        </div>
      ) : null}
    </div>
  );
}
