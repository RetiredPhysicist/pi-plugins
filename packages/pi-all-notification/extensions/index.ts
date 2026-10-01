/**
 * pi-all-notification — 多渠道通知扩展
 *
 * 三种推送途径：
 *   1. macOS 桌面通知（右上角弹窗，osascript）
 *   2. Bark 推送到 iPhone
 *   3. 自定义 Webhook（支持 GET/POST + 模板变量 + 自定义 headers）
 *
 * 配置：~/.pi/agent/extensions/pi-all-notification/config.json
 * 命令：/all-notification  打开设置面板
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, DynamicBorder, Text } from "@earendil-works/pi-tui";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

// ─── Types ────────────────────────────────────────────────────

interface ChannelConfig {
  enabled: boolean;
}

interface BarkConfig extends ChannelConfig {
  key: string;
  server: string;
  /** Basic auth: "user:pass" embedded in server URL, or separate fields */
  authUser?: string;
  authPass?: string;
  sound: string;
  group: string;
  level: "active" | "timeSensitive" | "passive";
  url?: string;
  isArchive?: 1 | 0;
}

interface WebhookConfig extends ChannelConfig {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  bodyTemplate: string;
}

interface TriggerConfig {
  agent_end: boolean;
  agent_start: boolean;
  tool_error: boolean;
}

interface FullConfig {
  channels: {
    macos: ChannelConfig;
    bark: BarkConfig;
    webhook: WebhookConfig;
  };
  triggers: TriggerConfig;
}

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_CONFIG: FullConfig = {
  channels: {
    macos: { enabled: true },
    bark: {
      enabled: false,
      key: "",
      server: "https://api.day.app",
      sound: "calypso",
      group: "pi",
      level: "active",
      isArchive: 1,
    },
    webhook: {
      enabled: false,
      url: "",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      bodyTemplate: JSON.stringify({
        title: "{{title}}",
        message: "{{message}}",
        project: "{{project}}",
        timestamp: "{{timestamp}}",
      }, null, 2),
    },
  },
  triggers: {
    agent_end: true,
    agent_start: false,
    tool_error: false,
  },
};

// ─── Config path & I/O ────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".pi", "agent", "extensions", "pi-all-notification");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function loadConfig(): FullConfig {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch { /* corrupt → use defaults */ }
  }
  return structuredClone(DEFAULT_CONFIG);
}

function saveConfig(cfg: FullConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

// ─── macOS notification ───────────────────────────────────────

function notifyMacOS(title: string, body: string): void {
  if (process.platform !== "darwin") return;
  try {
    // ponytail: osascript is the simplest cross-version macOS notification API
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${escapedBody}" with title "${escapedTitle}"'`,
      { timeout: 3000 },
    );
  } catch {
    // Silent — never block agent
  }
}

// ─── Bark push ─────────────────────────────────────────────────

async function sendBark(cfg: BarkConfig, title: string, body: string): Promise<void> {
  const server = (cfg.server || "https://api.day.app").replace(/\/+$/, "");

  // Build query params
  const params = new URLSearchParams();
  params.set("sound", cfg.sound || "calypso");
  params.set("group", cfg.group || "pi");
  params.set("level", cfg.level || "active");
  if (cfg.url) params.set("url", cfg.url);
  if (cfg.isArchive !== undefined) params.set("isArchive", String(cfg.isArchive));

  const url = `${server}/${encodeURIComponent(cfg.key)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?${params.toString()}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);

  try {
    const headers: Record<string, string> = {};
    // Handle Basic Auth if configured
    if (cfg.authUser && cfg.authPass) {
      const encoded = Buffer.from(`${cfg.authUser}:${cfg.authPass}`).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
    }
    await fetch(url, { signal: ac.signal, headers });
  } catch {
    // Silent
  } finally {
    clearTimeout(timer);
  }
}

// ─── Custom webhook ────────────────────────────────────────────

function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

async function sendWebhook(cfg: WebhookConfig, vars: Record<string, string>): Promise<void> {
  const body = renderTemplate(cfg.bodyTemplate, vars);
  const headers = { ...cfg.headers };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);

  try {
    if (cfg.method === "GET") {
      // GET: append body as query params if it parses as JSON
      let url = cfg.url;
      try {
        const obj = JSON.parse(body);
        const params = new URLSearchParams(obj).toString();
        url += (url.includes("?") ? "&" : "?") + params;
      } catch {
        // body not valid JSON — just hit the URL as-is
      }
      await fetch(url, { signal: ac.signal, headers: { ...headers } });
    } else {
      await fetch(cfg.url, {
        method: "POST",
        signal: ac.signal,
        headers,
        body,
      });
    }
  } catch {
    // Silent
  } finally {
    clearTimeout(timer);
  }
}

// ─── Notification dispatch ────────────────────────────────────

interface NotificationVars {
  title: string;
  message: string;
  project: string;
  emoji: string;
  timestamp: string;
}

function fireAll(cfg: FullConfig, vars: NotificationVars): void {
  const { channels } = cfg;

  // 1. macOS
  if (channels.macos.enabled) {
    notifyMacOS(vars.title, vars.message);
  }

  // 2. Bark
  if (channels.bark.enabled && channels.bark.key) {
    sendBark(channels.bark, vars.title, vars.message).catch(() => {});
  }

  // 3. Webhook
  if (channels.webhook.enabled && channels.webhook.url) {
    sendWebhook(channels.webhook, {
      title: vars.title,
      message: vars.message,
      project: vars.project,
      timestamp: vars.timestamp,
    }).catch(() => {});
  }
}

// ─── TUI Settings Panel ───────────────────────────────────────

function settingLabel(emoji: string, name: string, enabled: boolean, extra?: string): string {
  const check = enabled ? "✅" : "⬜";
  return `${check} ${emoji} ${name}${extra ? ` ${extra}` : ""}`;
}

// ─── Main Extension ───────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let projectName = "";

  // ── notify_user agent tool ────────────────────────────
  pi.registerTool({
    name: "notify_user",
    label: "Notify User",
    description: "Send a notification to the user via all enabled channels (macOS, Bark, Webhook). Use when a long-running task completes, an error occurs, or you need the user's attention.",
    promptSnippet: "Notify user via macOS/Bark/Webhook",
    promptGuidelines: [
      "Use notify_user when the user asked you to notify them on completion, or when a long task finishes while they may be away.",
      "Use notify_user to alert the user about critical errors that need their attention.",
      "Users configure notification channels via the /all-notification command — mention this if they ask about setup.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Notification title (keep short, e.g. 'Build Complete')" }),
      message: Type.String({ description: "Notification body (task summary, error detail, etc.)" }),
      priority: Type.Optional(StringEnum(["normal", "high", "critical"] as const)),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const cfg = loadConfig();
      const priorityEmoji: Record<string, string> = {
        high: "⚠️",
        critical: "🚨",
      };
      const emoji = priorityEmoji[params.priority ?? "normal"] ?? "🔔";

      const vars: NotificationVars = {
        title: `${emoji} ${params.title}`,
        message: params.message,
        project: projectName,
        emoji,
        timestamp: new Date().toISOString(),
      };
      fireAll(cfg, vars);

      const active: string[] = [];
      if (cfg.channels.macos.enabled) active.push("macOS");
      if (cfg.channels.bark.enabled && cfg.channels.bark.key) active.push("Bark");
      if (cfg.channels.webhook.enabled && cfg.channels.webhook.url) active.push("Webhook");

      return {
        content: [{ type: "text", text: `Notification sent to: ${active.join(", ") || "(no channels enabled)"}. Title: "${params.title}"` }],
        details: { channels: active, title: params.title, message: params.message },
      };
    },
  });

  // ── /all-notification settings panel ─────────────────────
  pi.registerCommand("all-notification", {
    description: "Configure notification channels: macOS, Bark, Webhook",
    handler: async (_args, ctx) => {
      const cfg = loadConfig();

      function buildItems() {
        const b = cfg.channels.bark;
        const w = cfg.channels.webhook;
        return [
          { label: settingLabel("🖥", "macOS Notification", cfg.channels.macos.enabled), value: "macos_toggle" },
          { label: settingLabel("📱", "Bark Push", b.enabled, b.key ? `(${b.key.slice(0, 8)}...)` : "(not set)"), value: "bark" },
          { label: settingLabel("🔗", "Webhook", w.enabled, w.url ? `(${truncateUrl(w.url)})` : "(not set)"), value: "webhook" },
          { label: `⚙  Triggers`, value: "triggers" },
        ];
      }

      let lastIndex = 0;

      while (true) {
        const result = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (r: number | undefined) => void) => {
          let cur = lastIndex;

          const container = new Container();
          container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
          container.addChild(new Text(
            theme.fg("accent", theme.bold("pi-all-notification")) +
            theme.fg("dim", "  ↑↓ navigate  Enter toggle/configure  Esc exit"),
            1, 0,
          ));
          const listC = new Container();
          container.addChild(listC);
          container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

          function render() {
            listC.clear();
            const items = buildItems();
            for (let i = 0; i < items.length; i++) {
              const line = i === cur
                ? theme.fg("accent", "→ " + items[i].label)
                : "  " + items[i].label;
              listC.addChild(new Text(line, 1, 0));
            }
          }
          render();

          return {
            render: (w: any) => container.render(w),
            invalidate: () => container.invalidate(),
            handleInput: (data: string) => {
              const items = buildItems();

              if (data === "\x1b[A" || data === "\x1bOA" || data === "\x1b[[A") {
                cur = cur === 0 ? items.length - 1 : cur - 1;
                render();
                tui.requestRender();
              } else if (data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[[B") {
                cur = cur === items.length - 1 ? 0 : cur + 1;
                render();
                tui.requestRender();
              } else if (data === "\r" || data === "\n" || data === "\x1bOM") {
                const action = items[cur].value;
                if (action === "macos_toggle") {
                  cfg.channels.macos.enabled = !cfg.channels.macos.enabled;
                  saveConfig(cfg);
                  render();
                  tui.requestRender();
                } else {
                  lastIndex = cur;
                  done(cur);
                }
              } else if (data === "\x1b") {
                done(undefined);
              }
            },
          };
        });

        if (result === undefined) break;

        const items = buildItems();
        const action = items[result].value;

        // ── Sub-panels ────────────────────────────────────

        if (action === "bark") {
          await barkSubpanel(ctx, cfg);
        } else if (action === "webhook") {
          await webhookSubpanel(ctx, cfg);
        } else if (action === "triggers") {
          await triggersSubpanel(ctx, cfg);
        }
      }
    },
  });

  // ── Bark sub-panel ──────────────────────────────────────
  async function barkSubpanel(ctx: any, cfg: FullConfig) {
    while (true) {
      const b = cfg.channels.bark;
      const authInfo = b.authUser ? ` (${b.authUser}:***)` : "";
      const items = [
        { label: settingLabel("📱", "Bark enabled", b.enabled), value: "toggle" },
        { label: `🔑 Key: ${b.key || "(not set)"}`, value: "key" },
        { label: `🌐 Server: ${b.server}${authInfo}`, value: "server" },
        { label: `🔐 Auth: ${b.authUser ? `${b.authUser}:***` : "(none)"}`, value: "auth" },
        { label: `🔊 Sound: ${b.sound}`, value: "sound" },
        { label: `📦 Group: ${b.group}`, value: "group" },
        { label: `⚡ Level: ${b.level}`, value: "level" },
        { label: `🔗 Click URL: ${b.url || "(none)"}`, value: "url" },
        { label: `📥 isArchive: ${b.isArchive ?? 1}`, value: "isArchive" },
        { label: "← Back", value: "back" },
      ];

      let cur = 0;
      const choice = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (r: number | undefined) => void) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(
          theme.fg("accent", theme.bold("Bark Configuration")) +
          theme.fg("dim", "  ↑↓ select  Enter confirm  Esc back"),
          1, 0,
        ));
        const listC = new Container();
        container.addChild(listC);
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        function render() {
          listC.clear();
          for (let i = 0; i < items.length; i++) {
            const line = i === cur
              ? theme.fg("accent", "→ " + items[i].label)
              : "  " + items[i].label;
            listC.addChild(new Text(line, 1, 0));
          }
        }
        render();

        return {
          render: (w: any) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "\x1b[A" || data === "\x1bOA" || data === "\x1b[[A") {
              cur = cur === 0 ? items.length - 1 : cur - 1; render(); tui.requestRender();
            } else if (data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[[B") {
              cur = cur === items.length - 1 ? 0 : cur + 1; render(); tui.requestRender();
            } else if (data === "\r" || data === "\n" || data === "\x1bOM") {
              done(cur);
            } else if (data === "\x1b") {
              done(undefined);
            }
          },
        };
      });

      if (choice === undefined) break;

      if (items[choice].value === "back") break;
      if (items[choice].value === "toggle") {
        b.enabled = !b.enabled;
        saveConfig(cfg);
      }
      if (items[choice].value === "key") {
        const k = await ctx.ui.input("Bark device key:", b.key || "");
        if (k !== undefined && k.trim()) { b.key = k.trim(); saveConfig(cfg); ctx.ui.notify("Bark key saved", "info"); }
      }
      if (items[choice].value === "server") {
        const s = await ctx.ui.input("Bark server URL:", b.server);
        if (s !== undefined && s.trim()) { b.server = s.trim(); saveConfig(cfg); ctx.ui.notify("Bark server saved", "info"); }
      }
      if (items[choice].value === "auth") {
        const u = await ctx.ui.input("Auth username (leave empty to clear):", b.authUser || "");
        if (u === undefined) continue;
        if (!u.trim()) { delete b.authUser; delete b.authPass; saveConfig(cfg); ctx.ui.notify("Auth cleared", "info"); continue; }
        b.authUser = u.trim();
        const p = await ctx.ui.input("Auth password:", b.authPass || "");
        if (p !== undefined) { b.authPass = p; saveConfig(cfg); ctx.ui.notify("Auth saved", "info"); }
      }
      if (items[choice].value === "sound") {
        const s = await ctx.ui.input("Sound (e.g. calypso, alarm, birdsong):", b.sound);
        if (s !== undefined && s.trim()) { b.sound = s.trim(); saveConfig(cfg); ctx.ui.notify(`Sound: ${b.sound}`, "info"); }
      }
      if (items[choice].value === "group") {
        const g = await ctx.ui.input("Group name:", b.group);
        if (g !== undefined && g.trim()) { b.group = g.trim(); saveConfig(cfg); ctx.ui.notify(`Group: ${b.group}`, "info"); }
      }
      if (items[choice].value === "level") {
        const levels: Array<"active" | "timeSensitive" | "passive"> = ["active", "timeSensitive", "passive"];
        const idx = levels.indexOf(b.level);
        b.level = levels[(idx + 1) % levels.length];
        saveConfig(cfg);
        ctx.ui.notify(`Level: ${b.level}`, "info");
      }
      if (items[choice].value === "url") {
        const u = await ctx.ui.input("Click URL (leave empty to clear):", b.url || "");
        if (u === undefined) continue;
        b.url = u.trim() || undefined;
        saveConfig(cfg);
        ctx.ui.notify(b.url ? "Click URL saved" : "Click URL cleared", "info");
      }
      if (items[choice].value === "isArchive") {
        b.isArchive = b.isArchive === 1 ? 0 : 1;
        saveConfig(cfg);
        ctx.ui.notify(`isArchive: ${b.isArchive}`, "info");
      }
    }
  }

  // ── Webhook sub-panel ───────────────────────────────────
  async function webhookSubpanel(ctx: any, cfg: FullConfig) {
    while (true) {
      const w = cfg.channels.webhook;
      const items = [
        { label: settingLabel("🔗", "Webhook enabled", w.enabled), value: "toggle" },
        { label: `🌐 URL: ${w.url || "(not set)"}`, value: "url" },
        { label: `📡 Method: ${w.method}`, value: "method" },
        { label: `✏️  Edit body template`, value: "body" },
        { label: `📋 Headers (${Object.keys(w.headers).length})`, value: "headers" },
        { label: `🧪 Test webhook`, value: "test" },
        { label: "← Back", value: "back" },
      ];

      let cur = 0;
      const choice = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (r: number | undefined) => void) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(
          theme.fg("accent", theme.bold("Webhook Configuration")) +
          theme.fg("dim", "  ↑↓ select  Enter confirm  Esc back"),
          1, 0,
        ));
        const listC = new Container();
        container.addChild(listC);
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        function render() {
          listC.clear();
          for (let i = 0; i < items.length; i++) {
            const line = i === cur
              ? theme.fg("accent", "→ " + items[i].label)
              : "  " + items[i].label;
            listC.addChild(new Text(line, 1, 0));
          }
        }
        render();

        return {
          render: (w: any) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "\x1b[A" || data === "\x1bOA" || data === "\x1b[[A") {
              cur = cur === 0 ? items.length - 1 : cur - 1; render(); tui.requestRender();
            } else if (data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[[B") {
              cur = cur === items.length - 1 ? 0 : cur + 1; render(); tui.requestRender();
            } else if (data === "\r" || data === "\n" || data === "\x1bOM") {
              done(cur);
            } else if (data === "\x1b") {
              done(undefined);
            }
          },
        };
      });

      if (choice === undefined) break;

      if (items[choice].value === "back") break;
      if (items[choice].value === "toggle") { w.enabled = !w.enabled; saveConfig(cfg); }
      if (items[choice].value === "url") {
        const u = await ctx.ui.input("Webhook URL:", w.url || "");
        if (u !== undefined && u.trim()) { w.url = u.trim(); saveConfig(cfg); ctx.ui.notify("Webhook URL saved", "info"); }
      }
      if (items[choice].value === "method") {
        w.method = w.method === "POST" ? "GET" : "POST";
        saveConfig(cfg);
        ctx.ui.notify(`Method: ${w.method}`, "info");
      }
      if (items[choice].value === "body") {
        const t = await ctx.ui.editor(w.bodyTemplate);
        if (t !== undefined) { w.bodyTemplate = t; saveConfig(cfg); ctx.ui.notify("Body template saved", "info"); }
      }
      if (items[choice].value === "headers") {
        await headersSubpanel(ctx, cfg);
      }
      if (items[choice].value === "test") {
        if (!w.url) { ctx.ui.notify("Webhook URL not set", "warning"); continue; }
        sendWebhook(w, {
          title: "Test Notification",
          message: "This is a test from pi-all-notification",
          project: projectName || "test",
          timestamp: new Date().toISOString(),
        }).then(() => ctx.ui.notify("Webhook test sent", "info"))
          .catch(() => ctx.ui.notify("Webhook test failed", "error"));
      }
    }
  }

  // ── Headers sub-panel ──────────────────────────────────
  async function headersSubpanel(ctx: any, cfg: FullConfig) {
    while (true) {
      const w = cfg.channels.webhook;
      const entries = Object.entries(w.headers);
      const items = [
        ...entries.map(([k, v]) => ({ label: `  ${k}: ${v}`, value: `edit:${k}` })),
        { label: "+ Add header", value: "add" },
        { label: "← Back", value: "back" },
      ];

      let cur = 0;
      const choice = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (r: number | undefined) => void) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(
          theme.fg("accent", theme.bold("Custom Headers")) +
          theme.fg("dim", "  ↑↓ select  Enter edit/delete  Esc back"),
          1, 0,
        ));
        const listC = new Container();
        container.addChild(listC);
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        function render() {
          listC.clear();
          for (let i = 0; i < items.length; i++) {
            const line = i === cur
              ? theme.fg("accent", "→ " + items[i].label)
              : "  " + items[i].label;
            listC.addChild(new Text(line, 1, 0));
          }
        }
        render();

        return {
          render: (w: any) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "\x1b[A" || data === "\x1bOA" || data === "\x1b[[A") {
              cur = cur === 0 ? items.length - 1 : cur - 1; render(); tui.requestRender();
            } else if (data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[[B") {
              cur = cur === items.length - 1 ? 0 : cur + 1; render(); tui.requestRender();
            } else if (data === "\r" || data === "\n" || data === "\x1bOM") {
              done(cur);
            } else if (data === "\x1b") {
              done(undefined);
            }
          },
        };
      });

      if (choice === undefined) break;

      const action = items[choice].value;
      if (action === "back") break;

      if (action === "add") {
        const key = await ctx.ui.input("Header name:", "");
        if (key === undefined || !key.trim()) continue;
        const val = await ctx.ui.input(`Value for ${key.trim()}:`, "");
        if (val === undefined) continue;
        w.headers[key.trim()] = val;
        saveConfig(cfg);
      } else if (action.startsWith("edit:")) {
        const key = action.slice(5);
        const options = [
          { label: `Edit value: ${w.headers[key]}`, value: "edit" },
          { label: `🗑  Delete "${key}"`, value: "delete" },
        ];
        const subChoice = await ctx.ui.select(`Header "${key}"`, options);
        if (subChoice === "edit") {
          const val = await ctx.ui.input(`Value for ${key}:`, w.headers[key]);
          if (val !== undefined) { w.headers[key] = val; saveConfig(cfg); }
        } else if (subChoice === "delete") {
          delete w.headers[key];
          saveConfig(cfg);
        }
      }
    }
  }

  // ── Triggers sub-panel ──────────────────────────────────
  async function triggersSubpanel(ctx: any, cfg: FullConfig) {
    while (true) {
      const t = cfg.triggers;
      const items = [
        { label: settingLabel("🏁", "agent_end (response complete)", t.agent_end), value: "agent_end" },
        { label: settingLabel("🚀", "agent_start (processing begins)", t.agent_start), value: "agent_start" },
        { label: settingLabel("❌", "tool_error (tool execution error)", t.tool_error), value: "tool_error" },
        { label: "← Back", value: "back" },
      ];

      let cur = 0;
      const choice = await ctx.ui.custom((tui: any, theme: any, _kb: any, done: (r: number | undefined) => void) => {
        const container = new Container();
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(
          theme.fg("accent", theme.bold("Triggers")) +
          theme.fg("dim", "  ↑↓ select  Enter toggle  Esc back"),
          1, 0,
        ));
        const listC = new Container();
        container.addChild(listC);
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        function render() {
          listC.clear();
          for (let i = 0; i < items.length; i++) {
            const line = i === cur
              ? theme.fg("accent", "→ " + items[i].label)
              : "  " + items[i].label;
            listC.addChild(new Text(line, 1, 0));
          }
        }
        render();

        return {
          render: (w: any) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => {
            if (data === "\x1b[A" || data === "\x1bOA" || data === "\x1b[[A") {
              cur = cur === 0 ? items.length - 1 : cur - 1; render(); tui.requestRender();
            } else if (data === "\x1b[B" || data === "\x1bOB" || data === "\x1b[[B") {
              cur = cur === items.length - 1 ? 0 : cur + 1; render(); tui.requestRender();
            } else if (data === "\r" || data === "\n" || data === "\x1bOM") {
              done(cur);
            } else if (data === "\x1b") {
              done(undefined);
            }
          },
        };
      });

      if (choice === undefined) break;

      const action = items[choice].value;
      if (action === "back") break;
      if (action === "agent_end") { t.agent_end = !t.agent_end; saveConfig(cfg); }
      if (action === "agent_start") { t.agent_start = !t.agent_start; saveConfig(cfg); }
      if (action === "tool_error") { t.tool_error = !t.tool_error; saveConfig(cfg); }
    }
  }

  // ── Lifecycle events ────────────────────────────────────
  pi.on("session_start", (_event, ctx) => {
    // Initialize config if not exists
    if (!existsSync(CONFIG_PATH)) {
      saveConfig(DEFAULT_CONFIG);
    }
    projectName = ctx.cwd.split(/[/\\]/).pop() || "";
  });

  pi.on("agent_start", (_event, ctx) => {
    projectName = ctx.cwd.split(/[/\\]/).pop() || "";
    const cfg = loadConfig();
    if (!cfg.triggers.agent_start) return;

    const vars: NotificationVars = {
      title: "pi 🤖 Processing",
      message: `Agent started — ${projectName}`,
      project: projectName,
      emoji: "🤖",
      timestamp: new Date().toISOString(),
    };
    fireAll(cfg, vars);
  });

  pi.on("agent_end", (event, _ctx) => {
    const cfg = loadConfig();
    if (!cfg.triggers.agent_end) return;

    let taskDesc = projectName;
    if (event.messages?.length) {
      for (let i = event.messages.length - 1; i >= 0; i--) {
        const m = event.messages[i] as any;
        if (m.role === "user" && m.content) {
          const raw = typeof m.content === "string" ? m.content.trim() : "";
          const firstLine = raw.split(/\n/)[0] || "";
          taskDesc = firstLine.length > 40 ? firstLine.slice(0, 37) + "..." : firstLine;
          break;
        }
      }
    }

    const vars: NotificationVars = {
      title: "pi ✅ Complete",
      message: taskDesc,
      project: projectName,
      emoji: "✅",
      timestamp: new Date().toISOString(),
    };
    fireAll(cfg, vars);
  });

  pi.on("tool_execution_end", (event, _ctx) => {
    const cfg = loadConfig();
    if (!cfg.triggers.tool_error) return;
    if (!event.isError) return;

    const vars: NotificationVars = {
      title: "pi ❌ Tool Error",
      message: `${event.toolName}: ${String(event.result).slice(0, 80)}`,
      project: projectName,
      emoji: "❌",
      timestamp: new Date().toISOString(),
    };
    fireAll(cfg, vars);
  });
}

// ─── Helpers ───────────────────────────────────────────────────

function truncateUrl(url: string, max = 40): string {
  return url.length > max ? url.slice(0, max - 3) + "..." : url;
}
