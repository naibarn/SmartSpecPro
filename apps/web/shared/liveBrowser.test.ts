import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  liveBrowserErrorResponseSchema,
  liveBrowserEventEnvelopeSchema,
  liveBrowserSendCommandRequestSchema,
  liveBrowserSessionSchema,
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
