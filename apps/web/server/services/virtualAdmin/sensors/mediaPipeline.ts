import { sql, and, eq, lt, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { cloudTaskEvents } from "../../../../drizzle/schema";
import type { Sensor, SensorReading } from "../types";

const mediaPipelineSensor: Sensor = {
  id: "media_pipeline",
  name: "Media Pipeline",
  defaultIntervalMs: 600_000,
  category: "cross_system", // Uses cloudTaskEvents which has no tenantId

  async collect(): Promise<SensorReading> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          sensorId: "media_pipeline",
          timestamp: new Date(),
          status: "unknown",
          metrics: {},
          message: "Database not available",
        };
      }

      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Count stuck tasks (processing > 30 min)
      const stuckResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(cloudTaskEvents)
        .where(
          and(
            eq(cloudTaskEvents.status, "processing"),
            lt(cloudTaskEvents.createdAt, thirtyMinAgo),
          ),
        );

      // Count failed tasks in last hour
      const failedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(cloudTaskEvents)
        .where(
          and(
            eq(cloudTaskEvents.status, "failed"),
            gte(cloudTaskEvents.createdAt, oneHourAgo),
          ),
        );

      // Count pending tasks
      const pendingResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(cloudTaskEvents)
        .where(eq(cloudTaskEvents.status, "queued"));

      const stuckTasks = Number(stuckResult[0]?.count ?? 0);
      const failedLastHour = Number(failedResult[0]?.count ?? 0);
      const pendingCount = Number(pendingResult[0]?.count ?? 0);

      let status: SensorReading["status"] = "healthy";
      if (stuckTasks > 3 || failedLastHour > 20) status = "critical";
      else if (stuckTasks > 0 || failedLastHour > 5) status = "degraded";

      return {
        sensorId: "media_pipeline",
        timestamp: new Date(),
        status,
        metrics: { stuckTasks, failedLastHour, pendingCount },
        message:
          status === "healthy"
            ? `Media pipeline healthy (${pendingCount} pending)`
            : `Stuck: ${stuckTasks}, Failed: ${failedLastHour}, Pending: ${pendingCount}`,
      };
    } catch (err) {
      return {
        sensorId: "media_pipeline",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Media pipeline check failed",
      };
    }
  },
};

export default mediaPipelineSensor;
