# Workspace and project-open flow

## Goal

Selecting a folder establishes the local workspace and browses its contents. It
does not create or save a project. Creating a project remains an explicit action
through the New Project button.

## Interaction contract

- Selecting a folder, including the initial workspace folder, loads the folder
  contents.
- A project row is selectable with a single click; single click does not open or
  create a project.
- Double-clicking a project, or pressing Enter while its row is focused, opens
  it.
- If the selected workspace root contains exactly one recognized project file,
  it opens once automatically. Zero or multiple project files remain in the
  browser for explicit selection.
- Entering a child folder never triggers the single-project auto-open rule.
- The New Project action continues to create and save a new project in the
  chosen workspace, even if an existing project is present.

## Safety and validation

Auto-open is limited to the root-folder load and guarded by the normalized
workspace path so React refreshes and repeated callbacks cannot open the same
project repeatedly. Tests cover single-click selection, double-click opening,
keyboard opening, root auto-open, child-folder behavior, and multiple-project
behavior.
