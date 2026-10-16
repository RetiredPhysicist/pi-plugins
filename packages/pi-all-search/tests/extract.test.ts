import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";
import { fetchWithJina, isJinaUrl, jinaReaderUrl } from "../src/extract.js";

describe("jina reader helpers", () => {
  test("builds r.jina.ai proxy URL preserving the target", () => {
    assert.equal(
      jinaReaderUrl("https://example.com/path?q=1"),
      "https://r.jina.ai/https://example.com/path?q=1",
    );
  });

  test("detects already-wrapped Jina URLs", () => {
    assert.equal(isJinaUrl("https://r.jina.ai/https://example.com"), true);
    assert.equal(isJinaUrl("https://s.jina.ai/?q=test"), true);
    assert.equal(isJinaUrl("https://example.com"), false);
  });
});

describe("fetchWithJina", () => {
  test("skips when URL is already a Jina reader URL", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => {
      throw new Error("fetch should not be called");
    });
    try {
      const out = await fetchWithJina("https://r.jina.ai/https://example.com");
      assert.equal(out, null);
      assert.equal(fetchMock.mock.callCount(), 0);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("returns markdown on OK response", async () => {
    let captured: string | undefined;
    const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
      captured = String(input);
      return new Response("# Hello\n\nWorld", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      });
    });
    try {
      const out = await fetchWithJina("https://example.com/doc");
      assert.equal(captured, "https://r.jina.ai/https://example.com/doc");
      assert.equal(out?.content, "# Hello\n\nWorld");
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("returns null on non-OK HTTP", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("nope", { status: 502 }));
    try {
      assert.equal(await fetchWithJina("https://example.com"), null);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test("returns null on empty body", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response("   ", { status: 200 }));
    try {
      assert.equal(await fetchWithJina("https://example.com"), null);
    } finally {
      fetchMock.mock.restore();
    }
  });
});
