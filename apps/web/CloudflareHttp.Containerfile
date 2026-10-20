# Context is produced only from a validated canonical backend artifact.
ARG NODE_HTTP_IMAGE
ARG ACCESS_CONNECTOR_IMAGE
FROM ${ACCESS_CONNECTOR_IMAGE} AS connector
FROM ${NODE_HTTP_IMAGE} AS runtime
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
WORKDIR /app
COPY --chown=node:node runtime/ /app/
COPY --from=connector /usr/local/bin/cloudflared /usr/local/bin/cloudflared
# cloudflared verifies the public Access HTTPS endpoint before DB TLS starts.
# node:slim has no system trust bundle; retain the pinned connector's roots.
COPY --from=connector /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN cloudflared --version && test -s /etc/ssl/certs/ca-certificates.crt
COPY --chown=node:node cloudflare-http-entrypoint.mjs /app/scripts/cloudflare-http-entrypoint.mjs
# These defaults select request-only startup; provider max_instances, finite
# idle/hard lifetime and the private DB connector remain deployment authority.
ENV NODE_ENV=production \
    SMARTAIHUB_APPLICATION_RUNTIME=cloudflare-http \
    CLOUDFLARE_CONTAINER_POLICY=on-demand \
    HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=2 \
    CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import=tsx", "scripts/cloudflare-http-entrypoint.mjs"]
