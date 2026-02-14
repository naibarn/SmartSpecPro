import { describe, it, expect } from "vitest";
import { validateGoogleOAuthFormat } from "../services/googleOAuthValidation";

/**
 * Tests for Google OAuth admin configuration — validates the shared
 * validateGoogleOAuthFormat utility used by testGoogleOAuthConnection.
 */

describe("validateGoogleOAuthFormat", () => {
  it("rejects empty clientId", () => {
    expect(validateGoogleOAuthFormat("", "GOCSPX-some-secret")).toEqual({
      valid: false,
      message: expect.stringContaining("Client ID"),
    });
  });

  it("rejects empty clientSecret", () => {
    expect(
      validateGoogleOAuthFormat("123456789.apps.googleusercontent.com", "")
    ).toEqual({
      valid: false,
      message: expect.stringContaining("Client Secret"),
    });
  });

  it("rejects clientId without .apps.googleusercontent.com suffix", () => {
    expect(
      validateGoogleOAuthFormat("not-a-valid-client-id", "GOCSPX-some-secret")
    ).toEqual({
      valid: false,
      message: expect.stringContaining("format"),
    });
  });

  it("accepts valid clientId and clientSecret", () => {
    expect(
      validateGoogleOAuthFormat(
        "123456789.apps.googleusercontent.com",
        "GOCSPX-some-secret"
      )
    ).toEqual({
      valid: true,
      message: expect.any(String),
    });
  });
});
