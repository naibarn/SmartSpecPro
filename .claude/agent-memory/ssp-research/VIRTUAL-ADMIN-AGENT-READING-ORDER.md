---
name: Virtual Admin Agent Research Documents - Reading Guide
description: Recommended reading order for Virtual Admin Agent research materials
type: project
---

# Virtual Admin Agent Research — Reading Guide

## TL;DR (5 minutes)

**Problem**: SmartSpecPro has great monitoring (queue health, service status, audit logs) but **no automation** when issues occur. Alerts logged; admins check dashboards manually. Response time: 30-60 minutes.

**Solution**: Virtual Admin Agent that polls every 60 seconds, detects issues via predefined rules, and either:
1. Auto-executes safe fixes (reset rate limiter, purge logs)
2. Escalates to human with 1-click approval in Slack (restart worker, etc.)

**Effort**: 22 hours total
- Core agent service: 6 hours
- UI dashboard: 4 hours
- Agency for complex decisions: 3 hours
- Testing + tuning: 2 hours
- Docs: 1 hour

**Cost**: ~$3/month (mostly diagnostics via GPT-4o-mini)

---

## Reading Path by Role

### For Architects / Tech Leads (30 minutes)

1. **START HERE**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
   - Sections to read: "Findings", "Current Architecture", "Risks", "Recommendation"
   - Skip: Options A/B/C details, Open Questions

2. **Then**: [VIRTUAL-ADMIN-AGENT-RESEARCH.md](VIRTUAL-ADMIN-AGENT-RESEARCH.md)
   - Sections to read: "Findings", "Risks"
   - Purpose: Understand what exists + what gaps exist

3. **Decision**: Is hybrid approach (polling + agency) acceptable?
   - If YES: Move to implementation checklist (Quick Ref)
   - If NO: Read Options A/B/C in detail to propose alternative

---

### For Backend Engineers (1 hour)

1. **START HERE**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
   - Read all sections (focus on "Implementation" and "Code locations")

2. **Then**: [VIRTUAL-ADMIN-AGENT-QUICK-REF.md](VIRTUAL-ADMIN-AGENT-QUICK-REF.md)
   - Sections: "Code Locations", "Implementation Checklist", "Decision Rules"
   - Purpose: Know what code to write and where

3. **Reference**: [VIRTUAL-ADMIN-AGENT-RESEARCH.md](VIRTUAL-ADMIN-AGENT-RESEARCH.md)
   - Read "Findings" section for architectural context
   - Keep open during implementation to cross-check

4. **Then**: Read existing code
   - `apps/web/server/services/queueHealthMonitor.ts` — how polling works
   - `apps/web/server/services/scheduler.ts` — how to integrate with scheduler
   - `apps/web/server/routers/queues.ts` — example tRPC admin router

---

### For Frontend Engineers (45 minutes)

1. **START HERE**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
   - Sections: "Notification Integration", "Implementation" (UI parts only)

2. **Then**: [VIRTUAL-ADMIN-AGENT-QUICK-REF.md](VIRTUAL-ADMIN-AGENT-QUICK-REF.md)
   - Sections: "Phase 2: Frontend UI", "Escalation Flow (Slack Approval)"

3. **Reference**: Look at existing admin dashboards for style/patterns
   - `/apps/web/client/src/pages/AdminQueues.tsx` — similar dashboard
   - `/apps/web/client/src/pages/AdminQueueDashboard.tsx` — chart/timeline examples

---

### For DevOps / Site Reliability (1 hour)

1. **START HERE**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
   - Sections: "Findings" (what exists), "Risks", "Success Criteria"

2. **Then**: [VIRTUAL-ADMIN-AGENT-QUICK-REF.md](VIRTUAL-ADMIN-AGENT-QUICK-REF.md)
   - Sections: "Threshold Tuning Checklist", "Troubleshooting", "Cost Estimate"

3. **Reference**: [VIRTUAL-ADMIN-AGENT-RESEARCH.md](VIRTUAL-ADMIN-AGENT-RESEARCH.md)
   - Section: "Open Questions" — discuss escalation targets, approval scope, maintenance windows

---

### For Product / Project Manager (20 minutes)

1. **START HERE**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
   - Sections: "Findings" (what exists now), "Risks", "Open Questions Requiring Product Input"
   - Skip: Options, implementation details

2. **Key Decision Points**:
   - Approval scope: which actions auto-execute vs. require approval?
   - Escalation targets: who gets notified (Slack, email, SMS, pagerduty)?
   - Budget enforcement: auto-pause workflows or just warn?
   - Maintenance windows: should agent skip actions during deployments?

---

## Document Purposes

| Document | Purpose | Audience |
|----------|---------|----------|
| **RESEARCH-BRIEF.md** | Executive summary; decision framework; implementation roadmap | Architects, PMs, all stakeholders |
| **RESEARCH.md** | Detailed findings; architecture diagrams; all 3 options; risks; gaps | Technical team; architects |
| **QUICK-REF.md** | Code locations; checklists; thresholds; pseudocode; troubleshooting | Engineers during implementation |
| **READING-ORDER.md** | This file; navigation by role | Everyone |

---

## Key Numbers to Remember

| Metric | Value | Notes |
|--------|-------|-------|
| **Polling frequency** | Every 60 seconds | Via existing scheduler |
| **Alert latency** | 90 seconds (3 polls) | To detect consistent issue |
| **Queue threshold** | >100 items + 3 consecutive increases | Tunable per environment |
| **Error rate threshold** | >5% in last 10 minutes | Tunable per environment |
| **Approval timeout** | 5 minutes (in Slack) | If not approved, escalation stays open |
| **Dedup window** | 15 minutes | Don't alert for same issue twice in 15 min |
| **Implementation effort** | 22 hours | 6 (core) + 4 (UI) + 3 (agency) + 2 (test) + 1 (docs) |
| **Monthly cost** | ~$3 | Mostly LLM diagnostics (GPT-4o-mini) |

---

## Decision Checklist

Before starting implementation, get stakeholder approval on:

- [ ] **Approval scope**: Is restarting 1 worker "auto-execute" or "requires approval"?
- [ ] **Escalation targets**: Post alerts to #smartspec-alerts Slack channel?
- [ ] **Budget enforcement**: If user hits budget, warn or auto-pause?
- [ ] **Maintenance windows**: Skip automated actions during 2am-6am deployments?
- [ ] **Alert frequency**: Is every 60 seconds acceptable? Cost 10% more server CPU?
- [ ] **Human approval**: Is 5-minute Slack approval window acceptable? (or require in-app approval?)
- [ ] **Action scope**: Can agent restart workers? Reset rate limiters? Clear queues?
- [ ] **Cost limit**: Monthly budget for diagnostics ($0-$10)?

---

## Common Questions

**Q: Why hybrid (polling + agency) instead of just polling?**
A: Polling handles 80% of issues (queue backlog, service restart) with zero cost. Agency handles 20% of edge cases requiring judgment (should we clear waiting jobs? adjust rate limits?). Together they avoid "false positive" escalations while keeping costs low.

**Q: Will this replace the admin dashboard?**
A: No. Agent provides **automated escalation + approval workflow**. Admin dashboard still needed for **manual diagnosis** and **historical analysis**. Agent is a time-saver for repetitive issues.

**Q: What if approval workflow fails (Slack down, admin doesn't respond)?**
A: Escalation stays open for 5 minutes. After timeout, auto-escalate to email + in-app notification. If still not approved, log as "timeout" and let admin decide later via dashboard.

**Q: Can the agent make bad decisions?**
A: Unlikely for simple rules (threshold checks). For complex decisions (via agency), LLM could hallucinate (e.g., "restart all systems immediately"). Mitigate: require approval for high-risk actions; use cheap model (GPT-4o-mini) for diagnostics; cap monthly spend.

**Q: Does polling every 60s add load?**
A: Minor. Each poll reads: queue lengths (Redis 5 calls), service status (syscalls/Docker API 11 calls), budget (1 DB query). Estimated: <50ms per cycle, <100 MB/month bandwidth. Negligible compared to LLM traffic.

---

## Next Steps

1. **Share** this research with engineering + product team
2. **Discuss** decision checklist (approval scope, escalation targets, etc.)
3. **Assign** implementation: 1 backend engineer (6h core) + 1 frontend engineer (4h UI)
4. **Schedule** kickoff meeting to review code locations + threshold tuning plan
5. **Set** delivery date: 1 week for core + UI, +3 days for agency + testing

---

## Questions or Issues?

- **Technical questions**: Ask backend team lead
- **Product questions**: Ask PM about escalation scope, approval workflow
- **Architecture questions**: Review Findings section of RESEARCH.md
- **Implementation stuck**: Check QUICK-REF.md troubleshooting section

