import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { loadConfig, resolveApiKey } from "./config.js";
import { TINYFISH_META, TinyFishProvider } from "./providers/tinyfish.js";

interface FetchDetails {
  url: string;
  provider: "tinyfish" | "jina" | "local";
  length: number;
  contentType?: string;
  error?: string;
}

const JINA_READER_PREFIX = "https://r.jina.ai/";

/** True if the URL is already a Jina Reader (or search) URL — avoid double-wrapping. */
export function isJinaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "r.jina.ai" || host === "s.jina.ai" || host.endsWith(".jina.ai");
  } catch {
    return false;
  }
}

/** Build the Jina Reader proxy URL for a target page. */
export function jinaReaderUrl(url: string): string {
  return `${JINA_READER_PREFIX}${url}`;
}

async function fetchWithTinyFish(
  url: string,
  apiKey: string,
  prompt?: string,
): Promise<{ content: string; title?: string } | null> {
  const provider = new TinyFishProvider(apiKey);
  const data = await provider.fetchContent([url], { timeoutMs: 45000, purpose: prompt });
  const page = data.results?.find((r) => r.text);
  if (!page?.text) return null;
  const error = data.errors?.find((e) => e.url === url);
  if (error) return null;
  return { title: page.title ?? undefined, content: page.text };
}

/** Fetch readable markdown/text via Jina Reader. Returns null on miss so callers can fall through. */
export async function fetchWithJina(
  url: string,
  signal?: AbortSignal,
): Promise<{ content: string } | null> {
  if (isJinaUrl(url)) return null;

  const resp = await fetch(jinaReaderUrl(url), {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PiAllSearch/1.0)",
      Accept: "text/markdown,text/plain,*/*",
      "X-Return-Format": "markdown",
    },
    signal,
  });

  if (!resp.ok) return null;

  const text = (await resp.text()).trim();
  if (!text) return null;

  return { content: text.slice(0, 50000) };
}

export function registerExtractTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "web_fetch",
    label: "Fetch URL",
    description:
      "Fetch a URL and extract readable content as markdown. Handles GitHub repos, YouTube videos, PDFs, and regular web pages. Use after web_search to read full page content.",
    promptGuidelines: [
      "Use web_fetch after web_search to read full page content when snippets are insufficient.",
      "Use web_fetch when the user provides a URL directly.",
      "Use web_fetch to verify specific claims from original sources.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch. Must start with http:// or https://." }),
      prompt: Type.Optional(
        Type.String({
          description: "Question to ask about the page content (improves relevance for YouTube/videos).",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const config = loadConfig();
      const url = params.url;
      const prompt = params.prompt;

      const tinyFishKey = resolveApiKey(TINYFISH_META.name, TINYFISH_META.envVar, config);
      if (tinyFishKey) {
        try {
          const page = await fetchWithTinyFish(url, tinyFishKey, prompt);
          if (page?.content) {
            const details: FetchDetails = { url, provider: "tinyfish", length: page.content.length };
            return {
              content: [{ type: "text", text: page.content }],
              details,
            };
          }
        } catch {
          // fall through to Jina Reader
        }
      }

      try {
        const jina = await fetchWithJina(url, signal);
        if (jina?.content) {
          const details: FetchDetails = { url, provider: "jina", length: jina.content.length };
          return {
            content: [{ type: "text", text: jina.content }],
            details,
          };
        }
      } catch {
        // fall through to the local extractor
      }

      try {
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; PiAllSearch/1.0)",
            Accept: "text/html,application/json,application/markdown,text/plain,*/*",
          },
          signal,
        });

        const contentType = resp.headers.get("content-type") ?? "";

        if (!resp.ok) {
          const details: FetchDetails = {
            url,
            provider: "local",
            length: 0,
            contentType,
            error: `HTTP ${resp.status}`,
          };
          return {
            content: [{ type: "text", text: `Failed to fetch ${url}: ${resp.status} ${resp.statusText}` }],
            details,
          };
        }

        const text = await resp.text();

        let content: string;
        if (contentType.includes("application/json")) {
          try {
            const json = JSON.parse(text);
            content = "```json\n" + JSON.stringify(json, null, 2) + "\n```";
          } catch {
            content = text.slice(0, 50000);
          }
        } else if (contentType.includes("text/html")) {
          content = htmlToMarkdown(text);
        } else {
          content = text.slice(0, 50000);
        }

        return {
          content: [{ type: "text", text: content }],
          details: { url, provider: "local", contentType, length: content.length } satisfies FetchDetails,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error fetching ${url}: ${message}` }],
          details: { url, provider: "local", length: 0, error: message } satisfies FetchDetails,
        };
      }
    },

    renderCall(args, theme) {
      const url = (args.url as string) ?? "";
      const display = url.length > 60 ? `${url.slice(0, 57)}...` : url;
      return new Text(theme.fg("toolTitle", theme.bold("Fetch ")) + theme.fg("accent", display), 0, 0);
    },

    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);
      const d = result.details as FetchDetails | undefined;
      if (d?.error) return new Text(theme.fg("error", d.error), 0, 0);
      const len = d?.length ?? 0;
      const via =
        d?.provider === "tinyfish" ? " via TinyFish" : d?.provider === "jina" ? " via Jina" : "";
      return new Text(theme.fg("success", `✓ ${len} chars fetched${via}`), 0, 0);
    },
  });
}

function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<ul[^>]*>/gi, "\n");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "\n");
  md = md.replace(/<\/ol>/gi, "\n");

  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*>(.*?)<\/pre>/gis, "```\n$1\n```\n\n");

  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<div[^>]*>(.*?)<\/div>/gi, "$1\n");

  md = md.replace(/<[^>]+>/g, "");

  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md.slice(0, 50000);
}
