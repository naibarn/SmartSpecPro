import { sql, and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { virtualAdminIncidents } from "../../../../drizzle/schema";
import type { Sensor, SensorReading } from "../types";

const teamEscalationSensor: Sensor = {
  id: "team_escalation",
  name: "Unresolved Escalations",
  defaultIntervalMs: 300_000,
  category: "cross_system",

  async collect(): Promise<SensorReading> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          sensorId: "team_escalation",
          timestamp: new Date(),
          status: "unknown",
          metrics: {},
          message: "Database not available",
        };
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Open high-severity incidents older than 1 hour
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(virtualAdminIncidents)
        .where(
          and(
            eq(virtualAdminIncidents.status, "open"),
            inArray(virtualAdminIncidents.severity, ["error", "critical"]),
            lt(virtualAdminIncidents.createdAt, oneHourAgo),
          ),
        );

      const unresolved = Number(result[0]?.count ?? 0);

      // Count critical specifically
      const critResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(virtualAdminIncidents)
        .where(
          and(
            eq(virtualAdminIncidents.status, "open"),
            eq(virtualAdminIncidents.severity, "critical"),
            lt(virtualAdminIncidents.createdAt, oneHourAgo),
          ),
        );

      const unresolvedCritical = Number(critResult[0]?.count ?? 0);

      let status: SensorReading["status"] = "healthy";
      if (unresolved > 5) status = "critical";
      else if (unresolved > 0) status = "degraded";

      return {
        sensorId: "team_escalation",
        timestamp: new Date(),
        status,
        metrics: { unresolved1h: unresolved, unresolvedCritical },
        message:
          unresolved === 0
            ? "No unresolved escalations"
            : `${unresolved} unresolved incidents (${unresolvedCritical} critical)`,
      };
    } catch (err) {
      return {
        sensorId: "team_escalation",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Escalation check failed",
      };
    }
  },
};

export default teamEscalationSensor;
