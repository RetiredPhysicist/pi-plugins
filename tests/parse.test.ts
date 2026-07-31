import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

let parseStreamResponse: (text: string) => any;
let extractText: (data: any) => string;

before(async () => {
  // extensions/index.ts requires MCP_URL/MCP_AUTH at module load; satisfy via env
  process.env.NOCTURNE_MCP_URL = "http://127.0.0.1:1";
  process.env.NOCTURNE_MCP_AUTH = "test-token";
  const mod = await import("../extensions/index.js");
  parseStreamResponse = mod.parseStreamResponse;
  extractText = mod.extractText;
});

describe("parseStreamResponse", () => {
  test("parses a simple SSE data block", () => {
    const body = 'data: {"jsonrpc":"2.0","id":"1","result":{"content":[{"type":"text","text":"hi"}]}}\n\n';
    const out = parseStreamResponse(body);
    assert.equal(out.result.content[0].text, "hi");
  });

  test("returns error object when present", () => {
    const body = 'data: {"jsonrpc":"2.0","id":"1","error":{"code":-32601,"message":"unknown"}}\n\n';
    const out = parseStreamResponse(body);
    assert.equal(out.error.code, -32601);
  });

  test("ignores event: lines", () => {
    const body = 'event: message\ndata: {"result":{"ok":true}}\n\n';
    const out = parseStreamResponse(body);
    assert.deepEqual(out.result, { ok: true });
  });

  test("skips non-JSON data blocks and keeps scanning", () => {
    const body = 'data: not-json\n\ndata: {"result":{"ok":true}}\n\n';
    const out = parseStreamResponse(body);
    assert.deepEqual(out.result, { ok: true });
  });

  test("parses trailing data without blank line", () => {
    const body = 'data: {"result":{"ok":true}}';
    const out = parseStreamResponse(body);
    assert.deepEqual(out.result, { ok: true });
  });

  test("skips data blocks without result/error, falls through to next", () => {
    const body = 'data: {"type":"progress"}\n\ndata: {"result":{"ok":true}}\n\n';
    const out = parseStreamResponse(body);
    assert.deepEqual(out.result, { ok: true });
  });

  test("returns null for empty or unparseable body", () => {
    assert.equal(parseStreamResponse(""), null);
    assert.equal(parseStreamResponse("plain text, no sse"), null);
  });

  test("handles CRLF line endings", () => {
    const body = 'data: {"result":{"ok":true}}\r\n\r\n';
    const out = parseStreamResponse(body);
    assert.deepEqual(out.result, { ok: true });
  });
});

describe("extractText", () => {
  test("extracts first content text", () => {
    const data = { result: { content: [{ type: "text", text: "hello" }, { type: "text", text: "ignored" }] } };
    assert.equal(extractText(data), "hello");
  });

  test("formats error with message", () => {
    const data = { error: { code: 500, message: "boom" } };
    assert.equal(extractText(data), "Error: boom");
  });

  test("formats error without message as JSON", () => {
    const data = { error: { code: -1 } };
    assert.equal(extractText(data), `Error: ${JSON.stringify({ code: -1 })}`);
  });

  test("returns empty string when no content", () => {
    assert.equal(extractText({ result: {} }), "");
    assert.equal(extractText(null), "");
    assert.equal(extractText(undefined), "");
  });
});
