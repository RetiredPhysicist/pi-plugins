<div align="center">

<img src="https://raw.githubusercontent.com/slahser/pi-atuin/main/screenshot.png" alt="pi-atuin preview" width="100%" />

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
git clone https://github.com/slahser/pi-atuin.git
cd pi-atuin && pi install .
```

## Setup

### Full atuin integration (recommended)

```bash
# Install atuin (if not already)
curl --proto '=https' --tlsv1.2 -LsSf https://setup.atuin.sh | sh

# Register / login
atuin register -u <username> -e <email>

# Install pi hook (tracks bash commands in atuin)
atuin hook install pi
```

With this, pi prompts and bash commands sync bidirectionally to atuin DB. Search in either pi or your shell.

### JSONL-only (no atuin)

No setup needed. History stored in `~/.pi/agent/pi-history.jsonl`.

## Usage

1. Press **↑** when your input is empty (or cursor is on the first line)
2. Type to fuzzy-filter
3. **↑↓** to navigate, **Enter** to select, **Esc** to cancel

All pi prompts are recorded automatically. Supports bash, zsh, and fish.

## Privacy

- History file permissions: `600` (owner-only)
- Max 1,000 entries, auto-trimmed
- Atuin calls use `execFile` (no shell injection)
- No hardcoded credentials or keys

## License

MIT

---

Built for [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent). Inspired by [atuin](https://github.com/atuinsh/atuin).
