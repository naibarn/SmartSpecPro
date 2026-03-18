---
slug: terminal
title: Terminal
description: Desktop terminal emulator with multiple tabs
icon: Terminal
section: advanced
order: 71
pages: ["/terminal"]
tags: [terminal, shell, command, desktop, tauri, pty]
---

# Terminal

## Overview

The Terminal page provides a full-featured terminal emulator with multiple tabs, directly within the desktop app. Execute shell commands, run scripts, and manage your development environment without leaving SmartAIHub.

> **Desktop only** — This feature requires the Tauri desktop application. It is not available in the web browser.

## Using the terminal

1. Navigate to **Terminal** from the sidebar menu.
2. A default terminal session opens automatically.
3. Type commands and press **Enter** to execute.
4. Output is displayed in real-time with full ANSI color support.

## Managing tabs

- Click the **+** button to open a new terminal tab.
- Each tab runs an independent shell session (PTY).
- Click a tab to switch between sessions.
- Close a tab by clicking the **X** on the tab header.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+C` | Interrupt running command |
| `Ctrl+L` | Clear screen |

## Tips

- Use multiple tabs to run your dev server in one tab and tests in another.
- The terminal respects your system shell configuration (bash, zsh, etc.).
- Terminal sessions persist while the app is open but are cleared on restart.
