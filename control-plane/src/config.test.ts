import { allowedContentTypes, loadEnv } from "./config";

describe("control-plane config", () => {
  const OLD = process.env;

  beforeEach(() => {
    process.env = { ...OLD };
  });

  afterEach(() => {
    process.env = OLD;
  });

  it("parses env and returns allowed content types", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.CONTROL_PLANE_API_KEY = "x".repeat(24);
    process.env.JWT_SECRET = "y".repeat(16);
    process.env.R2_ENDPOINT = "https://example.com";
    process.env.R2_BUCKET = "bucket";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";

    const env = loadEnv();
    const set = allowedContentTypes(env);
    expect(set.has("application/json")).toBe(true);
    expect(set.has("text/markdown")).toBe(true);
  });

  it("fails when required env missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => loadEnv()).toThrow(/Invalid environment variables/);
  });
});
