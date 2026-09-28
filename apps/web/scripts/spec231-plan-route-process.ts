import { getDb } from "../server/db";
import { planInferenceRouteForRequest } from "../server/services/inference/inferencePlanningService";

async function main() {
  const serialized = process.env.SPEC231_PLAN_ROUTE_INPUT;
  if (!serialized) throw new Error("Spec 231 route input is missing");
  const input = JSON.parse(serialized);
  if (typeof input.now === "string") input.now = new Date(input.now);
  const result = await planInferenceRouteForRequest(input);
  await (getDb() as any).$client.end();
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    routeStatus: result.status === "planned" ? result.route.status : undefined,
    deploymentId:
      result.status === "planned" && result.route.status === "selected"
        ? result.route.candidate.deploymentId
        : undefined,
  })}\n`);
}

main().catch(async error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Spec 231 route process failed"}\n`,
  );
  try {
    await (getDb() as any).$client.end();
  } catch {
    // A failed connection may not have created a client to close.
  }
  process.exitCode = 1;
});
