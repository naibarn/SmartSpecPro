/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const invalidateMock = vi.fn();
const createMutationMock = vi.fn();
const revokeMutationMock = vi.fn();
const updateConnectedWorkerSharingMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      users: {
        getPreferences: {
          invalidate: invalidateMock,
        },
        listConnectedWorkers: {
          invalidate: invalidateMock,
        },
      },
    }),
    users: {
      getPreferences: {
        useQuery: () => ({
          data: {
            workerAccessKeys: [],
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      createWorkerAccessKey: {
        useMutation: () => ({
          mutate: createMutationMock,
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      revokeWorkerAccessKey: {
        useMutation: () => ({
          mutate: revokeMutationMock,
          mutateAsync: vi.fn(),
          isPending: false,
        }),
      },
      listConnectedWorkers: {
        useQuery: () => ({
          data: {
            workers: [
              {
                workerId: "worker_1",
                displayName: "Render worker 01",
                externalReference: "worker-app://machine-01",
                runtimeType: "desktop_zeroclaw_managed",
                runtimeLabel: "ZeroClaw Desktop",
                runtimeFamily: "desktop",
                workerTypeKey: "smart_ai_hub_worker_app",
                workerTypeLabel: "Smart AI Hub Worker App",
                workerMode: "per_user",
                status: "online",
                machineId: "machine-01",
                machineName: "NAIBARN-PC",
                runtimeVersion: "0.1.5",
                lastSeenAt: "2026-06-23T01:02:03.000Z",
                teamId: null,
                sharingMode: "private",
                sharedGroups: [],
                preferredProviderName: "SmartSpecPro Gateway",
                permissionPreset: "operator_basic",
                permissionScopeCount: 5,
                quotaDisplayLabel: "Unlimited",
              },
            ],
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      updateConnectedWorkerSharing: {
        useMutation: () => ({
          mutate: updateConnectedWorkerSharingMock,
          mutateAsync: vi.fn(),
          isPending: false,
          variables: undefined,
        }),
      },
    },
    groups: {
      list: {
        useQuery: () => ({
          data: [
            { id: 101, name: "Video Team", role: "member" },
          ],
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
    },
    llmProviders: {
      list: {
        useQuery: () => ({
          data: [
            { id: 42, providerName: "smartspec-gateway", displayName: "SmartSpecPro Gateway" },
          ],
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "settings.workers.title": "Worker registration keys",
        "settings.workers.description": "Create one-time registration tokens for workers.",
        "settings.workers.eyebrow": "Workers",
        "settings.workers.createTitle": "Create registration key",
        "settings.workers.permissions.title": "Permissions",
        "settings.workers.quotas.title": "Credit quotas",
        "settings.workers.guidanceTitle": "How to use",
        "settings.workers.safety.title": "Safety checklist",
        "settings.workers.connect.title": "How to connect the worker",
        "settings.workers.connect.description": "After you create the key, open the worker's own bootstrap or registration screen.",
        "settings.workers.connect.hermes.title": "Hermes",
        "settings.workers.connect.hermes.description": "Use Hermes when the bridge is managed by the Hermes runtime.",
        "settings.workers.connect.hermes.step1": "Open the Hermes container or bridge setup.",
        "settings.workers.connect.hermes.step2": "Paste the worker access token into the registration token field.",
        "settings.workers.connect.hermes.step3": "Check Admin Monitoring to confirm registration.",
        "settings.workers.connect.openclaw.title": "OpenClaw",
        "settings.workers.connect.openclaw.description": "Use OpenClaw when the worker already knows how to register.",
        "settings.workers.connect.openclaw.step1": "Open the OpenClaw worker bootstrap or enrollment screen.",
        "settings.workers.connect.openclaw.step2": "Paste the token into the worker registration key field.",
        "settings.workers.connect.openclaw.step3": "Start the worker and bind it to a team if needed.",
        "settings.workers.connect.zeroclaw.title": "ZeroClaw",
        "settings.workers.connect.zeroclaw.description": "Use ZeroClaw for desktop-managed workers.",
        "settings.workers.connect.zeroclaw.step1": "Open the ZeroClaw desktop enrollment flow.",
        "settings.workers.connect.zeroclaw.step2": "Paste the token into the registration key field.",
        "settings.workers.connect.zeroclaw.step3": "Verify the worker appears online in monitoring.",
        "settings.workers.connect.nemoclaw.title": "NemoClaw",
        "settings.workers.connect.nemoclaw.description": "Use NemoClaw for sandboxed workers.",
        "settings.workers.connect.nemoclaw.step1": "Open the NemoClaw sandbox registration screen.",
        "settings.workers.connect.nemoclaw.step2": "Paste the token into the sandbox registration field.",
        "settings.workers.connect.nemoclaw.step3": "Confirm the worker enters the expected pool.",
        "settings.workers.permissions.presets.readonly": "Read-only assistant",
        "settings.workers.connectedWorkers.title": "Connected workers (1)",
        "settings.workers.connectedWorkers.description": "View registered workers, confirm the runtime type, and control who may use each worker from this page.",
        "settings.workers.connectedWorkers.identityTitle": "Connected worker details",
        "settings.workers.connectedWorkers.shareTitle": "Sharing and access",
        "settings.workers.connectedWorkers.type": "Worker type:",
        "settings.workers.connectedWorkers.runtime": "Runtime:",
        "settings.workers.connectedWorkers.family": "Family:",
        "settings.workers.connectedWorkers.externalRef": "External reference:",
        "settings.workers.connectedWorkers.scopeCount": "Allowed scopes:",
        "settings.workers.connectedWorkers.machine": "Machine",
        "settings.workers.connectedWorkers.version": "Version",
        "settings.workers.connectedWorkers.lastSeen": "Last seen",
        "settings.workers.connectedWorkers.notSeenYet": "Not seen yet",
        "settings.workers.connectedWorkers.currentShare.private": "Private to you only",
        "settings.workers.connectedWorkers.status.online": "Online",
        "settings.workers.connectedWorkers.shareModes.private.label": "Private",
        "settings.workers.connectedWorkers.shareModes.private.description": "Only you can claim jobs on this worker.",
        "settings.workers.connectedWorkers.shareModes.groups.label": "Selected groups",
        "settings.workers.connectedWorkers.shareModes.groups.description": "Only members of the chosen groups may use this worker.",
        "settings.workers.connectedWorkers.shareModes.tenant.label": "Whole tenant",
        "settings.workers.connectedWorkers.shareModes.tenant.description": "Any allowed user in this tenant may use this worker.",
        "settings.workers.connectedWorkers.reset": "Reset",
        "settings.workers.connectedWorkers.save": "Save sharing",
        "settings.workers.unlimited": "Unlimited",
        "settings.workers.permissions.scopesSelected": "scopes selected",
        "common.copy": "Copy",
        "common.copied": "Copied",
      };
      return values[key] ?? key;
    },
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span />,
  CheckCircle2: () => <span />,
  Copy: () => <span />,
  Key: () => <span />,
  Loader2: () => <span />,
  RotateCcw: () => <span />,
  Save: () => <span />,
  Shield: () => <span />,
  Trash2: () => <span />,
  Users: () => <span />,
}));

import { WorkerAccessKeysPanel } from "../WorkerAccessKeysPanel";

describe("WorkerAccessKeysPanel", () => {
  it("renders the worker help, permissions, and quota controls", () => {
    render(<WorkerAccessKeysPanel tenantName="Acme Labs" />);

    expect(screen.getByText("Create registration key")).toBeTruthy();
    expect(screen.getAllByText("Permissions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Credit quotas").length).toBeGreaterThan(0);
    expect(screen.getByText("How to use")).toBeTruthy();
    expect(screen.getByText("Safety checklist")).toBeTruthy();
    expect(screen.getByText("How to connect the worker")).toBeTruthy();
    expect(screen.getByText("Connected workers (1)")).toBeTruthy();
    expect(screen.getByText("Render worker 01")).toBeTruthy();
    expect(screen.getByText("Smart AI Hub Worker App")).toBeTruthy();
  });
});
