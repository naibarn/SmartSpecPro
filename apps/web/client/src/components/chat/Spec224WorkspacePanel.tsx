import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { presentCustomerError, sanitizePlatformDiagnostic } from "@shared/projectIdentityPresentation";
import { Text } from "@/components/AppPage";

type WorkspaceOption = {
  runnerId: string;
  workspaceId: string;
  displayName: string;
  status: string;
  snapshotRevision: string;
};

type ImageReferenceDraft = {
  id: string;
  file: File;
  pageHint: string;
  stateHint: "default" | "hover" | "modal" | "validation" | "loading" | "empty" | "success" | "error";
  viewportWidth: string;
  viewportHeight: string;
  rights: "user_owned" | "authorized" | "third_party_inspiration" | "unknown";
  assetReuseAllowed: boolean;
};

async function encodeImageReference(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("อ่านภาพอ้างอิงไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

function developmentRunStateLabel(state: string): string {
  const labels: Record<string, string> = {
    DISCOVERY: "กำลังสำรวจ",
    PLANNING: "กำลังวางแผน",
    PLAN_VERIFY: "กำลังตรวจแผน",
    IMPLEMENT: "กำลังพัฒนา",
    BUILD: "กำลัง build",
    TEST: "กำลังทดสอบ",
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

function imageMimeType(file: File): "image/png" | "image/jpeg" | "image/webp" | null {
  if (file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp") return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return null;
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
export function Spec224WorkspacePanel({ conversationId, simpleMode = false }: { conversationId: number | null; simpleMode?: boolean }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileInput = useRef<HTMLInputElement>(null);
  const mockupInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  const [prompt, setPrompt] = useState("");
  const [visualReferences, setVisualReferences] = useState<ImageReferenceDraft[]>([]);
  const [similarityMode, setSimilarityMode] = useState<"inspired" | "close" | "high_fidelity">("close");
  const [targetDevices, setTargetDevices] = useState<Array<"mobile" | "tablet" | "desktop">>(["mobile", "desktop"]);
  const [designNotes, setDesignNotes] = useState("");
  const [miniAppPreviewUrl, setMiniAppPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"prompt" | "spec_set">("prompt");
  const [specSource, setSpecSource] = useState<"upload" | "catalog">("upload");
  const effectiveSpecSource = simpleMode && specSource === "catalog" ? "upload" : specSource;
  const [featureSpecSearch, setFeatureSpecSearch] = useState("");
  const [selectedFeatureSpec, setSelectedFeatureSpec] = useState("");
  const [pendingSpecFiles, setPendingSpecFiles] = useState<File[]>([]);
  const [requestKind, setRequestKind] = useState<"development" | "mini_app">("development");
  const [budgetCapUsd, setBudgetCapUsd] = useState("1.00");
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [startKeys, setStartKeys] = useState<Record<string, string>>({});

  function addVisualReferences(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const supported = selectedFiles.every(file => imageMimeType(file) !== null);
    const existingBytes = visualReferences.reduce((sum, reference) => sum + reference.file.size, 0);
    const addedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (!supported || selectedFiles.length + visualReferences.length > 6 || selectedFiles.some(file => file.size > 1024 * 1024) || existingBytes + addedBytes > 1536 * 1024) {
      toast.error("รองรับ PNG/JPEG/WebP สูงสุด 6 ภาพ ภาพละ 1 MiB และรวมไม่เกิน 1.5 MiB ตามขีดจำกัด Runner input ปัจจุบัน");
      return;
    }
    setVisualReferences(current => [...current, ...selectedFiles.map(file => ({
      id: globalThis.crypto?.randomUUID?.() ?? `visual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      file,
      pageHint: "",
      stateHint: "default" as const,
      viewportWidth: "",
      viewportHeight: "",
      rights: "unknown" as const,
      assetReuseAllowed: false,
    }))]);
    setPreparation(null);
  }

  const workspacesQuery = trpc.spec226DevelopmentControl.availableWorkspaces.useQuery({});
  const workspaceQuery = trpc.spec226DevelopmentControl.getConversationWorkspace.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null, refetchInterval: 15_000 }
  );
  const bindMutation = trpc.spec226DevelopmentControl.bindConversationWorkspace.useMutation();
  const ingestMutation = trpc.spec226DevelopmentControl.ingestSpecSet.useMutation();
  const featureSpecsQuery = trpc.spec226DevelopmentControl.listFeatureSpecs.useQuery(
    { search: featureSpecSearch.trim() || undefined },
    { enabled: isAdmin && !simpleMode && mode === "spec_set" && effectiveSpecSource === "catalog" }
  );
  const ingestFeatureSpecMutation = trpc.spec226DevelopmentControl.ingestFeatureSpec.useMutation();
  const prepareMutation = trpc.spec226DevelopmentControl.prepareWorkspaceRun.useMutation();
  type Preparation = Awaited<ReturnType<typeof prepareMutation.mutateAsync>>;
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const readinessQuery = trpc.spec226DevelopmentControl.workspaceRunnerReadiness.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null && preparation !== null, refetchInterval: 5_000 }
  );
  const runnerReadiness = readinessQuery.data ?? preparation?.runnerReadiness;
  const startMutation = trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation();
  const resumeRunMutation = trpc.spec226DevelopmentControl.resumeWorkspaceRun.useMutation();
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const boundWorkspace = workspaceQuery.data?.workspace;
  const selectedWorkspace = workspaces.find(item => selectionKey(item) === selected);
  const specSet = workspaceQuery.data?.specSet;
  const boundKey = boundWorkspace
    ? JSON.stringify([boundWorkspace.runnerId, boundWorkspace.workspaceId])
    : "";
  const boundIsListed = workspaces.some(item => selectionKey(item) === boundKey);
  const effectivePrompt = prompt.trim();
  const budgetCapMinorUnits = /^\d{1,6}(?:\.\d{1,2})?$/.test(budgetCapUsd.trim())
    ? Math.round(Number(budgetCapUsd) * 100) : 0;
  const designStartFingerprint = JSON.stringify({
    effectivePrompt,
    references: visualReferences.map(({ file, ...reference }) => ({ ...reference, fileName: file.name, fileSize: file.size, fileModified: file.lastModified })),
    similarityMode,
    targetDevices,
    designNotes,
  });
  useEffect(() => {
    const bound = workspaceQuery.data?.workspace;
    if (bound) setSelected(JSON.stringify([bound.runnerId, bound.workspaceId]));
  }, [workspaceQuery.data?.workspace?.runnerId, workspaceQuery.data?.workspace?.workspaceId]);
  useEffect(() => {
    if (preparation && runnerReadiness?.ready && !preparation.runnerReadiness.ready && !prepareMutation.isPending) {
      // Readiness refresh only. Re-prepare the same input after the owner's
      // probe acknowledgement; this does not create or schedule a run.
      void prepare();
    }
  }, [readinessQuery.data?.capabilitySnapshotRevision, preparation?.runnerReadiness?.ready]);

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
      toast.error(error instanceof Error ? sanitizePlatformDiagnostic(error.message) : "ผูก workspace ไม่สำเร็จ");
    }
  }

  function selectSpecFiles(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const combined = [...pendingSpecFiles, ...selectedFiles];
    if (combined.length > 64 || selectedFiles.some(file => !/\.(md|json|zip)$/i.test(file.name))) {
      toast.error("เลือกได้ไม่เกิน 64 ไฟล์ และรองรับเฉพาะ .md, .json, .zip");
      return;
    }
    const totalBytes = combined.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 2 * 1024 * 1024) {
      toast.error("ไฟล์รวมต้องไม่เกิน 2 MiB");
      return;
    }
    setPendingSpecFiles(combined);
    setPreparation(null);
  }

  async function saveSpecFiles() {
    if (!pendingSpecFiles.length || !conversationId || !workspaceQuery.data?.workspace) return;
    setUploading(true);
    setPreparation(null);
    try {
      const artifacts = await Promise.all(pendingSpecFiles.map(encodeFile));
      await ingestMutation.mutateAsync({
        conversationId,
        artifacts,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      });
      await workspaceQuery.refetch();
      setPendingSpecFiles([]);
      toast.success("บันทึก Spec Set revision ใหม่แล้ว");
    } catch (error) {
      toast.error(presentCustomerError(error, "นำเข้า Spec ไม่สำเร็จ"));
    } finally {
      setUploading(false);
    }
  }

  async function ingestSelectedFeatureSpec() {
    if (!conversationId || !workspaceQuery.data?.workspace || !selectedFeatureSpec || !isAdmin) return;
    setUploading(true);
    setPreparation(null);
    try {
      const result = await ingestFeatureSpecMutation.mutateAsync({
        conversationId,
        specId: selectedFeatureSpec,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      });
      await workspaceQuery.refetch();
      toast.success(`เพิ่ม ${result.sourceSpec.title} ใน Spec Set revision ${result.revision} แล้ว`);
    } catch (error) {
      toast.error(presentCustomerError(error, "นำเข้า Feature Spec ไม่สำเร็จ"));
    } finally {
      setUploading(false);
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
        ...(mode === "prompt" ? { prompt: effectivePrompt } : {}),
      });
      setPreparation(result);
    } catch (error) {
      toast.error(presentCustomerError(error, "เตรียมแผนไม่สำเร็จ"));
    } finally {
      setPreparing(false);
    }
  }

  async function startWorkPackage(workPackageId: string) {
    if (!conversationId || !preparation) return;
    if (budgetCapMinorUnits < 1 || budgetCapMinorUnits > 10_000_000) {
      toast.error("ระบุวงเงิน USD ตั้งแต่ 0.01 ถึง 100,000.00");
      return;
    }
    if (visualReferences.some(reference => {
      const width = Number(reference.viewportWidth);
      const height = Number(reference.viewportHeight);
      return Boolean(reference.viewportWidth) !== Boolean(reference.viewportHeight)
        || (reference.viewportWidth && (!Number.isSafeInteger(width) || width < 1 || width > 7680))
        || (reference.viewportHeight && (!Number.isSafeInteger(height) || height < 1 || height > 7680));
    })) {
      toast.error("ระบุ viewport width และ height ให้ครบ โดยแต่ละด้านต้องไม่เกิน 7680");
      return;
    }
    if (visualReferences.length > 0 && targetDevices.length === 0) {
      toast.error("เลือก responsive target อย่างน้อยหนึ่งอุปกรณ์");
      return;
    }
    const key = `${conversationId}:${mode}:${preparation.planRevision}:${workPackageId}:${designStartFingerprint}:${budgetCapMinorUnits}`;
    const idempotencyKey = startKeys[key] ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setStartKeys(current => ({ ...current, [key]: idempotencyKey }));
    try {
      const result = await startMutation.mutateAsync({
        conversationId,
        mode,
        factoryMode: requestKind === "mini_app",
        ...(mode === "prompt" ? { prompt: effectivePrompt } : {
          // Start the immutable revision shown in this preparation. Another
          // Chat section may append a newer SpecSet while this preview is open.
          specSetRevision: preparation.planRevision,
          workPackageId,
        }),
        budgetCapMinorUnits,
        ...(visualReferences.length ? {
          visualReferences: visualReferences.map(reference => ({
            id: reference.id,
            type: "image" as const,
            sourceRef: reference.id,
            ...(reference.pageHint.trim() ? { pageHint: reference.pageHint.trim() } : {}),
            stateHint: reference.stateHint,
            ...(reference.viewportWidth && reference.viewportHeight ? { viewport: { width: Number(reference.viewportWidth), height: Number(reference.viewportHeight) } } : {}),
            rights: reference.rights,
            assetReuseAllowed: reference.assetReuseAllowed,
          })),
          visualFiles: await Promise.all(visualReferences.map(async reference => ({
            referenceId: reference.id,
            fileName: reference.file.name,
            mimeType: imageMimeType(reference.file)!,
            contentBase64: await encodeImageReference(reference.file),
          }))),
          designPreferences: {
            similarityMode,
            devices: targetDevices,
            ...(designNotes.trim() ? { notes: designNotes.trim() } : {}),
          },
        } : {}),
        idempotencyKey,
      });
      if (result.dispatchStatus === "ENQUEUED") {
        setStartKeys(current => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        toast.success(requestKind === "mini_app"
          ? `ส่ง Mini App Factory stage แรกแล้ว · ${result.dispatchStatus}`
          : "บันทึก DevelopmentRun และส่งเข้าคิวแล้ว");
      } else {
        const status = result.goalAdmissionStatus ?? result.dispatchStatus;
        const authorization = "authorization" in result ? result.authorization : null;
        const reasons = authorization && typeof authorization === "object" && "reasons" in authorization && Array.isArray(authorization.reasons)
          ? authorization.reasons.join(", ") : status;
        toast.info(status === "GOAL_APPROVAL_PENDING"
          ? "บันทึก Goal แล้ว รอผู้มีสิทธิ์อนุมัติขอบเขตก่อนเริ่มงาน"
          : simpleMode ? "บันทึกงานแล้ว แต่ยังรอสิทธิ์หรือความพร้อมก่อนเริ่ม" : `DevelopmentRun ${result.runId} ถูกเก็บไว้ · ${reasons}`);
      }
    } catch (error) {
      toast.error(presentCustomerError(error, "สั่งพัฒนาไม่สำเร็จ"));
    }
  }

  async function startPersonalMiniApp() {
    if (!conversationId || !effectivePrompt.trim()) return;
    const key = `${conversationId}:mini_app:${designStartFingerprint}`;
    const idempotencyKey = startKeys[key] ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setStartKeys(current => ({ ...current, [key]: idempotencyKey }));
    try {
      const result = await startMutation.mutateAsync({
        conversationId,
        mode: "prompt",
        factoryMode: true,
        prompt: effectivePrompt,
        idempotencyKey,
      });
      setStartKeys(current => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMiniAppPreviewUrl(result.previewUrl ?? null);
      toast.success(`เริ่มสร้าง Mini App แล้ว · ${result.previewUrl}`);
    } catch (error) {
      toast.error(presentCustomerError(error, "เริ่มสร้าง Mini App ไม่สำเร็จ"));
    }
  }

  async function resumeExistingRun(runId: string) {
    if (!conversationId || resumeRunMutation.isPending) return;
    try {
      const result = await resumeRunMutation.mutateAsync({ conversationId, runId, budgetCapMinorUnits });
      await workspaceQuery.refetch();
      if (result.dispatchStatus === "ENQUEUED") {
        toast.success(simpleMode ? "ส่งงานเดิมเข้าคิวเพื่อทำต่อแล้ว" : `ทำงานต่อจาก DevelopmentRun เดิมแล้ว · ${result.runId}`);
      } else if (result.dispatchStatus === "PENDING_AUTHORIZATION") {
        const reasons = result.authorization.reasons.join(", ") || result.authorization.status;
        toast.info(simpleMode ? "งานเดิมยังรอสิทธิ์ก่อนทำต่อ" : `DevelopmentRun เดิมยังรอ authorization · ${reasons}`);
      } else {
        const reasons = result.authorization.reasons.join(", ") || result.authorization.status;
        toast.error(simpleMode ? "ยังทำงานเดิมต่อไม่ได้ โปรดตรวจสอบความพร้อม" : `ยังทำ DevelopmentRun เดิมต่อไม่ได้ · ${reasons}`);
      }
    } catch (error) {
      toast.error(presentCustomerError(error, "ทำ DevelopmentRun เดิมต่อไม่สำเร็จ"));
    }
  }

  return (
    <section id="task-control-workspace" className="mb-4 rounded-lg border border-[var(--color-border)] p-3" aria-labelledby="spec224-workspace-heading">
      <h3 id="spec224-workspace-heading" className="text-sm font-semibold">{simpleMode ? "พื้นที่งานพัฒนา" : "Spec 224 workspace"}</h3>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        Workspace คือ project folder ที่ Runner รายงานจากเครื่องของคุณ การเลือกจะผูก Runner และ folder นั้นกับ conversation ปัจจุบัน; การแนบ Spec จะบันทึก revision แต่ยังไม่เริ่มแก้โค้ดหรือ build/run
      </p>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
        ต้องการเริ่มจาก prompt อย่างเดียว? <a className="underline" href="/factory#personal-mini-app">Create a Personal Mini-App</a>
      </p>
      {!conversationId ? (
        <p className="mt-3 text-xs text-amber-700">สร้างหรือเลือก conversation ก่อนจึงจะผูก workspace ได้</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium" htmlFor="spec224-workspace-select">1. เลือก Runner และ project workspace</label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={workspacesQuery.isFetching || bindMutation.isPending}
              onClick={() => void Promise.all([workspacesQuery.refetch(), workspaceQuery.refetch()])}
              aria-label="โหลด Runner workspace ใหม่"
            >
              {workspacesQuery.isFetching ? "กำลังโหลด…" : "โหลดรายการใหม่"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            เลือก workspace ที่ต้องการให้ทำงานต่อ รายการนี้มาจาก Runner ที่ออนไลน์และเชื่อถือได้ เมื่อเลือกแล้ว Spec และคำสั่ง Start ของ conversation นี้จะใช้ Runner/workspace เดียวกัน
          </p>
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
                Workspace ที่บันทึกไว้ก่อนหน้า (Runner ยังไม่อยู่ในรายการปัจจุบัน)
              </option>
            ) : null}
            {workspaces.map(workspace => (
              <option key={selectionKey(workspace)} value={selectionKey(workspace)}>
                {workspace.displayName}
              </option>
            ))}
          </select>
          {workspacesQuery.error ? (
            <p className="mt-2 text-xs text-rose-700" role="alert">โหลด Runner workspace ไม่สำเร็จ โปรดลองใหม่หรือตรวจสอบสิทธิ์</p>
          ) : null}
          {workspaceQuery.error ? (
            <p className="mt-2 text-xs text-rose-700" role="alert">โหลด workspace ที่ผูกไว้ไม่สำเร็จ{simpleMode ? " โปรดลองใหม่" : `: ${sanitizePlatformDiagnostic(workspaceQuery.error.message)}`}</p>
          ) : null}
          {boundWorkspace ? (
            <p className={`mt-2 text-xs ${workspaceQuery.data?.availability?.available ? "text-emerald-700" : "text-amber-800"}`} role="status">
              {workspaceQuery.data?.availability?.available ? "Conversation นี้ผูกแล้ว:" : "Binding ปัจจุบัน:"} {workspaces.find(item => selectionKey(item) === boundKey)?.displayName ?? "workspace ที่บันทึกไว้"}
              {!simpleMode && workspaceQuery.data?.availability?.status ? ` · สถานะ ${workspaceQuery.data?.availability?.status}` : ""}
              {!simpleMode ? (specSet ? ` · Spec Set r${specSet.revision}` : " · ยังไม่มี Spec Set") : ""}
            </p>
          ) : null}
          {selectedWorkspace ? (
            <section className="mt-2 rounded-md bg-[var(--color-background-subtle)] px-3 py-2 text-xs" aria-label="รายละเอียด workspace ที่เลือก">
              <p className="font-medium">{selectedWorkspace.displayName}</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                {selectedWorkspace.dirty === null
                  ? "Runner ยังไม่รายงานสถานะการเปลี่ยนแปลง"
                  : selectedWorkspace.dirty
                    ? "มีการเปลี่ยนแปลงใน workspace"
                    : "ไม่มีการเปลี่ยนแปลงที่ยังไม่บันทึก"}
              </p>
            </section>
          ) : null}
          {workspaces.length === 0 && !workspacesQuery.isLoading ? (
            <section className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              <p className="font-medium">ยังไม่มี project workspace ที่เว็บใช้ได้</p>
              <p className="mt-1">รายการจะแสดงเมื่อ Runner ที่ได้รับอนุญาตรายงาน workspace แล้ว ตรวจสอบการเชื่อมต่อและสิทธิ์ Runner จากนั้นกด “โหลดรายการใหม่”</p>
            </section>
          ) : null}

          <fieldset className="mt-3 space-y-2" disabled={uploading}>
            <legend className="text-xs font-medium">สิ่งที่ต้องการทำ</legend>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={mode === "prompt"} onChange={() => { setMode("prompt"); setPreparation(null); }} />
              ระบุ prompt
            </label>
            {mode === "prompt" ? (
              <div className="flex flex-wrap gap-3 rounded-md bg-[var(--color-background-subtle)] p-2 text-xs">
                <span className="font-medium">ประเภทงาน</span>
                <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "development"} onChange={() => { setRequestKind("development"); setPreparation(null); }} />พัฒนาตาม prompt</label>
                <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "mini_app"} onChange={() => { setRequestKind("mini_app"); setMode("prompt"); setPreparation(null); }} />สร้าง Mini App</label>
              </div>
            ) : null}
            <>
              {mode === "prompt" ? <Textarea aria-label={requestKind === "mini_app" ? "Mini App requirements" : "Spec 224 prompt"} value={prompt} onChange={event => { setPrompt(event.target.value); setPreparation(null); }} placeholder={requestKind === "mini_app" ? "อธิบายหน้าจอ ข้อมูล และพฤติกรรมของ Mini App ที่ต้องการ" : "อธิบายงานที่ต้องการให้ทำต่อใน workspace นี้"} maxLength={requestKind === "mini_app" ? 3600 : 4000} className="min-h-20 resize-y text-sm" /> : null}
              {requestKind === "mini_app" && mode === "prompt" ? (
                <p className="text-xs text-muted-foreground">
                  การสร้างและทดสอบ Preview ไม่ต้องใช้ Windows Runner หรือ GitHub ส่วน GitHub จะใช้เก็บ source ใน repo ส่วนตัวหลังมี artifact แล้ว หากยังไม่มี provider สำหรับสร้างแอป ให้ตั้งค่าได้ที่ <a className="underline" href="/settings?tab=localAi">Settings → Local AI</a>
                </p>
              ) : null}
              {requestKind === "development" ? (
                <label className="block text-xs font-medium">
                  วงเงินสูงสุดของ DevelopmentRun นี้ (USD)
                  <input
                    aria-label="วงเงินสูงสุดสำหรับ DevelopmentRun เป็น USD"
                    inputMode="decimal"
                    value={budgetCapUsd}
                    onChange={event => { setBudgetCapUsd(event.target.value.replace(/[^\d.]/g, "").slice(0, 9)); setPreparation(null); }}
                    className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm"
                  />
                  <span className="mt-1 block font-normal text-[var(--color-text-secondary)]">
                    Start จะตั้ง policy และ budget แบบ non-production ให้เฉพาะ run นี้ โดยจำกัดการใช้ไม่เกิน USD {budgetCapMinorUnits > 0 ? (budgetCapMinorUnits / 100).toFixed(2) : "—"} และหมดอายุภายในหนึ่งชั่วโมง ไม่มีการเติมเครดิตหรือ deploy production
                  </span>
                </label>
              ) : null}
                {requestKind === "development" ? <fieldset className="space-y-2 rounded-md border border-[var(--color-border)] p-2" aria-label="Design references">
                  <legend className="px-1 text-xs font-medium">Design References (optional)</legend>
                  <input ref={mockupInput} className="sr-only" type="file" multiple accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="แนบภาพ Mock-up หลายภาพ" onChange={event => { addVisualReferences(event.target.files); event.currentTarget.value = ""; }} />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" disabled={uploading || visualReferences.length >= 6} onClick={() => mockupInput.current?.click()}>
                      เลือกภาพ Mock-up
                    </Button>
                    <p className="text-xs text-[var(--color-text-secondary)]">แนบ PNG/JPG/WebP ได้สูงสุด 6 ภาพ · ภาพละ 1 MiB · รวม 1.5 MiB</p>
                  </div>
                  {visualReferences.map((reference, index) => (
                    <div key={reference.id} className="grid gap-2 rounded border border-[var(--color-border)] p-2 sm:grid-cols-2" aria-label={`Visual reference ${index + 1}`}>
                      <p className="truncate text-xs" title={reference.file.name}>{reference.file.name} · {(reference.file.size / 1024).toFixed(0)} KiB</p>
                      <Button type="button" variant="ghost" size="sm" aria-label={`ลบภาพ ${reference.file.name}`} onClick={() => { setVisualReferences(current => current.filter(item => item.id !== reference.id)); setPreparation(null); }}>ลบภาพ</Button>
                      <input aria-label={`Page hint ${index + 1}`} value={reference.pageHint} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, pageHint: event.target.value } : item)); setPreparation(null); }} placeholder="หน้า / route เช่น /dashboard" className="rounded border px-2 py-1 text-xs" />
                      <select aria-label={`State hint ${index + 1}`} value={reference.stateHint} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, stateHint: event.target.value as ImageReferenceDraft["stateHint"] } : item)); setPreparation(null); }} className="rounded border bg-background px-2 py-1 text-xs">
                        {["default", "hover", "modal", "validation", "loading", "empty", "success", "error"].map(state => <option key={state} value={state}>{state}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input aria-label={`Viewport width ${index + 1}`} inputMode="numeric" value={reference.viewportWidth} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, viewportWidth: event.target.value.replace(/\D/g, "").slice(0, 4) } : item)); setPreparation(null); }} placeholder="width" className="w-1/2 rounded border px-2 py-1 text-xs" />
                        <input aria-label={`Viewport height ${index + 1}`} inputMode="numeric" value={reference.viewportHeight} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, viewportHeight: event.target.value.replace(/\D/g, "").slice(0, 4) } : item)); setPreparation(null); }} placeholder="height" className="w-1/2 rounded border px-2 py-1 text-xs" />
                      </div>
                      <select aria-label={`Reference rights ${index + 1}`} value={reference.rights} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, rights: event.target.value as ImageReferenceDraft["rights"], assetReuseAllowed: false } : item)); setPreparation(null); }} className="rounded border bg-background px-2 py-1 text-xs">
                        <option value="unknown">ยังไม่ระบุสิทธิ์</option><option value="user_owned">ฉันเป็นเจ้าของ</option><option value="authorized">ได้รับอนุญาต</option><option value="third_party_inspiration">แรงบันดาลใจจากบุคคลที่สาม</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={reference.assetReuseAllowed} disabled={reference.rights !== "user_owned" && reference.rights !== "authorized"} onChange={event => { setVisualReferences(current => current.map(item => item.id === reference.id ? { ...item, assetReuseAllowed: event.target.checked } : item)); setPreparation(null); }} />อนุญาตให้นำ asset ในภาพไปใช้ซ้ำ</label>
                    </div>
                  ))}
                  <label className="block text-xs">Similarity <select value={similarityMode} onChange={event => { setSimilarityMode(event.target.value as typeof similarityMode); setPreparation(null); }} className="ml-2 rounded border bg-background px-2 py-1"><option value="inspired">inspired</option><option value="close">close</option><option value="high_fidelity" disabled={visualReferences.some(reference => !["user_owned", "authorized"].includes(reference.rights))}>high fidelity</option></select></label>
                  <div className="flex flex-wrap gap-3 text-xs">Responsive targets: {(["mobile", "tablet", "desktop"] as const).map(device => <label key={device} className="flex items-center gap-1"><input type="checkbox" checked={targetDevices.includes(device)} onChange={event => { setTargetDevices(current => event.target.checked ? [...current, device] : current.filter(item => item !== device)); setPreparation(null); }} />{device}</label>)}</div>
                  <Textarea aria-label="Design notes" value={designNotes} onChange={event => { setDesignNotes(event.target.value); setPreparation(null); }} placeholder="Design notes (optional)" maxLength={4000} className="min-h-14 text-xs" />
                  <p className="text-xs text-[var(--color-text-secondary)]">ภาพถูกส่งเป็นไฟล์ Runner input แบบ tenant-bound; เนื้อหาเป็นหลักฐานภาพที่ไม่น่าเชื่อถือและไม่ใช่คำสั่ง. จำกัดตาม Runner ปัจจุบัน: 6 ภาพ, ภาพละ 1 MiB, รวมสูงสุด 1.5 MiB</p>
                </fieldset> : null}
            </>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={mode === "spec_set"} onChange={() => { setMode("spec_set"); setRequestKind("development"); setSpecSource(isAdmin ? "catalog" : "upload"); setPreparation(null); }} />
              พัฒนาตาม Spec file
            </label>
            {mode === "spec_set" ? (
              <>
                <fieldset className="space-y-2 rounded-md border border-[var(--color-border)] p-2" aria-label="Spec source">
                  <legend className="px-1 text-xs font-medium">เลือกแหล่ง Spec</legend>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="spec224-source" checked={effectiveSpecSource === "upload"} onChange={() => setSpecSource("upload")} />
                    อัปโหลด Spec files
                  </label>
                  {isAdmin && !simpleMode ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="radio" name="spec224-source" checked={effectiveSpecSource === "catalog"} onChange={() => setSpecSource("catalog")} />
                      เลือก Feature Spec จากระบบ (specs/feature)
                    </label>
                  ) : null}
                  {effectiveSpecSource === "upload" ? (
                    <>
                      <input ref={fileInput} className="sr-only" type="file" multiple accept=".md,.json,.zip" aria-label="แนบไฟล์ Spec 224" onChange={event => { selectSpecFiles(event.target.files); event.currentTarget.value = ""; }} />
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
                          เลือกไฟล์ Spec / JSON
                        </Button>
                        <p className="text-xs text-[var(--color-text-secondary)]">เลือกได้หลายไฟล์ .md, .json หรือ .zip · สูงสุด 64 ไฟล์และ 2 MiB ต่อชุด</p>
                      </div>
                      {pendingSpecFiles.length ? (
                        <section className="space-y-2 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="ไฟล์ Spec ที่รอบันทึก">
                          <p className="text-xs font-medium">ไฟล์ที่เลือก {pendingSpecFiles.length} ไฟล์ · {(pendingSpecFiles.reduce((sum, file) => sum + file.size, 0) / 1024).toFixed(0)} KiB</p>
                          <ul className="space-y-1 text-xs">
                            {pendingSpecFiles.map((file, index) => (
                              <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
                                <Button type="button" variant="ghost" size="sm" aria-label={`ลบไฟล์ ${file.name}`} disabled={uploading} onClick={() => setPendingSpecFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>ลบ</Button>
                              </li>
                            ))}
                          </ul>
                          {!boundWorkspace ? (
                            <p className="text-amber-800" role="status">เลือก Runner workspace ด้านบนก่อน แล้วจึงบันทึกไฟล์ Spec เข้า workspace ได้ ไฟล์ที่เลือกจะยังคงอยู่</p>
                          ) : null}
                          <Button type="button" disabled={!boundWorkspace || uploading} onClick={() => void saveSpecFiles()}>
                            {uploading ? "กำลังบันทึกไฟล์…" : "บันทึกไฟล์ Spec เข้า workspace"}
                          </Button>
                        </section>
                      ) : null}
                      <p className="text-xs text-[var(--color-text-secondary)]">ภาพ mock-up แนบแยกในส่วน Design References ด้านบน ระบบจะส่งให้ Runner เป็นภาพอ้างอิง ไม่ปะปนกับไฟล์ Spec</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">ไฟล์ .md เดี่ยวประกาศ work package ได้ด้วย code fence `spec224-work-packages` ที่มี JSON `spec224.workPackages`; ถ้าไม่ประกาศ ระบบจะแสดง requirement แต่ยังไม่ให้เริ่ม package นั้น</p>
                    </>
                  ) : isAdmin ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium" htmlFor="feature-spec-search">ค้นหา Spec ในระบบ</label>
                      <input
                        id="feature-spec-search"
                        type="search"
                        value={featureSpecSearch}
                        onChange={event => setFeatureSpecSearch(event.target.value)}
                        placeholder="ค้นหาชื่อหรือรหัส Feature Spec"
                        className="w-full rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm"
                      />
                      <label className="block text-xs font-medium" htmlFor="feature-spec-select">เลือกไฟล์ spec.md</label>
                      <select
                        id="feature-spec-select"
                        value={selectedFeatureSpec}
                        onChange={event => setSelectedFeatureSpec(event.target.value)}
                        disabled={featureSpecsQuery.isLoading || !featureSpecsQuery.data?.specs.length}
                        className="w-full rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm"
                      >
                        <option value="">เลือก Feature Spec</option>
                        {featureSpecsQuery.data?.specs.map(spec => (
                          <option key={spec.id} value={spec.id}>{spec.title} · {spec.id}</option>
                        ))}
                      </select>
                      {featureSpecsQuery.isLoading ? <p role="status" className="text-xs text-[var(--color-text-secondary)]">กำลังโหลด Feature Specs…</p> : null}
                      {featureSpecsQuery.error ? <p role="alert" className="text-xs text-rose-700">โหลดรายการ Spec ไม่สำเร็จ: {sanitizePlatformDiagnostic(featureSpecsQuery.error.message)}</p> : null}
                      {selectedFeatureSpec ? <p className="break-all text-xs text-[var(--color-text-secondary)]">ต้นฉบับ: specs/feature/{selectedFeatureSpec}/spec.md</p> : null}
                      <Button type="button" variant="outline" disabled={!workspaceQuery.data?.workspace || !selectedFeatureSpec || uploading || ingestFeatureSpecMutation.isPending} onClick={() => void ingestSelectedFeatureSpec()}>
                        {uploading ? "กำลังเพิ่ม Spec ใน workspace…" : "เพิ่ม Spec ที่เลือกใน workspace"}
                      </Button>
                    </div>
                  ) : null}
                </fieldset>
              </>
            ) : null}
          </fieldset>

          {specSet && !simpleMode ? (
            <section className="mt-3 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="Spec Set manifest">
              <p className="text-xs font-medium">Revision {specSet.revision} · {specSet.files.length} files · {specSet.requirementCount} parsed requirements</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {specSet.files.map(file => <li key={file.path}>{file.path}</li>)}
              </ul>
            </section>
          ) : null}
          {workspaceQuery.data?.developmentRuns?.length ? (
            <section className="mt-3 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="DevelopmentRun ของ workspace นี้">
              <p className="text-xs font-medium">งานล่าสุดใน workspace นี้</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {workspaceQuery.data.developmentRuns.map(run => (
                  <li key={run.runId}>
                    {simpleMode ? "งานพัฒนา" : run.workPackageExternalId ?? "Prompt"}
                    {!simpleMode && run.specSetRevision ? ` · Spec r${run.specSetRevision}` : ""}
                    {` · ${developmentRunStateLabel(run.state)}${simpleMode ? "" : ` · ${run.runId}`}`}
                    {run.goalApproval?.status === "pending" ? " · รออนุมัติ Goal" : ""}
                    {run.runnerReadiness ? ` · Runner ${run.runnerReadiness.ready ? "พร้อม" : run.runnerReadiness.code}` : ""}
                    {run.budgetStatus?.limitMinorUnits ? ` · งบ Goal USD ${(run.budgetStatus.limitMinorUnits / 100).toFixed(2)}` : ""}
                    {run.intermediateReceipts?.length ? ` · หลักฐาน ${run.intermediateReceipts.length}` : ""}
                    {!(["COMPLETED", "CANCELLED"].includes(run.state)) ? (
                      <Button type="button" variant="outline" size="sm" className="ml-2"
                        disabled={resumeRunMutation.isPending || !boundWorkspace}
                        onClick={() => void resumeExistingRun(run.runId)}>
                        {resumeRunMutation.isPending ? "กำลังตรวจสอบ…" : "ทำงานเดิมต่อ"}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {requestKind === "mini_app" ? (
            <Button type="button" className="mt-3 w-full" disabled={!conversationId || uploading || startMutation.isPending || !prompt.trim()} onClick={() => void startPersonalMiniApp()}>
              {startMutation.isPending ? "กำลังส่ง Mini App ไปสร้าง…" : "สร้าง Mini App จาก prompt"}
            </Button>
          ) : (
            <Button type="button" className="mt-3 w-full" disabled={!workspaceQuery.data?.workspace || uploading || preparing || (mode === "prompt" && !prompt.trim())} onClick={() => void prepare()}>
              {uploading ? "กำลังบันทึก Spec revision…" : preparing ? "กำลังเตรียม…" : "เตรียมแผนและตรวจความพร้อม"}
            </Button>
          )}
          {requestKind === "mini_app" && miniAppPreviewUrl ? (
            <p className="mt-2 text-sm" role="status">
              <a href={miniAppPreviewUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">
                เปิด Mini App preview
              </a>
            </p>
          ) : null}
          {preparation ? (
            <section className="mt-3 rounded-md border border-[var(--color-border)] p-2" aria-live="polite">
              <p className="text-xs font-semibold">ผลการเตรียม{simpleMode ? "" : ` · plan r${preparation.planRevision}`}</p>
              <p className="mt-1 text-xs">ข้อกำหนด {preparation.requirementCount} · work packages ที่พร้อมเริ่ม {preparation.runnableWorkPackageIds.length}</p>
              {runnerReadiness ? (
                <Text role="status" type="supporting">
                  {simpleMode ? (runnerReadiness.ready ? "เครื่องมือพร้อมให้ตรวจสิทธิ์ก่อนเริ่ม" : "เครื่องมือยังไม่พร้อม ตรวจสอบการเชื่อมต่อและสิทธิ์ Runner") : <>Codex: {runnerReadiness.code} · นโยบาย: {runnerReadiness.policyDecision === "pending" ? "รอประเมินตามขอบเขตของ Start" : runnerReadiness.policyDecision}{runnerReadiness.ownerAction ? ` · ${runnerReadiness.ownerAction}` : ""}</>}
                </Text>
              ) : null}
              {preparation.blockers.length ? simpleMode ? <p className="mt-1 text-xs text-amber-800">ยังมีเงื่อนไขที่ต้องตรวจสอบก่อนเริ่มงาน</p> : <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{preparation.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
              {preparation.workPackages.map((workPackage, index) => (
                <section key={workPackage.id} className="mt-2 border-t border-[var(--color-border)] pt-2" aria-label={simpleMode ? `งานส่วนที่ ${index + 1}` : `Work package ${workPackage.externalId}`}>
                  <p className="text-xs font-medium">{simpleMode ? `งานส่วนที่ ${index + 1}` : `${workPackage.externalId} · ${workPackage.readiness}`}</p>
                  {workPackage.blockers.length && !simpleMode ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{workPackage.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
                  {preparation.runnableWorkPackageIds.includes(workPackage.id) ? (
                    <Button type="button" className="mt-2" disabled={startMutation.isPending || !runnerReadiness?.ready || !preparation.runnerReadiness.ready} onClick={() => void startWorkPackage(workPackage.id)}>
                      {startMutation.isPending ? "กำลังส่งคำสั่ง…" : mode === "prompt" || simpleMode ? "สั่งพัฒนา" : `สั่งพัฒนา ${workPackage.externalId}`}
                    </Button>
                  ) : null}
                </section>
              ))}
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Start จะบันทึกขอบเขต Goal และขออนุมัติผ่าน Approval Authority ก่อนส่ง Child แรก จากนั้นระยะถัดไปจะทำงานอัตโนมัติภายใน provider, workspace, source, write scope, budget และเวลาที่อนุมัติไว้</p>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
