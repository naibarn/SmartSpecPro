## Planning Depth

Chosen depth: `standard`

Reason:

- Crosses backend AI service, router, editor dialog, and tests.
- Still small enough to stay in quick-plan scope.

## Decisions

- Add a dedicated mutation `presentation.ai.repairSlideFromNote` rather than overloading auto layout.
- Use saved slide note as the canonical source; if the dialog is dirty, save first, then repair.
- Regenerate image media for the repaired slide using the same media-generation helpers used by Draft with AI.
- Apply the repaired slide through the same editor history restoration pattern used by auto layout so undo works.
