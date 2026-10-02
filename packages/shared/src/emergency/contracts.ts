/** Runtime-neutral Spec 260 domain contracts. Platform identities and ledgers remain externally owned. */

export type EmergencyId = string;
export type TenantId = string;
export type IsoDateTime = string;

export type HazardCategory =
  | "natural"
  | "structural-infrastructure"
  | "fire-hazmat"
  | "medical-public-health"
  | "accident"
  | "security-personal-safety"
  | "civil-crowd-safety"
  | "unknown-multi-hazard";

/** `code` and `taxonomyVersion` allow new hazards to be added without schema redesign. */
export interface HazardType {
  readonly category: HazardCategory;
  readonly code: string;
  readonly taxonomyVersion: string;
}

export interface TenantScopedRecord {
  readonly id: EmergencyId;
  readonly tenantId: TenantId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly revision: number;
}

export interface Provenance {
  readonly sourceType: "person" | "responder" | "sensor" | "authority" | "partner" | "model" | "system";
  readonly sourceRef: string;
  readonly observedAt: IsoDateTime;
  readonly receivedAt: IsoDateTime;
  readonly freshness: "current" | "stale" | "unknown";
  readonly confidence: number;
  readonly evidenceRefs: readonly EmergencyId[];
}

export interface EmergencyEvent extends TenantScopedRecord {
  readonly kind: "emergency-event";
  readonly title: string;
  readonly hazards: readonly HazardType[];
  readonly jurisdictionRef: string;
  readonly provenance: Provenance;
}

export interface HazardOccurrence extends TenantScopedRecord {
  readonly kind: "hazard-occurrence";
  readonly eventId: EmergencyId;
  readonly incidentId?: EmergencyId;
  readonly hazard: HazardType;
  readonly beganAt?: IsoDateTime;
  readonly endedAt?: IsoDateTime;
  readonly provenance: Provenance;
}

export interface Observation extends TenantScopedRecord {
  readonly kind: "observation";
  readonly eventId?: EmergencyId;
  readonly incidentId?: EmergencyId;
  readonly hazard?: HazardType;
  readonly statement: string;
  readonly generalizedLocation?: GeneralizedLocation;
  readonly restrictedLocation?: RestrictedLocationRef;
  readonly provenance: Provenance;
}

export interface Situation extends TenantScopedRecord {
  readonly kind: "situation";
  readonly eventId: EmergencyId;
  readonly incidentIds: readonly EmergencyId[];
  readonly status: "active" | "stabilizing" | "resolved";
  readonly publicRef: string;
  readonly publicSummary: string;
  readonly publicLocation?: GeneralizedLocation;
  readonly provenance: Provenance;
}

export interface IncidentEpisode extends TenantScopedRecord {
  readonly kind: "incident-episode";
  readonly incidentId: EmergencyId;
  readonly sequence: number;
  readonly startedAt: IsoDateTime;
  readonly endedAt?: IsoDateTime;
  readonly recurrenceOfEpisodeId?: EmergencyId;
}

export interface PersonRef extends TenantScopedRecord {
  readonly kind: "person-ref";
  /** Opaque reference to the platform identity service; never a copied account record. */
  readonly platformIdentityRef?: string;
  readonly pseudonymousRef: string;
  readonly vulnerabilityFlags?: readonly string[];
}

export interface HouseholdRef extends TenantScopedRecord {
  readonly kind: "household-ref";
  readonly memberRefs: readonly string[];
  readonly mergeReviewState: "unreviewed" | "confirmed" | "rejected";
}

export interface ContactEndpoint extends TenantScopedRecord {
  readonly kind: "contact-endpoint";
  readonly personRef: string;
  readonly channel: "sms" | "voice" | "email" | "app" | "radio" | "other";
  /** Value is private and is only released by the approved disclosure path. */
  readonly encryptedValueRef: string;
  readonly verifiedAt?: IsoDateTime;
}

export type IncidentStatus =
  | "REPORTED" | "ASSESSING" | "ACTIVE" | "STABILIZING" | "RESOLVED" | "CLOSED" | "ESCALATED" | "REOPENED";

/** Persistence-facing transition guards used by the API until all adapters consume the versioned domain types. */
const STORED_NEED_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  reported: ["triage", "cancelled"], triage: ["verified", "cancelled"],
  verified: ["partially_fulfilled", "fulfilled", "cancelled"],
  partially_fulfilled: ["partially_fulfilled", "fulfilled", "verified_fulfilled", "cancelled"],
  fulfilled: ["verified_fulfilled", "partially_fulfilled"], verified_fulfilled: [], cancelled: [],
};
const STORED_TASK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  draft: ["ready", "cancelled"], ready: ["offered", "cancelled"], offered: ["claimed", "ready", "cancelled"],
  claimed: ["in_progress", "blocked", "ready", "cancelled"], in_progress: ["completed", "blocked", "cancelled"],
  blocked: ["ready", "cancelled"], completed: [], cancelled: [],
};

export function canTransitionStoredEmergencyNeed(from: string, to: string): boolean {
  return from === to || Boolean(STORED_NEED_TRANSITIONS[from]?.includes(to));
}

export function canTransitionStoredEmergencyTask(from: string, to: string): boolean {
  return from === to || Boolean(STORED_TASK_TRANSITIONS[from]?.includes(to));
}

export interface Incident extends TenantScopedRecord {
  readonly kind: "incident";
  readonly eventId: EmergencyId;
  readonly status: IncidentStatus;
  readonly episodeId: EmergencyId;
  readonly hazardOccurrences: readonly HazardType[];
  readonly provenance: Provenance;
}

export type NeedStatus =
  | "UNVERIFIED" | "VERIFIED" | "OPEN" | "PARTIALLY_FULFILLED" | "FULFILLED" | "VERIFIED_FULFILLED"
  | "NO_LONGER_NEEDED" | "CANCELLED" | "DISPUTED";

export interface Need extends TenantScopedRecord {
  readonly kind: "need";
  readonly incidentId: EmergencyId;
  readonly status: NeedStatus;
  readonly category: string;
  readonly priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  readonly requestedQuantity?: number;
  readonly fulfilledQuantity: number;
  readonly revisionId: EmergencyId;
  readonly provenance: Provenance;
}

export interface NeedRevision extends TenantScopedRecord {
  readonly kind: "need-revision";
  readonly needId: EmergencyId;
  readonly revisionNumber: number;
  readonly category: string;
  readonly requestedQuantity?: number;
  readonly priority: Need["priority"];
  readonly changeReason: string;
  readonly provenance: Provenance;
}

export interface NeedFulfillment extends TenantScopedRecord {
  readonly kind: "need-fulfillment";
  readonly needId: EmergencyId;
  readonly taskId: EmergencyId;
  readonly quantity: number;
  readonly state: "reported" | "disputed" | "citizen-verified";
  readonly providerCompletedAt?: IsoDateTime;
  readonly citizenVerifiedAt?: IsoDateTime;
  readonly provenance: Provenance;
}

export type ResponseTaskStatus =
  | "AVAILABLE" | "OFFERED" | "ACCEPTED" | "EN_ROUTE" | "ON_SCENE" | "COMPLETED"
  | "BLOCKED" | "FAILED" | "CANCELLED" | "TRANSFERRED";

export interface ResponseTask extends TenantScopedRecord {
  readonly kind: "response-task";
  readonly incidentId: EmergencyId;
  readonly needId: EmergencyId;
  readonly status: ResponseTaskStatus;
  readonly teamId?: EmergencyId;
  readonly assignmentId?: EmergencyId;
  readonly dependsOnTaskIds: readonly EmergencyId[];
}

export interface TaskOffer extends TenantScopedRecord {
  readonly kind: "task-offer";
  readonly taskId: EmergencyId;
  readonly recipientRef: string;
  readonly expiresAt: IsoDateTime;
  readonly state: "offered" | "accepted" | "declined" | "expired" | "withdrawn";
}

export interface TaskAssignment extends TenantScopedRecord {
  readonly kind: "task-assignment";
  readonly taskId: EmergencyId;
  readonly teamId: EmergencyId;
  readonly assignedByRef: string;
  readonly acceptedAt?: IsoDateTime;
  readonly leaseFence: number;
}

export interface TaskActivity extends TenantScopedRecord {
  readonly kind: "task-activity";
  readonly taskId: EmergencyId;
  readonly assignmentId: EmergencyId;
  readonly action: string;
  readonly actorRef: string;
  readonly occurredAt: IsoDateTime;
  readonly idempotencyKey: string;
}

export interface TaskDependency extends TenantScopedRecord {
  readonly kind: "task-dependency";
  readonly taskId: EmergencyId;
  readonly dependsOnTaskId: EmergencyId;
  readonly requiredState: "completed" | "on-scene";
}

export interface ResponseOrganization extends TenantScopedRecord {
  readonly kind: "response-organization";
  readonly name: string;
  readonly jurisdictionRefs: readonly string[];
  readonly verificationState: "pending" | "verified" | "suspended" | "revoked";
}

export interface ResponseTeam extends TenantScopedRecord {
  readonly kind: "response-team";
  readonly organizationId: EmergencyId;
  readonly displayName: string;
  readonly capabilityRefs: readonly EmergencyId[];
  readonly availability: "available" | "busy" | "offline" | "suspended";
}

export interface Responder extends TenantScopedRecord {
  readonly kind: "responder";
  readonly personRef: string;
  readonly organizationId: EmergencyId;
  readonly verificationState: "pending" | "verified" | "suspended" | "revoked";
  readonly credentialRefs: readonly string[];
}

export interface TeamCapability extends TenantScopedRecord {
  readonly kind: "team-capability";
  readonly teamId: EmergencyId;
  readonly capabilityCode: string;
  readonly hazardClasses: readonly HazardCategory[];
  readonly safetyEnvelopeVersion: string;
  readonly expiresAt?: IsoDateTime;
}

export interface Resource extends TenantScopedRecord {
  readonly kind: "resource";
  readonly category: string;
  readonly ownerRef: string;
  readonly locationRef?: EmergencyId;
  readonly safetyClass: string;
}

export interface ResourceInventory extends TenantScopedRecord {
  readonly kind: "resource-inventory";
  readonly resourceId: EmergencyId;
  readonly availableQuantity: number;
  readonly reservedQuantity: number;
  readonly unit: string;
  readonly asOf: IsoDateTime;
}

export interface ResourceCommitment extends TenantScopedRecord {
  readonly kind: "resource-commitment";
  readonly resourceId: EmergencyId;
  readonly incidentId: EmergencyId;
  readonly taskId?: EmergencyId;
  readonly quantity: number;
  readonly state: "reserved" | "dispatched" | "delivered" | "released" | "disputed";
}

export interface ResourceDelivery extends TenantScopedRecord {
  readonly kind: "resource-delivery";
  readonly commitmentId: EmergencyId;
  readonly deliveredQuantity: number;
  readonly deliveredAt: IsoDateTime;
  readonly verifiedByRef?: string;
  readonly verificationState: "pending" | "verified" | "disputed";
}

export interface Shelter extends TenantScopedRecord {
  readonly kind: "shelter";
  readonly facilityRef: EmergencyId;
  readonly publicLocation: GeneralizedLocation;
  readonly capacityClass: "available" | "limited" | "full" | "unknown";
  readonly accessibilityRefs: readonly EmergencyId[];
}

export interface MedicalFacility extends TenantScopedRecord {
  readonly kind: "medical-facility";
  readonly facilityRef: EmergencyId;
  readonly publicLocation: GeneralizedLocation;
  readonly serviceClasses: readonly string[];
  readonly capacityClass: "available" | "limited" | "full" | "unknown";
}

export interface SafeZone extends TenantScopedRecord {
  readonly kind: "safe-zone";
  readonly incidentId: EmergencyId;
  readonly publicArea: GeneralizedLocation;
  readonly state: "active" | "closed" | "under-review";
  readonly provenance: Provenance;
}

export interface AccessibilityEdge extends TenantScopedRecord {
  readonly kind: "accessibility-edge";
  readonly fromRef: EmergencyId;
  readonly toRef: EmergencyId;
  readonly mode: string;
  readonly accessibilityTags: readonly string[];
  readonly hazardState: "clear" | "restricted" | "blocked" | "unknown";
  readonly updatedAt: IsoDateTime;
  readonly provenance: Provenance;
}

export interface GeneralizedLocation {
  readonly precision: "area" | "district" | "region";
  readonly publicLabel: string;
  readonly geohashPrefix?: string;
}

/** Restricted coordinates are kept in a separate authority and never appear on public DTOs. */
export interface RestrictedLocationRef {
  readonly locationRef: EmergencyId;
  readonly precision: "exact" | "building";
}

export interface EmergencyCase extends TenantScopedRecord {
  readonly kind: "emergency-case";
  readonly incidentId: EmergencyId;
  readonly requesterRef?: string;
  readonly generalizedLocation?: GeneralizedLocation;
  readonly restrictedLocation?: RestrictedLocationRef;
  readonly rawConversationRef?: EmergencyId;
  readonly briefRevision: number;
}

export interface Conversation extends TenantScopedRecord {
  readonly kind: "conversation";
  readonly incidentId: EmergencyId;
  readonly participantRefs: readonly string[];
  readonly channel: "web" | "voice" | "sms" | "radio" | "partner";
  readonly rawTimelineRef: EmergencyId;
}

export interface Message extends TenantScopedRecord {
  readonly kind: "message";
  readonly conversationId: EmergencyId;
  readonly senderRef: string;
  readonly bodyRef: string;
  readonly sentAt: IsoDateTime;
  readonly idempotencyKey: string;
  readonly disclosureClass: "private" | "case-shared" | "public-approved";
}

export interface QuestionRecord extends TenantScopedRecord {
  readonly kind: "question-record";
  readonly incidentId: EmergencyId;
  readonly questionCode: string;
  readonly askedAt: IsoDateTime;
  readonly answerFactRef?: EmergencyId;
  readonly askedByRef: string;
}

export interface TemporalFact extends TenantScopedRecord {
  readonly kind: "temporal-fact";
  readonly incidentId: EmergencyId;
  readonly factType: string;
  readonly valueRef: string;
  readonly validFrom: IsoDateTime;
  readonly validUntil?: IsoDateTime;
  readonly supersedesFactId?: EmergencyId;
  readonly provenance: Provenance;
}

export interface CaseBrief extends TenantScopedRecord {
  readonly kind: "case-brief";
  readonly incidentId: EmergencyId;
  readonly revisionNumber: number;
  readonly sourceFactRefs: readonly EmergencyId[];
  readonly sourceMessageRefs: readonly EmergencyId[];
  readonly generatedSummaryRef: string;
  readonly generatedBy: "human" | "model";
  readonly requiresHumanReview: boolean;
}

export interface Evidence extends TenantScopedRecord {
  readonly kind: "evidence";
  readonly incidentId: EmergencyId;
  readonly mediaRef?: EmergencyId;
  readonly contentHash: string;
  readonly capturedAt?: IsoDateTime;
  readonly receivedAt: IsoDateTime;
  readonly provenance: Provenance;
  readonly visibility: "private" | "case-shared" | "public-derivative";
  readonly derivativeOf?: EmergencyId;
}

export interface ConsentReceipt extends TenantScopedRecord {
  readonly kind: "consent-receipt";
  readonly subjectRef: string;
  readonly incidentId: EmergencyId;
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly recipientCategories: readonly string[];
  readonly policyVersion: string;
  readonly channel: string;
  readonly withdrawnAt?: IsoDateTime;
}

export interface DisclosureGrant extends TenantScopedRecord {
  readonly kind: "disclosure-grant";
  readonly subjectRef: string;
  readonly incidentId: EmergencyId;
  readonly recipientRef: string;
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly basis: "consent" | "lawful-emergency-basis";
  readonly expiresAt: IsoDateTime;
  readonly revokedAt?: IsoDateTime;
}

export interface DisclosureRecord extends TenantScopedRecord {
  readonly kind: "disclosure-record";
  readonly incidentId: EmergencyId;
  readonly grantId?: EmergencyId;
  readonly recipientRef: string;
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly basisRef: string;
  readonly actorRef: string;
}

export interface VerificationAssessment extends TenantScopedRecord {
  readonly kind: "verification-assessment";
  readonly subjectType: "incident" | "observation" | "need" | "fulfillment" | "resource-delivery";
  readonly subjectId: EmergencyId;
  readonly state: "unverified" | "corroborated" | "verified" | "disputed" | "unknown" | "false-confirmed";
  readonly evidenceRefs: readonly EmergencyId[];
  readonly assessorRef: string;
  readonly reason: string;
  readonly punitiveDecisionAllowed: false;
}

export interface CorroborationLink extends TenantScopedRecord {
  readonly kind: "corroboration-link";
  readonly leftEvidenceId: EmergencyId;
  readonly rightEvidenceId: EmergencyId;
  readonly independence: "independent" | "same-origin" | "unknown";
  readonly relation: "supports" | "contradicts" | "duplicates";
}

export interface AbuseReview extends TenantScopedRecord {
  readonly kind: "abuse-review";
  readonly reportRef: EmergencyId;
  readonly state: "queued" | "reviewing" | "action-required" | "dismissed" | "confirmed-abuse";
  readonly reviewerRef?: string;
  readonly evidenceRefs: readonly EmergencyId[];
  readonly punitiveActionRequiresHumanReview: true;
}

export interface CriticalAuditEvent extends TenantScopedRecord {
  readonly kind: "critical-audit-event";
  readonly aggregateType: "incident" | "need" | "response-task" | "consent" | "disclosure" | "financial-reference";
  readonly aggregateId: EmergencyId;
  readonly action: string;
  readonly actorRef: string;
  readonly reason: string;
  readonly occurredAt: IsoDateTime;
  readonly previousRevision: number;
  readonly nextRevision: number;
  readonly previousEventHash?: string;
  readonly eventHash: string;
}

/** Reference only; the platform's economic ledger remains the source of monetary truth. */
export interface FinancialEventReference extends TenantScopedRecord {
  readonly kind: "financial-event-reference";
  readonly economicLedgerRef: string;
  readonly legalEntityRef: string;
  readonly incidentId?: EmergencyId;
  readonly purposeCode: string;
  readonly payerRef?: string;
  readonly payeeRef?: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly reconciliationState: "pending" | "reconciled" | "exception" | "reversed";
  readonly correctionOf?: EmergencyId;
}

export interface SponsorPolicy extends TenantScopedRecord {
  readonly kind: "sponsor-policy";
  readonly sponsorRef: string;
  readonly purposeCode: string;
  readonly eligibleCapabilityCodes: readonly string[];
  readonly excludedPurposeCodes: readonly string[];
  readonly effectiveFrom: IsoDateTime;
  readonly effectiveUntil?: IsoDateTime;
  readonly policyVersion: string;
}

export interface SponsorshipDecision extends TenantScopedRecord {
  readonly kind: "sponsorship-decision";
  readonly policyId: EmergencyId;
  readonly incidentId: EmergencyId;
  readonly capabilityCode: string;
  readonly eligible: boolean;
  readonly reasonCode: string;
  readonly decidedAt: IsoDateTime;
  readonly policyVersion: string;
  readonly financialEventRef?: EmergencyId;
}

export interface EmergencyCreditAllocation extends TenantScopedRecord {
  readonly kind: "emergency-credit-allocation";
  /** Reference to the canonical platform credit allocation; no second balance is stored here. */
  readonly platformAllocationRef: string;
  readonly incidentId: EmergencyId;
  readonly sponsorPolicyId?: EmergencyId;
  readonly beneficiaryRef: string;
  readonly amountMinor: number;
  readonly state: "reserved" | "consumed" | "released" | "reconciled";
}

export interface EmergencyAlert extends TenantScopedRecord {
  readonly kind: "emergency-alert";
  readonly publicRef: string;
  readonly jurisdictionRef: string;
  readonly hazard: HazardType;
  readonly message: string;
  readonly state: "draft" | "published" | "corrected" | "retracted";
  readonly issuedAt: IsoDateTime;
  readonly correctedFromAlertId?: EmergencyId;
  readonly provenance: Provenance;
}

export function validateHazardType(hazard: HazardType): boolean {
  return Boolean(hazard.code.trim() && hazard.taxonomyVersion.trim());
}

export function validateProvenance(provenance: Provenance): boolean {
  const observed = Date.parse(provenance.observedAt);
  const received = Date.parse(provenance.receivedAt);
  return Boolean(provenance.sourceRef.trim()) && Number.isFinite(observed) && Number.isFinite(received) &&
    received >= observed && Number.isFinite(provenance.confidence) && provenance.confidence >= 0 && provenance.confidence <= 1;
}

export interface PublicSituationProjection {
  readonly publicRef: string;
  readonly hazard: HazardType;
  readonly status: "active" | "stabilizing" | "resolved";
  readonly summary: string;
  readonly location?: GeneralizedLocation;
  readonly updatedAt: IsoDateTime;
  readonly freshness: "current" | "stale" | "unknown";
  readonly sourceStatus: "confirmed" | "corroborated" | "unverified";
}

export interface SituationSource {
  readonly publicRef: string;
  readonly hazard: HazardType;
  readonly status: "active" | "stabilizing" | "resolved";
  readonly publicSummary: string;
  readonly publicLocation?: GeneralizedLocation;
  readonly exactLocation?: RestrictedLocationRef;
  readonly requesterRef?: string;
  readonly medicalDetails?: readonly string[];
  readonly updatedAt: IsoDateTime;
  readonly provenance: Provenance;
  readonly verification: "confirmed" | "corroborated" | "unverified";
}

export function toPublicSituationProjection(source: SituationSource): PublicSituationProjection {
  return {
    publicRef: source.publicRef,
    hazard: source.hazard,
    status: source.status,
    summary: source.publicSummary,
    ...(source.publicLocation ? { location: { ...source.publicLocation } } : {}),
    updatedAt: source.updatedAt,
    freshness: source.provenance.freshness,
    sourceStatus: source.verification,
  };
}

const INCIDENT_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  REPORTED: ["ASSESSING", "ESCALATED"],
  ASSESSING: ["ACTIVE", "STABILIZING", "ESCALATED"],
  ACTIVE: ["STABILIZING", "ESCALATED"],
  STABILIZING: ["ACTIVE", "RESOLVED", "ESCALATED"],
  RESOLVED: ["CLOSED", "REOPENED", "ESCALATED"],
  CLOSED: ["REOPENED", "ESCALATED"],
  ESCALATED: ["ASSESSING", "ACTIVE", "STABILIZING"],
  REOPENED: ["ASSESSING", "ACTIVE", "ESCALATED"],
};

const NEED_TRANSITIONS: Readonly<Record<NeedStatus, readonly NeedStatus[]>> = {
  UNVERIFIED: ["VERIFIED", "OPEN", "CANCELLED", "DISPUTED"],
  VERIFIED: ["OPEN", "CANCELLED", "DISPUTED"],
  OPEN: ["PARTIALLY_FULFILLED", "FULFILLED", "NO_LONGER_NEEDED", "CANCELLED", "DISPUTED"],
  PARTIALLY_FULFILLED: ["FULFILLED", "NO_LONGER_NEEDED", "CANCELLED", "DISPUTED"],
  FULFILLED: ["VERIFIED_FULFILLED", "DISPUTED"],
  VERIFIED_FULFILLED: ["DISPUTED"],
  NO_LONGER_NEEDED: ["OPEN", "DISPUTED"],
  CANCELLED: ["OPEN", "DISPUTED"],
  DISPUTED: ["OPEN", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"],
};

const TASK_TERMINAL_ACTIONS: readonly ResponseTaskStatus[] = ["BLOCKED", "FAILED", "CANCELLED", "TRANSFERRED"];
const TASK_TRANSITIONS: Readonly<Record<ResponseTaskStatus, readonly ResponseTaskStatus[]>> = {
  AVAILABLE: ["OFFERED", ...TASK_TERMINAL_ACTIONS],
  OFFERED: ["ACCEPTED", ...TASK_TERMINAL_ACTIONS],
  ACCEPTED: ["EN_ROUTE", "ON_SCENE", "COMPLETED", ...TASK_TERMINAL_ACTIONS],
  EN_ROUTE: ["ON_SCENE", "COMPLETED", ...TASK_TERMINAL_ACTIONS],
  ON_SCENE: ["COMPLETED", ...TASK_TERMINAL_ACTIONS],
  COMPLETED: [],
  BLOCKED: ["AVAILABLE", "CANCELLED", "TRANSFERRED"],
  FAILED: ["AVAILABLE", "CANCELLED", "TRANSFERRED"],
  CANCELLED: [],
  TRANSFERRED: [],
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return INCIDENT_TRANSITIONS[from].includes(to);
}

export function canTransitionNeed(from: NeedStatus, to: NeedStatus): boolean {
  return NEED_TRANSITIONS[from].includes(to);
}

export function canTransitionResponseTask(from: ResponseTaskStatus, to: ResponseTaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export interface TransitionAuditInput {
  readonly auditEventId: EmergencyId;
  readonly tenantId: TenantId;
  readonly aggregateId: EmergencyId;
  readonly actorRef: string;
  readonly reason: string;
  readonly occurredAt: IsoDateTime;
  readonly previousRevision: number;
  readonly previousEventHash?: string;
}

export function buildTransitionAudit(
  input: TransitionAuditInput,
  aggregateType: CriticalAuditEvent["aggregateType"],
  action: string,
  eventHash: string,
): CriticalAuditEvent {
  if (!input.auditEventId.trim() || !input.tenantId.trim() || !input.aggregateId.trim() ||
      !input.reason.trim() || !input.actorRef.trim() || !eventHash.trim() ||
      !/^[a-f0-9]{64}$/i.test(eventHash) ||
      (input.previousEventHash !== undefined && !/^[a-f0-9]{64}$/i.test(input.previousEventHash)) ||
      !Number.isInteger(input.previousRevision) || input.previousRevision < 0 ||
      (input.previousRevision > 0 && !input.previousEventHash) || !Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error("EMERGENCY_AUDIT_CONTEXT_INVALID");
  }
  return {
    id: input.auditEventId,
    tenantId: input.tenantId,
    kind: "critical-audit-event",
    aggregateType,
    aggregateId: input.aggregateId,
    action,
    actorRef: input.actorRef,
    reason: input.reason,
    occurredAt: input.occurredAt,
    previousRevision: input.previousRevision,
    nextRevision: input.previousRevision + 1,
    previousEventHash: input.previousEventHash,
    eventHash,
    revision: input.previousRevision + 1,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

export function transitionIncidentStatus(
  from: IncidentStatus,
  to: IncidentStatus,
  audit: TransitionAuditInput,
  eventHash: string,
): { status: IncidentStatus; audit: CriticalAuditEvent } {
  if (!canTransitionIncident(from, to)) throw new Error(`INCIDENT_TRANSITION_INVALID:${from}:${to}`);
  return { status: to, audit: buildTransitionAudit(audit, "incident", `status:${from}->${to}`, eventHash) };
}

export function transitionNeedStatus(
  from: NeedStatus,
  to: NeedStatus,
  audit: TransitionAuditInput,
  eventHash: string,
): { status: NeedStatus; audit: CriticalAuditEvent } {
  if (!canTransitionNeed(from, to)) throw new Error(`NEED_TRANSITION_INVALID:${from}:${to}`);
  return { status: to, audit: buildTransitionAudit(audit, "need", `status:${from}->${to}`, eventHash) };
}

export function transitionResponseTaskStatus(
  from: ResponseTaskStatus,
  to: ResponseTaskStatus,
  audit: TransitionAuditInput,
  eventHash: string,
): { status: ResponseTaskStatus; audit: CriticalAuditEvent } {
  if (!canTransitionResponseTask(from, to)) throw new Error(`RESPONSE_TASK_TRANSITION_INVALID:${from}:${to}`);
  return { status: to, audit: buildTransitionAudit(audit, "response-task", `status:${from}->${to}`, eventHash) };
}
