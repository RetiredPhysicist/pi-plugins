import type { SearchProvider, SearchResult } from "./types.js";

export const TINYFISH_META = { name: "tinyfish", label: "TinyFish", envVar: "TINYFISH_API_KEY" };

const SEARCH_URL = "https://api.search.tinyfish.ai";
const FETCH_URL = "https://api.fetch.tinyfish.ai";

export type TinyFishDomainType = "web" | "news" | "research_paper";

export interface TinyFishSearchOptions {
  domainType?: TinyFishDomainType;
  location?: string;
  language?: string;
  purpose?: string;
  recencyMinutes?: number;
  afterDate?: string;
  beforeDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

/**
 * TinyFish — free web search plus full-browser page fetch.
 *
 * Search and Fetch never draw from the account wallet, but the service keeps
 * every query and fetched URL under `GET /usage`, so treat retrieved content
 * as non-private. Highlights is account-gated; this client does not use it.
 */
export class TinyFishProvider implements SearchProvider {
  name = "tinyfish";
  constructor(private apiKey: string) {}

  async search(
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<{ results: SearchResult[] }> {
    return this.searchWithOptions(query, maxResults, {}, signal);
  }

  /** Map routed intents onto TinyFish's dedicated `domain_type` modes. */
  async searchWithIntent(
    intent: string,
    query: string,
    maxResults: number,
    signal?: AbortSignal,
  ): Promise<{ results: SearchResult[] }> {
    const domainType: TinyFishDomainType | undefined =
      intent === "news" ? "news" : intent === "academic" ? "research_paper" : undefined;
    return this.searchWithOptions(query, maxResults, { domainType }, signal);
  }

  async searchWithOptions(
    query: string,
    maxResults: number,
    options: TinyFishSearchOptions,
    signal?: AbortSignal,
  ): Promise<{ results: SearchResult[] }> {
    const params = new URLSearchParams({ query });
    if (options.domainType && options.domainType !== "web") params.set("domain_type", options.domainType);
    if (options.language) params.set("language", options.language);
    if (options.location) params.set("location", options.location);
    if (options.purpose) params.set("purpose", options.purpose);
    if (options.recencyMinutes) params.set("recency_minutes", String(options.recencyMinutes));
    if (options.afterDate) params.set("after_date", options.afterDate);
    if (options.beforeDate) params.set("before_date", options.beforeDate);
    if (options.includeDomains?.length) params.set("include_domains", options.includeDomains.join(","));
    if (options.excludeDomains?.length) params.set("exclude_domains", options.excludeDomains.join(","));

    const resp = await fetch(`${SEARCH_URL}?${params.toString()}`, {
      headers: { "X-API-Key": this.apiKey },
      signal,
    });
    if (!resp.ok) throw new Error(`TinyFish search HTTP ${resp.status}`);
    return { results: parseTinyFishResults(await resp.json()).slice(0, maxResults) };
  }

  async fetchContent(
    urls: string[],
    options: { format?: "markdown" | "html" | "json"; timeoutMs?: number; purpose?: string } = {},
    signal?: AbortSignal,
  ): Promise<TinyFishFetchResult> {
    const resp = await fetch(FETCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      signal,
      body: JSON.stringify({
        urls,
        format: options.format ?? "markdown",
        ...(options.purpose ? { purpose: options.purpose } : {}),
        ...(options.timeoutMs ? { per_url_timeout_ms: options.timeoutMs } : {}),
      }),
    });
    if (!resp.ok) throw new Error(`TinyFish fetch HTTP ${resp.status}`);
    return (await resp.json()) as TinyFishFetchResult;
  }
}

export function parseTinyFishResults(data: any): SearchResult[] {
  return (data?.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.snippet ?? "",
    ...(r.date ? { publishedAt: r.date } : {}),
    ...(typeof r.cited_by_count === "number" ? { score: r.cited_by_count } : {}),
  }));
}

export interface TinyFishFetchResult {
  results?: Array<{
    url: string;
    final_url?: string;
    title?: string | null;
    description?: string | null;
    language?: string | null;
    format?: string;
    text?: string | null;
    latency_ms?: number | null;
  }>;
  errors?: Array<{ url: string; error: string }>;
}
