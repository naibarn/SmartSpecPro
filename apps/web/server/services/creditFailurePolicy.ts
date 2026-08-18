export type CreditFailureSource = "user" | "provider" | "unknown";
export type CreditModelKind = "llm" | "media" | "unknown";
export type CreditFailureRoute =
  | "user_purchase"
  | "admin_suspicious"
  | "admin_provider"
  | "none";

export interface CreditFailureContext {
  source?: CreditFailureSource;
  modelKind?: CreditModelKind;
  requestedCredits?: number | null;
  provider?: string | null;
  reason?: string | null;
}

export interface CreditFailureClassification {
  isCreditFailure: boolean;
  source: CreditFailureSource;
  modelKind: CreditModelKind;
  requestedCredits: number | null;
  threshold: number | null;
  provider: string | null;
  route: CreditFailureRoute;
  adminPriority: "high" | "critical" | null;
}

export const CREDIT_THRESHOLDS = {
  llm: 3_000,
  media: 10_000,
  unknown: 3_000,
} as const;

const CREDIT_FAILURE_PATTERN =
  /(?:insufficient|not enough|need more|low|exhausted|exceeded).{0,40}(?:credit|balance|fund|quota)|(?:credit|balance|fund|quota).{0,40}(?:insufficient|not enough|low|exhausted|exceeded)/i;
const REQUIRED_CREDITS_PATTERN =
  /(?:required|need(?:ed)?|amount|credits?)\s*(?:credits?)?\s*[:=]?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:credits?)?\s*(?:required|need(?:ed)?)/i;
const PROVIDER_NAME_PATTERN = /\b(kie(?:\.ai)?|openrouter)\b/i;

function finiteCredits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function inferModelKind(path: string, message: string): CreditModelKind {
  const text = `${path} ${message}`.toLowerCase();
  if (/(?:image|video|audio|media|render|kie\.ai)/i.test(text)) return "media";
  if (/(?:llm|chat|skill|story|draft|prompt|qualityqc|quality.review|script)/i.test(text)) return "llm";
  return "unknown";
}

function inferProvider(message: string, context?: CreditFailureContext): string | null {
  const explicit = typeof context?.provider === "string" ? context.provider.trim() : "";
  if (explicit) return explicit.slice(0, 100);
  const match = message.match(PROVIDER_NAME_PATTERN);
  return match?.[1] ? match[1].slice(0, 100) : null;
}

/**
 * Classify only credit/balance/quota failures. Structured context wins over
 * message heuristics, while provider markers always take the escalation path.
 */
export function classifyCreditFailure(input: {
  errorMessage?: unknown;
  path?: string | null;
  context?: CreditFailureContext;
}): CreditFailureClassification {
  const message = typeof input.errorMessage === "string" ? input.errorMessage : String(input.errorMessage ?? "");
  const path = typeof input.path === "string" ? input.path : "";
  const context = input.context ?? {};
  const provider = inferProvider(message, context);
  const isCreditFailure =
    Boolean(context.source && context.source !== "unknown") ||
    CREDIT_FAILURE_PATTERN.test(message) ||
    Boolean(provider && /(?:credit|balance|fund|quota)/i.test(message));

  if (!isCreditFailure) {
    return {
      isCreditFailure: false,
      source: "unknown",
      modelKind: "unknown",
      requestedCredits: null,
      threshold: null,
      provider: null,
      route: "none",
      adminPriority: null,
    };
  }

  const source: CreditFailureSource =
    context.source === "provider" || provider ? "provider" : context.source === "user" ? "user" : "unknown";
  const modelKind = context.modelKind && context.modelKind !== "unknown"
    ? context.modelKind
    : inferModelKind(path, message);
  const requestedMatch = message.match(REQUIRED_CREDITS_PATTERN);
  const requestedCredits = finiteCredits(context.requestedCredits) ??
    finiteCredits(Number(requestedMatch?.[1] ?? requestedMatch?.[2]));
  const threshold = CREDIT_THRESHOLDS[modelKind];

  if (source === "provider") {
    return {
      isCreditFailure: true,
      source,
      modelKind,
      requestedCredits,
      threshold,
      provider,
      route: "admin_provider",
      adminPriority: "critical",
    };
  }

  const suspicious = requestedCredits != null && requestedCredits > threshold;
  return {
    isCreditFailure: true,
    source,
    modelKind,
    requestedCredits,
    threshold,
    provider,
    route: suspicious ? "admin_suspicious" : "user_purchase",
    adminPriority: suspicious ? "high" : null,
  };
}

export function isCreditFailureMessage(errorMessage: unknown): boolean {
  return classifyCreditFailure({ errorMessage }).isCreditFailure;
}
