# Admin Feedback Attachments, Unread Queue, and Ticket Lifecycle

## Objective

Improve Feedback Hub so ticket images are readable, admin replies can include
multiple images, every image can be opened in an authenticated fullscreen
lightbox, unread work is obvious and ordered first, and tickets have an
explicit close lifecycle with safe server-side enforcement.

## Approved decisions

- Reuse `feedback_ticket_attachments` and add nullable `commentId`.
- Existing ticket-level attachments keep `commentId = null`.
- Reply uploads are multiple images, limited by the existing per-ticket file
  and size limits; server validation remains authoritative.
- A ticket is unread per admin until that admin opens its detail view.
- Opening detail marks the ticket read after authorization succeeds.
- Unread tickets are always sorted before read tickets; overdue unread tickets
  are first within unread.
- Admins and ticket owners can close a ticket. A closed ticket cannot receive
  replies or new attachments, including through direct API calls.
- Auto-close applies to non-closed tickets whose latest activity (`updatedAt`)
  is older than five days. Activity is ticket creation, reply, or a persisted
  status change.
- The in-page overdue alert is generic and contains no ticket title. It first
  appears after an unread ticket passes two hours and repeats every 30 minutes
  while overdue unread work remains.

## Architecture and data flow

`feedback_ticket_reads` stores one read receipt per `(ticketId, userId)` with a
unique constraint and indexes for per-admin unread queries. Feedback list and
summary endpoints compute unread state in the authorized tenant scope. The
`markRead` mutation verifies admin access and tenant visibility before an
upsert.

Reply upload uses the existing authenticated multipart route. The client sends
the returned attachment IDs to `addComment`; the server transaction inserts the
comment and links only unlinked, same-ticket, same-uploader image attachments.
Failed comment submission cleans up staged attachment IDs where possible.
Admin detail returns comment attachments nested under each comment. User detail
returns ticket-level attachments and only non-internal comment attachments.

Close mutations are authorization-aware: admins can close any visible ticket,
and the owner can close their own tenant-scoped ticket. `addComment` and upload
reject closed tickets at the server boundary. A recurring server job closes
stale tickets idempotently; it must not reopen tickets or mutate attachment
history.

## UI/UX Contract

### Target User / JTBD

- Role: Feedback Hub admin and feedback ticket owner.
- Goal: Read pending work quickly, respond with visual evidence, and clearly
  finish a ticket.
- Entry point: `/admin/feedback-hub` for admins; My Feedback detail for owners.
- Success outcome: Images are legible/fullscreen, replies preserve their images,
  unread work is obvious and first, and closed work cannot be replied to.

### Existing Pattern Reference

- Searched: `AuthenticatedAttachmentImage`, `AdminFeedbackHub` lightbox,
  `AuthenticatedMediaImage`, `ImageSourcePicker`, existing notification modal.
- Found: protected media image wrapper and ticket lightbox already exist in
  `apps/web/client/src/components/feedback/AuthenticatedAttachmentImage.tsx`
  and `AdminFeedbackHub.tsx`.
- Decision: reuse.
- Reason: preserves authenticated storage behavior and established keyboard/
  dialog interaction; extend it to reply attachments rather than introducing a
  second preview system.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Admin list/detail | `AdminFeedbackHub.tsx`, `feedback.list/getTicket` | unread-first, larger images, reply gallery, close, alert |
| Admin reply composer | `AdminFeedbackHub.tsx`, `/api/feedback/upload`, `feedback.addComment` | multi-image selection/upload/link |
| User detail | `MyFeedback.tsx`, `feedback.myTicketDetail` | reply image gallery/lightbox, close control, closed state |
| Data model | `apps/web/drizzle/schema.ts`, migration | comment links and read receipts |
| Lifecycle worker | `apps/web/server/jobs/*`, server startup | five-day idempotent auto-close |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/spinner and disabled actions | component tests |
| empty | no tickets / no unread copy | component tests |
| unread | prominent badge/dot, sorted first | router/UI tests |
| overdue unread | generic center alert, no title | fake-timer tests |
| reply images selected | thumbnails, remove controls, count | component tests |
| upload/link error | toast, keep retryable draft where safe | mutation tests |
| closed | close label, reply/upload disabled | server + UI tests |
| image success | `object-contain` readable preview and lightbox | component tests/manual browser |
| focus/keyboard | labelled controls, arrows, Escape | accessibility/manual browser |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | single-column ticket/detail flow, horizontally safe image grid |
| tablet 768x1024 | compact two-panel layout or stacked detail without overflow |
| desktop 1440x900 | persistent left queue and spacious detail with 120px previews |
| small-mobile 360x800 | extended risk check for composer and alert buttons |
| laptop 1024x768 | extended check at two-panel breakpoint |
| wide-desktop 1280x800 | ensure detail images use available space without clipping |

### Accessibility Acceptance

- All image buttons have accessible names including filename/action.
- Close, attach, send, filter, lightbox navigation, and alert actions are
  keyboard reachable with visible focus.
- Escape closes the lightbox and alert; arrow keys navigate image sets.
- Alert does not trap the user away from the queue and has a clear primary action.
- Status colors are paired with text/icon, not color alone.
- Respect existing reduced-motion behavior; no new required animation.

### Visual Direction and Tokens

- Preserve current Feedback Hub density, shadcn primitives, neutral surfaces,
  semantic status colors, and existing protected-media wrapper.
- Use existing Tailwind/shadcn spacing/radius/color vocabulary; avoid raw new
  design tokens or unrelated visual restyling.
- Increase only attachment preview footprint and unread/closed hierarchy.

### Copy Contract

- Existing English UI remains supported; add concise Thai/English-compatible
  labels where the page currently mixes languages.
- Required concepts: `ยังไม่ได้อ่าน`, `รายการค้าง`, `ปิดงาน`, `งานนี้ปิดแล้ว`,
  `มีรายการ feedback ค้างที่ยังไม่ได้อ่านเกิน 2 ชั่วโมง`, `ไปอ่านรายการค้าง`.
- Alert must never interpolate ticket title, reporter email, or description.
- Upload/close failures remain generic and do not expose storage internals.

### Browser Evidence Required

Capture or manually inspect mobile 390x844, tablet 768x1024, and desktop
1440x900, plus extended laptop 1024x768 because the surface is a dense
two-panel admin workflow. Verify no console errors, no unintended horizontal
overflow, visible keyboard focus, reply images, fullscreen lightbox, closed
state, and generic overdue alert.

## Failure handling and security

- Missing/expired protected media remains a visible image-load error, never a
  public URL fallback.
- Tenant and owner checks remain server-side for list, detail, mark-read, close,
  upload, delete, and reply operations.
- Internal-note attachments are excluded from the user detail response.
- Staged uploads that cannot be linked are deleted best-effort and never become
  visible as reply attachments.
- Auto-close failures are logged with bounded counts and retried next schedule.

## Acceptance criteria

1. Existing ticket images are visibly about three times larger than the current
   40px preview and remain uncropped/readable.
2. Admin replies accept multiple image files, persist them under the reply, and
   render them for admin and owner with authenticated fullscreen lightbox access.
3. Unread state is per-admin, visible in the left queue, and unread is always
   ordered above read tickets.
4. Overdue unread alert is generic, repeats on a bounded cadence, and links to
   the unread queue.
5. Admin/owner close works; closed tickets reject reply and upload at API level.
6. A five-day inactivity job closes only eligible tickets and is idempotent.
7. Focused tests, typecheck/diff checks, and browser evidence are recorded;
   unrelated dirty work remains untouched.
