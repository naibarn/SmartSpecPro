export interface CanonicalTimebase {
  num: number;
  den: number;
}

export type CanonicalTimeDomain = "source" | "absolute" | "trimmed";

export interface CanonicalTime {
  domain: CanonicalTimeDomain;
  ticks: number;
}

function assertFiniteNonNegative(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
}

export function assertCanonicalTimebase(
  value: unknown,
): asserts value is CanonicalTimebase {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("TIMEBASE_INVALID");
  const candidate = value as Partial<CanonicalTimebase>;
  const { num, den } = candidate;
  if (
    typeof num !== "number" ||
    !Number.isSafeInteger(num) ||
    num <= 0 ||
    typeof den !== "number" ||
    !Number.isSafeInteger(den) ||
    den <= 0
  ) {
    throw new Error("TIMEBASE_INVALID");
  }
}

export function millisecondsToTicks(
  milliseconds: number,
  timebase: CanonicalTimebase,
): number {
  assertCanonicalTimebase(timebase);
  assertFiniteNonNegative(milliseconds, "TIME_VALUE_INVALID");
  const ticks = Math.round(
    (milliseconds * timebase.num) / (timebase.den * 1_000),
  );
  if (!Number.isSafeInteger(ticks)) throw new Error("TIME_VALUE_OVERFLOW");
  return ticks;
}

export function ticksToMilliseconds(
  ticks: number,
  timebase: CanonicalTimebase,
): number {
  assertCanonicalTimebase(timebase);
  if (!Number.isSafeInteger(ticks) || ticks < 0)
    throw new Error("TIME_TICKS_INVALID");
  const milliseconds = (ticks * timebase.den * 1_000) / timebase.num;
  if (!Number.isFinite(milliseconds)) throw new Error("TIME_VALUE_OVERFLOW");
  return milliseconds;
}

export function assertCanonicalTime(
  value: unknown,
): asserts value is CanonicalTime {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("TIME_INVALID");
  const candidate = value as Partial<CanonicalTime>;
  const { domain, ticks } = candidate;
  if (
    !["source", "absolute", "trimmed"].includes(domain ?? "") ||
    typeof ticks !== "number" ||
    !Number.isSafeInteger(ticks) ||
    ticks < 0
  ) {
    throw new Error("TIME_INVALID");
  }
}
