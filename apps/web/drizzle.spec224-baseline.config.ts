import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.SPEC224_BASELINE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "SPEC224_BASELINE_DATABASE_URL is required; baseline commands must not use DATABASE_URL"
  );
}

const target = new URL(databaseUrl);
const databaseName = target.pathname.replace(/^\/+/, "");
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^spec224_[a-z0-9_-]*_test$/i.test(databaseName)
) {
  throw new Error(
    "Spec 224 baseline commands require a loopback target database named spec224_*_test"
  );
}

export default defineConfig({
  schema: "./drizzle/spec224-fresh-baseline/schema.ts",
  out: "./drizzle/spec224-fresh-baseline/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
