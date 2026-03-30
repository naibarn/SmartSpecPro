# Feature 060: Social Video Platform Expansion

## 1. Summary

Build provider support for TikTok and YouTube on top of the existing provider-neutral social background architecture.

This feature must support:

1. TikTok direct post and draft upload
2. YouTube upload, publish, and schedule
3. YouTube Shorts classification
4. workflow / agency background dispatch without UI dependency

## 2. Confirmed Constraints

1. TikTok direct post requires creator authorization and creator-info preflight.
2. TikTok unaudited clients are private-only.
3. TikTok verified-domain or verified-URL-prefix rules must be enforced for URL transfer.
4. YouTube uploads use `videos.insert`.
5. YouTube scheduling uses `status.publishAt`.
6. YouTube Shorts do not have a separate upload endpoint in the docs reviewed.

## 3. Architecture Direction

1. Extend the existing provider registry rather than branching into a new social subsystem.
2. Keep the background entry surface unified for Meta, TikTok, and YouTube.
3. Model provider capabilities explicitly so callers can avoid unsupported actions before enqueue.
4. Make Shorts a classification rule on the YouTube path.

## 4. Success Criteria

1. Background callers can publish to TikTok without opening the UI.
2. Background callers can upload and schedule to YouTube without opening the UI.
3. Background callers can classify YouTube Shorts correctly.
4. Unsupported provider actions fail predictably and do not corrupt job state.

