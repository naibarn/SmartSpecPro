# Interview Transcript: Custom Groups & Permission-based File Sharing

**Feature ID:** SSP-SHAREFILE-009
**Interview Date:** 2026-02-12
**Interviewer:** Claude (Deep-Plan Agent)
**Interviewee:** Product Owner

---

## Round 1: Core Functionality & Data Management

### Q1: เมื่อลบ group (ที่มีไฟล์ถูกแชร์อยู่) ควรจะเกิดอะไรกับไฟล์ที่ถูกแชร์ผ่าน group นั้น?

**Answer:** ลบ permissions ทั้งหมด

**Interpretation:**
- When a group is deleted, ALL permissions granted through that group are immediately removed
- Members of the deleted group lose access to shared files instantly
- Files themselves remain (only permissions are deleted, not the files)
- This is a cascading delete on `library_permissions` table where `subjectType = "group"` and `subjectId = {deletedGroupId}`

**Implementation Impact:**
- Need ON DELETE CASCADE or trigger to clean up permissions when group is deleted
- May want to notify affected users (though they weren't explicitly granted access, they may have been using the files)

---

### Q2: ไฟล์ที่อยู่ใน Trash ควรแสดงใน scope ไหนบ้าง?

**Answer:** แสดงใน Trash ของตัวเอง

**Interpretation:**
- Each user sees their OWN Trash tab showing only files THEY deleted (where `deletedBy = userId`)
- Sharees do NOT see files in their "Shared With Me" or "Shared Groups" tabs when the owner moves them to trash
- When owner restores from trash, sharees regain access automatically (permissions are preserved)

**Implementation Impact:**
- Trash query: `WHERE deletedAt IS NOT NULL AND (ownerUserId = userId OR deletedBy = userId)`
  - Actually, based on answer, it should be: `WHERE deletedAt IS NOT NULL AND ownerUserId = userId` (only show items user OWNS, not items they deleted from others)
- Wait, re-reading: "แสดงใน Trash ของตัวเอง" = show in OWN trash
  - This likely means: only owner sees items in trash (owner's trash = files they own that are deleted)
  - Correct query: `WHERE deletedAt IS NOT NULL AND ownerUserId = userId`

---

### Q3: User สามารถลบไฟล์ถาวร (permanent delete) ก่อน 90 วันได้ไหม?

**Answer:** ได้ ถ้าเป็น owner

**Interpretation:**
- Owners can permanently delete files from trash at any time (don't need to wait 90 days)
- Non-owners (admins) may or may not have this ability (not clarified in this answer, but spec says "admin only or after 90 days")
- 90-day auto-purge is still the DEFAULT behavior (runs nightly)
- Manual permanent delete by owner is an OPTION for early cleanup

**Implementation Impact:**
- `permanentDelete` mutation requires permission check: `isOwner(item, actor) || (isAdmin(actor) && daysInTrash >= 90)`
- UI: Show "Delete Forever" button in Trash panel only for owners

---

### Q4: ไฟล์ที่อยู่ใน Trash ควรถูก exclude จาก vector search ไหม?

**Answer:** ใช่ exclude

**Interpretation:**
- Files with `deletedAt IS NOT NULL` should NOT appear in search results
- This applies to both keyword search and vector/RAG queries
- Security consideration: deleted files should not be discoverable

**Implementation Impact:**
- All search queries MUST filter: `WHERE deletedAt IS NULL`
- Vector DB indexing: either exclude deleted files from vector DB, OR include `isDeleted` metadata and filter in queries
- Recommendation: Keep vectors in DB (for restore performance), filter at query time

---

## Round 2: Permissions, Notifications & Scale

### Q5: เมื่อ user ถูก grant หรือ revoke permission ควรมีการแจ้งเตือนไหม?

**Answer:** มี (in-app + email)

**Interpretation:**
- When a user is granted access to a file (either direct share or added to group that has access), they should receive:
  1. **In-app notification** (bell icon, notification panel)
  2. **Email notification** (summary of what was shared, by whom, with what permission level)
- When a user's access is revoked (either direct revoke or removed from group), same dual notification

**Implementation Impact:**
- Need notification service/module (or integrate with existing notification system)
- Email template for "You've been granted [READ/WRITE/DELETE] access to [FILE_NAME] by [SHARER_NAME]"
- Email template for "Your access to [FILE_NAME] has been revoked"
- In-app notification model with read/unread status
- Notification preferences (allow users to opt out of email, keep in-app only)

**Scope Decision:**
- This is a significant feature add (notification system)
- If notification system doesn't exist yet, this could be Phase 7 (post-MVP)
- Spec originally said notifications are "Future Enhancement" but user confirmed they want it

---

### Q6: Group visibility ทำงานอย่างไร? User สามารถเห็น/เข้าร่วม group ของคนอื่นได้บ้างไหม?

**Answer:** มี search groups

**Interpretation:**
- Groups can be marked as **public** (visibility = "public" in `user_groups` table)
- Users can SEARCH for public groups (name, description match)
- Users can REQUEST to join or JOIN directly (depending on `joinPolicy`:
  - `"open"` — Join immediately without approval
  - `"request_to_join"` — Submit request, admin approves
  - `"invite_only"` — Cannot request, must be invited by admin
- Private groups are NOT searchable (only visible to members)

**Implementation Impact:**
- Need **Group Discovery** page or tab in Group Management
- Search endpoint: `groups.searchPublic` (filters by `visibility = "public"` and tenant)
- Join flow:
  - "open" → `groups.join({ groupId })` creates membership immediately
  - "request_to_join" → `groups.requestJoin({ groupId })` creates membership with `status = "pending"`, admin must approve
  - "invite_only" → No join button, show "Invite Only" badge
- Group admin sees pending join requests in GroupDetailPanel

**New Endpoints Needed:**
```typescript
groups.searchPublic({ query, limit, offset })
groups.join({ groupId }) // For open groups
groups.requestJoin({ groupId }) // For request-to-join groups
groups.approveMember({ groupId, userId }) // Admin approves pending request
groups.rejectMember({ groupId, userId }) // Admin rejects pending request
```

---

### Q7: ถ้า user ถูก downgrade permission (เช่น จาก delete → read) ควรเกิดอะไรขึ้น?

**Answer:** ใช้งานได้ทันที

**Interpretation:**
- Permission changes take effect **immediately** (real-time enforcement)
- No need to wait for user to logout and login again
- Backend permission checks happen on EVERY request (not cached long-term)
- Frontend UI should update dynamically when permissions change (if possible)

**Implementation Impact:**
- **Backend:** Permission check functions (`getUserEffectivePermission`) must query database on each request
  - Research suggested caching permissions with 5-minute TTL, but user wants immediate enforcement
  - Compromise: Cache for 1 minute max (or use Redis with short TTL)
  - Or: No caching, always query (accept ~3-8x overhead from research)
- **Frontend:** Use polling or WebSocket to detect permission changes and update UI
  - Alternatively: Permissions are refetched on each mutation (TanStack Query cache invalidation)
  - Show toast notification if user loses permission while viewing a file
- **Edge case:** User is editing a file when they lose "write" permission → save fails, show error message

---

### Q8: คาดหวัง scale/volume เท่าไหร่ (ต่อ tenant)?

**Answer:** Large (> 1000 files)

**Interpretation:**
- Expected scale per tenant:
  - **Users:** > 100 active users
  - **Groups:** > 50 groups
  - **Files:** > 1000 library items
  - **Shares:** Potentially thousands of permission entries

**Implementation Impact:**
- **Database indexes are CRITICAL:**
  - Partial indexes on `WHERE deletedAt IS NULL`
  - Composite indexes on `(tenantId, ownerUserId)`, `(tenantId, status)`
  - Index on `library_permissions(libraryItemId, subjectType, subjectId)`
- **Permission check optimization:**
  - Batch permission checks where possible (fetch all permissions for multiple items in one query)
  - Use `getUserGroups()` once per request, reuse for all permission checks
  - Consider denormalizing frequently-accessed data (e.g., `userPermissionLevel` column in join table)
- **Vector search performance:**
  - Research showed 3-8x overhead for permission filtering
  - With 1000+ files, this could be 200-800ms for searches
  - Mitigation: Pre-filter by tenant + status before vector search, limit candidate set
- **Group membership caching:**
  - User's groups can be cached in Redis with 1-5 minute TTL (acceptable for immediate enforcement)
  - Key: `user:{userId}:groups` → array of group IDs
  - Invalidate on group membership changes
- **Pagination everywhere:**
  - Library list, group list, member list, trash list — all must be paginated
  - Default page size: 20-50 items
- **Database connection pooling:**
  - With 100+ concurrent users, need proper connection pool (e.g., pg pool size 20-50)

---

## Round 3: Group Membership, Audit & UI/UX

### Q9: Group member สามารถออกจาก group เองได้ไหม?

**Answer:** ได้ (voluntary leave)

**Interpretation:**
- Members can LEAVE a group voluntarily (don't need admin approval)
- When a member leaves, they immediately lose access to all files shared with that group
- Group creator (owner) CANNOT leave their own group (must delete group or transfer ownership first)

**Implementation Impact:**
- New endpoint: `groups.leave({ groupId })`
  - Check: user is a member of the group
  - Check: user is NOT the group owner (owner cannot leave)
  - Delete membership: `DELETE FROM group_members WHERE groupId = X AND userId = Y`
  - Decrement `memberCount` in `user_groups` table
- **UI:** "Leave Group" button in GroupDetailPanel (visible to members, not visible to owner)
- **Confirmation dialog:** "Are you sure you want to leave [GROUP_NAME]? You will lose access to files shared with this group."

---

### Q10: ควรมี audit log/history ของการแชร์ไหม? (ใครแชร์เมื่อไหร่, permission อะไร เปลี่ยนเมื่อไหร่)

**Answer:** มี (admin only)

**Interpretation:**
- There SHOULD be an audit log tracking:
  - Who shared a file (grantedByUserId)
  - When it was shared (createdAt)
  - What permission level was granted (permissionLevel)
  - When permissions were changed (updatedAt in library_permissions)
  - When permissions were revoked (track deletion event)
- This log is visible ONLY to admins (not regular users)
- Regular users see current shares in Share Dialog, but not full history

**Implementation Impact:**
- **Option 1: Use existing audit logger**
  - Current audit logger already logs mutations (see research findings)
  - Query JSONL files for `eventType: "library_mutation"` with `endpoint: "library.shareItem"`
  - Admins can access via Admin panel
- **Option 2: Create dedicated share_history table**
  - Track all share events with `action` (granted, revoked, updated)
  - More queryable than JSONL logs
  - Example schema:
    ```sql
    CREATE TABLE share_history (
      id SERIAL PRIMARY KEY,
      tenant_id VARCHAR(36),
      library_item_id INTEGER,
      actor_user_id INTEGER,
      target_subject_type VARCHAR(32),
      target_subject_id VARCHAR(64),
      action VARCHAR(32), -- "granted", "revoked", "updated"
      old_permission_level VARCHAR(32),
      new_permission_level VARCHAR(32),
      created_at TIMESTAMP
    );
    ```
- **UI:** Admin-only "Share History" tab in Admin panel (not in regular user's Share Dialog)

**Recommendation:** Use Option 1 (existing audit logger) for MVP, consider Option 2 if admins need advanced querying.

---

### Q11: ใน Share Dialog ถ้าค้นหา user ชื่อ "John" ควรแสดงอะไร?

**Answer:** Users only

**Interpretation:**
- In the Share Dialog search box, typing "John" should return ONLY users (not groups)
- Groups should be in a SEPARATE section or tab (e.g., "Share with People" vs "Share with Groups")
- This prevents confusion (user vs group with similar names)

**Implementation Impact:**
- **Share Dialog UI Structure:**
  ```
  ┌─────────────────────────────────────┐
  │ Share "Document.pdf"            [X] │
  ├─────────────────────────────────────┤
  │ Add people or groups                │
  │ ┌─────────────────────────────────┐ │
  │ │ 🔍 Search for people...         │ │
  │ └─────────────────────────────────┘ │
  │                                     │
  │ Or select a group:                  │
  │ ┌─────────────────────────────────┐ │
  │ │ ▼ Select group...               │ │
  │ └─────────────────────────────────┘ │
  │                                     │
  │ Who has access:                     │
  │ ┌─────────────────────────────────┐ │
  │ │ 👤 John Doe (You)      [Owner]  │ │
  │ │ 👤 Jane Smith       [▼ Write]   │ │
  │ │ 👥 Marketing Team   [▼ Read]    │ │
  │ └─────────────────────────────────┘ │
  └─────────────────────────────────────┘
  ```
- **User search:** `groups.listTenantUsers({ search: "John", excludeGroupId, limit: 10 })`
  - Returns users with name or email matching "John"
  - Filters by tenant
  - Excludes self (can't share with yourself)
- **Group selector:** `groups.list({ scope: "all" })` or dropdown of user's accessible groups

---

### Q12: ถ้า user มี permission หลายทาง (direct: read, group: write) ควรแสดงอย่างไร?

**Answer:** แสดงทั้งหมด

**Interpretation:**
- If a user has MULTIPLE permission sources (e.g., direct share + group share), the UI should show ALL of them
- Example: File preview panel shows two badges:
  - "Read Only (Direct Share)"
  - "Can Edit (via Marketing Team)"
- The user's EFFECTIVE permission is the HIGHEST level (write > read), but UI transparency shows all sources

**Implementation Impact:**
- **Backend:** `getUserEffectivePermission()` should return:
  ```typescript
  {
    effectivePermissionLevel: "write", // Highest permission
    sources: [
      { type: "direct", subjectId: "123", level: "read" },
      { type: "group", subjectId: "456", groupName: "Marketing Team", level: "write" }
    ]
  }
  ```
- **Frontend:** Display multiple badges or a tooltip:
  - **Option 1:** Show all badges side-by-side
    ```
    [👁️ Read] [✏️ Write via Marketing Team]
    ```
  - **Option 2:** Show highest badge with tooltip on hover:
    ```
    [✏️ Can Edit] (hover: "Read via direct share, Write via Marketing Team")
    ```
- **Share Dialog:** "Who has access" section shows multiple rows if user/group has multiple entries:
  ```
  👤 Jane Smith (Direct)       [Read]    [✕]
  👤 Jane Smith (via Marketing) [Write]   [✕]
  ```

**Recommendation:** Use Option 2 (single badge with tooltip) in file list, use multiple rows in Share Dialog.

---

## Round 4: Final Confirmation

### Q13: มีอะไรที่คุณอยากชี้แจงหรือเพิ่มเติมเกี่ยวกับ feature นี้อีกไหม?

**Answer:** ไม่มี ดำเนินต่อได้

**Interpretation:**
- No additional clarifications needed
- User is satisfied with the interview coverage
- Ready to proceed with implementation planning

---

## Summary of Key Decisions

| Area | Decision | Implementation Priority |
|------|----------|------------------------|
| **Group Deletion** | Delete all permissions immediately | High (Core) |
| **Trash Visibility** | Owner's trash only (sharees don't see) | High (Core) |
| **Permanent Delete** | Owner can delete anytime, admin after 90 days | Medium (Core) |
| **Vector Search** | Exclude deleted files from search | High (Core) |
| **Notifications** | In-app + email for grant/revoke | Medium (Phase 2-3) |
| **Group Visibility** | Public groups with search/join | High (Core) |
| **Permission Changes** | Take effect immediately | High (Core) |
| **Scale Target** | > 100 users, > 50 groups, > 1000 files | High (Performance) |
| **Voluntary Leave** | Members can leave groups | Medium (Core) |
| **Audit Log** | Admin-only share history | Low (Post-MVP) |
| **Search UI** | Users only in search box, groups separate | High (UX) |
| **Permission Display** | Show all sources (multi-badge or tooltip) | Medium (UX) |

---

## Open Questions & Assumptions

**Assumptions Made (Not Explicitly Confirmed):**
1. **Group owner transfer:** Assume owner can transfer ownership to another admin member (not discussed)
2. **Permission expiration:** Spec mentions `expiresAt` but not discussed in interview — assume optional feature
3. **Rate limits:** Spec mentions limits (50 groups, 100 members, 20 shares) — assume these are acceptable
4. **Tenant admin override:** Assume tenant admins can view/restore any user's deleted files (not explicitly confirmed)

**Features Confirmed Out of Scope (for MVP):**
- Share via public link (spec says "Future Enhancement")
- Bulk share operations
- Group hierarchies (nested groups)
- Activity log for file access (only share history for admins)

---

## Next Steps

1. Write initial spec (claude-spec.md) combining:
   - Original spec document
   - Research findings
   - Interview clarifications

2. Create implementation plan (claude-plan.md) with:
   - Database schema changes
   - Service layer updates
   - Router/API endpoints
   - Frontend components
   - Testing strategy
   - Rollout phases

3. Apply TDD approach (claude-plan-tdd.md)

4. Split into implementation sections

---

**End of Interview Transcript**
