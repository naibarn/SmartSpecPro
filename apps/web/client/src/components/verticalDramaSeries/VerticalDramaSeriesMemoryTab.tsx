/**
 * VerticalDramaSeriesMemoryTab (spec feature 131, section-08/§7.6 — Series
 * detail "Memory" tab).
 *
 * Read-only display of the series' durable append-only memory event log via
 * `trpc.verticalDramaEpisodes.listMemoryEvents`, grouped by `memoryKind`.
 * `retcon_proposal` events additionally expose Approve/Reject actions
 * (`approveRetconProposal` / `rejectRetconProposal`) for proposals that have
 * not yet been resolved by a later event in the append-only chain.
 */

import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  Package,
  ScrollText,
  Unlink,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaMemoryKind } from "@shared/verticalDramaSeries";

interface VerticalDramaMemoryEventRow {
  memoryEventId: string;
  seriesId: string;
  episodeId?: string;
  runId?: string;
  memoryKind: VerticalDramaMemoryKind;
  payload: Record<string, unknown>;
  summaryText?: string;
  supersedesEventIds?: string[];
  approved?: boolean;
  approvedByUserId?: string;
  createdAt: string;
}

export interface VerticalDramaSeriesMemoryTabProps {
  lang: "th" | "en";
  seriesId: string;
  readOnly: boolean;
}

export function VerticalDramaSeriesMemoryTab({
  lang,
  seriesId,
  readOnly,
}: VerticalDramaSeriesMemoryTabProps) {
  const utils = trpc.useUtils();

  const memoryQuery = trpc.verticalDramaEpisodes.listMemoryEvents.useQuery(
    { seriesId, limit: 200 },
    { enabled: Boolean(seriesId), staleTime: 15_000 },
  );

  const invalidate = () => void utils.verticalDramaEpisodes.listMemoryEvents.invalidate({ seriesId });

  const approveMutation = trpc.verticalDramaEpisodes.approveRetconProposal.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "อนุมัติการแก้ไขย้อนหลังแล้ว" : "Retcon proposal approved");
      invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th" ? "อนุมัติไม่สำเร็จ" : "Failed to approve retcon proposal"),
      );
    },
  });

  const rejectMutation = trpc.verticalDramaEpisodes.rejectRetconProposal.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "ปฏิเสธการแก้ไขย้อนหลังแล้ว" : "Retcon proposal rejected");
      invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th" ? "ปฏิเสธไม่สำเร็จ" : "Failed to reject retcon proposal"),
      );
    },
  });

  if (memoryQuery.isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (memoryQuery.isError) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {lang === "th" ? "โหลดความจำซีรีย์ไม่สำเร็จ" : "Failed to load series memory"}
        </CardContent>
      </Card>
    );
  }

  const events = (memoryQuery.data?.events ?? []) as VerticalDramaMemoryEventRow[];

  const byKind = (kind: VerticalDramaMemoryKind) =>
    events.filter((ev) => ev.memoryKind === kind);

  // A retcon_proposal is "pending" until a later event's payload references it
  // via `retconApprovalOf` / `retconRejectionOf` (append-only outcome chain).
  const retconProposals = byKind("retcon_proposal").filter(
    (ev) => !("retconApprovalOf" in ev.payload) && !("retconRejectionOf" in ev.payload),
  );
  const isProposalResolved = (proposalId: string) =>
    events.some(
      (ev) =>
        ev.payload?.retconApprovalOf === proposalId || ev.payload?.retconRejectionOf === proposalId,
    );

  const canonicalFacts = byKind("canonical_fact");
  const episodeSummaries = byKind("episode_summary");
  const hooksOpened = byKind("hook_opened");
  const hooksResolved = byKind("hook_resolved");
  const continuityWarnings = byKind("continuity_warning");
  const productTieInUsage = byKind("product_tie_in_usage");

  return (
    <div className="grid gap-4">
      {readOnly && (
        <Badge variant="outline" className="w-fit">
          {lang === "th" ? "อ่านอย่างเดียว" : "Read-only"}
        </Badge>
      )}

      <MemorySection
        icon={BookOpen}
        title={lang === "th" ? "ข้อเท็จจริงหลัก" : "Canonical facts"}
        emptyLabel={lang === "th" ? "ยังไม่มีข้อเท็จจริงหลัก" : "No canonical facts yet."}
        events={canonicalFacts}
        lang={lang}
      />

      <MemorySection
        icon={ScrollText}
        title={lang === "th" ? "สรุปแต่ละตอน" : "Episode summaries"}
        emptyLabel={lang === "th" ? "ยังไม่มีสรุปตอน" : "No episode summaries yet."}
        events={episodeSummaries}
        lang={lang}
      />

      <MemorySection
        icon={Unlink}
        title={lang === "th" ? "ปมค้างที่เปิดไว้" : "Hooks opened"}
        emptyLabel={lang === "th" ? "ยังไม่มีปมค้างที่เปิดไว้" : "No hooks opened yet."}
        events={hooksOpened}
        lang={lang}
      />

      <MemorySection
        icon={CheckCircle2}
        title={lang === "th" ? "ปมค้างที่คลี่คลายแล้ว" : "Hooks resolved"}
        emptyLabel={lang === "th" ? "ยังไม่มีปมค้างที่คลี่คลาย" : "No hooks resolved yet."}
        events={hooksResolved}
        lang={lang}
      />

      <MemorySection
        icon={AlertTriangle}
        title={lang === "th" ? "คำเตือนความต่อเนื่อง" : "Continuity warnings"}
        emptyLabel={lang === "th" ? "ยังไม่มีคำเตือนความต่อเนื่อง" : "No continuity warnings yet."}
        events={continuityWarnings}
        lang={lang}
      />

      <MemorySection
        icon={Package}
        title={lang === "th" ? "การใช้สินค้าผูกเรื่อง" : "Product tie-in usage"}
        emptyLabel={
          lang === "th" ? "ยังไม่มีการใช้สินค้าผูกเรื่อง" : "No product tie-in usage yet."
        }
        events={productTieInUsage}
        lang={lang}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {lang === "th" ? "ข้อเสนอแก้ไขย้อนหลัง (Retcon)" : "Retcon proposals"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byKind("retcon_proposal").length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "th" ? "ยังไม่มีข้อเสนอแก้ไขย้อนหลัง" : "No retcon proposals yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {byKind("retcon_proposal").map((proposal) => {
                const payload = proposal.payload;
                const resolved = isProposalResolved(proposal.memoryEventId);
                const pending =
                  !resolved &&
                  retconProposals.some((p) => p.memoryEventId === proposal.memoryEventId);
                const isMutating =
                  (approveMutation.isPending &&
                    approveMutation.variables?.proposalEventId === proposal.memoryEventId) ||
                  (rejectMutation.isPending &&
                    rejectMutation.variables?.proposalEventId === proposal.memoryEventId);

                return (
                  <li key={proposal.memoryEventId} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {lang === "th" ? "ข้อเท็จจริงที่ขัดแย้ง" : "Contradicted fact"}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {String(payload.contradictedFact ?? "—")}
                        </p>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {lang === "th" ? "ข้อเท็จจริงที่เสนอใหม่" : "Proposed fact"}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {String(payload.proposedFact ?? proposal.summaryText ?? "—")}
                        </p>
                        {typeof payload.rationale === "string" && payload.rationale.trim() && (
                          <>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {lang === "th" ? "เหตุผล" : "Rationale"}
                            </p>
                            <p className="whitespace-pre-wrap text-muted-foreground">
                              {payload.rationale}
                            </p>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(proposal.createdAt).toLocaleString(
                            lang === "th" ? "th-TH" : "en-US",
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {resolved ? (
                          <Badge
                            variant={proposal.approved === false ? "outline" : "secondary"}
                            className="text-xs"
                          >
                            {lang === "th" ? "ดำเนินการแล้ว" : "Resolved"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            {lang === "th" ? "รอดำเนินการ" : "Pending"}
                          </Badge>
                        )}
                        {pending && !readOnly && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={isMutating}
                              onClick={() =>
                                approveMutation.mutate({
                                  seriesId,
                                  proposalEventId: proposal.memoryEventId,
                                })
                              }
                            >
                              {isMutating && approveMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {lang === "th" ? "อนุมัติ" : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-destructive"
                              disabled={isMutating}
                              onClick={() =>
                                rejectMutation.mutate({
                                  seriesId,
                                  proposalEventId: proposal.memoryEventId,
                                })
                              }
                            >
                              {isMutating && rejectMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              {lang === "th" ? "ปฏิเสธ" : "Reject"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MemorySection({
  icon: Icon,
  title,
  emptyLabel,
  events,
  lang,
}: {
  icon: typeof BookOpen;
  title: string;
  emptyLabel: string;
  events: VerticalDramaMemoryEventRow[];
  lang: "th" | "en";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {events.map((ev) => (
              <li key={ev.memoryEventId} className="rounded-md border p-2.5 text-sm">
                <p className="whitespace-pre-wrap">
                  {ev.summaryText?.trim() ||
                    (typeof ev.payload?.fact === "string" ? ev.payload.fact : null) ||
                    (lang === "th" ? "(ไม่มีข้อความสรุป)" : "(no summary text)")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(ev.createdAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
                  {ev.episodeId ? ` · ${lang === "th" ? "ตอน" : "Episode"} ${ev.episodeId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
