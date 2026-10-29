import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { Text as AstryxText } from "@astryxdesign/core/Text";

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
  scope?: string;
  canonicalProjectTitle?: string;
  gitHead?: string | null;
  dirty?: boolean | null;
  dirtyPaths?: string[] | null;
  convergenceState?: string;
  convergenceCanonicalSha?: string | null;
  modelCatalog?: {
    state: "discovered" | "error" | "not_ready";
    adapterId: string;
    cliVersion: string | null;
    observedAt: string;
    expiresAt: string;
    accountProviderFingerprint?: string | null;
    verificationState?: string;
    revision?: string;
    models?: Array<{
      id: string;
      displayName: string;
      reasoningEfforts: string[];
      defaultReasoningEffort?: string | null;
      isDefault: boolean;
    }>;
  } | null;
};

type RunnerOption = {
  runnerId: string;
  displayName: string;
  status: string;
  trustState: string;
  displayState: string;
  lastSeenAt: string | null;
  capabilitySnapshotPersisted: boolean;
  capabilitySnapshotCurrent: boolean;
  capabilityAckState: "applied" | "stale" | "missing";
  readinessStatus: string;
  snapshotRevision: string | null;
  platform?: { os: string; architecture: string; target: string; machineName?: string | null } | null;
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

function harnessLabel(adapterId: string): string {
  const name = adapterId.split(".")[0]?.replace(/[-_]/g, " ") ?? adapterId;
  return name.replace(/\b\w/g, character => character.toUpperCase());
}

export function readinessMessage(code: string, capabilityAckState?: RunnerOption["capabilityAckState"], simpleMode = false): string {
  if (code === "CODEX_TASK_PROBE_EXPIRED" && capabilityAckState !== "applied") {
    return "ผลทดสอบล่าสุดยังไม่ถูกรับรองใน Control Plane; snapshot ที่เห็นยังไม่มีผลทดสอบใหม่ รอ Runner ส่งและรับ ACK";
  }
  if (code === "WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE") {
    return "Runner อ่าน Git revision และ source fingerprint ของ workspace นี้ไม่ได้ ตรวจว่าโฟลเดอร์ที่ลงทะเบียนเป็น Git repository และ Runner เข้าถึงได้ แล้วโหลดรายการใหม่";
  }
  if (code === "RUNNER_READY") return "Codex และ source ของ workspace พร้อมสำหรับตรวจสิทธิ์ก่อนเริ่มงาน";
  const messages: Record<string, string> = {
    CODEX_TASK_PROBE_NOT_RUN: "ยังไม่ได้ทดสอบส่งงานจริงจาก Runner",
    CODEX_TASK_PROBE_FAILED: "การทดสอบส่งงานจริงจาก Runner ไม่ผ่าน",
    CODEX_AUTHENTICATION_REQUIRED: "ต้องเข้าสู่ระบบ Codex บน Runner ก่อน",
    CODEX_NOT_INSTALLED: "ไม่พบ Codex CLI บน Runner",
    CODEX_READINESS_PUBLICATION_REQUIRED: "รอ Runner เผยแพร่ผลตรวจ Codex และรับ ACK ล่าสุด",
    RUNNER_OFFLINE: "Runner ไม่ได้เชื่อมต่ออยู่",
    RUNNER_NOT_TRUSTED: "Runner ยังไม่ได้รับอนุญาต",
    WORKSPACE_BINDING_MISMATCH: "workspace นี้ไม่มีอยู่ใน snapshot ปัจจุบันของ Runner",
    WORKSPACE_SOURCE_REVISION_MISMATCH: "Git revision ของ workspace ไม่ตรงกับ revision ที่งานต้องใช้",
    WORKSPACE_SOURCE_FINGERPRINT_MISMATCH: "source fingerprint ของ workspace เปลี่ยนไปจากตอนตรวจสอบ",
  };
  return messages[code] ?? (simpleMode ? "Runner หรือ workspace ยังไม่พร้อม ตรวจสอบการเชื่อมต่อและโหลดสถานะใหม่" : code);
}

function runnerPlatformLabel(os?: string): string {
  return ({ windows: "Windows", linux: "Linux", macos: "macOS" } as Record<string, string>)[os ?? ""] ?? os ?? "OS ไม่ทราบ";
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
export function Spec224WorkspacePanel({ conversationId, simpleMode = false, onCreateConversation }: {
  conversationId: number | null;
  simpleMode?: boolean;
  onCreateConversation?: (title: string) => Promise<number>;
}) {
  const { user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const fileInput = useRef<HTMLInputElement>(null);
  const mockupInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState("");
  const [selectedRunnerId, setSelectedRunnerId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [writeScopeText, setWriteScopeText] = useState("");
  const [visualReferences, setVisualReferences] = useState<ImageReferenceDraft[]>([]);
  const [similarityMode, setSimilarityMode] = useState<"inspired" | "close" | "high_fidelity">("close");
  const [targetDevices, setTargetDevices] = useState<Array<"mobile" | "tablet" | "desktop">>(["mobile", "desktop"]);
  const [designNotes, setDesignNotes] = useState("");
  const [miniAppPreviewUrl, setMiniAppPreviewUrl] = useState<string | null>(null);
  const [developmentInputMode, setDevelopmentInputMode] = useState<"prompt" | "spec" | "spec_prompt">("prompt");
  const mode = developmentInputMode === "prompt" ? "prompt" : "spec_set";
  const [specSource, setSpecSource] = useState<"upload" | "catalog">("upload");
  const lastPlatformWorkspaceKey = useRef<string | null>(null);
  const creatingTaskInFlight = useRef(false);
  const startInFlight = useRef(false);
  const [featureSpecSearch, setFeatureSpecSearch] = useState("");
  const [selectedFeatureSpec, setSelectedFeatureSpec] = useState("");
  const [pendingSpecFiles, setPendingSpecFiles] = useState<File[]>([]);
  const [requestKind, setRequestKind] = useState<"development" | "mini_app">("development");
  const [budgetCapUsd, setBudgetCapUsd] = useState("1.00");
  const [modelPolicy, setModelPolicy] = useState<"auto" | "explicit">("auto");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
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
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const platformWorkspace = workspaces.find(item => item.scope === "PLATFORM_ENGINEERING");
  const canUseCanonicalSpecs = Boolean(platformWorkspace) || (isAdmin && !simpleMode);
  const effectiveSpecSource = specSource === "catalog" && !canUseCanonicalSpecs ? "upload" : specSource;
  const runnersQuery = trpc.runnerNodes.list.useQuery({ viewMode: "simple" }, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const workspaceQuery = trpc.spec226DevelopmentControl.getConversationWorkspace.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null, refetchInterval: 15_000 }
  );
  const bindMutation = trpc.spec226DevelopmentControl.bindConversationWorkspace.useMutation();
  const ingestMutation = trpc.spec226DevelopmentControl.ingestSpecSet.useMutation();
  const featureSpecsQuery = trpc.spec226DevelopmentControl.listFeatureSpecs.useQuery(
    { search: featureSpecSearch.trim() || undefined },
    { enabled: canUseCanonicalSpecs && mode === "spec_set" && effectiveSpecSource === "catalog" }
  );
  const featureSpecContextQuery = trpc.spec226DevelopmentControl.getFeatureSpecContext.useQuery(
    { specId: selectedFeatureSpec },
    { enabled: canUseCanonicalSpecs && effectiveSpecSource === "catalog" && Boolean(selectedFeatureSpec) }
  );
  const ingestFeatureSpecMutation = trpc.spec226DevelopmentControl.ingestFeatureSpec.useMutation();
  const prepareMutation = trpc.spec226DevelopmentControl.prepareWorkspaceRun.useMutation();
  type Preparation = Awaited<ReturnType<typeof prepareMutation.mutateAsync>>;
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const readinessQuery = trpc.spec226DevelopmentControl.workspaceRunnerReadiness.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null && preparation !== null, refetchInterval: 5_000 }
  );
  const runners: RunnerOption[] = runnersQuery.data?.runners ?? [];
  const runnerWorkspaces = workspaces.filter(item => item.runnerId === selectedRunnerId);
  const boundWorkspace = workspaceQuery.data?.workspace;
  const readinessTarget = runnerWorkspaces.find(item => item.workspaceId === boundWorkspace?.workspaceId && item.runnerId === boundWorkspace?.runnerId)
    ?? runnerWorkspaces.find(item => selectionKey(item) === selected)
    ?? (boundWorkspace ? { runnerId: boundWorkspace.runnerId, workspaceId: boundWorkspace.workspaceId } : null);
  const workspaceReadinessQuery = trpc.runnerNodes.workspaceReadiness.useQuery({
    runnerId: readinessTarget?.runnerId ?? "",
    workspaceId: readinessTarget?.workspaceId ?? "",
  }, {
    enabled: Boolean(readinessTarget),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const runnerReadiness = workspaceReadinessQuery.data ?? readinessQuery.data ?? preparation?.runnerReadiness;
  const startMutation = trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation();
  const resumeRunMutation = trpc.spec226DevelopmentControl.resumeWorkspaceRun.useMutation();
  const selectedWorkspace = runnerWorkspaces.find(item => selectionKey(item) === selected);
  const modelCatalog = selectedWorkspace?.modelCatalog;
  const catalogModels = modelCatalog?.models ?? [];
  const catalogFresh = Boolean(modelCatalog?.state === "discovered"
    && modelCatalog.accountProviderFingerprint
    && modelCatalog.revision
    && Date.parse(modelCatalog.expiresAt) > Date.now()
    && Date.parse(modelCatalog.observedAt) <= Date.now());
  const defaultModel = catalogModels.find(model => model.isDefault);
  const activeModel = modelPolicy === "explicit"
    ? catalogModels.find(model => model.id === selectedModelId)
    : defaultModel;
  const availableEfforts = activeModel?.reasoningEfforts ?? [];
  const supportedEffort = availableEfforts.includes(reasoningEffort)
    ? reasoningEffort
    : activeModel?.defaultReasoningEffort && availableEfforts.includes(activeModel.defaultReasoningEffort)
      ? activeModel.defaultReasoningEffort
      : availableEfforts.includes("medium") ? "medium" : availableEfforts[0] ?? "";
  const selectedRunner = runners.find(runner => runner.runnerId === selectedRunnerId);
  const isPlatformWorkspace = selectedWorkspace?.scope === "PLATFORM_ENGINEERING" || selectionKey(selectedWorkspace ?? { runnerId: "", workspaceId: "" }) === lastPlatformWorkspaceKey.current;
  const platformBindingCurrent = selectedWorkspace?.scope === "PLATFORM_ENGINEERING" && selectionKey(selectedWorkspace) === selectionKey(platformWorkspace ?? selectedWorkspace);
  const platformSourceIsSafe = !isPlatformWorkspace || platformBindingCurrent;
  const specSet = workspaceQuery.data?.specSet;
  const boundKey = boundWorkspace
    ? JSON.stringify([boundWorkspace.runnerId, boundWorkspace.workspaceId])
    : "";
  const boundIsListed = workspaces.some(item => selectionKey(item) === boundKey);
  const effectivePrompt = prompt.trim();
  const proposedWriteScope = [...new Set(writeScopeText.split(/\r?\n/).map(path => path.trim()).filter(Boolean))];
  const canonicalHandoff = effectiveSpecSource === "catalog" ? featureSpecContextQuery.data?.handoff : undefined;
  const nextReadyWorkunit = canonicalHandoff?.status === "CURRENT" ? canonicalHandoff.nextReadyWorkunit : null;
  const isNextReadyPackage = (workPackage: { id: string; externalId: string }) => Boolean(nextReadyWorkunit && (workPackage.id === nextReadyWorkunit || workPackage.externalId === nextReadyWorkunit));
  const canCreateConversation = developmentInputMode === "prompt"
    ? Boolean(effectivePrompt) && (!isPlatformWorkspace || mode !== "prompt" || proposedWriteScope.length > 0)
    : (developmentInputMode !== "spec_prompt" || Boolean(effectivePrompt)) && (effectiveSpecSource === "catalog"
      ? Boolean(selectedFeatureSpec) && (!platformWorkspace || featureSpecContextQuery.data?.handoff.status === "CURRENT")
      : pendingSpecFiles.length > 0);
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
    if (bound) {
      setSelectedRunnerId(bound.runnerId);
      setSelected(JSON.stringify([bound.runnerId, bound.workspaceId]));
    }
  }, [workspaceQuery.data?.workspace?.runnerId, workspaceQuery.data?.workspace?.workspaceId]);
  useEffect(() => {
    setModelPolicy("auto");
    setSelectedModelId("");
    setReasoningEffort("");
  }, [selected]);
  useEffect(() => {
    if (!activeModel) return;
    setReasoningEffort(current => current && activeModel.reasoningEfforts.includes(current)
      ? current
      : activeModel.defaultReasoningEffort && activeModel.reasoningEfforts.includes(activeModel.defaultReasoningEffort)
        ? activeModel.defaultReasoningEffort
        : activeModel.reasoningEfforts.includes("medium") ? "medium" : activeModel.reasoningEfforts[0] ?? "");
  }, [activeModel?.id, modelCatalog?.revision]);
  useEffect(() => {
    if (conversationId !== null || selected || selectedRunnerId || !platformWorkspace) return;
    lastPlatformWorkspaceKey.current = selectionKey(platformWorkspace);
    setSelectedRunnerId(platformWorkspace.runnerId);
    setSelected(selectionKey(platformWorkspace));
    setSpecSource("catalog");
  }, [conversationId, platformWorkspace, selected, selectedRunnerId]);
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

  async function createTaskConversation() {
    if (!onCreateConversation || !selectedWorkspace || !canCreateConversation || creatingTaskInFlight.current) return;
    creatingTaskInFlight.current = true;
    setCreatingTask(true);
    try {
      const titleSource = developmentInputMode === "prompt" ? effectivePrompt : featureSpecsQuery.data?.specs.find(spec => spec.id === selectedFeatureSpec)?.title ?? "งานพัฒนาจาก Spec";
      const title = titleSource.replace(/\s+/g, " ").slice(0, 80);
      const nextConversationId = await onCreateConversation(title || "งานพัฒนาใหม่");
      await bindMutation.mutateAsync({
        conversationId: nextConversationId,
        runnerId: selectedWorkspace.runnerId,
        workspaceId: selectedWorkspace.workspaceId,
      });
      await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId: nextConversationId });
      if (mode === "spec_set") {
        if (effectiveSpecSource === "catalog" && selectedFeatureSpec) {
          await ingestFeatureSpecMutation.mutateAsync({ conversationId: nextConversationId, specId: selectedFeatureSpec, idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` });
        } else if (pendingSpecFiles.length) {
          await ingestMutation.mutateAsync({ conversationId: nextConversationId, artifacts: await Promise.all(pendingSpecFiles.map(encodeFile)), idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` });
          setPendingSpecFiles([]);
        }
      }
      const result = await prepareMutation.mutateAsync({ conversationId: nextConversationId, mode, ...(mode === "prompt" ? { prompt, ...(isPlatformWorkspace ? { writeScope: proposedWriteScope } : {}) } : {}), ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}) });
      setPreparation(result);
      const runnable = result.runnableWorkPackageIds.filter(id => {
        const item = result.workPackages?.find(workPackage => workPackage.id === id);
        return item && (effectiveSpecSource !== "catalog" || isNextReadyPackage(item));
      });
      const startablePackage = mode === "prompt" ? "prompt" : runnable.length === 1 ? runnable[0] : null;
      if (startablePackage && (runnerReadiness?.ready ?? result.runnerReadiness.ready) && result.runnerReadiness.ready && catalogFresh && activeModel && supportedEffort && platformSourceIsSafe) {
        await startWorkPackage(startablePackage, nextConversationId, result, globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
      } else {
        toast.success("สร้างงาน ผูก Workspace และเตรียมแผนแล้ว ตรวจ readiness และเลือกขอบเขตก่อนเริ่ม");
      }
    } catch (error) {
      toast.error(presentCustomerError(error, "สร้างงานใหม่ไม่สำเร็จ"));
    } finally {
      creatingTaskInFlight.current = false;
      setCreatingTask(false);
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
        ...(mode === "prompt" ? { prompt, ...(isPlatformWorkspace ? { writeScope: proposedWriteScope } : {}) } : {}),
        ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}),
      });
      setPreparation(result);
    } catch (error) {
      toast.error(presentCustomerError(error, "เตรียมแผนไม่สำเร็จ"));
    } finally {
      setPreparing(false);
    }
  }

  async function startWorkPackage(workPackageId: string, targetConversationId = conversationId, targetPreparation = preparation, stableKey?: string) {
    if (!targetConversationId || !targetPreparation || startInFlight.current) return;
    const packageSourceAdmission = targetPreparation.workPackages?.find(item => item.id === workPackageId)?.sourceAdmission;
    if (!platformSourceIsSafe || (isPlatformWorkspace && !["SAFE_CLEAN", "SAFE_DISJOINT_DIRTY"].includes(packageSourceAdmission?.status ?? "BLOCKED"))) {
      toast.error("ขอบเขตไฟล์ชนกับการเปลี่ยนแปลงเดิม หรือหลักฐาน source/scope ยังไม่ครบ โปรดเลือกขอบเขตที่ปลอดภัยและตรวจผล preflight ก่อนเริ่ม");
      return;
    }
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
    const modelSelection = { policy: modelPolicy, ...(modelPolicy === "explicit" ? { modelId: selectedModelId } : {}), reasoningEffort: supportedEffort };
    if (!(runnerReadiness?.ready ?? targetPreparation.runnerReadiness.ready) || !targetPreparation.runnerReadiness.ready || (requestKind === "development" && (!catalogFresh || !activeModel || !supportedEffort))) {
      toast.error("Runner หรือ Codex model readiness ยังไม่พร้อม จึงยังไม่เริ่มงาน");
      return;
    }
    const key = `${targetConversationId}:${mode}:${targetPreparation.planRevision}:${workPackageId}:${designStartFingerprint}:${JSON.stringify(proposedWriteScope)}:${budgetCapMinorUnits}:${JSON.stringify(modelSelection)}`;
    const idempotencyKey = stableKey ?? startKeys[key] ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setStartKeys(current => ({ ...current, [key]: idempotencyKey }));
    startInFlight.current = true;
    try {
      const result = await startMutation.mutateAsync({
        conversationId: targetConversationId,
        mode,
        factoryMode: requestKind === "mini_app",
        ...(mode === "prompt" ? { prompt: effectivePrompt, ...(isPlatformWorkspace ? { writeScope: proposedWriteScope } : {}) } : {
          // Start the immutable revision shown in this preparation. Another
          // Chat section may append a newer SpecSet while this preview is open.
          specSetRevision: targetPreparation.planRevision,
          workPackageId,
          ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}),
        }),
        budgetCapMinorUnits,
        modelSelection,
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
        await Promise.resolve(trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId: targetConversationId })).catch(() => undefined);
        toast.info(status === "GOAL_APPROVAL_PENDING"
          ? "บันทึก Goal แล้ว รอผู้มีสิทธิ์อนุมัติขอบเขตก่อนเริ่มงาน"
          : status === "GOAL_APPROVAL_REQUEST_RETRY_REQUIRED"
            ? "บันทึกงานไว้แล้ว แต่ส่งคำขออนุมัติไม่สำเร็จ ตรวจรายการงานแล้วลองทำงานเดิมต่อเพื่อ retry"
            : simpleMode ? "บันทึกงานแล้ว แต่ยังรอสิทธิ์หรือความพร้อมก่อนเริ่ม" : `DevelopmentRun ${result.runId} ถูกเก็บไว้ · ${reasons}`);
      }
    } catch (error) {
      await Promise.resolve(trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId: targetConversationId })).catch(() => undefined);
      toast.error(presentCustomerError(error, "สั่งพัฒนาไม่สำเร็จ"));
    } finally {
      startInFlight.current = false;
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
      {platformWorkspace ? (
        <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="SmartAIHub Platform Development">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Platform Engineering</p>
          <h2 id="spec224-workspace-heading" className="mt-1 text-lg font-semibold text-slate-950">พัฒนาระบบ SmartAIHub</h2>
          <p className="mt-1 text-sm text-slate-700">Project: {platformWorkspace.canonicalProjectTitle ?? platformWorkspace.displayName} · Runner: Debian Development Server · Harness: Codex</p>
          <p className="mt-1 text-xs text-slate-600" role="status">Codex readiness: {selectedWorkspace && selectedRunnerId === platformWorkspace.runnerId ? runnerReadiness?.ready ? "พร้อม" : runnerReadiness?.code ?? "กำลังตรวจสอบจาก Runner" : "กำลังตรวจสอบจาก Runner"}</p>
          {selectedWorkspace && !platformSourceIsSafe ? <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">Runner หรือ Project Workspace binding เปลี่ยนไป โปรดโหลดข้อมูลใหม่และยืนยัน binding ปัจจุบันก่อนเริ่ม</p> : null}
        </section>
      ) : null}
      <h3 id="spec224-workspace-heading" className="text-sm font-semibold">{simpleMode ? "พื้นที่งานพัฒนา" : "Spec 224 workspace"}</h3>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
        เลือก Runner ที่ลงทะเบียน แล้วเลือก Project Workspace จาก registry ที่ได้รับอนุญาต การเลือกก่อนสร้างงานเป็นเพียง draft; ระบบจะ bind กับ conversation เมื่อกดสร้างงานใหม่
      </p>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
        ต้องการเริ่มจาก prompt อย่างเดียว? <a className="underline" href="/factory#personal-mini-app">Create a Personal Mini-App</a>
      </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium" htmlFor="spec224-runner-select">1. เลือก Runner</label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={workspacesQuery.isFetching || runnersQuery.isFetching || bindMutation.isPending}
              onClick={() => void Promise.all([workspacesQuery.refetch(), runnersQuery.refetch(), workspaceQuery.refetch()])}
              aria-label="โหลด Runner workspace ใหม่"
            >
              {workspacesQuery.isFetching || runnersQuery.isFetching ? "กำลังโหลด…" : "โหลดรายการใหม่"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            รายการ Runner มาจาก registry ของ tenant และผู้ใช้ปัจจุบัน
          </p>
          <select
            id="spec224-runner-select"
            aria-label="1. เลือก Runner"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm"
            value={selectedRunnerId}
            onChange={event => { setSelectedRunnerId(event.target.value); setSelected(""); setPreparation(null); }}
            disabled={runnersQuery.isLoading || creatingTask}
          >
            <option value="">เลือก Runner</option>
            {runners.map(runner => <option key={runner.runnerId} value={runner.runnerId}>{runner.displayName}</option>)}
          </select>
          {runnersQuery.error ? <p className="mt-2 text-xs text-rose-700" role="alert">โหลด Runner ไม่สำเร็จ โปรดลองใหม่หรือตรวจสอบสิทธิ์</p> : null}
          {selectedRunner ? (() => {
            const heartbeatAt = selectedRunner.lastSeenAt ? Date.parse(selectedRunner.lastSeenAt) : Number.NaN;
            const heartbeatFresh = Number.isFinite(heartbeatAt) && heartbeatAt <= Date.now() && Date.now() - heartbeatAt < 5 * 60_000;
            const online = selectedRunner.readinessStatus === "online" && selectedRunner.trustState === "trusted" && heartbeatFresh;
            return (
              <section className="mt-2 rounded-md bg-[var(--color-background-subtle)] px-3 py-2 text-xs" aria-label="สถานะ Runner ที่เลือก">
                <p className="font-medium">{selectedRunner.displayName} · {runnerPlatformLabel(selectedRunner.platform?.os)}{selectedRunner.platform?.machineName ? ` · ${selectedRunner.platform.machineName}` : " · ยังไม่มีชื่อเครื่องจาก Runner"} · {online ? "ออนไลน์" : selectedRunner.trustState !== "trusted" ? "ยังไม่ trust" : "ออฟไลน์หรือ heartbeat เก่า"}</p>
                <p className="mt-1 text-[var(--color-text-secondary)]">Heartbeat: {heartbeatFresh ? `สด · ${new Date(heartbeatAt).toLocaleString()}` : selectedRunner.lastSeenAt ? `เก่า · ${new Date(heartbeatAt).toLocaleString()}` : "ไม่มีข้อมูล"}</p>
                <p className="mt-1 text-[var(--color-text-secondary)]">Capability ACK: {selectedRunner.capabilityAckState === "applied" && selectedRunner.capabilitySnapshotPersisted && selectedRunner.capabilitySnapshotCurrent ? "applied · snapshot ปัจจุบัน" : selectedRunner.capabilityAckState === "stale" ? "snapshot เก่า ต้องรอ Runner เผยแพร่ใหม่" : "ยังไม่มี ACK/snapshot ที่ยืนยันได้"}</p>
                {!online ? <p className="mt-1 text-amber-800" role="status">เหตุผลที่รอ: {selectedRunner.trustState !== "trusted" ? "RUNNER_NOT_TRUSTED" : selectedRunner.readinessStatus !== "online" ? selectedRunner.readinessStatus : "RUNNER_HEARTBEAT_STALE"}</p> : null}
              </section>
            );
          })() : null}
          <label className="mt-3 block text-xs font-medium" htmlFor="spec224-workspace-select">2. เลือก Project Workspace</label>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">แสดงเฉพาะ workspace ของ Runner ที่เลือกและคืนมาจาก authorized registry</p>
          <select
            id="spec224-workspace-select"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm"
            value={selected}
            onChange={event => void bindWorkspace(event.target.value)}
            disabled={!selectedRunnerId || workspacesQuery.isLoading || bindMutation.isPending || creatingTask}
          >
            <option value="">เลือก Runner workspace</option>
            {conversationId && boundWorkspace?.runnerId === selectedRunnerId && boundWorkspace && !boundIsListed ? (
              <option value={boundKey} key={boundKey}>
                Workspace ที่บันทึกไว้ก่อนหน้า (Runner ยังไม่อยู่ในรายการปัจจุบัน)
              </option>
            ) : null}
            {runnerWorkspaces.map(workspace => (
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
          {!conversationId ? (
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              เลือก workspace ที่ลงทะเบียนแล้ว จากนั้นร่างงานและกด “สร้างงานใหม่” เพื่อสร้าง conversation และผูก workspace
            </p>
          ) : null}
          {selectedRunnerId && runnerWorkspaces.length === 0 && !workspacesQuery.isLoading ? (
            <section className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              <p className="font-medium">ยังไม่มี project workspace ที่เว็บใช้ได้</p>
              <p className="mt-1">รายการจะแสดงเมื่อ Runner ที่ได้รับอนุญาตรายงาน workspace แล้ว ตรวจสอบการเชื่อมต่อและสิทธิ์ Runner จากนั้นกด “โหลดรายการใหม่”</p>
            </section>
          ) : null}
          {selectedWorkspace ? (
            <section className="mt-2 rounded-md border border-[var(--color-border)] p-2 text-xs" aria-label="Codex execution readiness">
              <p className="font-medium">Codex readiness</p>
              {workspaceReadinessQuery.isLoading ? <p role="status">กำลังตรวจสอบ readiness จาก Runner registry…</p> : null}
              {workspaceReadinessQuery.error ? <p role="alert">ตรวจสอบ readiness ไม่สำเร็จ โปรดลองโหลดรายการใหม่</p> : null}
              {!workspaceReadinessQuery.isLoading && !workspaceReadinessQuery.error && runnerReadiness ? (
                <p role="status">{runnerReadiness.ready ? "พร้อม" : `รอ · ${readinessMessage(runnerReadiness.code, runners.find(item => item.runnerId === readinessTarget?.runnerId)?.capabilityAckState, simpleMode)}`}{!runnerReadiness.ready && !simpleMode ? ` · ${runnerReadiness.code}` : ""}{runnerReadiness.ownerAction ? ` · ${runnerReadiness.ownerAction}` : ""}</p>
              ) : null}
            </section>
          ) : null}

          {selectedWorkspace && requestKind === "development" ? (
            <Section variant="transparent" padding={3} aria-labelledby="spec224-model-selection-heading">
              <VStack gap={3}>
                <HStack gap={3} justify="between" align="center" wrap="wrap">
                  <VStack gap={1}>
                    <Heading id="spec224-model-selection-heading" level={4}>ตัวเลือก AI สำหรับงานพัฒนา</Heading>
                    <AstryxText type="supporting">รายการรุ่นและระดับ reasoning โหลดจาก catalog ของ Runner ที่เลือก</AstryxText>
                  </VStack>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={workspacesQuery.isFetching}
                  onClick={() => void workspacesQuery.refetch()}
                  aria-label="ตรวจสอบ Model ล่าสุด"
                >
                  {workspacesQuery.isFetching ? "กำลังตรวจสอบ…" : "↻ รายละเอียด"}
                </Button>
                </HStack>
                <Selector
                  label="Harness"
                  value={modelCatalog?.adapterId ?? ""}
                  options={modelCatalog?.adapterId
                    ? [{ value: modelCatalog.adapterId, label: harnessLabel(modelCatalog.adapterId) }]
                    : []}
                  placeholder="ยังไม่มี catalog จาก Runner"
                  isDisabled={!catalogFresh || workspacesQuery.isFetching}
                  disabledMessage="รอ catalog ล่าสุดจาก Runner ก่อนเลือก Harness"
                  emptyText="ยังไม่มี Harness ที่รายงานจาก Runner"
                  width="100%"
                />
                <Selector
                  label="AI Model"
                  value={modelPolicy === "auto" ? "auto" : selectedModelId}
                  options={[
                    { value: "auto", label: defaultModel ? `Auto · ${defaultModel.displayName}` : "Auto — ใช้รุ่นเริ่มต้นจาก Runner" },
                    ...catalogModels.map(model => ({ value: model.id, label: `${model.displayName}${model.isDefault ? " · Default" : ""}` })),
                  ]}
                  onChange={value => {
                      if (value === "auto") {
                        setModelPolicy("auto");
                        setSelectedModelId("");
                      } else {
                        setModelPolicy("explicit");
                        setSelectedModelId(value);
                      }
                  }}
                  disabledMessage="รอ Model catalog ล่าสุดจาก Runner ก่อนเลือกรุ่น"
                  emptyText="Runner ยังไม่รายงานรุ่น AI"
                  isDisabled={!catalogFresh || catalogModels.length === 0 || workspacesQuery.isFetching}
                  width="100%"
                />
              {!simpleMode ? (
                <RadioList
                  label="Reasoning Effort"
                  value={supportedEffort}
                  onChange={setReasoningEffort}
                  orientation="horizontal"
                  isDisabled={!catalogFresh || availableEfforts.length === 0}
                  description={availableEfforts.length ? "ระบบจะแสดงระดับที่รุ่นนี้รองรับเท่านั้น" : "รุ่นที่เลือกไม่ได้ประกาศระดับ reasoning"}
                  htmlName="spec224-reasoning-effort"
                >
                  {availableEfforts.map(effort => (
                    <RadioListItem key={effort} value={effort} label={effort.replace(/[-_]/g, " ").replace(/\b\w/g, character => character.toUpperCase())} />
                  ))}
                </RadioList>
              ) : null}
              {!catalogFresh ? (
                <AstryxText type="supporting" as="p" role="status">
                  {workspacesQuery.isFetching ? "กำลังโหลด Model catalog จาก Runner…" : modelCatalog?.state === "error" ? "Runner รายงานข้อผิดพลาดระหว่างค้นหา Model โปรดลองตรวจสอบใหม่" : "ยังไม่มี Model catalog ที่ยืนยันขอบเขตบัญชีและความใหม่จาก Runner โปรดตรวจสอบอีกครั้ง"}
                </AstryxText>
              ) : (
                <AstryxText type="supporting" as="p" role="status">
                  {modelCatalog?.cliVersion ? `CLI ${modelCatalog.cliVersion} · ` : ""}อัปเดต {new Date(modelCatalog!.observedAt).toLocaleString()} · สถานะตรวจสอบ {modelCatalog?.verificationState ?? "discovery เท่านั้น ยังไม่ยืนยัน entitlement"}
                </AstryxText>
              )}
              {modelPolicy === "explicit" && !activeModel ? <AstryxText type="supporting" as="p" role="alert">รุ่นที่เลือกไม่อยู่ใน catalog ปัจจุบัน จึงยังเริ่มงานด้วยรุ่นนี้ไม่ได้ โปรดเลือก Auto หรือรุ่นที่ Runner รายงาน</AstryxText> : null}
              {workspacesQuery.error ? <AstryxText type="supporting" as="p" role="alert">โหลด Model catalog ไม่สำเร็จ โปรดลองตรวจสอบใหม่</AstryxText> : null}
              </VStack>
            </Section>
          ) : null}

          <fieldset className="mt-3 space-y-2" disabled={uploading}>
            <legend className="text-xs font-medium">สิ่งที่ต้องการทำ</legend>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={developmentInputMode === "prompt"} onChange={() => { setDevelopmentInputMode("prompt"); setPreparation(null); }} />
              Prompt
            </label>
            {mode === "prompt" ? (
              <div className="flex flex-wrap gap-3 rounded-md bg-[var(--color-background-subtle)] p-2 text-xs">
                <span className="font-medium">ประเภทงาน</span>
                <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "development"} onChange={() => { setRequestKind("development"); setPreparation(null); }} />พัฒนาตาม prompt</label>
                <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "mini_app"} onChange={() => { setRequestKind("mini_app"); setDevelopmentInputMode("prompt"); setPreparation(null); }} />สร้าง Mini App</label>
              </div>
            ) : null}
            <>
          {mode === "prompt" ? <Textarea id="spec224-development-inputs" aria-label={requestKind === "mini_app" ? "Mini App requirements" : "Spec 224 prompt"} value={prompt} onChange={event => { setPrompt(event.target.value); setPreparation(null); }} placeholder={requestKind === "mini_app" ? "อธิบายหน้าจอ ข้อมูล และพฤติกรรมของ Mini App ที่ต้องการ" : "อธิบายงานพัฒนาที่ต้องการ โดยจำกัดตาม Workspace และสิทธิ์ Goal ที่ได้รับอนุมัติ"} maxLength={requestKind === "mini_app" ? 3600 : 4000} className="min-h-20 resize-y text-sm" /> : null}
              {isPlatformWorkspace && mode === "prompt" && requestKind === "development" ? (
                <section className="mt-3" aria-label="ขอบเขตการแก้ไข">
                  <label className="block text-xs font-medium" htmlFor="spec224-write-scope">ขอบเขตไฟล์ที่อนุญาต</label>
                  <Textarea id="spec224-write-scope" aria-label="ขอบเขตไฟล์ที่อนุญาต" value={writeScopeText} onChange={event => { setWriteScopeText(event.target.value); setPreparation(null); }} placeholder="ระบุ path หรือ glob ที่อนุญาต หนึ่งรายการต่อบรรทัด" className="mt-1 min-h-16 resize-y text-sm" />
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">ระบุเฉพาะไฟล์ที่งานนี้แก้ได้ ขอบเขตว่างหรือกว้างเกินไปจะเริ่มไม่ได้</p>
                </section>
              ) : null}
              {isPlatformWorkspace && mode === "prompt" && requestKind === "development" && simpleMode ? <p className="text-xs text-muted-foreground">งานพัฒนา Platform ต้องระบุขอบเขตไฟล์ที่แน่นอน โปรดเปลี่ยนเป็น Developer view เพื่อกำหนด scope ก่อนเตรียมงาน</p> : null}
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
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="spec224-mode" checked={developmentInputMode === "spec"} onChange={() => { setDevelopmentInputMode("spec"); setRequestKind("development"); setSpecSource(canUseCanonicalSpecs ? "catalog" : "upload"); setPreparation(null); }} />Canonical SPEC</label>
            <label className="flex items-center gap-2 text-xs"><input type="radio" name="spec224-mode" checked={developmentInputMode === "spec_prompt"} onChange={() => { setDevelopmentInputMode("spec_prompt"); setRequestKind("development"); setSpecSource(canUseCanonicalSpecs ? "catalog" : "upload"); setPreparation(null); }} />SPEC + Prompt</label>
            {mode === "spec_set" ? (
              <>
                {developmentInputMode === "spec_prompt" ? <Textarea aria-label="คำสั่งเพิ่มเติมสำหรับ SPEC" value={prompt} onChange={event => { setPrompt(event.target.value); setPreparation(null); }} placeholder="คำสั่งเพิ่มเติมภายใต้ขอบเขตและ write scope ของ SPEC" maxLength={4_000} className="min-h-20 resize-y text-sm" /> : null}
                <fieldset className="space-y-2 rounded-md border border-[var(--color-border)] p-2" aria-label="Spec source">
                  <legend className="px-1 text-xs font-medium">เลือกแหล่ง Spec</legend>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="spec224-source" checked={effectiveSpecSource === "upload"} onChange={() => setSpecSource("upload")} />
                    อัปโหลด Spec files
                  </label>
                  {canUseCanonicalSpecs ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="radio" name="spec224-source" checked={effectiveSpecSource === "catalog"} onChange={() => setSpecSource("catalog")} />
                      เลือก Canonical SPEC จากระบบ
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
                  ) : canUseCanonicalSpecs ? (
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
                      {selectedFeatureSpec && featureSpecContextQuery.data ? <section className="rounded-md bg-[var(--color-background-subtle)] p-2 text-xs" aria-label="Canonical SPEC work context">
                        <p className="font-medium">{featureSpecContextQuery.data.title}</p><p>{featureSpecContextQuery.data.summary}</p>
                        {featureSpecContextQuery.data.handoff.status === "CURRENT" ? <><p className="mt-1">Next WorkUnit: {featureSpecContextQuery.data.handoff.nextReadyWorkunit ?? "ยังไม่กำหนด"}</p><p>{featureSpecContextQuery.data.handoff.nextAction ?? featureSpecContextQuery.data.handoff.resumePoint}</p>{featureSpecContextQuery.data.handoff.openRequirements.map(item => <p key={item.id}>{item.id}: {item.text}{item.nextAction ? ` · ${item.nextAction}` : ""}</p>)}</> : <p role="alert">handoff {featureSpecContextQuery.data.handoff.status}: {featureSpecContextQuery.data.handoff.nextAction}</p>}
                        {!simpleMode ? <p className="mt-1 break-all">{featureSpecContextQuery.data.path} · SHA-256 {featureSpecContextQuery.data.digest}</p> : null}
                      </section> : null}
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
          {!conversationId && requestKind === "development" ? (
            <Button
              type="button"
              className="mt-3 w-full"
              disabled={!onCreateConversation || !selectedWorkspace || !canCreateConversation || creatingTask || bindMutation.isPending}
              onClick={() => void createTaskConversation()}
            >
              {creatingTask ? "กำลังเตรียมและเริ่มงาน…" : "เริ่มพัฒนา"}
            </Button>
          ) : null}
          {requestKind === "mini_app" ? (
            <Button type="button" className="mt-3 w-full" disabled={!conversationId || uploading || startMutation.isPending || !prompt.trim()} onClick={() => void startPersonalMiniApp()}>
              {startMutation.isPending ? "กำลังส่ง Mini App ไปสร้าง…" : "สร้าง Mini App จาก prompt"}
            </Button>
          ) : (
            <Button type="button" className="mt-3 w-full" disabled={!workspaceQuery.data?.workspace || uploading || preparing || (mode === "prompt" && !prompt.trim()) || (developmentInputMode !== "prompt" && effectiveSpecSource === "catalog" && featureSpecContextQuery.data?.handoff.status !== "CURRENT")} onClick={() => void prepare()}>
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
              {effectiveSpecSource === "catalog" && canonicalHandoff?.status === "CURRENT" && preparation.runnableWorkPackageIds.length > 0 && !(preparation.workPackages ?? []).some(item => preparation.runnableWorkPackageIds.includes(item.id) && isNextReadyPackage(item)) ? <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950" role="alert">handoff ระบุ next WorkUnit เป็น “{nextReadyWorkunit ?? "ยังไม่กำหนด"}” แต่ไม่มี runnable package ที่ตรงกัน จึงปิดการเริ่มงานเพื่อป้องกันการทำ WorkUnit เก่าซ้ำ โปรด reconcile handoff ผ่าน writer กลางหรือเตรียม package ที่ตรงกัน</p> : null}
              {(preparation.workPackages ?? []).map((workPackage, index) => (
                <section key={workPackage.id} className="mt-2 border-t border-[var(--color-border)] pt-2" aria-label={simpleMode ? `งานส่วนที่ ${index + 1}` : `Work package ${workPackage.externalId}`}>
                  <p className="text-xs font-medium">{simpleMode ? `งานส่วนที่ ${index + 1}` : `${workPackage.externalId} · ${workPackage.readiness}`}</p>
                  {workPackage.blockers.length && !simpleMode ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{workPackage.blockers.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
                  {workPackage.sourceAdmission?.status === "BLOCKED" ? <p className="mt-1 text-xs text-amber-800" role="status">{simpleMode ? "ขอบเขตงานยังทับกับไฟล์ที่เปลี่ยนอยู่ หรือข้อมูล source ยังไม่ครบ" : `Source preflight: ${workPackage.sourceAdmission.code}${workPackage.sourceAdmission.conflictingPaths?.length ? ` · ชนกับ ${workPackage.sourceAdmission.conflictingPaths.join(", ")}` : ""}`}</p> : null}
                  {workPackage.sourceAdmission?.status === "SAFE_DISJOINT_DIRTY" ? <p className="mt-1 text-xs text-emerald-800" role="status">{simpleMode ? "ไฟล์ที่เปลี่ยนอยู่แยกจากขอบเขตงานนี้" : `Source preflight: ขอบเขตไม่ชนไฟล์ที่เปลี่ยนอยู่ · ${workPackage.sourceAdmission.snapshotRevision}`}</p> : null}
                  {preparation.runnableWorkPackageIds.includes(workPackage.id) && (effectiveSpecSource !== "catalog" || isNextReadyPackage(workPackage)) ? (
                    <Button type="button" className="mt-2" disabled={startMutation.isPending || !runnerReadiness?.ready || !preparation.runnerReadiness.ready || (requestKind === "development" && (!catalogFresh || !activeModel || !supportedEffort)) || !platformSourceIsSafe || (isPlatformWorkspace && !["SAFE_CLEAN", "SAFE_DISJOINT_DIRTY"].includes(workPackage.sourceAdmission?.status ?? "BLOCKED"))} onClick={() => void startWorkPackage(workPackage.id)}>
                      {startMutation.isPending ? "กำลังส่งคำสั่ง…" : mode === "prompt" || simpleMode ? "สั่งพัฒนา" : `สั่งพัฒนา ${workPackage.externalId}`}
                    </Button>
                  ) : null}
                </section>
              ))}
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Start จะบันทึกขอบเขต Goal และขออนุมัติผ่าน Approval Authority ก่อนส่ง Child แรก จากนั้นระยะถัดไปจะทำงานอัตโนมัติภายใน provider, workspace, source, write scope, budget และเวลาที่อนุมัติไว้</p>
            </section>
          ) : null}
    </section>
  );
}
