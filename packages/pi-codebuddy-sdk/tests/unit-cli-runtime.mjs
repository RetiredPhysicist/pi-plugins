/**
 * Tests for the CLI child-runtime fallback (src/cli-runtime.js).
 *
 * The Agent SDK spawns the CLI with the *host* runtime, which fails with
 * `Executable not found in $PATH: "bun"` on Bun-compiled hosts that ship no
 * `bun` executable. These tests cover the replacement runtime selection.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOnPath, resolveCliRuntime, withCliRuntime } from "../src/cli-runtime.js";

let tmp;

/** Create an executable file named `name` inside the temp dir and return its dir. */
function fakeBin(name) {
	const path = join(tmp, name);
	writeFileSync(path, "#!/bin/sh\nexit 0\n");
	chmodSync(path, 0o755);
	return tmp;
}

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "cb-runtime-"));
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

describe("isOnPath", () => {
	it("finds an executable in a PATH entry", () => {
		fakeBin("node");
		assert.equal(isOnPath("node", tmp), true);
	});

	it("rejects a missing name, an empty PATH, and a non-executable file", () => {
		writeFileSync(join(tmp, "bun"), "not executable");
		assert.equal(isOnPath("node", tmp), false);
		assert.equal(isOnPath("bun", tmp), false);
		assert.equal(isOnPath("node", undefined), false);
		assert.equal(isOnPath("node", ""), false);
	});

	it("searches every PATH entry", () => {
		fakeBin("node");
		assert.equal(isOnPath("node", `${join(tmp, "nope")}:${tmp}`), true);
	});
});

describe("resolveCliRuntime", () => {
	it("leaves node hosts alone", () => {
		fakeBin("node");
		assert.equal(resolveCliRuntime({ versions: { node: "24.0.0" }, path: tmp }), undefined);
	});

	it("leaves a Bun host alone when an external bun is available", () => {
		fakeBin("bun");
		fakeBin("node");
		assert.equal(resolveCliRuntime({ versions: { bun: "1.4.3" }, path: tmp }), undefined);
	});

	it("falls back to node for a Bun host without bun", () => {
		fakeBin("node");
		assert.equal(resolveCliRuntime({ versions: { bun: "1.4.3" }, path: tmp }), "node");
	});

	it("stays silent when neither runtime is available", () => {
		assert.equal(resolveCliRuntime({ versions: { bun: "1.4.3" }, path: tmp }), undefined);
	});
});

describe("withCliRuntime", () => {
	it("keeps an executable the caller set itself", () => {
		fakeBin("node");
		const args = { prompt: " ", options: { executable: "deno" } };
		assert.equal(withCliRuntime(args, undefined, { versions: { bun: "1.4.3" }, path: tmp }), args);
	});

	it("prefers the configured executable", () => {
		const args = { prompt: " ", options: {} };
		const patched = withCliRuntime(args, "bun", { versions: {}, path: undefined });
		assert.equal(patched.options.executable, "bun");
		assert.deepEqual(args.options, {});
	});

	it("injects node on a Bun host and leaves node hosts untouched", () => {
		fakeBin("node");
		const args = { prompt: " ", options: { model: "step-5-preview" } };
		const patched = withCliRuntime(args, undefined, { versions: { bun: "1.4.3" }, path: tmp });
		assert.equal(patched.options.executable, "node");
		assert.equal(patched.options.model, "step-5-preview");
		assert.deepEqual(args.options, { model: "step-5-preview" });
		assert.equal(withCliRuntime(args, undefined, { versions: { node: "24.0.0" }, path: tmp }), args);
	});
});
