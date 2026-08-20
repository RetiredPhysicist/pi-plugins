# Noc Memory Rules

## Self-Discipline Startup Protocol
At the start of every new session, the agent MUST call `noc_boot` before doing anything else. This loads core memories, recent context, glossary, and today's working-memory briefing.

## Mechanism: pull, not push
Memory is never pushed into context. Only the boot layer is always present; everything else arrives only when you actively `read` or `search`.

- The **boot layer** (`system://boot`) carries core identity + recent context + trigger glossary.
- **Disclosure** is a "should I read this node?" hint — it only fires for nodes already in view, it is not an automatic trigger, and it never scans the user's live input.
- **Trigger keywords** surface related memories in the GLOSSARY section of whatever you read. They build links between memories; they do not catch user messages.
- **Hard facts** (red lines, identity, key preferences) must live in boot-layer node content — a memory that only hangs on disclosure or a trigger keyword will not be reliably recalled.

## Memory OPERATIONS

### Reading
- IF user mentions a topic you should have memory about → `noc_read` first
- IF unsure about a memory URI → use `noc_search` (literal match — use words close to the original text), never guess a URI
- IF conversation exceeds 15 turns → `noc_read` to recalibrate
- IF a disclosure condition in view is triggered → must read immediately

### Writing
Judge: **does this change your future behavior?** If no, don't write it.
- New insights/understandings → `noc_create`
- User reveals new info about themselves → `noc_create`
- Relationship events → `noc_create`
- Technical conclusions reusable across sessions → `noc_create`
- Successful judgments → `noc_create` with [Baseline], [Deviation], [Result], [Reusable judgment] format
- **Prefer `noc_update` over `noc_create`**: identity is the URI, not the Memory ID — if the topic already has a node, update it.

Choose `parent_uri` by where you would naturally look for this memory when you need it. A child's disclosure only shows when its parent is read — wrong parent = never recalled. Add extra entry points with `add_alias`.

`priority`: non-negative integer, lower = more important. Boot-layer/red-line facts get small numbers; corner knowledge gets larger ones.

### Updating
- Found inaccurate info → `noc_update` immediately
- User corrects you → `noc_update`
- Outdated info → `noc_update`
- When you say "I understand / from now on I should…", stop and check: does the memory exist? No → create. Yes but stale → update.

### Deleting
- New insight covers old record → delete redundant nodes
- Bug/error/low quality → delete
- Always `noc_read` the full node before deleting (never judge by URI/title alone)
- Deleting a node with children: system may return orphans to handle first — follow the list

### Conflict handling
Never keep two conflicting versions. When a read surfaces a conflict with an existing memory, resolve it with `noc_update` — merge or supersede, don't keep both and pick by priority later.

## Memory Value Principle
Memory value = ability to change behavior. If remembering something doesn't change your action, it's dead data worth deleting.
