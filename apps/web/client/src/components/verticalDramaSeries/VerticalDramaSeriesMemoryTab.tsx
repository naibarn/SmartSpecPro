/**
 * VerticalDramaSeriesMemoryTab (spec feature 131, section-08/§7.6 — Series
 * detail "Memory" tab).
 *
 * Read-only display of the series' durable append-only memory event log via
 * `trpc.verticalDramaEpisodes.listMemoryEvents`, grouped by `memoryKind`.
 * `retcon_proposal` events additionally expose Approve/Reject actions
 * (`approveRetconProposal` / `rejectRetconProposal`) for proposals that have
 * not yet been resolved by a later event in the append-only chain.
 *
 * `arc_replan_proposal` events (spec §7.7.3, section-13, added 2026-07-07)
 * get the same append-only pending/resolved review treatment via the
 * standalone `VerticalDramaArcReplanCard` below — the FORWARD-facing mirror
 * of the retcon proposal card above (retcon corrects the past; an arc
 * re-plan proposes changing the planned, non-produced future).
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Loader2,
  Package,
  PenLine,
  ScrollText,
  Unlink,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaMemoryKind } from "@shared/verticalDramaSeries";
import { VerticalDramaArcReplanCard } from "./VerticalDramaArcReplanCard";

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

  const [proposeOpen, setProposeOpen] = useState(false);
  const [factSummary, setFactSummary] = useState("");
  const [reason, setReason] = useState("");
  const [supersedesEventId, setSupersedesEventId] = useState<string>("none");

  const proposeMutation = trpc.verticalDramaEpisodes.proposeRetcon.useMutation({
    onSuccess: () => {
      toast.success(
        lang === "th" ? "ส่งข้อเสนอแก้ไขย้อนหลังแล้ว" : "Retcon proposal submitted",
      );
      setProposeOpen(false);
      setFactSummary("");
      setReason("");
      setSupersedesEventId("none");
      invalidate();
    },
    onError: (err: { message?: string }) => {
      toast.error(
        err?.message ||
          (lang === "th" ? "ส่งข้อเสนอไม่สำเร็จ" : "Failed to submit retcon proposal"),
      );
    },
  });

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

  // Fatal only on a FIRST-load failure. TanStack v5 also flags `isError` when
  // a background refetch fails while cached `data` is still available, and
  // taking the whole tab over there hides working content and destroys the
  // local state of everything below it. Keep rendering from cache.
  if (memoryQuery.isError && !memoryQuery.data) {
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

  // One shared explanatory line — WHEN memory data appears — appended after
  // each section's short empty label, so a series with no Sub-episodes approved
  // yet doesn't read as broken.
  const whenItAppearsHint =
    lang === "th"
      ? "จะบันทึกอัตโนมัติเมื่อทำ pipeline ครบและอนุมัติขั้นสรุปความจำ (ขั้นสุดท้าย) ของแต่ละตอนย่อย หรือกดปุ่ม \"สรุปความจำเข้าซีรีย์\" ในหน้าตอนย่อย"
      : "Recorded automatically once you complete the pipeline and approve the final \"summarize to series memory\" checkpoint for a Sub-episode — or click the \"Summarize into series memory\" button on the Sub-episode page.";

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
        emptyLabel={
          (lang === "th" ? "ยังไม่มีข้อเท็จจริงหลัก" : "No canonical facts yet.") +
          " " +
          whenItAppearsHint
        }
        events={canonicalFacts}
        lang={lang}
      />

      <MemorySection
        icon={ScrollText}
        title={lang === "th" ? "สรุปแต่ละตอนย่อย" : "Sub-episode summaries"}
        emptyLabel={
          (lang === "th" ? "ยังไม่มีสรุปตอนย่อย" : "No Sub-episode summaries yet.") +
          " " +
          whenItAppearsHint
        }
        events={episodeSummaries}
        lang={lang}
      />

      <MemorySection
        icon={Unlink}
        title={lang === "th" ? "ปมค้างที่เปิดไว้" : "Hooks opened"}
        emptyLabel={
          (lang === "th" ? "ยังไม่มีปมค้างที่เปิดไว้" : "No hooks opened yet.") +
          " " +
          whenItAppearsHint
        }
        events={hooksOpened}
        lang={lang}
      />

      <MemorySection
        icon={CheckCircle2}
        title={lang === "th" ? "ปมค้างที่คลี่คลายแล้ว" : "Hooks resolved"}
        emptyLabel={
          (lang === "th" ? "ยังไม่มีปมค้างที่คลี่คลาย" : "No hooks resolved yet.") +
          " " +
          whenItAppearsHint
        }
        events={hooksResolved}
        lang={lang}
      />

      <MemorySection
        icon={AlertTriangle}
        title={lang === "th" ? "คำเตือนความต่อเนื่อง" : "Continuity warnings"}
        emptyLabel={
          (lang === "th" ? "ยังไม่มีคำเตือนความต่อเนื่อง" : "No continuity warnings yet.") +
          " " +
          whenItAppearsHint
        }
        events={continuityWarnings}
        lang={lang}
      />

      <MemorySection
        icon={Package}
        title={lang === "th" ? "การใช้สินค้าผูกเรื่อง" : "Product tie-in usage"}
        emptyLabel={
          (lang === "th"
            ? "ยังไม่มีการใช้สินค้าผูกเรื่อง"
            : "No product tie-in usage yet.") +
          " " +
          whenItAppearsHint
        }
        events={productTieInUsage}
        lang={lang}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {lang === "th" ? "ข้อเสนอแก้ไขย้อนหลัง (Retcon)" : "Retcon proposals"}
          </CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setProposeOpen(true)}
            >
              <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === "th" ? "เสนอแก้ไขย้อนหลัง" : "Propose retcon"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {byKind("retcon_proposal").length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lang === "th"
                ? "ยังไม่มีข้อเสนอแก้ไขย้อนหลัง กดปุ่ม \"เสนอแก้ไขย้อนหลัง\" ด้านบนเพื่อเสนอแก้ไขข้อเท็จจริงในความจำ"
                : 'No retcon proposals yet. Use the "Propose retcon" button above to suggest a change to an existing memory fact.'}
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

      <VerticalDramaArcReplanCard lang={lang} seriesId={seriesId} readOnly={readOnly} />

      <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {lang === "th" ? "เสนอแก้ไขย้อนหลัง (Retcon)" : "Propose a retcon"}
            </DialogTitle>
            <DialogDescription>
              {lang === "th"
                ? "ข้อเสนอนี้จะไม่มีผลทันที ต้องได้รับการอนุมัติก่อนจึงจะบันทึกเป็นความจำใหม่"
                : "This proposal has no effect until approved — approval appends a new memory event without altering any prior one."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vd-retcon-fact">
                {lang === "th" ? "ข้อเท็จจริงที่เสนอใหม่" : "Proposed fact"}
              </Label>
              <Textarea
                id="vd-retcon-fact"
                value={factSummary}
                maxLength={2000}
                rows={4}
                placeholder={
                  lang === "th"
                    ? "เช่น อาเรียไม่ใช่ CFO ของ Vantor Group อีกต่อไป..."
                    : "e.g. Aria is no longer CFO of Vantor Group..."
                }
                onChange={(event) => setFactSummary(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {factSummary.length}/2000
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vd-retcon-supersedes">
                {lang === "th"
                  ? "ข้อเท็จจริงเดิมที่จะถูกแทนที่ (ถ้ามี)"
                  : "Existing fact this supersedes (optional)"}
              </Label>
              <Select value={supersedesEventId} onValueChange={setSupersedesEventId}>
                <SelectTrigger id="vd-retcon-supersedes">
                  <SelectValue
                    placeholder={
                      lang === "th" ? "ไม่แทนที่ข้อเท็จจริงใด" : "Don't supersede any fact"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {lang === "th" ? "ไม่แทนที่ข้อเท็จจริงใด" : "Don't supersede any fact"}
                  </SelectItem>
                  {canonicalFacts.map((ev) => (
                    <SelectItem key={ev.memoryEventId} value={ev.memoryEventId}>
                      {(ev.summaryText || String(ev.payload?.fact ?? "")).slice(0, 80) ||
                        ev.memoryEventId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vd-retcon-reason">
                {lang === "th" ? "เหตุผล (ไม่บังคับ)" : "Reason (optional)"}
              </Label>
              <Textarea
                id="vd-retcon-reason"
                value={reason}
                maxLength={2000}
                rows={3}
                placeholder={
                  lang === "th"
                    ? "อธิบายว่าทำไมข้อเท็จจริงเดิมจึงต้องเปลี่ยน..."
                    : "Explain why the prior fact needs to change..."
                }
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProposeOpen(false)}
              disabled={proposeMutation.isPending}
            >
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </Button>
            <Button
              disabled={!factSummary.trim() || proposeMutation.isPending}
              onClick={() =>
                proposeMutation.mutate({
                  seriesId,
                  factSummary: factSummary.trim(),
                  supersedesEventIds:
                    supersedesEventId !== "none" ? [supersedesEventId] : undefined,
                  reason: reason.trim() || undefined,
                })
              }
            >
              {proposeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : lang === "th" ? (
                "ส่งข้อเสนอ"
              ) : (
                "Submit proposal"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
                  {ev.episodeId ? ` · ${lang === "th" ? "ตอนย่อย" : "Sub-episode"} ${ev.episodeId}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
