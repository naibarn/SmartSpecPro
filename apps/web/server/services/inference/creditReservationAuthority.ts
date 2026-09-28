import {
  drawFromReservation,
  getCreditReservationSnapshot,
  type CreditReservation,
} from "../creditService";

const USD_MICROS_PER_CREDIT = 1_000;

export type InferenceReservationAuthority = {
  reservationId: string;
  tenantId: string;
  principalRef: string;
  availableBudgetMicros: number;
  expiresAt: string;
  status: "reserved";
};

export type CreditReservationAuthorityResult =
  | { ok: true; authority: InferenceReservationAuthority }
  | {
      ok: false;
      reason:
        | "RESERVATION_SCOPE_MISMATCH"
        | "RESERVATION_EXPIRED"
        | "RESERVATION_AMOUNT_INVALID"
        | "RESERVATION_AMOUNT_OVERFLOW";
    };

/**
 * Converts the existing creditService reservation snapshot into Spec 231's
 * cost unit. CreditService defines 1 credit as USD $0.001, or 1,000 USD-micros.
 * Scope fields come from authenticated server context, never request JSON.
 */
export function adaptCreditReservationForInference(input: {
  reservation: CreditReservation;
  expectedUserId: number;
  expectedTenantId: string;
  trustedPrincipalRef: string;
  now?: Date;
}): CreditReservationAuthorityResult {
  const { reservation } = input;
  const tenantId = input.expectedTenantId.trim();
  const principalRef = input.trustedPrincipalRef.trim();
  if (
    !Number.isSafeInteger(input.expectedUserId) ||
    input.expectedUserId <= 0 ||
    reservation.userId !== input.expectedUserId ||
    !tenantId ||
    reservation.tenantId !== tenantId ||
    !principalRef ||
    !reservation.reservationId.trim()
  ) {
    return { ok: false, reason: "RESERVATION_SCOPE_MISMATCH" };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const expiresAtMs = Date.parse(reservation.expiresAt);
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= nowMs
  ) {
    return { ok: false, reason: "RESERVATION_EXPIRED" };
  }

  if (
    !Number.isSafeInteger(reservation.reservedAmount) ||
    reservation.reservedAmount < 0 ||
    !Number.isSafeInteger(reservation.drawnAmount) ||
    reservation.drawnAmount < 0 ||
    reservation.drawnAmount > reservation.reservedAmount
  ) {
    return { ok: false, reason: "RESERVATION_AMOUNT_INVALID" };
  }

  const availableMicros =
    BigInt(reservation.reservedAmount - reservation.drawnAmount) *
    BigInt(USD_MICROS_PER_CREDIT);
  if (availableMicros > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: "RESERVATION_AMOUNT_OVERFLOW" };
  }

  return {
    ok: true,
    authority: {
      reservationId: reservation.reservationId,
      tenantId,
      principalRef,
      availableBudgetMicros: Number(availableMicros),
      expiresAt: reservation.expiresAt,
      status: "reserved",
    },
  };
}

/**
 * Builds the execution-time loader from the canonical credit-service reader.
 * User, tenant, and principal scope are fixed from authenticated server context
 * at construction time; request-supplied scope can never widen the lookup.
 */
export function createCreditReservationAuthorityLoader(input: {
  expectedUserId: number;
  expectedTenantId: string;
  trustedPrincipalRef: string;
  readReservation?: (
    reservationId: string,
  ) => Promise<CreditReservation | null>;
}): (request: {
  reservationId: string;
  tenantId: string;
  principalRef: string;
}) => Promise<InferenceReservationAuthority | null> {
  const readReservation =
    input.readReservation ?? getCreditReservationSnapshot;

  return async (request) => {
    if (
      request.tenantId !== input.expectedTenantId ||
      request.principalRef !== input.trustedPrincipalRef ||
      !request.reservationId.trim()
    ) {
      return null;
    }

    const reservation = await readReservation(request.reservationId);
    if (!reservation) return null;

    const adapted = adaptCreditReservationForInference({
      reservation,
      expectedUserId: input.expectedUserId,
      expectedTenantId: input.expectedTenantId,
      trustedPrincipalRef: input.trustedPrincipalRef,
    });
    return adapted.ok ? adapted.authority : null;
  };
}

/**
 * Settles one completed provider attempt through the existing credit owner.
 * The owner validates the reservation scope again and the physical attempt ID
 * is the idempotency key, so retries cannot draw the same attempt twice.
 */
export function createCreditReservationSettlement(input: {
  expectedUserId: number;
  expectedTenantId: string;
  trustedPrincipalRef: string;
  readReservation?: (
    reservationId: string,
  ) => Promise<CreditReservation | null>;
  draw?: typeof drawFromReservation;
}): (request: {
  reservationId: string;
  settlementKey: string;
  chargedCostMicros: number;
}) => Promise<boolean> {
  const readReservation = input.readReservation ?? getCreditReservationSnapshot;
  const draw = input.draw ?? drawFromReservation;

  return async request => {
    if (
      !request.reservationId.trim() ||
      !request.settlementKey.trim() ||
      request.settlementKey.length > 200
    ) {
      return false;
    }
    const credits = inferenceCostMicrosToCreditUnits(request.chargedCostMicros);
    if (credits === null) return false;

    try {
      const reservation = await readReservation(request.reservationId);
      if (!reservation) return false;
      const authority = adaptCreditReservationForInference({
        reservation,
        expectedUserId: input.expectedUserId,
        expectedTenantId: input.expectedTenantId,
        trustedPrincipalRef: input.trustedPrincipalRef,
      });
      if (!authority.ok) return false;
      await draw(
        request.reservationId,
        credits,
        "Spec 231 inference attempt settlement",
        request.settlementKey,
      );
      return true;
    } catch {
      return false;
    }
  };
}

/** Mirrors creditService's rounded-up, one-credit-minimum cost conversion. */
export function inferenceCostMicrosToCreditUnits(
  costMicros: number
): number | null {
  if (!Number.isSafeInteger(costMicros) || costMicros < 0) return null;
  const micros = BigInt(costMicros);
  const roundedUpCredits =
    (micros + BigInt(USD_MICROS_PER_CREDIT) - 1n) /
    BigInt(USD_MICROS_PER_CREDIT);
  // Match creditService.calculateCreditsFromCost: even free/zero-price
  // provider mappings have a one-credit minimum for user-owned LLM calls.
  const credits = roundedUpCredits > 0n ? roundedUpCredits : 1n;
  return credits > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(credits);
}
