# SSP-SHAREFILE-009: Custom Groups & Permission-based File Sharing

## Usage Guide

### What Was Built

A complete Custom Groups & Permission-based File Sharing system for SmartSpecPro, consisting of 12 implementation sections:

| Section | Description | Commit |
|---------|-------------|--------|
| 01 | Database schema (user_groups, group_members, library_permissions extensions) | `b32f377` |
| 02 | Groups service layer (CRUD, membership, caching) | `92de1c3` |
| 03 | Library service updates (group permission resolution) | `a076d70` |
| 04 | Groups tRPC router | `b4b4d54` |
| 05 | Library router updates for ShareFile | `55f2ce3` |
| 06 | Trash auto-purge background job | `049206f` |
| 07 | Group Management UI | `c1b3757` |
| 08 | File Sharing UI | `7a2f6b0` |
| 09 | Trash UI | `12fcd7e`, `0e324bb` |
| 10 | Caching & Optimization | `9c02eb3` |
| 11 | Security Tests | `e1cfe25` |
| 12 | Deployment Verification | `abb20d4` |

### Key Features

1. **Custom Groups**: Create/manage groups with admin/member roles, public/private visibility, open/invite-only/request-to-join policies
2. **Permission-based File Sharing**: Share files with individual users or groups at read/write/delete permission levels
3. **Permission Hierarchy**: Direct share > Group share > Tenant role, with highest level winning across sources
4. **Trash System**: 90-day soft delete with auto-purge background job, owner-only trash visibility
5. **Redis Caching**: Group memberships cached (60s TTL) with selective invalidation on mutations
6. **Tenant Isolation**: All operations scoped to actor's tenant; cross-tenant access blocked at service layer

### API Endpoints

**Groups (tRPC `groups.*`):**
- `groups.list` — List user's groups (scope: my_groups, member_of, all)
- `groups.get` — Get group detail
- `groups.searchPublic` — Search public groups in tenant
- `groups.create` — Create group (max 50 per user)
- `groups.update` — Update group settings (admin/owner)
- `groups.delete` — Soft delete group (owner only)
- `groups.addMember` — Add member (admin/owner, max 100 per group)
- `groups.removeMember` — Remove member or self-leave
- `groups.updateMemberRole` — Change admin/member role
- `groups.join` — Join open group
- `groups.requestJoin` — Request to join group
- `groups.approveMember` — Approve pending request
- `groups.rejectMember` — Reject pending request

**Library (tRPC `library.*`):**
- `library.shareItem` — Share file with user or group
- `library.removeShare` — Remove share
- `library.getItemShares` — List active shares for item
- `library.getEffectivePermission` — Get user's effective permission for item
- `library.listTrash` — List user's deleted files
- `library.restoreFromTrash` — Restore from trash
- `library.permanentDelete` — Permanently delete from trash

### UI Components

- **GroupManagementPanel** — `/components/library/GroupManagementPanel.tsx`
- **SharePanel** — `/components/library/SharePanel.tsx`
- **TrashPanel** — `/components/library/TrashPanel.tsx`
- **DocumentLibraryTabs** — 4 tabs: My Library, Shared With Me, My Groups, Trash

### Test Coverage

| Test File | Passing | Todo |
|-----------|---------|------|
| groupsService.test.ts | 33 | 0 |
| libraryService.test.ts | ~30 | ~37 |
| libraryDocumentManagementService.test.ts | 3 | 0 |
| librarySearchService.test.ts | 3 | 0 |
| securityShareFile.test.ts | 39 | 11 |
| TrashPanel.test.ts | 21 | 0 |
| verification.test.ts | 0 | 19 |

### Pre-Deployment

```bash
# Run the checklist
./apps/web/scripts/pre-deployment-checklist.sh

# Run all ShareFile tests
cd apps/web
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run \
  server/services/groupsService.test.ts \
  server/services/libraryService.test.ts \
  server/services/securityShareFile.test.ts \
  client/src/components/library/TrashPanel.test.ts
```

### Rollback

See `specs/feature/009-sharefile/ROLLBACK.md` for detailed rollback procedures.

### Rollout Plan

See `specs/feature/009-sharefile/ROLLOUT_PLAN.md` for phased Alpha/Beta/GA rollout strategy.
