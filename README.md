# pi-nocturne-memory

**Nocturne Memory extension for Pi — automated memory management with SessionStart boot protocol.**

## Features

- **SessionStart Boot Protocol** — Automatically calls `read_memory("system://boot")` at session start
- **Memory Rules** — Global rules injected every session for intelligent memory usage
- **5 Memory Tools** — read, create, update, delete, alias, search, manage_triggers

## Install

```bash
pi install npm:pi-nocturne-memory
```

## Configure

Add to `~/.claude/rules.md` or project rules:

```markdown
- nocturne-memory rules (from pi-nocturne-memory extension)
```

## How It Works

1. **SessionStart Hook** — Triggers boot protocol at session start
2. **Agent calls `nocturne_boot`** — Loads system://boot, recent/5, glossary
3. **Global Rules** — Memory operation rules injected every session
4. **Agent uses memory tools** — read/create/update/delete based on rules

## License

MIT
