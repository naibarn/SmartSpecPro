---
slug: cli
title: CLI (Kilo)
description: Desktop file browser with Git integration
icon: Terminal
section: advanced
order: 72
pages: ["/kilo"]
tags: [cli, kilo, file-browser, git, editor, desktop]
---

# CLI (Kilo)

## Overview

Kilo is a desktop-only file explorer with built-in Git integration. Browse project files, read and edit content, search across directories, and check Git branch status — all within SmartAIHub.

> **Desktop only** — Requires the Tauri desktop application.

## Getting started

1. Navigate to **CLI** from the sidebar.
2. Set your **root path** — the base directory for file browsing. This is saved in your browser's local storage for future sessions.
3. The file tree loads automatically from the selected directory.

## File browsing

- **Tree view** on the left shows the directory structure.
- Click a file to open it in the built-in editor on the right.
- Files are syntax-highlighted based on their extension.
- Use the **search bar** to find files by name across the directory tree.

## Editing files

- Open any text file by clicking it in the tree.
- Make changes in the editor panel.
- Click **Save** or press `Ctrl+S` to write changes back to disk.
- Unsaved changes are indicated with a dot on the file tab.

## Git integration

- The status bar shows the current **Git branch**.
- Modified files are highlighted in the tree view.
- View basic Git status information without leaving the file browser.

## Tips

- Set your root path to your project directory for quick access to all project files.
- Use the search feature to quickly locate configuration files or specific modules.
- The editor supports common keyboard shortcuts (copy, paste, undo, find).
