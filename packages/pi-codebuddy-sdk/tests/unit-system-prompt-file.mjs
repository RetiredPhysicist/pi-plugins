/**
 * Large system prompts must not be handed to spawn() as one argv element:
 * Windows caps the whole command line at 32767 characters, so a pi prompt of
 * realistic size fails with ENAMETOOLONG before the CLI exists (issue #30).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeSystemPrompt, systemPromptArgvBudget, writeSystemPromptFile } from "../src/system-prompt-file.js";

let dir;

describe("routeSystemPrompt", () => {
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "codebuddy-prompt-"));
		process.env.CODEBUDDY_SDK_SYSTEM_PROMPT_DIR = dir;
	});

	it("keeps small prompts on argv", () => {
		const result = routeSystemPrompt("short prompt", { model: "m" });
		assert.equal(result.systemPrompt, "short prompt");
		assert.deepEqual(result.extraArgs, { model: "m" });
	});

	it("routes prompts past the budget through --system-prompt-file", () => {
		const prompt = "S".repeat(200);
		const result = routeSystemPrompt(prompt, { model: "m" }, 100);
		assert.equal(result.systemPrompt, undefined, "the prompt must not ride on argv");
		assert.equal(result.extraArgs.model, "m", "unrelated CLI flags survive routing");
		const path = result.extraArgs["system-prompt-file"];
		assert.ok(path, "the CLI must receive a prompt file path");
		assert.equal(readFileSync(path, "utf8"), prompt);
		rmSync(dir, { recursive: true, force: true });
	});

	it("uses the same file for identical prompts and a new one after an edit", () => {
		const first = writeSystemPromptFile("same prompt", dir);
		const second = writeSystemPromptFile("same prompt", dir);
		const edited = writeSystemPromptFile("same prompt, edited", dir);
		assert.equal(first, second, "content-addressed cache must be stable");
		assert.notEqual(first, edited);
		assert.equal(readFileSync(edited, "utf8"), "same prompt, edited");
		rmSync(dir, { recursive: true, force: true });
	});

	it("keeps the Windows budget well under the 32767-character command line", () => {
		assert.ok(systemPromptArgvBudget("win32") <= 8_000);
		assert.ok(systemPromptArgvBudget("linux") >= systemPromptArgvBudget("win32"));
	});
});
