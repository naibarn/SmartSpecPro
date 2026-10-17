/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { projectTaskAcceptance } from "@shared/taskAcceptanceProjection";
import { buildCompletedPilotAcceptanceFixture } from "../../../../server/services/__tests__/fixtures/completedPilotAcceptance";
import { TaskAcceptanceEvidence } from "./TaskAcceptanceEvidence";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("completed pilot acceptance evidence surface", () => {
  it("separates pilot, parent, tests, stale usage, release and simulated authentication", () => {
    render(<TaskAcceptanceEvidence projection={projectTaskAcceptance(buildCompletedPilotAcceptanceFixture().input)} />);
    expect(screen.getByText(/reported COMPLETE · verified scope complete/)).toBeTruthy();
    expect(screen.getByText("Parent SPEC/Project closure: incomplete · 0/4")).toBeTruthy();
    expect(screen.getByText("Verified WorkUnits: 6/6")).toBeTruthy();
    expect(screen.getByText(/Test pass rate: 100% \(295\/295\)/)).toBeTruthy();
    expect(screen.getByText(/SDK current-snapshot linked total: Unknown tokens · snapshot stale/)).toBeTruthy();
    expect(screen.getByText(/SDK retained receipt total: 5,771,368 tokens · 74 unique calls/)).toBeTruthy();
    expect(screen.getByText(/Goal counter: 160,516 · stale/)).toBeTruthy();
    expect(screen.getByText(/Resource releases: 74\/74 observed · billing settlement unknown/)).toBeTruthy();
    expect(screen.getByText(/authentication simulated · live production acceptance not verified/)).toBeTruthy();
  });

  it("drills through recorded Goal, WorkUnit, Run, PR, commit and acceptance evidence", () => {
    const projection = projectTaskAcceptance(buildCompletedPilotAcceptanceFixture().input);
    render(<TaskAcceptanceEvidence projection={projection} />);
    const goal = projection.graph.references.find((ref) => ref.kind === "goal")!;
    fireEvent.click(screen.getByRole("button", { name: `Open goal: ${goal.id}` }));
    const unit = projection.graph.references.find((ref) => ref.kind === "work_unit" && projection.graph.links.some((link) => link.from.id === ref.id && link.to.kind === "run"))!;
    fireEvent.click(screen.getByRole("button", { name: `Open work_unit: ${unit.id}` }));
    const run = projection.graph.links.find((link) => link.from.id === unit.id && link.to.kind === "run")!.to;
    fireEvent.click(screen.getByRole("button", { name: `Open run: ${run.id}` }));
    const pr = projection.graph.links.find((link) => link.from.id === run.id && link.to.kind === "pull_request")!.to;
    fireEvent.click(screen.getByRole("button", { name: `Open pull_request: ${pr.id}` }));
    const commit = projection.graph.links.find((link) => link.from.id === pr.id && link.to.kind === "commit")!.to;
    fireEvent.click(screen.getByRole("button", { name: `Open commit: ${commit.id}` }));
    const evidence = projection.graph.links.find((link) => link.from.id === commit.id && link.to.kind === "evidence")!.to;
    fireEvent.click(screen.getByRole("button", { name: `Open evidence: ${evidence.id}` }));
    expect(screen.getByText(`Selected evidence: ${evidence.id} · verified`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Evidence roots" }));
    expect(screen.getByRole("button", { name: `Open goal: ${goal.id}` })).toBeTruthy();
  });

  it("opens the native PostgreSQL/HTTP acceptance separately from scoped test totals", () => {
    const projection = projectTaskAcceptance(buildCompletedPilotAcceptanceFixture().input);
    render(<TaskAcceptanceEvidence projection={projection} />);
    fireEvent.click(screen.getByRole("button", { name: "Open goal: test-only:completed-autonomous-pilot" }));
    const evidence = projection.graph.references.find((ref) => ref.kind === "evidence" && ref.acceptance?.totalTests === 295)!;
    fireEvent.click(screen.getByRole("button", { name: `Open evidence: ${evidence.id}` }));
    const r5 = projection.graph.references.find((ref) => ref.kind === "evidence" && ref.acceptance?.totalTests === 5)!;
    fireEvent.click(screen.getByRole("button", { name: `Open evidence: ${r5.id}` }));
    expect(screen.getByText(/Selected acceptance: 5\/5 · PASS_SCOPED/)).toBeTruthy();
    expect(screen.getByText(/Test pass rate: 100% \(295\/295\)/)).toBeTruthy();
  });

  it("never rounds incomplete required acceptance to a displayed 100% Goal", () => {
    const { input } = buildCompletedPilotAcceptanceFixture();
    const goalInput = structuredClone(input.goal.input);
    goalInput.observations[0]!.liveRequired = true;
    goalInput.observations[0]!.liveVerified = false;
    const projection = projectTaskAcceptance({ ...input, scope: { kind: "project", id: "parent-project" }, goal: { input: goalInput, baselineSource: "trusted" } });
    render(<TaskAcceptanceEvidence projection={projection} />);
    expect(projection.goal.verifiedPercent).toBeLessThan(100);
    expect(screen.getByText(/Test pass rate: 100%/)).toBeTruthy();
    expect(screen.queryByText(/Verified Goal: 100%/)).toBeNull();
    expect(screen.getByText(/verified scope incomplete/)).toBeTruthy();
  });
});


it("ages a mounted snapshot to stale when no refreshed data arrives", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T03:00:00Z"));
  const { input } = buildCompletedPilotAcceptanceFixture();
  const projection = projectTaskAcceptance({ ...input, sdkUsage: { ...input.sdkUsage, asOf: new Date().toISOString(), freshness: "current" } });
  render(<TaskAcceptanceEvidence projection={projection} />);
  expect(screen.getByText(/SDK current-snapshot linked total: 5,771,368 tokens · snapshot current/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(630_000));
  expect(screen.getByText(/SDK current-snapshot linked total: Unknown tokens · snapshot stale/)).toBeTruthy();
  expect(screen.getByText(/SDK retained receipt total: 5,771,368 tokens/)).toBeTruthy();
  vi.setSystemTime(new Date("2026-10-17T03:00:00Z"));
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByText(/SDK current-snapshot linked total: Unknown tokens · snapshot stale/)).toBeTruthy();
});
