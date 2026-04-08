---
slug: local-ai
title: Local AI
description: Complete guide for Local LLM settings, models, chat, skills, image assist, OCR, and voice
icon: Cpu
section: features
order: 66
pages: ["/settings"]
tags:
  [
    local ai,
    local llm,
    local llm chat,
    gemma 4,
    gemma4,
    on-device ai,
    settings,
    local runtime,
    browser local,
    tauri local,
    local voice,
    local ocr,
  ]
---

# Local AI

## Overview

Local AI lets SmartSpecPro run selected LLM tasks on your device with Gemma 4 instead of always calling a cloud LLM provider.

The feature is designed around three ideas:

- keep normal cloud chat working exactly as before when Local AI is off
- let each user opt in through **Settings > Local AI**
- let supported chat sessions and local-safe text skills run with a local model on **Web** or **Desktop**

Open **Settings > Local AI** to configure it. The section now includes a dedicated **Help** button that opens this guide.

## What Local AI changes

When Local AI is enabled and a supported runtime is ready:

- general text chat can run with a local Gemma 4 model
- short microphone transcription can run locally
- selected local-safe text skills can use the local model
- image understanding and OCR assist can use local or hybrid assist paths
- summaries and context compaction can use local processing

## What stays on the normal server path

Local AI does **not** turn SmartSpecPro into a serverless app.

These parts still use the SmartSpecPro server as normal:

- saving chat history
- database writes
- RAG and server-side memory storage
- auth, tenant policy, auditing, and feature flags
- team/workspace data

Also, the following stay on their existing cloud or API path even when a chat session is set to local:

- image generation
- video generation
- media generation that depends on external providers
- any request that is explicitly cloud-only

## Web vs Desktop

## Web

Web Local AI depends on browser runtime support, secure context, worker support, WebGPU readiness, and a prepared `.web.task` model.

Use Web Local AI when you want:

- local text replies
- local summaries
- local context compaction
- local image assist on supported browsers
- local voice transcription on supported browsers

## Desktop

Desktop Local AI runs through the Tauri runtime and LiteRT-LM path. Desktop is the stronger option for:

- more reliable local text chat
- local-safe skill execution
- hands-free voice mode
- wake phrase support
- native local voice readback
- managed model install, verify, repair, update, and remove flows

## Optional localhost Local AI backend

If the built-in browser or desktop Gemma runtime is not the right fit for your machine, SmartSpecPro can also use a loopback-only OpenAI-compatible multimodal backend running on the same device. Treat this as a Local AI backend for the current machine, not as part of your cloud provider list.

Typical examples:

- `http://localhost:8000`
- `http://localhost:8000/v1`
- `http://localhost:8000/v1/chat/completions`

Configure it in **Settings > Local AI > Local Engine**.

In that panel, first choose which Local AI engine this device should use:

- **Auto**: prefer the localhost backend when it is configured and healthy, then fall back to on-device Gemma when supported
- **On-device Gemma**: use only the prepared Gemma model on this machine for supported local tasks
- **Localhost backend**: use only the localhost multimodal backend for supported local tasks

Required fields:

- **Base URL**
- **Model**

Optional fields:

- **Bearer token**
- **Request timeout**

SmartSpecPro only allows loopback addresses such as:

- `localhost`
- `127.0.0.1`
- `::1`

This backend can be used in place of on-device Gemma 4 for:

- general local text chat
- summaries
- context compaction
- image understanding
- OCR assist
- local-safe text skills

When your localhost server accepts OpenAI-compatible multimodal messages, SmartSpecPro can send both:

- `text`
- `image_url`

This backend does **not** replace:

- image generation
- video generation
- cloud-only tools
- server persistence, auth, RAG, or database writes

## Before you start

Make sure all of the following are true:

1. Your tenant allows Local AI.
2. Your device is supported.
3. You enabled Local AI in **Settings > Local AI**.
4. You prepared at least one Gemma 4 profile for the current surface.

If your tenant disables Local AI or forces cloud-only routing, the settings stay visible for explanation, but the active chat path stays cloud-based.

## User Settings

Open **Settings > Local AI**.

The page has two groups:

- **Synced account preferences**
- **This device only**

## Synced account preferences

These follow your user account across supported surfaces.

### Enable

Turns Local AI on or off for your account.

- Off: cloud behavior stays normal
- On: your runtime mode and profile preferences can apply where supported

### Execution mode

- **Off**: disable Local AI for your account
- **Auto**: let SmartSpecPro decide when local execution is a good fit
- **Prefer local**: use local first when supported, then fall back when allowed
- **Local only**: do not call a cloud LLM provider for supported local tasks in that scope
- **Cloud only**: keep chat on the normal cloud route even when local runtime is ready

### Default local profile

Choose the default Gemma 4 profile for the current user.

Typical examples:

- `gemma4-e2b-web-fast`
- `gemma4-e4b-web-balanced`
- desktop Gemma 4 profiles bundled or prepared on Tauri

### Use for general chat

Lets SmartSpecPro use Local AI for plain text chat when the request is eligible.

### Use for summaries

Lets SmartSpecPro use Local AI for:

- summarization
- context compaction
- older message condensation

### Use for image understanding and OCR assist

Lets SmartSpecPro use Local AI for:

- screenshot explanation
- receipt pre-read
- scene understanding
- OCR cleanup and interpretation assist

This does **not** mean all image/media generation becomes local.

### Voice input mode

- **Legacy STT**: use the existing microphone transcription path
- **Gemma 4 local**: require local transcription on the current device
- **Auto**: try local when supported, then fall back where allowed

Important:

- explicit **Gemma 4 local** should fail closed instead of silently switching to third-party STT
- **Auto** may still fall back on unsupported devices

### Enable short voice commands

Lets the chat input treat short spoken requests as assistant commands, such as:

- “open chat”
- “search restaurants near me”
- “read my unread notifications”

### Voice readback mode

- **Off**
- **Important only**
- **All responses**

Voice readback is the assistant speaking short confirmations or answers back to you.

### Voice readback language

Optional.

Leave it blank to let the device choose automatically, or enter a language tag such as:

- `th-TH`
- `en-US`

### Voice readback rate

Adjust how quickly spoken responses are read back.

### Read back only voice-command responses

Limits voice readback so it mostly responds to assistant-like spoken interactions instead of every chat answer.

### Use location context for “near me” searches

Lets voice search interpret requests like:

- “restaurants near me”
- “find coffee shops nearby”

with local location context when the surface supports it.

### Hands-free mode

Desktop only.

- **Off**
- **Wake phrase**

### Wake phrase

Desktop only.

Example:

- `hey smartspec`

The runtime will only arm wake phrase mode when local voice is actually ready.

## This device only

These settings are scoped to:

- tenant
- user
- runtime surface

That means Web and Desktop can have different prepared models even for the same account.

### Allow model downloads on this device

Turns device-side model installation on or off.

### Prefer Wi-Fi / unmetered downloads

Useful for large Gemma 4 downloads.

### Storage budget

Sets how much local storage SmartSpecPro can use for models on this device.

## Model management

The exact controls differ between Web and Desktop.

## On Web

Web can cache a browser model for Local AI.

Available actions:

- **Cache selected model**
- **Remove selected model**
- **Pause download**
- **Resume**
- **Retry**

Web shows:

- download progress
- downloaded size
- capability blockers
- eligible text and voice profiles

## On Desktop

Desktop uses the managed LiteRT-LM path.

Available actions:

- **Prepare selected model**
- **Remove selected model**
- **Verify**
- **Repair**
- **Update**

Desktop may also show whether a model is:

- bundled with the app
- installed on this device
- set as the default profile

## Bundled vs on-demand models on Desktop

Desktop builds can ship in different bundle modes:

- runtime-only, with models downloaded on demand
- bundled with one or more Gemma 4 profiles

If a model is bundled:

- it usually cannot be removed like a normal downloaded model
- the UI shows it as bundled

## Runtime diagnostics

The Settings page includes a diagnostics panel so users can see whether Local AI is ready.

## Web diagnostics include

- secure context
- WebGPU exposed or not
- adapter ready or not
- device ready or not
- eligible text profiles
- eligible voice profiles
- voice readback availability
- current blockers

## Desktop diagnostics include

- runtime availability
- Gemma 4 text readiness
- Gemma 4 voice readiness
- LiteRT-LM path
- bundled profiles
- installed profiles
- voice readback availability
- current runtime notes

## Chat usage

Local AI works at more than one level in chat.

## Account-level behavior

Your account-level Local AI settings define the default behavior for new conversations.

## Per-session behavior

Individual chat sessions can override the account default.

Supported session concepts include:

- follow account default
- force local
- force cloud

You can change this from the main chat header through the **Chat Local AI** control, or from **Skill Settings** for the current conversation.

If you enable the local session override, that session can use a local LLM for supported text replies without using a cloud LLM provider.

## Important distinction

A **local chat session** means:

- the response LLM is local for supported text tasks
- local-safe text skills can also prefer local

It does **not** mean:

- the server stops saving messages
- RAG disappears
- database writes stop

SmartSpecPro can still persist the conversation on the server while keeping the eligible LLM answer path local.

## Skill behavior in local sessions

Session-level local override also affects supported local-safe text skills.

Examples of skill categories that may run locally when allowed:

- prompt writing
- article drafting
- rewrite
- summarization
- evaluator-style text analysis
- translation
- JSON extraction

Examples that stay on their normal non-local path:

- image generation
- video generation
- cloud media tools
- other provider-dependent media APIs

## Slash skills and explicit selection

When a session is set to local-only, SmartSpecPro avoids using cloud LLM skill detection for that session where necessary.

Best practice:

- explicitly choose a skill when you know which one you want
- use slash commands for local-safe text workflows

## Voice and microphone

Local AI supports microphone workflows in both Web and Desktop, with Desktop generally being more capable.

## Microphone button

The mic / record button can:

- capture short dictation
- transcribe spoken input into text
- feed that text into chat
- optionally interpret short voice commands

Depending on your settings, the microphone path can use:

- legacy STT
- Gemma 4 local transcription
- auto mode

## Voice commands

Short assistant-like commands can be routed into actions such as:

- opening the chat interface
- searching with location context
- drafting a message
- reading notifications

Important actions should still require confirmation where appropriate.

## Voice readback

Voice readback can:

- speak short confirmations
- read important replies
- read more responses when enabled

Desktop may use a native readback backend. Web may use browser speech synthesis where available.

## Hands-free mode

Desktop can support hands-free listening with a wake phrase when the runtime is ready.

## Images and OCR

Local AI can assist with image understanding and OCR-related flows.

## Local image understanding

Examples:

- explain a screenshot
- describe a scene
- pre-read a receipt
- summarize what is visible before a deeper workflow runs

## Hybrid OCR

Some OCR flows are hybrid:

1. OCR engine extracts text
2. Local Gemma 4 helps interpret, clean up, or summarize the result

This is useful for:

- receipts
- screenshots
- image-heavy documents
- scanned text cleanup

## What Local AI does not promise for OCR

Local AI image assist is not a guarantee that every document workflow becomes fully local or fully offline.

Document, workspace, and provider constraints can still apply depending on the task.

## Privacy and routing expectations

Use these rules to understand behavior correctly:

- **Local AI off**: use the normal cloud path
- **Cloud only**: use the normal cloud path
- **Prefer local**: local first when supported, cloud fallback may still happen
- **Local only**: supported local tasks should not call a cloud LLM provider

For voice:

- **Gemma 4 local** should fail closed if local transcription is unavailable
- **Auto** may fall back

For chat sessions:

- session local mode affects supported local-safe text replies and local-safe text skills
- media generation remains on its existing route

## Troubleshooting

## “The model is not ready”

Go to **Settings > Local AI** and:

- choose a default profile
- prepare or cache the model
- verify the model on Desktop if needed

## “Local voice is unavailable”

Check:

- the selected voice input mode
- whether the current profile supports voice
- browser or desktop runtime readiness
- diagnostics blockers in Settings

## “This request cannot run in local-only mode”

Possible reasons:

- the request needs a cloud-only tool
- the active skill is not local-safe
- the current device has no ready model
- the request depends on media generation

Try:

- switching to **Auto** or **Prefer local**
- removing unsupported attachments
- explicitly choosing a local-safe text skill

## “Browser model download is blocked”

Check:

- secure context
- WebGPU support
- storage budget
- device download permission

## “Desktop model seems broken”

Try:

- **Verify**
- **Repair**
- **Update**

in **Settings > Local AI**

## Best practices

- Start with **Auto** if you are new to Local AI.
- Use **Prefer local** when you want stronger local usage but still want fallback safety.
- Use **Local only** only when you understand that unsupported tasks will fail instead of silently switching to cloud.
- Keep at least one prepared Gemma 4 profile on each surface you use often.
- Use explicit skill selection for important local-only workflows.
- Use the diagnostics panel whenever Local AI behavior seems different from what you expect.

## Quick examples

## General local chat

1. Enable Local AI.
2. Choose a default Gemma 4 profile.
3. Prepare the model for Web or Desktop.
4. Turn on **Use for general chat**.
5. Open a chat session and switch that session to local when needed.

## Local voice dictation

1. Set **Voice input mode** to **Gemma 4 local** or **Auto**.
2. Prepare a voice-capable Gemma 4 profile.
3. Use the mic button in chat.

## Image + OCR assist

1. Turn on **Use for image understanding and OCR assist**.
2. Prepare a supported profile.
3. Attach an image, receipt, or screenshot in chat.
4. Let SmartSpecPro use local or hybrid assist where eligible.
