import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, BellRing, HeartHandshake, Hospital, LocateFixed, Siren } from "lucide-react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import {
  getSpec260ApiPath,
  getSpec260PagePath,
  matchSpec260PageRoute,
  SPEC260_PAGE_ROUTES,
} from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import EmergencyPublicMap from "@/components/emergency/EmergencyPublicMap";
import EmergencyPublicSearch from "@/components/emergency/EmergencyPublicSearch";
import EmergencyIntelWorkbench from "@/components/emergency/EmergencyIntelWorkbench";
import EmergencySponsorAllocationPanel from "@/components/emergency/EmergencySponsorAllocationPanel";
import EmergencyCaseReviewQueue from "@/components/emergency/EmergencyCaseReviewQueue";
import EmergencyContactAttemptPanel from "@/components/emergency/EmergencyContactAttemptPanel";
import EmergencyFederationPanel from "@/components/emergency/EmergencyFederationPanel";
import EmergencyLegalHoldPanel from "@/components/emergency/EmergencyLegalHoldPanel";
import EmergencyAlertManager from "@/components/emergency/EmergencyAlertManager";
import EmergencyPublicEntry from "@/components/emergency/EmergencyPublicEntry";
import { selectEmergencyRouteItems } from "@/pages/emergencyRouteData";

const pageTitles: Record<string, string> = {
  "public.overview": "overview.title",
  "public.map": "map.title",
  "public.alerts": "alerts.title",
  "public.event": "event.title",
  "public.facilities": "facilities.title",
  "public.report": "report.title",
  "public.reportCase": "report.caseTitle",
  "public.nearby": "nearby.title",
  "public.support": "support.title",
  "public.supportPool": "supportPool.title",
  "public.supportFunding": "supportFunding.title",
  "public.claims": "claims.title",
  "dashboard.emergency": "dashboard.title",
  "dashboard.cases": "cases.title",
  "dashboard.case": "case.title",
  "dashboard.respond": "respond.title",
  "dashboard.volunteer": "helper.title",
  "dashboard.command": "command.title",
  "dashboard.needs": "needs.title",
  "dashboard.tasks": "tasks.title",
  "dashboard.facilities": "facilityManagement.title",
  "dashboard.intelligence": "intelligence.title",
  "dashboard.federation": "federation.title",
  "dashboard.sponsorship": "sponsorship.title",
  "dashboard.privacy": "privacy.title",
  "dashboard.supportHistory": "supportHistory.title",
};

const pageDescriptions: Record<string, string> = {
  "public.overview": "overview.description",
  "public.map": "map.description",
  "public.alerts": "alerts.description",
  "public.event": "event.description",
  "public.facilities": "facilities.description",
  "public.report": "report.description",
  "public.reportCase": "report.caseDescription",
  "public.nearby": "nearby.description",
  "public.support": "support.description",
  "public.supportPool": "supportPool.description",
  "public.supportFunding": "supportFunding.description",
  "public.claims": "claims.description",
  "dashboard.emergency": "dashboard.description",
  "dashboard.cases": "cases.description",
  "dashboard.case": "case.description",
  "dashboard.respond": "respond.description",
  "dashboard.volunteer": "helper.description",
  "dashboard.command": "command.description",
  "dashboard.needs": "needs.description",
  "dashboard.tasks": "tasks.description",
  "dashboard.facilities": "facilityManagement.description",
  "dashboard.intelligence": "intelligence.description",
  "dashboard.federation": "federation.description",
  "dashboard.sponsorship": "sponsorship.description",
  "dashboard.privacy": "privacy.description",
  "dashboard.supportHistory": "supportHistory.description",
};

const pageApi: Record<string, string> = {
  "public.overview": "public.situations.list",
  "public.alerts": "public.alerts.list",
  "public.facilities": "public.facilities.list",
  "public.nearby": "public.nearby.list",
  "public.support": "public.support.list",
  "dashboard.cases": "auth.cases.list",
  "dashboard.emergency": "auth.cases.list",
  "dashboard.supportHistory": "auth.support.history",
  "dashboard.respond": "verified.response.assignments",
  "dashboard.command": "operations.command.cases",
  "dashboard.facilities": "operations.command.facilities",
  "public.claims": "public.claims",
  "dashboard.intelligence": "operations.intel.claims",
  "dashboard.federation": "operations.federation.partners",
  "dashboard.sponsorship": "sponsor.pools.list",
  "dashboard.privacy": "operations.privacy.holds",
};

const pageLinks = [
  "public.map",
  "public.nearby",
  "public.alerts",
  "public.report",
  "public.facilities",
  "public.support",
  "public.claims",
  "dashboard.emergency",
  "dashboard.cases",
  "dashboard.respond",
  "dashboard.volunteer",
  "dashboard.command",
  "dashboard.facilities",
  "dashboard.intelligence",
  "dashboard.federation",
  "dashboard.sponsorship",
  "dashboard.privacy",
  "dashboard.supportHistory",
] as const;

const publicMapActions = [
  { id: "public.report", icon: Siren, tone: "border-red-200 bg-red-50 text-red-950 hover:border-red-300 hover:bg-red-100" },
  { id: "public.alerts", icon: BellRing, tone: "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300 hover:bg-amber-100" },
  { id: "public.facilities", icon: Hospital, tone: "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300 hover:bg-sky-100" },
  { id: "public.nearby", icon: LocateFixed, tone: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-300 hover:bg-emerald-100" },
  { id: "public.support", icon: HeartHandshake, tone: "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-300 hover:bg-violet-100" },
] as const;

type CaseMessageView = { id: string; senderType: string; body: string; createdAt: string };

function mergeCaseMessagePages(existing: CaseMessageView[], incoming: CaseMessageView[]): CaseMessageView[] {
  const byId = new Map(existing.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, message));
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadReportEvidence(reportRef: string, token: string, files: readonly File[]): Promise<void> {
  for (const [index, file] of files.entries()) {
    const fileBytes = await file.arrayBuffer();
    const metadata = { sha256: await sha256Hex(fileBytes), mediaType: file.type.toLowerCase(), byteLength: file.size };
    const initResponse = await fetch(getSpec260ApiPath("public.report.evidence.create", { reportRef }), {
      method: "POST", credentials: "omit", headers: { "content-type": "application/json", "idempotency-key": `spec260-evidence:${reportRef}:${index}:${metadata.sha256}`,
        "x-emergency-case-token": token }, body: JSON.stringify(metadata),
    });
    if (!initResponse.ok) throw new Error("evidence_init_failed");
    const upload = await initResponse.json() as { evidenceId?: string; uploadUrl?: string; uploaded?: boolean; requiredHeaders?: Record<string, string> };
    if (!upload.evidenceId) throw new Error("evidence_upload_invalid");
    if (upload.uploaded) continue;
    if (!upload.uploadUrl) throw new Error("evidence_upload_url_missing");
    const putResponse = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.requiredHeaders, body: file });
    if (!putResponse.ok) throw new Error("evidence_put_failed");
    const completeResponse = await fetch(getSpec260ApiPath("public.report.evidence.complete", { reportRef, evidenceId: upload.evidenceId }), {
      method: "POST", credentials: "omit", headers: { "idempotency-key": `spec260-evidence-complete:${upload.evidenceId}`, "x-emergency-case-token": token },
    });
    if (!completeResponse.ok) throw new Error("evidence_complete_failed");
  }
}

export default function EmergencyRoutePage() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { t } = useScopedTranslation("emergency");
  const [reportText, setReportText] = useState("");
  const [reportLocation, setReportLocation] = useState<{ latitude: number; longitude: number; accuracyMeters?: number } | null>(null);
  const [reportLocationState, setReportLocationState] = useState<"idle" | "requesting" | "denied">("idle");
  const [reportSubmissionKey, setReportSubmissionKey] = useState(() => crypto.randomUUID());
  const [reportState, setReportState] = useState<"idle" | "submitting" | "accepted" | "unsubmitted">("idle");
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportEvidenceState, setReportEvidenceState] = useState<"idle" | "uploading" | "complete" | "failed" | "invalid">("idle");
  const [pendingEvidence, setPendingEvidence] = useState<{ reportRef: string; token: string } | null>(null);
  const [reportCaseState, setReportCaseState] = useState<"idle" | "loading" | "ready" | "unavailable" | "submitting" | "saved">("idle");
  const [reportCase, setReportCase] = useState<{ reportRef: string; token: string; status: string; summary: string; notes: Array<{ text?: string; createdAt?: string }> } | null>(null);
  const [continuationNote, setContinuationNote] = useState("");
  const [continuationKey, setContinuationKey] = useState(() => crypto.randomUUID());
  const [claimState, setClaimState] = useState<"idle" | "submitting" | "failed">("idle");
  const [contributionAmount, setContributionAmount] = useState("100");
  const [contributionMethod, setContributionMethod] = useState<"promptpay" | "card">("promptpay");
  const [contributionState, setContributionState] = useState<"idle" | "submitting" | "pending" | "needs-auth" | "unavailable">("idle");
  const [contributionCheckout, setContributionCheckout] = useState<{ paymentUrl?: string | null; qrCodeUrl?: string | null; status?: string } | null>(null);
  const [contributionKey, setContributionKey] = useState(() => crypto.randomUUID());
  const [nearbyCoordinates, setNearbyCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyState, setNearbyState] = useState<"idle" | "requesting" | "denied">("idle");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "unavailable" | "denied">("idle");
  const [capabilityState, setCapabilityState] = useState<"allowed" | "checking" | "denied" | "unavailable">("checking");
  const [capabilityLocation, setCapabilityLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [routeItems, setRouteItems] = useState<Array<Record<string, unknown>>>([]);
  const [summaryLocation, setSummaryLocation] = useState("");
  const [caseRevision, setCaseRevision] = useState<number | null>(null);
  const [canCommand, setCanCommand] = useState(false);
  const [navigationCapabilities, setNavigationCapabilities] = useState<string[]>([]);
  const [navigationGrants, setNavigationGrants] = useState<Array<{ capability: string; scopeType: string; scopeRef: string }>>([]);
  const [triageState, setTriageState] = useState<"idle" | "submitting" | "saved" | "review-required" | "unavailable">("idle");
  const [triageKey, setTriageKey] = useState(() => crypto.randomUUID());
  const [triageReason, setTriageReason] = useState("");
  const [needType, setNeedType] = useState("");
  const [needSubmissionKey, setNeedSubmissionKey] = useState(() => crypto.randomUUID());
  const [needDescription, setNeedDescription] = useState("");
  const [needQuantity, setNeedQuantity] = useState("");
  const [needFulfillmentQuantity, setNeedFulfillmentQuantity] = useState("");
  const [needSubmitState, setNeedSubmitState] = useState<"idle" | "submitting" | "saved" | "failed">("idle");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubmissionKey, setTaskSubmissionKey] = useState(() => crypto.randomUUID());
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskNeedId, setTaskNeedId] = useState("");
  const [taskSafetyClass, setTaskSafetyClass] = useState("professional_only");
  const [taskNeedOptions, setTaskNeedOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [verifiedResponders, setVerifiedResponders] = useState<Array<{ id: number; label: string; helperOptIn?: boolean }>>([]);
  const [selectedResponder, setSelectedResponder] = useState("");
  const [expectedContribution, setExpectedContribution] = useState("");
  const [taskAssignState, setTaskAssignState] = useState<"idle" | "submitting" | "failed">("idle");
  const [protocolReviewConfirmation, setProtocolReviewConfirmation] = useState<{ taskId: string; responderId: string; version: string } | null>(null);
  const [taskSubmitState, setTaskSubmitState] = useState<"idle" | "submitting" | "saved" | "failed">("idle");
  const [assignmentUpdateState, setAssignmentUpdateState] = useState<"idle" | "submitting" | "failed">("idle");
  const [actualContributionDraft, setActualContributionDraft] = useState<Record<string, string>>({});
  const [facilityType, setFacilityType] = useState("");
  const [facilitySubmissionKey, setFacilitySubmissionKey] = useState(() => crypto.randomUUID());
  const [facilityName, setFacilityName] = useState("");
  const [facilityDescription, setFacilityDescription] = useState("");
  const [facilityState, setFacilityState] = useState<"idle" | "submitting" | "saved" | "failed">("idle");
  const [caseMessages, setCaseMessages] = useState<CaseMessageView[]>([]);
  const [caseMessageCursor, setCaseMessageCursor] = useState<string | null>(null);
  const [caseMessageHasMore, setCaseMessageHasMore] = useState(false);
  const [caseMessageLoadingOlder, setCaseMessageLoadingOlder] = useState(false);
  const [caseMessageDraft, setCaseMessageDraft] = useState("");
  const [caseMessageSubmissionKey, setCaseMessageSubmissionKey] = useState(() => crypto.randomUUID());
  const [caseMessageState, setCaseMessageState] = useState<"idle" | "loading" | "ready" | "submitting" | "failed">("idle");
  const [caseEvidence, setCaseEvidence] = useState<Array<{ id: string; mediaType: string; byteLength: number; contentPath: string }>>([]);
  const [caseEvidenceFiles, setCaseEvidenceFiles] = useState<File[]>([]);
  const [caseEvidenceState, setCaseEvidenceState] = useState<"idle" | "uploading" | "ready" | "failed">("idle");
  const [helperOptIn, setHelperOptIn] = useState(false);
  const [helperLatitude, setHelperLatitude] = useState("");
  const [helperLongitude, setHelperLongitude] = useState("");
  const [helperJurisdiction, setHelperJurisdiction] = useState("");
  const [helperHours, setHelperHours] = useState("1");
  const [helperState, setHelperState] = useState<"idle" | "loading" | "saving" | "ready" | "failed">("idle");
  const [hazardCategory, setHazardCategory] = useState("unknown");
  const [hazardCode, setHazardCode] = useState("unknown");
  const [severity, setSeverity] = useState("unknown");
  const [caseStatus, setCaseStatus] = useState("triage");
  const [publicSummary, setPublicSummary] = useState("");
  const [caseJurisdictionRef, setCaseJurisdictionRef] = useState("");
  const [disclosureAssignments, setDisclosureAssignments] = useState<Array<{ id: string; status: string }>>([]);
  const [activeDisclosureGrants, setActiveDisclosureGrants] = useState<Array<{ id: string; resourceRef: string; fields: string[]; expiresAt: string }>>([]);
  const [selectedDisclosureAssignment, setSelectedDisclosureAssignment] = useState("");
  const [disclosureFields, setDisclosureFields] = useState<string[]>([]);
  const [disclosureSubmissionKey, setDisclosureSubmissionKey] = useState(() => crypto.randomUUID());
  const [disclosureState, setDisclosureState] = useState<"idle" | "saving" | "failed">("idle");
  const [publishToPublic, setPublishToPublic] = useState(false);
  const matched = useMemo(() => matchSpec260PageRoute(location), [location]);
  const pageId = matched?.route.id ?? "public.overview";
  const title = t(pageTitles[pageId] ?? "overview.title");
  const description = t(pageDescriptions[pageId] ?? "overview.description");
  const requiredCapability = matched?.route.access === "verified"
    ? "emergency.respond"
    : matched?.route.access === "operations"
      ? "emergency.command"
      : matched?.route.access === "sponsor"
        ? "emergency.sponsorship"
        : undefined;

  useEffect(() => {
    if (!isAuthenticated) { setNavigationCapabilities([]); setNavigationGrants([]); return; }
    const controller = new AbortController();
    void fetch(getSpec260ApiPath("auth.capabilities"), { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("emergency_capabilities_unavailable");
        const payload = await response.json() as { capabilities?: unknown; grants?: Array<{ capability?: unknown; scopeType?: unknown; scopeRef?: unknown }> };
        setNavigationCapabilities(Array.isArray(payload.capabilities) ? payload.capabilities.filter((item): item is string => typeof item === "string") : []);
        setNavigationGrants((payload.grants ?? []).filter((grant): grant is { capability: string; scopeType: string; scopeRef: string } =>
          typeof grant.capability === "string" && typeof grant.scopeType === "string" && typeof grant.scopeRef === "string"));
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNavigationCapabilities([]); setNavigationGrants([]);
      });
    return () => controller.abort();
  }, [isAuthenticated]);

  const canAccessPageLink = (id: string) => {
    const route = SPEC260_PAGE_ROUTES.find(candidate => candidate.id === id);
    if (!route || route.access === "public") return true;
    if (!isAuthenticated) return false;
    if (["authenticated"].includes(route.access)) return true;
    const capability = route.access === "verified" ? "emergency.respond" : route.access === "operations" ? "emergency.command" : "emergency.sponsorship";
    return navigationCapabilities.includes(capability) || navigationGrants.some(grant => grant.capability === capability &&
      ((grant.scopeType === "tenant" && grant.scopeRef === "tenant") || (id === "dashboard.respond" && grant.scopeType === "case")));
  };

  useEffect(() => {
    if (pageId !== "public.reportCase" || !matched?.params.reportRef) {
      setReportCase(null);
      setReportCaseState("idle");
      return;
    }
    const reportRef = matched.params.reportRef;
    const token = sessionStorage.getItem(`spec260:report:${reportRef}`);
    if (!token) {
      setReportCaseState("unavailable");
      return;
    }
    const controller = new AbortController();
    setReportCaseState("loading");
    void fetch(getSpec260ApiPath("public.report.continuation", { reportRef }), {
      credentials: "omit", cache: "no-store", signal: controller.signal,
      headers: { "x-emergency-case-token": token },
    }).then(async response => {
      if (!response.ok) throw new Error("report_case_unavailable");
      const payload = await response.json() as { item?: { status?: string; summary?: string; notes?: Array<{ text?: string; createdAt?: string }> } };
      setReportCase({ reportRef, token, status: payload.item?.status ?? "received", summary: payload.item?.summary ?? "", notes: payload.item?.notes ?? [] });
      setReportCaseState("ready");
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setReportCaseState("unavailable");
    });
    return () => controller.abort();
  }, [pageId, location]);

  useEffect(() => {
    if (pageId !== "dashboard.volunteer") return;
    const controller = new AbortController();
    setHelperState("loading");
    void fetch(getSpec260ApiPath("auth.helper.availability"), { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("helper_availability_unavailable");
        const payload = await response.json() as { item?: { optIn?: boolean; location?: { latitude?: number; longitude?: number } | null; jurisdictionRef?: string | null; availableUntil?: string | null } | null };
        const item = payload.item;
        setHelperOptIn(Boolean(item?.optIn));
        if (typeof item?.location?.latitude === "number") setHelperLatitude(String(item.location.latitude));
        if (typeof item?.location?.longitude === "number") setHelperLongitude(String(item.location.longitude));
        if (typeof item?.jurisdictionRef === "string") setHelperJurisdiction(item.jurisdictionRef);
        if (typeof item?.availableUntil === "string") {
          const hours = Math.max(1, Math.min(2, Math.round((Date.parse(item.availableUntil) - Date.now()) / 3_600_000)));
          setHelperHours(String(hours));
        }
        setHelperState("ready");
      }).catch(error => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setHelperState("failed");
      });
    return () => controller.abort();
  }, [pageId, location]);

  useEffect(() => {
    const caseId = pageId === "dashboard.tasks" ? matched?.params.caseId : undefined;
    if (!caseId || capabilityState !== "allowed" || capabilityLocation !== location) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(getSpec260ApiPath("operations.command.responders", { caseId }), { credentials: "include", cache: "no-store", signal: controller.signal }),
      fetch(getSpec260ApiPath("operations.command.needs", { caseId }), { credentials: "include", cache: "no-store", signal: controller.signal }),
    ]).then(async ([respondersResponse, needsResponse]) => {
      if (!respondersResponse.ok || !needsResponse.ok) throw new Error("task_options_unavailable");
      const [respondersPayload, needsPayload] = await Promise.all([respondersResponse.json(), needsResponse.json()]) as [
        { items?: Array<{ id?: unknown; label?: unknown; helperOptIn?: unknown }> }, { items?: Array<{ id?: unknown; type?: unknown; status?: unknown }> }
      ];
      const responders = (respondersPayload.items ?? []).filter((item): item is { id: number; label: string; helperOptIn?: boolean } => Number.isInteger(item.id) && typeof item.label === "string")
        .map(item => ({ ...item, helperOptIn: item.helperOptIn === true }));
      setVerifiedResponders(responders);
      setSelectedResponder(String(responders[0]?.id ?? ""));
      setTaskNeedOptions((needsPayload.items ?? []).filter((item): item is { id: string; type: string; status: string } =>
        typeof item.id === "string" && typeof item.type === "string" && typeof item.status === "string" && ["verified", "partially_fulfilled"].includes(item.status))
        .map(item => ({ id: item.id, label: item.type })));
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setVerifiedResponders([]);
      setTaskNeedOptions([]);
    });
    return () => controller.abort();
  }, [pageId, location, matched?.params.caseId, capabilityState, capabilityLocation]);

  useEffect(() => {
    if (pageId !== "dashboard.case" || !matched?.params.caseId) {
      setCaseMessages([]); setCaseMessageCursor(null); setCaseMessageHasMore(false); setCaseMessageState("idle"); return;
    }
    const controller = new AbortController();
    setCaseMessages([]); setCaseMessageCursor(null); setCaseMessageHasMore(false);
    setCaseMessageState("loading");
    void fetch(getSpec260ApiPath("auth.case.messages", { caseId: matched.params.caseId }), {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error("case_messages_unavailable");
      const payload = await response.json() as { items?: Array<{ id?: string; senderType?: string; body?: string; createdAt?: string }>; nextCursor?: unknown; hasMore?: boolean };
      setCaseMessages((payload.items ?? []).filter((item): item is CaseMessageView =>
        typeof item.id === "string" && typeof item.senderType === "string" && typeof item.body === "string" && typeof item.createdAt === "string"));
      setCaseMessageCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      setCaseMessageHasMore(payload.hasMore === true && typeof payload.nextCursor === "string");
      setCaseMessageState("ready");
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCaseMessageState("failed");
    });
    return () => controller.abort();
  }, [pageId, location]);

  useEffect(() => {
    if (!requiredCapability) {
      setCapabilityState("allowed");
      setCapabilityLocation(location);
      return;
    }
    const controller = new AbortController();
    setCapabilityState("checking");
    setCapabilityLocation("");
    void fetch(getSpec260ApiPath("auth.capabilities"), {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      if (response.status === 401 || response.status === 403) {
        setCapabilityState("denied");
        setCapabilityLocation(location);
        return;
      }
      if (!response.ok) throw new Error("capability_unavailable");
      const payload = await response.json() as { capabilities?: unknown; grants?: Array<{ capability?: unknown; scopeType?: unknown; scopeRef?: unknown }> };
      const capabilities = Array.isArray(payload.capabilities)
        ? payload.capabilities.filter((value): value is string => typeof value === "string")
        : [];
      const caseId = matched?.params.caseId;
      const poolId = matched?.params.poolId;
      const scopedGrant = payload.grants?.some(grant => grant.capability === requiredCapability &&
        ((grant.scopeType === "tenant" && grant.scopeRef === "tenant") ||
          (caseId && grant.scopeType === "case" && grant.scopeRef === caseId) ||
          (pageId === "dashboard.respond" && grant.scopeType === "case") ||
          (poolId && grant.scopeType === "support_pool" && grant.scopeRef === poolId)));
      setCapabilityState(capabilities.includes(requiredCapability) || scopedGrant ? "allowed" : "denied");
      setCapabilityLocation(location);
    }).catch(error => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCapabilityState("unavailable");
      setCapabilityLocation(location);
    });
    return () => controller.abort();
  }, [requiredCapability, location]);

  useEffect(() => {
    if (pageId !== "dashboard.case") {
      setCanCommand(false);
      return;
    }
    const controller = new AbortController();
    void fetch(getSpec260ApiPath("auth.capabilities"), {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      if (!response.ok) return setCanCommand(false);
      const payload = await response.json() as { capabilities?: unknown; grants?: Array<{ capability?: unknown; scopeType?: unknown; scopeRef?: unknown }> };
      const caseId = matched?.params.caseId;
      const scopedCommand = Boolean(caseId && payload.grants?.some(grant => grant.capability === "emergency.command" &&
        ((grant.scopeType === "tenant" && grant.scopeRef === "tenant") || (grant.scopeType === "case" && grant.scopeRef === caseId))));
      setCanCommand((Array.isArray(payload.capabilities) && payload.capabilities.includes("emergency.command")) || scopedCommand);
    }).catch(() => setCanCommand(false));
    return () => controller.abort();
  }, [pageId, location]);

  useEffect(() => {
    if (capabilityLocation !== location || capabilityState !== "allowed") {
      if (capabilityLocation !== location || capabilityState === "checking") {
        setLoadState("loading");
      } else if (capabilityState === "denied" || capabilityState === "unavailable") {
        setLoadState(capabilityState);
      }
      setSummary("");
      setRouteItems([]);
      setSummaryLocation("");
      return;
    }
    const endpoint = pageId === "public.nearby" && nearbyCoordinates
      ? `${getSpec260ApiPath("public.nearby.list")}?lat=${nearbyCoordinates.latitude}&lng=${nearbyCoordinates.longitude}&radiusMeters=5000`
      : pageId === "public.event" && matched?.params.publicRef
      ? getSpec260ApiPath("public.situation.detail", { publicRef: matched.params.publicRef })
      : (pageId === "public.supportPool" || pageId === "public.supportFunding") && matched?.params.poolId
        ? getSpec260ApiPath("public.support.detail", { poolId: matched.params.poolId })
      : (pageId === "dashboard.needs" || pageId === "dashboard.tasks") && matched?.params.caseId
        ? getSpec260ApiPath(pageId === "dashboard.needs" ? "operations.command.needs" : "operations.command.tasks", { caseId: matched.params.caseId })
      : pageId === "dashboard.case" && matched?.params.caseId
          ? getSpec260ApiPath("auth.case.detail", { caseId: matched.params.caseId })
          : pageApi[pageId] ? getSpec260ApiPath(pageApi[pageId]) : undefined;
    if (!endpoint) {
      setLoadState("idle");
      setSummary("");
      setSummaryLocation("");
      return;
    }
    const controller = new AbortController();
    setLoadState("loading");
    setSummary("");
    setRouteItems([]);
    setSummaryLocation("");
    if (pageId === "dashboard.case") {
      setTriageState("idle");
      setTriageKey(crypto.randomUUID());
      setHazardCategory("unknown");
      setHazardCode("unknown");
      setSeverity("unknown");
      setCaseStatus("triage");
      setPublicSummary("");
    }
    void fetch(endpoint, {
      credentials: matched?.route.access === "public" ? "omit" : "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setLoadState("denied");
          return;
        }
        if (!response.ok) throw new Error("unavailable");
        const payload: unknown = await response.json();
        const result = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
        const items = Array.isArray(result.items) ? result.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
        const item = result.item && typeof result.item === "object" ? result.item as Record<string, unknown> : null;
        // Detail endpoints return `item`, while list endpoints return `items`.
        // Keep all detail routes in the shared renderer so valid details are visible.
        setRouteItems(selectEmergencyRouteItems(pageId, item, items));
        setSummary(item ? [item.summary, item.message, item.status].filter(value => typeof value === "string").join(" · ") : "");
        if (pageId === "dashboard.case") {
          const item = (payload as { item?: { revision?: unknown; status?: unknown; context?: unknown; disclosureAssignments?: unknown; activeDisclosureGrants?: unknown } }).item;
          setCaseRevision(typeof item?.revision === "number" ? item.revision : null);
          const context = item?.context && typeof item.context === "object" ? item.context as Record<string, unknown> : {};
          const triage = context.triage && typeof context.triage === "object" ? context.triage as Record<string, unknown> : {};
          const disclosureItems = Array.isArray(item?.disclosureAssignments) ? item.disclosureAssignments : [];
          const activeGrants = Array.isArray(item?.activeDisclosureGrants) ? item.activeDisclosureGrants : [];
          setDisclosureAssignments(disclosureItems.filter((entry): entry is { id: string; status: string } => Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).id === "string" && typeof (entry as Record<string, unknown>).status === "string"));
          setActiveDisclosureGrants(activeGrants.filter((entry): entry is { id: string; resourceRef: string; fields: string[]; expiresAt: string } => Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).id === "string" && typeof (entry as Record<string, unknown>).resourceRef === "string" && Array.isArray((entry as Record<string, unknown>).fields) && typeof (entry as Record<string, unknown>).expiresAt === "string"));
          if (typeof item?.status === "string") setCaseStatus(item.status);
          if (typeof triage.hazardCategory === "string") setHazardCategory(triage.hazardCategory);
          if (typeof triage.hazardCode === "string") setHazardCode(triage.hazardCode);
          if (typeof triage.severity === "string") setSeverity(triage.severity);
          if (typeof triage.publicSummary === "string") setPublicSummary(triage.publicSummary);
          if (typeof triage.jurisdictionRef === "string") setCaseJurisdictionRef(triage.jurisdictionRef);
          const evidenceResponse = await fetch(getSpec260ApiPath("auth.case.evidence.list", { caseId: matched!.params.caseId! }), { credentials: "include", cache: "no-store", signal: controller.signal });
          if (evidenceResponse.ok) {
            const evidencePayload = await evidenceResponse.json() as { items?: Array<{ id?: unknown; mediaType?: unknown; byteLength?: unknown; contentPath?: unknown }> };
            setCaseEvidence((evidencePayload.items ?? []).filter((item): item is { id: string; mediaType: string; byteLength: number; contentPath: string } =>
              typeof item.id === "string" && typeof item.mediaType === "string" && typeof item.byteLength === "number" && typeof item.contentPath === "string"));
          }
        } else {
          setCaseRevision(null);
        }
        setSummaryLocation(location);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadState("unavailable");
      });
    return () => controller.abort();
  }, [pageId, location, capabilityState, capabilityLocation, nearbyCoordinates]);

  const submitTriage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || caseRevision === null || triageReason.trim().length < 8) return;
    setTriageState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.case.update", { caseId }), {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": triageKey },
        body: JSON.stringify({
          revision: caseRevision,
          status: caseStatus,
          hazardCategory,
          hazardCode,
          severity,
          ...(caseJurisdictionRef.trim() ? { jurisdictionRef: caseJurisdictionRef.trim() } : {}),
          ...(publicSummary.trim() ? { publicSummary: publicSummary.trim() } : {}),
          publishToPublic,
          reason: triageReason.trim(),
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: unknown };
        if (failure.error === "CASE_REVIEW_ITEMS_OPEN") { setTriageState("review-required"); return; }
        throw new Error("triage_update_failed");
      }
      setTriageKey(crypto.randomUUID());
      setTriageReason("");
      const refreshed = await fetch(getSpec260ApiPath("auth.case.detail", { caseId }), { credentials: "include", cache: "no-store" });
      if (!refreshed.ok) throw new Error("disclosure_refresh_failed");
      if (!refreshed.ok) throw new Error("triage_refresh_failed");
      const payload = await refreshed.json() as { item?: { revision?: number; status?: string; context?: unknown } };
      const item = payload.item;
      if (typeof item?.revision === "number") setCaseRevision(item.revision);
      if (typeof item?.status === "string") setCaseStatus(item.status);
      const context = item?.context && typeof item.context === "object" ? item.context as Record<string, unknown> : {};
      const triage = context.triage && typeof context.triage === "object" ? context.triage as Record<string, unknown> : {};
      if (typeof triage.publicSummary === "string") setPublicSummary(triage.publicSummary);
      setTriageState("saved");
    } catch {
      setTriageState("unavailable");
    }
  };

  const updateHelperAvailability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHelperState("saving");
    try {
      const optIn = helperOptIn;
      const response = await fetch(getSpec260ApiPath("auth.helper.availability.update"), {
        method: "PUT", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": `helper-availability:${crypto.randomUUID()}` },
        body: JSON.stringify(optIn ? { optIn: true, latitude: Number(helperLatitude), longitude: Number(helperLongitude),
          jurisdictionRef: helperJurisdiction.trim(), availableUntil: new Date(Date.now() + Number(helperHours) * 3_600_000).toISOString() } : { optIn: false }),
      });
      if (!response.ok) throw new Error("helper_availability_save_failed");
      setHelperState("ready");
    } catch { setHelperState("failed"); }
  };

  const submitNeed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || !needType.trim()) return;
    setNeedSubmitState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.need.create", { caseId }), {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": needSubmissionKey },
        body: JSON.stringify({ needType: needType.trim(), priority: "unknown", requestedQuantity: needQuantity ? Number(needQuantity) : undefined, description: needDescription.trim() || undefined }),
      });
      if (!response.ok) throw new Error("need_create_failed");
      const result = await response.json() as { needId?: string };
      setRouteItems(items => [{ id: result.needId, type: needType.trim(), status: "reported", priority: "unknown", requestedQuantity: needQuantity || null, fulfilledQuantity: "0", revision: 0 }, ...items]);
      setNeedType(""); setNeedDescription(""); setNeedQuantity(""); setNeedSubmissionKey(crypto.randomUUID()); setNeedSubmitState("saved");
    } catch { setNeedSubmitState("failed"); }
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || !taskTitle.trim()) return;
    setTaskSubmitState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.task.create", { caseId }), {
        method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": taskSubmissionKey },
        body: JSON.stringify({ taskType: "response", title: taskTitle.trim(), instructions: taskInstructions.trim() || undefined,
          needId: taskNeedId || undefined, safetyClass: taskSafetyClass }),
      });
      if (!response.ok) throw new Error("task_create_failed");
      const result = await response.json() as { taskId?: string; protocolVersion?: string; protocolActions?: string[] };
      setRouteItems(items => [{ id: result.taskId, title: taskTitle.trim(), type: "response", needId: taskNeedId || null, status: "ready", safetyClass: taskSafetyClass,
        details: { protocolVersion: result.protocolVersion, protocolActions: result.protocolActions ?? [] } }, ...items]);
      setTaskTitle(""); setTaskInstructions(""); setTaskNeedId(""); setTaskSubmissionKey(crypto.randomUUID()); setTaskSubmitState("saved");
    } catch { setTaskSubmitState("failed"); }
  };

  const assignResponder = async (item: Record<string, unknown>) => {
    if (typeof item.id !== "string" || !selectedResponder) return;
    const taskDetails = item.details && typeof item.details === "object" ? item.details as Record<string, unknown> : {};
    const protocolVersion = typeof taskDetails.protocolVersion === "string" ? taskDetails.protocolVersion : "";
    const reviewConfirmed = protocolReviewConfirmation?.taskId === item.id && protocolReviewConfirmation.responderId === selectedResponder && protocolReviewConfirmation.version === protocolVersion;
    if (!protocolVersion || !reviewConfirmed) return;
    const expected = Number(expectedContribution);
    const needId = typeof item.needId === "string" ? item.needId : null;
    if (needId && (!Number.isFinite(expected) || expected <= 0)) return;
    const key = `task:${item.id}:responder:${selectedResponder}:expected:${expectedContribution || "none"}`;
    setTaskAssignState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.task.assign", { taskId: item.id }), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ responderUserId: Number(selectedResponder), ...(needId ? { expectedContribution: expected } : {}), humanReviewConfirmed: true, protocolReviewVersion: protocolVersion, reason: "Operations assigned a verified responder after protocol review" }),
      });
      if (!response.ok) throw new Error("task_assign_failed");
      setRouteItems(items => items.map(current => current.id === item.id ? { ...current, status: "offered" } : current));
      setProtocolReviewConfirmation(null);
      setTaskAssignState("idle");
    } catch { setTaskAssignState("failed"); }
  };

  const updateTaskStatus = async (item: Record<string, unknown>, status: "ready" | "cancelled") => {
    if (typeof item.id !== "string" || typeof item.status !== "string") return;
    setTaskAssignState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.task.update", { taskId: item.id }), {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": `task:${item.id}:${item.status}:${status}` },
        body: JSON.stringify({ expectedStatus: item.status, status, reason: status === "cancelled" ? "Operations cancelled the offer after authority review" : "Operations reopened the task after safety review" }),
      });
      if (!response.ok) throw new Error("task_update_failed");
      setRouteItems(items => items.map(current => current.id === item.id ? { ...current, status } : current));
      setTaskAssignState("idle");
    } catch { setTaskAssignState("failed"); }
  };

  const updateResponderAssignment = async (item: Record<string, unknown>, status: string) => {
    if (typeof item.id !== "string" || typeof item.status !== "string") return;
    const actualContribution = actualContributionDraft[item.id] !== undefined ? Number(actualContributionDraft[item.id]) : item.expectedContribution;
    if (status === "completed" && typeof item.expectedContribution === "number" &&
      (!Number.isFinite(actualContribution) || Number(actualContribution) <= 0 || Number(actualContribution) > item.expectedContribution)) return;
    setAssignmentUpdateState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("verified.response.update", { assignmentId: item.id }), {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedStatus: item.status, status,
          ...(status === "completed" && typeof item.expectedContribution === "number" ? { actualContribution: Number(actualContribution) } : {}),
          reason: `Responder updated assignment to ${status}` }),
      });
      if (!response.ok) throw new Error("assignment_update_failed");
      setRouteItems(items => items.map(current => current.id === item.id ? { ...current, status } : current));
      setAssignmentUpdateState("idle");
    } catch { setAssignmentUpdateState("failed"); }
  };

  const createDisclosureGrant = async (event: FormEvent) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || !selectedDisclosureAssignment || disclosureFields.length === 0) return;
    setDisclosureState("saving");
    try {
      const response = await fetch(getSpec260ApiPath("auth.case.disclosure.create", { caseId }), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": disclosureSubmissionKey },
        body: JSON.stringify({ assignmentId: selectedDisclosureAssignment, fields: disclosureFields, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }),
      });
      if (!response.ok) throw new Error("disclosure_grant_failed");
      const refreshed = await fetch(getSpec260ApiPath("auth.case.detail", { caseId }), { credentials: "include", cache: "no-store" });
      const payload: unknown = await refreshed.json();
      const result = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const item = result.item && typeof result.item === "object" ? result.item as Record<string, unknown> : {};
      const grants = Array.isArray(item.activeDisclosureGrants) ? item.activeDisclosureGrants : [];
      setActiveDisclosureGrants(grants.filter((entry): entry is { id: string; resourceRef: string; fields: string[]; expiresAt: string } => Boolean(entry) && typeof entry === "object" && typeof (entry as Record<string, unknown>).id === "string" && typeof (entry as Record<string, unknown>).resourceRef === "string" && Array.isArray((entry as Record<string, unknown>).fields) && typeof (entry as Record<string, unknown>).expiresAt === "string"));
      setDisclosureSubmissionKey(crypto.randomUUID());
      setDisclosureState("idle");
    } catch { setDisclosureState("failed"); }
  };

  const revokeDisclosureGrant = async (grantId: string) => {
    const caseId = matched?.params.caseId;
    if (!caseId) return;
    setDisclosureState("saving");
    try {
      const response = await fetch(getSpec260ApiPath("auth.case.disclosure.revoke", { caseId, grantId }), { method: "DELETE", credentials: "include" });
      if (!response.ok) throw new Error("disclosure_revoke_failed");
      setActiveDisclosureGrants(current => current.filter(grant => grant.id !== grantId));
      setDisclosureState("idle");
    } catch { setDisclosureState("failed"); }
  };

  const updateNeedStatus = async (item: Record<string, unknown>, status: string) => {
    if (typeof item.id !== "string" || typeof item.revision !== "number") return;
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.need.update", { needId: item.id }), {
        method: "PATCH", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": `need:${item.id}:${status}:${item.revision}` },
        body: JSON.stringify({ expectedRevision: item.revision, status, reason: `Operations updated need to ${status}` }),
      });
      if (!response.ok) throw new Error("need_update_failed");
      setRouteItems(items => items.map(current => current.id === item.id ? { ...current, status, revision: Number(item.revision) + 1 } : current));
    } catch { setNeedSubmitState("failed"); }
  };

  const recordNeedFulfillment = async (item: Record<string, unknown>) => {
    if (typeof item.id !== "string" || typeof item.revision !== "number") return;
    const fulfilledQuantity = Number(needFulfillmentQuantity);
    if (!Number.isFinite(fulfilledQuantity) || fulfilledQuantity <= 0) return;
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.need.update", { needId: item.id }), {
        method: "PATCH", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": `need-fulfillment:${item.id}:${item.revision}:${fulfilledQuantity}` },
        body: JSON.stringify({ expectedRevision: item.revision, fulfilledQuantity, reason: "Operations recorded partial fulfillment" }),
      });
      if (!response.ok) throw new Error("need_fulfillment_failed");
      const requested = Number(item.requestedQuantity);
      const status = Number.isFinite(requested) && requested > 0 && fulfilledQuantity >= requested ? "fulfilled" : "partially_fulfilled";
      setRouteItems(items => items.map(current => current.id === item.id ? { ...current, status, fulfilledQuantity: String(fulfilledQuantity), revision: Number(item.revision) + 1 } : current));
      setNeedFulfillmentQuantity("");
    } catch { setNeedSubmitState("failed"); }
  };

  const submitFacility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!facilityType.trim() || !facilityName.trim()) return;
    setFacilityState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.facility.create"), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": facilitySubmissionKey },
        body: JSON.stringify({ facilityType: facilityType.trim(), name: facilityName.trim(), description: facilityDescription.trim(), capacityClass: "unknown" }),
      });
      if (!response.ok) throw new Error("facility_create_failed");
      const result = await response.json() as { facilityId?: string };
      setRouteItems(items => [{ id: result.facilityId, facilityType: facilityType.trim(), name: facilityName.trim(), description: facilityDescription.trim(), status: "unknown", updatedAt: new Date().toISOString() }, ...items]);
      setFacilityType(""); setFacilityName(""); setFacilityDescription(""); setFacilitySubmissionKey(crypto.randomUUID()); setFacilityState("saved");
    } catch { setFacilityState("failed"); }
  };

  const updateFacilityStatus = async (item: Record<string, unknown>, status: string) => {
    if (typeof item.id !== "string" || typeof item.updatedAt !== "string") return;
    const latitude = typeof item.latitudeDraft === "string" && item.latitudeDraft.trim() ? Number(item.latitudeDraft) : undefined;
    const longitude = typeof item.longitudeDraft === "string" && item.longitudeDraft.trim() ? Number(item.longitudeDraft) : undefined;
    if ((latitude === undefined) !== (longitude === undefined) || (latitude !== undefined && (!Number.isFinite(latitude) || !Number.isFinite(longitude)))) return;
    setFacilityState("submitting");
    try {
      const idempotencyKey = `facility:${item.id}:${status}:${item.updatedAt}:${latitude ?? "keep"}:${longitude ?? "keep"}`;
      const response = await fetch(getSpec260ApiPath("operations.command.facility.update", { facilityId: item.id }), {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedUpdatedAt: item.updatedAt, status, ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}), reason: `Operations set facility status to ${status}` }),
      });
      if (!response.ok) throw new Error("facility_update_failed");
      const refreshed = await fetch(getSpec260ApiPath("operations.command.facilities"), { credentials: "include", cache: "no-store" });
      if (!refreshed.ok) throw new Error("facility_refresh_failed");
      const payload = await refreshed.json() as { items?: Array<Record<string, unknown>> };
      setRouteItems(payload.items ?? []); setFacilityState("saved");
    } catch { setFacilityState("failed"); }
  };

  const sendCaseMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || !caseMessageDraft.trim()) return;
    setCaseMessageState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("auth.case.message.create", { caseId }), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": caseMessageSubmissionKey },
        body: JSON.stringify({ body: caseMessageDraft.trim() }),
      });
      if (!response.ok) throw new Error("case_message_create_failed");
      const refreshed = await fetch(getSpec260ApiPath("auth.case.messages", { caseId }), { credentials: "include", cache: "no-store" });
      if (!refreshed.ok) throw new Error("case_message_refresh_failed");
      const payload = await refreshed.json() as { items?: Array<{ id?: string; senderType?: string; body?: string; createdAt?: string }> };
      const latestMessages = (payload.items ?? []).filter((item): item is CaseMessageView =>
        typeof item.id === "string" && typeof item.senderType === "string" && typeof item.body === "string" && typeof item.createdAt === "string");
      setCaseMessages(current => mergeCaseMessagePages(current, latestMessages));
      setCaseMessageDraft(""); setCaseMessageSubmissionKey(crypto.randomUUID()); setCaseMessageState("ready");
    } catch { setCaseMessageState("failed"); }
  };

  const loadOlderCaseMessages = async () => {
    const caseId = matched?.params.caseId;
    if (!caseId || !caseMessageCursor || caseMessageLoadingOlder) return;
    setCaseMessageLoadingOlder(true);
    try {
      const url = `${getSpec260ApiPath("auth.case.messages", { caseId })}?cursor=${encodeURIComponent(caseMessageCursor)}`;
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("case_message_history_unavailable");
      const payload = await response.json() as { items?: Array<{ id?: string; senderType?: string; body?: string; createdAt?: string }>; nextCursor?: unknown; hasMore?: boolean };
      const olderMessages = (payload.items ?? []).filter((item): item is CaseMessageView =>
        typeof item.id === "string" && typeof item.senderType === "string" && typeof item.body === "string" && typeof item.createdAt === "string");
      setCaseMessages(current => mergeCaseMessagePages(current, olderMessages));
      setCaseMessageCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
      setCaseMessageHasMore(payload.hasMore === true && typeof payload.nextCursor === "string");
    } catch {
      setCaseMessageState("failed");
    } finally {
      setCaseMessageLoadingOlder(false);
    }
  };

  const uploadCaseEvidenceFiles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const caseId = matched?.params.caseId;
    if (!caseId || caseEvidenceFiles.length === 0) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "video/mp4", "video/webm"]);
    if (caseEvidenceFiles.some(file => file.size > 20 * 1024 * 1024 || !allowed.has(file.type.toLowerCase()))) {
      setCaseEvidenceState("failed");
      return;
    }
    setCaseEvidenceState("uploading");
    try {
      for (const [index, file] of caseEvidenceFiles.entries()) {
        const bytes = await file.arrayBuffer();
        const metadata = { sha256: await sha256Hex(bytes), mediaType: file.type.toLowerCase(), byteLength: file.size };
        const init = await fetch(getSpec260ApiPath("auth.case.evidence.create", { caseId }), {
          method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": `spec260-case-evidence:${caseId}:${index}:${metadata.sha256}` }, body: JSON.stringify(metadata),
        });
        if (!init.ok) throw new Error("evidence_init_failed");
        const target = await init.json() as { evidenceId?: string; uploadUrl?: string; uploaded?: boolean; requiredHeaders?: Record<string, string> };
        if (!target.evidenceId) throw new Error("evidence_upload_invalid");
        if (!target.uploaded) {
          if (!target.uploadUrl) throw new Error("evidence_upload_url_missing");
          const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.requiredHeaders, body: file });
          if (!put.ok) throw new Error("evidence_put_failed");
          const complete = await fetch(getSpec260ApiPath("auth.evidence.complete", { evidenceId: target.evidenceId }), {
            method: "POST", credentials: "include", headers: { "idempotency-key": `spec260-case-evidence-complete:${target.evidenceId}` },
          });
          if (!complete.ok) throw new Error("evidence_complete_failed");
        }
      }
      setCaseEvidenceFiles([]);
      setCaseEvidenceState("ready");
      const refreshed = await fetch(getSpec260ApiPath("auth.case.evidence.list", { caseId }), { credentials: "include", cache: "no-store" });
      if (refreshed.ok) {
        const payload = await refreshed.json() as { items?: Array<{ id?: unknown; mediaType?: unknown; byteLength?: unknown; contentPath?: unknown }> };
        setCaseEvidence((payload.items ?? []).filter((item): item is { id: string; mediaType: string; byteLength: number; contentPath: string } =>
          typeof item.id === "string" && typeof item.mediaType === "string" && typeof item.byteLength === "number" && typeof item.contentPath === "string"));
      }
    } catch { setCaseEvidenceState("failed"); }
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const allowedEvidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/webm", "video/mp4", "video/webm"]);
    if (reportFiles.some(file => file.size > 20 * 1024 * 1024 || !allowedEvidenceTypes.has(file.type.toLowerCase()))) {
      setReportEvidenceState("invalid");
      return;
    }
    setReportState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("public.report.create"), {
        method: "POST",
        credentials: "omit",
        headers: { "content-type": "application/json", "idempotency-key": reportSubmissionKey },
        body: JSON.stringify({ description: reportText, ...(reportLocation ? { location: reportLocation } : {}) }),
      });
      const result = await response.json() as { accepted?: unknown };
      if (response.ok && result.accepted === true) {
        const body = result as { reportRef?: string; continuationToken?: string };
        setReportState("accepted");
        setReportText("");
        setReportLocation(null);
        setReportSubmissionKey(crypto.randomUUID());
        if (body.reportRef && body.continuationToken) {
          sessionStorage.setItem(`spec260:report:${body.reportRef}`, body.continuationToken);
          if (reportFiles.length) {
            setReportEvidenceState("uploading");
            try {
              await uploadReportEvidence(body.reportRef, body.continuationToken, reportFiles);
              setReportEvidenceState("complete");
              setReportFiles([]);
              setLocation(getSpec260PagePath("public.reportCase", { reportRef: body.reportRef }));
            } catch {
              setReportEvidenceState("failed");
              setPendingEvidence({ reportRef: body.reportRef, token: body.continuationToken });
            }
          } else setLocation(getSpec260PagePath("public.reportCase", { reportRef: body.reportRef }));
        }
      } else {
        setReportState("unsubmitted");
      }
    } catch {
      setReportState("unsubmitted");
    }
  };

  const retryReportEvidence = async () => {
    if (!pendingEvidence || reportFiles.length === 0) return;
    setReportEvidenceState("uploading");
    try {
      await uploadReportEvidence(pendingEvidence.reportRef, pendingEvidence.token, reportFiles);
      setReportFiles([]);
      setReportEvidenceState("complete");
      setPendingEvidence(null);
      setLocation(getSpec260PagePath("public.reportCase", { reportRef: pendingEvidence.reportRef }));
    } catch { setReportEvidenceState("failed"); }
  };

  const captureReportLocation = () => {
    if (!navigator.geolocation) {
      setReportLocationState("denied");
      return;
    }
    setReportLocationState("requesting");
    navigator.geolocation.getCurrentPosition(position => {
      setReportLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude,
        ...(Number.isFinite(position.coords.accuracy) ? { accuracyMeters: Math.round(position.coords.accuracy) } : {}) });
      setReportLocationState("idle");
    }, () => setReportLocationState("denied"), { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
  };

  const submitContinuation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportCase || continuationNote.trim().length < 1) return;
    setReportCaseState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("public.report.update", { reportRef: reportCase.reportRef }), {
        method: "PATCH", credentials: "omit", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": continuationKey, "x-emergency-case-token": reportCase.token },
        body: JSON.stringify({ notes: continuationNote.trim() }),
      });
      if (!response.ok) throw new Error("report_case_update_failed");
      setContinuationNote("");
      setContinuationKey(crypto.randomUUID());
      setReportCaseState("saved");
      setReportCase(current => current ? { ...current, notes: [...current.notes, { text: continuationNote.trim(), createdAt: new Date().toISOString() }] } : current);
    } catch {
      setReportCaseState("unavailable");
    }
  };

  const claimAnonymousCase = async () => {
    if (!reportCase) return;
    setClaimState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("public.report.claim", { reportRef: reportCase.reportRef }), {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "x-emergency-case-token": reportCase.token },
      });
      const result = await response.json() as { caseId?: string };
      if (!response.ok || !result.caseId) throw new Error("claim_failed");
      sessionStorage.removeItem(`spec260:report:${reportCase.reportRef}`);
      setLocation(getSpec260PagePath("dashboard.case", { caseId: result.caseId }));
    } catch {
      setClaimState("failed");
    }
  };

  const submitContribution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matched?.params.poolId) return;
    const amount = Number(contributionAmount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) return;
    setContributionState("submitting");
    try {
      const response = await fetch(getSpec260ApiPath("public.support.contribution", { poolId: matched.params.poolId }), {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": contributionKey },
        body: JSON.stringify({ amountMinorUnits: Math.round(amount * 100), paymentMethod: contributionMethod }),
      });
      if (response.status === 401 || response.status === 403) {
        setContributionState("needs-auth");
        return;
      }
      const result = await response.json() as { paymentUrl?: string | null; qrCodeUrl?: string | null; status?: string };
      if (!response.ok && response.status !== 202) throw new Error("contribution_unavailable");
      setContributionCheckout(result);
      setContributionState(result.paymentUrl || result.qrCodeUrl ? "pending" : "unavailable");
      setContributionKey(crypto.randomUUID());
    } catch {
      setContributionState("unavailable");
    }
  };

  const findNearby = () => {
    if (!navigator.geolocation) {
      setNearbyState("denied");
      return;
    }
    setNearbyState("requesting");
    navigator.geolocation.getCurrentPosition(position => {
      setNearbyCoordinates({ latitude: Number(position.coords.latitude.toFixed(2)), longitude: Number(position.coords.longitude.toFixed(2)) });
      setNearbyState("idle");
    }, () => setNearbyState("denied"), { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
  };

  return (
    <AppShell contentPadding={4} height="auto" topNav={<Navbar embedded />}>
      <VStack gap={6} className="mx-auto w-full max-w-7xl">
        <VStack gap={2}>
          <Heading level={1}>{title}</Heading>
          <Text>{description}</Text>
          {matched?.route.access !== "public" && loadState === "denied" && (
            <Text>{t("state.denied")}</Text>
          )}
          {loadState === "loading" && <Text>{t("state.loading")}</Text>}
          {loadState === "unavailable" && <Text>{t("state.unavailable")}</Text>}
          {loadState === "ready" && summaryLocation === location && <Text>{summary}</Text>}
        </VStack>

        {pageId === "public.overview" && <EmergencyPublicEntry variant="overview" />}

        {pageId === "public.report" && (
          <Card>
            <form onSubmit={submitReport}>
              <VStack gap={3}>
                <TextArea label={t("report.descriptionLabel")} isRequired maxLength={4000}
                  value={reportText} onChange={(value) => setReportText(value)} />
                <label>
                  <Text>{t("report.evidenceLabel")}</Text>
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,audio/mpeg,audio/mp4,audio/ogg,audio/webm,video/mp4,video/webm"
                    onChange={event => setReportFiles(Array.from(event.currentTarget.files ?? []))} />
                </label>
                {reportFiles.length > 0 && <Text>{t("report.evidenceSelected", { count: reportFiles.length })}</Text>}
                {reportEvidenceState === "uploading" && <Text>{t("report.evidenceUploading")}</Text>}
                {reportEvidenceState === "complete" && <Text>{t("report.evidenceComplete")}</Text>}
                {reportEvidenceState === "failed" && <Text>{t("report.evidenceFailed")}</Text>}
                {reportEvidenceState === "invalid" && <Text>{t("report.evidenceInvalid")}</Text>}
                {pendingEvidence && reportFiles.length > 0 && <Button type="button" variant="secondary" isDisabled={reportEvidenceState === "uploading"}
                  label={reportEvidenceState === "uploading" ? t("report.evidenceUploading") : t("report.evidenceRetry")} onClick={retryReportEvidence} />}
                <Text>{t("report.locationNotice")}</Text>
                <Button type="button" isDisabled={reportLocationState === "requesting"}
                  label={reportLocationState === "requesting" ? t("report.locationRequesting") : t("report.shareLocation")}
                  clickAction={captureReportLocation} />
                {reportLocation && <Text>{t("report.locationIncluded", { accuracy: reportLocation.accuracyMeters ?? "—" })}</Text>}
                {reportLocation && <Button type="button" variant="secondary" label={t("report.removeLocation")} onClick={() => setReportLocation(null)} />}
                {reportLocationState === "denied" && <Text>{t("report.locationUnavailable")}</Text>}
                <Button type="submit" isDisabled={reportState === "submitting" || reportText.trim().length < 4}
                  label={reportState === "submitting" ? t("report.submitting") : t("report.submit")} />
                {reportState === "accepted" && <Text>{t("report.accepted")}</Text>}
                {reportState === "unsubmitted" && <Text>{t("report.unsubmitted")}</Text>}
              </VStack>
            </form>
          </Card>
        )}
        {pageId === "public.nearby" && (
          <Card>
            <VStack gap={3}>
              <Text>{t("nearby.approximationNotice")}</Text>
              <Text>{t(nearbyState === "denied" ? "nearby.permissionDenied" : "nearby.firstRun")}</Text>
              <Button type="button" isDisabled={nearbyState === "requesting"}
                label={nearbyState === "requesting" ? t("nearby.requesting") : t("nearby.find")}
                clickAction={findNearby} />
              {nearbyState === "denied" && <nav aria-label={t("nearby.alternatives")} className="flex flex-wrap gap-3">
                <Link href={getSpec260PagePath("public.map")}>{t("nearby.openMap")}</Link>
                <Link href={getSpec260PagePath("public.facilities")}>{t("nearby.openFacilities")}</Link>
              </nav>}
              {nearbyCoordinates && <Text role="status">{t("nearby.resultsForApproximateLocation")}</Text>}
            </VStack>
          </Card>
        )}
        {pageId === "public.reportCase" && (
          <Card>
            <VStack gap={3}>
              {reportCaseState === "loading" && <Text>{t("state.loading")}</Text>}
              {reportCaseState === "unavailable" && <Text>{t("state.unavailable")}</Text>}
              {reportCase && <>
                <Text>{t("report.reference")}: {reportCase.reportRef}</Text>
                <Text>{t("report.caseStatus")}: {reportCase.status}</Text>
                <Text>{reportCase.summary}</Text>
                <Button type="button" isDisabled={claimState === "submitting"}
                  label={claimState === "submitting" ? t("report.claiming") : t("report.claim")}
                  clickAction={claimAnonymousCase} />
                {claimState === "failed" && <Text>{t("report.claimRequiresLogin")}</Text>}
                {reportCase.notes.map((note, index) => <Text key={`${note.createdAt ?? "note"}-${index}`}>{note.text}</Text>)}
                <form onSubmit={submitContinuation}>
                  <VStack gap={3}>
                    <TextArea label={t("report.continuationLabel")} isRequired maxLength={2000}
                      value={continuationNote} onChange={setContinuationNote} />
                    <Button type="submit" isDisabled={reportCaseState === "submitting" || continuationNote.trim().length < 1}
                      label={reportCaseState === "submitting" ? t("report.submitting") : t("report.continueSubmit")} />
                    {reportCaseState === "saved" && <Text>{t("report.continuationSaved")}</Text>}
                  </VStack>
                </form>
              </>}
            </VStack>
          </Card>
        )}

        {pageId === "dashboard.volunteer" && (
          <Card>
            <form onSubmit={updateHelperAvailability}>
              <VStack gap={3}>
                {helperState === "loading" && <Text>{t("state.loading")}</Text>}
                {helperState === "failed" && <Text>{t("helper.unavailable")}</Text>}
                <label><input type="checkbox" checked={helperOptIn} onChange={event => setHelperOptIn(event.target.checked)} /> {t("helper.optIn")}</label>
                {helperOptIn && <>
                  <label>{t("helper.latitude")}<input type="number" min="-90" max="90" step="0.0001" required value={helperLatitude} onChange={event => setHelperLatitude(event.target.value)} /></label>
                  <label>{t("helper.longitude")}<input type="number" min="-180" max="180" step="0.0001" required value={helperLongitude} onChange={event => setHelperLongitude(event.target.value)} /></label>
                  <label>{t("helper.jurisdiction")}<input type="text" maxLength={160} required value={helperJurisdiction} onChange={event => setHelperJurisdiction(event.target.value)} /></label>
                  <label>{t("helper.duration")}<select value={helperHours} onChange={event => setHelperHours(event.target.value)}>
                    <option value="1">1</option><option value="2">2</option>
                  </select></label>
                  <Text>{t("helper.privacyNotice")}</Text>
                </>}
                <Button type="submit" isDisabled={helperState === "saving" || helperState === "loading"}
                  label={helperState === "saving" ? t("helper.saving") : t("helper.save")} />
                {helperState === "ready" && <Text>{t("helper.saved")}</Text>}
              </VStack>
            </form>
          </Card>
        )}

        {pageId === "public.map" && <>
          <EmergencyPublicMap items={routeItems} onItemsChange={setRouteItems} />
          <section aria-labelledby="emergency-map-status-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <section className="min-w-0">
                <h2 id="emergency-map-status-title" className="text-lg font-bold text-slate-950">{t("map.snapshotTitle")}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{t("map.coverageNotice")}</p>
              </section>
              <span role="status" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700">
                <span className={`h-2 w-2 rounded-full ${routeItems.length > 0 ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
                {routeItems.length > 0 ? t("map.visibleData", { count: routeItems.length }) : t("map.noData")}
              </span>
            </header>
            <ul className="mt-5 grid list-none gap-3 p-0 sm:grid-cols-3">
              {([
                ["situation", "map.visibleSituations"],
                ["alert", "map.visibleAlerts"],
                ["facility", "map.visibleFacilities"],
              ] as const).map(([kind, label]) => {
                const count = routeItems.filter(item => item.kind === kind).length;
                return <li key={kind} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <p className="text-sm font-medium text-slate-600">{t(label)}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{count}</p>
                </li>;
              })}
            </ul>
          </section>
          <EmergencyPublicSearch />
          <nav aria-labelledby="emergency-map-actions-title" className="space-y-4">
            <header>
              <h2 id="emergency-map-actions-title" className="text-lg font-bold text-slate-950">{t("map.actionsTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{t("map.actionsDescription")}</p>
            </header>
            <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {publicMapActions.map(({ id, icon: Icon, tone }) => (
                <li key={id}>
                  <Link href={getSpec260PagePath(id)} className={`group flex min-h-28 items-center gap-4 rounded-2xl border p-4 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 ${tone}`}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{t(pageTitles[id])}</span>
                      <span className="mt-1 block text-sm leading-5 opacity-80">{t(pageDescriptions[id])}</span>
                    </span>
                    <ArrowUpRight className="h-5 w-5 shrink-0 opacity-70 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>}
        {pageId === "public.claims" && routeItems.map((item, index) => <Card key={String(item.claimRef ?? index)}><VStack gap={1}>
          <Heading level={2}>{String(item.summary ?? item.claimRef ?? "")}</Heading>
          <Text>{t("claims.verifiedSourceGroups", { count: Number(item.sourceGroupCount ?? 0) })} · {String(item.updatedAt ?? "")}</Text>
        </VStack></Card>)}
        {pageId === "dashboard.intelligence" && <EmergencyIntelWorkbench />}
        {pageId === "dashboard.federation" && <EmergencyFederationPanel canVerify={navigationCapabilities.includes("emergency.verify")} />}
        {pageId === "dashboard.command" && <>
          <EmergencyCaseReviewQueue canVerify={navigationCapabilities.includes("emergency.verify")} />
          <EmergencyAlertManager canVerify={navigationCapabilities.includes("emergency.verify")} />
        </>}
        {pageId === "dashboard.sponsorship" && <EmergencySponsorAllocationPanel />}
        {pageId === "dashboard.privacy" && <EmergencyLegalHoldPanel canVerify={navigationCapabilities.includes("emergency.verify")} />}
        {pageId === "dashboard.case" && disclosureAssignments.length > 0 && (
          <Card>
            <form onSubmit={createDisclosureGrant}>
              <VStack gap={3}>
                <Heading level={2}>{t("disclosure.title")}</Heading>
                <label>{t("disclosure.assignment")}
                  <select required value={selectedDisclosureAssignment || disclosureAssignments[0]?.id || ""} onChange={event => { setSelectedDisclosureAssignment(event.target.value); setDisclosureSubmissionKey(crypto.randomUUID()); }}>
                    {disclosureAssignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.id.slice(0, 8)} · {assignment.status}</option>)}
                  </select>
                </label>
                {[["approximateLocation", "disclosure.approximateLocation"], ["needSummary", "disclosure.needSummary"], ["taskInstructions", "disclosure.taskInstructions"]].map(([field, label]) => (
                  <label key={field}><input type="checkbox" checked={disclosureFields.includes(field)} onChange={event => { setDisclosureFields(current => event.target.checked ? [...new Set([...current, field])] : current.filter(value => value !== field)); setDisclosureSubmissionKey(crypto.randomUUID()); }} />{t(label)}</label>
                ))}
                <Text>{t("disclosure.durationNotice")}</Text>
                <Button type="submit" isDisabled={disclosureState === "saving" || disclosureFields.length === 0}
                  label={disclosureState === "saving" ? t("disclosure.saving") : t("disclosure.grant")} />
                {activeDisclosureGrants.map(grant => <Text key={grant.id}>{grant.fields.join(", ")} · {new Date(grant.expiresAt).toLocaleString()} <Button type="button" variant="secondary" label={t("disclosure.revoke")} isDisabled={disclosureState === "saving"} clickAction={() => void revokeDisclosureGrant(grant.id)} /></Text>)}
                {disclosureState === "failed" && <Text>{t("state.unavailable")}</Text>}
              </VStack>
            </form>
          </Card>
        )}
        {pageId === "dashboard.case" && canCommand && matched?.params.caseId && <EmergencyContactAttemptPanel caseId={matched.params.caseId} />}
        {pageId === "dashboard.case" && canCommand && matched?.params.caseId && <EmergencyCaseReviewQueue canVerify={navigationCapabilities.includes("emergency.verify") || navigationGrants.some(grant => grant.capability === "emergency.verify" && (grant.scopeType === "tenant" || (grant.scopeType === "case" && grant.scopeRef === matched.params.caseId)))} caseId={matched.params.caseId} />}
        {routeItems.length > 0 && pageId !== "public.claims" && (
          <Grid columns={{ minWidth: 260, max: 3 }} gap={3}>
            {routeItems.map((item, index) => {
              const ref = typeof item.publicRef === "string" ? item.publicRef : undefined;
              const caseId = typeof item.id === "string" ? item.id : undefined;
              const href = pageId === "public.support" && ref
                ? getSpec260PagePath("public.supportPool", { poolId: ref })
                : pageId === "dashboard.cases" || pageId === "dashboard.emergency"
                  ? caseId ? getSpec260PagePath("dashboard.case", { caseId }) : undefined
                  : pageId === "dashboard.command"
                    ? caseId ? getSpec260PagePath("dashboard.case", { caseId }) : undefined
                  : pageId === "public.map" && item.kind === "facility"
                      ? getSpec260PagePath("public.facilities")
                      : pageId === "public.map" && item.kind === "alert"
                        ? getSpec260PagePath("public.alerts")
                      : pageId === "public.map" || pageId === "public.overview"
                      ? ref ? getSpec260PagePath("public.event", { publicRef: ref }) : undefined
                      : undefined;
              const titleText = [item.title, item.name, item.hazardType, item.status].find(value => typeof value === "string") as string | undefined;
              const updateTimestamp = typeof item.updatedAt === "string" ? item.updatedAt
                : typeof item.issuedAt === "string" ? item.issuedAt : undefined;
              const parsedUpdateTimestamp = updateTimestamp ? Date.parse(updateTimestamp) : Number.NaN;
              const displayUpdateTimestamp = Number.isFinite(parsedUpdateTimestamp)
                ? t("map.updatedAt", { timestamp: new Date(parsedUpdateTimestamp).toLocaleString() }) : undefined;
              const detail = [item.summary, item.description, item.severity, item.freshness, displayUpdateTimestamp]
                .filter(value => typeof value === "string").join(" · ");
              const taskDetails = item.details && typeof item.details === "object" ? item.details as Record<string, unknown> : {};
              const taskProtocolVersion = typeof taskDetails.protocolVersion === "string" ? taskDetails.protocolVersion : "";
              const taskProtocolActions = Array.isArray(taskDetails.protocolActions) ? taskDetails.protocolActions.filter((action): action is string => typeof action === "string") : [];
              const currentReviewConfirmed = protocolReviewConfirmation?.taskId === item.id && protocolReviewConfirmation.responderId === selectedResponder && protocolReviewConfirmation.version === taskProtocolVersion;
              return <Card key={String(item.id ?? ref ?? index)}>
                <VStack gap={2}>
                  <Heading level={2}>{titleText ?? ref ?? t("navigation.item", { index: index + 1 })}</Heading>
                  {detail && <Text>{detail}</Text>}
                  {(pageId === "public.support" || pageId === "public.supportPool" || pageId === "public.supportFunding") && typeof item.settledMinorUnits === "string" && (
                    <Text>{t("supportPool.financialSummary", { settled: item.settledMinorUnits, earmarked: String(item.earmarkedMinorUnits ?? "0"), restricted: String(item.restrictedBalanceMinorUnits ?? "0") })}</Text>
                  )}
                  {(pageId === "public.supportPool" || pageId === "public.supportFunding") && typeof item.financeNotice === "string" && <Text>{t("supportPool.financeNotice")}</Text>}
                  {pageId === "dashboard.respond" && item.disclosure && typeof item.disclosure === "object" && (() => {
                    const disclosure = item.disclosure as Record<string, unknown>;
                    const point = disclosure.approximateLocation && typeof disclosure.approximateLocation === "object"
                      ? disclosure.approximateLocation as Record<string, unknown> : null;
                    return <VStack gap={1}>
                      {point && typeof point.latitude === "number" && typeof point.longitude === "number" &&
                        <Text>{t("respond.approximateLocation")}: {point.latitude.toFixed(2)}, {point.longitude.toFixed(2)}</Text>}
                      {typeof disclosure.needSummary === "string" && <Text>{t("respond.needSummary")}: {disclosure.needSummary}</Text>}
                      {typeof disclosure.taskInstructions === "string" && <Text>{t("respond.taskInstructions")}: {disclosure.taskInstructions}</Text>}
                    </VStack>;
                  })()}
                  {pageId === "dashboard.respond" && Array.isArray(item.protocolActions) && item.protocolActions.length > 0 &&
                    <Text>{t("respond.protocolActions")}: {item.protocolActions.filter((action): action is string => typeof action === "string").map(action => t(`protocolActions.${action}`)).join(" · ")}</Text>}
                  {href && <Link href={href}>{t("navigation.open")}</Link>}
                  {pageId === "dashboard.respond" && typeof item.status === "string" && (
                    <>
                      {item.status === "offered" && <Button type="button" label={t("respond.accept")} isDisabled={assignmentUpdateState === "submitting"} clickAction={() => void updateResponderAssignment(item, "accepted")} />}
                      {item.status === "offered" && <Button type="button" variant="secondary" label={t("respond.decline")} isDisabled={assignmentUpdateState === "submitting"} clickAction={() => void updateResponderAssignment(item, "declined")} />}
                      {item.status === "accepted" && <Button type="button" label={t("respond.enRoute")} isDisabled={assignmentUpdateState === "submitting"} clickAction={() => void updateResponderAssignment(item, "en_route")} />}
                      {(item.status === "accepted" || item.status === "en_route" || item.status === "working") && <Button type="button" label={t("respond.startWork")} isDisabled={assignmentUpdateState === "submitting"} clickAction={() => void updateResponderAssignment(item, "working")} />}
                      {item.status === "working" && typeof item.expectedContribution === "number" && <label>{t("respond.actualContribution")}
                        <input type="number" min="0.001" max={item.expectedContribution} step="0.001"
                          value={actualContributionDraft[String(item.id)] ?? String(item.expectedContribution)}
                          onChange={event => setActualContributionDraft(current => ({ ...current, [String(item.id)]: event.target.value }))} />
                      </label>}
                      {item.status === "working" && <Button type="button" label={t("respond.complete")}
                        isDisabled={assignmentUpdateState === "submitting" || (typeof item.expectedContribution === "number" && (!Number.isFinite(Number(actualContributionDraft[String(item.id)] ?? item.expectedContribution)) || Number(actualContributionDraft[String(item.id)] ?? item.expectedContribution) <= 0 || Number(actualContributionDraft[String(item.id)] ?? item.expectedContribution) > item.expectedContribution))}
                        clickAction={() => void updateResponderAssignment(item, "completed")} />}
                      {["accepted", "en_route", "working"].includes(String(item.status)) && <Button type="button" variant="secondary" label={t("respond.safetyStop")} isDisabled={assignmentUpdateState === "submitting"} clickAction={() => void updateResponderAssignment(item, "safety_stopped")} />}
                    </>
                  )}
                  {pageId === "dashboard.tasks" && typeof item.id === "string" && ["ready", "offered"].includes(String(item.status)) && verifiedResponders.length > 0 && (
                    <VStack gap={2}>
                      {taskProtocolActions.length > 0 && <Text>{t("tasks.protocolVersion")}: {taskProtocolVersion} · {taskProtocolActions.map(action => t(`protocolActions.${action}`)).join(" · ")}</Text>}
                      <label>{t("tasks.verifiedResponder")}
                        <select value={selectedResponder} onChange={event => setSelectedResponder(event.target.value)}>
                          {verifiedResponders.map(responder => <option key={responder.id} value={responder.id}>{responder.label}{responder.helperOptIn ? ` · ${t("tasks.optedInHelper")}` : ""}</option>)}
                        </select>
                      </label>
                      {typeof item.needId === "string" && <label>{t("tasks.expectedContribution")}
                        <input type="number" min="0.001" step="0.001" value={expectedContribution} onChange={event => setExpectedContribution(event.target.value)} />
                      </label>}
                      <label><input type="checkbox" checked={currentReviewConfirmed} onChange={event => setProtocolReviewConfirmation(event.target.checked && typeof item.id === "string"
                        ? { taskId: item.id, responderId: selectedResponder, version: taskProtocolVersion } : null)} />{t("tasks.protocolReviewConfirmed")}</label>
                      <Button type="button" label={t(taskAssignState === "submitting" ? "tasks.assigning" : "tasks.assignResponder")}
                        isDisabled={taskAssignState === "submitting" || !currentReviewConfirmed || !taskProtocolVersion || (typeof item.needId === "string" && (!Number.isFinite(Number(expectedContribution)) || Number(expectedContribution) <= 0))}
                        clickAction={() => void assignResponder(item)} />
                      {taskAssignState === "failed" && <Text>{t("state.unavailable")}</Text>}
                    </VStack>
                  )}
                  {pageId === "dashboard.tasks" && item.status === "blocked" && <Button type="button" label={t("tasks.reopenAfterSafetyReview")}
                    isDisabled={taskAssignState === "submitting"} clickAction={() => void updateTaskStatus(item, "ready")} />}
                  {pageId === "dashboard.tasks" && ["ready", "offered"].includes(String(item.status)) && <Button type="button" variant="secondary" label={t("tasks.cancelAfterCapabilityReview")}
                    isDisabled={taskAssignState === "submitting"} clickAction={() => void updateTaskStatus(item, "cancelled")} />}
                  {pageId === "dashboard.needs" && typeof item.id === "string" && typeof item.status === "string" && (
                    <>
                      {(item.status === "reported" || item.status === "triage") && <Button type="button" label={t("needs.verify")} clickAction={() => void updateNeedStatus(item, "verified")} />}
                      {(item.status === "verified" || item.status === "partially_fulfilled") && <>
                        <label>{t("needs.fulfilledQuantity")}<input type="number" min="0.001" step="0.001" value={needFulfillmentQuantity} onChange={event => setNeedFulfillmentQuantity(event.target.value)} /></label>
                        <Button type="button" label={t("needs.recordFulfillment")} isDisabled={!needFulfillmentQuantity} clickAction={() => void recordNeedFulfillment(item)} />
                      </>}
                      {item.status === "fulfilled" && <Button type="button" label={t("needs.confirmFulfilled")} clickAction={() => void updateNeedStatus(item, "verified_fulfilled")} />}
                    </>
                  )}
                  {pageId === "dashboard.facilities" && typeof item.id === "string" && typeof item.status === "string" && (
                    <>
                      <label>{t("facilityManagement.status")}
                        <select value={typeof item.statusDraft === "string" ? item.statusDraft : item.status}
                          onChange={event => setRouteItems(items => items.map(current => current.id === item.id ? { ...current, statusDraft: event.target.value } : current))}>
                          {["unknown", "open", "limited", "full", "closed"].map(value => <option key={value} value={value}>{t(`facilityManagement.statusValues.${value}`)}</option>)}
                        </select>
                      </label>
                      <label>{t("facilityManagement.latitude")}
                        <input type="number" min="-90" max="90" step="0.0001" value={typeof item.latitudeDraft === "string" ? item.latitudeDraft : ""}
                          onChange={event => setRouteItems(items => items.map(current => current.id === item.id ? { ...current, latitudeDraft: event.target.value } : current))} />
                      </label>
                      <label>{t("facilityManagement.longitude")}
                        <input type="number" min="-180" max="180" step="0.0001" value={typeof item.longitudeDraft === "string" ? item.longitudeDraft : ""}
                          onChange={event => setRouteItems(items => items.map(current => current.id === item.id ? { ...current, longitudeDraft: event.target.value } : current))} />
                      </label>
                      <Button type="button" label={t("facilityManagement.update")} isDisabled={facilityState === "submitting"}
                        clickAction={() => void updateFacilityStatus(item, typeof item.statusDraft === "string" ? item.statusDraft : item.status as string)} />
                    </>
                  )}
                </VStack>
              </Card>;
            })}
          </Grid>
        )}
        {assignmentUpdateState === "failed" && <Text>{t("state.unavailable")}</Text>}

        {pageId === "dashboard.case" && canCommand && caseRevision !== null && (
          <Card>
            <form onSubmit={submitTriage}>
              <VStack gap={3}>
                <Heading level={2}>{t("command.triageTitle")}</Heading>
                <label>{t("command.caseStatus")}
                  <select value={caseStatus} onChange={event => setCaseStatus(event.target.value)}>
                    <option value="open">{t("command.statusOpen")}</option>
                    <option value="triage">{t("command.statusTriage")}</option>
                    <option value="active">{t("command.statusActive")}</option>
                    <option value="waiting">{t("command.statusWaiting")}</option>
                    <option value="resolved">{t("command.statusResolved")}</option>
                    <option value="closed">{t("command.statusClosed")}</option>
                  </select>
                </label>
                <label>{t("command.hazardCategory")}
                  <select value={hazardCategory} onChange={event => setHazardCategory(event.target.value)}>
                    {[
                      "natural", "structural", "infrastructure", "fire", "hazardous_material", "medical",
                      "accident", "security", "civil_crowd", "unknown", "multi_hazard",
                    ].map(value => <option key={value} value={value}>{t(`hazards.${value}`)}</option>)}
                  </select>
                </label>
                <TextArea label={t("command.hazardCode")} isRequired maxLength={96}
                  value={hazardCode} onChange={setHazardCode} />
                <label>{t("command.severity")}
                  <select value={severity} onChange={event => setSeverity(event.target.value)}>
                    {["unknown", "low", "moderate", "high", "critical"].map(value => <option key={value} value={value}>{t(`command.severityValues.${value}`)}</option>)}
                  </select>
                </label>
                <TextArea label={t("command.publicSummary")} maxLength={1000}
                  value={publicSummary} onChange={setPublicSummary} />
                <TextArea label={t("command.jurisdictionRef")} maxLength={160}
                  value={caseJurisdictionRef} onChange={setCaseJurisdictionRef} />
                <label>
                  <input type="checkbox" checked={publishToPublic} onChange={event => setPublishToPublic(event.target.checked)} />
                  {t("command.publishToPublic")}
                </label>
                <TextArea label={t("command.reviewReason")} minLength={8} maxLength={500} isRequired value={triageReason} onChange={setTriageReason} />
                <Button type="submit" isDisabled={triageState === "submitting" || !hazardCode.trim() || triageReason.trim().length < 8}
                  label={triageState === "submitting" ? t("command.saving") : t("command.saveTriage")} />
                {triageState === "saved" && <Text>{t("command.saved")}</Text>}
                {triageState === "review-required" && <Text role="alert">{t("command.reviewRequiredBeforeClose")}</Text>}
                {triageState === "unavailable" && <Text>{t("state.unavailable")}</Text>}
              </VStack>
            </form>
          </Card>
        )}

        {(pageId === "dashboard.needs" || pageId === "dashboard.tasks") && matched?.params.caseId && (
          <Card><VStack gap={2}>
            {pageId === "dashboard.needs" ? <form onSubmit={submitNeed}><VStack gap={2}>
              <Heading level={2}>{t("needs.createTitle")}</Heading>
              <TextArea label={t("needs.type")} isRequired maxLength={64} value={needType} onChange={value => { setNeedType(value); setNeedSubmissionKey(crypto.randomUUID()); }} />
              <label>{t("needs.quantity")}<input type="number" min="0.001" step="0.001" value={needQuantity} onChange={event => { setNeedQuantity(event.target.value); setNeedSubmissionKey(crypto.randomUUID()); }} /></label>
              <TextArea label={t("needs.descriptionLabel")} maxLength={1000} value={needDescription} onChange={value => { setNeedDescription(value); setNeedSubmissionKey(crypto.randomUUID()); }} />
              <Button type="submit" isDisabled={needSubmitState === "submitting" || !needType.trim()} label={t(needSubmitState === "submitting" ? "needs.submitting" : "needs.create")} />
              {needSubmitState === "saved" && <Text>{t("needs.saved")}</Text>}{needSubmitState === "failed" && <Text>{t("state.unavailable")}</Text>}
            </VStack></form> : <form onSubmit={submitTask}><VStack gap={2}>
              <Heading level={2}>{t("tasks.createTitle")}</Heading>
              <TextArea label={t("tasks.titleLabel")} isRequired maxLength={200} value={taskTitle} onChange={value => { setTaskTitle(value); setTaskSubmissionKey(crypto.randomUUID()); }} />
              <TextArea label={t("tasks.instructions")} maxLength={2000} value={taskInstructions} onChange={value => { setTaskInstructions(value); setTaskSubmissionKey(crypto.randomUUID()); }} />
              <label>{t("tasks.safetyClass")}<select value={taskSafetyClass} onChange={event => { setTaskSafetyClass(event.target.value); setTaskSubmissionKey(crypto.randomUUID()); }}>
                {["community_safe", "verified_only", "professional_only", "restricted"].map(value => <option key={value} value={value}>{t(`tasks.safetyClasses.${value}`)}</option>)}
              </select></label>
              <label>{t("tasks.linkNeed")}
                <select value={taskNeedId} onChange={event => { setTaskNeedId(event.target.value); setTaskSubmissionKey(crypto.randomUUID()); }}>
                  <option value="">{t("tasks.noNeed")}</option>
                  {taskNeedOptions.map(need => <option key={need.id} value={need.id}>{need.label}</option>)}
                </select>
              </label>
              <Button type="submit" isDisabled={taskSubmitState === "submitting" || !taskTitle.trim()} label={t(taskSubmitState === "submitting" ? "tasks.submitting" : "tasks.create")} />
              {taskSubmitState === "saved" && <Text>{t("tasks.saved")}</Text>}{taskSubmitState === "failed" && <Text>{t("state.unavailable")}</Text>}
              {verifiedResponders.length === 0 && <Text>{t("tasks.noVerifiedResponders")}</Text>}
            </VStack></form>}
          </VStack></Card>
        )}

        {pageId === "dashboard.case" && canCommand && matched?.params.caseId && (
          <Card><VStack gap={2}><Heading level={2}>{t("command.caseWorkflows")}</Heading>
            <Link href={getSpec260PagePath("dashboard.needs", { caseId: matched.params.caseId })}>{t("needs.title")}</Link>
            <Link href={getSpec260PagePath("dashboard.tasks", { caseId: matched.params.caseId })}>{t("tasks.title")}</Link>
          </VStack></Card>
        )}

        {pageId === "dashboard.facilities" && <Card><form onSubmit={submitFacility}><VStack gap={2}>
          <Heading level={2}>{t("facilityManagement.createTitle")}</Heading>
          <TextArea label={t("facilityManagement.type")} isRequired maxLength={64} value={facilityType} onChange={value => { setFacilityType(value); setFacilitySubmissionKey(crypto.randomUUID()); }} />
          <TextArea label={t("facilityManagement.name")} isRequired maxLength={200} value={facilityName} onChange={value => { setFacilityName(value); setFacilitySubmissionKey(crypto.randomUUID()); }} />
          <TextArea label={t("facilityManagement.descriptionLabel")} maxLength={500} value={facilityDescription} onChange={value => { setFacilityDescription(value); setFacilitySubmissionKey(crypto.randomUUID()); }} />
          <Text>{t("facilityManagement.unverifiedNotice")}</Text>
          <Button type="submit" isDisabled={facilityState === "submitting" || !facilityType.trim() || !facilityName.trim()} label={t(facilityState === "submitting" ? "facilityManagement.submitting" : "facilityManagement.create")} />
          {facilityState === "saved" && <Text>{t("facilityManagement.saved")}</Text>}{facilityState === "failed" && <Text>{t("state.unavailable")}</Text>}
        </VStack></form></Card>}

        {(pageId === "public.supportPool" || pageId === "public.supportFunding") && matched?.params.poolId && (
          <Text>{t("supportPool.poolReference", { poolId: matched.params.poolId })}</Text>
        )}
        {pageId === "public.supportFunding" && matched?.params.poolId && loadState === "ready" && routeItems.length === 0 && (
          <EmptyState title={t("supportFunding.poolUnavailableTitle")} description={t("supportFunding.poolUnavailableDescription")}
            actions={<Link isStandalone href={getSpec260PagePath("public.support")}>{t("supportFunding.backToPools")}</Link>} />
        )}
        {pageId === "public.supportFunding" && matched?.params.poolId && loadState === "ready" && routeItems.length > 0 && (
          <Card>
            <form onSubmit={submitContribution}>
              <VStack gap={3}>
                <label>{t("supportFunding.amountThb")}
                  <input type="number" min="1" max="1000000" step="1" required value={contributionAmount}
                    onChange={event => setContributionAmount(event.target.value)} />
                </label>
                <label>{t("supportFunding.paymentMethod")}
                  <select value={contributionMethod} onChange={event => setContributionMethod(event.target.value as "promptpay" | "card")}>
                    <option value="promptpay">{t("supportFunding.promptpay")}</option>
                    <option value="card">{t("supportFunding.card")}</option>
                  </select>
                </label>
                <Button type="submit" isDisabled={contributionState === "submitting"}
                  label={contributionState === "submitting" ? t("supportFunding.submitting") : t("supportFunding.submit")} />
                {contributionState === "unavailable" && <Text>{t("supportFunding.unavailable")}</Text>}
                {contributionState === "needs-auth" && <Text>{t("supportFunding.authRequired")}</Text>}
                {contributionCheckout?.paymentUrl && <Link href={contributionCheckout.paymentUrl} target="_blank" rel="noopener noreferrer">{t("supportFunding.openCheckout")}</Link>}
                {contributionCheckout?.qrCodeUrl && <Link href={contributionCheckout.qrCodeUrl} target="_blank" rel="noopener noreferrer">{t("supportFunding.openQr")}</Link>}
                {contributionState === "pending" && <Text>{t("supportFunding.pending")}</Text>}
              </VStack>
            </form>
          </Card>
        )}
        {pageId === "public.event" && matched?.params.publicRef && (
          <Text>{t("event.publicReference", { publicRef: matched.params.publicRef })}</Text>
        )}
        {loadState === "ready" && routeItems.length === 0 && (
          ["public.overview", "public.alerts", "public.facilities", "public.support", "public.claims", "public.event", "public.supportPool", "public.supportFunding"].includes(pageId) ||
          (pageId === "public.nearby" && nearbyCoordinates !== null)
        ) && (
          <EmptyState
            title={t("empty.title")}
            description={pageId === "public.event" || pageId === "public.supportPool" || pageId === "public.supportFunding"
              ? t("empty.detailDescription") : t("empty.listDescription")}
            actions={pageId !== "public.overview" ? <Link isStandalone href={getSpec260PagePath(pageId === "public.support" || pageId === "public.supportPool" || pageId === "public.supportFunding" ? "public.overview" : "public.map")}>
              {pageId === "public.support" || pageId === "public.supportPool" || pageId === "public.supportFunding" ? t("empty.overviewAction") : t("empty.mapAction")}
            </Link> : undefined}
          />
        )}
        {pageId === "dashboard.case" && matched?.params.caseId && (
          <Text>{t("case.caseReference", { caseId: matched.params.caseId })}</Text>
        )}
        {pageId === "dashboard.case" && matched?.params.caseId && <Card><VStack gap={3}>
          <Heading level={2}>{t("caseMessages.title")}</Heading>
          {caseMessageState === "loading" && <Text>{t("state.loading")}</Text>}
          {caseMessageState === "failed" && <Text>{t("caseMessages.unavailable")}</Text>}
          {caseMessageHasMore && <Button type="button" variant="secondary" isDisabled={caseMessageLoadingOlder}
            label={caseMessageLoadingOlder ? t("caseMessages.loadingOlder") : t("caseMessages.loadOlder")} clickAction={() => void loadOlderCaseMessages()} />}
          {caseMessages.map(message => <Card key={message.id}><VStack gap={1}>
            <Text>{t(`caseMessages.sender.${message.senderType}`)}</Text><Text>{message.body}</Text><Text>{message.createdAt}</Text>
          </VStack></Card>)}
          <form onSubmit={sendCaseMessage}><VStack gap={2}>
            <TextArea label={t("caseMessages.messageLabel")} isRequired maxLength={2000} value={caseMessageDraft} onChange={value => { setCaseMessageDraft(value); setCaseMessageSubmissionKey(crypto.randomUUID()); }} />
            <Button type="submit" isDisabled={caseMessageState === "submitting" || !caseMessageDraft.trim()} label={t(caseMessageState === "submitting" ? "caseMessages.sending" : "caseMessages.send")} />
          </VStack></form>
        </VStack></Card>}

        {pageId === "dashboard.case" && matched?.params.caseId && <Card><VStack gap={3}>
          <Heading level={2}>{t("caseEvidence.title")}</Heading>
          {caseEvidence.map(item => <Card key={item.id}><VStack gap={1}>
            <Text>{item.mediaType} · {Math.ceil(item.byteLength / 1024)} KB</Text>
            <Link href={item.contentPath}>{t("caseEvidence.download")}</Link>
          </VStack></Card>)}
          {caseEvidence.length === 0 && <Text>{t("caseEvidence.empty")}</Text>}
          <form onSubmit={uploadCaseEvidenceFiles}><VStack gap={2}>
            <label>{t("caseEvidence.add")}
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,audio/mpeg,audio/mp4,audio/ogg,audio/webm,video/mp4,video/webm"
                onChange={event => setCaseEvidenceFiles(Array.from(event.currentTarget.files ?? []))} />
            </label>
            <Button type="submit" isDisabled={caseEvidenceState === "uploading" || caseEvidenceFiles.length === 0}
              label={t(caseEvidenceState === "uploading" ? "caseEvidence.uploading" : "caseEvidence.upload")} />
            {caseEvidenceState === "ready" && <Text>{t("caseEvidence.saved")}</Text>}
            {caseEvidenceState === "failed" && <Text>{t("caseEvidence.failed")}</Text>}
          </VStack></form>
        </VStack></Card>}

        {pageId === "dashboard.emergency" && <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
          {pageLinks.filter(canAccessPageLink).map(id => (
            <Card key={id}>
              <VStack gap={2}>
                <Heading level={2}>{t(pageTitles[id])}</Heading>
                <Link href={getSpec260PagePath(id)}>{t("navigation.open")}</Link>
              </VStack>
            </Card>
          ))}
        </Grid>}
      </VStack>
    </AppShell>
  );
}
