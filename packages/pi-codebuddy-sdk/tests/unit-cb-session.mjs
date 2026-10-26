/**
 * Regression test for issue #21: Session.save() must use the session's own
 * CodeBuddy directory instead of falling back to the process default.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSession, getProjectDir, readSession } from "../src/cb-session-io.js";

describe("Session.save", () => {
	it("writes to the explicit codebuddyDir when CODEBUDDY_CONFIG_DIR is unset", () => {
		const root = mkdtempSync(join(tmpdir(), "cb-session-save-"));
		const home = join(root, "home");
		const projectPath = join(root, "project");
		const isolatedDir = join(root, "isolated");
		const previousHome = process.env.HOME;
		const previousConfigDir = process.env.CODEBUDDY_CONFIG_DIR;
		process.env.HOME = home;
		delete process.env.CODEBUDDY_CONFIG_DIR;

		try {
			const session = createSession({ projectPath, codebuddyDir: isolatedDir });
			session.importPiMessages([{ role: "user", content: "hi" }]);
			session.save();

			assert.equal(existsSync(session.jsonlPath), true);
			assert.equal(session.jsonlPath.startsWith(isolatedDir), true);
			assert.equal(existsSync(join(getProjectDir(projectPath, join(home, ".codebuddy")), `${session.sessionId}.jsonl`)), false);
			assert.deepEqual(readSession(session.sessionId, projectPath, isolatedDir)?.messages, [
				{ role: "user", content: "hi" },
			]);
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
			if (previousConfigDir === undefined) delete process.env.CODEBUDDY_CONFIG_DIR;
			else process.env.CODEBUDDY_CONFIG_DIR = previousConfigDir;
			rmSync(root, { recursive: true, force: true });
		}
	});
});
