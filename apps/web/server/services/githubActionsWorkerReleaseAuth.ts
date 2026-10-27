import { createRemoteJWKSet, jwtVerify } from "jose";

const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_ACTIONS_AUDIENCE = "smartaihub-worker-app-release";
const GITHUB_ACTIONS_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

function expectedWorkerReleaseRepository(): string {
  return (
    process.env.SMARTAIHUB_WORKER_APP_RELEASE_REPOSITORY
    || process.env.SMARTAIHUB_DESKTOP_RELEASE_GITHUB_REPOSITORY
    || process.env.DESKTOP_RELEASE_GITHUB_REPOSITORY
    || "naibarn/SmartSpecPro"
  ).trim();
}

export async function isAuthorizedWorkerAppWindowsReleaseWorkflow(token: string): Promise<boolean> {
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, GITHUB_ACTIONS_JWKS, {
      issuer: GITHUB_ACTIONS_ISSUER,
      audience: GITHUB_ACTIONS_AUDIENCE,
    });
    const repository = expectedWorkerReleaseRepository();

    return payload.repository?.toString().toLowerCase() === repository.toLowerCase()
      && payload.ref === "refs/heads/main"
      && payload.event_name === "workflow_dispatch"
      && payload.workflow_ref?.toString().toLowerCase()
        === `${repository}/.github/workflows/worker-app-windows-release.yml@refs/heads/main`.toLowerCase();
  } catch {
    return false;
  }
}
