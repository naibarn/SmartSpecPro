# SmartSpec Sandbox - Go Image
# Full-featured Go development environment
#
# Includes: Go 1.21, common tools, linters, and frameworks

FROM smartspec/sandbox-base:latest

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Go Image"
LABEL version="1.0"

USER root

# ============================================
# Go 1.21
# ============================================
ENV GO_VERSION=1.21.6
ENV GOROOT=/usr/local/go
ENV GOPATH=/home/sandbox/go
ENV PATH="${GOROOT}/bin:${GOPATH}/bin:${PATH}"

RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz && \
    rm go${GO_VERSION}.linux-amd64.tar.gz

# Create Go workspace directories
RUN mkdir -p /home/sandbox/go/{bin,src,pkg} && \
    chown -R sandbox:sandbox /home/sandbox/go

# Switch to sandbox user for installing Go tools
USER sandbox

# ============================================
# Go Development Tools
# ============================================

# Code quality & linting
RUN go install golang.org/x/tools/gopls@latest && \
    go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest && \
    go install honnef.co/go/tools/cmd/staticcheck@latest && \
    go install github.com/go-delve/delve/cmd/dlv@latest

# Code generation & formatting
RUN go install golang.org/x/tools/cmd/goimports@latest && \
    go install github.com/fatih/gomodifytags@latest && \
    go install github.com/cweill/gotests/gotests@latest && \
    go install github.com/josharian/impl@latest

# Testing tools
RUN go install github.com/onsi/ginkgo/v2/ginkgo@latest && \
    go install gotest.tools/gotestsum@latest && \
    go install github.com/rakyll/gotest@latest

# Build & development tools
RUN go install github.com/cosmtrek/air@latest && \
    go install github.com/swaggo/swag/cmd/swag@latest && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Database tools
RUN go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest && \
    go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# CLI frameworks
RUN go install github.com/spf13/cobra-cli@latest

# ============================================
# Protocol Buffers (as root)
# ============================================
USER root

RUN apt-get update && \
    apt-get install -y protobuf-compiler && \
    rm -rf /var/lib/apt/lists/*

# ============================================
# Environment Setup
# ============================================
USER sandbox

# Set Go environment variables
ENV GO111MODULE=on
ENV GOPROXY=https://proxy.golang.org,direct
ENV GOSUMDB=sum.golang.org
ENV CGO_ENABLED=1

# Create common project structure
RUN mkdir -p /home/sandbox/go/src/github.com

# Verify installation
RUN go version && \
    echo "GOPATH: $GOPATH" && \
    echo "GOROOT: $GOROOT" && \
    ls -la $GOPATH/bin/

# Default ports for Go apps
EXPOSE 8080 9000 3000

# Working directory
WORKDIR /workspace

# Default command
CMD ["tail", "-f", "/dev/null"]
