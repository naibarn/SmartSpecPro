import type { Sensor, SensorReading } from "../types";

const celeryHealthSensor: Sensor = {
  id: "celery_health",
  name: "Celery Workers",
  defaultIntervalMs: 120_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    try {
      const res = await fetch(
        "http://localhost:8000/api/internal/virtual-admin/celery-health",
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        return {
          sensorId: "celery_health",
          timestamp: new Date(),
          status: "critical",
          metrics: {},
          message: `Celery health endpoint returned ${res.status}`,
        };
      }

      const data = (await res.json()) as {
        workers: number;
        activeTasks: number;
        queueLengths: Record<string, number>;
        healthy: boolean;
      };

      const maxQueueLen = Math.max(0, ...Object.values(data.queueLengths));

      let status: SensorReading["status"] = "healthy";
      if (data.workers === 0) status = "critical";
      else if (maxQueueLen > 500) status = "degraded";

      return {
        sensorId: "celery_health",
        timestamp: new Date(),
        status,
        metrics: {
          workers: data.workers,
          activeTasks: data.activeTasks,
          maxQueueLength: maxQueueLen,
        },
        message:
          status === "critical"
            ? "No Celery workers running"
            : status === "degraded"
              ? `High queue depth: ${maxQueueLen}`
              : `${data.workers} workers, ${data.activeTasks} active tasks`,
      };
    } catch (err) {
      return {
        sensorId: "celery_health",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Celery health check failed",
      };
    }
  },
};

export default celeryHealthSensor;
