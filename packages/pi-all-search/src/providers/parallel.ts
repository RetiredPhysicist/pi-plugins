import type { SearchProvider } from "./types.js";
import { searchParallel } from "./parallel-mcp.js";

// Empty envVar is intentional: this provider has no authenticated mode.
export const PARALLEL_META = { name: "parallel", label: "Parallel (anonymous/free)", envVar: "" };
export class ParallelProvider implements SearchProvider {
  name = "parallel";
  async search(query: string, maxResults: number, signal?: AbortSignal) {
    return { results: await searchParallel(query, maxResults, signal) };
  }
}
