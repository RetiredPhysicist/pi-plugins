# pi-all-tools

Enable all 7 built-in Pi tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`

## Install

```bash
pi install git:github.com/RealAlexandreAI/pi-all-tools
```

## What it does

Pi 默认只启用 4 个工具 (read, bash, edit, write)。此扩展在每次 agent 启动时读取当前活跃工具列表，仅追加缺失的 find, grep, ls，不覆盖其他扩展注册的工具。
