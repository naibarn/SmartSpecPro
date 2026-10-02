import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { emergencyCaseEvents, emergencyCases, emergencyReports } from "../../drizzle/schema";

/** Durable, credit-free admission into human triage; AI is not an authority here. */
export async function markEmergencyReportReadyForTriage(input: { reportId: string; tenantId: string }): Promise<void> {
  await getDb().transaction(async tx => {
    const [report] = await tx.select().from(emergencyReports)
      .where(and(eq(emergencyReports.id, input.reportId), eq(emergencyReports.tenantId, input.tenantId)))
      .for("update").limit(1);
    if (!report) throw new Error("EMERGENCY_REPORT_NOT_FOUND");
    if (report.status !== "received") return;
    const [caseRow] = await tx.select().from(emergencyCases)
      .where(and(eq(emergencyCases.tenantId, input.tenantId), eq(emergencyCases.reportId, report.id)))
      .for("update").limit(1);
    if (!caseRow) throw new Error("EMERGENCY_REPORT_CASE_NOT_FOUND");

    const now = new Date();
    const [previous] = await tx.select({ eventHash: emergencyCaseEvents.eventHash })
      .from(emergencyCaseEvents)
      .where(and(eq(emergencyCaseEvents.tenantId, input.tenantId), eq(emergencyCaseEvents.caseId, caseRow.id)))
      .orderBy(desc(emergencyCaseEvents.revision)).limit(1);
    const revision = caseRow.revision + 1;
    const payload = { revision, intakeStatus: "triage_available", reportStatus: "triage" };
    const hash = createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      caseId: caseRow.id,
      previousHash: previous?.eventHash ?? null,
      revision,
      eventType: "triage_available",
      reason: "Emergency report is durably queued for human triage",
      actorType: "system",
      actorRef: "spec260.emergency-report-intake",
      payload,
      createdAt: now.toISOString(),
    })).digest("hex");

    await tx.update(emergencyReports).set({ status: "triage", updatedAt: now })
      .where(and(eq(emergencyReports.id, report.id), eq(emergencyReports.tenantId, input.tenantId), eq(emergencyReports.status, "received")));
    await tx.update(emergencyCases).set({
      revision,
      caseContextJson: { ...caseRow.caseContextJson, intakeStatus: "triage_available" },
      updatedAt: now,
    }).where(and(eq(emergencyCases.id, caseRow.id), eq(emergencyCases.tenantId, input.tenantId), eq(emergencyCases.revision, caseRow.revision)));
    await tx.insert(emergencyCaseEvents).values({
      tenantId: input.tenantId,
      caseId: caseRow.id,
      eventIdempotencyKey: `triage-available:${report.id}`,
      actorType: "system",
      actorRef: "spec260.emergency-report-intake",
      eventType: "triage_available",
      reason: "Emergency report is durably queued for human triage",
      revision,
      previousHash: previous?.eventHash ?? null,
      eventHash: hash,
      payloadJson: payload,
      createdAt: now,
    }).onConflictDoNothing();
  });
}
