---
slug: media-history
title: Media History
description: Find, review, download, and save generated images, videos, and audio before they expire.
icon: FileImage
section: content-creation
order: 35
pages: ["/media-history"]
tags:
  - "media history"
  - "generated media"
  - "download"
  - "library"
  - "prompt"
  - "image"
  - "video"
  - "audio"
  - "help"
  - "help/en"
  - "help/media"
aliases:
  - "media-history"
  - "Media History"
  - "Media History help"
---

# Media History

Media History is the place to review AI-generated images, videos, and audio from recent generation work. Use it to find previous outputs, download files, copy prompts, add useful results to your Library, and inspect failed or delayed tasks.

## What appears here

The page shows generation tasks from the recent retention window. Each item can include:

- the generated media preview
- media type: image, video, or audio
- task status such as pending, processing, completed, failed, or cancelled
- model name and prompt
- creation time and credits used
- Library status when the result has been saved for reuse

Important: Media History is temporary. The page keeps recent history for up to **12 days**, but some files depend on API provider storage rules and may expire earlier. Download important files or add them to your Library as soon as you know you want to keep them.

## Search and filters

Use the search box to find items on the current page by prompt, model, task ID, status, or error summary. Use **Type** and **Status** filters to narrow the list:

- **Type** filters image, video, or audio generations.
- **Status** helps you focus on completed work, in-progress jobs, failed tasks, or cancelled tasks.
- **Clear filters** resets search, type, status, and paging.

Use the page controls to move through older or newer entries within the retention window.

## List and Gallery views

Choose **List** when you need to compare many tasks quickly. The list view is best for status checks, task IDs, prompts, credits, and bulk selection.

Choose **Gallery** when visual review matters. Gallery cards prioritize the preview, prompt, model, and quick actions. Use **More actions** for secondary options such as Add to Library, Share, Full screen, Copy prompt, or provider result sync.

## Common actions

- **Details** — open the full task record, including provider/debug information when available.
- **Download** — open or download the generated file. Do this before the file expires.
- **Add to Library** — save a completed result for longer-term reuse and search.
- **Share** — available after the item has been added to the Library.
- **Full screen** — inspect image and video results at a larger size.
- **Copy prompt** — reuse the original prompt in Media Studio or Chat.
- **Retry generation** — for failed tasks, send the prompt back to Media Studio to try again.

## Failed, pending, or missing results

Some providers finish processing after the first status update. If a task has a provider task ID but no result URL, use **Fetch URL** or **Refetch URL** to sync the latest provider status. If the task failed, open **Details** to review the provider error summary, then retry with a clearer prompt or different settings.

## Best practices

- Save keepers to the Library, not only Media History.
- Download client-ready files immediately after approval.
- Copy strong prompts before experimenting with variations.
- Use filters to check failed or processing tasks at the end of a work session.
- Treat provider-hosted URLs as temporary, even when the 12-day retention notice is shown.

<!-- knowledge-graph:related:start -->
## Related Help

- [[media-generation|Image, Video, and Audio Generation]]
- [[document-management|Document Management]]
- [[gallery|Gallery]]
- [[video-editor|Video Editor]]
<!-- knowledge-graph:related:end -->
