import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateApplicationReadiness } from "./applicationReadiness";

describe("application readiness evidence", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the same DB and runtime gate that backs /readyz", async () => {
    vi.stubEnv("FEATURE_186_CLOUDFLARE_HARD_CUTOVER", "false");
    const db = { execute: vi.fn().mockResolvedValue([{ ok: 1 }]) };
    await expect(evaluateApplicationReadiness({ db: db as never, now: new Date("2026-10-07T12:00:00.000Z") })).resolves.toMatchObject({
      status: "ready",
      checks: { db: "ok", redis: "not_required", feature186: "ok:postgres-pull" },
      evidenceSource: "application_readiness_probe",
    });
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("reports unavailable dependencies and draining without probing them", async () => {
    await expect(evaluateApplicationReadiness({ db: null })).resolves.toMatchObject({
      status: "not_ready",
      checks: { db: "unavailable", redis: "not_required" },
    });
    const db = { execute: vi.fn() };
    await expect(evaluateApplicationReadiness({ db: db as never, draining: true })).resolves.toMatchObject({
      status: "draining",
      checks: { lifecycle: "draining" },
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("reports the database failure class without exposing error details", async () => {
    const db = { execute: vi.fn().mockRejectedValue(new Error("private connection details")) };
    await expect(evaluateApplicationReadiness({ db: db as never })).resolves.toMatchObject({
      status: "not_ready",
      checks: { db: "error" },
    });
  });
});
