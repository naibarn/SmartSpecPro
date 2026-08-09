import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const approveStageMutateMock = vi.fn();
const rejectStageMutateMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    videoProjects: {
      approveStage: {
        useMutation: () => ({ mutate: approveStageMutateMock, isPending: false }),
      },
      rejectStage: {
        useMutation: () => ({ mutate: rejectStageMutateMock, isPending: false }),
      },
    },
  },
}));

import { StageApprovalBar } from "../StageApprovalBar";

beforeEach(() => {
  approveStageMutateMock.mockReset();
  rejectStageMutateMock.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

describe("StageApprovalBar", () => {
  it("approves the current stage with the project id", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="scenes" canApprove onChanged={vi.fn()} />);

    fireEvent.click(screen.getByTestId("stage-approval-approve"));

    expect(approveStageMutateMock).toHaveBeenCalledWith({ projectId: 42 });
  });

  it("submits an optional rejection reason", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="scenes" canApprove onChanged={vi.fn()} />);

    fireEvent.click(screen.getByTestId("stage-approval-reject"));
    fireEvent.change(screen.getByTestId("stage-approval-reason"), {
      target: { value: "Narration needs a shorter opening." },
    });
    fireEvent.click(screen.getByTestId("stage-approval-reject-confirm"));

    expect(rejectStageMutateMock).toHaveBeenCalledWith({
      projectId: 42,
      reason: "Narration needs a shorter opening.",
    });
  });

  it("hides approval when the current stage has no complete result", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="narration" canApprove={false} onChanged={vi.fn()} />);

    expect(screen.queryByTestId("video-studio-stage-approval-bar")).not.toBeInTheDocument();
  });

  it("does not show an approval action for the brief input stage", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="brief" onChanged={vi.fn()} />);

    expect(screen.queryByTestId("video-studio-stage-approval-bar")).not.toBeInTheDocument();
  });

  it("keeps the review bar visible for QA but does not offer a no-op approve action", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="qa" onChanged={vi.fn()} />);

    expect(screen.getByTestId("video-studio-stage-approval-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("stage-approval-approve")).not.toBeInTheDocument();
    expect(screen.getByTestId("stage-approval-reject")).toBeInTheDocument();
  });

  it("does not render for a terminal rendered status", () => {
    render(<StageApprovalBar lang="en" projectId={42} status="render" onChanged={vi.fn()} />);

    expect(screen.queryByTestId("video-studio-stage-approval-bar")).not.toBeInTheDocument();
  });
});
