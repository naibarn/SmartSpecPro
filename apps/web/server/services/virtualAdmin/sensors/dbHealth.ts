import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import type { Sensor, SensorReading } from "../types";

const dbHealthSensor: Sensor = {
  id: "db_health",
  name: "Database Health",
  defaultIntervalMs: 60_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    const start = Date.now();
    try {
      const db = await getDb();
      if (!db) {
        return {
          sensorId: "db_health",
          timestamp: new Date(),
          status: "critical",
          metrics: {},
          message: "Database not available",
        };
      }

      const result = await Promise.race([
        db.execute(sql`SELECT 1 as ping`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DB ping timeout (5s)")), 5_000),
        ),
      ]);

      const latencyMs = Date.now() - start;

      // Get connection stats
      let activeConnections = 0;
      try {
        const stats = await db.execute(
          sql`SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()`,
        );
        activeConnections = Number((stats.rows[0] as any)?.cnt ?? 0);
      } catch {
        // Non-critical
      }

      return {
        sensorId: "db_health",
        timestamp: new Date(),
        status: latencyMs > 2000 ? "degraded" : "healthy",
        metrics: { latencyMs, activeConnections },
        message: `DB ping: ${latencyMs}ms, ${activeConnections} connections`,
      };
    } catch (err) {
      return {
        sensorId: "db_health",
        timestamp: new Date(),
        status: "critical",
        metrics: { latencyMs: Date.now() - start },
        message: err instanceof Error ? err.message : "DB health check failed",
      };
    }
  },
};

export default dbHealthSensor;
