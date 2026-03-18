import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerSensor,
  getSensors,
  collectSafe,
  loadSensorConfig,
} from "../sensorRegistry";
import type { Sensor, SensorReading } from "../types";

// Mock db module
vi.mock("../../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

function createTestSensor(overrides: Partial<Sensor> = {}): Sensor {
  return {
    id: overrides.id ?? "test_sensor",
    name: overrides.name ?? "Test Sensor",
    defaultIntervalMs: overrides.defaultIntervalMs ?? 60_000,
    category: overrides.category ?? "system",
    collect: overrides.collect ?? vi.fn().mockResolvedValue({
      sensorId: "test_sensor",
      timestamp: new Date(),
      status: "healthy",
      metrics: {},
      message: "OK",
    }),
  };
}

describe("SensorRegistry", () => {
  it("registers sensor with id and interval", () => {
    const sensor = createTestSensor({ id: "reg_test_1" });
    registerSensor(sensor);
    const all = getSensors();
    expect(all.find((s) => s.id === "reg_test_1")).toBeDefined();
  });

  it("returns SensorReading with required fields", async () => {
    const sensor = createTestSensor({
      id: "reading_test",
      collect: vi.fn().mockResolvedValue({
        sensorId: "reading_test",
        timestamp: new Date(),
        status: "healthy",
        metrics: { foo: 42 },
        message: "All good",
      }),
    });

    const reading = await collectSafe(sensor);
    expect(reading.sensorId).toBe("reading_test");
    expect(reading.timestamp).toBeInstanceOf(Date);
    expect(reading.status).toBe("healthy");
    expect(reading.metrics).toHaveProperty("foo", 42);
    expect(reading.message).toBe("All good");
  });

  it("handles sensor timeout gracefully — returns status unknown", async () => {
    const sensor = createTestSensor({
      id: "timeout_test",
      collect: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20_000)),
      ),
    });

    // Override timeout to be shorter for test
    const start = Date.now();
    const reading = await collectSafe(sensor);
    // collectSafe uses 10s timeout internally - the test sensor will be caught
    expect(reading.status).toBe("unknown");
    expect(reading.message).toContain("timeout");
  }, 15_000);

  it("handles sensor exception without crashing — returns unknown reading", async () => {
    const sensor = createTestSensor({
      id: "error_test",
      collect: vi.fn().mockRejectedValue(new Error("Connection refused")),
    });

    const reading = await collectSafe(sensor);
    expect(reading.status).toBe("unknown");
    expect(reading.message).toBe("Connection refused");
    expect(reading.sensorId).toBe("error_test");
  });

  it("marks sensor as unknown when source unreachable", async () => {
    const sensor = createTestSensor({
      id: "unreachable_test",
      collect: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });

    const reading = await collectSafe(sensor);
    expect(reading.status).toBe("unknown");
    expect(reading.message).toContain("ECONNREFUSED");
  });

  it("uses default config when no DB override exists", async () => {
    const config = await loadSensorConfig("tenant-1", "test_sensor");
    expect(config).toBeNull(); // DB returns null since getDb is mocked to return null
  });
});
