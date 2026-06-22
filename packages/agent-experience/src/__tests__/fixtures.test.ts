import { describe, expect, it } from "vitest";
import {
  agencyStreamToAgentEvents,
  listAgentExperienceFixtures,
  loadAgentExperienceFixture,
  runStreamToAgentEvents,
  type AgencyStreamLikeEvent,
  type RunStreamLikeEvent,
} from "../index";

const REQUIRED_FIXTURES = [
  "agency.happy-path.2026-06-22-v1.fixture.json",
  "agency.legacy-path.2026-06-22-v1.fixture.json",
  "agency.approval-path.2026-06-22-v1.fixture.json",
  "agency.malformed-path.2026-06-22-v1.fixture.json",
  "team.run-path.2026-06-22-v1.fixture.json",
  "team.private-internal-visibility.2026-06-22-v1.fixture.json",
  "artifact.pointer-path.2026-06-22-v1.fixture.json",
  "approval.rejected-to-denied.2026-06-22-v1.fixture.json",
  "rollback.flags-off-legacy-rendering.2026-06-22-v1.fixture.json",
];

const SECRET_PATTERNS = [
  /sk-[a-z0-9]{12,}/i,
  /oauth[_-]?token/i,
  /x-amz-signature/i,
  /https:\/\/[^"\s]+X-Amz-Signature/i,
  /tenant-[0-9a-f]{8,}/i,
  /raw prompt/i,
];

describe("Agent Experience fixtures", () => {
  it("includes every required fixture with stable names", () => {
    const fixtures = listAgentExperienceFixtures();
    expect(fixtures).toEqual(REQUIRED_FIXTURES.slice().sort());
    for (const name of fixtures) {
      expect(name).toMatch(/^[a-z]+[a-z.-]*\.2026-06-22-v1\.fixture\.json$/);
    }
  });

  it("has unique metadata and privacy fields", () => {
    const ids = new Set<string>();
    for (const name of listAgentExperienceFixtures()) {
      const fixture = loadAgentExperienceFixture(name);
      expect(ids.has(fixture.metadata.fixtureId)).toBe(false);
      ids.add(fixture.metadata.fixtureId);
      expect(fixture.metadata.schemaVersion).toBe("2026-06-22-v1");
      expect(fixture.metadata.synthetic).toBe(true);
      expect(fixture.metadata.redactionReviewed).toBe(true);
      expect(fixture.metadata.privacy?.noSensitiveSamples).toBe(true);
      expect(fixture.metadata.expectedEventTypes).toEqual(expect.any(Array));
    }
  });

  it("fixtures do not contain obvious secrets, signed URLs, or tenant-identifiable samples", () => {
    for (const name of listAgentExperienceFixtures()) {
      const serialized = JSON.stringify(loadAgentExperienceFixture(name));
      for (const pattern of SECRET_PATTERNS) {
        expect(serialized).not.toMatch(pattern);
      }
    }
  });

  it("Agency fixture outputs match metadata expectations", () => {
    for (const name of listAgentExperienceFixtures().filter((fixtureName) => fixtureName.startsWith("agency.") || fixtureName.startsWith("artifact."))) {
      const fixture = loadAgentExperienceFixture(name);
      const result = agencyStreamToAgentEvents(fixture.sourceEvents as AgencyStreamLikeEvent[], {
        tenantId: "tenant-demo",
        runId: "run-demo",
      });
      expect(result.events.map((event) => event.type)).toEqual(fixture.metadata.expectedEventTypes);
      expect(result.dropped.map((event) => event.reason)).toEqual(fixture.metadata.expectedDroppedReasons ?? []);
    }
  });

  it("Team fixture outputs match metadata expectations", () => {
    for (const name of listAgentExperienceFixtures().filter((fixtureName) => fixtureName.startsWith("team."))) {
      const fixture = loadAgentExperienceFixture(name);
      const result = runStreamToAgentEvents(fixture.sourceEvents as RunStreamLikeEvent[]);
      expect(result.events.map((event) => event.type)).toEqual(fixture.metadata.expectedEventTypes);
      expect(result.dropped.map((event) => event.reason)).toEqual(fixture.metadata.expectedDroppedReasons ?? []);
    }
  });
});
