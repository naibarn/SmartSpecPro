# Detailed Interview - Agentic AI Workflow System

This document captures the detailed interview conducted to clarify requirements and design decisions for the Agentic AI workflow system with approval gates, skill marketplace, virtual flow builder, and AI secretary capabilities.

---

## Q1: Approval Flow Behavior

**Question**: For the approval gates in the video ad workflow (script → storyboard → images → videos), what should happen if a user requests changes at the images stage after already approving the storyboard? Should the system automatically invalidate the downstream videos and require re-rendering, or allow the user to decide which steps to redo?

**Answer**: Smart detection (recommended)

**Details**: Only invalidate if the changed images affect approved videos; otherwise preserve approvals.

**Implications**:
- Need dependency tracking between workflow steps
- System must detect which downstream items are affected by changes
- Preserve user work when possible (don't force unnecessary re-rendering)
- Requires intelligent diffing or explicit dependency declarations

---

## Q2: Virtual Flow Builder Scale and Sharing Model

**Question**: For the Virtual Flow Builder, what's the expected scale and sharing model? This affects whether we need collaborative editing features and how we structure permissions.

**Answer**: Marketplace + personal mix

**Details**: Public skill marketplace flows + private personal flows; users can fork and customize

**Implications**:
- Two-tier permission model: public (marketplace) and private (personal)
- Need forking mechanism (copy-on-write from marketplace to personal)
- Marketplace flows are read-only templates
- Users can customize forked copies without affecting originals
- Version control for forked flows (track source template)
- Discovery UI for browsing marketplace flows

---

## Q3: AI Secretary Calendar Integration Priorities

**Question**: For the AI Secretary calendar integration, which providers and features are highest priority for MVP? We can't build everything at once.

**Answer**:
- Google Calendar + Gmail (priority 1)
- Email classification + auto-response
- Proactive scheduling intelligence

**Details**: Start with Google ecosystem (most users likely have Google accounts), add smart email handling and AI-driven scheduling.

**Implications**:
- **Phase 1 (MVP)**: Google Calendar API, Gmail API, OAuth integration
- **Email Features**: AI classification (urgent/meeting/newsletter/etc.), auto-drafted responses with approval gates
- **Scheduling Features**: Optimal meeting time algorithm, conflict detection, proactive suggestions
- **Defer to Phase 2**: Microsoft Outlook/Teams integration
- Unified calendar API (Cronofy/Nylas) would help but start with direct Google API integration
- Need encrypted storage for OAuth tokens (already have crypto.ts for this)

---

## Q4: ChromaDB Scale Planning

**Question**: For ChromaDB and skill retrieval, what's the expected scale we need to plan for? This determines if we stay with ChromaDB or migrate to Qdrant/Pinecone.

**Answer**: Medium (10K-100K skills/docs)

**Details**: ChromaDB works but plan Qdrant migration path for later

**Implications**:
- **Start**: Use existing ChromaDB setup (already configured)
- **Monitor**: Track collection size and query performance metrics
- **Migration Trigger**: If we approach 50K documents or query latency >500ms
- **Migration Path**: Qdrant (best cost/performance balance)
- Keep ChromaDB adapter pattern to make migration easier
- Document backup/restore procedures for migration
- Add reranking layer NOW (works with both ChromaDB and Qdrant)

---

## Q5: Skill Marketplace Publishing Governance

**Question**: For the Skill Marketplace, who should be able to publish new skills and what's the quality control process? This affects security, user trust, and moderation workload.

**Answer**: Verified developers + admin review

**Details**: Users apply for developer status; their skills go through admin approval before public

**Implications**:
- **Developer Verification System**:
  - Application process (form with portfolio, GitHub, etc.)
  - Admin approval workflow for developer accounts
  - Developer role/permission in database
- **Skill Submission Process**:
  - Developers upload skill manifests + code
  - Enters admin review queue (approval_requests table)
  - Admin reviews: code security, documentation quality, test coverage
  - Admin can approve, request changes, or reject
  - Approved skills go to marketplace
- **Skill Manifest Requirements**:
  - JSON Schema validation
  - Tool allowlist compliance
  - Test coverage minimum (e.g., 70%)
  - Documentation completeness
- **Security Scanning**:
  - Static analysis for security vulnerabilities
  - Tool calls must be from allowlist
  - No arbitrary code execution
- **Marketplace UI**:
  - Show developer info
  - Rating/review system
  - Download counts, last updated
  - Version history

---

## Q6: Cost Control and Budget Management

**Question**: For cost control and budget management, what should happen when a user or organization exceeds their LLM usage budget? Need to balance user experience with cost protection.

**Answer**: Hard stop (safest)

**Details**: Block all LLM requests immediately; user must upgrade or wait for reset

**Implications**:
- **Budget Enforcement**:
  - Pre-check budget before any LLM request
  - Block request if insufficient credits
  - Clear error message: "Budget exceeded. Upgrade or wait for reset."
  - Link to upgrade/purchase page
- **Budget Types**:
  - Per-user budget (individual limits)
  - Per-organization budget (team/company-wide)
  - Per-feature budget (optional: limit specific features)
- **Budget Reset**:
  - Monthly cycle (first of month)
  - Or billing cycle based on user's plan
- **Budget Alerts**:
  - 70% threshold: warning notification
  - 90% threshold: urgent warning
  - 100% threshold: hard stop + notification
- **Admin Overrides**:
  - Admins can grant temporary budget increases
  - Log all override actions for audit
- **Grace Period** (Optional):
  - Allow completion of in-progress workflows
  - Block new workflow starts only
- **Cost Tracking**:
  - Real-time budget consumption display
  - Historical usage charts
  - Cost breakdown by feature/skill

---

## Q7: State Retention for Long-Running Workflows

**Question**: For long-running workflows (especially complex virtual flows), how long should we preserve execution state to allow resumption? Storage costs increase with duration.

**Answer**: 7 days (standard)

**Details**: Covers work week; reasonable for most use cases

**Implications**:
- **State Retention Policy**:
  - Active workflows: State kept indefinitely until completed/cancelled
  - Paused/interrupted workflows: 7 days retention
  - Completed workflows: Archive to cheaper storage, keep metadata
  - Failed workflows: 7 days retention for debugging
- **Cleanup Process**:
  - Daily job checks for expired states (>7 days old)
  - Soft delete first (move to archive table)
  - Hard delete after 30 days total
  - Notify user 24 hours before state expiration
- **Resume Workflow**:
  - Fetch state from PostgreSQL checkpoints
  - Validate all external resources still available
  - Resume from last successful checkpoint
  - If dependencies missing, notify user and offer partial resume
- **Storage Optimization**:
  - Compress old checkpoints (gzip JSON)
  - Store only essential state, not full message history
  - Separate hot (active) and cold (archive) storage
- **User Communication**:
  - Show retention time remaining in UI
  - "Resume before [date]" warnings
  - Option to export workflow state as JSON

---

## Q8: Testing Priorities

**Question**: Which feature areas are most critical for comprehensive testing coverage? We'll allocate testing resources accordingly.

**Answer**: All four areas selected:
- Approval gates & HITL workflows
- Cost calculation & budget limits
- Virtual flow execution engine
- Calendar/Email integration

**Details**: All are critical areas requiring comprehensive testing

**Implications**:
- **Approval Gates & HITL Testing**:
  - Unit tests: Approval request creation, voting, timeout handling
  - Integration tests: Full approval workflow from request → notify → respond → resume
  - E2E tests: User journey through UI approval flow
  - Edge cases: Concurrent approvals, expired approvals, conflicting votes
  - State persistence: Checkpoint/resume after approval
- **Cost Calculation & Budget Testing**:
  - Unit tests: Token counting, cost calculation per model, credit deduction
  - Integration tests: Budget check → request → cost tracking → budget update
  - Edge cases: Race conditions (concurrent requests), budget exhaustion mid-request
  - Accuracy validation: Compare calculated vs actual provider costs
  - Audit trail: Verify every request logged with cost
- **Virtual Flow Execution Testing**:
  - Unit tests: Node execution, edge routing, conditional branching
  - Integration tests: Multi-node flows, loops, error handling
  - E2E tests: Complex flows with approvals, branches, and parallel execution
  - Edge cases: Circular dependencies, infinite loops, deep recursion
  - State management: Checkpoint/resume at any node
  - Performance: Load testing with 100+ node flows
- **Calendar/Email Integration Testing**:
  - Unit tests: API wrappers, OAuth token handling, data parsing
  - Integration tests: Real API calls (sandbox/test accounts), webhook handling
  - E2E tests: Full scheduling flow, email classification pipeline
  - Edge cases: API rate limits, timeout handling, stale tokens
  - Data integrity: Ensure no data loss during sync, conflict resolution
  - Security: Token encryption, permission scoping
- **Testing Infrastructure**:
  - Maintain 80% coverage minimum (already enforced)
  - Separate test suites: unit (fast), integration (medium), e2e (slow)
  - CI/CD pipeline runs all tests on PR
  - Nightly runs for expensive e2e tests
  - Mock external APIs for unit/integration tests
  - Real APIs (test accounts) for e2e validation

---

## Q9: Error Handling for External API Failures

**Question**: When external API calls fail (image/video generation, calendar API, email API), what's the desired behavior? This affects user experience during outages or rate limits.

**Answer**: Auto-retry with exponential backoff

**Details**: Keep retrying (2-3 attempts) automatically; only show error if all retries fail

**Implications**:
- **Retry Strategy**:
  - Attempt 1: Immediate
  - Attempt 2: After 2 seconds
  - Attempt 3: After 8 seconds (2^3)
  - Total: 3 attempts over ~10 seconds
- **Retry Conditions**:
  - Transient errors: Network timeout, 5xx server errors, rate limits
  - Non-retryable: 4xx client errors (bad request, auth failure), 404 not found
- **Implementation Pattern**:
  ```python
  @retry(
      stop=stop_after_attempt(3),
      wait=wait_exponential(multiplier=2, min=2, max=10),
      retry=retry_if_exception_type((NetworkError, RateLimitError)),
      reraise=True
  )
  async def call_external_api(...):
      # API call logic
  ```
- **User Communication**:
  - Don't notify during retries (silent background retries)
  - Only notify if all 3 attempts fail
  - Error message should include: what failed, retry count, next steps
  - Log all retry attempts for debugging
- **API-Specific Handling**:
  - **Image/Video Generation**: Long-running, poll status, retry on timeout
  - **Calendar API**: Respect rate limits, use exponential backoff
  - **Email API**: Retry on network issues, queue if persistent failure
- **Circuit Breaker** (Optional but recommended):
  - After N consecutive failures, enter "open" state
  - Stop retrying for cooldown period (e.g., 5 minutes)
  - Periodically test if API recovered ("half-open" state)
  - Resume normal operation when successful ("closed" state)

---

## Q10: Notification Channels

**Question**: How should users be notified about workflow events (approvals needed, jobs completed, errors occurred)? Multiple channels might be needed.

**Answer**:
- In-app notifications only
- Browser push notifications
- Email notifications
- **Telegram**

**Details**: Multi-channel notification system with user preferences

**Implications**:
- **In-App Notifications**:
  - Bell icon with unread count
  - Notification panel/drawer
  - Real-time via WebSocket
  - Clickable to navigate to relevant item
  - Mark as read/unread
  - Clear all option
- **Browser Push Notifications**:
  - Request permission on first login
  - Use Web Push API
  - Work even when app closed
  - Respect user's browser settings
  - Desktop + mobile support
- **Email Notifications**:
  - Use existing email infrastructure
  - Configurable per user (frequency, types)
  - Options: Immediate, daily digest, weekly summary
  - Unsubscribe link in every email
  - Beautiful HTML templates
- **Telegram Notifications**:
  - **NOTE**: Telegram integration already exists in codebase!
    - Recent commits show: "feat: add Telegram Notifications to user Settings (section-08)"
    - "feat: implement Telegram user endpoints (section-06)"
  - User links their Telegram account
  - Bot sends notifications to user's Telegram
  - Support for inline actions (approve/reject from Telegram)
  - Rich formatting (markdown support)
- **Notification Types & Channels**:
  - Approval needed: All 4 channels (urgent)
  - Job completed: In-app + Push + Telegram
  - Job failed: In-app + Push + Email + Telegram
  - Budget warning: In-app + Email
  - System maintenance: In-app + Email
- **User Preferences**:
  - Per-channel enable/disable
  - Per-event-type channel selection
  - Quiet hours (no push/telegram during sleep)
  - Notification batching (group similar events)
- **Implementation**:
  - Notification service with queue (avoid blocking)
  - Template engine for consistent formatting
  - Delivery status tracking
  - Retry failed deliveries
  - User can view notification history

---

## Q11: Skill Versioning Strategy

**Question**: When a skill is updated in the marketplace (bug fixes, new features), what should happen to workflows currently using the old version?

**Answer**: Auto-upgrade on resume

**Details**: When resuming a paused workflow, use latest skill version

**Implications**:
- **Versioning Model**:
  - Skills use semantic versioning (MAJOR.MINOR.PATCH)
  - Each skill manifest includes version number
  - Historical versions stored in database
- **Upgrade Behavior**:
  - **During Execution**: Use pinned version (started with)
  - **On Pause/Resume**: Upgrade to latest version automatically
  - **Rationale**: Users get bug fixes and improvements automatically
- **Upgrade Notification**:
  - Show changelog modal when resuming with new version
  - "This workflow is upgrading from v1.2.0 → v1.3.0"
  - Display what changed (features, fixes, breaking changes)
  - User can proceed or cancel resume
- **Breaking Changes**:
  - Skill manifest declares breaking changes flag
  - If breaking change detected, prompt user for confirmation
  - Offer option to stay on old version (one-time exception)
  - Show migration guide if available
- **Version Compatibility**:
  - Skills declare compatible versions in manifest
  - System validates before upgrade
  - Block upgrade if incompatible (show error)
- **Rollback Support**:
  - If upgraded workflow fails immediately
  - Offer rollback to previous version
  - User can manually select old version from dropdown
- **Database Schema**:
  - `skills` table has current version
  - `skill_versions` table stores all versions
  - `workflow_executions` table references skill_version_id
  - When resuming, update to latest skill_version_id
- **Marketplace Display**:
  - Show version number and release date
  - "What's new" section for each version
  - Version history with changelogs
  - Download counts per version

---

## Summary of Key Decisions

### Architecture Decisions
1. **Approval Flow**: Smart invalidation of downstream dependencies
2. **Virtual Flows**: Marketplace (public templates) + Personal (private, forkable)
3. **AI Secretary MVP**: Google Calendar + Gmail only (defer Outlook/Teams)
4. **Scale**: 10K-100K documents, ChromaDB → Qdrant migration path

### Governance & Control
5. **Skill Publishing**: Verified developer program + admin review
6. **Budget Enforcement**: Hard stop at limit (no overages)
7. **State Retention**: 7 days for paused workflows
8. **Skill Versioning**: Auto-upgrade on resume with changelog notification

### Operational
9. **Error Handling**: 3 retries with exponential backoff (2s, 8s)
10. **Notifications**: 4 channels (in-app, push, email, Telegram)
11. **Testing**: Comprehensive coverage for all critical paths

### Technical Implementation Notes
- **Telegram Integration**: Already partially implemented in codebase (leverage existing work)
- **ChromaDB**: Already configured with hybrid RAG
- **Approval Gates**: Database models and service already exist
- **LangGraph**: Orchestrator already in place, needs PostgreSQL checkpointing
- **Encryption**: crypto.ts already handles AES-256-GCM for OAuth tokens
- **Testing**: 80% coverage already enforced via CI

---

## Open Questions (Resolved via Research)

These questions were answered by the research findings and don't need user input:

- ✅ **Database backend**: PostgreSQL (already in use)
- ✅ **State management**: LangGraph with PostgreSQL checkpointer
- ✅ **Vector DB**: ChromaDB already configured
- ✅ **Embedding models**: Use existing LLM proxy
- ✅ **Testing frameworks**: Vitest (JS) + pytest (Python) already set up
- ✅ **Queue system**: Celery (already configured with 3 queues)
- ✅ **Encryption**: crypto.ts + smartspecweb_crypto.py already handle this

---

## Next Steps

With this interview complete, we have clarity on all major architectural decisions. The next step is to write the initial specification document that combines:

1. The original specification (agentic_ai_chat_plan_v3.md)
2. Research findings (claude-research.md)
3. Interview decisions (this document)

This will form the basis for the detailed implementation plan.
