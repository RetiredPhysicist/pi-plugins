import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { buildCodebuddyEnv, loadConfig, resolveCodebuddyConfigDir } from "../src/config.js";

function withTempHome(fn) {
	const oldHome = process.env.HOME;
	const home = mkdtempSync(join(tmpdir(), "codebuddy-sdk-home-"));
	try {
		process.env.HOME = home;
		return fn(home);
	} finally {
		if (oldHome === undefined) delete process.env.HOME;
		else process.env.HOME = oldHome;
		rmSync(home, { recursive: true, force: true });
	}
}

describe("loadConfig", () => {
	it("loads project config from Pi's configured project directory", () => withTempHome(() => {
		const cwd = mkdtempSync(join(tmpdir(), "codebuddy-sdk-project-"));
		try {
			const configDir = join(cwd, CONFIG_DIR_NAME);
			mkdirSync(configDir, { recursive: true });
			writeFileSync(join(configDir, "codebuddy-sdk.json"), JSON.stringify({
				provider: { plan: "max" },
				askCodebuddy: { enabled: false },
			}));

			assert.deepEqual(loadConfig(cwd), {
				provider: { plan: "max" },
				askCodebuddy: { enabled: false },
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}));

	it("merges project config over global config", () => withTempHome((home) => {
		const cwd = mkdtempSync(join(tmpdir(), "codebuddy-sdk-project-"));
		try {
			const globalDir = join(home, ".pi", "agent");
			const projectDir = join(cwd, CONFIG_DIR_NAME);
			mkdirSync(globalDir, { recursive: true });
			mkdirSync(projectDir, { recursive: true });
			writeFileSync(join(globalDir, "codebuddy-sdk.json"), JSON.stringify({
				provider: { plan: "pro", strictMcpConfig: true },
				askCodebuddy: { enabled: true, defaultMode: "read" },
			}));
			writeFileSync(join(projectDir, "codebuddy-sdk.json"), JSON.stringify({
				provider: { plan: "max" },
				askCodebuddy: { enabled: false },
			}));

			assert.deepEqual(loadConfig(cwd), {
				provider: { plan: "max", strictMcpConfig: true },
				askCodebuddy: { enabled: false, defaultMode: "read" },
			});
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}));
});

describe("isolated CodeBuddy environment", () => {
	it("stays opt-in", () => {
		assert.equal(resolveCodebuddyConfigDir(undefined), undefined);
		assert.equal(resolveCodebuddyConfigDir({}), undefined);
		assert.equal(resolveCodebuddyConfigDir({ isolatedEnv: false }), undefined);
		assert.equal(buildCodebuddyEnv({}, {}).CODEBUDDY_CONFIG_DIR, undefined);
		assert.equal(buildCodebuddyEnv({}, {}).CODEBUDDY_MEMORY_ENABLED, undefined);
	});

	it("uses one private config dir and disables every memory source", () => withTempHome((home) => {
		const provider = { isolatedEnv: true };
		assert.equal(resolveCodebuddyConfigDir(provider), join(home, ".codebuddy-cli-isolated"));
		assert.deepEqual(buildCodebuddyEnv(provider, {}), {
			DISABLE_AUTO_COMPACT: "1",
			CODEBUDDY_CONFIG_DIR: join(home, ".codebuddy-cli-isolated"),
			CODEBUDDY_MEMORY_ENABLED: "0",
			CODEBUDDY_DISABLE_AUTO_MEMORY: "1",
			CODEBUDDY_TEAM_MEMORY_ENABLED: "0",
		});
	}));

	it("honours a custom config dir", () => {
		const provider = { isolatedEnv: true, codebuddyConfigDir: "/tmp/codebuddy-pi-test" };
		assert.equal(resolveCodebuddyConfigDir(provider), "/tmp/codebuddy-pi-test");
		assert.equal(buildCodebuddyEnv(provider, {}).CODEBUDDY_CONFIG_DIR, "/tmp/codebuddy-pi-test");
	});
});
