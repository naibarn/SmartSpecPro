export type ScenarioInputBasis = "observed" | "estimated" | "user_stated";
export type ScenarioPeriodUnit = "month" | "year";

export interface ScenarioAssumption {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly low?: number;
  readonly high?: number;
  /** The stated unit is preserved; this calculator never converts assumptions. */
  readonly unit: string;
  readonly basis: ScenarioInputBasis;
  readonly material: boolean;
  readonly evidenceRefs?: readonly string[];
  readonly sourceDate?: string;
  readonly estimationMethod?: string;
}

export interface ScenarioMoneyItem {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly low?: number;
  readonly high?: number;
  readonly currencyCode: string;
  readonly basis: ScenarioInputBasis;
  readonly evidenceRefs?: readonly string[];
  readonly sourceDate?: string;
  readonly estimationMethod?: string;
}

export interface ScenarioRecurringMoneyItem extends ScenarioMoneyItem {
  readonly period: ScenarioPeriodUnit;
}

export interface ScenarioJurisdiction {
  readonly code: string;
  readonly ruleSetVersion: string;
  readonly sourceDate: string;
}

export type ProfessionalVerificationKind =
  | "professional_appraisal"
  | "binding_quotation"
  | "official_government_value"
  | "certified_engineering_legal_determination";

export interface ProfessionalVerification {
  readonly kind: ProfessionalVerificationKind;
  readonly reference: string;
  readonly verifiedAt: string;
}

export interface ScenarioCalculationInput {
  readonly calculationVersion: string;
  readonly scenarioId: string;
  readonly currencyCode: string;
  readonly horizon: { readonly value: number; readonly unit: ScenarioPeriodUnit };
  readonly assumptions: readonly ScenarioAssumption[];
  readonly oneTimeCosts: readonly ScenarioMoneyItem[];
  readonly recurringCosts: readonly ScenarioRecurringMoneyItem[];
  readonly revenues: readonly ScenarioRecurringMoneyItem[];
  /** Requires jurisdiction source and professional evidence before readiness can be ready. */
  readonly regulatedContext?: boolean;
  readonly jurisdiction?: ScenarioJurisdiction;
  readonly professionalVerification?: ProfessionalVerification;
}

export interface ScenarioCalculationResult {
  readonly calculationVersion: string;
  readonly scenarioId: string;
  readonly methodology: {
    readonly id: "cash-flow-horizon-v1";
    readonly totalProjectCostFormula: "one_time_costs + recurring_costs_for_horizon";
    readonly netCashFlowFormula: "revenue_for_horizon - total_project_cost";
    readonly roiFormula: "net_cash_flow / total_project_cost";
    readonly paybackFormula: "one_time_costs / monthly_net_cash_flow";
  };
  readonly unit: { readonly currencyCode: string; readonly horizon: { readonly value: number; readonly unit: ScenarioPeriodUnit } };
  readonly totals: {
    readonly oneTimeCosts: number;
    readonly recurringCostsForHorizon: number;
    readonly revenueForHorizon: number;
    readonly totalProjectCost: number;
    readonly netCashFlow: number;
    readonly breakEvenRevenue: number;
    readonly netCashFlowRange: { readonly low: number; readonly high: number };
    readonly roi?: number;
    readonly monthlyNetCashFlow: number;
    readonly paybackMonths?: number;
  };
  readonly assumptionDisclosures: readonly {
    readonly id: string;
    readonly basis: ScenarioInputBasis;
    readonly material: boolean;
    readonly unit: string;
    readonly evidenceRefs: readonly string[];
  }[];
  readonly inputDisclosures: readonly {
    readonly id: string;
    readonly kind: "assumption" | "one_time_cost" | "recurring_cost" | "revenue";
    readonly basis: ScenarioInputBasis;
    readonly low: number;
    readonly value: number;
    readonly high: number;
    readonly unit: string;
    readonly currencyCode?: string;
    readonly period?: ScenarioPeriodUnit;
    readonly evidenceRefs: readonly string[];
    readonly sourceDate?: string;
    readonly estimationMethod?: string;
  }[];
  readonly limitations: readonly string[];
  readonly readiness: {
    readonly status: "blocked" | "partial" | "ready";
    readonly verificationLabel: "informational_estimate";
    readonly criticalMissing: readonly string[];
  };
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_ITEMS = 200;
const MAX_EVIDENCE_REFS = 128;
const MAX_AMOUNT = 1_000_000_000_000;
const round = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function validateEvidenceRefs(value: readonly string[] | undefined, required: boolean): boolean {
  if (!value) return !required;
  return Array.isArray(value) && isDenseArray(value) && value.length >= (required ? 1 : 0) && value.length <= MAX_EVIDENCE_REFS &&
    value.every(reference => ID.test(reference)) && new Set(value).size === value.length;
}

function validateBasis(input: { readonly basis: ScenarioInputBasis; readonly evidenceRefs?: readonly string[]; readonly sourceDate?: string; readonly estimationMethod?: string }): boolean {
  if (input.basis === "observed") return validateEvidenceRefs(input.evidenceRefs, true) && typeof input.sourceDate === "string" && isDateOnly(input.sourceDate);
  if (input.basis === "estimated") return validateEvidenceRefs(input.evidenceRefs, true) && typeof input.estimationMethod === "string" && ID.test(input.estimationMethod);
  return input.basis === "user_stated" && validateEvidenceRefs(input.evidenceRefs, false) &&
    (input.sourceDate === undefined || isDateOnly(input.sourceDate)) &&
    (input.estimationMethod === undefined || ID.test(input.estimationMethod));
}

function validateMoneyItem(item: ScenarioMoneyItem, currencyCode: string, recurring: boolean): void {
  if (!ID.test(item.id) || !item.label.trim() || item.label.length > 200 || !Number.isFinite(item.amount) || item.amount < 0 || item.amount > MAX_AMOUNT ||
    item.currencyCode !== currencyCode || !validateBasis(item) ||
    (item.low !== undefined && (!Number.isFinite(item.low) || item.low < 0 || item.low > item.amount)) ||
    (item.high !== undefined && (!Number.isFinite(item.high) || item.high < item.amount || item.high > MAX_AMOUNT)) ||
    (recurring && !["month", "year"].includes((item as ScenarioRecurringMoneyItem).period))) {
    throw new Error(item.currencyCode !== currencyCode || (recurring && !["month", "year"].includes((item as ScenarioRecurringMoneyItem).period)) ? "SCENARIO_UNIT_INVALID" : "SCENARIO_INPUT_INVALID");
  }
}

function validate(input: ScenarioCalculationInput): void {
  const allArrays = [input.assumptions, input.oneTimeCosts, input.recurringCosts, input.revenues];
  if (!ID.test(input.calculationVersion) || !ID.test(input.scenarioId) || !CURRENCY.test(input.currencyCode) ||
    !Number.isInteger(input.horizon.value) || input.horizon.value < 1 || input.horizon.value > 1_200 || !["month", "year"].includes(input.horizon.unit) ||
    allArrays.some(items => !Array.isArray(items) || !isDenseArray(items) || items.length > MAX_ITEMS)) throw new Error("SCENARIO_UNIT_INVALID");
  if (input.regulatedContext !== undefined && typeof input.regulatedContext !== "boolean") throw new Error("SCENARIO_INPUT_INVALID");

  const ids = new Set<string>();
  const ensureUnique = (id: string): void => {
    if (ids.has(id)) throw new Error("SCENARIO_INPUT_INVALID");
    ids.add(id);
  };
  for (const assumption of input.assumptions) {
    if (!ID.test(assumption.id) || !assumption.label.trim() || assumption.label.length > 200 || !Number.isFinite(assumption.value) ||
      (assumption.low !== undefined && (!Number.isFinite(assumption.low) || assumption.low > assumption.value)) ||
      (assumption.high !== undefined && (!Number.isFinite(assumption.high) || assumption.high < assumption.value)) ||
      !assumption.unit.trim() || assumption.unit.length > 80 || typeof assumption.material !== "boolean" || !validateBasis(assumption)) throw new Error("SCENARIO_INPUT_INVALID");
    ensureUnique(assumption.id);
  }
  for (const item of input.oneTimeCosts) {
    validateMoneyItem(item, input.currencyCode, false);
    ensureUnique(item.id);
  }
  for (const item of [...input.recurringCosts, ...input.revenues]) {
    validateMoneyItem(item, input.currencyCode, true);
    ensureUnique(item.id);
  }
  if (input.jurisdiction && (!ID.test(input.jurisdiction.code) || !ID.test(input.jurisdiction.ruleSetVersion) || !isDateOnly(input.jurisdiction.sourceDate))) throw new Error("SCENARIO_INPUT_INVALID");
  if (input.professionalVerification && (!ID.test(input.professionalVerification.reference) || !isTimestamp(input.professionalVerification.verifiedAt) ||
    !["professional_appraisal", "binding_quotation", "official_government_value", "certified_engineering_legal_determination"].includes(input.professionalVerification.kind))) throw new Error("SCENARIO_INPUT_INVALID");
}

function horizonMonths(horizon: ScenarioCalculationInput["horizon"]): number {
  return horizon.unit === "year" ? horizon.value * 12 : horizon.value;
}

function amountForHorizon(items: readonly ScenarioRecurringMoneyItem[], months: number): number {
  return items.reduce((total, item) => total + item.amount * (item.period === "month" ? months : months / 12), 0);
}

function monthlyAmount(items: readonly ScenarioRecurringMoneyItem[]): number {
  return items.reduce((total, item) => total + item.amount * (item.period === "month" ? 1 : 1 / 12), 0);
}

function rangedAmountForHorizon(items: readonly ScenarioRecurringMoneyItem[], months: number, bound: "low" | "high"): number {
  return items.reduce((total, item) => total + (item[bound] ?? item.amount) * (item.period === "month" ? months : months / 12), 0);
}

function assertExactOutputRange(values: readonly number[]): void {
  const maximum = Number.MAX_SAFE_INTEGER / 1_000_000;
  if (values.some(value => !Number.isFinite(value) || Math.abs(value) > maximum)) throw new Error("SCENARIO_NUMERICAL_RANGE_EXCEEDED");
}

/**
 * Pure, version-pinned financial scenario arithmetic. It preserves declared
 * units and input provenance, performs no currency conversion, and never
 * predicts demand, a sale, or an external side effect.
 */
export function calculateScenario(input: ScenarioCalculationInput): ScenarioCalculationResult {
  validate(input);
  const months = horizonMonths(input.horizon);
  const oneTimeCosts = input.oneTimeCosts.reduce((total, item) => total + item.amount, 0);
  const recurringCostsForHorizon = amountForHorizon(input.recurringCosts, months);
  const revenueForHorizon = amountForHorizon(input.revenues, months);
  const totalProjectCost = oneTimeCosts + recurringCostsForHorizon;
  const netCashFlow = revenueForHorizon - totalProjectCost;
  const oneTimeCostLow = input.oneTimeCosts.reduce((total, item) => total + (item.low ?? item.amount), 0);
  const oneTimeCostHigh = input.oneTimeCosts.reduce((total, item) => total + (item.high ?? item.amount), 0);
  const projectCostLow = oneTimeCostLow + rangedAmountForHorizon(input.recurringCosts, months, "low");
  const projectCostHigh = oneTimeCostHigh + rangedAmountForHorizon(input.recurringCosts, months, "high");
  const revenueLow = rangedAmountForHorizon(input.revenues, months, "low");
  const revenueHigh = rangedAmountForHorizon(input.revenues, months, "high");
  const netCashFlowLow = revenueLow - projectCostHigh;
  const netCashFlowHigh = revenueHigh - projectCostLow;
  assertExactOutputRange([oneTimeCosts, recurringCostsForHorizon, revenueForHorizon, totalProjectCost, netCashFlow, projectCostLow, projectCostHigh, revenueLow, revenueHigh, netCashFlowLow, netCashFlowHigh]);
  const monthlyNetCashFlow = monthlyAmount(input.revenues) - monthlyAmount(input.recurringCosts);
  const paybackMonths = oneTimeCosts > 0 && monthlyNetCashFlow > 0 ? oneTimeCosts / monthlyNetCashFlow : undefined;
  const roi = totalProjectCost > 0 ? netCashFlow / totalProjectCost : undefined;
  assertExactOutputRange([monthlyNetCashFlow, ...(paybackMonths === undefined ? [] : [paybackMonths]), ...(roi === undefined ? [] : [roi])]);
  const limitations = new Set<string>();
  const discloseBasis = (item: { readonly id: string; readonly basis: ScenarioInputBasis; readonly material?: boolean }): void => {
    if (item.basis === "estimated") limitations.add(`estimate:${item.id}`);
    if (item.basis === "user_stated") limitations.add(`user_stated:${item.id}`);
    if (item.material && item.basis !== "observed") limitations.add(`material_assumption_unverified:${item.id}`);
  };
  for (const assumption of input.assumptions) discloseBasis(assumption);
  for (const item of [...input.oneTimeCosts, ...input.recurringCosts, ...input.revenues]) discloseBasis(item);
  if ([...input.assumptions, ...input.oneTimeCosts, ...input.recurringCosts, ...input.revenues].some(item => item.low !== undefined || item.high !== undefined)) limitations.add("uncertainty_interval_propagated");

  const criticalMissing: string[] = [];
  if (input.regulatedContext && !input.jurisdiction) criticalMissing.push("jurisdiction");
  if (input.regulatedContext) criticalMissing.push("server_verified_professional_receipt");
  if (input.regulatedContext && input.professionalVerification) limitations.add("professional_verification_claim_not_authoritatively_resolved");
  const readiness = criticalMissing.length > 0
    ? "blocked"
    : limitations.size > 0
      ? "partial"
      : "ready";

  return {
    calculationVersion: input.calculationVersion,
    scenarioId: input.scenarioId,
    methodology: {
      id: "cash-flow-horizon-v1",
      totalProjectCostFormula: "one_time_costs + recurring_costs_for_horizon",
      netCashFlowFormula: "revenue_for_horizon - total_project_cost",
      roiFormula: "net_cash_flow / total_project_cost",
      paybackFormula: "one_time_costs / monthly_net_cash_flow",
    },
    unit: { currencyCode: input.currencyCode, horizon: { ...input.horizon } },
    totals: {
      oneTimeCosts: round(oneTimeCosts),
      recurringCostsForHorizon: round(recurringCostsForHorizon),
      revenueForHorizon: round(revenueForHorizon),
      totalProjectCost: round(totalProjectCost),
      netCashFlow: round(netCashFlow),
      breakEvenRevenue: round(totalProjectCost),
      netCashFlowRange: { low: round(netCashFlowLow), high: round(netCashFlowHigh) },
      ...(roi === undefined ? {} : { roi: round(roi) }),
      monthlyNetCashFlow: round(monthlyNetCashFlow),
      ...(paybackMonths === undefined ? {} : { paybackMonths: round(paybackMonths) }),
    },
    assumptionDisclosures: input.assumptions
      .map(assumption => ({ id: assumption.id, basis: assumption.basis, material: assumption.material, unit: assumption.unit, evidenceRefs: [...(assumption.evidenceRefs ?? [])] }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    inputDisclosures: [
      ...input.assumptions.map(item => ({ id: item.id, kind: "assumption" as const, basis: item.basis, low: item.low ?? item.value, value: item.value, high: item.high ?? item.value, unit: item.unit, evidenceRefs: [...(item.evidenceRefs ?? [])], ...(item.sourceDate ? { sourceDate: item.sourceDate } : {}), ...(item.estimationMethod ? { estimationMethod: item.estimationMethod } : {}) })),
      ...input.oneTimeCosts.map(item => ({ id: item.id, kind: "one_time_cost" as const, basis: item.basis, low: item.low ?? item.amount, value: item.amount, high: item.high ?? item.amount, unit: item.currencyCode, currencyCode: item.currencyCode, evidenceRefs: [...(item.evidenceRefs ?? [])], ...(item.sourceDate ? { sourceDate: item.sourceDate } : {}), ...(item.estimationMethod ? { estimationMethod: item.estimationMethod } : {}) })),
      ...input.recurringCosts.map(item => ({ id: item.id, kind: "recurring_cost" as const, basis: item.basis, low: item.low ?? item.amount, value: item.amount, high: item.high ?? item.amount, unit: item.currencyCode, currencyCode: item.currencyCode, period: item.period, evidenceRefs: [...(item.evidenceRefs ?? [])], ...(item.sourceDate ? { sourceDate: item.sourceDate } : {}), ...(item.estimationMethod ? { estimationMethod: item.estimationMethod } : {}) })),
      ...input.revenues.map(item => ({ id: item.id, kind: "revenue" as const, basis: item.basis, low: item.low ?? item.amount, value: item.amount, high: item.high ?? item.amount, unit: item.currencyCode, currencyCode: item.currencyCode, period: item.period, evidenceRefs: [...(item.evidenceRefs ?? [])], ...(item.sourceDate ? { sourceDate: item.sourceDate } : {}), ...(item.estimationMethod ? { estimationMethod: item.estimationMethod } : {}) })),
    ].sort((left, right) => left.id.localeCompare(right.id)),
    limitations: [...limitations].sort(),
    readiness: {
      status: readiness,
      verificationLabel: "informational_estimate",
      criticalMissing,
    },
  };
}
