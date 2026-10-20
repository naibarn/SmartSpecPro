# Build recipe for the fixed Cloudflare media probe. No execution dispatcher.
# Official build/base images are resolved to immutable digests before invocation.
ARG RUST_BUILD_IMAGE
ARG RUNNER_RUNTIME_IMAGE
FROM ${RUST_BUILD_IMAGE} AS build
WORKDIR /source
COPY apps/runner-app/Cargo.toml apps/runner-app/Cargo.lock ./
COPY apps/runner-app/src ./src
RUN cargo build --locked --release --bin smartaihub-runner

FROM ${RUNNER_RUNTIME_IMAGE} AS metadata
RUN apt-get update
RUN apt-cache policy ffmpeg

FROM metadata AS runtime
ARG FFMPEG_VERSION
RUN test -n "${FFMPEG_VERSION}" \
    && apt-get install -y --no-install-recommends "ffmpeg=${FFMPEG_VERSION}" \
    && /usr/bin/ffprobe -version \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /source/target/release/smartaihub-runner /usr/local/bin/smartaihub-runner
USER 65532:65532
ENV SAH_RUNNER_PROFILE=shared_container SAH_RUNNER_HEALTH_PORT=8787
EXPOSE 8787
ENTRYPOINT ["smartaihub-runner", "run"]
