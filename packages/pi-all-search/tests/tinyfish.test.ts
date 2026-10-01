import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import {
  TINYFISH_META,
  TinyFishProvider,
  parseTinyFishResults,
} from "../src/providers/tinyfish.js";
import { createAvailableProviders, PROVIDERS } from "../src/providers/index.js";
import { routeIntent } from "../src/router.js";
import type { SearchProvider } from "../src/providers/types.js";

describe("tinyfish registration", () => {
  test("is listed in PROVIDERS metadata", () => {
    assert.ok(PROVIDERS.some((p) => p.name === "tinyfish"));
    assert.equal(TINYFISH_META.envVar, "TINYFISH_API_KEY");
  });

  test("is registered only when a key is present", () => {
    assert.equal(createAvailableProviders({}).has("tinyfish"), false);
    assert.equal(createAvailableProviders({ tinyfish: "sk-test" }).has("tinyfish"), true);
  });
});

describe("parseTinyFishResults", () => {
  test("maps web results", () => {
    const out = parseTinyFishResults({
      results: [
        { position: 1, site_name: "a.com", title: "A", snippet: "snip", url: "https://a.com" },
      ],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "A");
    assert.equal(out[0].url, "https://a.com");
    assert.equal(out[0].snippet, "snip");
  });

  test("carries the news publication date", () => {
    const out = parseTinyFishResults({
      results: [{ title: "N", url: "https://n.com", snippet: "s", date: "3 hours ago", publisher: "NBC" }],
    });
    assert.equal(out[0].publishedAt, "3 hours ago");
  });

  test("carries the citation count as score for papers", () => {
    const out = parseTinyFishResults({
      results: [{ title: "P", url: "https://p.com", snippet: "s", year: 2024, cited_by_count: 816 }],
    });
    assert.equal(out[0].score, 816);
  });

  test("handles an empty payload", () => {
    assert.deepEqual(parseTinyFishResults({}), []);
    assert.deepEqual(parseTinyFishResults(undefined), []);
  });
});

describe("TinyFishProvider search", () => {
  test("sends the X-API-Key header and query", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ results: [{ title: "T", url: "https://t.com", snippet: "s" }] }), {
        status: 200,
      });
    });
    try {
      const r = await new TinyFishProvider("sk-test").search("hello", 5);
      assert.equal(captured!.url.startsWith("https://api.search.tinyfish.ai?"), true);
      assert.match(captured!.url, /query=hello/);
      const headers = captured!.init!.headers as Record<string, string>;
      assert.equal(headers["X-API-Key"], "sk-test");
      assert.equal(r.results.length, 1);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("caps results to maxResults", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          results: [
            { title: "1", url: "https://1.com", snippet: "" },
            { title: "2", url: "https://2.com", snippet: "" },
            { title: "3", url: "https://3.com", snippet: "" },
          ],
        }),
        { status: 200 },
      ),
    );
    try {
      const r = await new TinyFishProvider("sk-test").search("x", 2);
      assert.equal(r.results.length, 2);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("maps news intent to domain_type=news", async () => {
    let url = "";
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      url = String(input);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    try {
      await new TinyFishProvider("sk-test").searchWithIntent("news", "ai agents", 5);
      assert.match(url, /domain_type=news/);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("maps academic intent to domain_type=research_paper", async () => {
    let url = "";
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      url = String(input);
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    try {
      await new TinyFishProvider("sk-test").searchWithIntent("academic", "rag", 5);
      assert.match(url, /domain_type=research_paper/);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("throws on HTTP errors", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
    try {
      await assert.rejects(() => new TinyFishProvider("bad").search("x", 1), /TinyFish search HTTP 401/);
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe("TinyFishProvider fetchContent", () => {
  test("posts urls to the fetch endpoint", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(
        JSON.stringify({ results: [{ url: "https://a.com", title: "A", text: "# A" }], errors: [] }),
        { status: 200 },
      );
    });
    try {
      const r = await new TinyFishProvider("sk-test").fetchContent(["https://a.com"]);
      assert.equal(captured!.url, "https://api.fetch.tinyfish.ai");
      assert.equal(captured!.init!.method, "POST");
      const body = JSON.parse(captured!.init!.body as string);
      assert.deepEqual(body.urls, ["https://a.com"]);
      assert.equal(r.results![0].text, "# A");
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("throws on HTTP errors", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }));
    try {
      await assert.rejects(() => new TinyFishProvider("k").fetchContent(["https://a.com"]), /HTTP 500/);
    } finally {
      fetchMock.mock.restore();
    }
  });
});

describe("tinyfish routing", () => {
  const providers = new Map<string, SearchProvider>();
  for (const id of ["tinyfish", "tavily", "exa", "anysearch", "firecrawl"]) {
    providers.set(id, { name: id } as SearchProvider);
  }

  test("news intent prefers tinyfish", () => {
    assert.equal(routeIntent("news", providers).primary, "tinyfish");
  });

  test("academic intent prefers tinyfish", () => {
    assert.equal(routeIntent("academic", providers).primary, "tinyfish");
  });

  test("falls back to tavily for news when tinyfish is absent", () => {
    const withoutTiny = new Map(providers);
    withoutTiny.delete("tinyfish");
    assert.equal(routeIntent("news", withoutTiny).primary, "tavily");
  });
});
