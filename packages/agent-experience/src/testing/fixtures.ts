import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface AgentExperienceFixtureMetadata {
  fixtureId: string;
  schemaVersion: string;
  adapterVersion?: string;
  surface: string;
  source: string;
  scenario: string;
  synthetic: boolean;
  redactionReviewed: boolean;
  expectedEventTypes: string[];
  expectedDroppedReasons?: string[];
  relatedRequirement?: string;
  privacy?: {
    sourceKind: "synthetic" | "production_derived";
    reviewer?: string;
    sourceDate?: string;
    removalCriteria?: string;
    noSensitiveSamples: boolean;
  };
}

export interface AgentExperienceFixture {
  metadata: AgentExperienceFixtureMetadata;
  sourceEvents: unknown[];
}

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url);

export function listAgentExperienceFixtures(): string[] {
  return readdirSync(FIXTURES_DIR).filter((name) => name.endsWith(".fixture.json")).sort();
}

export function loadAgentExperienceFixture(name: string): AgentExperienceFixture {
  if (!/^[a-z0-9.-]+\.fixture\.json$/.test(name)) {
    throw new Error(`Invalid Agent Experience fixture name: ${name}`);
  }
  const path = join(FIXTURES_DIR.pathname, name);
  return JSON.parse(readFileSync(path, "utf8")) as AgentExperienceFixture;
}
