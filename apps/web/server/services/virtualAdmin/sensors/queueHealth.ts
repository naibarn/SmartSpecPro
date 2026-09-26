import type { Sensor, SensorReading } from "../types";

const queueHealthSensor: Sensor = {
  id: "queue_health",
  name: "Queue Health",
  defaultIntervalMs: 60_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    try {
      const { getQueueHealthStatus } = await import("../../queueHealthMonitor");
      const status = await getQueueHealthStatus();

      if (!status) {
        return {
          sensorId: "queue_health",
          timestamp: new Date(),
          status: "unknown",
          metrics: {},
          message: "Queue health monitor not available",
        };
      }

      const alerts = status.activeAlerts || [];
      const hasCritical = alerts.some(
        (a: any) => a.severity === "critical",
      );
      const hasDegraded = alerts.length > 0;

      const metrics: Record<string, number | string> = {};
      if (status.queues) {
        for (const queue of status.queues) {
          metrics[`queue_${queue.name}_depth`] = queue.length;
        }
      }
      metrics.alertCount = alerts.length;

      return {
        sensorId: "queue_health",
        timestamp: new Date(),
        status: hasCritical ? "critical" : hasDegraded ? "degraded" : "healthy",
        metrics,
        message: hasCritical
          ? `Critical queue alerts: ${alerts.length}`
          : hasDegraded
            ? `Queue warnings: ${alerts.length}`
            : "All queues healthy",
      };
    } catch (err) {
      return {
        sensorId: "queue_health",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Queue check failed",
      };
    }
  },
};

export default queueHealthSensor;
