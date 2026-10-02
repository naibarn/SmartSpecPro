import { runMigrationCommand } from "./cloudflare-migration/compiler";

const [command, ...rawArgs] = process.argv.slice(2);
const options: Record<string, unknown> = { command };
const flags: Record<string, string> = {
  "--manifest": "manifestPath",
  "--root": "rootPath",
  "--out-dir": "outputDir",
};

for (let index = 0; index < rawArgs.length; index += 1) {
  const flag = rawArgs[index];
  const key = flags[flag];
  const value = rawArgs[index + 1];
  if (!key || !value || value.startsWith("--")) {
    console.error("Usage: smartaihub-migrate <inspect|classify|verify|plan|report> --manifest <json> [--root <repo>] [--out-dir <dir>]");
    process.exit(2);
  }
  options[key] = value;
  index += 1;
}

try {
  const result = await runMigrationCommand(options);
  console.log(JSON.stringify({
    command,
    exitCode: result.exitCode,
    artifacts: result.artifacts,
    blockerCount: result.blockers.length,
    blockers: result.blockers.slice(0, 20),
    blockersTruncated: result.blockers.length > 20,
  }, null, 2));
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(JSON.stringify({
    command,
    error: error instanceof Error ? error.message : "MIGRATION_COMMAND_FAILED",
  }));
  process.exitCode = 2;
}
