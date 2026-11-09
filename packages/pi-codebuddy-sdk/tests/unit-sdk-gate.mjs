/**
 * sdk-gate: every gated task runs under a timeout so a hung task cannot
 * hold the serialization chain (and pi startup, via discoverModels) forever.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withSdkGate } from "../src/sdk-gate.js";

describe("withSdkGate timeout", () => {
	it("rejects a task that exceeds its deadline and frees the gate", async () => {
		const start = Date.now();
		await assert.rejects(
			withSdkGate(() => new Promise(() => {}), { timeoutMs: 50 }),
			/SDK gate task timed out after 50ms/,
		);
		// The gate must be free: the next task runs and completes promptly.
		const value = await withSdkGate(async () => "next", { timeoutMs: 5_000 });
		assert.equal(value, "next");
		assert.ok(Date.now() - start < 5_000, "gate stayed blocked after timeout");
	});

	it("still serializes tasks and preserves order", async () => {
		const order = [];
		const a = withSdkGate(async () => {
			await new Promise((r) => setTimeout(r, 60));
			order.push(1);
		}, { timeoutMs: 5_000 });
		const b = withSdkGate(async () => {
			order.push(2);
		}, { timeoutMs: 5_000 });
		await Promise.all([a, b]);
		assert.deepEqual(order, [1, 2]);
	});

	it("does not start the timer while queued behind another task", async () => {
		// Task A holds the gate 80ms; task B has a 50ms budget. B's deadline
		// only counts its own execution, so it must still succeed.
		const a = withSdkGate(() => new Promise((r) => setTimeout(r, 80)), { timeoutMs: 10_000 });
		const b = withSdkGate(async () => "b-ok", { timeoutMs: 50 });
		await a;
		assert.equal(await b, "b-ok");
	});

	it("rejects with the task's own error before any timeout", async () => {
		await assert.rejects(
			withSdkGate(async () => {
				throw new Error("task failed");
			}, { timeoutMs: 5_000 }),
			/task failed/,
		);
	});
});
