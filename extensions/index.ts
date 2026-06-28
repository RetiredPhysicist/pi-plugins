import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const BOOT_URIS = [
  "system://boot",
  "system://recent/5",
  "system://glossary",
];

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "nocturne_boot",
    label: "Boot Memory",
    description:
      "Call this at the start of every new session. Loads core memories, recent context, and glossary. This is your self-discipline startup protocol — call it before doing anything else.",
    promptGuidelines: [
      "MUST call this at the start of every new session before any other work.",
      "This loads your core identity, recent context, and trigger glossary.",
      "After booting, check if any disclosure conditions are triggered by the current conversation.",
    ],
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: "🌙 Booting Nocturne Memory..." }],
        details: { phase: "booting" },
      });

      const results: string[] = [];
      const errors: string[] = [];

      for (const uri of BOOT_URIS) {
        try {
          const resp = await fetch(`http://localhost:3000/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: uri,
              method: "tools/call",
              params: { name: "read_memory", arguments: { uri } },
            }),
          });
          const data = await resp.json();
          if (data.result?.content?.[0]?.text) {
            results.push(`=== ${uri} ===\n${data.result.content[0].text}`);
          }
        } catch (err) {
          errors.push(`${uri}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (results.length === 0 && errors.length > 0) {
        return {
          content: [{ type: "text", text: `❌ Failed to boot memory:\n${errors.join("\n")}` }],
          details: { error: errors.join("\n") },
        };
      }

      return {
        content: [{ type: "text", text: results.join("\n\n---\n\n") }],
        details: { booted: results.length, failed: errors.length },
      };
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("🌙 Boot Memory")), 0, 0);
    },

    renderResult(result, _options, theme) {
      const d = result.details as { error?: string; booted?: number } | undefined;
      if (d?.error) return new Text(theme.fg("error", "❌ Boot failed"), 0, 0);
      return new Text(theme.fg("success", `✓ ${d?.booted ?? 0} memory nodes loaded`), 0, 0);
    },
  });
}
