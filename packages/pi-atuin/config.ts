/**
 * pi-atuin settings persisted under ~/.pi/agent/extensions/pi-atuin/config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(
	process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
	"extensions",
	"pi-atuin",
);
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface PiAtuinConfig {
	/** Record agent `bash` tool calls into atuin (default: true). */
	recordAgentHistory: boolean;
}

export const DEFAULT_CONFIG: PiAtuinConfig = {
	recordAgentHistory: true,
};

function normalizeConfig(source: unknown): PiAtuinConfig {
	const raw = source && typeof source === "object" ? (source as Partial<PiAtuinConfig>) : {};
	return {
		recordAgentHistory:
			typeof raw.recordAgentHistory === "boolean"
				? raw.recordAgentHistory
				: DEFAULT_CONFIG.recordAgentHistory,
	};
}

export function loadConfig(): PiAtuinConfig {
	try {
		if (!existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
		const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as unknown;
		return normalizeConfig(raw);
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function saveConfig(config: PiAtuinConfig): void {
	mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
		encoding: "utf8",
		mode: 0o600,
	});
}

export function getConfigPath(): string {
	return CONFIG_FILE;
}
