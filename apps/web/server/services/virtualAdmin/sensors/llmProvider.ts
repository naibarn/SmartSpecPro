import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { llmProviders } from "../../../../drizzle/schema";
import type { Sensor, SensorReading } from "../types";

const llmProviderSensor: Sensor = {
  id: "llm_provider",
  name: "LLM Provider Health",
  defaultIntervalMs: 180_000,
  category: "cross_system",

  async collect(): Promise<SensorReading> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          sensorId: "llm_provider",
          timestamp: new Date(),
          status: "unknown",
          metrics: {},
          message: "Database not available",
        };
      }

      const providers = await db
        .select({ id: llmProviders.id, name: llmProviders.displayName })
        .from(llmProviders)
        .where(sql`${llmProviders.isEnabled} = true`);

      const totalProviders = providers.length;
      if (totalProviders === 0) {
        return {
          sensorId: "llm_provider",
          timestamp: new Date(),
          status: "degraded",
          metrics: { totalProviders: 0 },
          message: "No enabled LLM providers",
        };
      }

      // Check recent error rates from provider_usage_log (last 10 min)
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const errorStats = await db.execute(sql`
        SELECT "providerId",
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "errorMessage" IS NOT NULL) as errors
        FROM provider_usage_log
        WHERE "createdAt" > ${tenMinAgo}
        GROUP BY "providerId"
      `);

      const failingProviders: string[] = [];
      for (const row of errorStats as any[]) {
        const errorRate = row.total > 0 ? row.errors / row.total : 0;
        if (errorRate > 0.5) {
          const prov = providers.find((p) => p.id === row.providerId);
          failingProviders.push(prov?.name || row.providerId);
        }
      }

      const healthyCount = totalProviders - failingProviders.length;
      let status: SensorReading["status"] = "healthy";
      if (healthyCount === 0) status = "critical";
      else if (failingProviders.length > 0) status = "degraded";

      return {
        sensorId: "llm_provider",
        timestamp: new Date(),
        status,
        metrics: {
          totalProviders,
          healthyProviders: healthyCount,
          failingProviders: failingProviders.join(",") || "none",
        },
        message:
          status === "critical"
            ? "All LLM providers failing"
            : status === "degraded"
              ? `Failing: ${failingProviders.join(", ")}`
              : `All ${totalProviders} providers healthy`,
      };
    } catch (err) {
      return {
        sensorId: "llm_provider",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "LLM provider check failed",
      };
    }
  },
};

export default llmProviderSensor;
