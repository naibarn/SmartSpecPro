import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, ClipboardList, Loader2, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { toast } from "sonner";

type OwnershipMode = "self" | "unassigned" | "team" | "role";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "blocked":
    case "escalated":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "in_progress":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export default function WorkRequestPage() {
  const { user } = useAuth();
  const { t } = useScopedTranslation("workos");
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [sourceType, setSourceType] = useState("manual");
  const [sourceRef, setSourceRef] = useState("");
  const [businessDomain, setBusinessDomain] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("self");
  const [ownerReference, setOwnerReference] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);

  const ownedTeamsQuery = trpc.team.list.useQuery({ ownerOnly: true, status: "active" });
  const recentRequestsQuery = trpc.workOs.listMyRequests.useQuery({ limit: 8 });
  const createRequestMutation = trpc.workOs.createRequest.useMutation({
    onSuccess: async (result) => {
      setCreatedRequestId(result.request.id);
      setCreatedCaseId(result.case.id);
      setTitle("");
      setDetails("");
      setSourceType("manual");
      setSourceRef("");
      setBusinessDomain("");
      setUrgency("normal");
      setRiskLevel("medium");
      setOwnershipMode("self");
      setOwnerReference("");
      setSelectedTeamId("");
      toast.success(t("success.title", "Work request created"));
      await utils.workOs.listMyRequests.invalidate();
    },
  });

  const sourceOptions = useMemo(() => [
    { value: "chat", label: "Chat" },
    { value: "webhook", label: "Webhook" },
    { value: "form", label: "Form" },
    { value: "api", label: "API" },
    { value: "document", label: "Document" },
    { value: "schedule", label: "Schedule" },
    { value: "manual", label: "Manual" },
    { value: "other", label: "Other" },
  ], []);

  const urgencyOptions = useMemo(() => [
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ], []);

  const riskOptions = useMemo(() => [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "critical", label: "Critical" },
  ], []);

  useEffect(() => {
    if (!user) {
      setLocation("/login");
    }
  }, [user, setLocation]);

  const createdRequest = useMemo(
    () => recentRequestsQuery.data?.find((request) => request.id === createdRequestId) ?? null,
    [recentRequestsQuery.data, createdRequestId],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Please add a title.");
      return;
    }

    const trimmedDetails = details.trim();
    const trimmedSourceRef = sourceRef.trim();
    const trimmedBusinessDomain = businessDomain.trim();
    const trimmedOwnerReference = ownerReference.trim();
    const trimmedTeamId = selectedTeamId.trim();

    const defaultOwnerType = ownershipMode === "self"
      ? "human"
      : ownershipMode === "team"
        ? "queue"
        : ownershipMode === "role"
          ? "role"
          : undefined;

    const defaultOwnerId = ownershipMode === "self"
      ? String(user.id)
      : ownershipMode === "role"
        ? trimmedOwnerReference || undefined
        : undefined;

    if (ownershipMode === "team" && !trimmedTeamId) {
      toast.error("Please choose one of your teams.");
      return;
    }

    try {
      await createRequestMutation.mutateAsync({
        sourceType,
        sourceRef: trimmedSourceRef || undefined,
        title: trimmedTitle,
        objective: trimmedDetails || undefined,
        requesterType: "human",
        requesterId: String(user.id),
        businessDomain: trimmedBusinessDomain || undefined,
        urgency,
        riskLevel,
        defaultOwnerType,
        defaultOwnerId,
        defaultQueueId: ownershipMode === "team" ? trimmedTeamId || undefined : undefined,
      });
    } catch (error) {
      console.error("Failed to create work request", error);
      toast.error("Failed to create work request.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-sky-50/40">
      <div className="border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/chat")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Chat
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                <ClipboardList className="h-6 w-6 text-sky-600" />
                {t("page.title", "Start Work Request")}
              </h1>
              <p className="text-sm text-slate-600">
                {t("page.subtitle", "Create a tracked work request that Work OS can route, monitor, and follow through to completion.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setLocation("/help/work-os")}>
              {t("helper.guide", "Read the Work OS guide")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            {(user?.role === "admin" || user?.role === "domain_admin") ? (
              <Button onClick={() => setLocation(createdCaseId ? `/admin/work-os?caseId=${encodeURIComponent(createdCaseId)}` : "/admin/work-os")}>
                <ShieldCheck className="mr-1 h-4 w-4" />
                {t("success.openConsole", "Open in Work OS Console")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-4 xl:grid-cols-3">
          <DashboardCard className="xl:col-span-2" title={t("page.forUsersTitle", "For regular users")} description={t("page.forUsersBody", "Use this page when you want to start a new request, ask for help, or hand a task to the operations team.")}>
            <p className="text-sm text-slate-600">{t("page.description", "This page is for normal users, team members, and operators who need to start new work from chat, email, a form, a webhook, or a manual request.")}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-sky-50/60 p-4">
                <MessageSquare className="h-5 w-5 text-sky-600" />
                <p className="mt-2 font-semibold text-slate-900">Chat</p>
                <p className="mt-1 text-sm text-slate-600">Capture a request after a conversation turns into real work.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-amber-50/60 p-4">
                <Sparkles className="h-5 w-5 text-amber-600" />
                <p className="mt-2 font-semibold text-slate-900">Webhook / API</p>
                <p className="mt-1 text-sm text-slate-600">Let automation start work without waiting for a person to retype it.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-emerald-50/60 p-4">
                <ClipboardList className="h-5 w-5 text-emerald-600" />
                <p className="mt-2 font-semibold text-slate-900">Manual</p>
                <p className="mt-1 text-sm text-slate-600">Create a request directly when the issue starts outside another system.</p>
              </div>
            </div>
          </DashboardCard>

          <div className="space-y-4">
            <DashboardCard title={t("page.forAdminsTitle", "For admins and domain admins")} description={t("page.forAdminsBody", "After a request is created, the Work OS Console can route it, reassign it, attach legacy tasks, and review the full case timeline.")}>
              <p className="text-sm text-slate-600">
                Work OS Console is where operators manage the inbox, assignment history, approvals, exceptions, and SLA state.
              </p>
            </DashboardCard>

            {createdRequestId ? (
              <DashboardCard title={t("success.title", "Work request created")} description={t("success.body", "Your request is now tracked and ready for routing or follow-up.")}>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Request:</span> {createdRequestId}</p>
                  <p><span className="font-medium">Case:</span> {createdCaseId ?? "n/a"}</p>
                  {createdRequest ? (
                    <Badge variant="outline" className={cn("capitalize", stateBadgeClass(createdRequest.currentState))}>
                      {createdRequest.currentState}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setLocation("/chat")}>
                    {t("success.openChat", "Back to Chat")}
                  </Button>
                  {(user?.role === "admin" || user?.role === "domain_admin") ? (
                    <Button onClick={() => setLocation(createdCaseId ? `/admin/work-os?caseId=${encodeURIComponent(createdCaseId)}` : "/admin/work-os")}>
                      {t("success.openConsole", "Open in Work OS Console")}
                    </Button>
                  ) : null}
                </div>
              </DashboardCard>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <DashboardCard title={t("page.title", "Start Work Request")} description={t("page.subtitle", "Create a tracked work request that Work OS can route, monitor, and follow through to completion.")}>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="work-title">{t("form.title", "Title")}</Label>
                <Input
                  id="work-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("form.titlePlaceholder", "Example: Review refund request for Order #1842")}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="work-details">{t("form.details", "Details")}</Label>
                <Textarea
                  id="work-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder={t("form.detailsPlaceholder", "Add context, desired outcome, blockers, or any links that help the team act faster.")}
                  rows={5}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("form.sourceType", "How did this work come in?")}</Label>
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="work-source-ref">{t("form.sourceRef", "Source reference")}</Label>
                  <Input
                    id="work-source-ref"
                    value={sourceRef}
                    onChange={(event) => setSourceRef(event.target.value)}
                    placeholder={t("form.sourceRefPlaceholder", "Example: chat thread ID, webhook event ID, ticket number")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="work-domain">{t("form.businessDomain", "Business domain")}</Label>
                  <Input
                    id="work-domain"
                    value={businessDomain}
                    onChange={(event) => setBusinessDomain(event.target.value)}
                    placeholder={t("form.businessDomainPlaceholder", "Example: support, finance, operations")}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("form.urgency", "Urgency")}</Label>
                    <Select value={urgency} onValueChange={setUrgency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {urgencyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("form.riskLevel", "Risk level")}</Label>
                    <Select value={riskLevel} onValueChange={setRiskLevel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {riskOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("form.ownership", "Initial ownership")}</h3>
                  <p className="text-sm text-slate-600">
                    Assign it to yourself, or leave it unassigned and route it later in Work OS Console.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    type="button"
                    variant={ownershipMode === "self" ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setOwnershipMode("self")}
                  >
                    {t("form.ownershipSelf", "Assign to me")}
                  </Button>
                  <Button
                    type="button"
                    variant={ownershipMode === "team" ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setOwnershipMode("team")}
                  >
                    {t("form.ownershipTeam", "Assign to my team")}
                  </Button>
                  <Button
                    type="button"
                    variant={ownershipMode === "unassigned" ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setOwnershipMode("unassigned")}
                  >
                    {t("form.ownershipUnassigned", "Leave unassigned")}
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                  <Select value={ownershipMode} onValueChange={(value) => setOwnershipMode(value as OwnershipMode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ownership mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Assign to me</SelectItem>
                      <SelectItem value="team">Assign to my team</SelectItem>
                      <SelectItem value="role">Assign to role</SelectItem>
                      <SelectItem value="unassigned">Leave unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                  {ownershipMode === "team" ? (
                    <div className="space-y-2">
                      <Label htmlFor="team-owner-select">Team</Label>
                      <select
                        id="team-owner-select"
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                        value={selectedTeamId}
                        onChange={(event) => setSelectedTeamId(event.target.value)}
                      >
                        <option value="" disabled>
                          {ownedTeamsQuery.isLoading ? "Loading your teams..." : "Choose one of your teams"}
                        </option>
                        {(ownedTeamsQuery.data ?? []).map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Input
                      value={ownerReference}
                      onChange={(event) => setOwnerReference(event.target.value)}
                      placeholder={t("form.ownerIdPlaceholder", "Example: support-queue, finance-review, or team queue ID")}
                      disabled={ownershipMode === "self" || ownershipMode === "unassigned"}
                    />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Choose “Assign to my team” to route the request to one of your own teams. Work OS will keep the tenant work item, then the team orchestra can fan out to personas inside that team.
                </p>
                {ownershipMode === "team" ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
                    {ownedTeamsQuery.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading your teams...
                      </div>
                    ) : (ownedTeamsQuery.data ?? []).length === 0 ? (
                      <p>You do not have any active teams yet. Create a team first, then use it as the work owner.</p>
                    ) : (
                      <p>Select the team that should receive the work. The selected team remains within your tenant and can distribute the task to its personas.</p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={createRequestMutation.isPending || !title.trim()}>
                  {createRequestMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("form.creating", "Creating...")}
                    </>
                  ) : (
                    t("form.submit", "Create Work Request")
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => setLocation("/chat")}>
                  {t("success.openChat", "Back to Chat")}
                </Button>
              </div>
            </form>
          </DashboardCard>

          <DashboardCard title={t("recent.title", "My recent requests")} description={t("recent.subtitle", "These are the requests you created most recently.")}>
            <div className="space-y-3">
              {recentRequestsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading requests...
                </div>
              ) : (recentRequestsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">{t("recent.empty", "You have not created any work requests yet.")}</p>
              ) : (
                (recentRequestsQuery.data ?? []).map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{request.title}</p>
                        <p className="text-xs text-slate-500">{t("recent.requestId", "Request")}: {request.id}</p>
                      </div>
                      <Badge variant="outline" className={cn("capitalize", stateBadgeClass(request.currentState))}>
                        {request.currentState}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      <p>{t("recent.caseId", "Case")}: {request.linkedCaseId ?? "n/a"}</p>
                      <p>{t("recent.source", "Source")}: {request.sourceType}</p>
                      <p>{t("recent.owner", "Owner")}: {request.defaultOwnerType ?? "unassigned"}{request.defaultOwnerId ? ` / ${request.defaultOwnerId}` : ""}</p>
                      <p>{t("recent.createdAt", "Created")}: {formatDate(request.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
