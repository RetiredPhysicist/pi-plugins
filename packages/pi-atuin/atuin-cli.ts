/**
 * Shared Atuin CLI helpers for pi-atuin.
 *
 * Uses execFile (history-store) or pi.exec (bash-tracker) via a thin adapter.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

export const ATUIN_AUTHOR = "pi";
export const ATUIN_TIMEOUT_MS = 10_000;

export type AtuinExecResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export type AtuinExec = (
	command: string,
	args: string[],
	options?: { cwd?: string; timeout?: number },
) => Promise<AtuinExecResult>;

export function createExecFileAtuinExec(): AtuinExec {
	return async (command, args, options) => {
		try {
			const { stdout, stderr } = await execFileAsync(command, args, {
				cwd: options?.cwd,
				timeout: options?.timeout ?? ATUIN_TIMEOUT_MS,
			});
			return { code: 0, stdout: String(stdout), stderr: String(stderr) };
		} catch (err: unknown) {
			const e = err as { code?: number; stdout?: string; stderr?: string };
			return {
				code: typeof e.code === "number" ? e.code : 1,
				stdout: String(e.stdout ?? ""),
				stderr: String(e.stderr ?? ""),
			};
		}
	};
}

export function createPiAtuinExec(pi: ExtensionAPI): AtuinExec {
	return async (command, args, options) => {
		const result = await pi.exec(command, args, {
			cwd: options?.cwd,
			timeout: options?.timeout ?? ATUIN_TIMEOUT_MS,
		});
		return {
			code: result.code,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	};
}

export async function startAtuinHistory(
	exec: AtuinExec,
	cwd: string,
	command: string,
): Promise<string | undefined> {
	try {
		const result = await exec(
			"atuin",
			["history", "start", "--author", ATUIN_AUTHOR, "--", command],
			{ cwd, timeout: ATUIN_TIMEOUT_MS },
		);
		if (result.code !== 0) return undefined;
		const id = result.stdout.trim();
		return id.length > 0 ? id : undefined;
	} catch {
		return undefined;
	}
}

export async function endAtuinHistory(
	exec: AtuinExec,
	cwd: string,
	historyId: string,
	exitCode: number,
): Promise<void> {
	try {
		await exec(
			"atuin",
			["history", "end", historyId, "--exit", String(exitCode)],
			{ cwd, timeout: ATUIN_TIMEOUT_MS },
		);
	} catch {
		// Never block pi on atuin failures.
	}
}

export async function recordAtuinCommand(
	exec: AtuinExec,
	cwd: string,
	command: string,
	exitCode = 0,
): Promise<void> {
	const historyId = await startAtuinHistory(exec, cwd, command);
	if (!historyId) return;
	await endAtuinHistory(exec, cwd, historyId, exitCode);
}
