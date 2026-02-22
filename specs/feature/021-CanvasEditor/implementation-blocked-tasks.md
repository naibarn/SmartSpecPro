# Implementation Blocked Tasks

| task_id | section | task | blocked_by | unblock_condition | status | owner_step | notes |
|---|---|---|---|---|---|---|---|
| canvas-stage-konva-runtime | section-01 / section-03 | Replace DOM stage scaffold with `react-konva` stage + layer rendering runtime | `react-konva` dependency not yet introduced in workspace toolchain | Add and validate `react-konva` dependency path, then wire stage rendering and interaction layer adapters | blocked | section-03-desktop-interactions-and-command-model | Section 03 landed command/selection/snap/keyboard model on DOM stage; runtime parity remains deferred until dependency unblock. |
