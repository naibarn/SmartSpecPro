import { defineConfig } from "drizzle-kit";
import { validateDevActiveSchemaTarget } from "./scripts/devActiveSchemaBaseline";

validateDevActiveSchemaTarget(process.env);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the development baseline");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/dev-active-baseline/migrations",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
});
