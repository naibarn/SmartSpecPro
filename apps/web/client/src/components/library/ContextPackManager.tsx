import { useMemo, useState } from "react";
import {
  Archive,
  BadgeCheck,
  ChevronDown,
  Copy,
  FilePlus2,
  Loader2,
  Package,
  ShieldCheck,
  ShieldX,
  Snowflake,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

type ContextPackManagerProps = {
  selectedItemIds: number[];
  onOpenItem: (itemId: number, title: string) => void;
};

function runtimeEligibilityLabel(pack: {
  readinessStatus: string;
  approvedForAgents: boolean;
}): string {
  if (pack.readinessStatus !== "trusted") {
    return `Not runtime eligible: ${pack.readinessStatus}`;
  }
  if (!pack.approvedForAgents) {
    return "Trusted but not approved for agents";
  }
  return "Runtime eligible";
}

function stageTone(active: boolean, complete: boolean): string {
  if (complete) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (active) {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }
  return "border-slate-200 bg-white text-slate-600";
}

export function ContextPackManager(props: ContextPackManagerProps) {
  const trpcUtils = trpc.useUtils();
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [createTitle, setCreateTitle] = useState("");

  const listQuery = trpc.library.listContextPacks.useQuery(
    { limit: 20 },
    { refetchOnWindowFocus: false },
  );
  const selectedDetailQuery = trpc.library.getContextPack.useQuery(
    selectedPackId ? { id: selectedPackId } : { id: 0 },
    {
      enabled: selectedPackId != null,
      refetchOnWindowFocus: false,
    },
  );
  const selectedResolveQuery = trpc.library.resolveContextPack.useQuery(
    selectedPackId
      ? {
          ref: { id: selectedPackId },
          includeCitations: true,
          failIfPartial: false,
          maxItems: 12,
        }
      : {
          ref: { id: 1 },
          includeCitations: true,
          failIfPartial: false,
          maxItems: 12,
        },
    {
      enabled: selectedPackId != null,
      refetchOnWindowFocus: false,
    },
  );

  const selectedPack = selectedDetailQuery.data ?? null;

  const invalidatePackQueries = async () => {
    await Promise.all([
      trpcUtils.library.listContextPacks.invalidate(),
      selectedPackId
        ? trpcUtils.library.getContextPack.invalidate({ id: selectedPackId })
        : Promise.resolve(),
      selectedPackId
        ? trpcUtils.library.resolveContextPack.invalidate({
            ref: { id: selectedPackId },
            includeCitations: true,
            failIfPartial: false,
            maxItems: 12,
          })
        : Promise.resolve(),
    ]);
  };

  const createMutation = trpc.library.createContextPack.useMutation({
    onSuccess: async (result) => {
      await trpcUtils.library.listContextPacks.invalidate();
      setCreateTitle("");
      setSelectedPackId(result.id);
      toast.success("Context pack created.");
    },
    onError: (error) => toast.error(error.message),
  });
  const submitForReviewMutation = trpc.library.submitContextPackForReview.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack submitted for review.");
    },
    onError: (error) => toast.error(error.message),
  });
  const approveTrustedMutation = trpc.library.approveContextPack.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack approved as trusted.");
    },
    onError: (error) => toast.error(error.message),
  });
  const approveForAgentsMutation = trpc.library.approveContextPackForAgents.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack approved for agents.");
    },
    onError: (error) => toast.error(error.message),
  });
  const revokeApprovalMutation = trpc.library.revokeContextPackAgentApproval.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Agent approval revoked.");
    },
    onError: (error) => toast.error(error.message),
  });
  const markStaleMutation = trpc.library.markContextPackStale.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack marked stale.");
    },
    onError: (error) => toast.error(error.message),
  });
  const rereviewMutation = trpc.library.requestContextPackReReview.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack sent back for review.");
    },
    onError: (error) => toast.error(error.message),
  });
  const archiveMutation = trpc.library.archiveContextPack.useMutation({
    onSuccess: async () => {
      await trpcUtils.library.listContextPacks.invalidate();
      setSelectedPackId(null);
      toast.success("Context pack archived.");
    },
    onError: (error) => toast.error(error.message),
  });
  const convertSnapshotMutation = trpc.library.convertContextPackToSnapshot.useMutation({
    onSuccess: async () => {
      await invalidatePackQueries();
      toast.success("Context pack converted to snapshot.");
    },
    onError: (error) => toast.error(error.message),
  });
  const duplicateSnapshotMutation = trpc.library.duplicateContextPackAsSnapshot.useMutation({
    onSuccess: async (result) => {
      await trpcUtils.library.listContextPacks.invalidate();
      setSelectedPackId(result.id);
      toast.success("Snapshot copy created.");
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedDiagnostics = selectedResolveQuery.data?.diagnostics ?? [];
  const selectedItems = selectedResolveQuery.data?.items ?? [];
  const canCreateManualPack = props.selectedItemIds.length > 0;
  const nextCreateTitle = createTitle.trim() || "Selected Knowledge Pack";

  const activityPending = useMemo(
    () =>
      createMutation.isPending
      || submitForReviewMutation.isPending
      || approveTrustedMutation.isPending
      || approveForAgentsMutation.isPending
      || revokeApprovalMutation.isPending
      || markStaleMutation.isPending
      || rereviewMutation.isPending
      || archiveMutation.isPending
      || convertSnapshotMutation.isPending
      || duplicateSnapshotMutation.isPending,
    [
      createMutation.isPending,
      submitForReviewMutation.isPending,
      approveTrustedMutation.isPending,
      approveForAgentsMutation.isPending,
      revokeApprovalMutation.isPending,
      markStaleMutation.isPending,
      rereviewMutation.isPending,
      archiveMutation.isPending,
      convertSnapshotMutation.isPending,
      duplicateSnapshotMutation.isPending,
    ],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Context Packs
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Curate reviewed memory packs before exposing them to agent runtime.
            </p>
          </div>
          <div className="flex min-w-[280px] flex-1 items-center gap-2 sm:max-w-lg">
            <Input
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              placeholder="Customer escalation pack"
            />
            <Button
              type="button"
              disabled={!canCreateManualPack || createMutation.isPending}
              onClick={() => {
                createMutation.mutate({
                  title: nextCreateTitle,
                  sourceMode: "manual",
                  includeItemIds: props.selectedItemIds,
                  excludeItemIds: [],
                  pinnedItemIds: [],
                  relationExpansionPolicy: "none",
                  defaultRuntimeTier: "retrieved_evidence",
                  budgetProfile: "retrieval",
                });
              }}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FilePlus2 className="mr-2 h-4 w-4" />
              )}
              Create from selection
            </Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {props.selectedItemIds.length > 0
            ? `${props.selectedItemIds.length} selected note(s) ready for a manual pack.`
            : "Select markdown notes in the library to create a manual pack."}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              1 Select notes
            </div>
            <div className="mt-2 text-sm text-slate-700">
              Start from the notes you already highlighted in the library.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              2 Review trust
            </div>
            <div className="mt-2 text-sm text-slate-700">
              Move the pack through review before it becomes trusted knowledge.
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              3 Runtime approval
            </div>
            <div className="mt-2 text-sm text-slate-700">
              Only approved packs should flow into agent and skill runtime.
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            Available packs
          </div>
          <div className="space-y-2">
            {(listQuery.data ?? []).map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelectedPackId(pack.id)}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                  selectedPackId === pack.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium text-slate-900">
                    {pack.title}
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    {pack.sourceMode}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{pack.memberCounts.included} included</span>
                  <span>{pack.memberCounts.pinned} pinned</span>
                  <span>{pack.readinessStatus}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selectedPack ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
              Select a context pack to inspect readiness, runtime eligibility,
              diagnostics, and snapshot lifecycle actions.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {selectedPack.title}
                    </h3>
                    <Badge variant="outline">{selectedPack.sourceMode}</Badge>
                    <Badge
                      className={
                        selectedPack.approvedForAgents
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-900 text-white"
                      }
                    >
                      {selectedPack.approvedForAgents
                        ? "Approved for agents"
                        : "Not approved"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {selectedPack.description ?? "No description"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">
                    {runtimeEligibilityLabel(selectedPack)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Readiness: {selectedPack.readinessStatus}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div
                  className={`rounded-2xl border px-3 py-3 ${stageTone(
                    selectedPack.readinessStatus === "draft"
                    || selectedPack.readinessStatus === "review_pending"
                    || selectedPack.readinessStatus === "trusted"
                    || selectedPack.readinessStatus === "stale",
                    true,
                  )}`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    1 Draft pack
                  </div>
                  <div className="mt-2 text-sm">
                    Notes are bundled and ready for review.
                  </div>
                </div>
                <div
                  className={`rounded-2xl border px-3 py-3 ${stageTone(
                    selectedPack.readinessStatus === "review_pending",
                    selectedPack.readinessStatus === "trusted"
                    || selectedPack.approvedForAgents,
                  )}`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    2 Review
                  </div>
                  <div className="mt-2 text-sm">
                    Trusted approval confirms the pack is safe to reuse.
                  </div>
                </div>
                <div
                  className={`rounded-2xl border px-3 py-3 ${stageTone(
                    selectedPack.readinessStatus === "trusted"
                    && !selectedPack.approvedForAgents,
                    selectedPack.approvedForAgents,
                  )}`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                    3 Runtime
                  </div>
                  <div className="mt-2 text-sm">
                    Agent approval unlocks runtime use for this pack.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedPack.readinessStatus !== "review_pending" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      submitForReviewMutation.mutate({
                        ref: { id: selectedPack.id },
                        reason: "ready_for_review",
                      })
                    }
                    disabled={activityPending}
                  >
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    Submit for review
                  </Button>
                ) : null}
                {selectedPack.readinessStatus === "review_pending" ? (
                  <Button
                    type="button"
                    onClick={() =>
                      approveTrustedMutation.mutate({
                        ref: { id: selectedPack.id },
                        reason: "trusted_after_review",
                      })
                    }
                    disabled={activityPending}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Approve trusted
                  </Button>
                ) : null}
                {selectedPack.readinessStatus === "trusted"
                && !selectedPack.approvedForAgents ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      approveForAgentsMutation.mutate({
                        ref: { id: selectedPack.id },
                        reason: "approved_for_runtime",
                      })
                    }
                    disabled={activityPending}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Approve for agents
                  </Button>
                ) : null}
                {selectedPack.approvedForAgents ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      revokeApprovalMutation.mutate({
                        ref: { id: selectedPack.id },
                        reason: "manual_revoke",
                      })
                    }
                    disabled={activityPending}
                  >
                    <ShieldX className="mr-2 h-4 w-4" />
                    Revoke approval
                  </Button>
                ) : null}
              </div>

              <Collapsible className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex w-full items-center justify-between px-1 text-sm font-semibold text-slate-900 hover:bg-transparent"
                  >
                    <span>Advanced lifecycle actions</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    {selectedPack.sourceMode !== "snapshot" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          convertSnapshotMutation.mutate({
                            ref: { id: selectedPack.id },
                            reason: "freeze_current_membership",
                          })
                        }
                        disabled={activityPending}
                      >
                        <Snowflake className="mr-2 h-4 w-4" />
                        Convert to snapshot
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        duplicateSnapshotMutation.mutate({
                          ref: { id: selectedPack.id },
                          title: `${selectedPack.title} Snapshot`,
                        })
                      }
                      disabled={activityPending}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Snapshot copy
                    </Button>
                    {selectedPack.readinessStatus !== "stale" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          markStaleMutation.mutate({
                            ref: { id: selectedPack.id },
                            reason: "operator_review_requested",
                          })
                        }
                        disabled={activityPending}
                      >
                        Mark stale
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          rereviewMutation.mutate({
                            ref: { id: selectedPack.id },
                            reason: "snapshot_refreshed",
                          })
                        }
                        disabled={activityPending}
                      >
                        Request re-review
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => archiveMutation.mutate({ id: selectedPack.id })}
                      disabled={activityPending}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Resolved notes
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Permission-filtered items returned by the current actor.
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedItems.map((item) => (
                      <button
                        key={item.libraryItemId}
                        type="button"
                        onClick={() =>
                          props.onOpenItem(item.libraryItemId, item.title)
                        }
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {item.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {item.logicalPath ?? "no logical path"} •{" "}
                            {item.freshness}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {item.citations.length} cite
                        </Badge>
                      </button>
                    ))}
                    {selectedResolveQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resolving context pack...
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Diagnostics
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Approval, drift, and runtime safety signals for this pack.
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedPack.readinessStatus}</Badge>
                    <Badge variant="outline">{selectedPack.sourceMode}</Badge>
                    <Badge variant="outline">
                      {selectedPack.memberPreview.length} previewed notes
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedDiagnostics.length > 0 ? (
                      selectedDiagnostics.map((diagnostic, index) => (
                        <div
                          key={`${diagnostic.code}-${index}`}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        >
                          <div className="font-medium">{diagnostic.code}</div>
                          <div className="mt-1 text-xs text-amber-800">
                            {diagnostic.message}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                        No blocking diagnostics. Citation coverage and runtime
                        eligibility can still be reviewed from the resolved
                        notes.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContextPackManager;
