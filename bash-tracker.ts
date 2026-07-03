/**
 * Event-based bash → atuin tracking for pi-atuin.
 *
 * Replaces `atuin hook install pi` without registering a conflicting `bash` tool.
 * Compatible with pi-tool-display and other extensions that own bash rendering.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLocalBashOperations, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import {
	createPiAtuinExec,
	endAtuinHistory,
	startAtuinHistory,
} from "./atuin-cli.js";
import { parseBashExitCode } from "./bash-exit-code.js";
import type { ConfigGetter } from "./commands.js";

interface PendingBashHistory {
	historyId: string;
	cwd: string;
}

export function registerBashTracker(pi: ExtensionAPI, getConfig: ConfigGetter): void {
	const exec = createPiAtuinExec(pi);
	const pending = new Map<string, PendingBashHistory>();

	pi.on("tool_call", async (event, ctx) => {
		if (!getConfig().recordAgentHistory) return;
		if (!isToolCallEventType("bash", event)) return;

		const command = event.input.command?.trim();
		if (!command) return;

		const historyId = await startAtuinHistory(exec, ctx.cwd, command);
		if (historyId) {
			pending.set(event.toolCallId, { historyId, cwd: ctx.cwd });
		}
	});

	pi.on("tool_result", async (event) => {
		if (!getConfig().recordAgentHistory) return;
		if (event.toolName !== "bash") return;

		const track = pending.get(event.toolCallId);
		if (!track) return;

		pending.delete(event.toolCallId);
		await endAtuinHistory(
			exec,
			track.cwd,
			track.historyId,
			parseBashExitCode(event),
		);
	});

	const local = createLocalBashOperations();

	pi.on("user_bash", async (event) => {
		const historyId = await startAtuinHistory(exec, event.cwd, event.command);

		return {
			operations: {
				async exec(command, cwd, options) {
					let exitCode: number | null = null;
					try {
						const result = await local.exec(command, cwd, options);
						exitCode = result.exitCode;
						return result;
					} finally {
						if (historyId) {
							await endAtuinHistory(
								exec,
								cwd,
								historyId,
								exitCode ?? (options.signal?.aborted ? 130 : 1),
							);
						}
					}
				},
			},
		};
	});

	pi.on("session_shutdown", () => {
		pending.clear();
	});
}
