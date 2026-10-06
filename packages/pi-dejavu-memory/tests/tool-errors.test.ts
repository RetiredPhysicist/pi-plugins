import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// A tools/call that the server itself reports as failed (`isError: true`) must
// surface as a failed Pi tool call — thrown from execute(), whose message Pi
// passes to the model verbatim — never as a successful result.

type Tool = { name: string; execute: (...args: any[]) => Promise<any>; renderResult: (...args: any[]) => any };
const tools = new Map<string, Tool>();
let toolResultText: (data: any, fallback: string) => string;
let nextResults: any[] = [];
const sent: any[] = [];

const NOT_STORED =
  "Not stored: the Clef gate judged this scratch / low worth. Nothing was written. Pass force=true to store it anyway.";

function sse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

before(async () => {
  process.env.NOCTURNE_MCP_URL = "http://127.0.0.1:1/mcp";
  process.env.NOCTURNE_MCP_AUTH = "Bearer test-token";
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    const result = nextResults.shift() ?? { content: [{ type: "text", text: "unexpected call" }] };
    return new Response(sse({ jsonrpc: "2.0", id: "x", result }), { status: 200 });
  }) as typeof fetch;
  const mod = await import("../extensions/index.js");
  toolResultText = mod.toolResultText;
  mod.default({ registerTool: (t: Tool) => tools.set(t.name, t) } as any);
});

beforeEach(() => {
  nextResults = [];
  sent.length = 0;
});

const ok = (text: string) => ({ content: [{ type: "text", text }] });
const failed = (text: string) => ({ content: [{ type: "text", text }], isError: true });
const run = (name: string, params: Record<string, unknown>) => tools.get(name)!.execute("call-1", params, undefined, undefined);

const createParams = { parent_uri: "noc://", content: "a note", priority: 2, disclosure: "when x" };

describe("noc_create", () => {
  test("isError: true → failed tool call with the server text verbatim", async () => {
    nextResults = [failed(NOT_STORED)];
    await assert.rejects(run("noc_create", createParams), (err: Error) => {
      assert.equal(err.message, NOT_STORED);
      return true;
    });
    assert.equal(sent[0].params.name, "create_memory");
  });

  test("success is unchanged", async () => {
    nextResults = [ok("Created: noc://a_note (audit 7)")];
    const r = await run("noc_create", createParams);
    assert.deepEqual(r, { content: [{ type: "text", text: "Created: noc://a_note (audit 7)" }] });
  });

  test("empty success still falls back to 'Created'", async () => {
    nextResults = [{ content: [] }];
    const r = await run("noc_create", createParams);
    assert.equal(r.content[0].text, "Created");
  });
});

describe("other wrappers treat isError as failure too", () => {
  const cases: Array<[string, Record<string, unknown>, string, string]> = [
    ["noc_read", { uri: "noc://missing" }, "read_memory", "Memory not found: noc://missing"],
    ["noc_search", { query: "x" }, "search_memory", "Search failed: index unavailable"],
    ["noc_update", { uri: "noc://a", append: "more" }, "update_memory", "Must read noc://a before updating"],
    ["noc_delete", { uri: "noc://a" }, "delete_memory", "Cannot delete noc://a: has children"],
  ];
  for (const [tool, params, mcpName, text] of cases) {
    test(`${tool}: isError → rejects with server text; success unchanged`, async () => {
      nextResults = [failed(text)];
      await assert.rejects(run(tool, params), (err: Error) => err.message === text);
      assert.equal(sent[0].params.name, mcpName);

      nextResults = [ok("fine")];
      const r = await run(tool, params);
      assert.equal(r.content[0].text, "fine");
    });
  }

  test("noc_boot: an isError read is reported as an error, not loaded as a node", async () => {
    nextResults = [failed("boot exploded"), failed("recent exploded"), failed("triggers exploded")];
    await assert.rejects(run("noc_boot", {}), (err: Error) => /system:\/\/boot: boot exploded/.test(err.message));

    nextResults = [ok("BOOT"), failed("recent exploded"), ok("TRIG"), failed("no briefing")];
    const r2 = await run("noc_boot", {});
    assert.equal(r2.details.booted, 2);
    assert.ok(!r2.content[0].text.includes("=== system://recent/5 ==="));
    assert.ok(r2.content[0].text.includes("- system://recent/5: recent exploded"));
    assert.ok(!r2.content[0].text.includes("no briefing"));
  });
});

describe("toolResultText", () => {
  test("throws only for isError: true", () => {
    assert.throws(() => toolResultText({ result: failed("boom") }, "fb"), { message: "boom" });
    assert.throws(() => toolResultText({ result: { isError: true, content: [] } }, "fb"), { message: "DejaVu tool call failed" });
    assert.equal(toolResultText({ result: { ...ok("x"), isError: false } }, "fb"), "x");
    assert.equal(toolResultText({ result: {} }, "fb"), "fb");
  });
});
