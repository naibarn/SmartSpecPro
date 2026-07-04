/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppPage } from "../AppPage";

describe("AppPage", () => {
  it("renders the title", () => {
    render(<AppPage title="My Page" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "My Page" }),
    ).toBeInTheDocument();
  });

  it("renders the description when provided", () => {
    render(<AppPage title="My Page" description="Some helpful context" />);
    expect(screen.getByText("Some helpful context")).toBeInTheDocument();
  });

  it("does not render description text when omitted", () => {
    render(<AppPage title="My Page" />);
    expect(screen.queryByText("Some helpful context")).not.toBeInTheDocument();
  });

  it("renders breadcrumbs with the last item as current", () => {
    render(
      <AppPage
        title="My Page"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Section", href: "/section" },
          { label: "Current Page" },
        ]}
      />,
    );

    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");

    const current = screen.getByText("Current Page");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("renders actions", () => {
    render(
      <AppPage
        title="My Page"
        actions={<button>Do Thing</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Do Thing" }),
    ).toBeInTheDocument();
  });

  it("renders children when state is ready (default)", () => {
    render(
      <AppPage title="My Page">
        <div>Body content</div>
      </AppPage>,
    );
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("renders the default skeleton when state is loading and no override given", () => {
    render(
      <AppPage title="My Page" state="loading">
        <div>Body content</div>
      </AppPage>,
    );
    expect(
      screen.getByTestId("app-page-default-skeleton"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
  });

  it("renders a custom loadingSkeleton when provided", () => {
    render(
      <AppPage
        title="My Page"
        state="loading"
        loadingSkeleton={<div>Custom Loading</div>}
      >
        <div>Body content</div>
      </AppPage>,
    );
    expect(screen.getByText("Custom Loading")).toBeInTheDocument();
    expect(
      screen.queryByTestId("app-page-default-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state title/description/actions", () => {
    render(
      <AppPage
        title="My Page"
        state="empty"
        empty={{
          title: "No items found",
          description: "Try creating one.",
          actions: <button>Create</button>,
        }}
      >
        <div>Body content</div>
      </AppPage>,
    );
    expect(screen.getByText("No items found")).toBeInTheDocument();
    expect(screen.getByText("Try creating one.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
  });

  it("renders the error banner title/description and calls onRetry when retry is clicked", () => {
    const onRetry = vi.fn();
    render(
      <AppPage
        title="My Page"
        state="error"
        error={{
          title: "Failed to load",
          description: "Please try again.",
          onRetry,
        }}
      >
        <div>Body content</div>
      </AppPage>,
    );

    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    expect(screen.getByText("Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render a retry button when onRetry is omitted", () => {
    render(
      <AppPage
        title="My Page"
        state="error"
        error={{ title: "Failed to load" }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
  });

  describe("toolbar", () => {
    it("does not render a toolbar region when omitted", () => {
      render(<AppPage title="My Page" />);
      expect(screen.queryByTestId("app-page-toolbar")).not.toBeInTheDocument();
    });

    it("renders the toolbar in the ready state, alongside children", () => {
      render(
        <AppPage title="My Page" toolbar={<input aria-label="Search" />}>
          <div>Body content</div>
        </AppPage>,
      );
      expect(screen.getByTestId("app-page-toolbar")).toBeInTheDocument();
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(screen.getByText("Body content")).toBeInTheDocument();
    });

    it("renders the toolbar in the loading state", () => {
      render(
        <AppPage title="My Page" state="loading" toolbar={<input aria-label="Search" />}>
          <div>Body content</div>
        </AppPage>,
      );
      expect(screen.getByTestId("app-page-toolbar")).toBeInTheDocument();
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(
        screen.getByTestId("app-page-default-skeleton"),
      ).toBeInTheDocument();
    });

    it("renders the toolbar in the error state", () => {
      render(
        <AppPage
          title="My Page"
          state="error"
          toolbar={<input aria-label="Search" />}
          error={{ title: "Failed to load" }}
        >
          <div>Body content</div>
        </AppPage>,
      );
      expect(screen.getByTestId("app-page-toolbar")).toBeInTheDocument();
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(screen.getByText("Failed to load")).toBeInTheDocument();
    });

    it("renders the toolbar in the empty state", () => {
      render(
        <AppPage
          title="My Page"
          state="empty"
          toolbar={<input aria-label="Search" />}
          empty={{ title: "No items found" }}
        >
          <div>Body content</div>
        </AppPage>,
      );
      expect(screen.getByTestId("app-page-toolbar")).toBeInTheDocument();
      expect(screen.getByLabelText("Search")).toBeInTheDocument();
      expect(screen.getByText("No items found")).toBeInTheDocument();
    });
  });
});
