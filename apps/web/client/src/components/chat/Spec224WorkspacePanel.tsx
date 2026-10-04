import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type WorkspaceOption = {
  runnerId: string;
  workspaceId: string;
  displayName: string;
  status: string;
  snapshotRevision: string;
};

function developmentRunStateLabel(state: string): string {
  const labels: Record<string, string> = {
    DISCOVERY: "กำลังสำรวจ",
    PLANNING: "กำลังวางแผน",
    PLAN_VERIFY: "กำลังตรวจแผน",
    IMPLEMENT: "กำลังพัฒนา",
    BUILD: "รอผู้ใช้ build",
    TEST: "รอผู้ใช้ทดสอบ",
    REVIEW: "กำลัง review",
    VERIFY: "รอผลตรวจสอบ",
    FINAL_VERIFY: "รอ final verify",
    WAITING_HUMAN_DECISION: "รอการตัดสินใจ",
    PAUSED_POLICY: "พักไว้",
    BLOCKED_RECOVERABLE: "ติด blocker ที่กู้คืนได้",
    COMPLETED: "จบงานพัฒนา",
    CANCELLED: "ยกเลิกแล้ว",
    FAILED_TERMINAL: "ล้มเหลว",
  };
  return labels[state] ?? state;
}

function selectionKey(workspace: WorkspaceOption): string {
  return JSON.stringify([workspace.runnerId, workspace.workspaceId]);
}

async function encodeFile(file: File): Promise<{ path: string; contentBase64: string }> {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("อ่านไฟล์ Spec ไม่สำเร็จ"));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์ Spec ไม่สำเร็จ"));
    reader.readAsArrayBuffer(file);
  });
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return { path: file.name, contentBase64: btoa(binary) };
}

/** Workspace and evolving SpecSet controls for the active Chat section. */
export function Spec224WorkspacePanel({ conversationId }: { conversationId: number | null }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"prompt" | "spec_set">("prompt");
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparation, setPreparation] = useState<{
    planId: string;
    planRevision: number;
    requirementCount: number;
    runnableWorkPackageIds: string[];
    blockers: string[];
    workPackages: Array<{ id: string; externalId: string; readiness: "READY" | "BLOCKED"; blockers: string[] }>;
  } | null>(null);
  const [startKeys, setStartKeys] = useState<Record<string, string>>({});

  const workspacesQuery = trpc.spec226DevelopmentControl.availableWorkspaces.useQuery({});
  const workspaceQuery = trpc.spec226DevelopmentControl.getConversationWorkspace.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null, refetchInterval: 15_000 }
  );
  const bindMutation = trpc.spec226DevelopmentControl.bindConversationWorkspace.useMutation();
  const ingestMutation = trpc.spec226DevelopmentControl.ingestSpecSet.useMutation();
  const prepareMutation = trpc.spec226DevelopmentControl.prepareWorkspaceRun.useMutation();
  const startMutation = trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation();
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const boundWorkspace = workspaceQuery.data?.workspace;
  const boundKey = boundWorkspace
    ? JSON.stringify([boundWorkspace.runnerId, boundWorkspace.workspaceId])
    : "";
  const boundIsListed = workspaces.some(item => selectionKey(item) === boundKey);
  useEffect(() => {
    const bound = workspaceQuery.data?.workspace;
    if (bound) setSelected(JSON.stringify([bound.runnerId, bound.workspaceId]));
  }, [workspaceQuery.data?.workspace?.runnerId, workspaceQuery.data?.workspace?.workspaceId]);

  async function bindWorkspace(value: string) {
    setSelected(value);
    setPreparation(null);
    if (!conversationId || !value) return;
    const workspace = workspaces.find(item => selectionKey(item) === value);
    if (!workspace) return;
    try {
      await bindMutation.mutateAsync({
        conversationId,
        runnerId: workspace.runnerId,
        workspaceId: workspace.workspaceId,
      });
      await workspaceQuery.refetch();
    } catch (error) {
      setSelected("");
      toast.error(error instanceof Error ? error.message : "ผูก workspace ไม่สำเร็จ");
    }
  }

  async function ingestFiles(files: FileList | null) {
    if (!files?.length || !conversationId || !workspaceQuery.data?.workspace) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length > 64 || selectedFiles.some(file => !/\.(md|json|zip)$/i.test(file.name))) {
      toast.error("เลือกได้ไม่เกิน 64 ไฟล์ และรองรับเฉพาะ .md, .json, .zip");
      return;
    }
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 2 * 1024 * 1024) {
      toast.error("ไฟล์รวมต้องไม่เกิน 2 MiB");
      return;
    }
    setUploading(true);
    setPreparation(null);
    try {
      const artifacts = await Promise.all(selectedFiles.map(encodeFile));
      await ingestMutation.mutateAsync({
        conversationId,
        artifacts,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      });
      await workspaceQuery.refetch();
      toast.success("บันทึก Spec Set revision ใหม่แล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "นำเข้า Spec ไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function prepare() {
    if (!conversationId) return;
    setPreparing(true);
    setPreparation(null);
    try {
      const result = await prepareMutation.mutateAsync({
        conversationId,
        mode,
        ...(mode === "prompt" ? { prompt } : {}),
      });
      setPreparation(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เตรียมแผนไม่สำเร็จ");
    } finally {
      setPreparing(false);
    }
  }

  async function startWorkPackage(workPackageId: string) {
    if (!conversationId || !preparation) return;
    const key = `${conversationId}:${mode}:${preparation.planRevision}:${workPackageId}`;
    const idempotencyKey = startKeys[key] ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setStartKeys(current => ({ ...current, [key]: idempotencyKey }));
    try {
      const result = await startMutation.mutateAsync({
        conversationId,
        mode,
        ...(mode === "prompt" ? { prompt } : {
          // Start the immutable revision shown in this preparation. Another
          // Chat section may append a newer SpecSet while this preview is open.
          specSetRevision: preparation.planRevision,
          workPackageId,
        }),
        idempotencyKey,
      });
      setStartKeys(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      toast.success(`สร้าง DevelopmentRun แล้ว · ${result.dispatchStatus}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "สั่งพัฒนาไม่สำเร็จ");
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-[var(--color-border)] p-3" aria-labelledby="spec224-workspace-heading">
      <h3 id="spec224-workspace-heading" className="text-sm font-semibold">Spec 224 workspace</h3>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        Chat section นี้เลือก workspace เดิมเพื่อทำงานต่อได้ การแนบ spec จะเพิ่ม revision; ยังไม่เริ่มแก้โค้ดหรือ build/run
      </p>
      {!conversationId ? (
        <p className="mt-3 text-xs text-amber-700">สร้างหรือเลือก conversation ก่อนจึงจะผูก workspace ได้</p>
      ) : (
        <>
          <label className="mt-3 block text-xs font-medium" htmlFor="spec224-workspace-select">Workspace</label>
          <select
            id="spec224-workspace-select"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm"
            value={selected}
            onChange={event => void bindWorkspace(event.target.value)}
            disabled={workspacesQuery.isLoading || bindMutation.isPending}
          >
            <option value="">เลือก Runner workspace</option>
            {boundWorkspace && !boundIsListed ? (
              <option value={boundKey} key={boundKey}>
                {boundWorkspace.workspaceId} · saved workspace (not in current Runner list)
              </option>
            ) : null}
            {workspaces.map(workspace => (
              <option key={selectionKey(workspace)} value={selectionKey(workspace)}>
                {workspace.displayName} · {workspace.workspaceId}
              </option>
            ))}
          </select>
          {workspacesQuery.error ? (
            <p className="mt-2 text-xs text-rose-700" role="alert">โหลด Runner workspace ไม่สำเร็จ: {workspacesQuery.error.message}</p>
          ) : null}
          {workspaceQuery.error ? (
            <p className="mt-2 text-xs text-rose-700" role="alert">โหลด workspace ที่ผูกไว้ไม่สำเร็จ: {workspaceQuery.error.message}</p>
          ) : null}
          {boundWorkspace ? (
            <p className={`mt-2 text-xs ${workspaceQuery.data?.availability?.available ? "text-emerald-700" : "text-amber-800"}`} role="status">
              ผูกกับ {boundWorkspace.workspaceId}
              {workspaceQuery.data?.availability?.status ? ` · ${workspaceQuery.data.availability.status}` : ""}
              {workspaceQuery.data.specSet ? ` · Spec Set r${workspaceQuery.data.specSet.revision}` : " · ยังไม่มี Spec Set"}
            </p>
          ) : null}
          {workspaces.length === 0 && !workspacesQuery.isLoading ? (
            <p className="mt-2 text-xs text-amber-700">ไม่พบ Runner workspace ที่ trusted และพร้อมใช้งาน</p>
          ) : null}

          <fieldset className="mt-3 space-y-2" disabled={!workspaceQuery.data?.workspace || uploading}>
            <legend className="text-xs font-medium">สิ่งที่ต้องการทำ</legend>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={mode === "prompt"} onChange={() => { setMode("prompt"); setPreparation(null); }} />
              ระบุ prompt
            </label>
            {mode === "prompt" ? (
              <Textarea aria-label="Spec 224 prompt" value={prompt} onChange={event => { setPrompt(event.target.value); setPreparation(null); }} placeholder="อธิบายงานที่ต้องการให้ทำต่อใน workspace นี้" className="min-h-20 resize-y text-sm" />
            ) : null}
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={mode === "spec_set"} onChange={() => { setMode("spec_set"); setPreparation(null); }} />
              แนบหรือเพิ่ม Spec files
            </label>
            {mode === "spec_set" ? (
              <>
                <input ref={fileInput} type="file" multiple accept=".md,.json,.zip" aria-label="แนบไฟล์ Spec 224" onChange={event => void ingestFiles(event.target.files)} />
                <p className="text-xs text-[var(--color-text-secondary)]">รองรับหลายไฟล์ .md/.json หรือ .zip; สูงสุด 64 ไฟล์และ 2 MiB ต่อชุด ไฟล์ .md เดี่ยวประกาศ work package ได้ด้วย code fence `spec224-work-packages` ที่มี JSON `spec224.workPackages`; ถ้าไม่ประกาศ ระบบจะแสดง requirement แต่ยังไม่ให้เริ่ม package นั้น</p>
              </>
            ) : null}
          </fieldset>

          {workspaceQuery.data?.specSet ? (
            <section className="mt-3 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="Spec Set manifest">
              <p className="text-xs font-medium">Revision {workspaceQuery.data.specSet.revision} · {workspaceQuery.data.specSet.files.length} files · {workspaceQuery.data.specSet.requirementCount} parsed requirements</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {workspaceQuery.data.specSet.files.map(file => <li key={file.path}>{file.path}</li>)}
              </ul>
            </section>
          ) : null}
          {workspaceQuery.data?.developmentRuns?.length ? (
            <section className="mt-3 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="DevelopmentRun ของ workspace นี้">
              <p className="text-xs font-medium">งานล่าสุดใน workspace นี้</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {workspaceQuery.data.developmentRuns.map(run => (
                  <li key={run.runId}>
                    {run.workPackageExternalId ?? "Prompt"}
                    {run.specSetRevision ? ` · Spec r${run.specSetRevision}` : ""}
                    {` · ${developmentRunStateLabel(run.state)} · ${run.runId}`}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <Button type="button" className="mt-3 w-full" disabled={!workspaceQuery.data?.workspace || uploading || preparing || (mode === "prompt" && !prompt.trim())} onClick={() => void prepare()}>
            {uploading ? "กำลังบันทึก Spec revision…" : preparing ? "กำลังเตรียม…" : "เตรียมแผนและตรวจความพร้อม"}
          </Button>
          {preparation ? (
            <section className="mt-3 rounded-md border border-[var(--color-border)] p-2" aria-live="polite">
              <p className="text-xs font-semibold">ผลการเตรียม · plan r{preparation.planRevision}</p>
              <p className="mt-1 text-xs">ข้อกำหนด {preparation.requirementCount} · work packages ที่พร้อมเริ่ม {preparation.runnableWorkPackageIds.length}</p>
              {preparation.blockers.length ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{preparation.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
              {preparation.workPackages.map(workPackage => (
                <section key={workPackage.id} className="mt-2 border-t border-[var(--color-border)] pt-2" aria-label={`Work package ${workPackage.externalId}`}>
                  <p className="text-xs font-medium">{workPackage.externalId} · {workPackage.readiness}</p>
                  {workPackage.blockers.length ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{workPackage.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
                  {preparation.runnableWorkPackageIds.includes(workPackage.id) ? (
                    <Button type="button" className="mt-2" disabled={startMutation.isPending} onClick={() => void startWorkPackage(workPackage.id)}>
                      {startMutation.isPending ? "กำลังส่งคำสั่ง…" : mode === "prompt" ? "สั่งพัฒนา" : `สั่งพัฒนา ${workPackage.externalId}`}
                    </Button>
                  ) : null}
                </section>
              ))}
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">การเตรียมไม่มี side effect; ปุ่มสั่งพัฒนาสร้าง DevelopmentRun ที่รอ authorization ส่วน build/test/application run ยังเป็น action แยก</p>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
