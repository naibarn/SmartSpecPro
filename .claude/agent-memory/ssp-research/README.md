# SmartSpecPro Research Agent Memory

Research briefs, architecture documentation, and integration guides for SmartSpecPro development.

## Contents

### 1. Research Brief: Agency-Swarm Integration (Main)
**File**: `RESEARCH_BRIEF_027_agency_swarm.md`

Comprehensive research brief covering:
- 8 sections of findings (node router, bridge, schema, Python service, adapter, credits, tools, router)
- Complete data flow analysis
- Multi-tenancy & security patterns
- Current architecture & risks
- Open questions & recommendations
- 60% complete status (sections 1–5 done, UI/streaming/templates TODO)

**Use this when**:
- Understanding the overall architecture
- Planning next sprint (Section-06 recommendations)
- Evaluating risks and mitigations
- Onboarding new team members

---

### 2. Architecture Summary (Visual Reference)
**File**: `ARCHITECTURE_SUMMARY.txt`

Quick reference guide with:
- 3-layer architecture diagram
- Data flow walkthroughs (message flow, credit deduction)
- Database schema overview (8 tables, 35 columns)
- Multi-tenancy & security patterns
- Design patterns summary
- Completion status
- Risk matrix

**Use this when**:
- Need a quick overview without reading full brief
- Explaining architecture to stakeholders
- Referencing table names/columns
- Understanding security patterns

---

### 3. Code Patterns & Examples
**File**: `CODE_PATTERNS.md`

Detailed code examples showing:
1. Node.js router pattern (sendMessage)
2. AgencyBridge pattern (executeRun)
3. Drizzle schema pattern (agencies table)
4. Python adapter pattern (create_agent)
5. Python service pattern (execute_run lifecycle)
6. Feature flag pattern (Node.js + Python)
7. Error classification pattern
8. Tool resolution pattern
9. Retry pattern with exponential backoff
10. Callback-based persistence (sketch)

**Use this when**:
- Building new sections (Section-06+)
- Copy-pasting patterns for new endpoints
- Learning the codebase
- Code review reference

---

### 4. Agency-Swarm Architecture (Detailed)
**File**: `agency-swarm-architecture.md`

Deep dive into:
- All components with method signatures
- Database schema field-by-field breakdown
- Data flow with exact function calls
- Design decisions rationale
- Testing patterns
- Integration points (LLM gateway, skills, workflows, sandbox)
- File path summary

**Use this when**:
- Implementing Section-06+ (cost reconciliation, streaming)
- Understanding exact API contracts
- Reviewing integration points
- Creating test fixtures

---

## Quick Navigation

### By Topic

**Architecture Overview**:
- Start with: `ARCHITECTURE_SUMMARY.txt`
- Deep dive: `RESEARCH_BRIEF_027_agency_swarm.md` (sections 1–3)

**Data Flow & Integration**:
- See: `RESEARCH_BRIEF_027_agency_swarm.md` (section 5)
- Code examples: `CODE_PATTERNS.md` (items 1–2, 5)

**Database Schema**:
- Quick ref: `ARCHITECTURE_SUMMARY.txt` (section 3)
- Details: `agency-swarm-architecture.md` (Database Schema section)
- Examples: `CODE_PATTERNS.md` (item 3)

**Patterns & Best Practices**:
- All patterns: `RESEARCH_BRIEF_027_agency_swarm.md` (section 7)
- Code examples: `CODE_PATTERNS.md` (all items)

**Multi-Tenancy & Security**:
- Summary: `RESEARCH_BRIEF_027_agency_swarm.md` (section 6)
- Detailed: `agency-swarm-architecture.md` (Key Design Decisions)

**Implementation Roadmap**:
- Current status: `RESEARCH_BRIEF_027_agency_swarm.md` (section 8)
- Recommendations: `RESEARCH_BRIEF_027_agency_swarm.md` (final section)

---

### By Role

**New Developer**:
1. Read: `ARCHITECTURE_SUMMARY.txt` (5 min overview)
2. Read: `RESEARCH_BRIEF_027_agency_swarm.md` sections 1–3
3. Skim: `CODE_PATTERNS.md` to get a feel for code style
4. Reference: `agency-swarm-architecture.md` as needed

**Architect/Reviewer**:
1. Read: `RESEARCH_BRIEF_027_agency_swarm.md` (full)
2. Check: Risks & recommendations (section 9)
3. Reference: `agency-swarm-architecture.md` for technical details

**Implementer (Sections 06+)**:
1. Review: Current section in `RESEARCH_BRIEF_027_agency_swarm.md`
2. Copy patterns from: `CODE_PATTERNS.md`
3. Reference: `agency-swarm-architecture.md` for exact API contracts
4. Use: `ARCHITECTURE_SUMMARY.txt` for quick lookups

---

### By File

| File | Size | Purpose | Read Time |
|------|------|---------|-----------|
| `RESEARCH_BRIEF_027_agency_swarm.md` | ~25KB | Comprehensive research brief | 30–45 min |
| `ARCHITECTURE_SUMMARY.txt` | ~15KB | Visual reference guide | 10–15 min |
| `CODE_PATTERNS.md` | ~12KB | Detailed code examples | 15–20 min |
| `agency-swarm-architecture.md` | ~18KB | Deep technical dive | 20–30 min |
| `README.md` | This file | Navigation guide | 5 min |

---

## Key Stats

**Architecture Coverage**:
- Node.js endpoints: 12 tRPC procedures + 1 HTTP bridge
- Python endpoints: 5 FastAPI routes
- Database tables: 6 Drizzle + 2 SQLAlchemy = 8 total
- Column definitions: 35+ fields
- Design patterns: 10 core patterns documented
- Code examples: 10 detailed examples with line numbers

**Implementation Status**:
- Complete: Sections 01–05 (core functionality)
- In Progress: Section-06 (cost reconciliation)
- Planned: Sections 07–12 (UI, streaming, templates)
- Blockers: None identified

**Risk Coverage**:
- 6 major risks identified
- 8 mitigations documented
- Error classification: 3 types (transient/permanent/optional)
- Retry logic: 3x attempts with exponential backoff (1s, 2s, 4s)

---

## Related Documents

**In this directory**:
- `RESEARCH_BRIEF_027_agency_swarm.md`
- `ARCHITECTURE_SUMMARY.txt`
- `CODE_PATTERNS.md`
- `agency-swarm-architecture.md`
- `README.md` (you are here)

**In root CLAUDE.md**:
- Full project conventions (TypeScript, Python, SQL, Git)
- Debugging protocols
- Deployment rules
- Service management

**In code**:
- Tests: `apps/web/server/routers/__tests__/agency.test.ts`
- Tests: `apps/web/server/services/__tests__/agencyBridge.test.ts`
- Spec: `specs/feature/027-AgencySwarm/spec.md`

---

## Maintenance & Updates

**When to update this memory**:
- After implementing Section-06+ (add findings to briefs)
- When design decisions change (update all 4 docs)
- After major refactoring (sync file paths + code examples)
- When new risks are discovered (add to risk matrix)

**How to update**:
1. Edit the appropriate file(s)
2. Update cross-references in `README.md`
3. Keep code examples in sync with actual implementation
4. Maintain table of contents accuracy

**Version**:
- Created: February 27, 2026
- Status: Research complete, implementation ~60%
- Last updated: February 27, 2026

---

## Questions & Support

**For architecture questions**:
- See: `RESEARCH_BRIEF_027_agency_swarm.md` (section 9: Open Questions)

**For implementation questions**:
- See: `CODE_PATTERNS.md` (exact patterns + line numbers)

**For debugging**:
- See: `agency-swarm-architecture.md` (Integration Points section)

**For risks/mitigations**:
- See: `RESEARCH_BRIEF_027_agency_swarm.md` (section 8: Risks)

---

## Next Steps

**Immediate (Next Sprint)**:
1. Verify Sections 1–5 complete and tests passing ✓
2. Implement Section-06 (Cost reconciliation)
3. Implement Section-07 (SSE streaming + heartbeat)

**Medium-term (Following Sprints)**:
4. Implement Sections 08–10 (Frontend, visual builder, workflow integration)

**Long-term (Rollout)**:
5. Implement Sections 11–12 (Admin observability, templates)
6. Gradual feature rollout to beta users

---

**Happy coding!** Refer back to these docs whenever you need clarity on the agency-swarm integration.
