import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { searchParallel, fetchParallel, PARALLEL_MCP_URL } from '../src/providers/parallel-mcp.js';

const pages = [{ url: 'https://example.com', title: 'Example', excerpts: ['one', 'two'], publish_date: '2026-11-21' }, { url: 'javascript:bad' }];
const response = (results: unknown[] = pages) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: { results } } }));
afterEach(() => mock.restoreAll());

describe('anonymous Parallel MCP', () => {
  it('sends only fixed anonymous headers even when billing keys exist; caps results and maps excerpts', async () => {
    const original = process.env.PARALLEL_API_KEY;
    process.env.PARALLEL_API_KEY = 'must-not-be-forwarded';
    mock.method(globalThis, 'fetch', async (url, init) => {
      assert.equal(url, PARALLEL_MCP_URL);
      assert.deepEqual(Object.keys(init!.headers!).sort(), ['Accept', 'Content-Type']);
      assert.equal(init!.credentials, 'omit');
      assert.equal(init!.redirect, 'error');
      assert.ok(init!.signal! instanceof AbortSignal);
      const rpc = JSON.parse(String(init!.body));
      assert.equal(rpc.method, 'tools/call');
      assert.equal(rpc.params.name, 'web_search');
      assert.deepEqual(rpc.params.arguments.search_queries, ['query']);
      assert.notEqual(rpc.params.arguments.objective, 'query');
      assert.ok(!String(init!.body).includes('must-not-be-forwarded'));
      return response();
    });
    try {
      const result = await searchParallel('query', 1);
      assert.equal(result.length, 1);
      assert.equal(result[0].snippet, 'one\n\ntwo');
      assert.equal(result[0].publishedAt, '2026-11-21');
    } finally {
      if (original === undefined) delete process.env.PARALLEL_API_KEY;
      else process.env.PARALLEL_API_KEY = original;
    }
  });
  it('handles SSE notifications and text JSON fallback', async () => {
    const rpc = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify({ results: pages }) }] } };
    mock.method(globalThis, 'fetch', async () => new Response(': ping\r\n\r\nevent: message\r\ndata: {"method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: ' + JSON.stringify(rpc) + '\r\n\r\n'));
    assert.equal((await searchParallel('query')).length, 1);
  });
  it('returns no matches cleanly', async () => {
    mock.method(globalThis, 'fetch', async () => response([]));
    assert.deepEqual(await searchParallel('query'), []);
    assert.equal(await fetchParallel('https://example.com'), null);
  });
  it('rejects HTTP, RPC, tool errors and malformed responses without echoing content', async () => {
    for (const body of [null, { error: { message: 'sensitive' } }, { result: { isError: true, content: [{ text: 'sensitive' }] } }, { result: { structuredContent: {} } }]) {
      mock.method(globalThis, 'fetch', async () => body === null ? new Response('', { status: 503 }) : new Response(JSON.stringify(body)));
      await assert.rejects(searchParallel('query'), (error) => !String(error).includes('sensitive'));
      mock.restoreAll();
    }
  });
  it('supports caller cancellation and a fixed timeout signal', async () => {
    mock.method(AbortSignal, 'timeout', (ms) => {
      assert.equal(ms, 12000);
      return AbortSignal.abort(new DOMException('timed out', 'TimeoutError'));
    });
    mock.method(globalThis, 'fetch', async (_url, init) => { init!.signal!.throwIfAborted(); return response(); });
    await assert.rejects(searchParallel('query'), { name: 'TimeoutError' });
    mock.restoreAll();
    const calls = mock.method(globalThis, 'fetch', async () => response());
    await assert.rejects(searchParallel('query', 5, AbortSignal.abort()), { name: 'AbortError' });
    assert.equal(calls.mock.callCount(), 0);
  });
  it('fetches full content with a 50k cap', async () => {
    mock.method(globalThis, 'fetch', async (_url, init) => {
      const rpc = JSON.parse(String(init!.body));
      assert.equal(rpc.params.name, 'web_fetch');
      assert.equal(rpc.params.arguments.full_content, true);
      assert.equal(rpc.params.arguments.objective.length, 200);
      return response([{ url: 'https://example.com', full_content: 'x'.repeat(60000) }]);
    });
    assert.equal((await fetchParallel('https://example.com', undefined, 'x'.repeat(300)))!.content.length, 50000);
  });
  it('backs off on 429 without retrying or upgrading to authenticated mode', async () => {
    const clock = mock.method(Date, 'now', () => 1000000);
    const calls = mock.method(globalThis, 'fetch', async () => new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    await assert.rejects(searchParallel('query'), /429/);
    await assert.rejects(searchParallel('query'), /cooldown/);
    assert.equal(calls.mock.callCount(), 1);
    clock.mock.mockImplementation(() => 1060001);
    calls.mock.mockImplementation(async () => response([]));
    assert.deepEqual(await searchParallel('query'), []);
  });
});

import { createAvailableProviders, createProvider } from '../src/providers/index.js';
import { routeIntent } from '../src/router.js';
it('registers anonymous Parallel without keys, last for every intent; ignores any supplied key', () => {
  const providers = createAvailableProviders({});
  assert.equal(providers.get('parallel')?.name, 'parallel');
  assert.equal(createProvider('parallel', 'ignored').name, 'parallel');
  for (const intent of ['finance', 'academic', 'docs', 'technical', 'news', 'general'] as const) {
    const r = routeIntent(intent, providers);
    assert.equal(r.primary, 'firecrawl');
    assert.equal([r.primary, ...r.secondary].at(-1), 'parallel');
  }
  assert.equal(routeIntent('general', providers, 'parallel').primary, 'parallel');
});

import { executeSingleSearch } from '../src/web-search.js';
import type { SearchProvider } from '../src/providers/types.js';
it('search execution reaches Parallel after existing providers fail or return empty', async () => {
  mock.method(globalThis, 'fetch', async () => response());
  const providers = new Map<string, SearchProvider>([
    ['tavily', { name: 'tavily', search: async () => { throw new Error('source down'); } }],
    ['firecrawl', { name: 'firecrawl', search: async () => ({ results: [] }) }],
    ['parallel', createProvider('parallel')],
  ]);
  const result = await executeSingleSearch(providers, 'query', 2);
  assert.equal(result.provider, 'parallel');
  assert.equal(result.results.length, 1);
});
it('an explicitly selected Parallel can degrade to an existing source on HTTP error', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  const providers = new Map<string, SearchProvider>([
    ['parallel', createProvider('parallel')],
    ['firecrawl', { name: 'firecrawl', search: async () => ({ results: [{ title: 'Fallback', url: 'https://example.com', snippet: '' }] }) }],
  ]);
  const result = await executeSingleSearch(providers, 'query', 2, 'parallel');
  assert.equal(result.provider, 'firecrawl');
});
