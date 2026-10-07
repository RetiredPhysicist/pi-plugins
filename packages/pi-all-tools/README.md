# pi-all-tools

Ensure 3 additional Pi tools are always available: `find`, `grep`, `ls`

## Install

```bash
pi install npm:pi-all-tools
```

## What it does

Pi 默认自带 4 个工具 (read, bash, edit, write)。此扩展在每次 agent 启动时自动追加 `find`, `grep`, `ls`，共 7 个工具可用，不覆盖其他扩展注册的工具。
