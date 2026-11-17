/**
 * Regression test for issue #21: Session.save() must use the session's own
 * CodeBuddy directory instead of falling back to the process default.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

	it("replaces the session file atomically: no temp files left behind", () => {
		const root = mkdtempSync(join(tmpdir(), "cb-session-atomic-"));
		const codebuddyDir = join(root, "codebuddy");
		try {
			const session = createSession({ projectPath: root, codebuddyDir });
			session.importPiMessages([{ role: "user", content: "turn one" }]);
			session.save();
			session.importPiMessages([
				{ role: "user", content: "turn one" },
				{ role: "assistant", content: [{ type: "text", text: "ok" }] },
				{ role: "user", content: "turn two" },
			]);
			session.save();

			const dir = dirname(session.jsonlPath);
			const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"));
			assert.deepEqual(leftovers, [], "atomic write must not leave temp files");

			// The session history is owner-only: a umask of 022 must not make
			// the renamed replacement world/group-readable.
			assert.equal(statSync(session.jsonlPath).mode & 0o777, 0o600, "session file stays 0600");
			// A pre-hardened session keeps its mode across atomic replaces.
			chmodSync(session.jsonlPath, 0o400);
			session.importPiMessages([
				{ role: "user", content: "turn one" },
				{ role: "assistant", content: [{ type: "text", text: "ok" }] },
				{ role: "user", content: "turn two" },
				{ role: "user", content: "turn three" },
			]);
			session.save();
			assert.equal(statSync(session.jsonlPath).mode & 0o777, 0o400, "existing mode is preserved");

			const restored = readSession(session.sessionId, root, codebuddyDir);
			assert.ok(restored, "session readable after atomic replace");
			assert.equal(restored.messages.length, 4);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
