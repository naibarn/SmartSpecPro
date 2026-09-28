/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { summaryQueryMock, refetchMock, setLocationMock } = vi.hoisted(() => ({
  summaryQueryMock: vi.fn(),
  refetchMock: vi.fn(),
  setLocationMock: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin", setLocationMock] as const,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workerJobs: {
      adminDashboardSummary: { useQuery: summaryQueryMock },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const values: Record<string, string> = {
        "dashboard:workerMonitor.title": "Worker Job Monitor",
        "dashboard:workerMonitor.description": "Canonical worker jobs health.",
        "dashboard:workerMonitor.loadError": "Unable to load worker job metrics.",
        "dashboard:workerMonitor.retry": "Retry",
        "dashboard:workerMonitor.checking": "Checking worker jobs...",
        "dashboard:workerMonitor.refresh": "Refresh",
        "dashboard:workerMonitor.openQueue": "Open queue",
        "dashboard:workerMonitor.attention": "Attention required",
        "dashboard:workerMonitor.healthy": "Healthy",
        "dashboard:workerMonitor.queued": "Queued",
        "dashboard:workerMonitor.activeJobs": "Active jobs",
        "dashboard:workerMonitor.freeSlots": "Free slots",
        "dashboard:workerMonitor.outboxPending": "Outbox pending",
        "dashboard:workerMonitor.backlogAge": "Backlog age",
        "dashboard:workerMonitor.oldestQueued": "oldest queued job",
        "dashboard:workerMonitor.outboxAge": "Outbox age",
        "dashboard:workerMonitor.oldestOutbox": "oldest outbox",
        "dashboard:workerMonitor.workerHealth": "Worker health",
        "dashboard:workerMonitor.recentJobs": "Recent worker jobs",
        "dashboard:workerMonitor.autoRefresh": "auto-refresh 15s",
        "dashboard:workerMonitor.noJobs": "No worker jobs recorded yet.",
        "dashboard:workerMonitor.verifiedCapacity": "{{free}}/{{total}} slots verified free",
        "dashboard:workerMonitor.partialCapacity": "{{free}} slots verified · {{unknown}} worker(s) have unknown capacity",
        "dashboard:workerMonitor.openJobs": "{{count}} open job(s) require review",
        "dashboard:workerMonitor.openJobsDescription": "Read from worker_jobs that are not terminal",
        "dashboard:workerMonitor.noStatusReason": "No status reason",
        "dashboard:workerMonitor.jobAge": "Job age {{age}}",
        "dashboard:workerMonitor.workerId": "worker",
        "dashboard:workerMonitor.noWorkerAssigned": "No worker assigned",
        "dashboard:workerMonitor.noOpenJobs": "No open jobs require review",
        "dashboard:workerMonitor.slotSources": "Free-slot evidence",
        "dashboard:workerMonitor.slotSourcesDescription": "Only online workers with a heartbeat within 2 minutes count",
        "dashboard:workerMonitor.capacityUnknown": "Capacity unknown",
        "dashboard:workerMonitor.slotCount": "{{free}}/{{total}} free",
        "dashboard:workerMonitor.workerEligible": "Included in calculation",
        "dashboard:workerMonitor.workerExcluded": "Excluded (offline/stale)",
        "dashboard:workerMonitor.slotEvidence": "Evidence {{source}} · DB assigned {{assigned}} · heartbeat reported {{reported}}",
        "dashboard:workerMonitor.notAdvertised": "not advertised",
      };
      const value = values[key] ?? key;
      return value.replace(/{{\s*(\w+)\s*}}/g, (_match, name: string) => String(params?.[name] ?? ""));
    },
  }),
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children, trailing }: any) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {trailing}
      {children}
    </section>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

import { WorkerJobMonitorCard } from "./WorkerJobMonitorCard";

const healthySummary = {
  counts: {
    pending: 1,
    queued: 3,
    running: 2,
    waitingExternal: 0,
    retryScheduled: 0,
    succeeded: 12,
    failed: 0,
    canceled: 0,
    expired: 0,
    active: 2,
    stale: 0,
    executingByStatus: { leased: 0, claimed: 0, preparing: 0, running: 2, uploading: 0, publishing: 0, indexing: 0 },
  },
  capacity: {
    workersTotal: 2,
    workersOnline: 2,
    workersUnhealthy: 0,
    workersStale: 0,
    totalSlots: 4,
    usedSlots: 2,
    freeSlots: 2,
    queueDepth: 3,
    capacityKnown: true,
    unknownCapacityWorkers: 0,
    slotSources: [{
      workerId: "worker-1",
      displayName: "Worker 1",
      runtimeType: "python",
      workerStatus: "online",
      heartbeatStatus: "online",
      lastSeenAt: "2026-09-17T00:00:00.000Z",
      heartbeatAt: "2026-09-17T00:00:00.000Z",
      eligible: true,
      stale: false,
      capacity: 2,
      capacitySource: "worker.capabilitiesJson.maxConcurrentJobs",
      assignedJobCount: 1,
      reportedJobCount: 1,
      usedSlots: 1,
      freeSlots: 1,
      queueDepth: 0,
    }],
  },
  outbox: { pending: 1, failed: 0, quarantined: 0, oldestPendingAt: null, oldestPendingAgeSeconds: 0 },
  backlog: { oldestQueuedAt: null, oldestQueuedAgeSeconds: 0 },
  alerts: { hasIncident: false, capacityExhausted: false },
  openJobs: [],
  recentJobs: [{ id: "job-1", jobType: "skill.run", status: "running", executionClass: "llm", runtimeType: "python", priority: 5, createdAt: "2026-09-17T00:00:00.000Z", startedAt: null, heartbeatAt: null, workerId: "worker-1", failureReason: null }],
};

describe("WorkerJobMonitorCard", () => {
  beforeEach(() => {
    summaryQueryMock.mockReset();
    refetchMock.mockReset();
    setLocationMock.mockReset();
  });

  it("shows canonical queue, capacity, outbox, and recent job metrics", () => {
    summaryQueryMock.mockReturnValue({ data: healthySummary, error: null, isFetching: false, refetch: refetchMock });

    render(<WorkerJobMonitorCard />);

    expect(screen.getByText("Worker Job Monitor")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("skill.run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open queue" }));
    expect(setLocationMock).toHaveBeenCalledWith("/admin/queues");
  });

  it("offers retry when the control-plane summary is unavailable", () => {
    summaryQueryMock.mockReturnValue({ data: undefined, error: new Error("bad request"), isFetching: false, refetch: refetchMock });

    render(<WorkerJobMonitorCard />);

    expect(screen.getByText("Unable to load worker job metrics.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows open jobs and per-worker slot evidence instead of hiding blocked work", () => {
    summaryQueryMock.mockReturnValue({
      data: {
        ...healthySummary,
        counts: {
          ...healthySummary.counts,
          active: 0,
          running: 0,
          waitingExternal: 1,
          executingByStatus: { leased: 0, claimed: 0, preparing: 0, running: 0, uploading: 0, publishing: 0, indexing: 0 },
        },
        capacity: {
          ...healthySummary.capacity,
          capacityKnown: false,
          unknownCapacityWorkers: 1,
          slotSources: [{
            ...healthySummary.capacity.slotSources[0],
            capacity: null,
            capacitySource: null,
            freeSlots: null,
          }],
        },
        openJobs: [{
          id: "blocked-job-1",
          jobType: "storyboard.skill.run",
          status: "waiting_external",
          statusReason: "claimed:postgres-pull",
          workerId: null,
          createdAt: "2026-09-15T15:05:58.851Z",
          startedAt: "2026-09-15T15:06:00.032Z",
          heartbeatAt: "2026-09-15T15:08:03.928Z",
          leaseExpiresAt: null,
          nextRetryAt: null,
          ageSeconds: 120000,
        }],
      },
      error: null,
      isFetching: false,
      refetch: refetchMock,
    });

    render(<WorkerJobMonitorCard />);

    expect(screen.getByText("1 open job(s) require review")).toBeInTheDocument();
    expect(screen.getByText("blocked-job-1 · claimed:postgres-pull")).toBeInTheDocument();
    expect(screen.getByText("No worker assigned")).toBeInTheDocument();
    expect(screen.getByText("Capacity unknown")).toBeInTheDocument();
  });
});
