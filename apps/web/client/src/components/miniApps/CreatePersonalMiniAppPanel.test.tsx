/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  startRun: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/factory", mocks.setLocation],
}));
vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children }: any) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  ),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: {
      createPersonalConversation: {
        useMutation: () => ({
          mutateAsync: mocks.createConversation,
          isPending: false,
        }),
      },
    },
    spec226DevelopmentControl: {
      startWorkspaceRun: {
        useMutation: () => ({ mutateAsync: mocks.startRun, isPending: false }),
      },
    },
  },
}));

import { CreatePersonalMiniAppPanel } from "./CreatePersonalMiniAppPanel";

describe("CreatePersonalMiniAppPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createConversation.mockResolvedValue({ id: 71 });
    mocks.startRun.mockResolvedValue({ miniAppId: "app_personal_1" });
  });

  it("starts a hosted factory run from one prompt and opens its persistent App Home", async () => {
    render(<CreatePersonalMiniAppPanel />);
    fireEvent.change(screen.getByLabelText("What should your app do?"), {
      target: {
        value:
          "Create a personal expense tracker with income, expenses and monthly charts.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Mini-App" }));

    await waitFor(() => expect(mocks.startRun).toHaveBeenCalledOnce());
    expect(mocks.createConversation).toHaveBeenCalledWith({
      title: "Personal Mini-App",
    });
    expect(mocks.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 71,
        mode: "prompt",
        factoryMode: true,
        prompt:
          "Create a personal expense tracker with income, expenses and monthly charts.",
      })
    );
    expect(mocks.setLocation).toHaveBeenCalledWith("/miniapp/app_personal_1");
  });

  it("keeps the submitted prompt available when Start fails", async () => {
    mocks.startRun.mockRejectedValueOnce(new Error("Gateway unavailable"));
    render(<CreatePersonalMiniAppPanel />);
    fireEvent.change(screen.getByLabelText("What should your app do?"), {
      target: { value: "Build my app" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Mini-App" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Gateway unavailable"
    );
    expect(screen.getByLabelText("What should your app do?")).toHaveValue(
      "Build my app"
    );
    expect(mocks.setLocation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start Mini-App" }));
    await waitFor(() => expect(mocks.startRun).toHaveBeenCalledTimes(2));
    expect(mocks.createConversation).toHaveBeenCalledOnce();
    expect(mocks.startRun.mock.calls[1]?.[0]).toMatchObject({
      conversationId: 71,
      idempotencyKey: mocks.startRun.mock.calls[0]?.[0].idempotencyKey,
    });
  });
});
