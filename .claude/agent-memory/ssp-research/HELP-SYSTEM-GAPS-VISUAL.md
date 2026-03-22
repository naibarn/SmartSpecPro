---
name: Help System Coverage Gap Analysis
description: Visual breakdown of which pages have help and which don't
type: project
---

# Help System Coverage — Visual Gap Analysis

**Total Routes**: 77
**Routes with help**: 43 (56%)
**Routes WITHOUT help**: 34 (44%)

---

## By Feature Area

### Getting Started (1/1 = 100%)
```
✓ Home + Dashboard → getting-started
```

### Main App Features (28 routes)

```
Chat & Content Creation (9/28 = 32%)
├─ ✓ /chat                                    (chat, media-generation, skills, browser-session, presentations, memory, agencies, feedback)
├─ ✓ /media-studio                            (media-generation)
├─ ✓ /media-history                           (document-management)
├─ ✓ /document-management                     (document-management)
├─ ✗ /generate/:type?                         NO HELP (possibly deprecated)
├─ ✗ /settings/skills                         BROKEN HELP (skills topic links to /chat, not /settings/skills)
├─ ✓ /settings                                (settings, api-keys, memory)
├─ ✓ /settings/personas                       (settings, personas)
├─ ✓ /profile                                 (settings)
└─ ✗ /settings/skills                         BROKEN (see above)

Media & Presentations (5/28 = 18%)
├─ ✓ /gallery                                 (gallery)
├─ ✓ /presentations                           (presentations)
├─ ✗ /presentation-editor/:docId              NO HELP (editorial surface!)
├─ ✗ /presentation/:itemId/play               NO HELP (playback surface!)
└─ ✓ /video-editor                            (video-editor)

Agencies & Orchestration (3/28 = 11%)
├─ ✓ /agencies                                (agencies, marketplace)
├─ ✓ /agencies/templates                      (agencies, marketplace)
├─ ✓ /agencies/marketplace                    (marketplace)
├─ ✗ /agencies/:id                            NO HELP (agency chat!)
├─ ✗ /agencies/:id/edit                       NO HELP (agency editor!)
└─ ✗ /teams                                   NO HELP (NEW: Feature 044)
└─ ✗ /teams/:teamId                           NO HELP (NEW: Feature 044)

Workflows & Automation (4/28 = 14%)
├─ ✓ /workflows                               (workflows)
├─ ✓ /workflows/editor                        (workflows)
├─ ✓ /workflows/gallery                       (workflows)
├─ ✗ /workflows/editor/:id                    NO HELP (specific editor instance)
├─ ✓ /automation                              (automation)
├─ ✗ /automation/live/:sessionId              NO HELP (live session monitoring!)
├─ ✓ /webhook-triggers                        (webhooks)
└─ ✓ /groups (base)                           (groups)
└─ ✓ /groups/discover                         (groups)
└─ ✗ /groups/:groupId                         NO HELP (detail view!)

Credits & Analytics (4/28 = 14%)
├─ ✓ /credits                                 (credits)
├─ ✓ /usage                                   (usage-analytics)
├─ ✓ /tasks                                   (usage-analytics)
├─ ✓ /my-feedback                             (feedback)
├─ ✓ /dashboard                               (credits)

Misc Pages (3/28 = 11%)
├─ ✗ /factory                                 NO HELP (SaaS Factory)
├─ ✗ /terminal                                NO HELP (Terminal)
├─ ✗ /kilo                                    NO HELP (CLI)
├─ ✗ /docker                                  NO HELP (Docker Sandbox)
```

---

### Admin Pages (18/38 = 47%)

```
Monitoring & Health (2/8 = 25%)
├─ ✓ /admin/queues                            (admin-queues)
├─ ✓ /admin/queues/llm                        (admin-queues)
├─ ✓ /admin/queues/media                      (admin-queues)
├─ ✓ /admin/audit-logs                        (admin-audit)
├─ ✓ /admin/orchestration-logs                (admin-audit) ← WEAK: audit topic doesn't explain orchestration well
├─ ✗ /admin/dashboard                         NO HELP (Admin Overview)
├─ ✗ /admin/ops                               NO HELP (Ops Dashboard)
└─ ✗ /admin/funnel                            NO HELP (Funnel Analytics; mentioned in admin-advanced but vague)

User & Access Management (2/6 = 33%)
├─ ✓ /admin/users                             (admin-users)
├─ ✓ /admin/packages                          (admin-users)
├─ ✓ /admin/personas                          (admin-personas) ← BROKEN: frontmatter missing pages field
├─ ✗ /admin/channel-router                    NO HELP (only mentioned in admin-advanced; deserves own topic)
├─ ✗ /admin/tenants                           NO HELP (only mentioned in admin-advanced)
└─ ✗ /admin/approvals                         NO HELP (only mentioned in admin-advanced)

Model & Provider Management (2/8 = 25%)
├─ ✓ /admin/llm-providers                     (admin-providers)
├─ ✗ /admin/llm-models                        NO HELP (admin-providers lists only llm-providers)
├─ ✗ /admin/media-providers                   NO HELP (admin-providers lists only llm-providers)
├─ ✗ /admin/media-models                      NO HELP
├─ ✓ /admin/skills                            (admin-skills)
├─ ✓ /admin/skill-repositories                (admin-skills)
├─ ✓ /admin/agencies                          (admin-agencies)
└─ ✓ /admin/api-keys                          (api-keys)

Platform Settings (1/8 = 12%)
├─ ✓ /admin/settings                          (admin-settings)
├─ ✗ /admin/gallery                           NO HELP (Gallery Admin)
├─ ✗ /admin/content-quality                   NO HELP (only mentioned in admin-advanced)
├─ ✗ /admin/system-guardian                   NO HELP (only mentioned in admin-advanced; NEW: Feature 046)
├─ ✗ /admin/feedback-hub                      WEAK HELP (feedback + admin-advanced, but deserves detail)
└─ ✗ /admin/sandbox                           NO HELP (only mentioned in admin-advanced)

External Services (0/2 = 0%)
├─ ✗ Docker monitoring (external link)        NO HELP (external service)
├─ ✗ GlitchTip (external link)                NO HELP (external service)
```

---

### Domain Admin Pages (6/6 = 100%)
```
✓ /domain-admin                        (domain-admin)
✓ /domain-admin/theme                  (domain-admin)
✓ /domain-admin/content                (domain-admin)
✓ /domain-admin/users                  (domain-admin)
✓ /domain-admin/settings               (domain-admin)
✓ /domain-admin/blog                   (domain-admin)
```

---

### Marketing & Auth Pages (16/16 = 100% — intentional, no help needed)
```
Marketing: /, /pricing, /features, /docs, /contact, /about, /changelog, /careers, /community, /support, /status, /security
Auth: /login, /signup, /forgot-password, /verify-email, /auth/callback/*, etc.
Help Hub: /help, /help/:slug
```

---

## Coverage by Severity

### RED PRIORITY (Missing from Critical Surfaces)

1. **Presentation Editor** (`/presentation-editor/:docId`)
   - Status: NO HELP
   - Impact: Users directly editing slides; likely to need guidance
   - Why missing: Editorial sub-routes often overlooked

2. **Agency Chat** (`/agencies/:id`)
   - Status: NO HELP
   - Impact: Users running pre-built agencies; need to understand UI
   - Why missing: Sub-route of documented parent

3. **Agency Builder** (`/agencies/:id/edit`)
   - Status: NO HELP
   - Impact: Power users creating custom agencies; complex surface
   - Why missing: Advanced feature, assumed covered by parent

4. **Teams** (`/teams`, `/teams/:teamId`)
   - Status: NO HELP
   - Impact: NEW feature (Feature 044); users completely unfamiliar
   - Why missing: Not yet documented

5. **Live Automation Session** (`/automation/live/:sessionId`)
   - Status: NO HELP
   - Impact: Users monitoring active tasks; need real-time behavior explanation
   - Why missing: Real-time sub-route overlooked

---

### YELLOW PRIORITY (Incomplete or Vague Documentation)

1. **LLM Models** (`/admin/llm-models`)
   - Status: NO DEDICATED HELP
   - Issue: admin-providers only covers llm-providers, not models
   - Impact: Medium (admin feature)

2. **Media Models & Providers** (`/admin/media-models`, `/admin/media-providers`)
   - Status: NO HELP
   - Issue: Related to providers but completely absent from admin-providers topic
   - Impact: High (users need to configure media generation)

3. **Channel Router** (`/admin/channel-router`)
   - Status: VAGUE HELP (only in admin-advanced catch-all)
   - Issue: Mentions exist but no dedicated guidance
   - Impact: Medium (specialized admin feature)

4. **System Guardian** (`/admin/system-guardian`)
   - Status: NO HELP
   - Issue: NEW (Feature 046); only mentioned in menu
   - Impact: HIGH (critical for system health monitoring)

5. **Orchestration Logs** (`/admin/orchestration-logs`)
   - Status: VAGUE HELP (admin-audit bundles with audit-logs)
   - Issue: Logs are different; should have separate guidance
   - Impact: Medium (debugging tool)

6. **Skill Browser** (`/settings/skills`)
   - Status: BROKEN HELP
   - Issue: "skills" help topic links only to `/chat`, not `/settings/skills`
   - Impact: Medium (users can't find skill management help)

---

### GREEN (Covered — but could be more specific)

```
Fully covered but broad:
├─ /chat (8 different help topics reference it — could be more focused)
├─ /admin/advanced (11 pages crammed into one topic — should be split)
├─ /domain-admin (all 6 sub-routes covered by single topic — acceptable)
└─ /workflows (all 3 routes covered well)
```

---

## Feature Area Summary

| Feature | Coverage | Status |
|---------|----------|--------|
| Chat & Conversations | 70% | GOOD (missing /settings/skills) |
| Media & Presentations | 60% | POOR (missing editor + playback) |
| Agencies & Teams | 40% | POOR (missing /id, /id/edit, /teams) |
| Workflows & Automation | 70% | GOOD (missing live session) |
| Admin — Monitoring | 40% | POOR (missing dashboard, ops, funnel) |
| Admin — Users & Access | 33% | POOR (missing channel-router, tenants, approvals) |
| Admin — Models & Providers | 25% | POOR (missing media + llm models) |
| Admin — Settings | 12% | POOR (missing gallery, quality, guardian, feedback, sandbox) |
| Domain Admin | 100% | EXCELLENT |
| Credits & Analytics | 100% | EXCELLENT |

---

## Implementation Roadmap

### Phase 1: NEW FEATURES (Feature 044+)
**Estimate**: 34 hours English + 40 hours Thai translation = 74 hours

1. team-management.md (8h)
2. team-rooms.md (6h)
3. team-runs.md (6h)
4. scoped-memory.md (4h)
5. run-monitoring.md (6h)
6. automation-handoffs.md (4h)

### Phase 2: ADMIN COVERAGE (2-3 days)
**Estimate**: 20 hours

1. admin-llm-models.md (4h)
2. admin-media-models.md (4h)
3. admin-media-providers.md (4h)
4. admin-channel-router.md (4h)
5. Fix admin-personas.md frontmatter (0.5h)

### Phase 3: PRESENTATION & AGENCY SUB-ROUTES (1-2 days)
**Estimate**: 16 hours

1. presentation-editor-guide.md (4h)
2. agency-execution-guide.md (4h)
3. automation-live-session.md (3h)
4. Fix /settings/skills help mapping (1h)

### Phase 4: ADMIN DASHBOARDS (1 week)
**Estimate**: 24 hours

1. admin-dashboard-overview.md (3h)
2. admin-ops-dashboard.md (3h)
3. admin-funnel-analytics.md (3h)
4. admin-approvals.md (3h)
5. admin-tenants.md (3h)
6. admin-content-quality.md (3h)
7. admin-system-guardian.md (3h)
8. admin-sandbox.md (2h)

---

## Testing Checklist After Implementation

For each new topic:

- [ ] English .md file created in `en/`
- [ ] Thai .md file created in `th/`
- [ ] Frontmatter validated (all required fields present)
- [ ] `pages` field includes all relevant routes
- [ ] `icon` is valid Lucide name
- [ ] `section` matches manifest
- [ ] Manifest fetched with new topic visible: `GET /trpc/help.getManifest?locale=en`
- [ ] Topic fetched directly: `GET /trpc/help.getTopic?slug={slug}&locale=en`
- [ ] Contextual help works: `GET /trpc/help.getContextualTopics?page=/your-route&locale=en`
- [ ] Thai version also loads
- [ ] Search index includes it
- [ ] Markdown renders correctly (no broken links)
- [ ] Screenshots/examples (if any) are up-to-date

