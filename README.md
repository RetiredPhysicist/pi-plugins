# pi-all-notification

pi 多渠道通知扩展 — macOS 桌面通知 / Bark 推送 / 自定义 Webhook。

## 三种推送途径

| 渠道 | 说明 | 配置 |
|------|------|------|
| 🖥 **macOS 原生通知** | 右上角弹窗通知，基于 `osascript` | 零配置，开箱即用 |
| 📱 **Bark 推送** | 推送到 iPhone（[Bark](https://github.com/Finb/Bark)） | 需配置设备 Key + Server |
| 🔗 **自定义 Webhook** | 任意 HTTP 端点（Slack/Discord/飞书/钉钉/企业微信…） | 配置 URL + Method + Body 模板 |

## 安装

```bash
pi install git:github.com/RealAlexandreAI/pi-all-notification
```

重启 pi（或 `/reload`）。

## 使用

### Agent 自动触发

Agent 完成响应时自动通知（`agent_end` 事件）。可在设置面板 toggle 触发时机。

### Agent 手动调用

Agent 可主动调用 `notify_user` 工具发送通知：

```
notify_user({
  title: "Build Failed",
  message: "TypeScript compilation failed with 12 errors.",
  priority: "high"
})
```

| 参数 | 说明 |
|------|------|
| `title` | 通知标题 |
| `message` | 通知内容 |
| `priority` | `normal` / `high` / `critical`（影响 emoji 前缀） |

### `/all-notification` — 设置面板

```
↑↓ 导航  Enter 切换/进入子面板  Esc 退出
```

主面板 toggle 三个渠道开关，进入子面板配置参数。

### Bark 配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `key` | (必填) | Bark 设备 Key |
| `server` | `https://api.day.app` | Bark 服务器地址 |
| `authUser` / `authPass` | 无 | Basic Auth（自建 Bark 服务端用） |
| `sound` | `calypso` | 推送铃声：`calypso` `alarm` `birdsong` `chime` `complete` `electronic` 等 |
| `group` | `pi` | 通知分组名 |
| `level` | `active` | iOS 通知级别：`active` / `timeSensitive` / `passive` |
| `url` | 无 | 点击通知跳转的 URL |
| `isArchive` | `1` | 是否存入历史：`1` 是 / `0` 否 |

### Webhook 配置

Webhook 支持 GET 和 POST，Body 模板支持变量替换：

| 变量 | 说明 |
|------|------|
| `{{title}}` | 通知标题，如 "pi ✅ Complete" |
| `{{message}}` | 通知内容，通常是任务描述 |
| `{{project}}` | 当前项目名 |
| `{{timestamp}}` | ISO 时间戳 |

**示例 — Slack Incoming Webhook:**
```json
{
  "method": "POST",
  "url": "https://hooks.slack.com/services/xxx",
  "bodyTemplate": "{\"text\": \"{{title}}: {{message}}\"}"
}
```

**示例 — 飞书机器人:**
```json
{
  "method": "POST",
  "url": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
  "bodyTemplate": "{\"msg_type\":\"text\",\"content\":{\"text\":\"{{title}}\\n{{message}}\"}}"
}
```

**示例 — 钉钉机器人:**
```json
{
  "method": "POST",
  "url": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
  "bodyTemplate": "{\"msgtype\":\"text\",\"text\":{\"content\":\"{{title}}\\n{{message}}\"}}"
}
```

### 触发时机

| 事件 | 默认 | 说明 |
|------|------|------|
| `agent_end` | ✅ | Agent 完成响应，等待输入 |
| `agent_start` | ⬜ | Agent 开始处理 |
| `tool_error` | ⬜ | 工具执行出错 |

## 配置文件

运行时配置存储在 `~/.pi/agent/extensions/pi-all-notification/config.json`。

首次启动自动生成默认配置。仓库中的 `config.json` 是模板，不含密钥。

## License

MIT
