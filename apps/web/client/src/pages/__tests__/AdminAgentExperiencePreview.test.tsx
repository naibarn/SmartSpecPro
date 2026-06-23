/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import AdminAgentExperiencePreview from "../AdminAgentExperiencePreview";

describe("AdminAgentExperiencePreview", () => {
  it("renders fixture-only Agent Experience preview and captures intents locally", () => {
    render(<AdminAgentExperiencePreview />);

    expect(screen.getByRole("heading", { name: "Agent Experience Preview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agency happy path" })).toBeInTheDocument();
    expect(screen.getAllByText("message.delta").length).toBeGreaterThan(0);
    expect(screen.getByText("No dropped events for this scenario.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "agency-approval-path" } });
    fireEvent.click(screen.getByLabelText("Approve request"));

    expect(screen.getByText("approval.approve")).toBeInTheDocument();
    expect(screen.getByText("agency:approval-evt-1")).toBeInTheDocument();
  });

  it("shows adapter drops for malformed fixtures without rendering unsafe events", () => {
    render(<AdminAgentExperiencePreview />);

    fireEvent.change(screen.getByLabelText("Scenario"), { target: { value: "malformed-path" } });

    expect(screen.getByText("unsupported_event")).toBeInTheDocument();
    expect(screen.getByText("malformed")).toBeInTheDocument();
    expect(screen.getByText("No Agent Experience events")).toBeInTheDocument();
  });

  it("does not import Node-backed fixture helpers into the browser page", () => {
    const source = readFileSync(join(process.cwd(), "client/src/pages/AdminAgentExperiencePreview.tsx"), "utf8");

    expect(source).not.toContain("listAgentExperienceFixtures");
    expect(source).not.toContain("loadAgentExperienceFixture");
    expect(source).not.toContain("node:fs");
  });
});
