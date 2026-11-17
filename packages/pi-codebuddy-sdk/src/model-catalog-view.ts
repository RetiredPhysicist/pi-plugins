// Rendering for /codebuddy-models: what each CodeBuddy model costs and accepts.

import type { PiModel } from "./models.js";

const nameWidth = (models: readonly PiModel[]) =>
	Math.min(40, Math.max(...models.map((m) => m.id.length), 0));

/** "x0.79 credits" → "0.79 credits"; the CLI's price is charged per turn. */
export function formatCredits(credits: number | undefined): string {
	if (credits === undefined) return "-";
	return credits === 0 ? "free" : `${Math.round(credits * 100) / 100} credits`;
}

export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
	if (tokens >= 1000) return `${Math.round(tokens / 100) / 10}k`;
	return String(tokens);
}

function effortLevels(model: PiModel): string {
	const levels = Object.keys(model.thinkingLevelMap ?? {});
	return levels.length ? levels.join("/") : model.reasoning ? "default" : "off";
}

/** One aligned line per model: id, credits, context window, effort levels. */
export function renderModelCatalog(models: readonly PiModel[]): string[] {
	if (!models.length) return ["No CodeBuddy models discovered."];
	const width = nameWidth(models);
	const lines = [
		`${"MODEL".padEnd(width)}  ${"CREDITS".padEnd(14)}  ${"CONTEXT".padEnd(8)}  EFFORT`,
	];
	for (const model of models) {
		lines.push([
			model.id.padEnd(width),
			formatCredits(model.credits).padEnd(14),
			formatTokens(model.contextWindow).padEnd(8),
			effortLevels(model),
		].join("  "));
	}
	return lines;
}

/** Detail block for one model: description, limits, input modes, effort. */
export function renderModelDetail(model: PiModel): string[] {
	const lines = [
		`${model.id} — ${model.name}`,
		`Credits per turn: ${formatCredits(model.credits)}`,
		`Context window: ${formatTokens(model.contextWindow)} tokens`,
		`Max output: ${formatTokens(model.maxTokens)} tokens`,
		`Input: ${model.input.join(", ")}`,
		`Thinking: ${effortLevels(model)}`,
	];
	if (model.description) lines.push("", model.description);
	return lines;
}
