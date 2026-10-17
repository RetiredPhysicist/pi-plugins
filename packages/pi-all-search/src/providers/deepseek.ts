import type { SearchProvider, SearchResult } from "./types.js";

export const DEEPSEEK_META = { name: "deepseek", label: "DeepSeek", envVar: "DEEPSEEK_API_KEY" };

const SEARCH_URL = "https://api.deepseek.com/v1/tools/search";
const FETCH_URL = "https://api.deepseek.com/v1/tools/fetch";

export interface DeepSeekSearchHit {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  date?: string | null;
  rerank_score?: number;
}

/** Map DeepSeek Search API hits to the shared SearchResult shape. */
export function parseDeepSeekResults(data: { results?: DeepSeekSearchHit[] } | undefined): SearchResult[] {
  return (data?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.summary || r.snippet || "").trim(),
    ...(r.date ? { publishedAt: r.date } : {}),
    ...(typeof r.rerank_score === "number" ? { score: r.rerank_score } : {}),
  }));
}

export class DeepSeekProvider implements SearchProvider {
  name = "deepseek";
  constructor(private apiKey: string) {}

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<{ results: SearchResult[] }> {
    const count = Math.min(Math.max(maxResults, 1), 50);
    const resp = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, count, need_content: false }),
      signal,
    });
    if (!resp.ok) throw new Error(`DeepSeek search HTTP ${resp.status}`);
    const data = (await resp.json()) as { results?: DeepSeekSearchHit[] };
    return { results: parseDeepSeekResults(data).slice(0, maxResults) };
  }
}

/** Fetch a single URL as markdown via DeepSeek tools/fetch. Returns null on miss so callers can fall through. */
export async function fetchWithDeepSeek(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ title?: string; content: string } | null> {
  const resp = await fetch(FETCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
    signal,
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { title?: string; content?: string };
  const content = (data.content ?? "").trim();
  if (!content) return null;
  return {
    title: data.title || undefined,
    content: content.slice(0, 50000),
  };
}
