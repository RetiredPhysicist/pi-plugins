// ─── Search Provider Interface ────────────────────────────────────────
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
}

export interface SearchProvider {
  name: string;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<{ results: SearchResult[] }>;
  research?(query: string, signal?: AbortSignal): Promise<string>;
  verticalSearch?(domain: string, subDomain: string, query: string, maxResults: number, signal?: AbortSignal): Promise<{ results: SearchResult[] }>;
  /**
   * Provider-specific search tuned to a routed intent. Implemented by providers
   * whose API exposes a matching mode (e.g. TinyFish `domain_type`). The router
   * falls back to `search` when a provider does not implement this.
   */
  searchWithIntent?(intent: string, query: string, maxResults: number, signal?: AbortSignal): Promise<{ results: SearchResult[] }>;
}

export interface ProviderMeta {
  name: string;
  label: string;
  envVar: string;
}
