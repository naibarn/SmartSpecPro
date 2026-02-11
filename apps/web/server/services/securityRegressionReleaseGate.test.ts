import { afterEach, describe, expect, it } from "vitest";

import { isLibraryEnabledForTenant } from "./libraryFeatureFlags";
import { reprocessCallbackDlqEntry, type LibraryOpsRepository } from "./libraryOpsService";
import { validateLibraryUrl } from "./libraryUrlPolicy";
import { getUploadStaticHeaders } from "./uploadContentSafety";

const ORIGINAL_LIBRARY_ENABLED = process.env.LIBRARY_ENABLED;
const ORIGINAL_LIBRARY_ENABLED_TENANTS = process.env.LIBRARY_ENABLED_TENANTS;

afterEach(() => {
  if (ORIGINAL_LIBRARY_ENABLED === undefined) {
    delete process.env.LIBRARY_ENABLED;
  } else {
    process.env.LIBRARY_ENABLED = ORIGINAL_LIBRARY_ENABLED;
  }

  if (ORIGINAL_LIBRARY_ENABLED_TENANTS === undefined) {
    delete process.env.LIBRARY_ENABLED_TENANTS;
  } else {
    process.env.LIBRARY_ENABLED_TENANTS = ORIGINAL_LIBRARY_ENABLED_TENANTS;
  }
});

function createTenantScopedRepo(): LibraryOpsRepository {
  return {
    getDlqEntryById: async (_id, scope) => {
      if (scope?.tenantId !== "tenant-a") return null;
      return {
        id: 10,
        eventId: 55,
        tenantId: "tenant-a",
        status: "pending",
      };
    },
    markDlqEntryReprocessed: async () => {},
    moveEventToRetryPending: async () => {},
  };
}

describe("security regression release gate", () => {
  it("keeps external https image URL compatible for source + proxy policy", () => {
    const sourceResult = validateLibraryUrl(
      "https://cdn.example.com/assets/photo.png",
      "library_source_url",
    );
    const proxyResult = validateLibraryUrl(
      "https://cdn.example.com/assets/photo.png",
      "image_proxy_target_url",
    );

    expect(sourceResult.ok).toBe(true);
    expect(proxyResult.ok).toBe(true);
  });

  it("rejects unsafe URL schemes in library write paths", () => {
    const result = validateLibraryUrl("javascript:alert(1)", "library_source_url");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked_scheme");
    }
  });

  it("blocks private/local hosts for office preview policy", () => {
    const result = validateLibraryUrl("https://localhost/private.docx", "office_preview_url");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked_local_private_host");
    }
  });

  it("forces active-content uploads to attachment delivery", () => {
    expect(getUploadStaticHeaders("/tmp/malicious.html")).toMatchObject({
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
    });
  });

  it("denies missing tenant context in allowlist mode", () => {
    process.env.LIBRARY_ENABLED = "true";
    process.env.LIBRARY_ENABLED_TENANTS = "tenant-a,tenant-b";

    expect(isLibraryEnabledForTenant(undefined)).toBe(false);
    expect(isLibraryEnabledForTenant(null)).toBe(false);
    expect(isLibraryEnabledForTenant("tenant-a")).toBe(true);
  });

  it("prevents cross-tenant callback reprocess under tenant-scoped repo", async () => {
    const result = await reprocessCallbackDlqEntry(createTenantScopedRepo(), 10, {
      tenantId: "tenant-b",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("not_found");
  });
});
