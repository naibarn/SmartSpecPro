// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RunnerReleaseAdminPanel } from "../RunnerReleaseAdminPanel";

const releaseConfigState = vi.hoisted(() => ({
  data: {
    githubRepository: "",
    githubTokenConfigured: false,
  },
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    systemSettings: {
      getDesktopReleaseSettings: {
        useQuery: () => releaseConfigState,
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "dashboard:runnerReleases.admin.startBuild": "Start manual build",
        "dashboard:runnerReleases.admin.publishToCatalog": "Publish release to SmartAIHub catalog",
        "dashboard:runnerReleases.admin.description": "Manual build only. The server imports and verifies release assets into the SmartAIHub catalog.",
        "dashboard:runnerReleases.admin.configurationRequired": "Configure the GitHub repository and token above before starting a runner build.",
        "dashboard:runnerReleases.admin.signingGuide.title": "How to configure Runner signing",
        "dashboard:runnerReleases.admin.signingGuide.intro": "The private key signs published Runner artifacts in GitHub Actions. The public key verifies them on each Runner.",
        "dashboard:runnerReleases.admin.signingGuide.privateKeyWarning": "Never put the private key in SmartAIHub, a Runner machine, source control, chat, or a browser.",
        "dashboard:runnerReleases.admin.signingGuide.section.what": "What RUNNER_SIGNING_KEY is",
        "dashboard:runnerReleases.admin.signingGuide.section.generate": "Create the RSA key pair",
        "dashboard:runnerReleases.admin.signingGuide.section.test": "Test the key pair",
        "dashboard:runnerReleases.admin.signingGuide.section.github": "Store the private key in GitHub",
        "dashboard:runnerReleases.admin.signingGuide.section.windows": "Configure the Windows Runner",
        "dashboard:runnerReleases.admin.signingGuide.section.publish": "Build and publish",
        "dashboard:runnerReleases.admin.signingGuide.section.verify": "Verify a successful release",
        "dashboard:runnerReleases.admin.signingGuide.section.troubleshoot": "Troubleshoot and rotate safely",
        "dashboard:runnerReleases.admin.signingGuide.generateCommand": "umask 077\nopenssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out runner-signing-private.pem\nopenssl pkey -in runner-signing-private.pem -pubout -out runner-signing-public.pem",
        "dashboard:runnerReleases.admin.signingGuide.testCommand": "printf 'runner-signing-test' > sample.bin\nopenssl dgst -sha256 -sign runner-signing-private.pem -out sample.sig sample.bin\nopenssl dgst -sha256 -verify runner-signing-public.pem -signature sample.sig sample.bin",
        "dashboard:runnerReleases.admin.signingGuide.githubCommand": "gh secret set RUNNER_SIGNING_KEY --repo OWNER/REPOSITORY < runner-signing-private.pem",
      };
      return labels[key] ?? key;
    },
  }),
}));

describe("RunnerReleaseAdminPanel", () => {
  it("exposes an explicit manual build and publish decision", () => {
    render(<RunnerReleaseAdminPanel />);
    expect(screen.getByRole("button", { name: /start manual build/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /publish release to smartaihub catalog/i })).toBeChecked();
    expect(screen.getByText(/manual build only/i)).toBeInTheDocument();
  });

  it("blocks the build until the GitHub release configuration is ready", async () => {
    const user = userEvent.setup();
    render(<RunnerReleaseAdminPanel />);

    await user.type(screen.getAllByPlaceholderText("0.2.0")[0], "0.2.0");

    expect(
      screen.getByRole("button", { name: /start manual build/i })
    ).toBeDisabled();
    expect(
      screen.getByText(/configure the github repository and token above/i)
    ).toBeInTheDocument();
  });

  it("renders a complete signing guide without exposing private key material", () => {
    render(<RunnerReleaseAdminPanel />);

    expect(screen.getByRole("heading", { name: /how to configure runner signing/i })).toBeInTheDocument();
    expect(screen.getByText(/RUNNER_SIGNING_KEY is/i)).toBeInTheDocument();
    expect(screen.getByText(/SAH_RUNNER_RELEASE_PUBLIC_KEY/i)).toBeInTheDocument();
    expect(screen.getByText(/never put the private key/i)).toBeInTheDocument();
    expect(screen.getByText(/openssl genpkey/i)).toBeInTheDocument();
    expect(screen.queryByText(/BEGIN PRIVATE KEY/)).not.toBeInTheDocument();
  });
});
