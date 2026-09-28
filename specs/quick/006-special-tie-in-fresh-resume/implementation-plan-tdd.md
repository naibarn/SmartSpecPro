# TDD guidance

1. Add/adjust tests to model the page button opening the chooser rather than the editor.
2. Assert fresh selection passes `initialMode="fresh"` and prevents history hydration.
3. Assert resume selection passes `initialMode="resume"` and permits history hydration.
4. Assert `initialInput` still hydrates edit state even when mode is absent.
5. Assert closing the editor returns to the chooser entry state.

Use existing tRPC mocks and Testing Library conventions in the Vertical Drama page tests. Do not invoke paid jobs or mutate the database.
