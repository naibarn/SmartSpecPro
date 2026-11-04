import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { VStack } from "@astryxdesign/core/VStack";
import { Text as AstryxText } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Link as AstryxLink } from "@astryxdesign/core/Link";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { presentCustomerError, sanitizePlatformDiagnostic } from "@shared/projectIdentityPresentation";
import { Text } from "@/components/AppPage";
import { Link as RouterLink } from "wouter";
import { Spec224EconomicLedgerSetup } from "./Spec224EconomicLedgerSetup";

type WorkspaceModelCatalog = {
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
};

type WorkspaceOption = {
  runnerId: string;
  workspaceId: string;
  displayName: string;
  status: string;
  snapshotRevision: string;
  scope?: string;
  canonicalProjectTitle?: string;
  deploymentTarget?: {
    id: string;
    domain: string;
    environment: string;
    application: string;
    status: string | null;
    deployable: boolean;
    applicationAvailable: boolean;
    workspaceLabel: string;
  } | null;
  gitHead?: string | null;
  contentFingerprint?: string | null;
  dirty?: boolean | null;
  dirtyPaths?: string[] | null;
  convergenceState?: string;
  convergenceCanonicalSha?: string | null;
  modelCatalog?: WorkspaceModelCatalog | null;
  modelCatalogs?: WorkspaceModelCatalog[];
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

type Spec224TaskDraft = {
  prompt: string;
  workspaceAccessMode: "workspace" | "exclude_risky";
  developmentInputMode: "prompt" | "spec" | "spec_prompt";
  requestKind: "development" | "mini_app";
  selectedRunnerId: string;
  selectedWorkspace: string;
  budgetCapUsd: string;
  harnessPolicy: "auto" | "explicit";
  selectedHarnessAdapterId: string;
  modelPolicy: "auto" | "explicit";
  selectedModelId: string;
  reasoningEffort: string;
  selectedFeatureSpec: string;
};

type Spec224TaskPreferences = Pick<Spec224TaskDraft,
  "selectedRunnerId" | "selectedWorkspace" | "harnessPolicy" | "selectedHarnessAdapterId" | "modelPolicy" | "selectedModelId" | "reasoningEffort"
> & Pick<Spec224TaskDraft, "developmentInputMode"> & { selectedFeatureSpec?: string };

const FIRST_RUN_PILOT_SCOPE = ["apps/runner-app/tests/spec224-live-pilot/**"];
const FIRST_RUN_PILOT_PROMPT = [
  "Run the bounded SmartAIHub first-run autonomous development pilot in two receipt-bound phases.",
  "Child 1: inside the authorized write scope only, create a small dependency-free JavaScript utility and focused unit tests. Run the tests and report changed files and actual test output.",
  "Child 2: after Child 1 has a persisted successful execution receipt, independently review and improve that utility, add edge-case tests, and run the complete pilot test suite again.",
  "Do not add dependencies, modify files outside the authorized scope, access secrets, change deployment/infrastructure, or deploy. Preserve the same Goal and DevelopmentRun across both phases. Finish with the existing independent Final Verify and report any blocker honestly.",
].join("\n");

function taskDraftStorageKey(userId: string, tenantId: string | null | undefined, conversationId: number | null, threadId?: string | null): string {
  return `spec224-task-draft:v1:${encodeURIComponent(tenantId ?? "personal")}:${encodeURIComponent(userId)}:${conversationId ?? "new"}:${threadId ?? "main"}`;
}

function taskPreferencesStorageKey(userId: string, tenantId: string | null | undefined): string {
  return `spec224-task-preferences:v1:${encodeURIComponent(tenantId ?? "personal")}:${encodeURIComponent(userId)}`;
}

function readTaskPreferences(key: string): Partial<Spec224TaskPreferences> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const preferences = value as Record<string, unknown>;
    return {
      ...(typeof preferences.selectedRunnerId === "string" ? { selectedRunnerId: preferences.selectedRunnerId.slice(0, 200) } : {}),
      ...(typeof preferences.selectedWorkspace === "string" ? { selectedWorkspace: preferences.selectedWorkspace.slice(0, 500) } : {}),
      ...(preferences.harnessPolicy === "auto" || preferences.harnessPolicy === "explicit" ? { harnessPolicy: preferences.harnessPolicy } : {}),
      ...(typeof preferences.selectedHarnessAdapterId === "string" ? { selectedHarnessAdapterId: preferences.selectedHarnessAdapterId.slice(0, 100) } : {}),
      ...(preferences.modelPolicy === "auto" || preferences.modelPolicy === "explicit" ? { modelPolicy: preferences.modelPolicy } : {}),
      ...(typeof preferences.selectedModelId === "string" ? { selectedModelId: preferences.selectedModelId.slice(0, 200) } : {}),
      ...(typeof preferences.reasoningEffort === "string" ? { reasoningEffort: preferences.reasoningEffort.slice(0, 32) } : {}),
      ...(preferences.developmentInputMode === "prompt" || preferences.developmentInputMode === "spec" || preferences.developmentInputMode === "spec_prompt" ? { developmentInputMode: preferences.developmentInputMode } : {}),
      ...(typeof preferences.selectedFeatureSpec === "string" ? { selectedFeatureSpec: preferences.selectedFeatureSpec.slice(0, 160) } : {}),
    };
  } catch {
    return null;
  }
}

function readTaskDraft(key: string): Partial<Spec224TaskDraft> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Record<string, unknown>;
    return {
      ...(typeof draft.prompt === "string" ? { prompt: draft.prompt.slice(0, 4_000) } : {}),
      ...(draft.workspaceAccessMode === "workspace" || draft.workspaceAccessMode === "exclude_risky" ? { workspaceAccessMode: draft.workspaceAccessMode } : {}),
      ...(draft.developmentInputMode === "prompt" || draft.developmentInputMode === "spec" || draft.developmentInputMode === "spec_prompt" ? { developmentInputMode: draft.developmentInputMode } : {}),
      ...(draft.requestKind === "development" || draft.requestKind === "mini_app" ? { requestKind: draft.requestKind } : {}),
      ...(typeof draft.selectedRunnerId === "string" ? { selectedRunnerId: draft.selectedRunnerId.slice(0, 200) } : {}),
      ...(typeof draft.selectedWorkspace === "string" ? { selectedWorkspace: draft.selectedWorkspace.slice(0, 500) } : {}),
      ...(typeof draft.budgetCapUsd === "string" && /^\d{1,6}(?:\.\d{0,2})?$/.test(draft.budgetCapUsd) ? { budgetCapUsd: draft.budgetCapUsd } : {}),
      ...(draft.harnessPolicy === "auto" || draft.harnessPolicy === "explicit" ? { harnessPolicy: draft.harnessPolicy } : {}),
      ...(typeof draft.selectedHarnessAdapterId === "string" ? { selectedHarnessAdapterId: draft.selectedHarnessAdapterId.slice(0, 100) } : {}),
      ...(draft.modelPolicy === "auto" || draft.modelPolicy === "explicit" ? { modelPolicy: draft.modelPolicy } : {}),
      ...(typeof draft.selectedModelId === "string" ? { selectedModelId: draft.selectedModelId.slice(0, 200) } : {}),
      ...(typeof draft.reasoningEffort === "string" ? { reasoningEffort: draft.reasoningEffort.slice(0, 32) } : {}),
      ...(typeof draft.selectedFeatureSpec === "string" ? { selectedFeatureSpec: draft.selectedFeatureSpec.slice(0, 160) } : {}),
    };
  } catch {
    return null;
  }
}

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

function developmentWorkerJobStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    pending: "รอระบบรับงาน",
    queued: "รอ Worker",
    claimed: "Worker รับงานแล้ว",
    preparing: "Worker กำลังเตรียมงาน",
    running: "Worker กำลังทำงาน",
    waiting_external: "รอผลจากบริการภายนอก",
    retry_scheduled: "รอระบบลองใหม่",
    uploading: "กำลังส่งผลลัพธ์",
    publishing: "กำลังบันทึกผลลัพธ์",
    indexing: "กำลังจัดทำดัชนีผลลัพธ์",
    completed: "Worker เสร็จแล้ว",
    succeeded: "Worker เสร็จแล้ว",
    failed: "Worker ล้มเหลว",
    canceled: "Worker ยกเลิกแล้ว",
    cancelled: "Worker ยกเลิกแล้ว",
    expired: "Worker หมดเวลา",
  };
  return status ? labels[status] ?? status : "ยังตรวจสถานะ Worker ไม่ได้";
}

function formatDevelopmentRunDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "เวลาเริ่มไม่พร้อมใช้งาน";
  return new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
}

function formatDevelopmentWaitDuration(milliseconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  if (totalMinutes < 1) return "น้อยกว่า 1 นาที";
  if (totalMinutes < 60) return `${totalMinutes} นาที`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

type WorkspaceWorkPackage = {
  id: string;
  externalId: string;
  dependsOn?: string[];
  sourceSpecIds?: string[];
  prerequisitePlan?: Array<{ id: string; externalId: string; specIds: string[] }>;
};

function canonicalSpecIdLabel(specId: string): string {
  const match = /^(?:SPEC-)?(\d+)(?:-|$)/i.exec(specId);
  return match ? `SPEC-${match[1]}` : specId;
}

function nextPackageInRunOrder(input: {
  target: WorkspaceWorkPackage | undefined;
  workPackages: WorkspaceWorkPackage[];
  completedPackageIds: Set<string>;
}) {
  if (!input.target) return { nextPrerequisite: null as WorkspaceWorkPackage | null, pendingPrerequisites: [] as WorkspaceWorkPackage[] };
  const byId = new Map(input.workPackages.map(workPackage => [workPackage.id, workPackage]));
  const pendingPrerequisites = (input.target.prerequisitePlan ?? [])
    .filter(prerequisite => !input.completedPackageIds.has(prerequisite.id))
    .map(prerequisite => byId.get(prerequisite.id))
    .filter((workPackage): workPackage is WorkspaceWorkPackage => Boolean(workPackage));
  const nextPrerequisite = pendingPrerequisites.find(workPackage =>
    (workPackage.prerequisitePlan ?? []).every(prerequisite => input.completedPackageIds.has(prerequisite.id)),
  ) ?? null;
  return { nextPrerequisite, pendingPrerequisites };
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

export function preparationBlockerMessage(code: string): string {
  const messages: Record<string, string> = {
    WORKSPACE_SOURCE_FINGERPRINT_UNAVAILABLE: "Runner ยังอ่าน Git revision และ source fingerprint ของ Workspace ไม่ได้ ให้เลือก Workspace ที่เป็น Git repository แล้วโหลดรายการใหม่",
    WORKSPACE_SOURCE_ADMISSION_DIRTY_PATHS_UNKNOWN: "Runner ยังยืนยันรายการไฟล์ที่เปลี่ยนใน Workspace ไม่ได้ จึงเริ่มงานอย่างปลอดภัยไม่ได้",
    WORKSPACE_SOURCE_ADMISSION_SCOPE_CONFLICT: "ขอบเขตงานชนกับไฟล์ที่มีการเปลี่ยนแปลงอยู่ ให้ตรวจ diff หรือปรับขอบเขตงานก่อน",
    REQUIREMENTS_REQUIRED: "ยังไม่มีข้อกำหนดสำหรับงาน เลือก Canonical SPEC หรือแนบไฟล์ Spec ก่อนเตรียมแผน",
    NO_RUNNABLE_WORK_PACKAGES: "ยังไม่มี work package ที่พร้อมเริ่ม ตรวจว่าข้อกำหนดระบุขั้นตอนงานที่ทำได้ครบถ้วน",
    PROMPT_WRITE_SCOPE_PREFLIGHT_REQUIRED: "ยังตรวจ write scope ของ prompt ไม่ผ่าน โปรดระบุขอบเขตไฟล์ที่อนุญาตก่อนเริ่ม",
  };
  return messages[code] ?? "ยังเริ่มงานไม่ได้จนกว่าเงื่อนไขความปลอดภัยและความพร้อมจะผ่าน";
}

export function shouldOfferPromptStartAction(
  mode: "prompt" | "spec_set",
  simpleMode: boolean,
  workPackageId: string,
): boolean {
  return simpleMode && mode === "prompt" && workPackageId === "prompt";
}

function runnerPlatformLabel(os?: string): string {
  return ({ windows: "Windows", linux: "Linux", macos: "macOS" } as Record<string, string>)[os ?? ""] ?? os ?? "OS ไม่ทราบ";
}

function runnerOptionLabel(runner: RunnerOption, onlineLabel: string, waitingLabel: string): string {
  const heartbeatAt = runner.lastSeenAt ? Date.parse(runner.lastSeenAt) : Number.NaN;
  const heartbeatFresh = Number.isFinite(heartbeatAt) && heartbeatAt <= Date.now() && Date.now() - heartbeatAt < 5 * 60_000;
  const online = runner.readinessStatus === "online" && runner.trustState === "trusted" && heartbeatFresh;
  return `${runner.displayName} · ${runnerPlatformLabel(runner.platform?.os)} · ${online ? onlineLabel : waitingLabel}`;
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
export function Spec224WorkspacePanel({ conversationId, threadId = null, simpleMode = false, onCreateConversation, requestedHarnessAdapterId = null, freshGoal = false, pilotMode = false, initialPrompt, initialRequestKind = "development", resumeSpecId }: {
  conversationId: number | null;
  threadId?: string | null;
  simpleMode?: boolean;
  onCreateConversation?: (title: string) => Promise<number>;
  requestedHarnessAdapterId?: string | null;
  freshGoal?: boolean;
  pilotMode?: boolean;
  initialPrompt?: string;
  initialRequestKind?: "development" | "mini_app";
  resumeSpecId?: string;
}) {
  const { t } = useScopedTranslation("chat");
  const { user } = useAuth();
  const trpcUtils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const draftKey = user?.id ? taskDraftStorageKey(user.id, user.currentTenantId, conversationId, threadId) : null;
  const preferencesKey = user?.id ? taskPreferencesStorageKey(user.id, user.currentTenantId) : null;
  const draftOwnerKey = user?.id ? `${user.currentTenantId ?? "personal"}:${user.id}` : null;
  const previousDraftOwnerKey = useRef<string | null>(null);
  const restoringTaskDraft = useRef(false);
  const restoredSelection = useRef<string | null>(null);
  const preferencesTouched = useRef(false);
  const [hydratedDraftKey, setHydratedDraftKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mockupInput = useRef<HTMLInputElement>(null);
  const automaticCoreBindingAttempt = useRef<string | null>(null);
  const [selected, setSelected] = useState("");
  const [selectedRunnerId, setSelectedRunnerId] = useState("");
  const [prompt, setPrompt] = useState(pilotMode ? FIRST_RUN_PILOT_PROMPT : initialPrompt ?? "");
  const [workspaceAccessMode, setWorkspaceAccessMode] = useState<"workspace" | "exclude_risky">("exclude_risky");
  const [visualReferences, setVisualReferences] = useState<ImageReferenceDraft[]>([]);
  const [similarityMode, setSimilarityMode] = useState<"inspired" | "close" | "high_fidelity">("close");
  const [targetDevices, setTargetDevices] = useState<Array<"mobile" | "tablet" | "desktop">>(["mobile", "desktop"]);
  const [designNotes, setDesignNotes] = useState("");
  const [miniAppPreviewUrl, setMiniAppPreviewUrl] = useState<string | null>(null);
  const [developmentInputMode, setDevelopmentInputMode] = useState<"prompt" | "spec" | "spec_prompt">(pilotMode ? "prompt" : resumeSpecId ? "spec" : "prompt");
  const mode = developmentInputMode === "prompt" ? "prompt" : "spec_set";
  const [specSource, setSpecSource] = useState<"upload" | "catalog">(pilotMode ? "upload" : resumeSpecId ? "catalog" : "upload");
  const lastPlatformWorkspaceKey = useRef<string | null>(null);
  const creatingTaskInFlight = useRef(false);
  const startInFlight = useRef(false);
  const [featureSpecSearch, setFeatureSpecSearch] = useState("");
  const [selectedFeatureSpec, setSelectedFeatureSpec] = useState("");
  const continuationSpecRestored = useRef(false);
  const continuationResumeAttempt = useRef<string | null>(null);
  const [continuationNotice, setContinuationNotice] = useState<string | null>(null);
  const [pendingSpecFiles, setPendingSpecFiles] = useState<File[]>([]);
  const [requestKind, setRequestKind] = useState<"development" | "mini_app">(pilotMode ? "development" : initialRequestKind);
  const [budgetCapUsd, setBudgetCapUsd] = useState("1.00");
  const [harnessPolicy, setHarnessPolicy] = useState<"auto" | "explicit">("auto");
  const [selectedHarnessAdapterId, setSelectedHarnessAdapterId] = useState("");
  const requestedHarnessApplied = useRef(false);
  const [modelPolicy, setModelPolicy] = useState<"auto" | "explicit">("auto");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [startKeys, setStartKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!resumeSpecId || pilotMode) return;
    setDevelopmentInputMode("spec");
    setRequestKind("development");
    setSpecSource("catalog");
  }, [pilotMode, resumeSpecId]);

  useEffect(() => {
    if (!draftKey) return;
    if (previousDraftOwnerKey.current && previousDraftOwnerKey.current !== draftOwnerKey) {
      setPrompt("");
      setWorkspaceAccessMode("exclude_risky");
      setDevelopmentInputMode("prompt");
      setRequestKind("development");
      setSelectedRunnerId("");
      setSelected("");
      restoredSelection.current = null;
      setBudgetCapUsd("1.00");
      setHarnessPolicy("auto");
      setSelectedHarnessAdapterId("");
      setModelPolicy("auto");
      setSelectedModelId("");
      setReasoningEffort("");
    }
    previousDraftOwnerKey.current = draftOwnerKey;
    const draft = readTaskDraft(draftKey);
    const restoreConversationSelection = conversationId !== null;
    const preferences = readTaskPreferences(preferencesKey ?? "");
    if (pilotMode) {
      setPrompt(FIRST_RUN_PILOT_PROMPT);
      setWorkspaceAccessMode("exclude_risky");
      setDevelopmentInputMode("prompt");
      setRequestKind("development");
      setSelectedRunnerId("");
      setSelected("");
      restoredSelection.current = null;
      restoringTaskDraft.current = false;
      setBudgetCapUsd("1.00");
      setHarnessPolicy("auto");
      setSelectedHarnessAdapterId("");
      setModelPolicy("auto");
      setSelectedModelId("");
      setReasoningEffort("");
      setSelectedFeatureSpec("");
      setPreparation(null);
    } else {
      if (freshGoal) {
        setDevelopmentInputMode("prompt");
        setRequestKind("development");
        setSelectedFeatureSpec("");
        setSpecSource("upload");
        setPreparation(null);
      }
      if (preferences) {
        if (preferences.selectedRunnerId !== undefined) setSelectedRunnerId(preferences.selectedRunnerId);
        if (preferences.selectedWorkspace !== undefined) {
          setSelected(preferences.selectedWorkspace);
          restoredSelection.current = preferences.selectedWorkspace || null;
        }
        if (preferences.harnessPolicy) setHarnessPolicy(preferences.harnessPolicy);
        if (preferences.selectedHarnessAdapterId !== undefined) setSelectedHarnessAdapterId(preferences.selectedHarnessAdapterId);
        if (preferences.modelPolicy) setModelPolicy(preferences.modelPolicy);
        if (preferences.selectedModelId !== undefined) setSelectedModelId(preferences.selectedModelId);
        if (preferences.reasoningEffort !== undefined) setReasoningEffort(preferences.reasoningEffort);
        if (!freshGoal && !resumeSpecId && preferences.developmentInputMode) setDevelopmentInputMode(preferences.developmentInputMode);
        if (!freshGoal && preferences.selectedFeatureSpec) {
          setSelectedFeatureSpec(preferences.selectedFeatureSpec);
          setSpecSource("catalog");
        }
      }
      if (draft) {
        restoringTaskDraft.current = restoreConversationSelection && draft.selectedWorkspace !== undefined;
        if (!freshGoal && draft.prompt !== undefined) setPrompt(draft.prompt);
        if (draft.workspaceAccessMode) setWorkspaceAccessMode(draft.workspaceAccessMode);
        if (!freshGoal && !resumeSpecId && draft.developmentInputMode) setDevelopmentInputMode(draft.developmentInputMode);
        if (!freshGoal && !resumeSpecId && draft.requestKind) setRequestKind(draft.requestKind);
        if (restoreConversationSelection && draft.selectedRunnerId !== undefined) setSelectedRunnerId(draft.selectedRunnerId);
        if (restoreConversationSelection && draft.selectedWorkspace !== undefined) {
          setSelected(draft.selectedWorkspace);
          restoredSelection.current = draft.selectedWorkspace || null;
        }
        if (draft.budgetCapUsd) setBudgetCapUsd(draft.budgetCapUsd);
        if (restoreConversationSelection && draft.harnessPolicy) setHarnessPolicy(draft.harnessPolicy);
        if (restoreConversationSelection && draft.selectedHarnessAdapterId !== undefined) setSelectedHarnessAdapterId(draft.selectedHarnessAdapterId);
        if (restoreConversationSelection && draft.modelPolicy) setModelPolicy(draft.modelPolicy);
        if (restoreConversationSelection && draft.selectedModelId !== undefined) setSelectedModelId(draft.selectedModelId);
        if (restoreConversationSelection && draft.reasoningEffort !== undefined) setReasoningEffort(draft.reasoningEffort);
        if (!freshGoal && restoreConversationSelection && draft.selectedFeatureSpec !== undefined) {
          setSelectedFeatureSpec(draft.selectedFeatureSpec);
          if (draft.selectedFeatureSpec) setSpecSource("catalog");
        }
      }
    }
    setHydratedDraftKey(draftKey);
  }, [draftKey, draftOwnerKey, freshGoal, pilotMode, preferencesKey, resumeSpecId]);

  useEffect(() => {
    if (!draftKey || hydratedDraftKey !== draftKey) return;
    const draft: Spec224TaskDraft = {
      prompt,
      workspaceAccessMode,
      developmentInputMode,
      requestKind,
      selectedRunnerId,
      selectedWorkspace: selected,
      budgetCapUsd,
      harnessPolicy,
      selectedHarnessAdapterId,
      modelPolicy,
      selectedModelId,
      reasoningEffort,
      selectedFeatureSpec,
    };
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage may be disabled or full; the in-memory draft remains usable.
    }
  }, [draftKey, hydratedDraftKey, prompt, workspaceAccessMode, developmentInputMode, requestKind, selectedRunnerId, selected, budgetCapUsd, harnessPolicy, selectedHarnessAdapterId, modelPolicy, selectedModelId, reasoningEffort, selectedFeatureSpec]);

  useEffect(() => {
    if (freshGoal || !preferencesKey || !draftKey || hydratedDraftKey !== draftKey) return;
    if (conversationId !== null && !preferencesTouched.current) return;
    const preferences: Spec224TaskPreferences = {
      selectedRunnerId,
      selectedWorkspace: selected,
      harnessPolicy,
      selectedHarnessAdapterId,
      modelPolicy,
      selectedModelId,
      reasoningEffort,
      developmentInputMode,
      selectedFeatureSpec,
    };
    try {
      window.localStorage.setItem(preferencesKey, JSON.stringify(preferences));
    } catch {
      // Storage may be disabled or full; current selections remain usable.
    }
  }, [freshGoal, preferencesKey, draftKey, hydratedDraftKey, conversationId, selectedRunnerId, selected, harnessPolicy, selectedHarnessAdapterId, modelPolicy, selectedModelId, reasoningEffort, developmentInputMode, selectedFeatureSpec]);

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

  const workspacesQuery = trpc.spec226DevelopmentControl.availableWorkspaces.useQuery({}, {
    // The Runner publishes a fresh capability snapshot every two minutes.
    // Re-read the authorized projection in the foreground so an expired model
    // catalog can recover without a page reload; do not churn background tabs.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const platformBindingCandidatesQuery = trpc.spec226DevelopmentControl.listPlatformWorkspaceBindingCandidates.useQuery(undefined, {
    enabled: isAdmin && Boolean(selectedRunnerId),
    refetchOnWindowFocus: true,
    retry: false,
  });
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const platformWorkspaces = workspaces.filter(item => item.scope === "PLATFORM_ENGINEERING");
  const platformWorkspace = platformWorkspaces.find(item => selectionKey(item) === selected) ?? platformWorkspaces[0];
  // Canonical SmartAIHub specs are read from the platform source authority and
  // must execute in that same registered workspace, never an arbitrary chat binding.
  const canUseCanonicalSpecs = Boolean(platformWorkspace);
  const effectiveSpecSource = specSource === "catalog" && !canUseCanonicalSpecs ? "upload" : specSource;
  const runnersQuery = trpc.runnerNodes.list.useQuery({ viewMode: "simple" }, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const workspaceQuery = trpc.spec226DevelopmentControl.getConversationWorkspace.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null, refetchInterval: 15_000 }
  );
  const pendingPilotApprovalRefs = (workspaceQuery.data?.developmentRuns ?? [])
    .filter(run => run.isFirstRunPilot && run.goalApproval?.status === "pending")
    .map(run => run.goalApproval?.approvalRef)
    .filter((value): value is string => Boolean(value));
  const pilotApprovalsQuery = trpc.approvals.getPending.useQuery(
    { limit: 100 },
    { enabled: pilotMode && isAdmin && pendingPilotApprovalRefs.length > 0, refetchInterval: 15_000 }
  );
  const approvePilotMutation = trpc.approvals.submitDecision.useMutation({
    onSuccess: async () => {
      await Promise.all([
        workspaceQuery.refetch(),
        trpcUtils.approvals.getPending.invalidate(),
      ]);
    },
  });
  const bindMutation = trpc.spec226DevelopmentControl.bindConversationWorkspace.useMutation();
  const createModularCoreBindingMutation = trpc.spec226DevelopmentControl.createAndBindModularCoreWorkspace.useMutation();
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
  const ingestModularSaasProjectMutation = trpc.spec226DevelopmentControl.ingestModularSaasProject.useMutation();
  const prepareMutation = trpc.spec226DevelopmentControl.prepareWorkspaceRun.useMutation();
  type Preparation = Awaited<ReturnType<typeof prepareMutation.mutateAsync>>;
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  useEffect(() => {
    if (pilotMode || !initialPrompt || !draftKey || hydratedDraftKey !== draftKey) return;
    setPrompt(initialPrompt.slice(0, 4_000));
    setRequestKind(initialRequestKind);
    setPreparation(null);
  }, [draftKey, hydratedDraftKey, initialPrompt, initialRequestKind, pilotMode]);
  const [pilotSubmission, setPilotSubmission] = useState<{
    runId: string;
    jobId: string | null;
    approvalRef: string | null;
    dispatchStatus: string;
  } | null>(null);
  const readinessQuery = trpc.spec226DevelopmentControl.workspaceRunnerReadiness.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null && preparation !== null, refetchInterval: 5_000 }
  );
  const runners: RunnerOption[] = runnersQuery.data?.runners ?? [];
  const runnerWorkspaces = workspaces.filter(item => item.runnerId === selectedRunnerId);
  const selectableRunners = pilotMode
    ? runners.filter(runner => platformWorkspaces.some(workspace => workspace.runnerId === runner.runnerId))
    : runners;
  const selectableWorkspaces = pilotMode
    ? platformWorkspaces.filter(workspace => workspace.runnerId === selectedRunnerId)
    : runnerWorkspaces;
  const boundWorkspace = workspaceQuery.data?.workspace;
  const readinessTarget = runnerWorkspaces.find(item => selectionKey(item) === selected)
    ?? (boundWorkspace && JSON.stringify([boundWorkspace.runnerId, boundWorkspace.workspaceId]) === selected
      ? { runnerId: boundWorkspace.runnerId, workspaceId: boundWorkspace.workspaceId }
      : null);
  const readinessCatalogs = readinessTarget && "modelCatalogs" in readinessTarget
    ? readinessTarget.modelCatalogs ?? (readinessTarget.modelCatalog ? [readinessTarget.modelCatalog] : [])
    : [];
  const readinessAdapterId = harnessPolicy === "explicit"
    ? selectedHarnessAdapterId
    : readinessCatalogs.some(catalog => catalog.adapterId === "codex.v1") ? "codex.v1"
      : readinessCatalogs.find(catalog => catalog.adapterId === "microsoft-copilot.v1")?.adapterId ?? "codex.v1";
  const readinessProvider = readinessAdapterId === "microsoft-copilot.v1" ? "microsoft_copilot"
    : readinessAdapterId === "claude.v1" ? "claude_code" : "codex";
  const workspaceReadinessQuery = trpc.runnerNodes.workspaceReadiness.useQuery({
    runnerId: readinessTarget?.runnerId ?? "",
    workspaceId: readinessTarget?.workspaceId ?? "",
    provider: readinessProvider,
  }, {
    enabled: Boolean(readinessTarget),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const runnerReadiness = workspaceReadinessQuery.data ?? readinessQuery.data ?? preparation?.runnerReadiness;
  const startMutation = trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation();
  const resumeRunMutation = trpc.spec226DevelopmentControl.resumeWorkspaceRun.useMutation();
  const cancelUnclaimedLegacyRunMutation = trpc.spec226DevelopmentControl.cancelUnclaimedLegacyPlatformRun.useMutation();
  const cancelLegacyWorkerJobMutation = trpc.workerJobs.cancelQueued.useMutation();
  const selectedWorkspace = runnerWorkspaces.find(item => selectionKey(item) === selected);
  const platformWorkspaceSelected = selectedWorkspace?.scope === "PLATFORM_ENGINEERING";
  const requiresTenantLedger = !platformWorkspaceSelected;
  const economicLedgerReadiness = trpc.economicControlPlane.listSpec224LedgerAccounts.useQuery(
    { currency: "USD" }, { enabled: user?.role === "admin" && requiresTenantLedger, retry: false },
  );
  const economicLedgerReadyForRun = !requiresTenantLedger || user?.role !== "admin"
    || (!economicLedgerReadiness.isLoading && !economicLedgerReadiness.error && Boolean(economicLedgerReadiness.data?.configured));
  const hasUnfinishedDevelopmentRun = (workspaceQuery.data?.developmentRuns ?? []).some(run =>
    !["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(run.state),
  );
  const developmentRuns = workspaceQuery.data?.developmentRuns ?? [];
  const pilotRuns = developmentRuns.filter(run => run.isFirstRunPilot);
  const hasExistingPilotRun = pilotRuns.length > 0;
  const developmentRunsNewestFirst = [...developmentRuns].sort((left, right) => {
    const leftTime = Date.parse(left.workerJobCreatedAt ?? left.createdAt ?? "");
    const rightTime = Date.parse(right.workerJobCreatedAt ?? right.createdAt ?? "");
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
  // Retain the newest Worker Job for each requested SPEC/WorkPackage pair.
  const seenDevelopmentWorkUnits = new Set<string>();
  const latestDevelopmentRuns = developmentRunsNewestFirst.filter(run => {
    const workPackageKey = run.workPackageExternalId ?? run.workPackageId;
    const workUnitKey = run.specId && workPackageKey
      ? JSON.stringify([run.specId, workPackageKey])
      : `run:${run.runId}`;
    if (seenDevelopmentWorkUnits.has(workUnitKey)) return false;
    seenDevelopmentWorkUnits.add(workUnitKey);
    return true;
  });
  const hiddenDevelopmentRunCount = developmentRuns.length - latestDevelopmentRuns.length;
  const hasLegacyBudgetedPlatformRun = platformWorkspaceSelected
    && developmentRuns.some(run => run.economicsMode !== "provider_managed");
  const selectedModularCoreCandidate = platformBindingCandidatesQuery.data?.workspaces.find(candidate =>
    candidate.runnerId === selectedWorkspace?.runnerId && candidate.workspaceId === selectedWorkspace?.workspaceId
      && candidate.deploymentTargetId === "modular-debian-dev",
  );
  const selectedWorkspaceIsModularCoreBound = platformWorkspaces.some(workspace =>
    workspace.runnerId === selectedWorkspace?.runnerId && workspace.workspaceId === selectedWorkspace?.workspaceId
      && workspace.deploymentTarget?.id === "modular-debian-dev",
  );
  const featureSpecs = featureSpecsQuery.data?.specs ?? [];
  const availableFeatureSpecs = featureSpecs.filter(spec =>
    !spec.requiredDeploymentTargetId || spec.requiredDeploymentTargetId === selectedWorkspace?.deploymentTarget?.id,
  );
  const selectedFeatureSpecAvailable = availableFeatureSpecs.some(spec => spec.id === selectedFeatureSpec);
  const selectedFeatureSpecIsModularProject = /^3(1[2-9]|2[0-4])-/.test(selectedFeatureSpec)
    && selectedWorkspace?.deploymentTarget?.id === "modular-debian-dev";
  const unavailableTargetSpecs = featureSpecs.filter(spec =>
    spec.requiredDeploymentTargetId && spec.requiredDeploymentTargetId !== selectedWorkspace?.deploymentTarget?.id,
  );
  const unavailableTargetDomain = unavailableTargetSpecs[0]?.requiredDeploymentTargetDomain;
  useEffect(() => {
    if (!resumeSpecId || continuationSpecRestored.current || !featureSpecsQuery.data) return;
    continuationSpecRestored.current = true;
    const spec = availableFeatureSpecs.find(item => item.id.match(new RegExp(`^${resumeSpecId}-`)));
    if (!spec) {
      setContinuationNotice(`ไม่พบ SPEC-${resumeSpecId} ในรายการของ workspace นี้ จึงยังไม่สั่งทำงานต่อ`);
      return;
    }
    setDevelopmentInputMode("spec");
    setRequestKind("development");
    setSpecSource("catalog");
    setSelectedFeatureSpec(spec.id);
    preferencesTouched.current = true;
    setContinuationNotice(`เปิดบริบท SPEC-${resumeSpecId} จาก workspace เดิมแล้ว กำลังตรวจว่ามี WorkUnit เดิมที่ทำต่อได้หรือไม่`);
  }, [resumeSpecId, featureSpecsQuery.data, availableFeatureSpecs]);
  const hasWorkspaceForUnavailableTarget = unavailableTargetSpecs.some(spec =>
    platformWorkspaces.some(workspace => workspace.deploymentTarget?.id === spec.requiredDeploymentTargetId),
  );
  useEffect(() => {
    if (selectedFeatureSpec && featureSpecsQuery.data && !selectedFeatureSpecAvailable) {
      setSelectedFeatureSpec("");
      setPreparation(null);
    }
  }, [selectedFeatureSpec, featureSpecsQuery.data, selectedFeatureSpecAvailable]);
  const availableCatalogs = selectedWorkspace?.modelCatalogs ?? (selectedWorkspace?.modelCatalog ? [selectedWorkspace.modelCatalog] : []);
  const catalogHarnesses = availableCatalogs
    .map(catalog => catalog.adapterId)
    .filter(adapterId => adapterId === "codex.v1" || adapterId === "microsoft-copilot.v1");
  useEffect(() => {
    if (!requestedHarnessAdapterId || requestedHarnessApplied.current || !selectedWorkspace || workspacesQuery.isLoading) return;
    requestedHarnessApplied.current = true;
    if (catalogHarnesses.includes(requestedHarnessAdapterId)) {
      setHarnessPolicy("explicit");
      setSelectedHarnessAdapterId(requestedHarnessAdapterId);
    }
  }, [requestedHarnessAdapterId, selectedWorkspace, workspacesQuery.isLoading, catalogHarnesses.join("|")]);
  const effectiveHarnessAdapterId = harnessPolicy === "explicit"
    ? selectedHarnessAdapterId
    : catalogHarnesses.includes("codex.v1") ? "codex.v1" : catalogHarnesses[0] ?? "";
  const modelCatalog = availableCatalogs.find(catalog => catalog.adapterId === effectiveHarnessAdapterId) ?? null;
  const effectiveProvider = effectiveHarnessAdapterId === "codex.v1" ? "codex"
    : effectiveHarnessAdapterId === "microsoft-copilot.v1" ? "microsoft_copilot" : "";
  const catalogModels = modelCatalog?.models ?? [];
  const catalogExpired = modelCatalog?.state === "discovered"
    && Date.parse(modelCatalog.expiresAt) <= Date.now();
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
      : availableEfforts.includes("medium") ? "medium" : availableEfforts[0] ?? (effectiveHarnessAdapterId === "microsoft-copilot.v1" ? "provider_default" : "");
  const selectedRunner = runners.find(runner => runner.runnerId === selectedRunnerId);
  const selectedRunnerHeartbeatAt = selectedRunner?.lastSeenAt ? Date.parse(selectedRunner.lastSeenAt) : Number.NaN;
  const selectedRunnerHeartbeatFresh = Number.isFinite(selectedRunnerHeartbeatAt)
    && selectedRunnerHeartbeatAt <= Date.now()
    && Date.now() - selectedRunnerHeartbeatAt < 5 * 60_000;
  const selectedRunnerOnlineAndTrusted = selectedRunner?.readinessStatus === "online"
    && selectedRunner.trustState === "trusted"
    && selectedRunnerHeartbeatFresh;
  const pilotBindingMatchesSelection = Boolean(selectedWorkspace
    && boundWorkspace?.runnerId === selectedWorkspace.runnerId
    && boundWorkspace.workspaceId === selectedWorkspace.workspaceId);
  const pilotReadiness = pilotBindingMatchesSelection
    ? workspaceReadinessQuery.data ?? preparation?.runnerReadiness
    : undefined;
  const pilotRunnerExecutionReady = Boolean(selectedRunnerOnlineAndTrusted && pilotBindingMatchesSelection && pilotReadiness?.ready);
  const pilotNotReadyReason = !selectedRunner
    ? "กำลังโหลด Runner status"
    : selectedRunner.trustState !== "trusted"
      ? "RUNNER_NOT_TRUSTED"
      : selectedRunner.readinessStatus !== "online"
        ? selectedRunner.readinessStatus
        : !selectedRunnerHeartbeatFresh
          ? "RUNNER_HEARTBEAT_STALE"
          : !pilotBindingMatchesSelection
            ? "WORKSPACE_BINDING_PENDING"
            : pilotReadiness?.ready
              ? null
              : pilotReadiness?.code ?? (workspaceReadinessQuery.isLoading ? "กำลังตรวจสอบ readiness จาก Runner" : "ยังไม่มีผล readiness ล่าสุด");
  const isPlatformWorkspace = selectedWorkspace?.scope === "PLATFORM_ENGINEERING" || selectionKey(selectedWorkspace ?? { runnerId: "", workspaceId: "" }) === lastPlatformWorkspaceKey.current;
  const platformBindingCurrent = selectedWorkspace?.scope === "PLATFORM_ENGINEERING" && Boolean(selectedWorkspace.canonicalProjectId);
  const platformSourceIsSafe = !isPlatformWorkspace || platformBindingCurrent;
  const specSet = workspaceQuery.data?.specSet;
  const importedModularSpecCount = specSet?.files.filter(file =>
    /^canonical-projects\/[^/]+\/specs\/(?:31[2-9]|32[0-4])-[^/]+\/spec\.md$/i.test(file.path),
  ).length ?? 0;
  const modularSpecSetImported = importedModularSpecCount > 0;
  const modularProjectImportBlocker = !isAdmin
    ? "การนำเข้า Specs 312–324 ทำได้โดยผู้ดูแลระบบเท่านั้น"
    : !selectedWorkspace
      ? "เลือก Runner และ SmartAIHub Modular Core Workspace ที่ออนไลน์และมี snapshot ล่าสุดก่อน"
      : !platformWorkspaceSelected
        ? "Workspace นี้ยังไม่ได้รับสิทธิ์ Platform Engineering"
        : selectedWorkspace.deploymentTarget?.id !== "modular-debian-dev"
          ? "ต้องเลือก SmartAIHub Modular Core Workspace สำหรับ aimarkethubs.com"
          : !workspaceQuery.data?.workspace
            ? "ต้องผูก conversation นี้กับ SmartAIHub Modular Core Workspace ก่อน"
            : ["revoked", "forbidden"].includes(workspaceQuery.data.availability?.status ?? "")
              ? "สิทธิ์ของ workspace นี้ถูกถอนแล้ว · เลือก workspace ที่ได้รับอนุญาตอีกครั้ง"
              : workspaceQuery.data.workspace.runnerId !== selectedWorkspace.runnerId || workspaceQuery.data.workspace.workspaceId !== selectedWorkspace.workspaceId
                ? "conversation นี้ผูกกับ workspace อื่น · เลือก SmartAIHub Modular Core Workspace เพื่อผูกใหม่ก่อน"
                : null;
  const modularProjectImportPending = workspacesQuery.isFetching || workspaceQuery.isFetching
    || bindMutation.isPending || uploading || ingestModularSaasProjectMutation.isPending;
  const canImportModularProject = modularProjectImportBlocker === null && !modularProjectImportPending;
  const modularCoreBindingNeedsRefresh = Boolean(conversationId && isAdmin && platformWorkspaceSelected
    && selectedWorkspace?.deploymentTarget?.id === "modular-debian-dev"
    && (!workspaceQuery.data?.workspace
      || workspaceQuery.data.availability?.status !== "current"
      || workspaceQuery.data.workspace.runnerId !== selectedWorkspace.runnerId
      || workspaceQuery.data.workspace.workspaceId !== selectedWorkspace.workspaceId
      || workspaceQuery.data.workspace.snapshotRevision !== selectedWorkspace.snapshotRevision));
  const canonicalSpecSetMissing = developmentInputMode !== "prompt" && effectiveSpecSource === "catalog" && !specSet;
  const boundKey = boundWorkspace
    ? JSON.stringify([boundWorkspace.runnerId, boundWorkspace.workspaceId])
    : "";
  const boundIsListed = workspaces.some(item => selectionKey(item) === boundKey);
  const effectivePrompt = prompt.trim();
  const canonicalHandoff = effectiveSpecSource === "catalog" ? featureSpecContextQuery.data?.handoff : undefined;
  const nextReadyWorkunit = canonicalHandoff?.status === "CURRENT" ? canonicalHandoff.nextReadyWorkunit : null;
  const isNextReadyPackage = (workPackage: { id: string; externalId: string }) => Boolean(nextReadyWorkunit && (workPackage.id === nextReadyWorkunit || workPackage.externalId === nextReadyWorkunit));
  const preparedWorkPackages = (preparation?.workPackages ?? []) as WorkspaceWorkPackage[];
  const completedPackageIds = new Set(developmentRuns
    .filter(run => run.state === "COMPLETED" && run.specSetRevision === preparation?.planRevision && run.workPackageId)
    .map(run => run.workPackageId!));
  const selectedHandoffPackage = preparedWorkPackages.find(isNextReadyPackage);
  const packageRunOrder = nextPackageInRunOrder({
    target: selectedHandoffPackage,
    workPackages: preparedWorkPackages,
    completedPackageIds,
  });
  const isStartableForCurrentRequest = (workPackage: WorkspaceWorkPackage) =>
    isNextReadyPackage(workPackage) || workPackage.id === packageRunOrder.nextPrerequisite?.id;
  const canCreateConversation = developmentInputMode === "prompt"
    ? Boolean(effectivePrompt)
    : (developmentInputMode !== "spec_prompt" || Boolean(effectivePrompt)) && (effectiveSpecSource === "catalog"
      ? Boolean(platformWorkspaceSelected && selectedFeatureSpec) && (!platformWorkspace || featureSpecContextQuery.data?.handoff.status === "CURRENT")
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
    if (workspacesQuery.isLoading || !selected || workspaceQuery.data?.workspace) return;
    if (workspaces.some(workspace => selectionKey(workspace) === selected)) return;
    setSelectedRunnerId("");
    setSelected("");
  }, [workspacesQuery.isLoading, workspaces, selected, workspaceQuery.data?.workspace]);
  useEffect(() => {
    if (restoredSelection.current) {
      if (selected === restoredSelection.current) {
        restoredSelection.current = null;
        restoringTaskDraft.current = false;
        return;
      }
      if (!selected) return;
      restoredSelection.current = null;
    }
    if (restoringTaskDraft.current) {
      restoringTaskDraft.current = false;
      return;
    }
    setHarnessPolicy("auto");
    setSelectedHarnessAdapterId("");
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
    if ((!pilotMode && conversationId !== null) || selected || selectedRunnerId || !platformWorkspace) return;
    lastPlatformWorkspaceKey.current = selectionKey(platformWorkspace);
    setSelectedRunnerId(platformWorkspace.runnerId);
    setSelected(selectionKey(platformWorkspace));
    if (!pilotMode) setSpecSource("catalog");
  }, [conversationId, pilotMode, platformWorkspace, selected, selectedRunnerId]);
  useEffect(() => {
    if (preparation && runnerReadiness?.ready && !preparation.runnerReadiness.ready && !prepareMutation.isPending) {
      // Readiness refresh only. Re-prepare the same input after the owner's
      // probe acknowledgement; this does not create or schedule a run.
      void prepare();
    }
  }, [readinessQuery.data?.capabilitySnapshotRevision, preparation?.runnerReadiness?.ready]);

  async function bindWorkspace(value: string, persistPreference = true) {
    if (persistPreference) preferencesTouched.current = true;
    setSelected(value);
    setPreparation(null);
    if (!value) return;
    const workspace = workspaces.find(item => selectionKey(item) === value);
    if (!workspace) return;
    setSelectedRunnerId(workspace.runnerId);
    if (!conversationId) return;
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

  async function enableSelectedModularCoreWorkspace() {
    if (!isAdmin || !selectedModularCoreCandidate || selectedWorkspaceIsModularCoreBound) return;
    setUploading(true);
    try {
      await createModularCoreBindingMutation.mutateAsync({
        runnerId: selectedModularCoreCandidate.runnerId,
        workspaceId: selectedModularCoreCandidate.workspaceId,
        confirmModularCore: true,
      });
      const refreshed = await workspacesQuery.refetch();
      const boundCoreWorkspace = refreshed.data?.workspaces.find(workspace =>
        workspace.runnerId === selectedModularCoreCandidate.runnerId
          && workspace.workspaceId === selectedModularCoreCandidate.workspaceId
          && workspace.scope === "PLATFORM_ENGINEERING"
          && workspace.deploymentTarget?.id === "modular-debian-dev",
      );
      if (!boundCoreWorkspace) throw new Error("MODULAR_CORE_WORKSPACE_BINDING_NOT_VISIBLE");
      setSelectedRunnerId(boundCoreWorkspace.runnerId);
      setSelected(selectionKey(boundCoreWorkspace));
      setSpecSource("catalog");
      setSelectedFeatureSpec("");
      if (conversationId) {
        await bindMutation.mutateAsync({
          conversationId,
          runnerId: boundCoreWorkspace.runnerId,
          workspaceId: boundCoreWorkspace.workspaceId,
        });
        await workspaceQuery.refetch();
      }
      toast.success("ผูก Core workspace แล้ว · เลือก SPEC-312–324 ได้");
    } catch (error) {
      toast.error(presentCustomerError(error, "เปิดใช้ Core workspace ไม่สำเร็จ"));
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin || !selectedModularCoreCandidate || selectedWorkspaceIsModularCoreBound || !selectedWorkspace) return;
    const attemptKey = selectionKey(selectedWorkspace);
    if (automaticCoreBindingAttempt.current === attemptKey) return;
    automaticCoreBindingAttempt.current = attemptKey;
    void enableSelectedModularCoreWorkspace();
  }, [
    isAdmin,
    selectedModularCoreCandidate,
    selectedWorkspace,
    selectedWorkspaceIsModularCoreBound,
    enableSelectedModularCoreWorkspace,
  ]);

  useEffect(() => {
    if (!pilotMode || !conversationId || !platformWorkspace || workspaceQuery.isLoading || workspaceQuery.data?.workspace || selected !== selectionKey(platformWorkspace)) return;
    void bindWorkspace(selectionKey(platformWorkspace), false);
  }, [pilotMode, conversationId, platformWorkspace, workspaceQuery.isLoading, workspaceQuery.data?.workspace?.workspaceId, selected]);

  function selectCanonicalPlatformWorkspace() {
    if (!platformWorkspace) return;
    lastPlatformWorkspaceKey.current = selectionKey(platformWorkspace);
    void bindWorkspace(selectionKey(platformWorkspace));
    setSpecSource("catalog");
    setSelectedFeatureSpec("");
  }

  async function createTaskConversation() {
    if (!onCreateConversation || !selectedWorkspace || !canCreateConversation || creatingTaskInFlight.current) return;
    if (effectiveSpecSource === "catalog" && !platformWorkspaceSelected) {
      toast.error("Canonical SPEC ต้องเลือก SmartAIHub Source Workspace ก่อนสร้างงาน");
      return;
    }
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
      const result = await prepareMutation.mutateAsync({ conversationId: nextConversationId, mode, ...(mode === "prompt" ? { prompt, ...(requestKind === "development" ? { workspaceAccessMode } : {}) } : {}), ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}) });
      setPreparation(result);
      const workPackages = (result.workPackages ?? []) as WorkspaceWorkPackage[];
      const target = workPackages.find(isNextReadyPackage);
      const completedForRevision = new Set(developmentRuns
        .filter(run => run.state === "COMPLETED" && run.specSetRevision === result.planRevision && run.workPackageId)
        .map(run => run.workPackageId!));
      const order = nextPackageInRunOrder({ target, workPackages, completedPackageIds: completedForRevision });
      const firstPackage = order.nextPrerequisite ?? target;
      const startablePackage = mode === "prompt"
        ? "prompt"
        : firstPackage && result.runnableWorkPackageIds.includes(firstPackage.id)
          && (effectiveSpecSource !== "catalog" || firstPackage.id === target?.id || firstPackage.id === order.nextPrerequisite?.id)
          ? firstPackage.id
          : null;
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

  async function ingestSelectedModularSaasProject() {
    if (!conversationId) {
      toast.error("สร้างหรือเลือก conversation ก่อนนำเข้า Specs");
      return;
    }
    if (modularProjectImportBlocker) {
      toast.error(modularProjectImportBlocker);
      return;
    }
    if (modularProjectImportPending) return;
    setUploading(true);
    setPreparation(null);
    try {
      const result = await ingestModularSaasProjectMutation.mutateAsync({
        conversationId,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      });
      await workspaceQuery.refetch();
      toast.success(`นำเข้า Modular SaaS ${result.project.specCount} Specs แล้ว · ${result.runnableWorkPackageCount} WorkPackages พร้อมเริ่ม`);
    } catch (error) {
      toast.error(presentCustomerError(error, "นำเข้า Modular SaaS project ไม่สำเร็จ"));
    } finally {
      setUploading(false);
    }
  }

  async function prepare() {
    if (!conversationId) return;
    if (pilotMode && (hasExistingPilotRun || pilotSubmission)) {
      toast.info("พบ First Run Pilot ที่บันทึกแล้ว ระบบไม่สร้าง Goal ซ้ำ");
      return;
    }
    if (effectiveSpecSource === "catalog" && !platformWorkspaceSelected) {
      toast.error("Canonical SPEC ต้องผูกกับ SmartAIHub Source Workspace ก่อนเตรียมงาน");
      return;
    }
    if (bindMutation.isPending) return;
    setPreparing(true);
    setPreparation(null);
    try {
      const result = await prepareMutation.mutateAsync({
        conversationId,
        mode,
        ...(mode === "prompt" ? {
          prompt,
          ...(pilotMode ? { writeScope: FIRST_RUN_PILOT_SCOPE } : requestKind === "development" ? { workspaceAccessMode } : {}),
        } : {}),
        ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}),
      });
      setPreparation(result);
    } catch (error) {
      toast.error(presentCustomerError(error, "เตรียมแผนไม่สำเร็จ"));
    } finally {
      setPreparing(false);
    }
  }

  async function refreshAfterExecutionSourceChanged(input: {
    workPackageId: string;
    targetConversationId: number;
    targetPreparation: Preparation;
    startMode: "prompt" | "spec_set";
    startKey: string;
    idempotencyKey: string;
  }) {
    const selected = selectedWorkspace;
    const previousSnapshotRevision = input.targetPreparation.workPackages?.find(item => item.id === input.workPackageId)?.sourceAdmission?.snapshotRevision
      ?? selected?.snapshotRevision;
    try {
      if (!selected || selected.scope !== "PLATFORM_ENGINEERING") throw new Error("PLATFORM_ENGINEERING_WORKSPACE_BINDING_REQUIRED");
      const refreshedWorkspaces = await workspacesQuery.refetch();
      const currentWorkspace = refreshedWorkspaces.data?.workspaces.find(workspace =>
        workspace.runnerId === selected.runnerId && workspace.workspaceId === selected.workspaceId
          && workspace.scope === "PLATFORM_ENGINEERING",
      );
      if (!currentWorkspace) throw new Error("PLATFORM_ENGINEERING_WORKSPACE_BINDING_REQUIRED");

      await bindMutation.mutateAsync({
        conversationId: input.targetConversationId,
        runnerId: currentWorkspace.runnerId,
        workspaceId: currentWorkspace.workspaceId,
      });
      const refreshedBinding = await workspaceQuery.refetch();
      if (refreshedBinding.data?.availability?.status !== "current"
        || refreshedBinding.data.workspace?.snapshotRevision !== currentWorkspace.snapshotRevision) {
        throw new Error("WORKSPACE_BINDING_REFRESH_STALE");
      }

      const refreshedPreparation = await prepareMutation.mutateAsync({
        conversationId: input.targetConversationId,
        mode: input.startMode,
        ...(input.startMode === "prompt" ? {
          prompt: effectivePrompt,
          ...(requestKind === "development" ? { workspaceAccessMode } : {}),
        } : {}),
        ...(developmentInputMode === "spec_prompt" ? { additionalInstructions: prompt } : {}),
      });
      const refreshedPackage = refreshedPreparation.workPackages?.find(item => item.id === input.workPackageId);
      const latestSnapshotRevision = refreshedPackage?.sourceAdmission?.snapshotRevision ?? currentWorkspace.snapshotRevision;
      const packageStillRunnable = refreshedPreparation.runnableWorkPackageIds.includes(input.workPackageId)
        && (input.startMode === "prompt" || Boolean(refreshedPackage));
      const packageSourceIsSafe = !currentWorkspace.scope || currentWorkspace.scope !== "PLATFORM_ENGINEERING"
        || ["SAFE_CLEAN", "SAFE_DISJOINT_DIRTY", "SAFE_CANDIDATE_OVERLAY"].includes(refreshedPackage?.sourceAdmission?.status ?? "BLOCKED");

      if (!previousSnapshotRevision || latestSnapshotRevision === previousSnapshotRevision) {
        setPreparation(null);
        toast.error("Goal เดิมถูกบันทึกแล้ว แต่ source ยังเป็น snapshot เดิม โปรดโหลดรายการ Runner หลัง source เปลี่ยน แล้วเตรียมแผนใหม่ก่อนส่งอีกครั้ง");
        return;
      }
      setPreparation(refreshedPreparation);
      setStartKeys(current => {
        const next = { ...current };
        delete next[input.startKey];
        return next;
      });
      if (!packageStillRunnable || !packageSourceIsSafe) {
        toast.info("Goal เดิมถูกบันทึกแล้วแต่เริ่มไม่ได้ ระบบโหลดแผนล่าสุดให้แล้ว ตรวจ blocker และ source preflight ก่อนส่ง Goal ใหม่");
        return;
      }
      toast.info("Goal เดิมถูกบันทึกแล้วแต่เริ่มไม่ได้ เพราะ source เปลี่ยน ระบบเตรียม snapshot ล่าสุดให้แล้ว โปรดตรวจแผนและกดส่ง Goal อีกครั้ง");
    } catch {
      setPreparation(null);
      toast.error("Goal เดิมถูกบันทึกแล้วแต่เริ่มไม่ได้ และโหลด source ล่าสุดไม่สำเร็จ โปรดโหลดรายการ Runner แล้วเตรียมแผนใหม่");
    }
  }

  async function startWorkPackage(
    workPackageId: string,
    targetConversationId = conversationId,
    targetPreparation = preparation,
    stableKey?: string,
    startOptions?: { mode?: "prompt" | "spec_set"; requestedSpecId?: string | null; skipAdditionalInstructions?: boolean },
  ) {
    if (!targetConversationId || !targetPreparation || startInFlight.current) return;
    if (pilotMode && (hasExistingPilotRun || pilotSubmission)) {
      toast.info("พบ First Run Pilot ที่บันทึกแล้ว ระบบไม่สร้าง Goal ซ้ำ");
      return;
    }
    const startMode = startOptions?.mode ?? mode;
    const requestedSpecId = startOptions?.requestedSpecId !== undefined
      ? startOptions.requestedSpecId
      : effectiveSpecSource === "catalog" ? selectedFeatureSpec : null;
    const packageSourceAdmission = targetPreparation.workPackages?.find(item => item.id === workPackageId)?.sourceAdmission;
    if (!platformSourceIsSafe || (isPlatformWorkspace && !["SAFE_CLEAN", "SAFE_DISJOINT_DIRTY", "SAFE_CANDIDATE_OVERLAY"].includes(packageSourceAdmission?.status ?? "BLOCKED"))) {
      toast.error("Workspace มีการเปลี่ยนแปลงหรือหลักฐาน source ยังไม่ครบ โปรดโหลด snapshot ล่าสุดและตรวจผล preflight ก่อนเริ่ม");
      return;
    }
    if (!platformWorkspaceSelected && (budgetCapMinorUnits < 1 || budgetCapMinorUnits > 10_000_000)) {
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
    if ((pilotMode && (!isAdmin || !platformWorkspaceSelected || !pilotRunnerExecutionReady)) || !(runnerReadiness?.ready ?? targetPreparation.runnerReadiness.ready) || (requestKind === "development" && (!catalogFresh || !effectiveProvider || (harnessPolicy === "explicit" && !catalogHarnesses.includes(selectedHarnessAdapterId)) || !activeModel || !supportedEffort))) {
      toast.error("Runner หรือ model readiness ของ Harness ที่เลือกยังไม่พร้อม จึงยังไม่เริ่มงาน");
      return;
    }
    const key = `${targetConversationId}:${threadId ?? "main"}:${startMode}:${targetPreparation.planRevision}:${workPackageId}:${requestedSpecId ?? ""}:${designStartFingerprint}:${workspaceAccessMode}:${platformWorkspaceSelected ? "provider-managed" : budgetCapMinorUnits}:${harnessPolicy}:${effectiveProvider}:${JSON.stringify(modelSelection)}`;
    const idempotencyKey = stableKey ?? startKeys[key] ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    setStartKeys(current => ({ ...current, [key]: idempotencyKey }));
    startInFlight.current = true;
    try {
      const result = await startMutation.mutateAsync({
        conversationId: targetConversationId,
        ...(threadId ? { threadId } : {}),
        mode: startMode,
        factoryMode: requestKind === "mini_app",
        ...(startMode === "prompt" ? {
          prompt: effectivePrompt,
          ...(pilotMode ? { writeScope: FIRST_RUN_PILOT_SCOPE } : requestKind === "development" ? { workspaceAccessMode } : {}),
        } : {
          // Start the immutable revision shown in this preparation. Another
          // Chat section may append a newer SpecSet while this preview is open.
          specSetRevision: targetPreparation.planRevision,
          workPackageId,
          ...(requestedSpecId ? { requestedSpecId } : {}),
          ...(developmentInputMode === "spec_prompt" && !startOptions?.skipAdditionalInstructions ? { additionalInstructions: prompt } : {}),
        }),
        ...(platformWorkspaceSelected ? {} : { budgetCapMinorUnits }),
        ...(requestKind === "development" ? { provider: effectiveProvider as "codex" | "microsoft_copilot" } : {}),
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
      await Promise.resolve(trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId: targetConversationId })).catch(() => undefined);
      const status = result.goalAdmissionStatus ?? result.dispatchStatus;
      if (status === "EXECUTION_SOURCE_CHANGED") {
        if (pilotMode) {
          const approvalRef = result.authorization
            && typeof result.authorization === "object"
            && "approvalRef" in result.authorization
            && typeof result.authorization.approvalRef === "string"
            ? result.authorization.approvalRef
            : null;
          setPilotSubmission({ runId: result.runId, jobId: result.jobId ?? null, approvalRef, dispatchStatus: result.dispatchStatus });
          toast.error("First Run Pilot ถูกบันทึกแล้วแต่ source เปลี่ยนก่อนเริ่มงาน ระบบไม่สร้าง Pilot ซ้ำ โปรดตรวจ Goal เดิมใน Task Control");
        } else {
          await refreshAfterExecutionSourceChanged({
            workPackageId,
            targetConversationId,
            targetPreparation,
            startMode,
            startKey: key,
            idempotencyKey,
          });
        }
        return;
      }
      if (pilotMode) {
        const approvalRef = result.authorization
          && typeof result.authorization === "object"
          && "approvalRef" in result.authorization
          && typeof result.authorization.approvalRef === "string"
          ? result.authorization.approvalRef
          : null;
        setPilotSubmission({
          runId: result.runId,
          jobId: result.jobId ?? null,
          approvalRef,
          dispatchStatus: result.dispatchStatus,
        });
        await Promise.resolve(trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId: targetConversationId })).catch(() => undefined);
      }
      if (result.dispatchStatus === "ENQUEUED") {
        toast.success(requestKind === "mini_app"
          ? `ส่ง Mini App Factory stage แรกแล้ว · ${result.dispatchStatus}`
          : "บันทึก DevelopmentRun และส่งเข้าคิวแล้ว");
      } else {
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
      if (error instanceof Error && error.message.includes("EXECUTION_SOURCE_CHANGED")) {
        if (pilotMode) {
          toast.error("First Run Pilot ถูกบันทึกแล้วแต่ source เปลี่ยนก่อนเริ่มงาน ระบบไม่สร้าง Pilot ซ้ำ โปรดตรวจ Goal เดิมใน Task Control");
        } else {
          await refreshAfterExecutionSourceChanged({
            workPackageId,
            targetConversationId,
            targetPreparation,
            startMode,
            startKey: key,
            idempotencyKey,
          });
        }
        return;
      }
      if (error instanceof Error && error.message.includes("WORKSPACE_BINDING_STALE")) {
        try {
          const selected = selectedWorkspace;
          const refreshedWorkspaces = await workspacesQuery.refetch();
          const currentWorkspace = selected && refreshedWorkspaces.data?.workspaces.find(workspace =>
            workspace.runnerId === selected.runnerId && workspace.workspaceId === selected.workspaceId,
          );
          if (!currentWorkspace) {
            setPreparation(null);
            toast.error("Runner ไม่พบ Workspace ที่เลือกใน snapshot ล่าสุด กรุณาเลือก Workspace ที่ยังแสดงอยู่แล้วเตรียมแผนใหม่");
            return;
          }

          await bindMutation.mutateAsync({
            conversationId: targetConversationId,
            runnerId: currentWorkspace.runnerId,
            workspaceId: currentWorkspace.workspaceId,
          });
          const refreshedBinding = await workspaceQuery.refetch();
          if (refreshedBinding.data?.availability?.status !== "current"
            || refreshedBinding.data.workspace?.snapshotRevision !== currentWorkspace.snapshotRevision) {
            throw new Error("WORKSPACE_BINDING_REFRESH_STALE");
          }

          const refreshedPreparation = await prepareMutation.mutateAsync({
            conversationId: targetConversationId,
            mode: startMode,
            ...(startMode === "prompt" ? {
              prompt: effectivePrompt,
              ...(pilotMode ? { writeScope: FIRST_RUN_PILOT_SCOPE } : requestKind === "development" ? { workspaceAccessMode } : {}),
            } : {}),
            ...(developmentInputMode === "spec_prompt" && !startOptions?.skipAdditionalInstructions
              ? { additionalInstructions: prompt }
              : {}),
          });
          setPreparation(refreshedPreparation);
          const refreshedPackage = refreshedPreparation.workPackages?.find(item => item.id === workPackageId);
          const packageStillRunnable = refreshedPreparation.runnableWorkPackageIds.includes(workPackageId)
            && (startMode === "prompt" || Boolean(refreshedPackage));
          toast.info(packageStillRunnable
            ? "Workspace เปลี่ยน snapshot แล้ว ระบบผูกและเตรียมแผนล่าสุดให้แล้ว กรุณาตรวจแผนก่อนกดส่ง Goal อีกครั้ง"
            : "Workspace เปลี่ยน snapshot แล้ว ระบบเตรียมแผนล่าสุดให้แล้ว แต่ WorkPackage เดิมยังเริ่มไม่ได้ กรุณาตรวจ blocker และเลือกงานที่พร้อม");
        } catch {
          setPreparation(null);
          toast.error("Workspace เปลี่ยนระหว่างส่ง Goal และอัปเดตแผนล่าสุดไม่สำเร็จ กรุณาโหลดรายการ Runner แล้วเตรียมแผนใหม่");
        }
        return;
      }
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

  async function resumeExistingRun(runId: string, targetConversationId = conversationId) {
    if (!targetConversationId || resumeRunMutation.isPending) return;
    try {
      const result = await resumeRunMutation.mutateAsync({ conversationId: targetConversationId, runId });
      await workspaceQuery.refetch();
      if (result.dispatchStatus === "ENQUEUED") {
        if (continuationResumeAttempt.current === runId) setContinuationNotice("ส่ง DevelopmentRun เดิมใน Project นี้เข้าคิวแล้ว");
        toast.success(simpleMode ? "ส่งงานเดิมเข้าคิวเพื่อทำต่อแล้ว" : `ทำงานต่อจาก DevelopmentRun เดิมแล้ว · ${result.runId}`);
      } else if (result.dispatchStatus === "PENDING_AUTHORIZATION") {
        if (continuationResumeAttempt.current === runId) setContinuationNotice("พบ Run เดิมแล้ว แต่ยังรอการอนุมัติสิทธิ์ก่อนทำงานต่อ");
        const authorization = result.authorization as { reasons?: unknown; status?: unknown } | null | undefined;
        const reasons = Array.isArray(authorization?.reasons)
          ? authorization.reasons.filter((reason): reason is string => typeof reason === "string").join(", ")
          : "";
        const reasonText = reasons || (typeof authorization?.status === "string" ? authorization.status : result.goalAdmissionStatus ?? result.dispatchStatus);
        toast.info(simpleMode ? "งานเดิมยังรอสิทธิ์ก่อนทำต่อ" : `DevelopmentRun เดิมยังรอ authorization · ${reasonText}`);
      } else {
        const authorization = result.authorization as { reasons?: unknown; status?: unknown; errorCode?: unknown; ownerAction?: unknown } | null | undefined;
        if (continuationResumeAttempt.current === runId) {
          const terminalRun = authorization?.status === "RUN_TERMINAL_FAILED" || authorization?.status === "RUN_TERMINAL_CLOSED";
          setContinuationNotice(terminalRun
            ? "Run เดิมปิดแล้ว สร้าง Goal ใหม่เพื่อทำงานต่อจาก Project และ Workspace เดิม"
            : "พบ Run เดิมแล้ว แต่ยังทำงานต่อไม่ได้ โปรดตรวจสถานะและความพร้อมใน Task Control");
        }
        const reasons = Array.isArray(authorization?.reasons)
          ? authorization.reasons.filter((reason): reason is string => typeof reason === "string").join(", ")
          : "";
        const reasonText = reasons
          || (typeof authorization?.errorCode === "string" ? authorization.errorCode : null)
          || (typeof authorization?.status === "string" ? authorization.status : null)
          || result.goalAdmissionStatus
          || result.dispatchStatus;
        const ownerAction = typeof authorization?.ownerAction === "string" ? authorization.ownerAction : null;
        const terminalRun = authorization?.status === "RUN_TERMINAL_FAILED" || authorization?.status === "RUN_TERMINAL_CLOSED";
        toast.error(terminalRun
          ? ownerAction ?? "Run เดิมปิดแล้ว ให้สร้าง Goal ใหม่เพื่อทำงานต่อจาก Project และ Workspace เดิม"
          : simpleMode ? ownerAction ?? "ยังทำงานเดิมต่อไม่ได้ โปรดตรวจสอบความพร้อมของ Runner แล้วลองอีกครั้ง" : `ยังทำ DevelopmentRun เดิมต่อไม่ได้ · ${reasonText}`);
      }
    } catch (error) {
      if (continuationResumeAttempt.current === runId) setContinuationNotice("พบ Run เดิมแล้ว แต่ระบบส่งทำงานต่อไม่สำเร็จ โปรดตรวจข้อความแจ้งเตือนและสถานะใน Task Control");
      toast.error(presentCustomerError(error, "ทำ DevelopmentRun เดิมต่อไม่สำเร็จ"));
    }
  }

  async function restartPlatformRunWithoutTenantBudget(run: {
    runId: string;
    workPackageId: string | null;
    workPackageExternalId: string | null;
    specId: string | null;
  }) {
    if (!conversationId || !isAdmin || !platformWorkspaceSelected || requestKind !== "development" || preparing || startMutation.isPending) return;
    setPreparing(true);
    try {
      const refreshedWorkspaces = await workspacesQuery.refetch();
      const currentPlatformWorkspace = refreshedWorkspaces.data?.workspaces.find(workspace =>
        workspace.runnerId === selectedWorkspace?.runnerId
        && workspace.workspaceId === selectedWorkspace?.workspaceId
        && workspace.scope === "PLATFORM_ENGINEERING"
        && Boolean(workspace.canonicalProjectId),
      );
      if (!currentPlatformWorkspace) {
        throw new Error("PLATFORM_ENGINEERING_WORKSPACE_BINDING_REQUIRED");
      }
      await bindMutation.mutateAsync({
        conversationId,
        runnerId: currentPlatformWorkspace.runnerId,
        workspaceId: currentPlatformWorkspace.workspaceId,
      });
      await workspaceQuery.refetch();
      const prepared = await prepareMutation.mutateAsync({ conversationId, mode: "spec_set" });
      setPreparation(prepared);
      const workPackage = prepared.workPackages?.find(item =>
        item.id === run.workPackageId || item.externalId === run.workPackageExternalId,
      );
      if (!workPackage) {
        toast.error("ไม่พบ WorkPackage เดิมใน Spec Set ล่าสุด โปรดตรวจหรือซิงก์ SPEC ก่อนเริ่ม Run ใหม่");
        return;
      }
      if (!prepared.runnableWorkPackageIds.includes(workPackage.id)) {
        toast.error("WorkPackage เดิมยังไม่พร้อมเริ่ม ตรวจ blocker และ source preflight ในแผนล่าสุดก่อน");
        return;
      }
      if (run.specId && effectiveSpecSource === "catalog" && !availableFeatureSpecs.some(spec => spec.id === run.specId)) {
        toast.error("SPEC เดิมไม่อยู่ใน Catalog ที่พร้อมใช้กับ Workspace นี้ โปรดเลือกหรือซิงก์ SPEC ก่อน");
        return;
      }
      await startWorkPackage(
        workPackage.id,
        conversationId,
        prepared,
        `platform-provider-managed-restart:${run.runId}:${prepared.planRevision}`,
        { mode: "spec_set", requestedSpecId: run.specId, skipAdditionalInstructions: true },
      );
    } catch (error) {
      toast.error(presentCustomerError(error, "เตรียม Run ระบบต่อจาก SPEC เดิมไม่สำเร็จ"));
    } finally {
      setPreparing(false);
    }
  }

  async function cancelAndRestartUnclaimedLegacyRun(run: {
    runId: string;
    workPackageId: string | null;
    workPackageExternalId: string | null;
    specId: string | null;
    workerJobCanCancelAsUnclaimed?: boolean;
  }) {
    if (!conversationId || !run.workerJobCanCancelAsUnclaimed || cancelUnclaimedLegacyRunMutation.isPending) return;
    try {
      const result = await cancelUnclaimedLegacyRunMutation.mutateAsync({ conversationId, runId: run.runId });
      if (!result.canceled) {
        toast.error(result.ownerAction ?? "คิวงานเปลี่ยนสถานะแล้ว โปรดตรวจสถานะ Worker ก่อนเริ่ม Run ใหม่");
        await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId });
        return;
      }
      await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId });
      await restartPlatformRunWithoutTenantBudget(run);
    } catch (error) {
      toast.error(presentCustomerError(error, "ยกเลิกคิวเก่าหรือเริ่ม Run แบบ Provider ไม่สำเร็จ"));
      await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId });
    }
  }

  async function requestCancelLegacyWorkerJob(run: { jobId: string | null }) {
    if (!run.jobId || cancelLegacyWorkerJobMutation.isPending) return;
    try {
      await cancelLegacyWorkerJobMutation.mutateAsync({ jobId: run.jobId });
      toast.success("ส่งคำสั่งหยุด Worker Job เดิมแล้ว; รอให้สถานะปิดก่อนเริ่ม Provider Run ใหม่");
      if (conversationId) {
        await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId });
      }
      await trpcUtils.workerJobs.observability.invalidate();
    } catch (error) {
      toast.error(presentCustomerError(error, "ส่งคำสั่งหยุด Worker Job เดิมไม่สำเร็จ"));
      if (conversationId) {
        await trpcUtils.spec226DevelopmentControl.getConversationWorkspace.invalidate({ conversationId });
      }
    }
  }

  useEffect(() => {
    if (!resumeSpecId || !conversationId || !canonicalHandoff || !workspaceQuery.data) return;
    const nextWorkUnit = canonicalHandoff.nextReadyWorkunit;
    const matchingRun = nextWorkUnit
      ? workspaceQuery.data.developmentRuns?.find(run => run.workPackageExternalId === nextWorkUnit)
      : undefined;
    if (!matchingRun) {
      setContinuationNotice(`โหลด SPEC-${resumeSpecId} ใน Project เดิมแล้ว แต่ยังไม่พบ DevelopmentRun ที่ตรงกับ WorkUnit ถัดไป${nextWorkUnit ? ` (${nextWorkUnit})` : ""}; ระบบยังไม่สร้างงานใหม่อัตโนมัติ`);
      return;
    }
    if (platformWorkspaceSelected && matchingRun.economicsMode !== "provider_managed") {
      const oldRunClosed = ["failed", "cancelled", "expired"].includes(matchingRun.workerJobStatus ?? "")
        || (!matchingRun.workerJobStatus && ["FAILED_TERMINAL", "CANCELLED"].includes(matchingRun.state));
      setContinuationNotice(oldRunClosed
        ? `พบ Run เก่าของ WorkUnit ${nextWorkUnit} ที่ยังผูก tenant budget รุ่นเดิม ระบบจะเก็บประวัติไว้และไม่ resume grant เก่า; เลือก “เริ่ม Run ใหม่ · ใช้โควต้า Provider” ในรายการงาน`
        : `พบ Run เก่าของ WorkUnit ${nextWorkUnit} ที่ยังผูก tenant budget รุ่นเดิม ระบบไม่เปลี่ยน grant เก่า: ถ้า Worker ยังไม่ claim ให้ยกเลิกคิวและเริ่ม Run ใหม่แบบ Provider จากรายการด้านล่าง; ถ้ารับงานแล้ว ให้ตรวจสถานะหรือยกเลิกจาก Worker Jobs ก่อนเริ่มซ้ำ`);
      return;
    }
    if (["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(matchingRun.state)) {
      setContinuationNotice(`พบ Run เดิมของ WorkUnit ${nextWorkUnit} แต่สถานะ ${developmentRunStateLabel(matchingRun.state)} ไม่สามารถ resume ได้`);
      return;
    }
    if (continuationResumeAttempt.current === matchingRun.runId) return;
    continuationResumeAttempt.current = matchingRun.runId;
    setContinuationNotice(`พบ WorkUnit ${nextWorkUnit} ใน Project เดิม กำลังตรวจสิทธิ์และส่ง Run เดิมทำงานต่อ`);
    void resumeExistingRun(matchingRun.runId, matchingRun.conversationId ?? conversationId);
  }, [resumeSpecId, conversationId, canonicalHandoff?.nextReadyWorkunit, platformWorkspaceSelected, workspaceQuery.data?.developmentRuns]);

  return (
    <section id="task-control-workspace" className="mb-4 rounded-lg border border-[var(--color-border)] p-3" aria-labelledby="spec224-workspace-heading">
      {pilotMode ? (
        <Section variant="transparent" padding={3} role="region" aria-label="First Run Pilot scope and status">
          <VStack gap={3}>
            <VStack gap={1}>
              <Heading level={3}>First Run Pilot · Development Goal</Heading>
              <AstryxText as="p" type="supporting">ใช้ Goal review และ Task Control มาตรฐาน โดยกำหนดขอบเขต Pilot ไว้ตายตัวและขออนุมัติก่อนเริ่ม</AstryxText>
            </VStack>
            <AstryxText as="p"><strong>Write scope:</strong> apps/runner-app/tests/spec224-live-pilot/** เท่านั้น · ใช้โควต้า Provider ของ Runner</AstryxText>
            <AstryxText as="p" type="supporting" role="status">Runner {selectedRunnerOnlineAndTrusted ? "ออนไลน์และ trusted" : "ยังไม่พร้อม"} · execution readiness {pilotRunnerExecutionReady ? "ผ่าน" : "ยังไม่ผ่าน"}{!pilotRunnerExecutionReady && pilotNotReadyReason ? ` · ${pilotNotReadyReason}` : ""}</AstryxText>
            <VStack as="ol" gap={1}>
              <li><AstryxText as="p">Implement utility และ unit tests ใน scope แล้วรันทดสอบจริง</AstryxText></li>
              <li><AstryxText as="p">Review edge cases และรันชุดทดสอบอีกครั้งหลังมี receipt สำเร็จ</AstryxText></li>
              <li><AstryxText as="p">Final Verify จากหลักฐานไฟล์, tests, receipts และ settlement</AstryxText></li>
            </VStack>
            {pilotSubmission ? (
              <AstryxText as="p" type="supporting" role="status">ส่ง Goal แล้ว · {pilotSubmission.dispatchStatus.replaceAll("_", " ")} · DevelopmentRun {pilotSubmission.runId}{pilotSubmission.approvalRef ? ` · Approval ${pilotSubmission.approvalRef}` : ""} · ปิดการสร้างซ้ำระหว่างซิงก์ข้อมูล</AstryxText>
            ) : null}
            {hasExistingPilotRun ? (
              <AstryxText as="p" type="supporting" role="status">พบ Pilot Run ที่บันทึกแล้ว · ปิดการสร้าง Goal ซ้ำ และแสดงสถานะ/การทำงานต่อในรายการ DevelopmentRun ด้านล่าง</AstryxText>
            ) : null}
            {pilotRuns.length ? (
              <Section variant="outlined" padding={3} role="region" aria-label="First Run Pilot execution status">
                <VStack gap={2}>
                  {pilotRuns.map(run => (
                    <VStack key={run.runId} gap={1}>
                      <AstryxText as="p" weight="semibold">{developmentRunStateLabel(run.state)} · DevelopmentRun {run.runId}</AstryxText>
                      {run.goalApproval?.approvalRef ? <AstryxText as="p" type="supporting">Approval Authority request: {run.goalApproval.approvalRef} · {run.goalApproval.status ?? "สถานะไม่ระบุ"}</AstryxText> : null}
                      <AstryxText as="p" type="supporting">Final Verify: {run.finalVerifyStatus ?? "ยังไม่มีผล"} · execution evidence refs {run.intermediateReceipts?.length ?? 0}{run.economicsMode === "provider_managed" ? " · ใช้โควต้า Provider ไม่มี tenant budget" : run.budgetStatus ? ` · tenant budget ${run.budgetStatus.currency} ${(run.budgetStatus.limitMinorUnits / 100).toFixed(2)} · captured ${(run.budgetStatus.capturedMinorUnits / 100).toFixed(2)} · held ${(run.budgetStatus.heldMinorUnits / 100).toFixed(2)}` : ""}</AstryxText>
                    </VStack>
                  ))}
                </VStack>
              </Section>
            ) : null}
            {pilotRuns.filter(run => run.goalApproval?.status === "pending").map(run => {
              const request = pilotApprovalsQuery.data?.requests?.find((item: any) => item.id === run.goalApproval?.approvalRef);
              return (
                <Section key={run.runId} variant="outlined" padding={3} role="region" aria-label="อนุมัติ Goal Pilot">
                  <VStack gap={2}>
                    <AstryxText as="p">Goal รอผู้อนุมัติที่มีสิทธิ์ตรวจสอบ · {run.goalApproval?.approvalRef}</AstryxText>
                    {request ? (
                      <>
                        <AstryxText as="p">{request.title}</AstryxText>
                        <HStack gap={2} wrap="wrap">
                          <Button type="button" size="sm" disabled={approvePilotMutation.isPending} onClick={() => approvePilotMutation.mutate({ requestId: request.id, decision: "approved", comment: "Approved bounded SPEC-224 First Run Goal." })}>อนุมัติ Goal</Button>
                          <Button type="button" size="sm" variant="destructive" disabled={approvePilotMutation.isPending} onClick={() => approvePilotMutation.mutate({ requestId: request.id, decision: "rejected", comment: "Rejected bounded SPEC-224 First Run Goal." })}>ปฏิเสธ Goal</Button>
                        </HStack>
                      </>
                    ) : <AstryxLink as={RouterLink} href="/dashboard#pending-approvals" isStandalone>เปิดคิว Approval Authority ของบัญชีผู้อนุมัติ</AstryxLink>}
                  </VStack>
                </Section>
              );
            })}
          </VStack>
        </Section>
      ) : null}
      {platformWorkspace ? (
        <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="SmartAIHub Platform Development">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Platform Engineering</p>
          <h2 id="spec224-workspace-heading" className="mt-1 text-lg font-semibold text-slate-950">พัฒนาระบบ SmartAIHub</h2>
          <p className="mt-1 text-sm text-slate-700">Project: {selectedWorkspace?.canonicalProjectTitle ?? platformWorkspace.canonicalProjectTitle ?? platformWorkspace.displayName} · Runner: {selectedRunner?.displayName ?? "เลือก Runner"} · Harness: {effectiveHarnessAdapterId ? harnessLabel(effectiveHarnessAdapterId) : "รอ Runner catalog"}</p>
          {selectedWorkspace?.deploymentTarget ? (
            <p className="mt-1 text-xs text-slate-700" role="status">
              เป้าหมายของ Workspace นี้: {selectedWorkspace.deploymentTarget.domain} · {selectedWorkspace.deploymentTarget.environment === "production" ? "Production" : "Development"}
              {selectedWorkspace.deploymentTarget.applicationAvailable ? " · runtime พร้อม" : " · runtime ยังไม่พร้อมสำหรับ UAT/deploy"}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-600" role="status">
            {platformWorkspaceSelected
              ? `เลือก ${selectedWorkspace?.displayName ?? "Platform workspace"} แล้ว`
              : "เลือก Platform workspace ที่ได้รับอนุญาตจากรายการ Runner ด้านล่าง เพื่อพัฒนา Canonical SPEC"}
          </p>
          {!platformWorkspaceSelected ? (
            <Button type="button" size="sm" variant="outline" className="mt-2" disabled={bindMutation.isPending || workspacesQuery.isFetching} onClick={selectCanonicalPlatformWorkspace}>
              ใช้ SmartAIHub Source Workspace
            </Button>
          ) : null}
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
            onChange={event => { preferencesTouched.current = true; setSelectedRunnerId(event.target.value); setSelected(""); setPreparation(null); }}
            disabled={runnersQuery.isLoading || creatingTask}
          >
            <option value="">เลือก Runner</option>
            {selectableRunners.map(runner => <option key={runner.runnerId} value={runner.runnerId}>{runnerOptionLabel(runner, t("taskControl.runnerOnline"), t("taskControl.runnerWaiting"))}</option>)}
          </select>
          {runnersQuery.error ? <p className="mt-2 text-xs text-rose-700" role="alert">โหลด Runner ไม่สำเร็จ โปรดลองใหม่หรือตรวจสอบสิทธิ์</p> : null}
          {selectedRunner ? (() => {
            const heartbeatAt = selectedRunner.lastSeenAt ? Date.parse(selectedRunner.lastSeenAt) : Number.NaN;
            const heartbeatFresh = Number.isFinite(heartbeatAt) && heartbeatAt <= Date.now() && Date.now() - heartbeatAt < 5 * 60_000;
            const online = selectedRunner.readinessStatus === "online" && selectedRunner.trustState === "trusted" && heartbeatFresh;
            return (
              <section className="mt-2 rounded-md bg-[var(--color-background-subtle)] px-3 py-2 text-xs" aria-label="สถานะ Runner ที่เลือก">
                <p className="font-medium">{selectedRunner.displayName} · {runnerPlatformLabel(selectedRunner.platform?.os)}{!simpleMode && selectedRunner.platform?.machineName ? ` · ${selectedRunner.platform.machineName}` : ""} · {online ? "ออนไลน์" : selectedRunner.trustState !== "trusted" ? "ยังไม่ trust" : "ออฟไลน์หรือ heartbeat เก่า"}</p>
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
            {selectableWorkspaces.map(workspace => (
              <option key={selectionKey(workspace)} value={selectionKey(workspace)}>
                {workspace.displayName}{workspace.deploymentTarget ? ` · ${workspace.deploymentTarget.domain}${workspace.deploymentTarget.applicationAvailable ? "" : " (runtime pending)"}` : ""}
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
          {selectedModularCoreCandidate && !selectedWorkspaceIsModularCoreBound ? (
            <section className="mt-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs" aria-label="เปิดใช้ Core Specs">
              <p className="font-medium text-sky-950">Workspace นี้เป็น Core สำหรับ aimarkethubs.com แต่ยังไม่ได้ผูกสิทธิ์ Platform Engineering</p>
              <p className="mt-1 text-sky-900">ผูก workspace นี้ก่อน แล้วรายการ Canonical SPEC-312–324 จะเปิดให้เลือกในหน้านี้</p>
              {isAdmin ? (
                <Button type="button" size="sm" className="mt-2" disabled={uploading || createModularCoreBindingMutation.isPending || workspacesQuery.isFetching} onClick={() => void enableSelectedModularCoreWorkspace()}>
                  {createModularCoreBindingMutation.isPending ? "กำลังผูก Core workspace…" : "ผูก Core workspace และโหลด SPEC-312–324"}
                </Button>
              ) : <p className="mt-2 text-amber-800">ให้ผู้ดูแลระบบผูก Core workspace นี้ก่อน</p>}
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
          {selectedWorkspace && requiresTenantLedger && (requestKind !== "development" || !hasUnfinishedDevelopmentRun) ? <Spec224EconomicLedgerSetup /> : null}
          {hasLegacyBudgetedPlatformRun ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">มี DevelopmentRun เดิมที่เริ่มก่อนเปลี่ยนนโยบาย และยังผูกกับ budget/Ledger ของ tenant; งานใหม่ใน Platform workspace จะใช้โควต้าบัญชี Provider</p> : null}

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
                  {workspacesQuery.isFetching ? "กำลังตรวจสอบ…" : "↻ ตรวจสอบ Catalog ล่าสุด"}
                </Button>
                </HStack>
                <Selector
                  label="Harness"
                  value={harnessPolicy === "auto" ? "auto" : selectedHarnessAdapterId}
                  options={[
                    { value: "auto", label: catalogHarnesses[0] ? `Auto · ${harnessLabel(catalogHarnesses[0])}` : "Auto — ใช้ Harness ที่ Runner ยืนยัน" },
                    ...catalogHarnesses.map(adapterId => ({ value: adapterId, label: harnessLabel(adapterId) })),
                  ]}
                  onChange={value => {
                    preferencesTouched.current = true;
                    if (value === "auto") {
                      setHarnessPolicy("auto");
                      setSelectedHarnessAdapterId("");
                    } else if (catalogHarnesses.includes(value)) {
                      setHarnessPolicy("explicit");
                      setSelectedHarnessAdapterId(value);
                    }
                  }}
                  placeholder="ยังไม่มี catalog จาก Runner"
                  isDisabled={!catalogFresh}
                  disabledMessage="รอ catalog ล่าสุดจาก Runner ก่อนเลือก Harness"
                  emptyText="Runner ยังไม่รายงาน Harness ที่รองรับ"
                  width="100%"
                />
                <AstryxText type="supporting">{t("taskControl.singleHarnessGoal")}</AstryxText>
                <Selector
                  label="AI Model"
                  value={modelPolicy === "auto" ? "auto" : selectedModelId}
                  options={[
                    { value: "auto", label: defaultModel ? `Auto · ${defaultModel.displayName}` : "Auto — ไม่มีรุ่นเริ่มต้นจาก Runner" },
                    ...catalogModels.map(model => ({ value: model.id, label: `${model.displayName}${model.isDefault ? " · Default" : ""}` })),
                  ]}
                  onChange={value => {
                      preferencesTouched.current = true;
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
                  isDisabled={!catalogFresh || catalogModels.length === 0}
                  width="100%"
                />
              <RadioList
                label="Reasoning Effort"
                value={supportedEffort}
                onChange={value => { preferencesTouched.current = true; setReasoningEffort(value); }}
                orientation="horizontal"
                isDisabled={!catalogFresh || availableEfforts.length === 0}
                description={availableEfforts.length ? "ระบบจะแสดงระดับที่รุ่นนี้รองรับเท่านั้น" : "รุ่นที่เลือกไม่ได้ประกาศระดับ reasoning"}
                htmlName="spec224-reasoning-effort"
              >
                {availableEfforts.map(effort => (
                  <RadioListItem key={effort} value={effort} label={effort.replace(/[-_]/g, " ").replace(/\b\w/g, character => character.toUpperCase())} />
                ))}
              </RadioList>
              {!catalogFresh ? (
                <AstryxText type="supporting" as="p" role="status">
                  {workspacesQuery.isFetching
                    ? "กำลังโหลด Model catalog ล่าสุดจาก Runner…"
                    : modelCatalog?.state === "error"
                      ? "Runner รายงานข้อผิดพลาดระหว่างค้นหา Model โปรดลองตรวจสอบใหม่"
                      : catalogExpired
                        ? "Model catalog หมดอายุแล้ว ระบบกำลังรอ snapshot ใหม่จาก Runner; ตัวเลือกจะเปิดเองเมื่อได้รับข้อมูลปัจจุบัน"
                        : "ยังไม่มี Model catalog ที่ยืนยันขอบเขตบัญชีและความใหม่จาก Runner โปรดตรวจสอบอีกครั้ง"}
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

          <fieldset className="mt-3 space-y-2" disabled={uploading || pilotMode}>
            <legend className="text-xs font-medium">สิ่งที่ต้องการทำ</legend>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={developmentInputMode === "prompt"} onChange={() => { setDevelopmentInputMode("prompt"); setPreparation(null); }} />
              {pilotMode ? "First Run Pilot · Development Goal" : "Prompt"}
            </label>
            {!pilotMode ? <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={developmentInputMode === "spec"} onChange={() => { setDevelopmentInputMode("spec"); setRequestKind("development"); if (canUseCanonicalSpecs) selectCanonicalPlatformWorkspace(); else setSpecSource("upload"); setPreparation(null); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("spec224-source-selection")?.scrollIntoView({ behavior: "smooth", block: "center" }))); }} />
              เลือกไฟล์ SPEC
            </label> : null}
            {!pilotMode ? <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="spec224-mode" checked={developmentInputMode === "spec_prompt"} onChange={() => { setDevelopmentInputMode("spec_prompt"); setRequestKind("development"); if (canUseCanonicalSpecs) selectCanonicalPlatformWorkspace(); else setSpecSource("upload"); setPreparation(null); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("spec224-source-selection")?.scrollIntoView({ behavior: "smooth", block: "center" }))); }} />
              SPEC + Prompt
            </label> : null}
            {!canUseCanonicalSpecs ? <p className="text-xs text-amber-800" role="status">ยังไม่พบ Platform Source Workspace ที่อนุญาต จึงเลือก SPEC ได้ด้วยการอัปโหลดไฟล์; รายการ Canonical SPEC จะแสดงเมื่อ Workspace นี้พร้อม</p> : null}
            {mode === "prompt" ? (
              <div className="flex flex-wrap gap-3 rounded-md bg-[var(--color-background-subtle)] p-2 text-xs">
                <span className="font-medium">ประเภทงาน</span>
                <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "development"} onChange={() => { setRequestKind("development"); setPreparation(null); }} />พัฒนาตาม prompt</label>
                {!pilotMode ? <label className="flex items-center gap-1"><input type="radio" name="spec224-request-kind" checked={requestKind === "mini_app"} onChange={() => { setRequestKind("mini_app"); setDevelopmentInputMode("prompt"); setPreparation(null); }} />สร้าง Mini App</label> : null}
              </div>
            ) : null}
            {freshGoal && !pilotMode ? (
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]" role="status">
                Goal ใหม่เริ่มจาก Prompt เพื่อพิมพ์สั่งงานได้ทันที; เลือก SPEC ได้เมื่อไฟล์นั้นอยู่ใน Workspace แล้ว
              </p>
            ) : null}
            <>
          {mode === "prompt" ? <Textarea id="spec224-development-inputs" aria-label={requestKind === "mini_app" ? "Mini App requirements" : "Spec 224 prompt"} value={prompt} onChange={pilotMode ? undefined : event => { setPrompt(event.target.value); setPreparation(null); }} readOnly={pilotMode} placeholder={requestKind === "mini_app" ? "อธิบายหน้าจอ ข้อมูล และพฤติกรรมของ Mini App ที่ต้องการ" : "อธิบายงานพัฒนาที่ต้องการ โดยจำกัดตาม Workspace และสิทธิ์ Goal ที่ได้รับอนุมัติ"} maxLength={requestKind === "mini_app" ? 3600 : 4000} className="min-h-20 resize-y text-sm" /> : null}
              {mode === "prompt" && requestKind === "development" && !pilotMode ? (
                <fieldset className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3" aria-label="สิทธิ์การแก้ไขใน Workspace">
                  <legend className="px-1 text-xs font-medium">สิทธิ์การแก้ไขใน Workspace</legend>
                  <label className="flex items-start gap-2 text-xs">
                    <input type="radio" name="spec224-workspace-access" value="workspace" checked={workspaceAccessMode === "workspace"} onChange={() => { setWorkspaceAccessMode("workspace"); setPreparation(null); }} />
                    <p><strong>อนุญาตทุกไฟล์ใน Workspace</strong><br />งานยังถูกจำกัดอยู่ใน Workspace ที่เลือก และต้องผ่าน Goal Grant, นโยบายค่าใช้จ่ายของ workspace และ Writer Lease</p>
                  </label>
                  <label className="flex items-start gap-2 text-xs">
                    <input type="radio" name="spec224-workspace-access" value="exclude_risky" checked={workspaceAccessMode === "exclude_risky"} onChange={() => { setWorkspaceAccessMode("exclude_risky"); setPreparation(null); }} />
                    <p><strong>อนุญาตทุกไฟล์ ยกเว้นรายการเสี่ยง (ค่าเริ่มต้น)</strong><br />Runner ปฏิเสธการเขียนไฟล์ environment, credential/secret, private key/certificate และ deployment/infrastructure ตามกฎของ Runner</p>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                    <input type="radio" name="spec224-workspace-access" disabled aria-label="ขออนุญาตก่อนแก้แต่ละรายการ ยังไม่พร้อม" />
                    <p><strong>ขออนุญาตก่อนแก้แต่ละรายการ</strong><br />ยังไม่เปิดให้เลือก: ต้องมีขั้นตอนพักงาน อนุมัติ diff และกู้คืนหลัง restart ที่ Runner รองรับก่อน</p>
                  </label>
                  <p className="text-xs text-[var(--color-text-secondary)]">ไม่ต้องระบุ path เอง การเปลี่ยนแปลงใน Workspace ใช้ candidate แยกและ Writer Lease เพื่อป้องกันงานเขียนทับกัน; งานที่ scope ชนกันจะไม่เขียนพร้อมกัน</p>
                </fieldset>
              ) : null}
              {requestKind === "mini_app" && mode === "prompt" ? (
                <p className="text-xs text-muted-foreground">
                  การสร้างและทดสอบ Preview ไม่ต้องใช้ Windows Runner หรือ GitHub ส่วน GitHub จะใช้เก็บ source ใน repo ส่วนตัวหลังมี artifact แล้ว หากยังไม่มี provider สำหรับสร้างแอป ให้ตั้งค่าได้ที่ <a className="underline" href="/settings?tab=localAi">Settings → Local AI</a>
                </p>
              ) : null}
              {requestKind === "development" && platformWorkspaceSelected ? (
                <section className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950" role="status" aria-label="Provider managed development usage">
                  งานพัฒนา SmartAIHub ใช้โควต้าของบัญชี Codex/Provider ที่เลือก ระบบไม่หักเครดิต SmartAIHub และไม่ต้องตั้ง Ledger หรือ budget cap ส่วน tenant workspace ยังคงใช้ budget ของ tenant
                </section>
              ) : null}
              {requestKind === "development" && !platformWorkspaceSelected ? (
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
            {mode === "spec_set" ? (
              <>
                {developmentInputMode === "spec_prompt" ? <Textarea aria-label="คำสั่งเพิ่มเติมสำหรับ SPEC" value={prompt} onChange={event => { setPrompt(event.target.value); setPreparation(null); }} placeholder="คำสั่งเพิ่มเติมภายใต้ขอบเขตและ write scope ของ SPEC" maxLength={4_000} className="min-h-20 resize-y text-sm" /> : null}
                <fieldset id="spec224-source-selection" className="space-y-2 rounded-md border border-[var(--color-border)] p-2" aria-label="Spec source">
                  <legend className="px-1 text-xs font-medium">เลือกแหล่ง Spec</legend>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="radio" name="spec224-source" checked={effectiveSpecSource === "upload"} onChange={() => setSpecSource("upload")} />
                    อัปโหลด Spec files
                  </label>
                  {canUseCanonicalSpecs ? (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="radio" name="spec224-source" checked={effectiveSpecSource === "catalog"} onChange={selectCanonicalPlatformWorkspace} />
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
                        onChange={event => { preferencesTouched.current = true; setSelectedFeatureSpec(event.target.value); }}
                        disabled={!platformWorkspaceSelected || bindMutation.isPending || featureSpecsQuery.isLoading || !featureSpecsQuery.data?.specs.length}
                        className="w-full rounded-md border border-[var(--color-border)] bg-background px-3 py-2 text-sm"
                      >
                        <option value="">เลือก Feature Spec</option>
                        {availableFeatureSpecs.map(spec => (
                          <option key={spec.id} value={spec.id}>{spec.title} · {spec.id}</option>
                        ))}
                      </select>
                      {featureSpecsQuery.isLoading ? <p role="status" className="text-xs text-[var(--color-text-secondary)]">กำลังโหลด Feature Specs…</p> : null}
                      {featureSpecsQuery.error ? <p role="alert" className="text-xs text-rose-700">โหลดรายการ Spec ไม่สำเร็จ: {sanitizePlatformDiagnostic(featureSpecsQuery.error.message)}</p> : null}
                      {!featureSpecsQuery.isLoading && !featureSpecsQuery.error && featureSpecsQuery.data?.specs.length === 0 ? <p role="status" className="text-xs text-amber-800">ไม่พบไฟล์ SPEC ใน catalog ของเว็บไซต์นี้ โปรดลองโหลดหน้าใหม่ หรือแจ้งผู้ดูแลให้ตรวจชุดไฟล์ SPEC ที่ติดตั้งบนเซิร์ฟเวอร์</p> : null}
                      {unavailableTargetSpecs.length > 0 ? <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">{unavailableTargetSpecs.length} Spec ถูกกำหนดให้พัฒนาใน workspace ของ {unavailableTargetDomain ?? "target อื่น"}. {hasWorkspaceForUnavailableTarget ? "เลือก Runner workspace ของ target นี้จากรายการด้านบน แล้ว Spec จะปรากฏ" : `ยังไม่มี Runner workspace ที่ได้รับอนุญาตสำหรับ ${unavailableTargetDomain ?? "target นี้"}; ต้องลงทะเบียนและผูก Runner กับ Core repository แยกจาก Runner ของ smartaihub.app ก่อน`}</p> : null}
                      {selectedFeatureSpec && featureSpecContextQuery.data ? <section className="rounded-md bg-[var(--color-background-subtle)] p-2 text-xs" aria-label="Canonical SPEC work context">
                        <p className="font-medium">{featureSpecContextQuery.data.title}</p>
                        {featureSpecContextQuery.data.summary ? <p className="mt-1">{featureSpecContextQuery.data.summary}</p> : null}
                        {featureSpecContextQuery.data.handoff.status === "CURRENT" ? <>
                          <p className="mt-2">สถานะ: พร้อมใช้ handoff · Next WorkUnit: {featureSpecContextQuery.data.handoff.nextReadyWorkunit ?? "ยังไม่กำหนด"}</p>
                          {featureSpecContextQuery.data.handoff.nextAction || featureSpecContextQuery.data.handoff.resumePoint ? <p className="mt-1">ขั้นถัดไป: {(featureSpecContextQuery.data.handoff.nextAction ?? featureSpecContextQuery.data.handoff.resumePoint ?? "").slice(0, 280)}{(featureSpecContextQuery.data.handoff.nextAction ?? featureSpecContextQuery.data.handoff.resumePoint ?? "").length > 280 ? "…" : ""}</p> : null}
                          {featureSpecContextQuery.data.handoff.openRequirements.length ? <details className="mt-2 rounded border border-[var(--color-border)] p-2">
                            <summary className="cursor-pointer font-medium">ดู Requirements ที่ยังเปิด ({featureSpecContextQuery.data.handoff.openRequirements.length})</summary>
                            <ul className="mt-2 list-inside list-disc space-y-1">
                              {featureSpecContextQuery.data.handoff.openRequirements.map(item => <li key={item.id}><strong>{item.id}:</strong> {item.text}{item.nextAction ? ` · ขั้นถัดไป: ${item.nextAction}` : ""}</li>)}
                            </ul>
                          </details> : null}
                        </> : <p role="alert" className="mt-2">handoff {featureSpecContextQuery.data.handoff.status}: {(featureSpecContextQuery.data.handoff.nextAction ?? "").slice(0, 280)}{(featureSpecContextQuery.data.handoff.nextAction?.length ?? 0) > 280 ? "…" : ""}</p>}
                        {!simpleMode ? <p className="mt-1 break-all">{featureSpecContextQuery.data.path} · SHA-256 {featureSpecContextQuery.data.digest}</p> : null}
                      </section> : null}
                      {selectedFeatureSpec ? <p className="break-all text-xs text-[var(--color-text-secondary)]">ต้นฉบับ: specs/feature/{selectedFeatureSpec}/spec.md</p> : null}
                      {selectedFeatureSpecIsModularProject ? (
                        <section className="space-y-2 rounded-md border border-[var(--color-border)] p-3" aria-label="นำเข้า Modular SaaS project">
                          <p className="font-medium">เริ่มงาน Modular SaaS ให้ถูก workspace</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">นำ Canonical Specs 312–324, handoff และ WorkPackages เข้ามาเป็น Spec Set ของ workspace เพื่อให้ระบบอ่านภาพรวมและเลือกงานที่พร้อมได้ การนำเข้านี้ยังไม่สั่ง Runner ให้พัฒนา; จะเริ่มเฉพาะ WorkPackage ที่เลือกหลังตรวจแผนและกดเริ่มงาน</p>
                          <p className={`rounded-md border p-2 text-xs ${modularSpecSetImported ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-950"}`} role="status" aria-live="polite">
                            {modularSpecSetImported
                              ? `นำเข้าแล้ว ${importedModularSpecCount}/13 Specs (312–324) · Spec Set revision ${specSet?.revision}`
                              : "ยังไม่พบ Specs 312–324 ใน Spec Set ของ workspace นี้ · ต้องนำเข้าก่อนจึงจะเตรียมและเริ่ม WorkPackage ได้"}
                          </p>
                          <Button type="button" variant="outline" disabled={!canImportModularProject} onClick={() => void ingestSelectedModularSaasProject()}>
                            {uploading || ingestModularSaasProjectMutation.isPending
                              ? "กำลังซิงก์ Specs เข้า workspace…"
                              : modularSpecSetImported
                                ? "ซิงก์ Specs 312–324 ล่าสุดเข้า workspace"
                                : "นำเข้า Specs 312–324 เข้า workspace"}
                          </Button>
                          {!canImportModularProject ? (
                            <>
                              <p className="text-xs text-amber-800" role="status">
                                {modularProjectImportPending ? "กำลังตรวจสอบ Runner และ workspace…" : modularProjectImportBlocker}
                              </p>
                              {modularCoreBindingNeedsRefresh && !modularProjectImportPending ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => void bindWorkspace(selectionKey(selectedWorkspace!))}>
                                  ผูก Core workspace ปัจจุบันอีกครั้ง
                                </Button>
                              ) : null}
                              {!modularProjectImportPending ? <p className="text-xs"><AstryxLink as={RouterLink} href="/chat" isStandalone>ไปสั่งงานใน Chat ปกติ</AstryxLink></p> : null}
                            </>
                          ) : null}
                          {canImportModularProject && modularCoreBindingNeedsRefresh ? (
                            <>
                              <p className="text-xs text-[var(--color-text-secondary)]" role="status">
                                นำเข้า Specs ได้โดยไม่ต้องรอ Runner; ก่อนเตรียมแผนหรือเริ่ม WorkPackage ให้ผูก snapshot ปัจจุบันอีกครั้ง
                              </p>
                              <Button type="button" size="sm" variant="outline" onClick={() => void bindWorkspace(selectionKey(selectedWorkspace!))}>
                                ผูก Core workspace ปัจจุบันอีกครั้ง
                              </Button>
                            </>
                          ) : null}
                        </section>
                      ) : (
                        <Button type="button" variant="outline" disabled={!platformWorkspaceSelected || bindMutation.isPending || !workspaceQuery.data?.workspace || !selectedFeatureSpec || uploading || ingestFeatureSpecMutation.isPending} onClick={() => void ingestSelectedFeatureSpec()}>
                          {uploading ? "กำลังเพิ่ม Spec ใน workspace…" : "เพิ่ม Spec ที่เลือกใน workspace"}
                        </Button>
                      )}
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
          {latestDevelopmentRuns.length ? (
            <section className="mt-3 rounded-md bg-[var(--color-background-subtle)] p-2" aria-label="DevelopmentRun ของ workspace นี้">
              <p className="text-xs font-medium">รายการล่าสุดของแต่ละ SPEC/WorkPackage · เรียงตาม Worker Job ของ phase ล่าสุด</p>
              <p className="mt-1 text-[var(--color-text-secondary)]">
                ประวัติ Run ก่อนหน้าดูได้ใน Task Control{hiddenDevelopmentRunCount > 0 ? ` · ซ่อนรายการซ้ำ ${hiddenDevelopmentRunCount} รายการ` : ""}
              </p>
              {continuationNotice ? <p className="mt-1 rounded border border-[var(--color-border)] p-2 text-xs" role="status">{continuationNotice}</p> : null}
              {requestKind === "development" && requiresTenantLedger && hasUnfinishedDevelopmentRun && user?.role === "admin" && !economicLedgerReadyForRun ? <Spec224EconomicLedgerSetup compact /> : null}
              <ul className="mt-2 list-none space-y-2 p-0 text-xs">
                {latestDevelopmentRuns.map((run, index) => {
                  const specLabel = run.specId
                    ? `${canonicalSpecIdLabel(run.specId)}${run.specTitle ? ` — ${run.specTitle}` : ""}`
                    : run.workPackageExternalId ?? "งานพัฒนาที่ไม่ได้บันทึก Spec ID";
                  const resumeLabel = `ทำงานต่อ ${run.specId ?? run.workPackageExternalId ?? `รายการ ${index + 1}`}`;
                  const legacyPlatformBudgetedRun = platformWorkspaceSelected && run.economicsMode !== "provider_managed";
                  const workerQueueWaitMs = run.workerJobIsInitial === false && run.workerJobStatus === "queued" && run.workerJobCanCancelAsUnclaimed && !run.workerJobStartedAt && run.workerJobCreatedAt
                    ? Math.max(0, Date.now() - Date.parse(run.workerJobCreatedAt))
                    : null;
                  const workerAdmissionWaitMs = run.workerJobIsInitial === false && run.workerJobStatus === "pending" && run.workerJobCanCancelAsUnclaimed
                    && run.goalApproval?.status !== "pending" && run.workerJobCreatedAt
                    ? Math.max(0, Date.now() - Date.parse(run.workerJobCreatedAt))
                    : null;
                  const initialWorkerQueueWaitMs = run.initialWorkerJobStatus === "queued"
                    && !run.initialWorkerJobStartedAt && run.initialWorkerJobCreatedAt
                    ? Math.max(0, Date.now() - Date.parse(run.initialWorkerJobCreatedAt))
                    : null;
                  const initialWorkerAdmissionWaitMs = run.initialWorkerJobStatus === "pending"
                    && run.goalApproval?.status !== "pending"
                    && !run.initialWorkerJobStartedAt && run.initialWorkerJobCreatedAt
                    ? Math.max(0, Date.now() - Date.parse(run.initialWorkerJobCreatedAt))
                    : null;
                  const initialWorkerCreationSkewMs = run.createdAt && run.initialWorkerJobCreatedAt
                    ? Math.abs(Date.parse(run.createdAt) - Date.parse(run.initialWorkerJobCreatedAt))
                    : null;
                  const legacyRunClosed = ["failed", "cancelled", "canceled", "expired", "succeeded", "completed"].includes(run.workerJobStatus ?? "")
                    || (!run.workerJobStatus && ["FAILED_TERMINAL", "CANCELLED"].includes(run.state));
                  const canStartProviderManagedReplacement = legacyPlatformBudgetedRun
                    && legacyRunClosed
                    && run.state !== "COMPLETED"
                    && run.goalApproval?.status !== "pending";
                  const canReplaceUnclaimedLegacyQueue = legacyPlatformBudgetedRun
                    && run.workerJobCanCancelAsUnclaimed
                    && run.state !== "COMPLETED"
                    && run.goalApproval?.status !== "pending";
                  const cancellableWorkerStatuses = [
                    "pending", "queued", "retry_scheduled", "leased", "running", "waiting_external",
                    "claimed", "preparing", "uploading", "publishing", "indexing",
                  ];
                  const canRequestCancelLegacyWorker = legacyPlatformBudgetedRun
                    && Boolean(run.jobId)
                    && !canReplaceUnclaimedLegacyQueue
                    && !legacyRunClosed
                    && !["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(run.state)
                    && run.goalApproval?.status !== "pending"
                    && cancellableWorkerStatuses.includes(run.workerJobStatus ?? "");
                  return (
                    <li key={run.runId} className="rounded-md border border-[var(--color-border)] p-3">
                      <p className="font-medium">คำสั่งจาก {run.specId ? specLabel : "SPEC ที่ไม่ได้บันทึกไว้"}</p>
                      <p className="mt-1 text-[var(--color-text-secondary)]">
                        Worker Job แรกสร้างเมื่อ {run.initialWorkerJobCreatedAt ? formatDevelopmentRunDate(run.initialWorkerJobCreatedAt) : "ไม่มีข้อมูลเวลา"}
                        {run.initialWorkerJobStartedAt ? ` · เริ่มทำงานเมื่อ ${formatDevelopmentRunDate(run.initialWorkerJobStartedAt)}` : " · ยังไม่มีเวลาเริ่มทำงาน"}
                        {` · Job phase ปัจจุบันสร้างเมื่อ ${run.workerJobCreatedAt ? formatDevelopmentRunDate(run.workerJobCreatedAt) : "ไม่มีข้อมูลเวลา"}`}
                        {run.workerJobStartedAt ? ` · เริ่มทำงานเมื่อ ${formatDevelopmentRunDate(run.workerJobStartedAt)}` : " · ยังไม่มีเวลาเริ่มทำงาน"}
                        {` · Run สร้างเมื่อ ${formatDevelopmentRunDate(run.createdAt)}`}
                        {run.workPackageExternalId ? ` · WorkPackage ${run.workPackageExternalId}` : ""}
                        {run.specSetRevision ? ` · Spec Set r${run.specSetRevision}` : ""}
                      </p>
                      {workerQueueWaitMs !== null && Number.isFinite(workerQueueWaitMs) && workerQueueWaitMs > 30_000 ? (
                        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
                          Job ของ phase ปัจจุบันอยู่ในคิวมาแล้ว {formatDevelopmentWaitDuration(workerQueueWaitMs)} โดยยังไม่มีเวลาเริ่มทำงาน
                        </p>
                      ) : null}
                      {workerAdmissionWaitMs !== null && Number.isFinite(workerAdmissionWaitMs) && workerAdmissionWaitMs > 30_000 ? (
                        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
                          Worker Job ยัง pending มาแล้ว {formatDevelopmentWaitDuration(workerAdmissionWaitMs)} และยังไม่เข้า queue; ปัญหาอยู่ก่อน dispatch ไม่ใช่เวลารอ Runner รับงาน
                        </p>
                      ) : null}
                      {initialWorkerQueueWaitMs !== null && Number.isFinite(initialWorkerQueueWaitMs) && initialWorkerQueueWaitMs > 30_000 ? (
                        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
                          Worker Job แรกของ Run อยู่ในคิวมาแล้ว {formatDevelopmentWaitDuration(initialWorkerQueueWaitMs)} โดยยังไม่เริ่มทำงาน
                        </p>
                      ) : null}
                      {initialWorkerAdmissionWaitMs !== null && Number.isFinite(initialWorkerAdmissionWaitMs) && initialWorkerAdmissionWaitMs > 30_000 ? (
                        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
                          Worker Job แรกยัง pending มาแล้ว {formatDevelopmentWaitDuration(initialWorkerAdmissionWaitMs)} และยังไม่เข้า queue; เวลานี้คือช่วงก่อน Worker รับคิว
                        </p>
                      ) : null}
                      {initialWorkerCreationSkewMs !== null && Number.isFinite(initialWorkerCreationSkewMs) && initialWorkerCreationSkewMs > 30_000 ? (
                        <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert">
                          เวลา Run กับ Worker Job แรกต่างกันเกิน 30 วินาที; ใช้เวลา Job แรกตรวจการส่งเข้าคิว ส่วน Job ของ phase ปัจจุบันอาจถูกสร้างทีหลังตามปกติ
                        </p>
                      ) : null}
                      {run.specSources?.length ? <p className="mt-1">แหล่ง Requirement ของ WorkPackage: {run.specSources.map(source => `${canonicalSpecIdLabel(source.specId)} · ${source.fileName}`).join(", ")}</p> : null}
                      {Array.isArray(run.workPackagePrerequisites) ? (
                        <p className="mt-1">WorkPackage ที่ต้องทำก่อน: {run.workPackagePrerequisites.length
                          ? run.workPackagePrerequisites.map(prerequisite => `${prerequisite.externalId}${prerequisite.specIds.length ? ` (${prerequisite.specIds.map(canonicalSpecIdLabel).join(", ")})` : ""}`).join(" → ")
                          : "ไม่มี dependency ที่ประกาศไว้"}</p>
                      ) : null}
                      {run.specFileNames?.length ? <p className="mt-1">ไฟล์ Spec: {run.specFileNames.join(", ")}</p> : null}
                      <p className="mt-1">
                        Run: {developmentRunStateLabel(run.state)} · Worker: {developmentWorkerJobStatusLabel(run.workerJobStatus)}
                        {run.workerJobAttempt ? ` · ครั้งที่ ${run.workerJobAttempt}` : ""}
                        {run.goalApproval?.status === "pending" ? " · รออนุมัติ Goal" : ""}
                        {run.runnerReadiness ? ` · Runner ${run.runnerReadiness.ready ? "พร้อม" : run.runnerReadiness.code}` : ""}
                        {run.budgetStatus?.limitMinorUnits ? ` · ${legacyPlatformBudgetedRun ? "tenant budget เดิม" : "งบ Goal"} USD ${(run.budgetStatus.limitMinorUnits / 100).toFixed(2)}` : ""}
                        {run.intermediateReceipts?.length ? ` · หลักฐาน ${run.intermediateReceipts.length}` : ""}
                      </p>
                      {legacyPlatformBudgetedRun ? <p className="mt-1 text-[var(--color-text-secondary)]" role="status">
                        Run นี้สร้างก่อนเปลี่ยนนโยบาย จึงยังเก็บ tenant budget เดิมไว้ในประวัติและจะไม่แก้ grant ย้อนหลัง
                        {canStartProviderManagedReplacement
                          ? " Run เดิมปิดแล้ว เริ่ม Run ใหม่จาก SPEC/WorkPackage เดิมได้ โดยใช้โควต้า Provider"
                          : canReplaceUnclaimedLegacyQueue
                            ? " Job นี้ยังไม่มี Worker claim จึงยกเลิกคิวเดิมอย่างปลอดภัยและเริ่ม Run ใหม่ด้วยโควต้า Provider ได้"
                            : run.state === "COMPLETED"
                              ? " งานนี้เสร็จแล้ว"
                              : run.goalApproval?.status === "pending"
                              ? " รอผลอนุมัติเดิมก่อน เพื่อป้องกันการสร้างงานซ้ำ"
                                : canRequestCancelLegacyWorker
                                  ? " Worker รับงานแล้ว; ส่งคำสั่งหยุด Job เดิมได้จากปุ่มด้านล่าง แล้วเริ่ม Provider Run ใหม่เมื่อ Job ปิดแล้ว"
                                  : " Job เดิมกำลังปิดหรือไม่อยู่ในสถานะที่ยกเลิกได้; รอสถานะล่าสุดก่อนเริ่ม Run ใหม่"}
                      </p> : null}
                      {!simpleMode ? <p className="mt-1 break-all text-[var(--color-text-secondary)]">
                        Run {run.runId}{run.jobId ? ` · Worker Job ${run.jobId}` : ""}
                        {run.workerJobErrorCode ? ` · Error ${run.workerJobErrorCode}` : ""}
                      </p> : null}
                      {legacyPlatformBudgetedRun && (canStartProviderManagedReplacement || canReplaceUnclaimedLegacyQueue) ? (
                        <Button type="button" variant="outline" size="sm" className="mt-2"
                          aria-label={`เริ่ม Run ใหม่แบบ Provider quota สำหรับ ${run.specId ?? run.workPackageExternalId ?? `รายการ ${index + 1}`}`}
                          disabled={preparing || startMutation.isPending || resumeRunMutation.isPending || cancelUnclaimedLegacyRunMutation.isPending || !boundWorkspace}
                          onClick={() => void (canReplaceUnclaimedLegacyQueue
                            ? cancelAndRestartUnclaimedLegacyRun(run)
                            : restartPlatformRunWithoutTenantBudget(run))}>
                          {preparing || startMutation.isPending || cancelUnclaimedLegacyRunMutation.isPending
                            ? "กำลังปิดคิวเก่าและเตรียม Run ใหม่…"
                            : canReplaceUnclaimedLegacyQueue
                              ? "ยกเลิกคิวที่ยังไม่มี Worker แล้วเริ่มใหม่ · Provider quota"
                              : "เริ่ม Run ใหม่ · ใช้โควต้า Provider"}
                        </Button>
                      ) : null}
                      {canRequestCancelLegacyWorker ? (
                        <Button type="button" variant="outline" size="sm" className="mt-2"
                          disabled={cancelLegacyWorkerJobMutation.isPending}
                          onClick={() => void requestCancelLegacyWorkerJob(run)}>
                          {cancelLegacyWorkerJobMutation.isPending ? "กำลังส่งคำสั่งหยุด Worker…" : "ส่งคำสั่งหยุด Worker Job เดิม"}
                        </Button>
                      ) : null}
                      {!(["COMPLETED", "CANCELLED", "FAILED_TERMINAL"].includes(run.state)) ? (
                        <Button type="button" variant="outline" size="sm" className="mt-2"
                          aria-label={resumeLabel}
                          hidden={legacyPlatformBudgetedRun}
                          disabled={resumeRunMutation.isPending || !boundWorkspace || (run.economicsMode !== "provider_managed" && !economicLedgerReadyForRun)}
                          onClick={() => void resumeExistingRun(run.runId, run.conversationId ?? conversationId)}>
                          {resumeRunMutation.isPending ? "กำลังตรวจสอบ…" : resumeLabel}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {continuationNotice && !workspaceQuery.data?.developmentRuns?.length ? <p className="mt-3 rounded-md border border-[var(--color-border)] p-2 text-xs" role="status">{continuationNotice}</p> : null}
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
            <Button type="button" className="mt-3 w-full" disabled={!workspaceQuery.data?.workspace || uploading || preparing || bindMutation.isPending || canonicalSpecSetMissing || (mode === "prompt" && !prompt.trim()) || (developmentInputMode !== "prompt" && effectiveSpecSource === "catalog" && (!platformWorkspaceSelected || featureSpecContextQuery.data?.handoff.status !== "CURRENT")) || (pilotMode && (hasExistingPilotRun || Boolean(pilotSubmission) || !isAdmin || !platformWorkspaceSelected || !pilotBindingMatchesSelection || !pilotRunnerExecutionReady || !catalogFresh || !activeModel || !supportedEffort))} onClick={() => void prepare()}>
              {uploading ? "กำลังบันทึก Spec revision…" : preparing ? "กำลังเตรียม…" : canonicalSpecSetMissing ? "นำเข้า Spec เข้า workspace ก่อน" : "เตรียมแผนและตรวจความพร้อม"}
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
              {effectiveSpecSource === "catalog" && selectedFeatureSpec ? <p className="mt-1 text-xs font-medium">คำสั่งจาก SPEC: {canonicalSpecIdLabel(selectedFeatureSpec)}{featureSpecs.find(spec => spec.id === selectedFeatureSpec)?.title ? ` — ${featureSpecs.find(spec => spec.id === selectedFeatureSpec)?.title}` : ""}</p> : null}
              <p className="mt-1 text-xs">ข้อกำหนด {preparation.requirementCount} · work packages ที่พร้อมเริ่ม {preparation.runnableWorkPackageIds.length}</p>
              {runnerReadiness ? (
                <Text role="status" type="supporting">
                  {simpleMode
                    ? runnerReadiness.ready
                      ? "เครื่องมือพร้อมให้ส่ง Goal เข้าตรวจสิทธิ์ก่อนเริ่ม"
                      : `เครื่องมือยังไม่พร้อม · ${readinessMessage(runnerReadiness.code, selectedRunner?.capabilityAckState, true)}`
                    : <>Codex: {runnerReadiness.code} · นโยบาย: {runnerReadiness.policyDecision === "pending" ? "รอประเมินตามขอบเขตของ Start" : runnerReadiness.policyDecision}{runnerReadiness.ownerAction ? ` · ${runnerReadiness.ownerAction}` : ""}</>}
                </Text>
              ) : null}
              {preparation.blockers.length ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{preparation.blockers.map((item, index) => <li key={`${item}-${index}`}>{simpleMode ? preparationBlockerMessage(item) : item}</li>)}</ul> : null}
              {effectiveSpecSource === "catalog" && canonicalHandoff?.status === "CURRENT" && preparation.runnableWorkPackageIds.length > 0 && !(preparation.workPackages ?? []).some(item => preparation.runnableWorkPackageIds.includes(item.id) && isNextReadyPackage(item)) ? <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950" role="alert">handoff ระบุ next WorkUnit เป็น “{nextReadyWorkunit ?? "ยังไม่กำหนด"}” แต่ไม่มี runnable package ที่ตรงกัน จึงปิดการเริ่มงานเพื่อป้องกันการทำ WorkUnit เก่าซ้ำ โปรด reconcile handoff ผ่าน writer กลางหรือเตรียม package ที่ตรงกัน</p> : null}
              {selectedHandoffPackage ? <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {packageRunOrder.pendingPrerequisites.length
                  ? `ลำดับที่ต้องทำ: ${packageRunOrder.pendingPrerequisites.map(item => `${item.externalId}${item.sourceSpecIds?.length ? ` (${item.sourceSpecIds.map(canonicalSpecIdLabel).join(", ")})` : ""}`).join(" → ")} → ${selectedHandoffPackage.externalId}`
                  : selectedHandoffPackage.prerequisitePlan?.length
                    ? `ลำดับที่ต้องทำ: ${selectedHandoffPackage.externalId} · งานที่ต้องทำก่อนครบแล้ว`
                    : `ลำดับที่ต้องทำ: ${selectedHandoffPackage.externalId} · ไม่มี WorkPackage dependency ที่ประกาศไว้`}
              </p> : null}
              {(preparation.workPackages ?? []).map((workPackage, index) => (
                <section key={workPackage.id} className="mt-2 border-t border-[var(--color-border)] pt-2" aria-label={simpleMode ? `งานส่วนที่ ${index + 1}` : `Work package ${workPackage.externalId}`}>
                  <p className="text-xs font-medium">{simpleMode ? `งานส่วนที่ ${index + 1}` : `${workPackage.externalId} · ${workPackage.readiness}`}</p>
                  {(workPackage as WorkspaceWorkPackage).sourceSpecIds?.length ? <p className="mt-1 text-xs text-[var(--color-text-secondary)]">แหล่ง Requirement: {(workPackage as WorkspaceWorkPackage).sourceSpecIds!.map(canonicalSpecIdLabel).join(", ")}</p> : null}
                  {(workPackage as WorkspaceWorkPackage).prerequisitePlan?.length ? <p className="mt-1 text-xs text-[var(--color-text-secondary)]">ต้องทำ WorkPackage ก่อนตามลำดับ: {(workPackage as WorkspaceWorkPackage).prerequisitePlan!.map(prerequisite => `${prerequisite.externalId}${prerequisite.specIds.length ? ` · ${prerequisite.specIds.map(canonicalSpecIdLabel).join(", ")}` : ""}`).join(" → ")}</p> : null}
                  {workPackage.blockers.length ? <ul className="mt-1 list-inside list-disc text-xs text-amber-800">{workPackage.blockers.map((item, index) => <li key={`${item}-${index}`}>{simpleMode ? preparationBlockerMessage(item) : item}</li>)}</ul> : null}
                  {workPackage.sourceAdmission?.status === "BLOCKED" ? <p className="mt-1 text-xs text-amber-800" role="status">{simpleMode ? "ขอบเขตงานยังทับกับไฟล์ที่เปลี่ยนอยู่ หรือข้อมูล source ยังไม่ครบ" : `Source preflight: ${workPackage.sourceAdmission.code}${workPackage.sourceAdmission.conflictingPaths?.length ? ` · ชนกับ ${workPackage.sourceAdmission.conflictingPaths.join(", ")}` : ""}`}</p> : null}
                  {workPackage.sourceAdmission?.status === "SAFE_DISJOINT_DIRTY" ? <p className="mt-1 text-xs text-emerald-800" role="status">{simpleMode ? "ไฟล์ที่เปลี่ยนอยู่แยกจากขอบเขตงานนี้" : `Source preflight: ขอบเขตไม่ชนไฟล์ที่เปลี่ยนอยู่ · ${workPackage.sourceAdmission.snapshotRevision}`}</p> : null}
                  {workPackage.sourceAdmission?.status === "SAFE_CANDIDATE_OVERLAY" ? <p className="mt-1 text-xs text-emerald-800" role="status">{simpleMode ? "Runner จะแยกพื้นที่ทำงานของงานนี้ และตรวจไฟล์ก่อนนำผลกลับ เพื่อรักษาการเปลี่ยนแปลงเดิมที่งานไม่ได้แก้" : `Source preflight: SAFE_CANDIDATE_OVERLAY · ${workPackage.sourceAdmission.dirtyPathCount ?? 0} existing changes protected by candidate CAS and execution lease · ${workPackage.sourceAdmission.snapshotRevision}`}</p> : null}
                  {((preparation.runnableWorkPackageIds.includes(workPackage.id) && (effectiveSpecSource !== "catalog" || isStartableForCurrentRequest(workPackage as WorkspaceWorkPackage) || isNextReadyPackage(workPackage))) || shouldOfferPromptStartAction(mode, simpleMode, workPackage.id)) ? (
                    <Button type="button" className="mt-2 w-full sm:w-auto" disabled={startMutation.isPending || !preparation.runnableWorkPackageIds.includes(workPackage.id) || !runnerReadiness?.ready || !preparation.runnerReadiness.ready || !economicLedgerReadyForRun || (requestKind === "development" && (!catalogFresh || !activeModel || !supportedEffort)) || !platformSourceIsSafe || (isPlatformWorkspace && !["SAFE_CLEAN", "SAFE_DISJOINT_DIRTY", "SAFE_CANDIDATE_OVERLAY"].includes(workPackage.sourceAdmission?.status ?? "BLOCKED")) || (effectiveSpecSource === "catalog" && isNextReadyPackage(workPackage) && packageRunOrder.pendingPrerequisites.length > 0) || (effectiveSpecSource === "catalog" && !isStartableForCurrentRequest(workPackage as WorkspaceWorkPackage) && !isNextReadyPackage(workPackage)) || (pilotMode && (hasExistingPilotRun || Boolean(pilotSubmission) || !isAdmin || !platformWorkspaceSelected || !pilotRunnerExecutionReady))} onClick={() => void startWorkPackage(workPackage.id)}>
                      {startMutation.isPending ? "กำลังส่งคำสั่ง…" : !preparation.runnableWorkPackageIds.includes(workPackage.id) ? "ยังเริ่มไม่ได้ · แก้เงื่อนไขด้านบนก่อน" : effectiveSpecSource === "catalog" && workPackage.id === packageRunOrder.nextPrerequisite?.id ? `ทำงานที่ต้องทำก่อน · ${workPackage.externalId}` : effectiveSpecSource === "catalog" && isNextReadyPackage(workPackage) && packageRunOrder.pendingPrerequisites.length > 0 ? `รอทำงานก่อน · ${packageRunOrder.pendingPrerequisites[0]?.externalId}` : mode === "prompt" || simpleMode ? "ส่ง Goal เพื่ออนุมัติและเริ่มงาน" : `สั่งพัฒนา ${workPackage.externalId}`}
                    </Button>
                  ) : null}
                </section>
              ))}
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Start จะบันทึกขอบเขต Goal และขออนุมัติผ่าน Approval Authority ก่อนส่ง Child แรก จากนั้นระยะถัดไปจะทำงานอัตโนมัติภายใน provider, workspace, source, write scope และเวลาที่อนุมัติไว้{platformWorkspaceSelected ? " โดยงานพัฒนา Platform ใช้โควต้า Provider ไม่หัก budget ของ tenant" : " และ budget ของ tenant ที่อนุมัติไว้"}</p>
            </section>
          ) : null}
    </section>
  );
}
