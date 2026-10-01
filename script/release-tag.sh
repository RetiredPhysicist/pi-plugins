#!/usr/bin/env bash
# Usage: script/release-tag.sh <package-name>
# Creates <package-name>-v<package.json version> from the current commit.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package="${1:?package name is required}"
manifest="$root/packages/$package/package.json"

[ -f "$manifest" ] || { echo "no such package: $package" >&2; exit 1; }

version="$(node -p "require('$manifest').version")"
tag="$package-v$version"

git -C "$root" tag "$tag"
echo "Created $tag. Push it with: git push origin $tag"
