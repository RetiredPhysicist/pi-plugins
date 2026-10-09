# pi-all-tools

Ensure 3 additional Pi tools are always available: `find`, `grep`, `ls`.

## Install

```bash
pi install npm:pi-all-tools
```

## What it does

Pi 默认自带 4 个工具 (read, bash, edit, write)。此扩展在每次 agent 启动时补齐 `find`, `grep`, `ls`，共 7 个工具可用，不覆盖其他扩展注册的工具。

## Pi 1.1+：改用原生 defaultTools

Pi 1.1 给 `defaultTools` 和 `--tools` 加了 `+name` / `-name` 增量语法，这件事可以不再依赖扩展：

```json
{
  "defaultTools": ["+find", "+grep", "+ls"]
}
```

**本扩展在 Pi 1.1+ 上会让位给这个设置**：某个工具如果被 `defaultTools` 明确写成 `-find`，扩展不会再把它加回来（`-name` 的移除按官方语义应当保持）；没有被提到的工具仍然照旧补齐。所以：

- 已经装了本扩展的用户，升级 Pi 后行为不变，无需改配置。
- 想单独禁用某个工具，写 `{"defaultTools": ["-find"]}` 即可，扩展不会覆盖。
- 全新环境建议直接用上面的原生配置，本扩展可以不安。
