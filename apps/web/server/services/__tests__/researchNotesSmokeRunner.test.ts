import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runSmoke(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/research-notes-smoke.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

function failureCode(stderr: string): string | undefined {
  const result = stderr.trim().split("\n").at(-1);
  if (!result) return undefined;
  try {
    return (JSON.parse(result) as { errorCode?: string }).errorCode;
  } catch {
    return undefined;
  }
}

describe("Research Notes smoke runner safety gates", () => {
  it("refuses production before using or echoing supplied credentials", () => {
    const credential = "synthetic-secret-must-not-appear";
    const result = runSmoke([], {
      RESEARCH_NOTES_ENVIRONMENT: "production",
      RESEARCH_NOTES_BASE_URL: "https://production.invalid",
      RESEARCH_NOTES_APP_ID: "app_research_notes",
      RESEARCH_NOTES_PROJECT_ID: "project-test",
      RESEARCH_NOTES_AUTH_BEARER: credential,
    });

    expect(result.status).toBe(1);
    expect(failureCode(result.stderr)).toBe("configuration:REQUEST_FAILED");
    expect(`${result.stdout}${result.stderr}`).not.toContain(credential);
    expect(`${result.stdout}${result.stderr}`).not.toContain("production.invalid");
  });

  it("requires explicit provider-cost authorization before making a summary request", () => {
    const credential = "synthetic-session-must-not-appear";
    const result = runSmoke(["--with-summary"], {
      RESEARCH_NOTES_ENVIRONMENT: "test",
      RESEARCH_NOTES_BASE_URL: "http://127.0.0.1:9",
      RESEARCH_NOTES_APP_ID: "app_research_notes",
      RESEARCH_NOTES_PROJECT_ID: "project-test",
      RESEARCH_NOTES_SESSION_COOKIE: credential,
      RESEARCH_NOTES_ALLOW_PROVIDER_COST: "false",
    });

    expect(result.status).toBe(1);
    expect(failureCode(result.stderr)).toBe("configuration:PROVIDER_COST_GATE_REQUIRED");
    expect(`${result.stdout}${result.stderr}`).not.toContain(credential);
  });
});
