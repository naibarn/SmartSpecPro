---
slug: docker-sandbox
title: Docker Sandbox
description: Container management and monitoring dashboard
icon: Container
section: advanced
order: 73
pages: ["/docker"]
tags: [docker, container, sandbox, logs, image, devops]
---

# Docker Sandbox

## Overview

Docker Sandbox provides a container management dashboard for monitoring and controlling Docker containers and images. View real-time container status, resource usage, logs, and image details.

## Container management

The **Containers** tab shows all Docker containers with:

- **Status** — running (green), stopped (gray), paused (yellow)
- **Resource usage** — CPU and memory consumption per container
- **Controls** — start, stop, restart, or remove containers

Click a container row to expand its detail panel.

## Viewing logs

1. Select a container from the list.
2. Switch to the **Logs** tab.
3. Logs stream in real-time with automatic scroll.
4. Use the search bar to filter log entries.
5. Toggle **timestamps** to show or hide log timestamps.

## Image inspection

The **Images** tab lists all Docker images on the system:

- Image name, tag, and size
- Creation date and layer count
- Pull or delete images from the interface

## System resources

The dashboard header shows overall system statistics:

- Total running containers
- CPU and memory usage across all containers
- Disk usage for Docker volumes

## Tips

- Use the logs viewer to debug container issues without SSH access.
- Stop unused containers to free up system resources.
- Check image sizes regularly — large images slow down deployments.
