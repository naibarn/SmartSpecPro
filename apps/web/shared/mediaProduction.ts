export type ProductionGateStatus = "pass" | "warning" | "revise" | "human_review" | "block";
export type ProductionOutputSurface = "storyboard_review" | "video_edit";
export type ProductionRunStatus =
  | "goal_draft"
  | "goal_ready"
  | "plan_generating"
  | "plan_ready_for_review"
  | "plan_verifying"
  | "plan_verification_failed"
  | "plan_needs_revision"
  | "plan_approved"
  | "production_bible_ready"
  | "asset_plan_ready"
  | "asset_generation_running"
  | "asset_qa_failed"
  | "asset_qa_passed"
  | "storyboard_ready"
  | "quality_gate_running"
  | "quality_gate_passed"
  | "quality_gate_needs_revision"
  | "human_review_required"
  | "final_provider_selected"
  | "final_preflight_passed"
  | "final_generating"
  | "final_qa_failed"
  | "final_qa_passed"
  | "revision_running"
  | "completed"
  | "cancelled"
  | "failed";

export interface ProductionGoal {
  title?: string;
  summary: string;
  goalType?: string;
  audience?: string;
  platform?: string;
  durationSeconds?: number;
  productContext?: Record<string, unknown>;
  characterContext?: Record<string, unknown>;
  voiceAudioStrategy?: Record<string, unknown>;
  visualStyle?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  tabSnapshots?: Record<string, unknown>;
  contractVersion?: string;
}

export interface ProductionAssetNode {
  id: string;
  kind: string;
  role: string;
  source?: string;
  required?: boolean;
  status: "missing" | "planned" | "ready" | "warning" | "blocked" | "skipped";
  providerCandidates?: string[];
  selectedProvider?: string;
  dependencies?: string[];
  estimatedCredits?: number;
  provenanceIds?: string[];
  qualityIssues?: string[];
}

export interface ProductionAssetPlan {
  assetPlanId: string;
  productionRunId: string;
  nodes: ProductionAssetNode[];
  contractVersion: string;
}

export interface ProductionAssetPlanReadiness {
  status: "ready" | "warning" | "blocked";
  requiredTotal: number;
  requiredReady: number;
  blockingNodeIds: string[];
  warningNodeIds: string[];
  estimatedCredits: number;
}

export interface ProductionQualityGate {
  gateStatus: ProductionGateStatus;
  confidenceScore: number;
  expectedQualityScore: number;
  creditRiskScore: number;
  providerFitScore: number;
  storyAlignmentScore: number;
  productTruthScore: number;
  assetReadinessScore: number;
  blockingIssues: Array<Record<string, unknown>>;
  revisionInstructions: string[];
  reviewerVerdicts: Array<Record<string, unknown>>;
  allowedNextActions: string[];
  attemptCount: number;
  maxAttemptsReached: boolean;
  contractVersion: string;
}

export interface ProductionOutputProjectionKeyInput {
  tenantId: string;
  productionRunId: string;
  surface: ProductionOutputSurface;
  sourceOutput: unknown;
}

const PRODUCTION_TERMINAL_STATES = new Set<ProductionRunStatus>(["completed", "cancelled", "failed"]);

const PRODUCTION_ALLOWED_TRANSITIONS: Record<ProductionRunStatus, ProductionRunStatus[]> = {
  goal_draft: ["goal_ready", "cancelled", "failed"],
  goal_ready: ["plan_generating", "goal_draft", "cancelled", "failed"],
  plan_generating: ["plan_ready_for_review", "plan_verification_failed", "plan_needs_revision", "failed", "cancelled"],
  plan_ready_for_review: ["plan_verifying", "plan_needs_revision", "plan_approved", "cancelled", "failed"],
  plan_verifying: ["plan_ready_for_review", "plan_approved", "plan_needs_revision", "plan_verification_failed", "human_review_required", "failed", "cancelled"],
  plan_verification_failed: ["plan_generating", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  plan_needs_revision: ["plan_generating", "human_review_required", "cancelled", "failed"],
  plan_approved: ["production_bible_ready", "asset_plan_ready", "quality_gate_running", "cancelled", "failed"],
  production_bible_ready: ["asset_plan_ready", "quality_gate_running", "cancelled", "failed"],
  asset_plan_ready: ["asset_generation_running", "asset_qa_passed", "quality_gate_running", "cancelled", "failed"],
  asset_generation_running: ["asset_qa_passed", "asset_qa_failed", "failed", "cancelled"],
  asset_qa_failed: ["asset_generation_running", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  asset_qa_passed: ["storyboard_ready", "quality_gate_running", "cancelled", "failed"],
  storyboard_ready: ["quality_gate_running", "plan_needs_revision", "cancelled", "failed"],
  quality_gate_running: ["quality_gate_passed", "quality_gate_needs_revision", "human_review_required", "failed", "cancelled"],
  quality_gate_passed: ["final_provider_selected", "final_preflight_passed", "cancelled", "failed"],
  quality_gate_needs_revision: ["revision_running", "plan_needs_revision", "human_review_required", "failed", "cancelled"],
  human_review_required: ["plan_approved", "revision_running", "cancelled", "failed"],
  final_provider_selected: ["final_preflight_passed", "quality_gate_running", "cancelled", "failed"],
  final_preflight_passed: ["final_generating", "cancelled", "failed"],
  final_generating: ["final_qa_passed", "final_qa_failed", "failed", "cancelled"],
  final_qa_failed: ["revision_running", "human_review_required", "failed", "cancelled"],
  final_qa_passed: ["completed", "revision_running", "cancelled", "failed"],
  revision_running: ["plan_ready_for_review", "quality_gate_running", "final_generating", "failed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

export function validateProductionRunTransition(current: ProductionRunStatus, next: ProductionRunStatus): {
  ok: boolean;
  reasonCode?: "production_state_terminal" | "production_state_noop" | "production_state_invalid_transition";
} {
  if (current === next) {
    return { ok: true, reasonCode: "production_state_noop" };
  }
  if (PRODUCTION_TERMINAL_STATES.has(current)) {
    return { ok: false, reasonCode: "production_state_terminal" };
  }
  if (!PRODUCTION_ALLOWED_TRANSITIONS[current]?.includes(next)) {
    return { ok: false, reasonCode: "production_state_invalid_transition" };
  }
  return { ok: true };
}

export function evaluateProductionAssetPlanReadiness(plan: ProductionAssetPlan): ProductionAssetPlanReadiness {
  const requiredNodes = plan.nodes.filter((node) => node.required !== false);
  const blockingNodeIds = requiredNodes
    .filter((node) => node.status !== "ready" && node.status !== "warning")
    .map((node) => node.id);
  const warningNodeIds = plan.nodes
    .filter((node) => node.status === "warning" || (node.qualityIssues?.length ?? 0) > 0)
    .map((node) => node.id);
  const estimatedCredits = plan.nodes.reduce((sum, node) => sum + Math.max(0, Number(node.estimatedCredits ?? 0)), 0);

  return {
    status: blockingNodeIds.length > 0 ? "blocked" : warningNodeIds.length > 0 ? "warning" : "ready",
    requiredTotal: requiredNodes.length,
    requiredReady: requiredNodes.filter((node) => node.status === "ready" || node.status === "warning").length,
    blockingNodeIds,
    warningNodeIds,
    estimatedCredits,
  };
}

export function canSubmitProductionFinalRender(gate: ProductionQualityGate, readiness: ProductionAssetPlanReadiness): boolean {
  if (readiness.status === "blocked") return false;
  if (gate.maxAttemptsReached && gate.gateStatus !== "pass" && gate.gateStatus !== "warning") return false;
  return gate.gateStatus === "pass" || gate.gateStatus === "warning";
}

export function buildProductionOutputProjectionIdentity(input: ProductionOutputProjectionKeyInput): {
  sourceOutputHash: string;
  idempotencyKey: string;
} {
  const stableJson = stableStringify(input.sourceOutput);
  const sourceOutputHash = stableHash(stableJson);
  return {
    sourceOutputHash,
    idempotencyKey: [
      input.tenantId,
      input.productionRunId,
      input.surface,
      sourceOutputHash,
    ].join(":"),
  };
}

export function buildProductionStableHash(value: unknown): string {
  return stableHash(stableStringify(value));
}

function stableHash(value: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  let hashC = 0x85ebca6b;
  let hashD = 0xc2b2ae35;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB ^= code + index;
    hashB = Math.imul(hashB, 0x85ebca6b) >>> 0;
    hashC ^= code ^ (index << 8);
    hashC = Math.imul(hashC, 0xc2b2ae35) >>> 0;
    hashD ^= code + hashA;
    hashD = Math.imul(hashD, 0x27d4eb2f) >>> 0;
  }

  return [hashA, hashB, hashC, hashD]
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`);
  return `{${entries.join(",")}}`;
}
