#!/usr/bin/env bash
# Publish via Changesets (OIDC). Packages ship source; no build step.
# Tag-based publish.yml remains the fallback and is unchanged.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
exec npx changeset publish
