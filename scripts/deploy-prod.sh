#!/usr/bin/env bash

# This legacy Docker Compose entry point deployed from the caller's checkout.
# Production web releases now require the canonical build and shared deploy gate.
set -euo pipefail
echo "Production deploy blocked: this legacy script builds from the caller checkout."
echo "Use the canonical release pipeline after its production authorization gate is satisfied."
exit 2
