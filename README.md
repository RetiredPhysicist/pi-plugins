# pi-all-tools

Enable all 7 built-in Pi tools by default: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`

## Install

```bash
pi install git:github.com/RealAlexandreAI/pi-all-tools
```

## What it does

Pi 默认只启用 4 个工具 (read, bash, edit, write)。这个 extension 在每次 agent 启动时自动追加缺失的 find, grep, ls 到活跃工具列表。

**不会覆盖其他工具。** 使用 `getActiveTools()` 读取当前工具列表，仅追加缺失项。配合 pi-subagents 等注册自定义工具的扩展不会冲突。

### 对比

| 版本 | 行为 | 副作用 |
|---|---|---|
| v1（旧） | `setActiveTools([read,bash,edit,write,grep,find,ls])` 硬编码覆盖 | 屏蔽 Agent / get_subagent_result / steer_subagent 等扩展工具 |
| v2（当前） | `getActiveTools()` + 追加 missing | 仅补全，不覆盖 |
