# Plan Writing Guidelines

## What is the Implementation Plan?

The implementation plan (`implementation-plan.md`) is the central artifact of deep-plan. It's a self-contained prose document that describes **what** to build, **why**, and **how** - in enough detail that an engineer or LLM can implement it without guessing.

The plan is a **blueprint**, not a **building**. You describe the architecture; the implementer (human or `deep-implement`) writes the code. If it has code in it, it shouldn't amount to more than function stubs and docstrings.

---

## Required Inputs

Before writing the plan, these files will be in `{planning_dir}`:

| File | Contains | How to Use |
|------|----------|------------|
| `implementation-spec.md` | Synthesized requirements from user input, research, and interview | Primary source - this defines WHAT we're building |
| `research-notes.md` | Codebase patterns, web research findings (if research was done) | Inform architecture decisions, follow existing conventions |
| `interview-notes.md` | Q&A transcript from stakeholder interview | Clarify ambiguities, understand priorities and constraints |

**Read all three files before writing.** The plan should synthesize these inputs, not ignore them.

---

## Mandatory Safety and Change-Management Sections

`implementation-plan.md` must include these sections for every project:

1. **Impact and Regression Map**
- Identify existing functions/flows that can be affected.
- Describe blast radius and likely regression paths.
- Define regression prevention checks (test scope, rollout guardrails, monitoring).

2. **Data Safety and Migration Strategy**
- Classify data risk: `none`, `low`, `high`.
- For `low`/`high` risk, include backup plan before migration.
- Use non-destructive migration sequencing:
  - `expand schema` -> `migrate/backfill` -> `validate` -> `contract old path`.
- Include rollback/restore conditions and exact verification points.
- Require automated migration/backfill steps where data movement is needed.

3. **Backward Compatibility Plan**
- Explicitly preserve existing behavior unless intentionally changed.
- Define compatibility shims/dual-read-dual-write windows where needed.
- State how existing external URLs/assets/integrations continue to work.

4. **Post-Change Validation**
- Define acceptance checks for functionality, data integrity, and performance.
- Add post-migration reconciliation checks and mismatch handling.

If no data-risk exists, state why backup/restore is not required for this scope.

---

## Writing for an Unfamiliar Reader

The plan must be **fully self-contained**. An engineer or LLM with NO prior context should understand:
- What we're building
- Why we're building it this way
- How to implement it
- Crucially, the reader is a software engineer; you do not need to show them code implementations

**Do NOT assume the reader has seen:**
- The original user request
- The interview conversation
- The research findings
- Any context from this session

**Do NOT write for yourself.** You already know everything - the plan is for someone who doesn't.

---

## The Code Budget

LLMs instinctively write code when they see a feature request. This produces 25k+ token "plans" that are actually implementations - wasting context and doing `deep-implement`'s job.

## What Code IS Appropriate

- **Type definitions** (fields only, no methods)
- **Function signatures** with docstrings
- **API contracts** (endpoint paths, request/response shapes)
- **Directory structure** (tree format)
- **Configuration keys** (not full config files)

### GOOD Examples

```python
@dataclass
class CompanyData:
    name: str
    description: str | None
    industry: str | None
    employee_count: int | None
```

```python
def parse_company_page(html: str, url: str) -> CompanyData:
    """Extract company data from HTML using JSON-LD or HTML fallback.

    Returns CompanyData with populated fields, logs warning if <50% populated.
    """
```

```
src/
  scrapers/
    base.py          # Abstract scraper interface
    linkedin.py      # LinkedIn-specific implementation
    glassdoor.py     # Glassdoor-specific implementation
  parsers/
    json_ld.py       # JSON-LD extraction
    html.py          # HTML fallback parsing
```

---

## What Code is NOT Appropriate

- Full function/method bodies
- Complete test implementations
- Import statements
- Error handling code
- Validation logic
- Database queries
- API response handling

### BAD Examples

```python
# BAD - Full implementation
def parse_company_page(html: str, url: str) -> CompanyData:
    soup = BeautifulSoup(html, 'html.parser')
    json_ld = soup.find('script', type='application/ld+json')
    if json_ld:
        try:
            data = json.loads(json_ld.string)
            # ... 40 more lines
```

```python
# BAD - Full test
def test_json_ld_extraction():
    html = '<html><script type="application/ld+json">...</script></html>'
    result = parse_company_page(html, "https://example.com")
    assert result.name == "Acme Corp"
```

---

## Synthesizing Inputs

Your job is to transform the inputs into a coherent plan:

**From implementation-spec.md:**
- Extract the core requirements
- Note any constraints or preferences
- Identify the key deliverables

**From research-notes.md:**
- Follow existing codebase patterns (if applicable)
- Apply best practices from web research
- Note any technical constraints discovered

**From interview-notes.md:**
- Incorporate clarifications about scope
- Respect stated priorities
- Address concerns that were raised

**Resolve conflicts:** If inputs disagree, use your judgment and document the decision.
