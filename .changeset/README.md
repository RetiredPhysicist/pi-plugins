# Changesets

This folder stores [Changesets](https://github.com/changesets/changesets) entries for this monorepo.

## Preferred release path

1. In a feature PR, run `npx changeset` (from the repo root) and commit the generated markdown under `.changeset/`.
2. After merge to `main`, `.github/workflows/release.yml` opens a **Version Packages** PR (version bumps + changelogs).
3. Merge that PR; the same workflow publishes to npm via OIDC (`changeset publish`). No npm token is stored in the repo.

## Tag-based publish (still supported)

The existing `script/release-tag.sh` + `.github/workflows/publish.yml` path still works: bump `packages/<pkg>/package.json` yourself, tag `<pkg>-v<version>`, push the tag. Prefer Changesets for new releases.

Do not add secrets here. See the root README **Release** section.
