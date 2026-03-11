import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { contentAutomationGate } from "./contentAutomationGate";

vi.mock("../services/featureFlags", () => ({
  getFeatureFlag: vi.fn(),
}));

import { getFeatureFlag } from "../services/featureFlags";

const mockGetFeatureFlag = vi.mocked(getFeatureFlag);

function makeReqRes() {
  const req = {} as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe("contentAutomationGate middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when ENABLE_CONTENT_AUTOMATION is unset (getFeatureFlag returns false)", async () => {
    mockGetFeatureFlag.mockResolvedValue(false);
    const { req, res, next } = makeReqRes();

    await contentAutomationGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Content automation is not enabled",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 503 when ENABLE_CONTENT_AUTOMATION is 'false'", async () => {
    mockGetFeatureFlag.mockResolvedValue(false);
    const { req, res, next } = makeReqRes();

    await contentAutomationGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Content automation is not enabled",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when ENABLE_CONTENT_AUTOMATION is 'true'", async () => {
    mockGetFeatureFlag.mockResolvedValue(true);
    const { req, res, next } = makeReqRes();

    await contentAutomationGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("checks the ENABLE_CONTENT_AUTOMATION flag name", async () => {
    mockGetFeatureFlag.mockResolvedValue(true);
    const { req, res, next } = makeReqRes();

    await contentAutomationGate(req, res, next);

    expect(mockGetFeatureFlag).toHaveBeenCalledWith("ENABLE_CONTENT_AUTOMATION");
  });
});
