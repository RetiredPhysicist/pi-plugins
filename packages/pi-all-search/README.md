# pi-all-search

**All-in-one web search extension for Pi — exa, tavily, anysearch, tinyfish, deepseek, firecrawl, context7, anonymous Parallel.**

## Install

```bash
pi install npm:pi-all-search
```

## Configure

Set API keys in `~/.pi/agent/extensions/pi-all-search/config.json`:

```json
{
  "apiKeys": {
    "exa": "exa-...",
    "tavily": "tvly-...",
    "anysearch": "as_sk_...",
    "tinyfish": "sk-tinyfish-...",
    "deepseek": "sk-...",
    "firecrawl": "fc-...",
    "context7": "ctx7sk_..."
  },
  "provider": "auto",
  "cacheTtlMs": 300000,
  "maxResults": 5
}
```

Or set environment variables: `EXA_API_KEY`, `TAVILY_API_KEY`, `ANYSEARCH_API_KEY`, `TINYFISH_API_KEY`, `DEEPSEEK_API_KEY`, `FIRECRAWL_API_KEY`, `CONTEXT7_API_KEY`.

Firecrawl works without a key (IP-based free credits). Office NAT / CI sharing an egress IP share the keyless daily credits.

TinyFish Search and Fetch are free with generous rate limits. `web_fetch` tries **DeepSeek** (when `DEEPSEEK_API_KEY` is set) → TinyFish (when `TINYFISH_API_KEY` is set) → anonymous Parallel MCP → [Jina Reader](https://jina.ai/reader) (`r.jina.ai`, no key) → local fetch+extract. Jina is fetch-only; it is not a `web_search` provider.

DeepSeek Search/Fetch use the same `DEEPSEEK_API_KEY` as the chat API (`POST /v1/tools/search` and `POST /v1/tools/fetch`). Billed per successful request with results (see [DeepSeek Search docs](https://api-docs.deepseek.com/guides/search/)).

## Usage

```
web_search({ query: "TypeScript best practices" })
web_search({ queries: ["React vs Vue", "Angular vs Svelte"] })
web_search({ query: "AAPL stock price", provider: "anysearch" })
web_search({ query: "rust async programming", provider: "tavily" })
web_search({ query: "Next.js caching", provider: "context7" })
web_search({ query: "library for incremental PDF parsing", provider: "firecrawl-dev" })
web_search({ query: "DeepSeek V4 发布", provider: "deepseek" })
```

## Providers

| Provider | Best For | Env Var |
|----------|----------|---------|
| **exa** | Academic papers, scholarly search | `EXA_API_KEY` |
| **tavily** | General web, programming, fast results | `TAVILY_API_KEY` |
| **anysearch** | Finance, stocks, structured data | `ANYSEARCH_API_KEY` |
| **tinyfish** | News, current events, academic papers with citations | `TINYFISH_API_KEY` |
| **deepseek** | General + news via DeepSeek Search API | `DEEPSEEK_API_KEY` |
| **firecrawl** | Scraping-heavy sites, fallback | `FIRECRAWL_API_KEY` |
| **firecrawl-dev** | Firecrawl Developer Index: repo discovery, issues, PRs, OpenAPI specs, skills (semantic artifact index) | `FIRECRAWL_API_KEY` |
| **parallel** | Free anonymous web search fallback | None (never uses a key) |
| **context7** | Library/framework/API documentation | `CONTEXT7_API_KEY` |

## Routing

Automatic intent-based routing:
- **Finance queries** → anysearch → exa → tavily → deepseek
- **Academic queries** → tinyfish → exa → anysearch → tavily → deepseek
- **News queries** → deepseek → tinyfish → tavily → anysearch → exa
- **General queries** → deepseek → tavily → tinyfish → anysearch → exa → firecrawl
- **Docs queries** → context7 → exa → tavily → deepseek
- **Technical queries** (github/repo/issue/PR/commit) → firecrawl-dev → firecrawl → exa → tavily → deepseek

Each automatic search route appends **Parallel** after its existing sources. Override with `provider="parallel"` for a free anonymous search directly, or `provider="exa"` etc. to preserve your chosen source.

Every provider is optional. With no keys at all, keyless Firecrawl and anonymous Parallel are available; add keys in any combination and the router uses whichever providers are available.

## License

MIT

## Parallel: anonymous/free only

- Official MCP: `https://mcp.parallel.ai/mcp?tools=web_search,web_fetch`.
- Always registered with no credentials. This implementation never reads a Parallel key, sends Authorization/API-key/cookie headers, signs in, or upgrades to paid APIs. Even a `PARALLEL_API_KEY` in the environment is ignored.
- Search is a final fallback; existing source priorities remain unchanged. Fetch tries existing DeepSeek/TinyFish **if previously configured**, then Parallel → Jina → local.
- 12-second request timeout (including body), caller cancellation, and no retries. HTTP 429 sets a shared search/fetch cooldown using Retry-After (1 second–5 minutes; default 60 seconds); routing continues through existing fallbacks on failure/miss. Anonymous quota is shared/limited and not an uptime guarantee.
- This change does **not** add or enable DeepSeek keys. The existing DeepSeek integration is paid ($0.75/1,000 successful Search or Fetch requests); a previously configured `DEEPSEEK_API_KEY` still enables it. Use `provider="parallel"` **without other configured paid keys** for a free-only setup; automatic fallback can otherwise use your existing paid providers.
- OAuth/API-key Parallel requests are billable after account credits; they are intentionally unsupported here. No connector installation or authentication is required.
- Update/install this source package and reload Pi. This commit does not publish an npm release or update remote machines.

Official behavior and billing: https://docs.parallel.ai/integrations/mcp/quickstart
