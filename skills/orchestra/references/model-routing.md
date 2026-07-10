# Model Routing Policy

Use this reference whenever Orchestra runs inline work, dispatches a sub-agent, or
builds a Task Packet.

## Default: GPT-5.6 Terra

Use **GPT-5.6 Terra** (`gpt-5.6-terra`) for all normal Orchestra work. This is the
default for the conductor and every non-planning sub-agent, including implementation,
debugging, review, testing, security review, performance work, and retries.

## Planning Upgrade: GPT-5.6 Sol

Use **GPT-5.6 Sol** (`gpt-5.6-sol`) only when the assigned role's primary deliverable
is a plan or a decision framework. Planning includes architecture/decomposition,
specification, product/UX planning, acceptance criteria, wave planning, risk analysis,
and choosing an implementation approach before work begins.

Do not upgrade to Sol merely because execution work is complex, risky, security-sensitive,
or failed a test. Keep that work on Terra unless the user explicitly requests another
model. A planning agent may use Sol; the implementation, reviewer, and repair agents
that follow it return to Terra.

## Routing Rules

1. Start every normal inline task and non-planning sub-agent on Terra.
2. Route only planning-specific roles or packets to Sol.
3. Preserve an explicit user model request over this policy.
4. When a planning task contains both planning and implementation, split the work:
   planning packet on Sol, implementation packet on Terra.
5. A retry keeps the original packet's model unless the retry changes the role into a
   genuine planning task.

## Dispatch Metadata

Every dispatched sub-agent packet must include:

```text
model_preference: gpt-5.6-terra | gpt-5.6-sol | explicit:<model>
model_reason: terra-default | planning-upgrade | explicit-user-request | unavailable
```

When the active sub-agent tool supports a model override, pass the selected
`model_preference` as the actual override. When it does not, retain the metadata in the
Task Packet and record the limitation in `orchestra/progress.md`.

## Inline Work

Inline work follows the same policy: Terra by default, Sol only while producing a plan or
planning decision. Record the intended model preference when the host cannot switch the
inline model.
