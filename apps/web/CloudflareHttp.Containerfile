# Context is produced only from a validated canonical backend artifact.
ARG NODE_HTTP_IMAGE
FROM ${NODE_HTTP_IMAGE} AS runtime
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
WORKDIR /app
COPY --chown=node:node runtime/ /app/
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
CMD ["node", "--import=tsx", "server/_core/index.ts"]
