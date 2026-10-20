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
      !uri.username && !uri.password &&
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
  expectedRedirectPath?: string,
  expectedPublicOrigin?: string,
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
  } else if (!isValidRedirectUri(config.redirectUri, expectedRedirectPath) ||
    (expectedPublicOrigin !== undefined && new URL(config.redirectUri!.trim()).origin !== expectedPublicOrigin)) {
    invalid.push("redirectUri");
  }

  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export function buildOAuthProviderAvailability(
  values: Record<string, SettingValue>,
  /** Only a server-verified public origin may constrain a staged login profile. */
  expectedPublicOrigin?: string,
): OAuthProviderAvailability {
  // An attested staging request must never borrow the production login profile.
  const googleValues = expectedPublicOrigin === undefined ? values : {
    googleClientId: values.googleStagingClientId,
    googleClientSecret: values.googleStagingClientSecret,
    googleRedirectUri: values.googleStagingRedirectUri,
  };
  const google = buildProviderStatus(
    {
      clientId: googleValues.googleClientId ?? (expectedPublicOrigin === undefined ? process.env.GOOGLE_CLIENT_ID : undefined),
      clientSecret:
        googleValues.googleClientSecret ?? (expectedPublicOrigin === undefined ? process.env.GOOGLE_CLIENT_SECRET : undefined),
      redirectUri:
        googleValues.googleRedirectUri ?? (expectedPublicOrigin === undefined ? process.env.GOOGLE_REDIRECT_URI ?? DEFAULT_REDIRECTS.google : undefined),
    },
    "/auth/callback/google",
    expectedPublicOrigin,
  );

  const github = buildProviderStatus({
    clientId: expectedPublicOrigin === undefined ? values.githubClientId ?? process.env.GITHUB_CLIENT_ID : undefined,
    clientSecret: expectedPublicOrigin === undefined ? values.githubClientSecret ?? process.env.GITHUB_CLIENT_SECRET : undefined,
    redirectUri:
      values.githubRedirectUri ??
      process.env.GITHUB_REDIRECT_URI ??
      DEFAULT_REDIRECTS.github,
  }, undefined, expectedPublicOrigin);

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
