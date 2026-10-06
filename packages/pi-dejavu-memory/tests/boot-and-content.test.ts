import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// noc_boot: all reads failing is a failed tool call; partial failures are
// listed in the result. Every text content item is used, and any truthy
// isError marks the call failed.

type Tool = { name: string; execute: (...args: any[]) => Promise<any> };
const tools = new Map<string, Tool>();
let results: any[] = [];
let extractText: (d: any) => string;
let isToolError: (d: any) => boolean;

before(async () => {
  process.env.NOCTURNE_MCP_URL = "http://127.0.0.1:1/mcp";
  process.env.NOCTURNE_MCP_AUTH = "Bearer test-token";
  globalThis.fetch = (async () => {
    const result = results.shift() ?? { content: [{ type: "text", text: "unexpected" }] };
    return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: "x", result })}\n\n`, { status: 200 });
  }) as typeof fetch;
  const mod = await import("../extensions/index.js");
  extractText = mod.extractText;
  isToolError = mod.isToolError;
  mod.default({ registerTool: (t: Tool) => tools.set(t.name, t) } as any);
});
beforeEach(() => {
  results = [];
});

const ok = (text: string) => ({ content: [{ type: "text", text }] });
const failed = (text: string, ...flag: unknown[]) => ({ content: [{ type: "text", text }], isError: flag.length ? flag[0] : true });
const run = (name: string, params: Record<string, unknown> = {}) => tools.get(name)!.execute("c", params, undefined, undefined);

describe("noc_boot", () => {
  test("every boot read failing → failed tool call naming each failure", async () => {
    results = [failed("a"), failed("b"), failed("c")];
    await assert.rejects(run("noc_boot"), (err: Error) => {
      assert.equal(err.message, "Boot failed — no boot memory could be read:\nsystem://boot: a\nsystem://recent/5: b\nsystem://triggers: c");
      return true;
    });
  });

  test("system://boot failing while the others load is surfaced, not dropped", async () => {
    results = [failed("Memory not found: system://boot"), ok("RECENT"), ok("TRIG"), ok("BRIEF")];
    const r = await run("noc_boot");
    const text = r.content[0].text as string;
    assert.ok(text.includes("=== system://recent/5 ===\nRECENT"));
    assert.ok(text.includes("=== system://briefing ===\nBRIEF"));
    assert.ok(text.endsWith("⚠ Boot incomplete — failed reads:\n- system://boot: Memory not found: system://boot"));
    assert.deepEqual(r.details, { booted: 3, failed: ["system://boot: Memory not found: system://boot"] });
  });

  test("clean boot has no warning and no failed list", async () => {
    results = [ok("B"), ok("R"), ok("T"), ok("BR")];
    const r = await run("noc_boot");
    assert.ok(!r.content[0].text.includes("⚠"));
    assert.deepEqual(r.details, { booted: 4 });
  });
});

describe("content items", () => {
  test("all text items are returned in order; non-text items skipped", async () => {
    results = [{ content: [{ type: "image", data: "x" }, { type: "text", text: "one" }, { type: "text", text: "two" }] }];
    const r = await run("noc_read", { uri: "noc://a" });
    assert.equal(r.content[0].text, "one\ntwo");
  });

  test("error text that is not the first item is passed through whole", async () => {
    results = [{ content: [{ type: "resource", resource: {} }, { type: "text", text: "Not stored: x" }, { type: "text", text: "detail" }], isError: true }];
    await assert.rejects(run("noc_create", { parent_uri: "noc://", content: "c", priority: 2, disclosure: "d" }), {
      message: "Not stored: x\ndetail",
    });
  });

  test("extractText on malformed content is empty", () => {
    assert.equal(extractText({ result: { content: "nope" } }), "");
    assert.equal(extractText({ result: { content: [{ type: "text", text: 5 }] } }), "");
  });
});

describe("isError is truthy", () => {
  for (const v of [true, "true", "TRUE", 1, "yes"]) {
    test(`isError ${JSON.stringify(v)} → failed`, async () => {
      results = [failed("Not stored: y", v)];
      await assert.rejects(run("noc_delete", { uri: "noc://a" }), { message: "Not stored: y" });
    });
  }
  for (const v of [false, "false", "0", 0, null, undefined, ""]) {
    test(`isError ${JSON.stringify(v)} → success`, async () => {
      results = [failed("fine", v)];
      const r = await run("noc_delete", { uri: "noc://a" });
      assert.equal(r.content[0].text, "fine");
      assert.equal(isToolError({ result: { isError: v } }), false);
    });
  }
});
