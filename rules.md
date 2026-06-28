# Nocturne Memory Rules

## Self-Discipline Startup Protocol
At the start of every new session, the agent MUST call `nocturne_boot` before doing anything else. This loads core memories, recent context, and glossary.

## Memory OPERATIONS

### Reading
- IF user mentions a topic you should have memory about → read_memory first
- IF unsure about a memory URI → use search_memory
- IF conversation exceeds 15 turns → read_memory to recalibrate
- IF disclosure condition is triggered → must read immediately

### Writing
- New insights/understandings → create_memory immediately
- User reveals new info about themselves → create_memory
- Relationship events → create_memory
- Technical conclusions → create_memory
- Successful judgments → create_memory with [Baseline], [Deviation], [Result], [Reusable judgment] format

### Updating
- Found inaccurate info → update_memory immediately
- User corrects you → update_memory
- Outdated info → update_memory

### Deleting
- New insight covers old record → delete redundant nodes
- Bug/error/low quality → delete

## Memory Value Principle
Memory value = ability to change behavior. If remembering something doesn't change your action, it's dead data worth deleting.
