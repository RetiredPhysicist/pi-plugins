import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "extensions", "pi-nocturne-memory", "config.json");

function loadConfig(): { mcpUrl?: string; mcpAuth?: string } {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

const config = loadConfig();
const MCP_URL = config.mcpUrl;
const MCP_AUTH = config.mcpAuth;
if (!MCP_URL) {
  throw new Error("mcpUrl is required in config.json");
}
if (!MCP_AUTH) {
  throw new Error("mcpAuth is required in config.json");
}

const BOOT_URIS = ["system://boot", "system://recent/5", "system://glossary"];

let sessionId: string | null = null;

async function initializeSession(): Promise<string | null> {
  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: MCP_AUTH,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "init-" + Date.now(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "pi-nocturne-memory", version: "1.0.0" },
      },
    }),
  });

  const sid = resp.headers.get("mcp-session-id");
  return sid;
}

async function callMCP(method: string, params: Record<string, unknown>): Promise<any> {
  if (!sessionId) {
    sessionId = await initializeSession();
    if (!sessionId) {
      return { error: { code: -1, message: "Failed to initialize MCP session" } };
    }
  }

  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: MCP_AUTH,
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: method + Date.now(), method, params }),
  });

  // Check for new session ID in response
  const newSid = resp.headers.get("mcp-session-id");
  if (newSid) {
    sessionId = newSid;
  }

  const text = await resp.text();
  const lines = text.split(/\r?\n/);
  let currentData = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      currentData = trimmed.slice(6);
    } else if (trimmed.startsWith("event: ")) {
      // ignore event type
    } else if (trimmed === "" && currentData) {
      try {
        const parsed = JSON.parse(currentData);
        if (parsed.result || parsed.error) {
          return parsed;
        }
      } catch {
        // continue
      }
      currentData = "";
    }
  }

  if (currentData) {
    try {
      return JSON.parse(currentData);
    } catch {
      // ignore
    }
  }

  return null;
}

function extractText(data: any): string {
  return data?.result?.content?.[0]?.text ?? "";
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "nocturne_boot",
    label: "Boot Memory",
    description:
      "Call at session start. Loads core memories, recent context, and glossary. Self-discipline startup protocol.",
    promptGuidelines: [
      "MUST call at session start before any other work.",
      "Loads core identity, recent context, and trigger glossary.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "🌙 Booting..." }], details: { phase: "booting" } });

      const results: string[] = [];
      const errors: string[] = [];

      for (const uri of BOOT_URIS) {
        try {
          const data = await callMCP("tools/call", { name: "read_memory", arguments: { uri } });
          if (data?.result?.content?.[0]?.text) {
            results.push(`=== ${uri} ===\n${data.result.content[0].text}`);
          } else if (data?.error) {
            errors.push(`${uri}: ${data.error.message}`);
          }
        } catch (err) {
          errors.push(`${uri}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return { content: [{ type: "text", text: `❌ ${errors.join("\n")}` }], details: { error: errors.join("\n") } };
      }

      return { content: [{ type: "text", text: results.join("\n\n---\n\n") }], details: { booted: results.length } };
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("🌙 Boot")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const d = result.details as { error?: string; booted?: number } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ Boot failed"), 0, 0);
      return new Text(theme.fg("success", `✓ ${d?.booted ?? 0} nodes loaded`), 0, 0);
    },
  });

  pi.registerTool({
    name: "nocturne_read",
    label: "Read Memory",
    description: "Read a memory by URI. Use system:// URIs or memory paths like core://agent.",
    parameters: Type.Object({
      uri: Type.String({ description: "Memory URI (e.g., core://agent, system://boot)" }),
    }),

    async execute(_toolCallId, params) {
      const data = await callMCP("tools/call", { name: "read_memory", arguments: { uri: params.uri } });
      return { content: [{ type: "text", text: extractText(data) || "No content" }] };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("📖 ")) + theme.fg("accent", (args.uri as string) ?? ""), 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = (result.content?.[0] as any)?.text ?? "";
      return new Text(theme.fg("success", `✓ ${text.length} chars`), 0, 0);
    },
  });

  pi.registerTool({
    name: "nocturne_search",
    label: "Search Memory",
    description: "Search memories by keywords in path and content.",
    parameters: Type.Object({
      query: Type.String({ description: "Search keywords" }),
      domain: Type.Optional(Type.String({ description: "Domain filter (e.g., core, writer)" })),
    }),

    async execute(_toolCallId, params) {
      const args: Record<string, unknown> = { query: params.query };
      if (params.domain) args.domain = params.domain;
      const data = await callMCP("tools/call", { name: "search_memory", arguments: args });
      return { content: [{ type: "text", text: extractText(data) || "No results" }] };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("🔍 ")) + theme.fg("accent", (args.query as string) ?? ""), 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = (result.content?.[0] as any)?.text ?? "";
      const lines = text.split("\n").filter(Boolean).length;
      return new Text(theme.fg("success", `✓ ${lines} results`), 0, 0);
    },
  });

  pi.registerTool({
    name: "nocturne_create",
    label: "Create Memory",
    description: "Create a new memory node. Include [Baseline], [Deviation], [Result], [Reusable judgment] for behavior records.",
    parameters: Type.Object({
      parent_uri: Type.String({ description: "Parent URI (e.g., core://)" }),
      content: Type.String({ description: "Memory content (Markdown supported)" }),
      priority: Type.Number({ description: "Priority (0=highest)", default: 2 }),
      disclosure: Type.String({ description: "When to recall this memory (e.g., 'When discussing X')" }),
      title: Type.Optional(Type.String({ description: "Path name (a-z, 0-9, _, -)" })),
    }),

    async execute(_toolCallId, params) {
      const data = await callMCP("tools/call", {
        name: "create_memory",
        arguments: {
          parent_uri: params.parent_uri,
          content: params.content,
          priority: params.priority,
          disclosure: params.disclosure,
          ...(params.title ? { title: params.title } : {}),
        },
      });
      return { content: [{ type: "text", text: extractText(data) || "Created" }] };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("➕ Create")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = (result.content?.[0] as any)?.text ?? "";
      return new Text(theme.fg("success", text.slice(0, 100)), 0, 0);
    },
  });

  pi.registerTool({
    name: "nocturne_update",
    label: "Update Memory",
    description: "Update existing memory. Use patch mode (old_string/new_string) or append mode.",
    parameters: Type.Object({
      uri: Type.String({ description: "Memory URI to update" }),
      old_string: Type.Optional(Type.String({ description: "Text to replace (patch mode)" })),
      new_string: Type.Optional(Type.String({ description: "Replacement text (patch mode)" })),
      append: Type.Optional(Type.String({ description: "Text to append (append mode)" })),
      priority: Type.Optional(Type.Number({ description: "New priority" })),
      disclosure: Type.Optional(Type.String({ description: "New disclosure condition" })),
    }),

    async execute(_toolCallId, params) {
      const args: Record<string, unknown> = { uri: params.uri };
      if (params.old_string) args.old_string = params.old_string;
      if (params.new_string) args.new_string = params.new_string;
      if (params.append) args.append = params.append;
      if (params.priority !== undefined) args.priority = params.priority;
      if (params.disclosure) args.disclosure = params.disclosure;

      const data = await callMCP("tools/call", { name: "update_memory", arguments: args });
      return { content: [{ type: "text", text: extractText(data) || "Updated" }] };
    },

    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("✏️ Update")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const text = (result.content?.[0] as any)?.text ?? "";
      return new Text(theme.fg("success", text.slice(0, 100)), 0, 0);
    },
  });
}
