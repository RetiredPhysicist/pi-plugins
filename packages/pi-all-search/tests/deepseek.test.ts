import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import {
  DEEPSEEK_META,
  DeepSeekProvider,
  fetchWithDeepSeek,
  parseDeepSeekResults,
} from "../src/providers/deepseek.js";
import { createAvailableProviders, PROVIDERS } from "../src/providers/index.js";
import { routeIntent } from "../src/router.js";
import type { SearchProvider } from "../src/providers/types.js";

describe("deepseek registration", () => {
  test("is listed in PROVIDERS metadata", () => {
    assert.ok(PROVIDERS.some((p) => p.name === "deepseek"));
    assert.equal(DEEPSEEK_META.envVar, "DEEPSEEK_API_KEY");
  });

  test("is registered only when a key is present", () => {
    assert.equal(createAvailableProviders({}).has("deepseek"), false);
    assert.equal(createAvailableProviders({ deepseek: "sk-test" }).has("deepseek"), true);
  });
});

describe("parseDeepSeekResults", () => {
  test("prefers summary over snippet and maps date/score", () => {
    const out = parseDeepSeekResults({
      results: [
        {
          title: "T",
          url: "https://t.com",
          snippet: "short",
          summary: "long summary for the model",
          date: "2026-06-01T00:00:00+00:00",
          rerank_score: 2.4,
        },
      ],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "T");
    assert.equal(out[0].url, "https://t.com");
    assert.equal(out[0].snippet, "long summary for the model");
    assert.equal(out[0].publishedAt, "2026-06-01T00:00:00+00:00");
    assert.equal(out[0].score, 2.4);
  });

  test("falls back to snippet when summary missing", () => {
    const out = parseDeepSeekResults({
      results: [{ title: "A", url: "https://a.com", snippet: "snip only" }],
    });
    assert.equal(out[0].snippet, "snip only");
  });

  test("handles empty payload", () => {
    assert.deepEqual(parseDeepSeekResults({}), []);
    assert.deepEqual(parseDeepSeekResults(undefined), []);
  });
});

describe("DeepSeekProvider search", () => {
  test("posts Bearer auth and maps results", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "DeepSeek V4",
              url: "https://example.com/v4",
              summary: "released",
              snippet: "short",
              date: "2026-06-01T00:00:00+00:00",
              rerank_score: 2.1,
            },
          ],
        }),
        { status: 200 },
      );
    });
    try {
      const r = await new DeepSeekProvider("sk-test").search("DeepSeek V4", 5);
      assert.equal(captured!.url, "https://api.deepseek.com/v1/tools/search");
      assert.equal(captured!.init!.method, "POST");
      const headers = captured!.init!.headers as Record<string, string>;
      assert.equal(headers.Authorization, "Bearer sk-test");
      const body = JSON.parse(captured!.init!.body as string);
      assert.equal(body.query, "DeepSeek V4");
      assert.equal(body.count, 5);
      assert.equal(body.need_content, false);
      assert.equal(r.results.length, 1);
      assert.equal(r.results[0].snippet, "released");
      assert.equal(r.results[0].score, 2.1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("throws on HTTP 401", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
    try {
      await assert.rejects(() => new DeepSeekProvider("bad").search("x", 1), /DeepSeek search HTTP 401/);
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe("fetchWithDeepSeek", () => {
  test("posts url and returns markdown content", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ title: "Example", content: "# Example\n\nBody" }), { status: 200 });
    });
    try {
      const r = await fetchWithDeepSeek("https://example.com/article", "sk-test");
      assert.equal(captured!.url, "https://api.deepseek.com/v1/tools/fetch");
      const body = JSON.parse(captured!.init!.body as string);
      assert.equal(body.url, "https://example.com/article");
      assert.equal(r?.title, "Example");
      assert.equal(r?.content, "# Example\n\nBody");
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("returns null on non-OK HTTP", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 404 }));
    try {
      assert.equal(await fetchWithDeepSeek("https://example.com", "sk"), null);
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe("deepseek routing", () => {
  const providers = new Map<string, SearchProvider>();
  for (const id of ["deepseek", "tavily", "tinyfish", "exa", "anysearch", "firecrawl"]) {
    providers.set(id, { name: id } as SearchProvider);
  }

  test("general intent prefers deepseek", () => {
    assert.equal(routeIntent("general", providers).primary, "deepseek");
  });

  test("news intent prefers deepseek", () => {
    assert.equal(routeIntent("news", providers).primary, "deepseek");
  });

  test("falls back to tavily for general when deepseek is absent", () => {
    const without = new Map(providers);
    without.delete("deepseek");
    assert.equal(routeIntent("general", without).primary, "tavily");
  });
});
