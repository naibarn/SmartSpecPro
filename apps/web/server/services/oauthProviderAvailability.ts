type SettingValue = string | null | undefined;

type ProviderConfig = {
  clientId?: SettingValue;
  clientSecret?: SettingValue;
  redirectUri?: SettingValue;
};

type ProviderStatus = {
  ready: boolean;
  missing: Array<"clientId" | "clientSecret" | "redirectUri">;
  invalid: Array<"redirectUri">;
};

type OAuthProviderAvailability = {
  google: boolean;
  github: boolean;
  microsoft: boolean;
  details: {
    google: ProviderStatus;
    github: ProviderStatus;
    microsoft: ProviderStatus;
  };
};

const DEFAULT_REDIRECTS = {
  google: "https://smartaihub.app/auth/callback/google",
  github: "https://smartaihub.app/auth/callback/github",
  microsoft: "https://smartaihub.app/auth/callback/onedrive",
} as const;

function hasValue(value: SettingValue) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRedirectUri(value: SettingValue, expectedPath?: string) {
  if (!hasValue(value)) return true;

  try {
    const uri = new URL(value!.trim());
    return (
      (uri.protocol === "https:" || uri.protocol === "http:") &&
      (!expectedPath || uri.pathname === expectedPath) &&
      !uri.search &&
      !uri.hash
    );
  } catch {
    return false;
  }
}

function buildProviderStatus(
  config: ProviderConfig,
  expectedRedirectPath?: string
): ProviderStatus {
  const missing: ProviderStatus["missing"] = [];
  const invalid: ProviderStatus["invalid"] = [];

  if (!hasValue(config.clientId)) {
    missing.push("clientId");
  }

  if (!hasValue(config.clientSecret)) {
    missing.push("clientSecret");
  }

  if (!hasValue(config.redirectUri)) {
    missing.push("redirectUri");
  } else if (!isValidRedirectUri(config.redirectUri, expectedRedirectPath)) {
    invalid.push("redirectUri");
  }

  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export function buildOAuthProviderAvailability(
  values: Record<string, SettingValue>
): OAuthProviderAvailability {
  const google = buildProviderStatus(
    {
      clientId: values.googleClientId ?? process.env.GOOGLE_CLIENT_ID,
      clientSecret:
        values.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
      redirectUri:
        values.googleRedirectUri ??
        process.env.GOOGLE_REDIRECT_URI ??
        DEFAULT_REDIRECTS.google,
    },
    "/auth/callback/google"
  );

  const github = buildProviderStatus({
    clientId: values.githubClientId ?? process.env.GITHUB_CLIENT_ID,
    clientSecret: values.githubClientSecret ?? process.env.GITHUB_CLIENT_SECRET,
    redirectUri:
      values.githubRedirectUri ??
      process.env.GITHUB_REDIRECT_URI ??
      DEFAULT_REDIRECTS.github,
  });

  const microsoft = buildProviderStatus({
    clientId: values.microsoftClientId ?? process.env.MICROSOFT_CLIENT_ID,
    clientSecret:
      values.microsoftClientSecret ?? process.env.MICROSOFT_CLIENT_SECRET,
    redirectUri:
      values.microsoftOneDriveRedirectUri ??
      process.env.MICROSOFT_ONEDRIVE_REDIRECT_URI ??
      DEFAULT_REDIRECTS.microsoft,
  });

  return {
    google: google.ready,
    github: github.ready,
    microsoft: microsoft.ready,
    details: {
      google,
      github,
      microsoft,
    },
  };
}
