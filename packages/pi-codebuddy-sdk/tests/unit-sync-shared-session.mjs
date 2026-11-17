/**
 * Regression tests for syncSharedSession's session reuse decisions.
 */
import { describe, it, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSessionPath, projectPathToHash, readSession } from "../src/cb-session-io.js";

const debugDir = mkdtempSync(join(tmpdir(), "sync-shared-session-debug-"));
process.env.CODEBUDDY_SDK_DEBUG_PATH = join(debugDir, "codebuddy-sdk.log");

const { __test } = await import("../src/index.js");

describe("syncSharedSession", () => {
	after(() => {
		rmSync(debugDir, { recursive: true, force: true });
	});

	afterEach(() => {
		__test.resetSharedSession();
	});

	it("does not reuse a cached main session for a shorter synthetic compact context", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-"));
		try {
			const mainSession = {
				sessionId: "11111111-1111-4111-8111-111111111111",
				cursor: 42,
				cwd,
			};
			__test.setSharedSession(mainSession);

			const result = __test.syncSharedSession([
				{
					role: "user",
					content: "Summarize this conversation.",
					timestamp: Date.now(),
				},
			], cwd);

			assert.equal(
				result.sessionId,
				null,
				"synthetic compact contexts have no prior messages and must start a fresh CodeBuddy session instead of resuming the main session",
			);
			assert.equal(
				result.preserveSharedSession,
				true,
				"the fresh synthetic CodeBuddy session must not replace the cached main session when it completes",
			);
			assert.deepEqual(__test.getSharedSession(), mainSession);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	// Issue #10: after an interrupted turn, pi rewrites history shorter than the
	// provider's cursor. The old code fell back to a context-free clean start,
	// so the model answered as if the conversation never happened. A top-level
	// call with real history left must rebuild instead.
	it("rebuilds instead of clean-starting when pi's history shrinks but keeps context (issue #10)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-shrink-"));
		const previousConfigDir = process.env.CODEBUDDY_CONFIG_DIR;
		process.env.CODEBUDDY_CONFIG_DIR = cwd;
		try {
			const mainSession = {
				sessionId: "22222222-2222-4222-8222-222222222222",
				cursor: 42,
				cwd,
			};
			__test.setSharedSession(mainSession);

			const prior = Array.from({ length: 10 }, (_, i) => ({
				role: i % 2 === 0 ? "user" : "assistant",
				content: `message ${i}`,
				timestamp: Date.now(),
			}));

			const result = __test.syncSharedSession(
				[...prior, { role: "user", content: "retry after interrupt", timestamp: Date.now() }],
				cwd,
				undefined,
				undefined,
				false,
			);

			assert.equal(
				result.preserveSharedSession,
				undefined,
				"a shrunk-but-non-empty history must not fall back to a context-free clean start",
			);
			assert.ok(
				result.sessionId,
				"a shrunk-but-non-empty history must produce a session to resume",
			);
			assert.equal(
				__test.getSharedSession()?.cursor,
				prior.length,
				"the rebuilt session cursor must match the truncated history",
			);
		} finally {
			if (previousConfigDir === undefined) delete process.env.CODEBUDDY_CONFIG_DIR;
			else process.env.CODEBUDDY_CONFIG_DIR = previousConfigDir;
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("uses configured isolated storage for session and diff cleanup paths", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-isolated-"));
		const isolatedDir = mkdtempSync(join(tmpdir(), "sync-shared-session-config-"));
		try {
			__test.setProviderSettings({ isolatedEnv: true, codebuddyConfigDir: isolatedDir });
			const prior = [
				{ role: "user", content: "first", timestamp: Date.now() },
				{ role: "assistant", content: "answer", timestamp: Date.now() },
			];
			const result = __test.syncSharedSession(
				[...prior, { role: "user", content: "next", timestamp: Date.now() }],
				cwd,
			);
			assert.ok(result.sessionId);
			assert.equal(__test.getSharedSession()?.sessionId, result.sessionId);
			assert.equal(
				getSessionPath(result.sessionId, cwd, isolatedDir),
				join(isolatedDir, "projects", projectPathToHash(cwd), `${result.sessionId}.jsonl`),
			);
		} finally {
			__test.setProviderSettings({});
			rmSync(cwd, { recursive: true, force: true });
			rmSync(isolatedDir, { recursive: true, force: true });
		}
	});

	// Reentrant subagent calls must never rewrite the parent's shared session.
	it("keeps the clean start for a reentrant call with a shorter context", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-reentrant-"));
		try {
			const mainSession = {
				sessionId: "33333333-3333-4333-8333-333333333333",
				cursor: 42,
				cwd,
			};
			__test.setSharedSession(mainSession);

			const result = __test.syncSharedSession(
				[
					{ role: "user", content: "first", timestamp: Date.now() },
					{ role: "assistant", content: "reply", timestamp: Date.now() },
					{ role: "user", content: "subagent prompt", timestamp: Date.now() },
				],
				cwd,
				undefined,
				undefined,
				true,
			);

			assert.equal(result.sessionId, null);
			assert.equal(result.preserveSharedSession, true);
			assert.deepEqual(__test.getSharedSession(), mainSession);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	// Issue #33: the REUSE guard compared message COUNTS only, so a different
	// conversation of the same length (after /compact or a session-tree move)
	// resumed the stale CodeBuddy transcript and the model answered from context
	// the user no longer sees.
	it("rebuilds when the same-length history has different content (issue #33)", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-samecount-"));
		const previousConfigDir = process.env.CODEBUDDY_CONFIG_DIR;
		process.env.CODEBUDDY_CONFIG_DIR = cwd;
		try {
			const original = [
				{ role: "user", content: "talk about postgres indexes", timestamp: Date.now() },
					assistantReply("btree vs gin"),
			];
			const created = __test.syncSharedSession(
				[...original, { role: "user", content: "first prompt", timestamp: Date.now() }],
				cwd,
			);
			assert.ok(created.sessionId);
			assert.ok(__test.getSharedSession().historyKey, "reuse must record a history fingerprint");

			const rewritten = [
				{ role: "user", content: "talk about kubernetes rollout", timestamp: Date.now() },
				assistantReply("canary vs blue-green"),
			];
			const result = __test.syncSharedSession(
				[...rewritten, { role: "user", content: "second prompt", timestamp: Date.now() }],
				cwd,
			);

			assert.equal(
				result.sessionId,
				created.sessionId,
				"the rebuild keeps the session id so log correlation stays stable",
			);
			assert.equal(
				__test.getSharedSession().historyKey,
				__test.historyKey(rewritten),
				"the fingerprint must describe the history actually written",
			);
			const rewrittenSession = readSession(result.sessionId, cwd);
			assert.deepEqual(
				rewrittenSession.messages.map((m) => m.content),
				["talk about kubernetes rollout", "canary vs blue-green"],
				"the session file must contain pi's current history, not the replaced one",
			);
		} finally {
			if (previousConfigDir === undefined) delete process.env.CODEBUDDY_CONFIG_DIR;
			else process.env.CODEBUDDY_CONFIG_DIR = previousConfigDir;
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	// A host-side edit of the last assistant reply keeps the count identical, so
	// only a reply fingerprint can tell the two transcripts apart.
	it("rebuilds when the trailing assistant reply was edited", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-edited-"));
		const previousConfigDir = process.env.CODEBUDDY_CONFIG_DIR;
		process.env.CODEBUDDY_CONFIG_DIR = cwd;
		try {
			const prompt = { role: "user", content: "what changed?", timestamp: Date.now() };
			__test.setSharedSession({
				sessionId: "44444444-4444-4444-8444-444444444444",
				cursor: 1,
				cwd,
				historyKey: __test.historyKey([{ role: "user", content: "earlier", timestamp: 0 }]),
				pendingReplyKey: __test.replyKey(assistantReply("the deploy failed")),
			});

			const editedReply = assistantReply("the deploy SUCCEEDED");
			const result = __test.syncSharedSession(
				[
					{ role: "user", content: "earlier", timestamp: 0 },
					editedReply,
					{ role: "user", content: "next question", timestamp: Date.now() },
				],
				cwd,
			);

			assert.equal(
				__test.getSharedSession().cursor,
				2,
				"the edited reply is committed, so the rebuilt cursor covers it",
			);
			assert.equal(result.sessionId, "44444444-4444-4444-8444-444444444444");
			const rebuilt = readSession(result.sessionId, cwd);
			assert.deepEqual(
				rebuilt.messages.map((m) => m.content),
				["earlier", "the deploy SUCCEEDED"],
				"the session must carry the edited reply, not the one it replaced",
			);
		} finally {
			if (previousConfigDir === undefined) delete process.env.CODEBUDDY_CONFIG_DIR;
			else process.env.CODEBUDDY_CONFIG_DIR = previousConfigDir;
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("reuses the session when the trailing assistant reply is unchanged", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-unchanged-"));
		try {
			const earlier = { role: "user", content: "earlier", timestamp: 0 };
			const reply = assistantReply("the deploy failed");
			__test.setSharedSession({
				sessionId: "55555555-5555-4555-8555-555555555555",
				cursor: 1,
				cwd,
				historyKey: __test.historyKey([earlier]),
				pendingReplyKey: __test.replyKey(reply),
			});

			const result = __test.syncSharedSession(
				[earlier, reply, { role: "user", content: "next question", timestamp: Date.now() }],
				cwd,
			);

			assert.equal(result.sessionId, "55555555-5555-4555-8555-555555555555");
			assert.equal(__test.getSharedSession().cursor, 2, "the committed cursor advances past the reply");
			assert.equal(__test.getSharedSession().pendingReplyKey, undefined);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("keeps the count-only guard for state written before fingerprints existed", () => {
		const cwd = mkdtempSync(join(tmpdir(), "sync-shared-session-legacy-"));
		try {
			__test.setSharedSession({
				sessionId: "66666666-6666-4666-8666-666666666666",
				cursor: 2,
				cwd,
			});

			const result = __test.syncSharedSession(
				[
					{ role: "user", content: "a", timestamp: 0 },
					{ role: "assistant", content: "b", timestamp: 1 },
					{ role: "user", content: "c", timestamp: 2 },
				],
				cwd,
			);

			assert.equal(result.sessionId, "66666666-6666-4666-8666-666666666666");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

function assistantReply(text) {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "codebuddy-sdk",
		provider: "codebuddy",
		model: "claude-sonnet-5",
		usage: {
			input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	};
}
