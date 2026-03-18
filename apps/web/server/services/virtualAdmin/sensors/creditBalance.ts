import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../../drizzle/schema";
import type { Sensor, SensorReading } from "../types";

const DEFAULT_SOFT_LIMIT = 100;
const DEFAULT_HARD_LIMIT = -50;

const creditBalanceSensor: Sensor = {
  id: "credit_balance",
  name: "Credit Balance",
  defaultIntervalMs: 600_000,
  category: "cross_system", // Checks global credit health across all users

  async collect(): Promise<SensorReading> {
    try {
      const db = await getDb();
      if (!db) {
        return {
          sensorId: "credit_balance",
          timestamp: new Date(),
          status: "unknown",
          metrics: {},
          message: "Database not available",
        };
      }

      // Get minimum and average credit balance across active users
      const result = await db
        .select({
          minCredits: sql<number>`COALESCE(MIN(${users.credits}), 0)`,
          avgCredits: sql<number>`COALESCE(AVG(${users.credits}), 0)`,
          totalUsers: sql<number>`COUNT(*)`,
          lowCreditUsers: sql<number>`COUNT(*) FILTER (WHERE ${users.credits} <= ${DEFAULT_SOFT_LIMIT})`,
        })
        .from(users)
        .where(sql`${users.isDisabled} = false AND ${users.isSystemUser} IS NOT TRUE`);

      const row = result[0];
      const minCredits = Number(row?.minCredits ?? 0);
      const avgCredits = Math.round(Number(row?.avgCredits ?? 0));
      const totalUsers = Number(row?.totalUsers ?? 0);
      const lowCreditUsers = Number(row?.lowCreditUsers ?? 0);

      let status: SensorReading["status"] = "healthy";
      if (minCredits <= DEFAULT_HARD_LIMIT) status = "critical";
      else if (lowCreditUsers > 0) status = "degraded";

      return {
        sensorId: "credit_balance",
        timestamp: new Date(),
        status,
        metrics: {
          minCredits,
          avgCredits,
          totalUsers,
          lowCreditUsers,
          softLimit: DEFAULT_SOFT_LIMIT,
          hardLimit: DEFAULT_HARD_LIMIT,
        },
        message:
          status === "critical"
            ? `Critical: user with ${minCredits} credits (limit: ${DEFAULT_HARD_LIMIT})`
            : status === "degraded"
              ? `${lowCreditUsers} users below soft limit (${DEFAULT_SOFT_LIMIT})`
              : `All users above soft limit (avg: ${avgCredits})`,
      };
    } catch (err) {
      return {
        sensorId: "credit_balance",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Credit check failed",
      };
    }
  },
};

export default creditBalanceSensor;
