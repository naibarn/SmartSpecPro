export type AutoTeamStepResultPhase =
  | "execution"
  | "review"
  | "repair"
  | "handoff"
  | "finalize";

export type AutoTeamStepReviewStatus =
  | "pending"
  | "passed"
  | "failed"
  | "not_required";

export interface AutoTeamStepResultStepContext {
  stepKey: string;
  stepTitle: string;
  stepIndex?: number | null;
  stepCount?: number | null;
  stepObjective?: string | null;
  stepDeliverable?: string | null;
  ownerPersona?: string | null;
  ownerMemberId?: string | null;
  reviewerPersona?: string | null;
  reviewerMemberId?: string | null;
  verificationMethod?: string | null;
  retryRule?: string | null;
  evidenceRequirements?: string[];
  qualityCriteria?: string[];
  reviewChecklist?: string[];
  attempt?: number | null;
  selectedSkillId?: string | null;
  selectedProvider?: string | null;
  selectedModelId?: string | null;
}

export interface BuildAutoTeamStepResultMessageInput {
  roomLanguage?: "en" | "th" | null;
  phase: AutoTeamStepResultPhase;
  step: AutoTeamStepResultStepContext;
  resultSummary?: string | null;
  reviewStatus?: AutoTeamStepReviewStatus | null;
  reviewScore?: number | null;
  reviewIteration?: number | null;
  reviewNote?: string | null;
  repairInstructions?: string | null;
  nextAction?: string | null;
}

const MAX_SUMMARY_LENGTH = 4000;

function isThai(roomLanguage?: string | null): boolean {
  return roomLanguage === "th";
}

function localize(roomLanguage: string | null | undefined, en: string, th: string): string {
  return isThai(roomLanguage) ? th : en;
}

function normalizeText(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values?: string[] | null): string[] {
  return Array.isArray(values)
    ? values
        .map((value) => normalizeText(value))
        .filter((value): value is string => Boolean(value))
    : [];
}

function appendLine(lines: string[], label: string, value?: string | null): void {
  const normalized = normalizeText(value);
  if (normalized) {
    lines.push(`${label}: ${normalized}`);
  }
}

function appendList(
  lines: string[],
  label: string,
  values?: string[] | null,
): void {
  const normalized = normalizeList(values);
  if (normalized.length > 0) {
    lines.push(`${label}: ${normalized.join("; ")}`);
  }
}

function summarizeResult(value?: string | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.length <= MAX_SUMMARY_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_SUMMARY_LENGTH - 3).trimEnd()}...`;
}

function buildPhaseLabel(
  phase: AutoTeamStepResultPhase,
  roomLanguage?: string | null,
): string {
  switch (phase) {
    case "execution":
      return localize(roomLanguage, "Execution result", "ผลลัพธ์การทำงาน");
    case "review":
      return localize(roomLanguage, "Review result", "ผลการตรวจ");
    case "repair":
      return localize(roomLanguage, "Repair loop", "รอบแก้ไข");
    case "handoff":
      return localize(roomLanguage, "Handoff", "ส่งต่องาน");
    case "finalize":
    default:
      return localize(roomLanguage, "Final result", "ผลลัพธ์สุดท้าย");
  }
}

function buildReviewStatusLabel(
  reviewStatus: AutoTeamStepReviewStatus | null | undefined,
  roomLanguage?: string | null,
): string | null {
  if (!reviewStatus) return null;
  switch (reviewStatus) {
    case "passed":
      return localize(roomLanguage, "Passed", "ผ่าน");
    case "failed":
      return localize(roomLanguage, "Failed", "ไม่ผ่าน");
    case "pending":
      return localize(roomLanguage, "Pending", "รอตรวจ");
    case "not_required":
      return localize(roomLanguage, "Not required", "ไม่ต้องตรวจ");
    default:
      return null;
  }
}

export function buildAutoTeamStepResultContent(
  input: BuildAutoTeamStepResultMessageInput,
): string {
  const labels = {
    step: localize(input.roomLanguage, "Step", "ขั้นตอน"),
    phase: localize(input.roomLanguage, "Phase", "เฟส"),
    owner: localize(input.roomLanguage, "Owner", "ผู้รับผิดชอบ"),
    reviewer: localize(input.roomLanguage, "Reviewer", "ผู้ตรวจ"),
    attempt: localize(input.roomLanguage, "Attempt", "รอบ"),
    objective: localize(input.roomLanguage, "Objective", "เป้าหมาย"),
    deliverable: localize(input.roomLanguage, "Deliverable", "ผลลัพธ์ที่ต้องส่ง"),
    verification: localize(input.roomLanguage, "Verification", "วิธีตรวจ"),
    retryRule: localize(input.roomLanguage, "Retry rule", "กติกาแก้ไข/วนซ้ำ"),
    evidence: localize(input.roomLanguage, "Evidence", "หลักฐาน"),
    quality: localize(input.roomLanguage, "Quality criteria", "เกณฑ์คุณภาพ"),
    checklist: localize(input.roomLanguage, "Review checklist", "รายการตรวจ"),
    result: localize(input.roomLanguage, "Result", "ผลลัพธ์"),
    reviewStatus: localize(input.roomLanguage, "Review status", "สถานะการตรวจ"),
    reviewScore: localize(input.roomLanguage, "Review score", "คะแนนตรวจ"),
    reviewNote: localize(input.roomLanguage, "Reviewer note", "หมายเหตุผู้ตรวจ"),
    repairInstructions: localize(input.roomLanguage, "Repair instructions", "คำแนะนำการแก้ไข"),
    nextAction: localize(input.roomLanguage, "Next action", "ขั้นถัดไป"),
    skill: localize(input.roomLanguage, "Selected skill", "สกิลที่เลือก"),
    provider: localize(input.roomLanguage, "Selected provider", "ผู้ให้บริการที่เลือก"),
    model: localize(input.roomLanguage, "Selected model", "โมเดลที่เลือก"),
  };

  const lines = [
    `${labels.step}: ${
      typeof input.step.stepIndex === "number" &&
      Number.isFinite(input.step.stepIndex)
        ? `${input.step.stepIndex}${typeof input.step.stepCount === "number" ? `/${input.step.stepCount}` : ""} · `
        : ""
    }${input.step.stepTitle} [${input.step.stepKey}]`,
    `${labels.phase}: ${buildPhaseLabel(input.phase, input.roomLanguage)}`,
  ];

  appendLine(lines, labels.owner, input.step.ownerPersona);
  appendLine(lines, labels.reviewer, input.step.reviewerPersona);
  if (typeof input.step.attempt === "number" && Number.isFinite(input.step.attempt)) {
    lines.push(`${labels.attempt}: ${input.step.attempt}`);
  }
  appendLine(lines, labels.objective, input.step.stepObjective);
  appendLine(lines, labels.deliverable, input.step.stepDeliverable);
  appendLine(lines, labels.verification, input.step.verificationMethod);
  appendLine(lines, labels.retryRule, input.step.retryRule);
  appendList(lines, labels.evidence, input.step.evidenceRequirements);
  appendList(lines, labels.quality, input.step.qualityCriteria);
  appendList(lines, labels.checklist, input.step.reviewChecklist);
  appendLine(lines, labels.skill, input.step.selectedSkillId);
  appendLine(lines, labels.provider, input.step.selectedProvider);
  appendLine(lines, labels.model, input.step.selectedModelId);

  const summarizedResult = summarizeResult(input.resultSummary);
  if (summarizedResult) {
    lines.push("", `${labels.result}:`, summarizedResult);
  }

  const reviewStatusLabel = buildReviewStatusLabel(
    input.reviewStatus ?? null,
    input.roomLanguage,
  );
  if (reviewStatusLabel) {
    const reviewSuffix =
      typeof input.reviewScore === "number" && Number.isFinite(input.reviewScore)
        ? ` (${input.reviewScore.toFixed(2)})`
        : "";
    lines.push("", `${labels.reviewStatus}: ${reviewStatusLabel}${reviewSuffix}`);
  }

  appendLine(lines, labels.reviewNote, input.reviewNote);
  appendLine(lines, labels.repairInstructions, input.repairInstructions);
  appendLine(lines, labels.nextAction, input.nextAction);

  return lines.join("\n");
}

export function buildAutoTeamStepResultMetadata(
  input: BuildAutoTeamStepResultMessageInput,
): Record<string, unknown> {
  return {
    stepResultPhase: input.phase,
    stepKey: input.step.stepKey,
    stepTitle: input.step.stepTitle,
    stepIndex:
      typeof input.step.stepIndex === "number" && Number.isFinite(input.step.stepIndex)
        ? input.step.stepIndex
        : null,
    stepCount:
      typeof input.step.stepCount === "number" && Number.isFinite(input.step.stepCount)
        ? input.step.stepCount
        : null,
    stepObjective: input.step.stepObjective ?? null,
    stepDeliverable: input.step.stepDeliverable ?? null,
    stepOwnerPersona: input.step.ownerPersona ?? null,
    stepOwnerMemberId: input.step.ownerMemberId ?? null,
    stepReviewerPersona: input.step.reviewerPersona ?? null,
    stepReviewerMemberId: input.step.reviewerMemberId ?? null,
    stepAttempt: input.step.attempt ?? null,
    stepVerificationMethod: input.step.verificationMethod ?? null,
    stepRetryRule: input.step.retryRule ?? null,
    stepEvidenceRequirements: normalizeList(input.step.evidenceRequirements),
    stepQualityCriteria: normalizeList(input.step.qualityCriteria),
    stepReviewChecklist: normalizeList(input.step.reviewChecklist),
    stepSelectedSkillId: input.step.selectedSkillId ?? null,
    stepSelectedProvider: input.step.selectedProvider ?? null,
    stepSelectedModelId: input.step.selectedModelId ?? null,
    stepResultSummary: summarizeResult(input.resultSummary),
    stepReviewStatus: input.reviewStatus ?? null,
    stepReviewScore:
      typeof input.reviewScore === "number" && Number.isFinite(input.reviewScore)
        ? input.reviewScore
        : null,
    stepReviewIteration:
      typeof input.reviewIteration === "number" && Number.isFinite(input.reviewIteration)
        ? input.reviewIteration
        : null,
    stepReviewNote: normalizeText(input.reviewNote),
    stepRepairInstructions: normalizeText(input.repairInstructions),
    stepNextAction: normalizeText(input.nextAction),
  };
}
