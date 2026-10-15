# pi-plugins

[English](README.md) · [中文](README.zh.md)

Extensions for [Pi](https://github.com/earendil-works/pi), published as separate npm packages from one repository.

[![CI](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/ci.yml)
[![Publish](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/publish.yml/badge.svg)](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

Pi is a terminal coding agent. This repository holds nine extensions for it: search, extra tools, notifications, shell history, a browser, a CodeBuddy model provider, memory, multimodal input, and a status HUD. Each package has its own npm name, version, and `packages/<name>/README.md`. Install the ones you want. There is no meta-package.

## Packages

```text
pi install npm:<package>
        │
        ▼
   Pi loads the extension
        │
        ▼
 tools / commands / hooks / HUD
```

| Package | What it adds | npm |
| --- | --- | --- |
| [pi-all-search](packages/pi-all-search) | `web_search`, `web_fetch`, `get_sub_domains`. Providers: exa, tavily, anysearch, tinyfish, firecrawl, firecrawl-dev, context7. | [1.1.15](https://www.npmjs.com/package/pi-all-search) |
| [pi-all-tools](packages/pi-all-tools) | Keeps `find`, `grep`, and `ls` in the tool set, next to Pi's `read`, `bash`, `edit`, and `write`. | [1.1.0](https://www.npmjs.com/package/pi-all-tools) |
| [pi-all-notification](packages/pi-all-notification) | macOS notification, [Bark](https://github.com/Finb/Bark), and a custom webhook. Tool: `notify_user`. Command: `/all-notification`. | [1.0.4](https://www.npmjs.com/package/pi-all-notification) |
| [pi-atuin](packages/pi-atuin) | Up-arrow fuzzy search over previous prompts. Optional [atuin](https://atuin.sh) sync. Command: `/atuin record-agent-history`. | [0.1.20](https://www.npmjs.com/package/pi-atuin) |
| [pi-cloudflare-browser-run](packages/pi-cloudflare-browser-run) | `browse`, `screenshot`, `pdf`, `crawl`, `crawl_status` through [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/). | [0.2.9](https://www.npmjs.com/package/pi-cloudflare-browser-run) |
| [pi-codebuddy-sdk](packages/pi-codebuddy-sdk) | CodeBuddy models in `/model`, via the local `codebuddy` CLI. Tool: `AskCodebuddy`. | [0.4.30](https://www.npmjs.com/package/pi-codebuddy-sdk) |
| [pi-dejavu-memory](packages/pi-dejavu-memory) | Memory tools against a [DejaVu](https://github.com/Dataojitori/nocturne_memory) MCP server: `dejavu_boot`, `dejavu_read`, `dejavu_search`, `dejavu_create`, `dejavu_update`, `dejavu_delete`. | [1.4.0](https://www.npmjs.com/package/pi-dejavu-memory) |
| [pi-gemini-multimodal](packages/pi-gemini-multimodal) | `media_understand`, `media_transcribe`, `image_generate`, `read_document` through Gemini. | [0.1.18](https://www.npmjs.com/package/pi-gemini-multimodal) |
| [pi-shannon-statusline](packages/pi-shannon-statusline) | ANSI status HUD: project, model, context, throughput, tools, agent state. | [1.2.0](https://www.npmjs.com/package/pi-shannon-statusline) |

Versions above match `package.json` in this tree. npm may be behind until that version's tag is pushed.

## Install

You need the `pi` CLI from [pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent).

```bash
pi install npm:pi-all-search
```

Replace the package name with any row in the table. Restart `pi` if it is already running. `pi-gemini-multimodal` is also documented as `pi pkg install pi-gemini-multimodal`.

`pi-cloudflare-browser-run` ships its extension under `src/` and has no `pi` field in `package.json`. The other eight declare `pi.extensions` (and `pi-dejavu-memory` also declares `pi.hooks`).

Per-package setup (API keys, MCP URL, Cloudflare token, `codebuddy` on `PATH`) is in that package's README. None of those values belong in this repository.

## Develop

Each package installs and tests on its own. CI uses Node 26. Two packages declare `"node": ">=20"`: `pi-cloudflare-browser-run` and `pi-codebuddy-sdk`.

```bash
cd packages/<pkg>
npm ci          # npm install, if that package has no package-lock.json
npm run typecheck --if-present
npm test --if-present
```

CI (`.github/workflows/ci.yml`) runs on push to `main`, on pull requests, and on `workflow_dispatch`. It tests only the packages whose files changed: `typecheck` when present, then `test:ci`, else `test:unit`, else `test`.

## Release

A tag named `<package>-v<version>` publishes that package only. The version must equal `packages/<package>/package.json`.

```text
tag pi-atuin-v0.1.20
        │
        ▼
 .github/workflows/publish.yml
        │
        ▼
 npm ci → npm run build (if present) → npm publish --access public
```

```bash
script/release-tag.sh pi-atuin
git push origin pi-atuin-v0.1.20
```

`script/release-tag.sh` reads the version from that package and creates the tag on the current commit. It does not push. Publish uses npm OIDC (`id-token: write`). This repository does not store an npm token.

## License

Every package declares MIT in `package.json`. `pi-atuin`, `pi-cloudflare-browser-run`, `pi-codebuddy-sdk`, and `pi-gemini-multimodal` also ship a `LICENSE` file. The other five do not.
