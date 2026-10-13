/**
 * The first module instance owns streamSimple on a shared ModelRegistry.
 * A later load of the same registry reuses that stream. A different
 * registry keeps its own stream and does not take ownership.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	ACTIVE_STREAM_SIMPLE_KEY,
	clearOwnedStream,
	providerRegistration,
} from "../src/provider-registration.js";

describe("providerRegistration", () => {
	it("claims the process stream on the first runtime", () => {
		const globals = {};
		const runtime = {};
		const own = () => "first";
		const result = providerRegistration(globals, own, runtime);
		assert.equal(result.streamFn, own);
		assert.equal(result.claimStream, true);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY].streamFn, own);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY].runtime, runtime);
	});

	it("reuses the owning stream on the same runtime", () => {
		const parent = () => "parent";
		const runtime = {};
		const globals = { [ACTIVE_STREAM_SIMPLE_KEY]: { runtime, streamFn: parent } };
		const result = providerRegistration(globals, () => "child", runtime);
		assert.equal(result.streamFn, parent);
		assert.equal(result.claimStream, false);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY].streamFn, parent);
	});

	it("keeps a fresh runtime on its own stream without taking ownership", () => {
		const parent = () => "parent";
		const globals = { [ACTIVE_STREAM_SIMPLE_KEY]: { runtime: {}, streamFn: parent } };
		const own = () => "fresh";
		const result = providerRegistration(globals, own, {});
		assert.equal(result.streamFn, own);
		assert.equal(result.claimStream, false);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY].streamFn, parent);
	});

	it("reuses the owner when the runtime is not known yet", () => {
		const parent = () => "parent";
		const globals = { [ACTIVE_STREAM_SIMPLE_KEY]: { runtime: {}, streamFn: parent } };
		const result = providerRegistration(globals, () => "unknown", undefined);
		assert.equal(result.streamFn, parent);
		assert.equal(result.claimStream, false);
	});

	it("clears only the stream this instance owns", () => {
		const parent = () => "parent";
		const child = () => "child";
		const globals = { [ACTIVE_STREAM_SIMPLE_KEY]: { runtime: {}, streamFn: parent } };
		assert.equal(clearOwnedStream(globals, child), false);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY].streamFn, parent);
		assert.equal(clearOwnedStream(globals, parent), true);
		assert.equal(globals[ACTIVE_STREAM_SIMPLE_KEY], undefined);
	});
});
