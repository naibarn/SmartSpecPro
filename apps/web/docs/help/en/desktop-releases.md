---
slug: desktop-releases
title: Desktop Releases
description: Download, upload, publish, and manage SmartSpecPro desktop installers
icon: Download
section: features
order: 67
pages: ["/dashboard", "/admin/desktop-host", "/domain-admin/desktop-host"]
tags:
  - "desktop"
  - "desktop releases"
  - "installer"
  - "download"
  - "admin"
  - "publish"
  - "release notes"
  - "help"
  - "help/en"
  - "help/runtime"
  - "runtime"
  - "desktop-releases"
aliases:
  - "desktop-releases"
  - "Desktop Releases"
  - "Desktop Releases help"
---

# Desktop Releases

## Overview

Desktop Releases is the installer distribution flow for SmartSpecPro Desktop Host.

It has two main surfaces:

- a **dashboard download panel** for end users who need the latest published installer
- an **admin release portal** for uploading, publishing, unpublishing, and deleting installer assets

## For end users

Published installers appear in the desktop release panel on the dashboard.

What you can do there:

- download the latest published installer for your platform
- see available platforms
- review version, platform, installer format, channel, and file size
- read release notes when provided

The panel tries to prioritize your current operating system automatically, then falls back to another published platform if needed.

## Supported platforms and formats

Platforms:

- Windows
- macOS
- Linux

Common installer formats:

- `exe`
- `msi`
- `dmg`
- `pkg`
- `deb`
- `rpm`
- `appimage`
- `zip`
- `tar_gz`

## Release channels

Desktop releases can be tracked by channel:

| Channel | Typical use |
|---|---|
| `stable` | General production installs |
| `beta` | Pre-release validation with a smaller audience |
| `nightly` | Fast internal iteration or engineering validation |

If your organization only wants production-ready installers, use the latest published `stable` release.

## For admins and domain admins

Desktop release management is available from the tenant desktop governance surface.

Typical admin tasks:

1. Open **Admin Desktop Host** or **Domain Admin Desktop Host**.
2. Go to the **Desktop Release Portal** section.
3. Upload the installer artifact.
4. Provide the version, platform, channel, and optional release notes.
5. Decide whether to publish immediately.
6. Publish, unpublish, refresh, or delete releases as needed.

## Upload workflow

When uploading a release, provide:

- installer file
- version
- platform
- channel
- installer format
- optional release notes
- whether the release should be published immediately

The UI infers the installer format from the filename where possible, but you can adjust it before upload.

## Publish vs hidden

Each release can be either:

- **Published**: visible to authenticated users in the release catalog
- **Hidden**: stored but not offered as the current published installer

Use hidden releases when:

- validating a build before broad rollout
- staging a beta or nightly asset
- preloading installers ahead of a scheduled launch window

## Deleting a release

Deleting permanently removes that release asset from the catalog. Use delete when:

- the wrong file was uploaded
- a build is invalid and should not remain available
- storage cleanup is required

If you may need the asset again later, unpublish it instead of deleting it.

## Security and access

- Viewing the release catalog requires an authenticated session.
- Upload, publish, unpublish, and delete actions require `admin`, `domain_admin`, or approved system-agent privileges.
- Downloads only expose unpublished releases to authorized admins.
- Download responses set attachment headers and content-type protection to reduce browser ambiguity.

## Best practices

- Use clear semantic versions such as `1.4.0` or `1.4.0-beta.2`.
- Include concise release notes for every published build.
- Keep `stable` reserved for builds that passed rollout checks.
- Upload the correct installer format for each platform instead of reusing generic archives where a native installer exists.
- Unpublish broken assets immediately, then upload a corrected build.

## Troubleshooting

### I cannot see any desktop release

- Sign in first. The catalog requires authentication.
- Confirm that at least one release is published.

### I only see one platform

- The panel shows only the currently published assets.
- Ask an admin to upload and publish the missing platform build.

### Upload failed

- Check the file size and retry.
- Confirm that version, platform, and file were provided.
- Make sure you have admin or domain-admin access.

### A release should not be public anymore

- Unpublish it if you want to keep the asset in storage.
- Delete it if it should be removed completely.

## Related guides

- [Desktop Host](./desktop-host.md)
- [Desktop Host Managed Mode](./desktop-host-managed-mode.md)

<!-- knowledge-graph:related:start -->
## Related Help

- [[desktop-host|Desktop Host]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
