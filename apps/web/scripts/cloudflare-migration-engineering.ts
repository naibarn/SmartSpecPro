/** Uses normal user device authentication and existing SPEC224 workspace
 * authority. Never reads browser cookies or manufactures user credentials. */
import { parseArgs } from "node:util";
import { authenticateMigrationEngineeringDevice, createMigrationEngineeringRpc, prepareMigrationEngineeringWorkspace, startCloudflareMigrationEngineering } from "../server/services/cloudflareMigrationContinuation";

const { values } = parseArgs({ options: {
  endpoint: { type: "string", default: "https://smartaihub.app" },
  tenant: { type: "string" }, project: { type: "string" },
  conversation: { type: "string" }, checkpoint: { type: "string" },
  "budget-minor-units": { type: "string" },
  "device-login": { type: "boolean", default: false },
  discover: { type: "boolean", default: false },
  runner: { type: "string" }, workspace: { type: "string" },
  "expected-revision": { type: "string" },
}, strict: true });
try {
  const bearer = values["device-login"]
    ? await authenticateMigrationEngineeringDevice(values.endpoint!, verification => {
      console.error(JSON.stringify({ state: "OWNER_DEVICE_AUTHORIZATION_REQUIRED", ...verification }));
    })
    : process.env.SMARTAIHUB_USER_BEARER;
  const rpc = createMigrationEngineeringRpc(values.endpoint!, bearer);
  if (values.discover) {
    // Lists only the authenticated user's conversations and authorized trusted
    // Runner workspaces. Never auto-selects a conversation or broadens scope.
    const [conversations, workspaces] = await Promise.all([
      rpc("chat.listConversations", { limit: 100, offset: 0 }),
      rpc("spec226DevelopmentControl.availableWorkspaces", {}),
    ]);
    console.log(JSON.stringify({ conversations, workspaces, executionVerified: false }, null, 2));
  } else {
    await prepareMigrationEngineeringWorkspace({ tenantId: values.tenant!, conversationId: Number(values.conversation),
      ...(values.runner ? { runnerId: values.runner } : {}),
      ...(values.workspace ? { workspaceId: values.workspace } : {}),
      ...(values["expected-revision"] ? { expectedRevision: values["expected-revision"] } : {}),
    }, rpc);
    const result = await startCloudflareMigrationEngineering({
      tenantId: values.tenant!, projectId: values.project!, conversationId: Number(values.conversation),
      checkpoint: values.checkpoint as "M1_DATABASE_REPAIR" | "M3_NATIVE_RUNTIME",
      budgetCapMinorUnits: Number(values["budget-minor-units"]),
    }, rpc);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  // Never print request headers, token, response bodies or provider secrets.
  console.error(error instanceof Error ? error.message : "MIGRATION_ENGINEERING_FAILED");
  process.exitCode = 1;
}
