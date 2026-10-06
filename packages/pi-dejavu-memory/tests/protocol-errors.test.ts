import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Protocol-level failures — a JSON-RPC `error` instead of `result`, a non-2xx
// HTTP reply, or a body with no parsable JSON-RPC response — must fail the Pi
// tool call (thrown from execute()), never come back as success text.

type Tool = { name: string; execute: (...args: any[]) => Promise<any> };
type Reply = { status: number; body: string };
const tools = new Map<string, Tool>();
let replies: Reply[] = [];
const sent: any[] = [];

const sse = (payload: unknown) => `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
const rpcError = (code: number, message: string): Reply => ({
  status: 200,
  body: sse({ jsonrpc: "2.0", id: "x", error: { code, message } }),
});
const ok = (text: string): Reply => ({
  status: 200,
  body: sse({ jsonrpc: "2.0", id: "x", result: { content: [{ type: "text", text }] } }),
});
const http = (status: number, body: string): Reply => ({ status, body });
const garbage: Reply = { status: 200, body: "<html>proxy error page</html>" };

before(async () => {
  process.env.NOCTURNE_MCP_URL = "http://127.0.0.1:1/mcp";
  process.env.NOCTURNE_MCP_AUTH = "Bearer test-token";
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    const r = replies.shift() ?? ok("unexpected call");
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
  const mod = await import("../extensions/index.js");
  mod.default({ registerTool: (t: Tool) => tools.set(t.name, t) } as any);
});

beforeEach(() => {
  replies = [];
  sent.length = 0;
});

const run = (name: string, params: Record<string, unknown>) => tools.get(name)!.execute("call-1", params, undefined, undefined);

const failures: Array<[string, Reply, string]> = [
  ["JSON-RPC error", rpcError(-32602, "Invalid params: content is required"), "MCP error -32602: Invalid params: content is required"],
  ["HTTP 500", http(500, "internal failure"), "MCP error 500: HTTP 500: internal failure"],
  ["HTTP 403", http(403, "forbidden by access policy"), "MCP error 403: HTTP 403: forbidden by access policy"],
  ["unparsable body", garbage, "MCP error: empty or unparsable response from server"],
  ["empty body", http(200, ""), "MCP error: empty or unparsable response from server"],
];

const wrappers: Array<[string, Record<string, unknown>, string]> = [
  ["noc_create", { parent_uri: "noc://", content: "a note", priority: 2, disclosure: "when x" }, "create_memory"],
  ["noc_read", { uri: "noc://a" }, "read_memory"],
  ["noc_search", { query: "x" }, "search_memory"],
  ["noc_update", { uri: "noc://a", append: "more" }, "update_memory"],
  ["noc_delete", { uri: "noc://a" }, "delete_memory"],
];

for (const [tool, params, mcpName] of wrappers) {
  describe(tool, () => {
    for (const [label, reply, expected] of failures) {
      test(`${label} → failed tool call with "${expected}"`, async () => {
        replies = [reply];
        await assert.rejects(run(tool, params), (err: Error) => {
          assert.equal(err.message, expected);
          return true;
        });
        assert.equal(sent.length, 1);
        assert.equal(sent[0].params.name, mcpName);
      });
    }

    test("success is unchanged", async () => {
      replies = [ok("fine")];
      const r = await run(tool, params);
      assert.deepEqual(r, { content: [{ type: "text", text: "fine" }] });
    });
  });
}

describe("noc_boot", () => {
  test("protocol failures are errored reads; all failing → failed tool call", async () => {
    replies = [rpcError(-32603, "Internal error"), http(502, "bad gateway"), garbage];
    await assert.rejects(run("noc_boot", {}), (err: Error) => {
      assert.equal(
        err.message,
        [
          "Boot failed — no boot memory could be read:",
          "system://boot: MCP error -32603: Internal error",
          "system://recent/5: MCP error 502: HTTP 502: bad gateway",
          "system://triggers: MCP error: empty or unparsable response from server",
        ].join("\n"),
      );
      return true;
    });
  });

  test("a protocol failure is never loaded as a node but is listed; failed briefing is skipped", async () => {
    replies = [ok("BOOT"), rpcError(-32603, "Internal error"), ok("TRIG"), http(500, "briefing down")];
    const r = await run("noc_boot", {});
    assert.equal(r.details.booted, 2);
    assert.equal(
      r.content[0].text,
      "=== system://boot ===\nBOOT\n\n---\n\n=== system://triggers ===\nTRIG" +
        "\n\n---\n\n⚠ Boot incomplete — failed reads:\n- system://recent/5: MCP error -32603: Internal error",
    );
    assert.deepEqual(r.details.failed, ["system://recent/5: MCP error -32603: Internal error"]);
  });

  test("garbage briefing is skipped too", async () => {
    replies = [ok("BOOT"), ok("RECENT"), ok("TRIG"), garbage];
    const r = await run("noc_boot", {});
    assert.equal(r.details.booted, 3);
    assert.ok(!r.content[0].text.includes("briefing"));
  });
});
