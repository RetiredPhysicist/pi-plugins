/**
 * Session-identity fingerprints (issue #33): pi history is compared by content,
 * not by message count.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { historyKey, replyKey } from "../src/history-key.js";

const user = (text) => ({ role: "user", content: text, timestamp: 1 });
const reply = (text, extra = {}) => ({
	role: "assistant",
	content: [{ type: "text", text }],
	api: "codebuddy-sdk",
	provider: "codebuddy",
	model: "claude-sonnet-5",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop",
	timestamp: 2,
	...extra,
});

describe("historyKey", () => {
	it("is stable across timestamps, ids and usage", () => {
		const a = [user("hello"), reply("hi")];
		const b = [
			{ ...user("hello"), timestamp: 999 },
			{ ...reply("hi"), timestamp: 1234, rawStopReason: "end_turn", usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } },
		];
		assert.equal(historyKey(a), historyKey(b));
	});

	it("changes when any visible content changes", () => {
		const base = historyKey([user("hello"), reply("hi")]);
		assert.notEqual(base, historyKey([user("hello!"), reply("hi")]));
		assert.notEqual(base, historyKey([user("hello"), reply("hi there")]));
		assert.notEqual(base, historyKey([user("hello")]), "dropping a message is a different history");
	});

	it("distinguishes tool calls by name and arguments", () => {
		const withCall = (name, args) => historyKey([
			reply(""),
			{ role: "assistant", content: [{ type: "toolCall", id: "t1", name, arguments: args }], api: "codebuddy-sdk", provider: "codebuddy", model: "m", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: 1 },
		]);
		assert.equal(withCall("read", { path: "a" }), withCall("read", { path: "a" }), "argument order must not matter");
		assert.notEqual(withCall("read", { path: "a" }), withCall("read", { path: "b" }));
		assert.notEqual(withCall("read", { path: "a" }), withCall("write", { path: "a" }));
	});

	it("distinguishes tool results by error state", () => {
		const result = (isError) => historyKey([
			{ role: "toolResult", toolCallId: "t1", toolName: "read", content: [{ type: "text", text: "out" }], isError, timestamp: 1 },
		]);
		assert.notEqual(result(true), result(false));
	});

	it("hashes image data without keeping it", () => {
		const image = (data) => historyKey([{ role: "user", content: [{ type: "image", data, mimeType: "image/png" }], timestamp: 1 }]);
		assert.equal(image("AAAA"), image("AAAA"));
		assert.notEqual(image("AAAA"), image("BBBB"));
	});
});

describe("replyKey", () => {
	it("only fingerprints assistant replies", () => {
		assert.equal(replyKey(user("hello")), undefined);
		assert.equal(replyKey(undefined), undefined);
		assert.equal(typeof replyKey(reply("hi")), "string");
	});

	it("detects an edited reply", () => {
		assert.notEqual(replyKey(reply("the deploy failed")), replyKey(reply("the deploy succeeded")));
	});
	
	it("is insensitive to thinking signatures and stream bookkeeping", () => {
		const plain = reply("hi");
		const signed = {
			...plain,
			content: [{ type: "text", text: "hi", textSignature: "sig-1" }],
			diagnostics: [{ type: "x" }],
		};
		assert.equal(replyKey(plain), replyKey(signed));
	});
});
