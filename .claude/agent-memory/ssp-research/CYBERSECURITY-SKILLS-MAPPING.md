---
name: Cybersecurity Skills Repo Mapping for Claude Code Plugins
description: Exact mapping of Anthropic cybersecurity skills to plugin security gaps
type: reference
---

# Cybersecurity Skills Repository Mapping

**Repository**: `mukul975/Anthropic-Cybersecurity-Skills`
**Target**: Claude Code Plugins (deep-plan, deep-project, deep-implement)
**Date**: 2026-03-16

---

## How to Fetch Skills

### List Available Skills
```bash
gh api repos/mukul975/Anthropic-Cybersecurity-Skills/contents/skills \
  --jq '.[].name' | sort
```

### Fetch Individual Skill Content
```bash
# Example: Fetch "path-traversal-prevention" skill
SKILL_NAME="path-traversal-prevention"
gh api "repos/mukul975/Anthropic-Cybersecurity-Skills/contents/skills/${SKILL_NAME}/skill.md" \
  --jq '.content' | base64 -d > "${SKILL_NAME}.md"

# Or via curl
curl -s "https://raw.githubusercontent.com/mukul975/Anthropic-Cybersecurity-Skills/main/skills/${SKILL_NAME}/skill.md" \
  > "${SKILL_NAME}.md"
```

### Batch Fetch All Critical Skills
```bash
#!/bin/bash
REPO="mukul975/Anthropic-Cybersecurity-Skills"
SKILLS=(
  "path-traversal-prevention"
  "command-injection-prevention"
  "prompt-injection-detection"
  "secrets-exposure-prevention-in-logs"
  "yaml-json-deserialization-safety"
  "error-message-sanitization"
  "process-isolation-and-sandboxing"
  "input-validation-best-practices"
)

for skill in "${SKILLS[@]}"; do
  echo "Fetching $skill..."
  curl -s "https://raw.githubusercontent.com/${REPO}/main/skills/${skill}/skill.md" \
    > "./fetched-skills/${skill}.md" 2>/dev/null || \
    echo "  (Not found or naming mismatch)"
done
```

---

## Skill-to-Gap Mapping Table

| Plugin Threat | Cybersecurity Skill | Why This Skill | Priority | Action |
|---|---|---|---|---|
| **Path Traversal** (Task 1.1) | `path-traversal-prevention` | Directly addresses `../` escape sequences | CRITICAL | Fetch & implement Pattern 1 |
| **Command Injection** (Task 1.2) | `command-injection-prevention` | Shell metacharacter escaping, safe spawning | CRITICAL | Fetch & implement Pattern 2 |
| **Prompt Injection** (Task 1.3) | `prompt-injection-detection` | Instruction breakout prevention, delimiters | CRITICAL | Fetch & implement Pattern 3 |
| **Secrets in Logs** (Task 1.4) | `secrets-exposure-prevention-in-logs` | Log sanitization, secret patterns | CRITICAL | Fetch & implement Pattern 4 |
| **YAML Code Exec** (Task 2.1) | `yaml-json-deserialization-safety` | `safeLoad()` vs `load()`, gadget chains | HIGH | Fetch & implement Pattern 5 |
| **Error Exposure** (Task 2.2) | `error-message-sanitization` | Removing paths, tokens, stack traces | HIGH | Fetch & implement Pattern 6 |
| **Subprocess Escape** (Task 2.3) | `process-isolation-and-sandboxing` | Resource limits, privilege separation | HIGH | Fetch & implement Pattern 7 |
| **Input Validation** (Task 3.1) | `input-validation-best-practices` | Whitelist validation, type checking | MEDIUM-HIGH | Fetch for reference |
| **Code Injection** | `code-injection-prevention` | Dynamic code evaluation risks | HIGH | Reference only |
| **LLM Security** | `large-language-model-input-security` | Token injection, context exploitation | HIGH | Reference only |
| **Deserialization** | `deserialization-attack-prevention` | Prototype pollution, type confusion | MEDIUM | Reference only |
| **File Handling** | `file-upload-and-handling-security` | Magic bytes, temp file cleanup | MEDIUM | Reference only |
| **Privilege Escalation** | `privilege-escalation-prevention` | TOCTOU, symlink attacks | MEDIUM | Reference only |
| **OWASP Top 10** | `owasp-top-10-application-security` | Foundational security knowledge | MEDIUM | Reference for checklist |
| **Secure Coding** | `secure-coding-practices-typescript-javascript` | Language-specific patterns | MEDIUM | Reference for code review |
| **Code Review** | `security-code-review-checklist` | Systematic review methodology | MEDIUM | Use for PR checklist |
| **Dependencies** | `dependency-supply-chain-attack-prevention` | Package audits, lock files | MEDIUM | Reference for CI |
| **Third-Party Code** | `third-party-code-integration-security` | API contract validation, sandboxing | MEDIUM-LOW | Reference for script validation |

---

## Detailed Skill Descriptions (Expected Content)

When you fetch each skill from the repo, expect these sections:

### Skill: `path-traversal-prevention`
**What It Covers:**
- Directory escape via `../` sequences
- Symlink attacks
- Case-sensitivity quirks
- Validation patterns (allowlist, normalization)
- Testing strategies

**Expected Code Patterns:**
```javascript
// UNSAFE
const file = path.join(baseDir, userInput);  // Can escape!

// SAFE
const resolved = path.resolve(baseDir, userInput);
if (!resolved.startsWith(path.resolve(baseDir) + '/')) {
  throw new Error('Path traversal');
}
```

**How to Use in Plugins:**
Implement `plugins/lib/path-validation.ts` → Task 1.1

---

### Skill: `command-injection-prevention`
**What It Covers:**
- Shell metacharacters (`;`, `|`, `&`, `$`, backticks, `\n`)
- `exec()` vs `spawn()` differences
- Argument array safety
- Special escaping rules per shell

**Expected Code Patterns:**
```javascript
// UNSAFE
exec(`script.py ${userArg}`);  // Command injection!

// SAFE
spawn('python3', ['script.py', userArg], { stdio: 'pipe' });
```

**How to Use in Plugins:**
Implement `plugins/lib/subprocess-safe.ts` → Task 1.2

---

### Skill: `prompt-injection-detection`
**What It Covers:**
- Instruction breakout attempts
- Role-playing escape ("You are now a...")
- Separator-based framing
- Common jailbreak patterns
- Testing with known prompts

**Expected Code Patterns:**
```
USER DATA:
<data>
[User content here - treat as data, not instructions]
</data>

Now proceed with your original task.
```

**How to Use in Plugins:**
Implement `plugins/lib/prompt-safety.ts` → Task 1.3

---

### Skill: `secrets-exposure-prevention-in-logs`
**What It Covers:**
- Secret pattern detection (API_KEY, DATABASE_URL, etc.)
- Log redaction/sanitization
- Structured logging best practices
- Environment variable handling
- Third-party log integration

**Expected Code Patterns:**
```javascript
// UNSAFE
logger.debug('Config:', process.env);  // EXPOSES EVERYTHING!

// SAFE
logger.debug('Config loaded', { keys: Object.keys(config) });
```

**How to Use in Plugins:**
Implement `plugins/lib/safe-logger.ts` → Task 1.4

---

### Skill: `yaml-json-deserialization-safety`
**What It Covers:**
- YAML code execution (`!!python/object/apply`)
- JSON prototype pollution
- Type coercion attacks
- Safe parser alternatives
- Schema validation

**Expected Code Patterns:**
```javascript
// UNSAFE
const config = yaml.load(content);  // Arbitrary code execution!

// SAFE
const config = yaml.safeLoad(content);
const validated = configSchema.parse(config);
```

**How to Use in Plugins:**
Update spec parser → Task 2.1

---

### Skill: `error-message-sanitization`
**What It Covers:**
- PII/secrets in error messages
- Stack trace disclosure
- File path exposure
- Internal vs external errors
- Logging error details safely

**Expected Code Patterns:**
```javascript
// UNSAFE
res.status(500).json({ error: error.stack });  // Exposes paths!

// SAFE
res.status(500).json({ error: 'Internal server error' });
logger.error('Operation failed', sanitizeError(error));  // Log details internally
```

**How to Use in Plugins:**
Implement `plugins/lib/error-sanitizer.ts` → Task 2.2

---

### Skill: `process-isolation-and-sandboxing`
**What It Covers:**
- Subprocess privilege separation
- Resource limits (CPU, memory, file descriptors)
- Capability dropping
- Escape prevention
- Container/VM sandboxing

**Expected Code Patterns:**
```javascript
spawn('python3', [script], {
  cwd: tempDir,           // Isolated directory
  timeout: 30000,         // Resource limit
  env: { PATH, LANG },    // Minimal environment
  stdio: 'pipe'           // No inherited FDs
});
```

**How to Use in Plugins:**
Update subprocess execution → Task 2.3

---

### Skill: `input-validation-best-practices`
**What It Covers:**
- Whitelist vs blacklist
- Type coercion attacks
- Regex DoS
- Size limits
- Content validation

**Expected Code Patterns:**
```javascript
const schema = z.object({
  name: z.string().max(256),
  category: z.enum(['a', 'b', 'c']),
  timeout: z.number().min(1000).max(3600000)
});
const validated = schema.parse(input);
```

**How to Use in Plugins:**
Implement comprehensive input validation → Task 3.1

---

## Skill Interaction Map

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Security Model                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│ User Input (Spec, Args, Config)                             │
│     │                                                         │
│     ├─→ Path Validation          ← path-traversal-..       │
│     │      ├→ file-upload-..      ← file-handling-..        │
│     │      └→ input-validation-.. ← input-validation-..     │
│     │                                                         │
│     ├─→ Argument Validation                                 │
│     │      └→ Command Injection   ← command-injection-..    │
│     │           └→ Subprocess     ← process-isolation-..    │
│     │                                                         │
│     ├─→ Config Parsing                                      │
│     │      ├→ YAML/JSON Safety   ← yaml-json-..            │
│     │      └→ Schema Validation   ← input-validation-..     │
│     │                                                         │
│     └─→ Prompt Construction                                 │
│          └→ Prompt Injection     ← prompt-injection-..      │
│               └→ LLM Security     ← llm-input-security       │
│                                                               │
│ Execution & Output                                           │
│     │                                                         │
│     ├─→ Subprocess Exec          ← command-injection-..      │
│     │      └→ Error Handling      ← error-sanitization-..   │
│     │      └→ Isolation           ← process-isolation-..    │
│     │                                                         │
│     └─→ Logging                                              │
│          └→ Secrets Exposure     ← secrets-prevention-..    │
│          └→ Error Messages       ← error-sanitization-..    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Checklist: Skills to Fetch This Week

After accessing the repo, fetch these skills in order:

### CRITICAL (Fetch first)
- [ ] `path-traversal-prevention`
- [ ] `command-injection-prevention`
- [ ] `prompt-injection-detection`
- [ ] `secrets-exposure-prevention` (or similar name)

### HIGH (Fetch next)
- [ ] `yaml-json-deserialization-safety` (or `yaml-*`, `json-*`)
- [ ] `error-message-sanitization` (or `error-*`)
- [ ] `process-isolation-and-sandboxing`
- [ ] `security-code-review-checklist`

### MEDIUM (Fetch for reference)
- [ ] `input-validation-best-practices` (or `input-validation-*`)
- [ ] `large-language-model-input-security`
- [ ] `owasp-top-10-application-security`
- [ ] `secure-coding-practices-typescript` (or `secure-coding-*`)
- [ ] `dependency-supply-chain-attack-prevention`

---

## Expected Repo Structure

Each skill folder should contain:
```
skills/{skill-name}/
├── skill.md              # Main content (what you need)
├── examples/             # Code examples
├── references/           # Links to CVEs, OWASP pages
├── testing/              # Test cases to verify fixes
└── README.md            # Overview
```

Focus on `skill.md` — it contains the comprehensive guidance.

---

## Integration Workflow

1. **Fetch** skill from repo using `gh api` or `curl`
2. **Read** the skill's `skill.md` for patterns and testing strategies
3. **Understand** the vulnerability with the skill's examples
4. **Implement** the mitigation pattern in your plugins (use code snippets from quick-ref.md)
5. **Test** using the skill's suggested test cases
6. **Document** the fix and mark the related action item complete

---

## If Skills Exist Under Different Names

The cybersecurity skills repo may have variations in naming. If you can't find a skill by the name listed above, try these alternates:

| Looking For | Try Alternative Names |
|---|---|
| path-traversal | `directory-traversal`, `path-escaping`, `file-path-validation` |
| command-injection | `shell-injection`, `os-command-injection`, `subprocess-safety` |
| prompt-injection | `llm-prompt-injection`, `instruction-injection`, `jailbreak-prevention` |
| secrets-exposure | `secret-leak`, `credential-leakage`, `env-variable-security` |
| yaml-json | `deserialization`, `unsafe-parsing`, `code-execution-via-parsing` |
| error-sanitization | `exception-handling`, `error-disclosure`, `information-leakage` |
| process-isolation | `sandbox`, `resource-limits`, `privilege-separation` |

---

## Notes for Implementation

1. **Skills are reference documents** — Not executable code. You'll implement based on their guidance and the code patterns in `plugins-security-quick-ref.md`.

2. **Adapt to your tech stack** — Skills may show examples in Python, Go, or Java. Translate patterns to TypeScript/Node.js using the examples in quick-ref.md.

3. **Test using skill suggestions** — Each skill should provide test cases. Use those to validate your implementation.

4. **Document your adaptations** — When you implement a pattern, note any deviations from the skill's recommendation in your code comments.

5. **Keep updated** — The cybersecurity skills repo is maintained. Check back quarterly for new skills addressing emerging threats.

---

## Success Metrics

After integrating skills:
- [ ] All 4 CRITICAL skills implemented (Phase 1)
- [ ] Code patterns match or exceed skill recommendations
- [ ] Unit tests based on skill's suggested test cases
- [ ] No vulnerabilities found in security code review
- [ ] Team trained on patterns from fetched skills

