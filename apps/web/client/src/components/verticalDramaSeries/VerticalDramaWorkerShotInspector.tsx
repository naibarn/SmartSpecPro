import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type VerticalDramaWorkerShotTarget = {
  id: string;
  label: string;
  status: string;
  mcpReady: boolean;
  workflowIds: string[];
};

export type VerticalDramaWorkerShotDispatchState = {
  status: "queued" | "running" | "failed" | "ready" | "canceled";
  jobId?: string | null;
  message?: string | null;
};

export type VerticalDramaWorkerShotInspectorDetails = {
  startFrameLabel?: string | null;
  referenceRoles?: string[];
  previewUrl?: string | null;
  qcMessage?: string | null;
  focusMode?: string | null;
  durationMs?: number | null;
  timeline?: string | null;
  stillMotion?: string | null;
  artifactRevision?: string | null;
  approvalState?: string | null;
};

export function VerticalDramaWorkerShotInspector({
  shotNumber,
  targets,
  loading = false,
  dispatching = false,
  state,
  onDispatch,
  onRetry,
  onCancel,
  details,
}: {
  shotNumber: number;
  targets: VerticalDramaWorkerShotTarget[];
  loading?: boolean;
  dispatching?: boolean;
  state?: VerticalDramaWorkerShotDispatchState;
  onDispatch: (input: { workerId: string; workflowId: string | null; durationMs: number }) => void;
  onRetry?: (input: { workerId: string; workflowId: string | null; durationMs: number }) => void;
  onCancel?: (jobId: string) => void;
  details?: VerticalDramaWorkerShotInspectorDetails;
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | undefined>();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | undefined>();
  const [selectedDurationMs, setSelectedDurationMs] = useState(6000);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const target = useMemo(
    () => targets.find(item => item.id === selectedWorkerId) ?? targets.find(item => item.mcpReady && item.workflowIds.length > 0) ?? targets[0],
    [selectedWorkerId, targets]
  );
  useEffect(() => {
    if (!target?.workflowIds.length) {
      setSelectedWorkflowId(undefined);
      return;
    }
    setSelectedWorkflowId(current => target.workflowIds.includes(current ?? "") ? current : target.workflowIds[0]);
  }, [target]);
  useEffect(() => {
    if (typeof details?.durationMs === "number" && Number.isFinite(details.durationMs)) {
      setSelectedDurationMs(Math.min(90_000, Math.max(1_000, Math.round(details.durationMs))));
    }
  }, [details?.durationMs]);
  const workflowId = selectedWorkflowId ?? target?.workflowIds[0] ?? null;

  useEffect(() => {
    if (!detailsOpen) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter(item => !item.hasAttribute("disabled"));
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDetailsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [detailsOpen]);

  return (
    <Card className="border-primary/30 bg-primary/5" data-testid={`vd-worker-shot-inspector-${shotNumber}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            สร้าง Shot ด้วย Worker
          </CardTitle>
          <Badge variant={state?.status === "ready" ? "default" : "outline"}>
            {state?.status ?? (loading ? "กำลังตรวจสอบ" : "พร้อมเลือก")}
          </Badge>
        </div>
        <CardDescription>
          ส่ง start frame และ reference frames ไปยัง workflow ที่เลือก โดยไม่แทนที่ไฟล์ต้นฉบับ
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground">ยังไม่พบ Worker ที่พร้อมใช้ ComfyUI/MCP</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`vd-worker-shot-target-${shotNumber}`}>เลือก Worker</label>
            <select id={`vd-worker-shot-target-${shotNumber}`} className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm" value={target?.id ?? ""} onChange={event => setSelectedWorkerId(event.target.value)}>
              {targets.map(item => (
                <option key={item.id} value={item.id} disabled={!item.mcpReady || item.workflowIds.length === 0}>
                  {item.label} {item.mcpReady ? "" : "(ยังไม่พร้อม)"}
                </option>
              ))}
            </select>
            {target && target.workflowIds.length > 1 ? <label className="sr-only" htmlFor={`vd-worker-shot-workflow-${shotNumber}`}>เลือก workflow</label> : null}
            {target && target.workflowIds.length > 1 ? <select id={`vd-worker-shot-workflow-${shotNumber}`} className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm" value={workflowId ?? ""} onChange={event => setSelectedWorkflowId(event.target.value)} aria-label="เลือก workflow สำหรับ Shot">
              {target.workflowIds.map(item => <option key={item} value={item}>{item}</option>)}
            </select> : null}
            <label className="sr-only" htmlFor={`vd-worker-shot-duration-${shotNumber}`}>เลือกความยาว Shot</label>
            <select id={`vd-worker-shot-duration-${shotNumber}`} className="h-9 min-w-28 rounded-md border bg-background px-2 text-sm" value={selectedDurationMs} onChange={event => setSelectedDurationMs(Number(event.target.value))} aria-label="เลือกความยาว Shot">
              {[3000, 6000, 10000, 15000, 30000, 60000, 90000].map(value => <option key={value} value={value}>{(value / 1000).toFixed(0)} วินาที</option>)}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={!target || !target.mcpReady || !workflowId || dispatching}
              onClick={() => target && onDispatch({ workerId: target.id, workflowId, durationMs: selectedDurationMs })}
              data-testid={`vd-worker-shot-dispatch-${shotNumber}`}
            >
              {dispatching ? <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {dispatching ? "กำลังส่งงาน…" : "ส่งงาน GPU"}
            </Button>
            {state && ["failed", "canceled"].includes(state.status) && onRetry ? <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!target || !target.mcpReady || !workflowId || dispatching}
              onClick={() => target && onRetry({ workerId: target.id, workflowId, durationMs: selectedDurationMs })}
              data-testid={`vd-worker-shot-retry-${shotNumber}`}
            >ลองใหม่</Button> : null}
            <Button type="button" size="sm" variant="ghost" onClick={() => setDetailsOpen(true)} data-testid={`vd-worker-shot-details-${shotNumber}`}>
              ดูรายละเอียด shot
            </Button>
            {state?.status === "queued" && state.jobId && onCancel ? <Button type="button" size="sm" variant="outline" onClick={() => { if (state.jobId) onCancel(state.jobId); }}>ยกเลิกงาน</Button> : null}
          </div>
        )}
        {state?.message ? <p className="text-xs text-destructive" role="alert">{state.message}</p> : null}
        {state?.jobId ? <p className="text-xs text-muted-foreground">คิวงาน: {state.jobId}</p> : null}
      </CardContent>
      {detailsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={() => setDetailsOpen(false)}>
          <aside ref={dialogRef} tabIndex={-1} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby={`vd-worker-shot-details-title-${shotNumber}`} onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Shot {shotNumber}</p>
                <h3 id={`vd-worker-shot-details-title-${shotNumber}`} className="text-lg font-semibold">Worker shot execution details</h3>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDetailsOpen(false)}>ปิด</Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Start frame</p><p className="text-sm">{details?.startFrameLabel ?? "ใช้เฟรมที่ server อนุมัติ"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Reference roles</p><p className="text-sm">{details?.referenceRoles?.length ? details.referenceRoles.join(", ") : "ไม่มี reference frame"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Focus / reframe</p><p className="text-sm">{details?.focusMode ?? "ตรวจจาก workflow capability"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">QC</p><p className="text-sm">{details?.qcMessage ?? "รอผล QC หลัง Worker สร้าง derived artifact"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Timeline / dead air</p><p className="text-sm">{details?.timeline ?? "รอผลวิเคราะห์ช่วง usable range และ dead air"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Still motion</p><p className="text-sm">{details?.stillMotion ?? "ไม่ระบุ / ใช้ workflow default"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Artifact / approval</p><p className="text-sm">{details?.artifactRevision ?? "ยังไม่มี artifact"} · {details?.approvalState ?? "รอตรวจสอบ"}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Duration budget</p><p className="text-sm">{details?.durationMs ? `${(details.durationMs / 1000).toFixed(1)}s` : "6.0s default"}</p></div>
            </div>
            {details?.previewUrl ? <video className="mt-4 aspect-[9/16] max-h-[28rem] w-auto rounded-md border bg-black" controls src={details.previewUrl} /> : <div className="mt-4 flex aspect-[9/16] max-h-[28rem] items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">ยังไม่มี preview 9:16</div>}
            <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Workflow ที่ resolved: <strong className="text-foreground">{workflowId ?? "ยังไม่พร้อม"}</strong> · Worker: <strong className="text-foreground">{target?.label ?? "ยังไม่เลือก"}</strong>
            </div>
          </aside>
        </div>
      ) : null}
    </Card>
  );
}
