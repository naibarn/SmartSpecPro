export type EmergencyNeedFulfillmentStatus =
  | "reported" | "triage" | "verified" | "partially_fulfilled" | "fulfilled" | "verified_fulfilled" | "cancelled";

export type EmergencyNeedFulfillmentError = "quantity" | "quantity_status" | "active_assignments";

export type EmergencyNeedFulfillmentResult =
  | { ok: true; status: EmergencyNeedFulfillmentStatus; fulfilledQuantity: string }
  | { ok: false; reason: EmergencyNeedFulfillmentError };

function toMilli(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return Math.round(parsed * 1000);
}

/** Derives target-based need state and protects expected responder reservations. */
export function resolveEmergencyNeedFulfillment(input: {
  currentStatus: EmergencyNeedFulfillmentStatus;
  requestedQuantity: number | string | null;
  currentFulfilledQuantity: number | string | null;
  fulfilledQuantity?: number;
  requestedStatus?: EmergencyNeedFulfillmentStatus;
  activeReservationsMilli?: number;
}): EmergencyNeedFulfillmentResult {
  const fulfilledMilli = toMilli(input.fulfilledQuantity ?? input.currentFulfilledQuantity);
  const requestedMilli = input.requestedQuantity === null ? null : toMilli(input.requestedQuantity);
  const reservedMilli = input.activeReservationsMilli ?? 0;
  if (!Number.isSafeInteger(fulfilledMilli) || (requestedMilli !== null && !Number.isSafeInteger(requestedMilli)) || !Number.isSafeInteger(reservedMilli) || reservedMilli < 0) {
    return { ok: false, reason: "quantity" };
  }
  const explicit = input.requestedStatus;
  if (["cancelled", "fulfilled", "verified_fulfilled"].includes(explicit ?? "") && reservedMilli > 0) {
    return { ok: false, reason: "active_assignments" };
  }
  if (requestedMilli !== null) {
    if (fulfilledMilli > requestedMilli || fulfilledMilli + reservedMilli > requestedMilli) return { ok: false, reason: "quantity" };
    if ((explicit === "fulfilled" || explicit === "verified_fulfilled") && fulfilledMilli < requestedMilli) return { ok: false, reason: "quantity_status" };
    if (explicit === "partially_fulfilled" && (fulfilledMilli <= 0 || fulfilledMilli >= requestedMilli)) return { ok: false, reason: "quantity_status" };
  }
  if ((explicit === "fulfilled" || explicit === "verified_fulfilled") && fulfilledMilli <= 0) return { ok: false, reason: "quantity" };

  const status = explicit === "cancelled"
    ? "cancelled"
    : requestedMilli !== null && fulfilledMilli >= requestedMilli
      ? (explicit === "verified_fulfilled" ? "verified_fulfilled" : "fulfilled")
      : requestedMilli !== null && fulfilledMilli > 0
        ? "partially_fulfilled"
        : explicit ?? input.currentStatus;
  return { ok: true, status, fulfilledQuantity: (fulfilledMilli / 1000).toFixed(3) };
}
