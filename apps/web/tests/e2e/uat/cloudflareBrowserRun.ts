const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;

export type CloudflareBrowserRunConnection = {
  endpoint: string;
  headers: { Authorization: string };
};

/** Build the standard Node Playwright CDP connection for Cloudflare Browser Run. */
export function cloudflareBrowserRunConnection(
  environment: NodeJS.ProcessEnv = process.env
): CloudflareBrowserRunConnection {
  const accountId = environment.SMARTSPEC_UAT_CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = environment.SMARTSPEC_UAT_CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !ACCOUNT_ID_PATTERN.test(accountId) || !apiToken) {
    throw new Error("CLOUDFLARE_BROWSER_RUN_CONFIGURATION_REQUIRED");
  }

  return {
    endpoint: `wss://api.cloudflare.com/client/v4/accounts/${accountId}/browser-run/devtools/browser?keep_alive=600000`,
    headers: { Authorization: `Bearer ${apiToken}` },
  };
}
