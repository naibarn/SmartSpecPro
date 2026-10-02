import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type ReservationStatus = "active" | "refunding" | "committing" | "refunded" | "committed";

export type StoredReservation = {
  payload: Record<string, unknown>;
  status: ReservationStatus;
};

export async function loadCreditReservation(reservationId: string): Promise<StoredReservation | null> {
  const result = await getDb().execute(sql<Array<StoredReservation>>`
    SELECT payload, status FROM credit_reservation_snapshots
    WHERE reservation_id = ${reservationId} AND expires_at > now()
  `);
  return result[0] ?? null;
}

export async function loadCreditReservationLifecycle(
  reservationId: string,
): Promise<{ status: ReservationStatus; expiresAt: Date } | null> {
  const result = await getDb().execute(sql<Array<{ status: ReservationStatus; expires_at: Date }>>`
    SELECT status, expires_at FROM credit_reservation_snapshots
    WHERE reservation_id = ${reservationId}
  `);
  return result[0] ? { status: result[0].status, expiresAt: result[0].expires_at } : null;
}

export async function insertCreditReservation(
  reservationId: string,
  payload: Record<string, unknown>,
  expiresAt: Date,
): Promise<boolean> {
  const result = await getDb().execute(sql<Array<{ reservation_id: string }>>`
    INSERT INTO credit_reservation_snapshots (reservation_id, payload, expires_at)
    VALUES (${reservationId}, ${JSON.stringify(payload)}::jsonb, ${expiresAt.toISOString()})
    ON CONFLICT (reservation_id) DO NOTHING
    RETURNING reservation_id
  `);
  if (Math.random() < 0.01) {
    try {
      await getDb().execute(sql`DELETE FROM credit_reservation_snapshots WHERE expires_at <= now()`);
    } catch {
      // Expired reservations are already unavailable; pruning is best-effort.
    }
  }
  return result.length > 0;
}

export async function drawCreditReservation(
  reservationId: string,
  amount: number,
  settlementKey?: string,
): Promise<{ drawn: number; remaining: number; duplicate?: boolean }> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Reservation draw amount must be a positive integer");
  return getDb().transaction(async (tx) => {
    const selected = await tx.execute(sql<Array<StoredReservation>>`
      SELECT payload, status FROM credit_reservation_snapshots
      WHERE reservation_id = ${reservationId} AND expires_at > now()
      FOR UPDATE
    `);
    const stored = selected[0];
    if (!stored) throw new Error(`Reservation ${reservationId} not found or expired`);
    if (stored.status !== "active") throw new Error(`Reservation ${reservationId} is already closed`);
    const reservation = stored.payload as Record<string, any>;
    const settledCallAmounts = reservation.settledCallAmounts ?? {};
    if (settlementKey && Object.prototype.hasOwnProperty.call(settledCallAmounts, settlementKey)) {
      return {
        drawn: 0,
        remaining: reservation.reservedAmount - reservation.drawnAmount,
        duplicate: true,
      };
    }
    const newDrawn = Number(reservation.drawnAmount) + amount;
    if (newDrawn > Number(reservation.reservedAmount)) throw new Error("Reservation budget exceeded");
    const nextPayload = {
      ...reservation,
      drawnAmount: newDrawn,
      ...(settlementKey ? { settledCallAmounts: { ...settledCallAmounts, [settlementKey]: amount } } : {}),
    };
    await tx.execute(sql`
      UPDATE credit_reservation_snapshots
      SET payload = ${JSON.stringify(nextPayload)}::jsonb, updated_at = now()
      WHERE reservation_id = ${reservationId}
    `);
    return { drawn: amount, remaining: Number(reservation.reservedAmount) - newDrawn, duplicate: false };
  });
}

export async function beginCreditReservationClose(
  reservationId: string,
  intent: "refunding" | "committing",
): Promise<Record<string, unknown> | null> {
  return getDb().transaction(async (tx) => {
    const selected = await tx.execute(sql<Array<StoredReservation>>`
      SELECT payload, status FROM credit_reservation_snapshots
      WHERE reservation_id = ${reservationId} AND expires_at > now()
      FOR UPDATE
    `);
    const stored = selected[0];
    if (!stored || stored.status === "refunded" || stored.status === "committed") return null;
    if (stored.status !== "active" && stored.status !== intent) return null;
    if (stored.status === "active") {
      await tx.execute(sql`
        UPDATE credit_reservation_snapshots SET status = ${intent}, updated_at = now()
        WHERE reservation_id = ${reservationId}
      `);
    }
    return stored.payload;
  });
}

export async function finishCreditReservationClose(
    reservationId: string,
  status: "refunded" | "committed",
): Promise<void> {
  await getDb().execute(sql`
    UPDATE credit_reservation_snapshots
    SET status = ${status}, updated_at = now()
    WHERE reservation_id = ${reservationId} AND status = ${status === "refunded" ? "refunding" : "committing"}
  `);
}
