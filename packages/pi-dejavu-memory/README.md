# pi-dejavu-memory

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="pi-dejavu-memory — SessionStart boot protocol + memory tools for Pi">
</p>

**DejaVu extension for Pi — automated memory management with SessionStart boot protocol.**

Agent-side companion to a DejaVu MCP memory server on Cloudflare. Also available for dsh: [dsh-dejavu-memory](https://github.com/RetiredPhysicist/dsh-plugins/tree/main/packages/dsh-dejavu-memory).

The [OpenAI/Codex plugin](https://github.com/RetiredPhysicist/openai-plugins/tree/main/plugins/dejavu-memory) is the only client that opens the interactive memory graph. Pi uses the same server and boot protocol through tools only; there is no graph UI or direct MCP setup for end users here.

<p align="center">
  <img src="./assets/readme/dejavu-memory-graph.webp" width="100%" alt="The OpenAI/Codex DejaVu Memory plugin showing the memory tree as an interactive graph">
</p>

<p align="center">
  <img src="./assets/readme/dejavu-memory-inspector.webp" width="100%" alt="The OpenAI/Codex DejaVu Memory plugin inspector showing a node, its metadata, body text, and subtree">
</p>

## Features

- **SessionStart Boot Protocol** — the hook emits `DEJAVU_BOOT_REQUIRED`; the agent then calls `dejavu_boot` (reads `system://boot`, `system://recent/5`, `system://triggers`, then best-effort `system://briefing`) and reads `system://focus` to resume active working trees (`recent` is a briefing subset, so no need to re-read it after boot)
- **Memory Rules** — global rules injected every session for intelligent memory usage (write-judgement, update-over-create, trigger discipline)
- **Memory Tools** — `dejavu_boot`, `dejavu_read`, `dejavu_create`, `dejavu_update`, `dejavu_delete`, `dejavu_search`

## Install

```bash
pi install npm:pi-dejavu-memory
```

## Configure

Add to `~/.claude/rules.md` or project rules:

```markdown
- DejaVu memory rules (from pi-dejavu-memory extension)
```

Set your MCP endpoint in `~/.pi/agent/extensions/pi-dejavu-memory/config.json`:

```json
{ "mcpUrl": "https://dejavu.example.com/mcp", "mcpHeaders": { "CF-Access-Client-Id": "<service-token-id>", "CF-Access-Client-Secret": "<service-token-secret>" } }
```

For servers behind Cloudflare Access (e.g. dejavu.example.com), pass the **service token** headers instead of `mcpAuth`:

```json
{
  "mcpUrl": "https://dejavu.example.com/mcp",
  "mcpHeaders": {
    "CF-Access-Client-Id": "your-client-id",
    "CF-Access-Client-Secret": "your-client-secret"
  }
}
```

`mcpHeaders` is merged into every MCP request; `mcpAuth` (Authorization) can be combined if the server also accepts it.

Without a config file, the extension also accepts `DEJAVU_MCP_URL` and `DEJAVU_MCP_AUTH`.

## How It Works

1. **SessionStart Hook** — emits `DEJAVU_BOOT_REQUIRED`
2. **Agent calls `dejavu_boot`** — loads `system://boot`, `system://recent/5`, `system://triggers`, then best-effort `system://briefing`
3. **Agent reads `system://focus`** — resume active working trees (`recent` already covered by boot/briefing)
4. **Global Rules** — memory operation rules injected every session
5. **Agent uses memory tools** — read/create/update/delete based on rules

## Tool naming

The `dejavu_boot` / `dejavu_read` prefixes make the memory tools explicit in the tool list and in the boot protocol, so agents call them directly instead of probing for a generic resource first.

## License

MIT

## Related

- [dejavu-memory for ChatGPT and Codex](https://github.com/RetiredPhysicist/openai-plugins/tree/main/plugins/dejavu-memory) — same memory server, with the interactive graph UI
- [dsh-dejavu-memory](https://github.com/RetiredPhysicist/dsh-plugins/tree/main/packages/dsh-dejavu-memory) — same memory tools for dsh
