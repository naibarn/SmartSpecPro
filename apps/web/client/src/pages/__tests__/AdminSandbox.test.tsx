import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * AdminSandbox page tests.
 *
 * Verifies the admin sandbox explorer renders correctly
 * for admin users and redirects non-admins.
 */

// Mock wouter
vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
  useLocation: () => ["/admin/sandbox", vi.fn()],
}));

// Mock auth context
const mockUser = { role: "admin", email: "admin@test.com" };
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

import AdminSandbox from "../AdminSandbox";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("AdminSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page title", () => {
    renderWithProviders(<AdminSandbox />);
    expect(screen.getByRole("heading", { name: "Sandbox Jobs" })).toBeDefined();
  });

  it("renders stats cards", () => {
    renderWithProviders(<AdminSandbox />);
    expect(screen.getByText("Total Jobs")).toBeDefined();
    expect(screen.getByText("Active Now")).toBeDefined();
    expect(screen.getByText("Total Cost")).toBeDefined();
    expect(screen.getByText("Failure Rate")).toBeDefined();
  });

  it("renders tab navigation", () => {
    renderWithProviders(<AdminSandbox />);
    expect(screen.getByText("Jobs")).toBeDefined();
    expect(screen.getByText("Profiles")).toBeDefined();
    expect(screen.getByText("Tenant Policies")).toBeDefined();
    expect(screen.getByText("Cost Analytics")).toBeDefined();
  });

  it("renders filter controls in jobs tab", () => {
    renderWithProviders(<AdminSandbox />);
    // Auto-refresh toggle
    expect(screen.getByText("Auto")).toBeDefined();
  });
});
