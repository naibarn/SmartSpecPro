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

- download any latest published installer, including an installer for another machine
- see available platforms
- review version, platform, installer format, channel, and file size
- read release notes when provided

The panel shows Windows, macOS, and Linux releases together. It highlights the
native macOS DMG when one is published, while keeping the other platform
downloads available for users who manage more than one machine. The Worker App
inside a desktop installation only checks its matching platform/architecture
for self-update.

For normal macOS Worker App installation, use the native Apple Silicon DMG.
The macOS source ZIP is a developer fallback for building on a Mac and is not
the normal end-user installer.

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

## Trigger a build from the UI

Admin Desktop Host dispatches the workflow manually and imports the release assets into the SmartAIHub catalog. End users do not need to open GitHub or know the repository.

Before triggering a build, configure GitHub in the **Release source** panel:

1. In GitHub, open the build repository and go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Set the **Resource owner**, choose **Repository access → Only select repositories**, and select the repository entered in SmartAIHub.
3. Under **Repository permissions**, set `Actions` to **Read and write** and `Contents` to **Read-only**, then click **Generate token**.
4. Copy the token immediately, paste it into **GitHub access token** in SmartAIHub, then click **Save configuration** and **Test GitHub connection**.
5. Enter the repository such as `naibarn/SmartSpecPro`, workflow `desktop-release.yml`, and ref `main`, then queue the build.

`Contents: Read-only` is required because SmartAIHub reads and downloads the release assets after the workflow finishes. A token with only `Actions: write` can queue a successful build, but the portal catalog will remain empty.

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
