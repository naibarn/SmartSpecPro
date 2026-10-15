import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

function makeIpApp(trustProxy: number | string) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/ip", (req, res) => res.json({ ip: req.ip, ips: req.ips }));
  return app;
}

describe("Express proxy-addr trust behavior", () => {
  it("does not trust arbitrary IPv4 peers through a short-prefix mapped IPv6 subnet", async () => {
    const response = await request(makeIpApp("::ffff:10.0.0.0/8"))
      .get("/ip")
      .set("X-Forwarded-For", "203.0.113.50");

    expect(response.status).toBe(200);
    expect(response.body.ip).toMatch(/^(?:::ffff:)?127\.0\.0\.1$/);
    expect(response.body.ip).not.toBe("203.0.113.50");
    expect(response.body.ips).toEqual([]);
  });

  it("continues to trust the intended mapped IPv4 subnet", async () => {
    const response = await request(makeIpApp("::ffff:127.0.0.0/104"))
      .get("/ip")
      .set("X-Forwarded-For", "203.0.113.50");

    expect(response.status).toBe(200);
    expect(response.body.ip).toBe("203.0.113.50");
    expect(response.body.ips).toEqual(["203.0.113.50"]);
  });

  it("preserves the production one-hop trust proxy behavior", async () => {
    const response = await request(makeIpApp(1))
      .get("/ip")
      .set("X-Forwarded-For", "203.0.113.50");

    expect(response.status).toBe(200);
    expect(response.body.ip).toBe("203.0.113.50");
    expect(response.body.ips).toEqual(["203.0.113.50"]);
  });
});
