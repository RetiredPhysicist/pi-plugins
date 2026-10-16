// Dynamic model list from CodeBuddy SDK supportedModels().

import type { ModelInfo } from "@tencent-ai/agent-sdk";

export type PiModel = {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	contextWindow: number;
	maxTokens: number;
	thinkingLevelMap?: Record<string, string>;
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

const DEFAULT_CONTEXT = 131_072;
const DEFAULT_MAX_TOKENS = 8192;

type SdkModelMeta = {
	id?: string;
	name?: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	contextWindow?: { supportedLengths?: ReadonlyArray<number>; defaultLength?: number };
};

function detectThinking(id: string): boolean {
	return /claude|gemini|gpt-5|hy3|deepseek|glm/i.test(id);
}

function detectImages(id: string): boolean {
	return /claude|gemini|gpt/i.test(id);
}

function estimateContext(id: string): number {
	const lower = id.toLowerCase();
	if (lower.includes("gemini")) return 1_048_576;
	if (lower.includes("claude") || lower.includes("gpt")) return 200_000;
	return DEFAULT_CONTEXT;
}

function estimateMaxTokens(id: string): number {
	if (id.toLowerCase().includes("gpt")) return 16_384;
	return DEFAULT_MAX_TOKENS;
}

function positive(value: number | undefined): number | undefined {
	return value && value > 0 ? value : undefined;
}

function contextFromMetadata(model: SdkModelMeta): number | undefined {
	const lengths = model.contextWindow?.supportedLengths?.filter((n) => n > 0) ?? [];
	return positive(model.maxInputTokens)
		?? positive(model.contextWindow?.defaultLength)
		?? (lengths.length ? Math.max(...lengths) : undefined);
}

export function rawModelsFromSdk(supported: Array<ModelInfo & SdkModelMeta>): PiModel[] {
	return supported
		.map((m) => ({ ...m, id: m.id ?? m.value, name: m.name ?? m.displayName ?? m.id ?? m.value }))
		.filter((m) => m.id)
		.map((m) => ({
		id: m.id!,
		name: m.name || m.id!,
		reasoning: detectThinking(m.id!),
		input: detectImages(m.id!) ? ["text", "image"] as const : ["text"] as const,
		contextWindow: contextFromMetadata(m) ?? estimateContext(m.id!),
		maxTokens: positive(m.maxOutputTokens) ?? estimateMaxTokens(m.id!),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	}));
}

export const FALLBACK_MODELS: PiModel[] = [
	{ id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text"], contextWindow: 1_000_000, maxTokens: 128_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
];

export type ModelOverrides = {
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
	images?: boolean;
};

/**
 * Apply config-driven overrides on top of the estimated model metadata.
 * `globalOverrides` applies to every model; `perModel` is keyed by model id
 * (matched by exact id first, then case-insensitive substring, longest key
 * wins) and beats the global defaults.
 */
/**
 * True when a `modelOverrides` key selects `id`: exact match, or a
 * case-insensitive substring.
 */
export function overrideKeyMatches(id: string, key: string): boolean {
	const k = key.toLowerCase();
	return id === key || (k.length > 0 && id.toLowerCase().includes(k));
}

/** True when any `modelOverrides` key selects `id`. */
export function matchesAnyOverrideKey(id: string, perModel?: Record<string, unknown>): boolean {
	if (!perModel) return false;
	return Object.keys(perModel).some((key) => overrideKeyMatches(id, key));
}

export function buildModels(
	models: PiModel[],
	globalOverrides?: ModelOverrides,
	perModel?: Record<string, ModelOverrides>,
): PiModel[] {
	const sortedKeys = Object.keys(perModel ?? {}).sort((a, b) => b.length - a.length);
	const match = (id: string): ModelOverrides | undefined => {
		for (const key of sortedKeys) {
			if (overrideKeyMatches(id, key)) return perModel![key];
		}
		return undefined;
	};
	return models.map((m) => {
		const o = { ...globalOverrides, ...match(m.id) };
		const contextWindow = o.contextWindow ?? m.contextWindow;
		const maxTokens = o.maxTokens ?? m.maxTokens;
		const input: ("text" | "image")[] = o.images === undefined
			? m.input
			: (o.images ? ["text", "image"] as const : ["text"] as const);
		return {
			...m,
			contextWindow,
			maxTokens,
			reasoning: o.reasoning ?? m.reasoning,
			input,
			cost: m.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		};
	});
}

export function codebuddyModelId(model: { id: string }): string {
	return model.id;
}

export function resolveModel<T extends { id: string }>(models: T[], input: string): T | undefined {
	const lower = input.toLowerCase();
	return models.find((m) => m.id === lower || m.id.toLowerCase().includes(lower));
}
