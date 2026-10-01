<div align="center">

<img src="https://raw.githubusercontent.com/RealAlexandreAI/pi-atuin/main/screenshot.png" alt="pi-atuin preview" width="100%" />

# pi-atuin

**Atuin-style fuzzy history search for [Pi](https://github.com/earendil-works/pi-coding-agent)**

Press ↑ to search previous prompts with fuzzy matching. Backed by atuin DB + local JSONL.

</div>

---

## Install

```bash
pi install npm:pi-atuin
```

Or from source:

```bash
git clone https://github.com/RealAlexandreAI/pi-atuin.git
cd pi-atuin && pi install .
```

## Setup

### Full atuin integration (recommended)

```bash
# Install atuin (if not already)
curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh

# Register / login
atuin register -u <username> -e <email>
```

pi-atuin records history into atuin automatically — no `atuin hook install pi` needed. That hook registers a conflicting `bash` tool and breaks extensions like [pi-tool-display](https://github.com/MasuRii/pi-tool-display).

If you previously ran `atuin hook install pi`, remove the hook extension:

```bash
rm ~/.pi/agent/extensions/atuin.ts
pi /reload
```

With atuin installed, history syncs bidirectionally. Search in either pi (↑) or your shell (`atuin search`).

### JSONL-only (no atuin)

No setup needed. Pi prompts are stored in `~/.pi/agent/pi-history.jsonl`.

## What gets recorded

| Source | JSONL (↑ search) | Atuin DB |
|--------|------------------|----------|
| Your pi prompts | Yes | Yes |
| Agent `bash` tool calls | No | Yes (default on) |
| Your `!` shell commands | No | Yes |

- **Prompts** always go to JSONL and atuin (when installed).
- **Agent bash** is recorded to atuin only (not mixed into ↑ prompt search). On by default; `/atuin record-agent-history` toggles it.
- **`!` commands** are your direct shell input in pi — tracked in atuin, not JSONL.

## Usage

### History search

1. Press **↑** when the input is empty
2. Type to fuzzy-filter
3. **↑↓** to navigate, **Enter** to select, **Esc** to cancel

### Commands

```text
/atuin record-agent-history   # toggle agent bash → atuin, shows on/off
```

Settings persist in `~/.pi/agent/extensions/pi-atuin/config.json`.

## Privacy

- History file permissions: `600` (owner-only)
- Max 1,000 JSONL entries, auto-trimmed
- Atuin calls use `execFile` / `pi.exec` (no shell injection)
- No hardcoded credentials or keys

## License

MIT

---

Built for [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent). Inspired by [atuin](https://github.com/atuinsh/atuin).
