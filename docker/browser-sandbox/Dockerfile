# Browser Sandbox — Playwright Chromium image
# Runs as non-root pwuser (UID 1000) with restricted syscalls
FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Install only Chromium (no Firefox/WebKit) to save disk/RAM
RUN npx -y playwright install chromium && \
    npx -y playwright install-deps chromium

# Ensure non-root user
USER pwuser

WORKDIR /home/pwuser/app

# Minimal Python server that wraps Playwright over HTTP
COPY --chown=pwuser:pwuser server.py .

# Expose internal port (not published — Docker network access only)
EXPOSE 3000

# Zombie-process prevention: run under tini (docker --init does this)
# CMD is overridden in docker-compose with --init flag
CMD ["python3", "-u", "server.py"]
