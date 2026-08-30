import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mocks.mockGetDb(...args),
}));

import { canReadManagedStorageKey } from "../managedStorageAuthorizationService";

type FeedbackAttachmentRow = {
  ticketTenantId: string | null;
  submittedBy: number;
  submittedByType: "human" | "system";
  internalComment?: boolean | null;
};

function makeDb(...results: unknown[][]) {
  let queryIndex = 0;
  const db: any = {
    select: vi.fn(() => {
      const chain: any = {};
      chain.from = vi.fn(() => chain);
      chain.innerJoin = vi.fn(() => chain);
      chain.leftJoin = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn(async () => results[queryIndex++] ?? []);
      return chain;
    }),
  };
  return db;
}

function setFeedbackAttachment(row: FeedbackAttachmentRow) {
  mocks.mockGetDb.mockResolvedValue(makeDb([], [row]));
}

describe("managedStorageAuthorizationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows the owner to read tenant-scoped Media Studio uploads", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([]));

    await expect(
      canReadManagedStorageKey("chat/uploads/tenant-1/24/upload-1.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(true);

    await expect(
      canReadManagedStorageKey("chat/uploads/tenant-1/99/upload-1.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);

    await expect(
      canReadManagedStorageKey("chat/uploads/tenant-2/24/upload-1.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);
  });

  it("keeps legacy user-scoped Media Studio uploads readable only by their owner", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([]));

    await expect(
      canReadManagedStorageKey("chat/uploads/24/legacy.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(true);

    await expect(
      canReadManagedStorageKey("chat/uploads/24/legacy.png", {
        tenantId: "tenant-1",
        userId: 99,
        role: "user",
      })
    ).resolves.toBe(false);
  });

  it("allows the owner to read Marketplace Capture images without making them public", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ id: "asset-1" }]));

    await expect(
      canReadManagedStorageKey(
        "marketplace-captures/cap-1/images/product.png",
        {
          tenantId: "tenant-1",
          userId: 24,
          role: "user",
        }
      )
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], []));
    await expect(
      canReadManagedStorageKey(
        "marketplace-captures/cap-1/images/product.png",
        {
          tenantId: "tenant-1",
          userId: 99,
          role: "user",
        }
      )
    ).resolves.toBe(false);
  });

  it("keeps legacy tenantless Marketplace Capture assets readable only by their owner", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ id: "legacy-asset-1" }]));

    await expect(
      canReadManagedStorageKey(
        "marketplace-captures/legacy-cap/images/product.png",
        { tenantId: "tenant-1", userId: 24, role: "user" },
      ),
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], []));
    await expect(
      canReadManagedStorageKey(
        "marketplace-captures/legacy-cap/images/product.png",
        { tenantId: "tenant-1", userId: 99, role: "user" },
      ),
    ).resolves.toBe(false);
  });

  it("allows an owner to read tenant-bound Marketplace Auto Review media", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ id: "run-1" }]));

    await expect(
      canReadManagedStorageKey(
        "marketplace-auto-review/tenant-1/run-1/media/image/shot-1.png",
        { tenantId: "tenant-1", userId: 24, role: "user" },
      ),
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], []));
    await expect(
      canReadManagedStorageKey(
        "marketplace-auto-review/run-1/manual-uploads/1-image-a.png",
        { tenantId: "tenant-1", userId: 99, role: "user" },
      ),
    ).resolves.toBe(false);
  });

  it("allows an active group member to read a shared Marketplace Capture image", async () => {
    mocks.mockGetDb.mockResolvedValue(
      makeDb([], [], [{ id: "shared-image-1" }])
    );

    await expect(
      canReadManagedStorageKey(
        "marketplace-captures/cap-1/images/shared-product.png",
        {
          tenantId: "tenant-1",
          userId: 24,
          role: "user",
        }
      )
    ).resolves.toBe(true);
  });

  it("allows an episode cover to broker only its owner's configured series watermark images", async () => {
    const watermark = {
      imageUrl: "/api/storage/files/vertical-drama/21/watermark/title.png",
      secondary: {
        imageUrl: "/api/storage/files/vertical-drama/21/watermark/channel.png",
      },
    };
    mocks.mockGetDb.mockResolvedValue(
      makeDb(
        [],
        [
          {
            watermark,
          },
        ]
      )
    );

    await expect(
      canReadManagedStorageKey("vertical-drama/21/watermark/title.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ watermark }]));
    await expect(
      canReadManagedStorageKey("vertical-drama/21/watermark/other.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);
  });

  it("enforces tenant and user ownership for Presentation media assets", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ id: 77 }]));

    await expect(
      canReadManagedStorageKey(
        "presentation/tenant-1/deck-7/image/slot-1/asset.png",
        {
          tenantId: "tenant-1",
          userId: 24,
          role: "user",
        }
      )
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], []));
    await expect(
      canReadManagedStorageKey(
        "presentation/tenant-1/deck-7/image/slot-1/asset.png",
        {
          tenantId: "tenant-1",
          userId: 99,
          role: "user",
        }
      )
    ).resolves.toBe(false);
  });

  it("allows only the owner of a completed durable presentation export to download it", async () => {
    mocks.mockGetDb.mockResolvedValue(makeDb([], [{ id: 501 }]));

    await expect(
      canReadManagedStorageKey("presentation-exports/398/task-1.zip", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(true);

    mocks.mockGetDb.mockResolvedValue(makeDb([], []));
    await expect(
      canReadManagedStorageKey("presentation-exports/398/task-1.zip", {
        tenantId: "tenant-1",
        userId: 99,
        role: "user",
      })
    ).resolves.toBe(false);
  });

  it("allows the human ticket owner to read a feedback attachment in the same tenant", async () => {
    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
    });

    await expect(
      canReadManagedStorageKey("feedback/315/screenshot.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(true);
  });

  it("blocks ticket owners from reading images attached to internal notes", async () => {
    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
      internalComment: true,
    });

    await expect(
      canReadManagedStorageKey("feedback/315/internal-note.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);

    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
      internalComment: true,
    });
    await expect(
      canReadManagedStorageKey("feedback/315/internal-note.png", {
        tenantId: "tenant-1",
        userId: 99,
        role: "domain_admin",
      })
    ).resolves.toBe(true);
  });

  it("blocks a user from another ticket owner or tenant", async () => {
    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
    });

    await expect(
      canReadManagedStorageKey("feedback/315/screenshot.png", {
        tenantId: "tenant-1",
        userId: 99,
        role: "user",
      })
    ).resolves.toBe(false);

    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
    });

    await expect(
      canReadManagedStorageKey("feedback/315/screenshot.png", {
        tenantId: "tenant-2",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);
  });

  it("allows admins in the same tenant to read feedback attachments", async () => {
    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
    });

    await expect(
      canReadManagedStorageKey("feedback/315/screenshot.png", {
        tenantId: "tenant-1",
        userId: 99,
        role: "domain_admin",
      })
    ).resolves.toBe(true);

    setFeedbackAttachment({
      ticketTenantId: "tenant-1",
      submittedBy: 24,
      submittedByType: "human",
    });

    await expect(
      canReadManagedStorageKey("feedback/315/screenshot.png", {
        tenantId: "tenant-2",
        userId: 99,
        role: "admin",
      })
    ).resolves.toBe(false);
  });

  it("allows admins to read legacy unscoped system-ticket attachments", async () => {
    setFeedbackAttachment({
      ticketTenantId: null,
      submittedBy: 24,
      submittedByType: "system",
    });

    await expect(
      canReadManagedStorageKey("feedback/304/screenshot.png", {
        tenantId: "tenant-1",
        userId: 99,
        role: "admin",
      })
    ).resolves.toBe(true);

    setFeedbackAttachment({
      ticketTenantId: null,
      submittedBy: 24,
      submittedByType: "system",
    });

    await expect(
      canReadManagedStorageKey("feedback/304/screenshot.png", {
        tenantId: "tenant-1",
        userId: 24,
        role: "user",
      })
    ).resolves.toBe(false);
  });
});
