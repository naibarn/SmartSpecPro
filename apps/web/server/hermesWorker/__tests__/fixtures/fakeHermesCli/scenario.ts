/**
 * Feature 135 — Hermes Grok media worker: fake `hermes` CLI scenario types +
 * env-builder helper, shared by this section's handler/parser tests and by
 * sections 07/11's tests and the step-4 CI smoke.
 *
 * `FAKE_HERMES_CLI_PATH` points at the sibling `hermes.mjs` fixture (node
 * builtins only, executable) — spawn it directly with
 * `process.execPath` (or, for section 11, directly by path) plus the env
 * returned by `buildFakeHermesEnv`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface FakeHermesCommandScenario {
  stdoutLines?: string[];
  stderr?: string;
  exitCode?: number;
  delayMs?: number;
}

export interface FakeHermesAuthAddScenario extends FakeHermesCommandScenario {
  /** Lines emitted immediately (the device-code instructions). */
  deviceCodeLines?: string[];
  /** Wait this long, then emit `stdoutLines` (default: approval message)
   *  and exit 0 — simulates the user completing the device-code flow. */
  approveAfterMs?: number;
  /** Wait this long, then emit `stdoutLines` (default: denial message) and
   *  exit non-zero — simulates the user declining. Takes precedence over
   *  `approveAfterMs` when both are set. */
  denyAfterMs?: number;
  /** Never resolves on its own (relies on the caller's own timeout/kill —
   *  simulates a device code that silently expires unattended). */
  neverApprove?: boolean;
}

/** Reserved for sections 07/10-smoke — the `generate` branch is defined now
 *  so the fixture is a stable dependency for those later sections. */
export interface FakeHermesGenerateScenario extends FakeHermesCommandScenario {
  mediaTags?: string[];
  cacheFiles?: string[];
  workspaceFiles?: string[];
  markerBlock?: string;
}

export interface FakeHermesScenario {
  authAdd?: FakeHermesAuthAddScenario;
  authStatus?: FakeHermesCommandScenario;
  authLogout?: FakeHermesCommandScenario;
  tools?: FakeHermesCommandScenario;
  version?: FakeHermesCommandScenario;
  generate?: FakeHermesGenerateScenario;
  /** Fallback for unrecognized argv (e.g. `-z`) — defensive-parsing coverage. */
  default?: FakeHermesCommandScenario;
}

export const FAKE_HERMES_CLI_PATH = path.resolve(import.meta.dirname, "hermes.mjs");

export interface FakeHermesEnvHandle {
  env: NodeJS.ProcessEnv;
  scenarioFile: string;
  cleanup(): void;
}

/**
 * Writes `scenario` to a fresh temp JSON file (one per call — parallel
 * tests never collide) and returns a `process.env`-shaped object pointing
 * `FAKE_HERMES_SCENARIO_FILE` at it, plus a `cleanup()` to remove the file.
 */
export function buildFakeHermesEnv(scenario: FakeHermesScenario): FakeHermesEnvHandle {
  const scenarioFile = path.join(os.tmpdir(), `fake-hermes-scenario-${randomUUID()}.json`);
  fs.writeFileSync(scenarioFile, JSON.stringify(scenario), "utf-8");
  return {
    scenarioFile,
    env: { ...process.env, FAKE_HERMES_SCENARIO_FILE: scenarioFile },
    cleanup: () => {
      try {
        fs.unlinkSync(scenarioFile);
      } catch {
        // Already removed — fine.
      }
    },
  };
}
