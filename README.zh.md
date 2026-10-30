# pi-plugins

[中文](README.zh.md) · [English](README.md)

[Pi](https://github.com/earendil-works/pi) 的扩展。同一个仓库里分别发布为独立的 npm 包。

[![CI](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/ci.yml)
[![Publish](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/publish.yml/badge.svg)](https://github.com/RetiredPhysicist/pi-plugins/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#%E8%AE%B8%E5%8F%AF%E8%AF%81)

Pi 是终端编程 agent。这个仓库放九个扩展：搜索、补充工具、通知、命令历史、浏览器、CodeBuddy 模型提供方、记忆、多模态输入、状态 HUD。每个包有自己的 npm 名、版本和 `packages/<name>/README.md`。按需安装。没有总包。

## 包

```text
pi install npm:<package>
        │
        ▼
   Pi 加载该扩展
        │
        ▼
 工具 / 命令 / 钩子 / HUD
```

| 包 | 增加的能力 | npm |
| --- | --- | --- |
| [pi-all-search](packages/pi-all-search) | `web_search`、`web_fetch`、`get_sub_domains`。提供方：exa、tavily、anysearch、tinyfish、firecrawl、firecrawl-dev、context7。 | [1.1.17](https://www.npmjs.com/package/pi-all-search) |
| [pi-all-tools](packages/pi-all-tools) | 在 Pi 自带的 `read`、`bash`、`edit`、`write` 之外，保持 `find`、`grep`、`ls` 可用。 | [1.1.0](https://www.npmjs.com/package/pi-all-tools) |
| [pi-all-notification](packages/pi-all-notification) | macOS 通知、[Bark](https://github.com/Finb/Bark)、自定义 webhook。工具：`notify_user`。命令：`/all-notification`。 | [1.0.5](https://www.npmjs.com/package/pi-all-notification) |
| [pi-atuin](packages/pi-atuin) | 空输入时按 ↑ 对历史提示做模糊搜索。可选 [atuin](https://atuin.sh) 同步。命令：`/atuin record-agent-history`。 | [0.1.20](https://www.npmjs.com/package/pi-atuin) |
| [pi-cloudflare-browser-run](packages/pi-cloudflare-browser-run) | 通过 [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/) 提供 `browse`、`screenshot`、`pdf`、`crawl`、`crawl_status`。 | [0.2.10](https://www.npmjs.com/package/pi-cloudflare-browser-run) |
| [pi-codebuddy-sdk](packages/pi-codebuddy-sdk) | 用本机 `codebuddy` CLI 把 CodeBuddy 模型接进 `/model`。工具：`AskCodebuddy`。 | [0.4.34](https://www.npmjs.com/package/pi-codebuddy-sdk) |
| [pi-dejavu-memory](packages/pi-dejavu-memory) | 对接 DejaVu MCP 服务的记忆工具：`dejavu_boot`、`dejavu_read`、`dejavu_search`、`dejavu_create`、`dejavu_update`、`dejavu_delete`。 | [1.4.2](https://www.npmjs.com/package/pi-dejavu-memory) |
| [pi-gemini-multimodal](packages/pi-gemini-multimodal) | 通过 Gemini 提供 `media_understand`、`media_transcribe`、`image_generate`、`read_document`。 | [0.1.19](https://www.npmjs.com/package/pi-gemini-multimodal) |
| [pi-shannon-statusline](packages/pi-shannon-statusline) | ANSI 状态 HUD：项目、模型、上下文、吞吐、工具、agent 状态。 | [1.2.0](https://www.npmjs.com/package/pi-shannon-statusline) |

上表版本与本仓库 `package.json` 一致。对应 tag 推出之前，npm 上的版本可能更旧。

## 安装

需要 [pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) 的 `pi` 命令。

```bash
pi install npm:pi-all-search
```

把包名换成表里任一行。`pi` 已在运行时先重启。`pi-gemini-multimodal` 的包内文档还写了 `pi pkg install pi-gemini-multimodal`。

`pi-cloudflare-browser-run` 的扩展在 `src/` 下，`package.json` 没有 `pi` 字段。其余八个包声明了 `pi.extensions`（`pi-dejavu-memory` 还声明了 `pi.hooks`）。

各包的配置（API key、MCP 地址、Cloudflare token、`PATH` 上的 `codebuddy`）写在该包的 README 里。这些值不进本仓库。

## 开发

每个包独立安装、独立测试。CI 使用 Node 26。声明 `"node": ">=20"` 的有两个：`pi-cloudflare-browser-run` 和 `pi-codebuddy-sdk`。

```bash
cd packages/<pkg>
npm ci          # 没有 package-lock.json 时用 npm install
npm run typecheck --if-present
npm test --if-present
```

CI（`.github/workflows/ci.yml`）在推到 `main`、pull request 和 `workflow_dispatch` 时运行。只测本次改动碰到的包：有 `typecheck` 就跑，然后依次选 `test:ci`、`test:unit`、`test`。

## 发布

**推荐：** [Changesets](https://github.com/changesets/changesets)。在仓库根目录（先 `npm ci --workspaces=false`）：

```bash
npx changeset          # 选包与 bump 类型；把 .changeset/*.md 随 PR 提交
```

合并进 `main` 后，`.github/workflows/release.yml` 会开 **Version Packages** PR。再合并该 PR，经 OIDC 执行 `changeset publish`。仓库不存 npm token。根目录 `package.json` 为 private，只为让 Changesets 发现 `packages/*`；日常仍是 `cd packages/<pkg> && npm ci`。

**兼容（未改）：** 名为 `<package>-v<version>` 的 tag 仍只经 `.github/workflows/publish.yml` 发布该包。版本必须等于 `packages/<package>/package.json`。

```bash
script/release-tag.sh pi-atuin
git push origin pi-atuin-v0.1.20
```

`script/release-tag.sh` 从该包读版本，在当前提交上打 tag，不推送。tag 发布同样走 npm OIDC（`id-token: write`）。

## 许可证

每个包的 `package.json` 都声明 MIT。`pi-atuin`、`pi-cloudflare-browser-run`、`pi-codebuddy-sdk`、`pi-gemini-multimodal` 另外带了 `LICENSE` 文件。其余五个没有。
