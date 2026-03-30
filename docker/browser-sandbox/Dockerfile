# Browser Sandbox — Playwright Chromium image
# Runs as non-root pwuser (UID 1000) with restricted syscalls
FROM mcr.microsoft.com/playwright:v1.50.0-noble

USER root

# Add headless office conversion support for slide/PDF workflows.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      libreoffice-core \
      libreoffice-impress \
      libreoffice-writer \
      fonts-dejavu-core \
      fonts-noto-core \
      fonts-thai-tlwg \
      ghostscript && \
    rm -rf /var/lib/apt/lists/*

# Install only Chromium (no Firefox/WebKit) to save disk/RAM
RUN npx -y playwright install chromium && \
    npx -y playwright install-deps chromium

# Ensure non-root user
USER pwuser

WORKDIR /home/pwuser/app

# Keep the image idle until OpenSandbox injects the actual command entrypoint.
CMD ["sleep", "infinity"]
