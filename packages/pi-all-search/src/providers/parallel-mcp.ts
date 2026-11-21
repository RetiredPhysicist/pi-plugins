/** Anonymous Parallel MCP only. Never forward keys/cookies or upgrade to OAuth.
 * Official docs: https://docs.parallel.ai/integrations/mcp/quickstart
 * Stateless tools/call supports JSON and SSE responses; no session is retained.
 */
export const PARALLEL_MCP_URL = "https://mcp.parallel.ai/mcp?tools=web_search,web_fetch";
const TIMEOUT_MS = 12000;
let limitedUntil = 0;

interface Page {
  url: string;
  title?: string;
  excerpts?: string[];
  publish_date?: string | null;
  full_content?: string;
}
interface Payload { results?: Page[] }
interface RpcResponse {
  id?: number;
  error?: unknown;
  result?: {
    isError?: boolean;
    structuredContent?: Payload;
    content?: Array<{ type?: string; text?: string }>;
  };
}

function decodeResponse(text: string): RpcResponse {
  if (text.trimStart().startsWith("{")) return JSON.parse(text);
  // Ignore SSE notifications/keepalives; accept multiline data and CRLF.
  for (const event of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const data = event.split("\n").filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    const message: RpcResponse = JSON.parse(data);
    if (message.id === 1) return message;
  }
  throw new Error("Parallel MCP missing response");
}

async function callTool(name: "web_search" | "web_fetch", args: object, signal?: AbortSignal): Promise<Payload> {
  signal?.throwIfAborted();
  if (Date.now() < limitedUntil) throw new Error("Parallel anonymous rate limit cooldown");
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(PARALLEL_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    credentials: "omit",
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (response.status === 429) {
    const retry = response.headers.get("Retry-After");
    const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry ?? "") - Date.now();
    limitedUntil = Date.now() + Math.min(300000, Math.max(1000, Number.isFinite(delay) ? delay : 60000));
  }
  if (!response.ok) throw new Error(`Parallel MCP HTTP ${response.status}`);
  const rpc = decodeResponse(await response.text());
  // Do not include upstream content in errors (it may contain arbitrary text).
  if (rpc.error || rpc.result?.isError) throw new Error("Parallel MCP tool error");
  const payload: Payload = rpc.result?.structuredContent ?? JSON.parse(
    rpc.result?.content?.find((c) => c.type === "text" && c.text)?.text ?? "{}",
  );
  if (!Array.isArray(payload.results)) throw new Error("Parallel MCP invalid results");
  return payload;
}

export async function searchParallel(query: string, maxResults = 5, signal?: AbortSignal) {
  const payload = await callTool("web_search", {
    objective: `Find reliable web sources relevant to: ${query}`,
    search_queries: [query],
  }, signal);
  const limit = Math.max(1, Math.min(20, Math.trunc(maxResults) || 5));
  return (payload.results ?? []).filter((p) => typeof p.url === "string" && /^https?:\/\//i.test(p.url))
    .slice(0, limit).map((p) => ({
      url: p.url,
      title: typeof p.title === "string" ? p.title : p.url,
      snippet: (Array.isArray(p.excerpts) ? p.excerpts.filter((s) => typeof s === "string").join("\n\n") : "").slice(0, 4000),
      publishedAt: typeof p.publish_date === "string" ? p.publish_date : undefined,
    }));
}

export async function fetchParallel(url: string, signal?: AbortSignal, objective?: string) {
  const payload = await callTool("web_fetch", {
    urls: [url], full_content: true,
    ...(objective ? { objective: objective.slice(0, 200) } : {}),
  }, signal);
  const page = payload.results?.find((p) => p.url === url) ?? payload.results?.[0];
  const content = page?.full_content || page?.excerpts?.join("\n\n");
  return typeof content === "string" && content.trim()
    ? { content: content.slice(0, 50000), title: page?.title } : null;
}
