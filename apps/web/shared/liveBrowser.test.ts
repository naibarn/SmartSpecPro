import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  liveBrowserErrorResponseSchema,
  liveBrowserEventEnvelopeSchema,
  liveBrowserSendCommandRequestSchema,
  liveBrowserSessionSchema,
  getLiveBrowserEventSessionSnapshot,
} from "./liveBrowser";

const fixtureDir = path.resolve(
  __dirname,
  "../../../specs/feature/036-LiveBrowserExperience/fixtures",
);

describe("live browser shared contracts", () => {
  it("parses the shared session fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "live-browser-session.json"), "utf8"),
    );

    expect(liveBrowserSessionSchema.parse(fixture)).toMatchObject({
      sessionId: "lbs_demo_123",
      status: "human_controlling",
      controlMode: "takeover",
      sessionVersion: 12,
    });
  });

  it("parses the shared event-envelope fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "live-browser-event-envelope.json"), "utf8"),
    );

    expect(liveBrowserEventEnvelopeSchema.parse(fixture)).toMatchObject({
      eventId: "lbe_demo_123",
      sessionId: "lbs_demo_123",
      type: "approval_requested",
    });
  });

  it("extracts a typed session snapshot from event payloads", () => {
    const parsed = liveBrowserEventEnvelopeSchema.parse({
      eventId: "lbe_demo_snapshot",
      sessionId: "lbs_demo_123",
      sessionVersion: 13,
      type: "command_started",
      timestamp: "2026-03-13T01:00:00Z",
      payload: {
        session: {
          sessionId: "lbs_demo_123",
          tenantId: "tenant-123",
          userId: 42,
          sourceType: "automation",
          status: "agent_running",
          controlMode: "agent_control",
          sessionVersion: 13,
          policyContext: {},
          browserContextRef: {},
          activeTabCount: 1,
          startedAt: "2026-03-13T00:55:00Z",
          lastActivityAt: "2026-03-13T01:00:00Z",
        },
      },
      cursor: "lbs_demo_123:13:lbe_demo_snapshot",
    });

    expect(getLiveBrowserEventSessionSnapshot(parsed)).toMatchObject({
      sessionId: "lbs_demo_123",
      sessionVersion: 13,
      status: "agent_running",
    });
  });

  it("parses the shared version-conflict error fixture with retry metadata", () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(fixtureDir, "live-browser-error-version-conflict.json"),
        "utf8",
      ),
    );

    expect(liveBrowserErrorResponseSchema.parse(fixture)).toMatchObject({
      accepted: false,
      error: {
        code: "session_version_conflict",
        currentSessionVersion: 11,
        retryable: true,
      },
    });
  });

  it("parses the shared send-command request fixture", () => {
    const fixture = JSON.parse(
      fs.readFileSync(
        path.join(fixtureDir, "live-browser-send-command-request.json"),
        "utf8",
      ),
    );

    expect(liveBrowserSendCommandRequestSchema.parse(fixture)).toMatchObject({
      sessionId: "lbs_demo_123",
      sessionVersion: 7,
      actor: {
        actorType: "user",
        actorId: "42",
      },
      command: {
        type: "natural_language",
      },
    });
  });

  it("rejects unsupported session states", () => {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, "live-browser-session.json"), "utf8"),
    );

    expect(() =>
      liveBrowserSessionSchema.parse({
        ...fixture,
        status: "zombie_mode",
      }),
    ).toThrow();
  });
});
