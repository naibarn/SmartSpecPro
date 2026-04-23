/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GeminiTtsPromptGuidance } from "./GeminiTtsPromptGuidance";

describe("GeminiTtsPromptGuidance", () => {
  it("renders the multi-speaker example and safety hints", () => {
    render(<GeminiTtsPromptGuidance />);

    expect(screen.getByText("Gemini TTS script tips")).toBeInTheDocument();
    expect(screen.getByText(/Host: Welcome back\./i)).toBeInTheDocument();
    expect(screen.getByText(/Guest: Glad to be here\./i)).toBeInTheDocument();
    expect(screen.getByText(/single-speaker fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/\[whispering\]/i)).toBeInTheDocument();
  });
});

