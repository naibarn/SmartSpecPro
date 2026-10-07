import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.MINI_APP_BASELINE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "MINI_APP_BASELINE_DATABASE_URL is required; Mini App baseline commands must not use DATABASE_URL"
  );
}

const target = new URL(databaseUrl);
const databaseName = target.pathname.replace(/^\/+/, "");
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^miniapp_[a-z0-9_-]*_test$/i.test(databaseName)
) {
  throw new Error(
    "Mini App baseline commands require a loopback target database named miniapp_*_test"
  );
}

export default defineConfig({
  schema: "./drizzle/mini-app-fresh-baseline/schema.ts",
  out: "./drizzle/mini-app-fresh-baseline/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
