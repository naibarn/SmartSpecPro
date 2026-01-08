import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config";

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const original = { ...process.env };
  try {
    Object.assign(process.env, overrides);
    return fn();
  } finally {
    process.env = original;
  }
}

describe("loadEnv security", () => {
  it("rejects placeholder CONTROL_PLANE_API_KEY in production", () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: "production",
          DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          CONTROL_PLANE_API_KEY: "change_me_long_random",
          JWT_SECRET: "change_me_long_random_at_least_16_chars",
          ARTIFACT_ALLOWED_CONTENT_TYPES: "text/plain",
        },
        () => loadEnv(),
      ),
    ).toThrowError(/CONTROL_PLANE_API_KEY must be overridden in production/);
  });

  it("rejects placeholder JWT_SECRET in production", () => {
    expect(() =>
      withEnv(
        {
          NODE_ENV: "production",
          DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          CONTROL_PLANE_API_KEY: "x".repeat(32),
          JWT_SECRET: "change_me_long_random_at_least_16_chars",
          ARTIFACT_ALLOWED_CONTENT_TYPES: "text/plain",
        },
        () => loadEnv(),
      ),
    ).toThrowError(/JWT_SECRET must be overridden in production/);
  });

  it("accepts non-placeholder secrets in production", () => {
    const env = withEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        CONTROL_PLANE_API_KEY: "A".repeat(32),
        JWT_SECRET: "B".repeat(32),
        ARTIFACT_ALLOWED_CONTENT_TYPES: "text/plain,application/json",
      },
      () => loadEnv(),
    );

    expect(env.CONTROL_PLANE_API_KEY).toBe("A".repeat(32));
    expect(env.JWT_SECRET).toBe("B".repeat(32));
  });

  it("parses allowedContentTypes correctly", async () => {
    const env = withEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgres://user:pass@localhost:5432/db",
        CONTROL_PLANE_API_KEY: "A".repeat(32),
        JWT_SECRET: "B".repeat(32),
        ARTIFACT_ALLOWED_CONTENT_TYPES: "text/plain, application/json ,  ",
      },
      () => loadEnv(),
    );

    const types = Array.from(new Set(env.ARTIFACT_ALLOWED_CONTENT_TYPES.split(",").map((s) => s.trim()).filter(Boolean)));
    expect(types).toEqual(["text/plain", "application/json"]);
  });
});
