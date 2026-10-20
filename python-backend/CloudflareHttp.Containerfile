# Only the verified canonical source packager may create this context.
ARG PYTHON_HTTP_IMAGE
ARG ACCESS_CONNECTOR_IMAGE
FROM ${ACCESS_CONNECTOR_IMAGE} AS connector
FROM ${PYTHON_HTTP_IMAGE} AS dependencies
RUN apt-get update && apt-get install --no-install-recommends -y gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
COPY requirements-cloudflare-http.lock /build/requirements-cloudflare-http.lock
RUN /opt/venv/bin/python -m pip install --no-cache-dir --require-hashes -r /build/requirements-cloudflare-http.lock \
    && /opt/venv/bin/python -m pip check
FROM ${PYTHON_HTTP_IMAGE} AS runtime
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
WORKDIR /app/python-backend
COPY --from=dependencies /opt/venv /opt/venv
COPY --from=connector /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=connector /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN cloudflared --version && test -s /etc/ssl/certs/ca-certificates.crt \
    && groupadd --gid 1000 app && useradd --uid 1000 --gid app --create-home app
COPY --chown=app:app runtime/ /app/
RUN mkdir -p /app/python-backend/logs /app/python-backend/data /app/python-backend/uploads \
    && chown -R app:app /app
ENV ENVIRONMENT=production DEBUG=false \
    SMARTAIHUB_APPLICATION_RUNTIME=cloudflare-http \
    CLOUDFLARE_CONTAINER_POLICY=on-demand \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH=/opt/venv/bin:$PATH
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=2 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live',timeout=2)"
CMD ["python", "-m", "app.core.cloudflare_http_entrypoint"]
