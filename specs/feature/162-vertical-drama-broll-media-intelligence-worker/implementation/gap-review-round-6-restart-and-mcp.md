# Gap review round 6 — restart, MCP, and H3 capability safety

Rechecked root recovery, immutable frame references, MCP manifest validation,
H3 route selection, T2V/I2V/reference-to-video input requirements, and blocked
capability behavior. H3 cannot be inferred from model name or silently fall
back to another route; the manifest must advertise the exact route/workflow.

Result: no new static gap; live Comfy MCP/GPU execution remains an explicit
environment evidence gate.
