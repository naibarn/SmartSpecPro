import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../sensorRegistry", () => ({
  getSensors: vi.fn().mockReturnValue([]),
  collectSafe: vi.fn().mockResolvedValue({
    sensorId: "test",
    timestamp: new Date(),
    status: "healthy",
    metrics: {},
    message: "OK",
  }),
  loadSensorConfig: vi.fn().mockResolvedValue(null),
  registerAllSensors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ruleEngine", () => ({
  evaluateReading: vi.fn().mockResolvedValue(undefined),
  initCooldownMap: vi.fn().mockResolvedValue(undefined),
  setNotifier: vi.fn(),
}));

vi.mock("../actuatorRegistry", () => ({
  expireStaleApprovals: vi.fn().mockResolvedValue(undefined),
  registerActuator: vi.fn(),
}));

vi.mock("../systemUser", () => ({
  ensureSystemUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../notifier", () => ({
  dispatchNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../actuators/autoFixActions", () => ({}));
vi.mock("../actuators/approvalActions", () => ({}));
vi.mock("../actuators/notifyActions", () => ({}));

import {
  startGuardian,
  stopGuardian,
  isGuardianRunning,
  getGuardianHealth,
} from "../guardianScheduler";
import { registerAllSensors } from "../sensorRegistry";
import { ensureSystemUser } from "../systemUser";
import { initCooldownMap } from "../ruleEngine";

describe("GuardianScheduler", () => {
  afterEach(() => {
    stopGuardian();
  });

  it("starts and sets running flag", async () => {
    expect(isGuardianRunning()).toBe(false);
    await startGuardian();
    expect(isGuardianRunning()).toBe(true);
  });

  it("calls ensureSystemUser on start", async () => {
    await startGuardian();
    expect(ensureSystemUser).toHaveBeenCalled();
  });

  it("registers all sensors on start", async () => {
    await startGuardian();
    expect(registerAllSensors).toHaveBeenCalled();
  });

  it("initializes cooldown map on start", async () => {
    await startGuardian();
    expect(initCooldownMap).toHaveBeenCalled();
  });

  it("stops gracefully", async () => {
    await startGuardian();
    expect(isGuardianRunning()).toBe(true);
    stopGuardian();
    expect(isGuardianRunning()).toBe(false);
  });

  it("does not start twice", async () => {
    await startGuardian();
    vi.clearAllMocks();
    await startGuardian(); // Should be no-op
    expect(ensureSystemUser).not.toHaveBeenCalled();
  });

  it("returns health data", async () => {
    await startGuardian();
    const health = getGuardianHealth();
    expect(health.running).toBe(true);
    expect(typeof health.sensorCount).toBe("number");
    expect(typeof health.lastPollTimes).toBe("object");
  });
});
