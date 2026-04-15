/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      role: "admin",
      currentTenantId: "tenant-1",
    },
  }),
}));

vi.mock("@/components/admin/FinanceSlipRulesPanel", () => ({
  default: () => <div>Finance Rules Panel</div>,
}));

vi.mock("@/components/help", () => ({
  HelpButton: () => <button type="button">Help</button>,
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => <button type="button">Locale</button>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/dashboard", () => ({
  DashboardCard: ({ title, description, children }: any) => (
    <section>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/finance-rules", vi.fn()],
}));

import AdminFinanceRules from "../AdminFinanceRules";

describe("AdminFinanceRules", () => {
  it("renders the full-page finance rules workspace", () => {
    render(<AdminFinanceRules />);

    expect(screen.getByText("Finance Rules")).toBeInTheDocument();
    expect(screen.getByText(/Search merchants that already exist in the system/i)).toBeInTheDocument();
    expect(screen.getByText("Finance Rules Panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OCR settings/i })).toBeInTheDocument();
  });
});
