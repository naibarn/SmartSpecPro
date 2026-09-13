/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { doctorStatusQueryMock, doctorMutationMock, refetchMock } = vi.hoisted(() => ({
  doctorStatusQueryMock: vi.fn(),
  doctorMutationMock: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  refetchMock: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    infrastructure: {
      getCeleryMediaDoctorStatus: { useQuery: doctorStatusQueryMock },
      runCeleryMediaDoctor: { useMutation: doctorMutationMock },
    },
  },
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

import { CeleryMediaDoctorCard } from "./CeleryMediaDoctorCard";

const healthyStatus = {
  checkedAt: "2026-09-10T06:00:00.000Z",
  overallStatus: "healthy",
  workers: {
    media: { service: "celery-media", containerName: "smartspec-celery-media", status: "running", project: "smartspecpro", health: "healthy", restartCount: 0, startedAt: null, duplicate: false, candidates: [] },
    beat: { service: "celery-beat", containerName: "smartspec-celery-beat", status: "running", project: "smartspecpro", health: "healthy", restartCount: 0, startedAt: null, duplicate: false, candidates: [] },
  },
  queue: { redisMediaDepth: 0, pendingCount: 0, processingCount: 0, inFlightCount: 0, claimedPendingCount: 0, unclaimedPendingCount: 0, stalePendingCount: 0 },
  users: [],
  selectedUser: null,
  repair: { available: false, reason: null },
};

describe("CeleryMediaDoctorCard", () => {
  beforeEach(() => {
    doctorStatusQueryMock.mockReset();
    doctorMutationMock.mockClear();
    refetchMock.mockReset();
  });

  it("normalizes a string session user id before calling the admin endpoint", () => {
    doctorStatusQueryMock.mockReturnValue({ data: healthyStatus, error: null, isLoading: false, refetch: refetchMock });

    render(<CeleryMediaDoctorCard currentUserId="24" />);

    expect(doctorStatusQueryMock).toHaveBeenCalledWith(
      { userId: 24 },
      { refetchInterval: 30_000 },
    );
    expect(screen.getByText("celery-media")).toBeInTheDocument();
  });

  it("shows a retry action instead of an endless loading state when the query fails", () => {
    doctorStatusQueryMock.mockReturnValue({
      data: undefined,
      error: new Error("bad request"),
      isLoading: false,
      refetch: refetchMock,
    });

    render(<CeleryMediaDoctorCard currentUserId="24" />);

    expect(screen.getByText("Unable to load Celery status.")).toBeInTheDocument();
    expect(screen.queryByText("Checking Celery runtime…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("explains that a capacity backlog is normal and shows in-flight work separately", () => {
    doctorStatusQueryMock.mockReturnValue({
      data: {
        ...healthyStatus,
        queue: { ...healthyStatus.queue, pendingCount: 7, processingCount: 3, inFlightCount: 3, unclaimedPendingCount: 7 },
        users: [{ userId: 24, name: "Queue User", email: null, pendingCount: 7, processingCount: 3, activeCount: 10, inFlightCount: 3, claimedPendingCount: 0, unclaimedPendingCount: 7, stalePendingCount: 0, dispatchableStaleCount: 0, oldestPendingAt: null, oldestUnclaimedPendingAt: null, staleTaskIds: [] }],
        selectedUser: { userId: 24, name: "Queue User", email: null, pendingCount: 7, processingCount: 3, activeCount: 10, inFlightCount: 3, claimedPendingCount: 0, unclaimedPendingCount: 7, stalePendingCount: 0, dispatchableStaleCount: 0, oldestPendingAt: null, oldestUnclaimedPendingAt: null, staleTaskIds: [] },
      },
      error: null,
      isLoading: false,
      refetch: refetchMock,
    });

    render(<CeleryMediaDoctorCard currentUserId="24" />);

    expect(screen.getAllByText(/3\/3 in-flight/)).toHaveLength(2);
    expect(screen.getByText(/Waiting backlog is normal/)).toBeInTheDocument();
    expect(screen.queryByText(/10\/3 active/)).not.toBeInTheDocument();
  });
});
