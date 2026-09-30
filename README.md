# pi-all-search

**All-in-one web search extension for Pi — exa, tavily, anysearch, tinyfish, firecrawl, context7.**

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
    "firecrawl": "fc-...",
    "context7": "ctx7sk_..."
  },
  "provider": "auto",
  "cacheTtlMs": 300000,
  "maxResults": 5
}
```

Or set environment variables: `EXA_API_KEY`, `TAVILY_API_KEY`, `ANYSEARCH_API_KEY`, `TINYFISH_API_KEY`, `FIRECRAWL_API_KEY`, `CONTEXT7_API_KEY`.

Firecrawl works without a key (IP-based free credits). Office NAT / CI sharing an egress IP share the keyless daily credits.

TinyFish Search and Fetch are free with generous rate limits. When `TINYFISH_API_KEY` is set, `web_fetch` renders JavaScript-heavy pages through TinyFish before falling back to the built-in extractor.

## Usage

```
web_search({ query: "TypeScript best practices" })
web_search({ queries: ["React vs Vue", "Angular vs Svelte"] })
web_search({ query: "AAPL stock price", provider: "anysearch" })
web_search({ query: "rust async programming", provider: "tavily" })
web_search({ query: "Next.js caching", provider: "context7" })
web_search({ query: "library for incremental PDF parsing", provider: "firecrawl-dev" })
```

## Providers

| Provider | Best For | Env Var |
|----------|----------|---------|
| **exa** | Academic papers, scholarly search | `EXA_API_KEY` |
| **tavily** | General web, programming, fast results | `TAVILY_API_KEY` |
| **anysearch** | Finance, stocks, structured data | `ANYSEARCH_API_KEY` |
| **tinyfish** | News, current events, academic papers with citations | `TINYFISH_API_KEY` |
| **firecrawl** | Scraping-heavy sites, fallback | `FIRECRAWL_API_KEY` |
| **firecrawl-dev** | Firecrawl Developer Index: repo discovery, issues, PRs, OpenAPI specs, skills (semantic artifact index) | `FIRECRAWL_API_KEY` |
| **context7** | Library/framework/API documentation | `CONTEXT7_API_KEY` |

## Routing

Automatic intent-based routing:
- **Finance queries** → anysearch → exa → tavily
- **Academic queries** → tinyfish → exa → anysearch → tavily
- **News queries** → tinyfish → tavily → anysearch → exa
- **General queries** → tavily → tinyfish → anysearch → exa → firecrawl
- **Docs queries** → context7 → exa → tavily
- **Technical queries** (github/repo/issue/PR/commit) → firecrawl-dev → firecrawl → exa → tavily

Override with `provider="exa"` etc.

Every provider is optional. With no keys at all, keyless Firecrawl still answers queries; add keys in any combination and the router uses whichever providers are available.

## License

MIT
