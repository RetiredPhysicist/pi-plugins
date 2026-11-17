// Route large system prompts through a file instead of argv.
//
// The Agent SDK always passes `systemPrompt` as a single `--system-prompt`
// argv element. Windows caps the whole command line at 32767 characters, and
// pi's prompt (preamble + tool docs + rules + AGENTS.md + the skills catalog)
// is routinely larger than that, so `spawn()` fails with `ENAMETOOLONG`
// before the CLI exists and no turn ever starts.
//
// `codebuddy` accepts `--system-prompt-file <path>` and loads it into the same
// field, so above a per-platform budget the prompt goes to a content-addressed
// cache file and the CLI only sees the path. Below it, argv stays unchanged.

import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/** Windows `CreateProcess` allows 32767 characters for the entire command
 *  line, shared with the SDK's own flags, `--mcp-config`, and the runtime
 *  prefix, so the prompt budget stays conservative there. Elsewhere the limit
 *  is the kernel's `MAX_ARG_STRLEN` (128 KiB per argument). */
export function systemPromptArgvBudget(platform: NodeJS.Platform = process.platform): number {
	return platform === "win32" ? 8_000 : 100_000;
}

const cacheDir = () => process.env.CODEBUDDY_SDK_SYSTEM_PROMPT_DIR
	|| join(homedir(), ".pi", "agent", "codebuddy-sdk-prompts");

/** Write `prompt` to a cache file and return the path the CLI should read. */
export function writeSystemPromptFile(prompt: string, dir: string = cacheDir()): string {
	const name = createHash("sha256").update(prompt).digest("hex").slice(0, 32);
	const path = join(dir, `${name}.txt`);
	mkdirSync(dir, { recursive: true });
	try {
		if (readFileSync(path, "utf8") === prompt) return path;
	} catch {
		// Missing or unreadable cache entry — rewrite below.
	}
	writeFileSync(path, prompt, { mode: 0o600 });
	return path;
}

export type SystemPromptArgs = {
	/** Pass as the SDK's `systemPrompt` option (argv). */
	systemPrompt?: string;
	/** Additions to the CLI's `extraArgs`. */
	extraArgs?: Record<string, string | null>;
};

/**
 * Split a prompt between the `systemPrompt` option and `--system-prompt-file`.
 * Prompts within the budget keep the plain `systemPrompt` path.
 */
export function routeSystemPrompt(
	prompt: string | undefined,
	baseExtraArgs: Record<string, string | null> = {},
	budget: number = systemPromptArgvBudget(),
): SystemPromptArgs {
	if (!prompt) return { extraArgs: baseExtraArgs };
	if (prompt.length <= budget) return { systemPrompt: prompt, extraArgs: baseExtraArgs };
	return { extraArgs: { ...baseExtraArgs, "system-prompt-file": writeSystemPromptFile(prompt) } };
}
