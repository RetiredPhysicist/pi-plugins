/**
 * /atuin slash commands for pi-atuin.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { PiAtuinConfig } from "./config.js";

export type ConfigGetter = () => PiAtuinConfig;
export type ConfigSetter = (next: PiAtuinConfig) => void;

export function toggleRecordAgentHistory(current: boolean): boolean {
	return !current;
}

export function formatRecordAgentHistoryStatus(enabled: boolean): string {
	return `Agent bash history recording: ${enabled ? "on" : "off"}`;
}

export function registerAtuinCommands(
	pi: ExtensionAPI,
	getConfig: ConfigGetter,
	setConfig: ConfigSetter,
): void {
	pi.registerCommand("atuin", {
		description: "Toggle agent bash history recording",
		handler: async (args, ctx) => {
			const subcommand = args.trim().split(/\s+/)[0]?.toLowerCase();

			if (subcommand !== "record-agent-history") {
				ctx.ui.notify("/atuin record-agent-history", "info");
				return;
			}

			toggleRecordAgentHistoryCommand(ctx, getConfig, setConfig);
		},
	});
}

function toggleRecordAgentHistoryCommand(
	ctx: ExtensionCommandContext,
	getConfig: ConfigGetter,
	setConfig: ConfigSetter,
): void {
	const config = getConfig();
	const next = toggleRecordAgentHistory(config.recordAgentHistory);
	setConfig({ ...config, recordAgentHistory: next });
	ctx.ui.notify(formatRecordAgentHistoryStatus(next), "info");
}
