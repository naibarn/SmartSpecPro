# Only the verified canonical source packager may create this context.
ARG PYTHON_HTTP_IMAGE
ARG ACCESS_CONNECTOR_IMAGE
FROM ${ACCESS_CONNECTOR_IMAGE} AS connector
FROM ${PYTHON_HTTP_IMAGE} AS runtime
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
WORKDIR /app
COPY requirements-cloudflare-http.lock /app/requirements-cloudflare-http.lock
RUN python -m pip install --no-cache-dir --require-hashes -r requirements-cloudflare-http.lock \
    && python -m pip check
COPY --from=connector /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=connector /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN cloudflared --version && test -s /etc/ssl/certs/ca-certificates.crt \
    && groupadd --gid 1000 app && useradd --uid 1000 --gid app --create-home app
COPY --chown=app:app app/ /app/app/
RUN mkdir -p /app/logs /app/data /app/uploads && chown -R app:app /app
ENV ENVIRONMENT=production DEBUG=false \
    SMARTAIHUB_APPLICATION_RUNTIME=cloudflare-http \
    CLOUDFLARE_CONTAINER_POLICY=on-demand \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=2 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live',timeout=2)"
CMD ["python", "-m", "app.core.cloudflare_http_entrypoint"]
