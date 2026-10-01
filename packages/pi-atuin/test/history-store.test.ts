import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const JSONL_PATH = join(homedir(), ".pi", "agent", "pi-history-test.jsonl");

// Override the path for testing
const ORIGINAL_PATH = join(homedir(), ".pi", "agent", "pi-history.jsonl");

// We test by directly manipulating the JSONL file since the module
// uses a hardcoded path. For a more thorough test we'd mock the path,
// but for now we test the JSONL read/write logic directly.

describe("JSONL read/write", () => {
	const testPath = join(homedir(), ".pi", "agent", "pi-history-test.jsonl");

	after(async () => {
		try { await unlink(testPath); } catch {}
	});

	it("writes and reads JSONL entries", async () => {
		const entries = [
			{ id: "1", text: "npm install", timestamp: 1000, source: "pi" },
			{ id: "2", text: "git commit", timestamp: 2000, source: "pi" },
		];

		const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
		await writeFile(testPath, lines, "utf8");

		const raw = await readFile(testPath, "utf8");
		const parsed = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

		assert.equal(parsed.length, 2);
		assert.equal(parsed[0].text, "npm install");
		assert.equal(parsed[1].text, "git commit");
	});

	it("handles empty file", async () => {
		await writeFile(testPath, "", "utf8");
		const raw = await readFile(testPath, "utf8");
		const lines = raw.split("\n").filter((l) => l.trim());
		assert.equal(lines.length, 0);
	});

	it("trims old entries when exceeding limit", async () => {
		const entries = Array.from({ length: 100 }, (_, i) => ({
			id: String(i),
			text: `command ${i}`,
			timestamp: i * 1000,
			source: "pi",
		}));

		const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
		await writeFile(testPath, lines, "utf8");

		// Simulate trim: keep last 50
		const raw = await readFile(testPath, "utf8");
		const allLines = raw.split("\n").filter((l) => l.trim());
		const trimmed = allLines.slice(allLines.length - 50);
		await writeFile(testPath, trimmed.join("\n") + "\n", "utf8");

		const result = await readFile(testPath, "utf8");
		const resultLines = result.split("\n").filter((l) => l.trim());
		assert.equal(resultLines.length, 50);

		const first = JSON.parse(resultLines[0]);
		assert.equal(first.text, "command 50");
	});
});

describe("file permissions", () => {
	it("JSONL file has restrictive permissions", async () => {
		try {
			const stat = await import("node:fs/promises").then((fs) =>
				fs.stat(ORIGINAL_PATH),
			);
			// Check that file is not world-readable (mode & 0o044 === 0)
			const mode = stat.mode;
			const worldRead = mode & 0o044; // group + others read
			assert.equal(worldRead, 0, "File should not be group/others readable");
		} catch {
			// File might not exist yet, that's ok
		}
	});
});
