/**
 * Tests for CodeBuddy model helpers.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildModels, codebuddyModelId, rawModelsFromSdk, resolveModel, FALLBACK_MODELS } from "../src/models.js";

describe("rawModelsFromSdk", () => {
	it("maps SDK ModelInfo to pi models", () => {
		const models = rawModelsFromSdk([
			{ value: "vendor-thinking-model", displayName: "Thinking Model", description: "" },
			{ id: "claude-sonnet-4.6", name: "Claude Sonnet", description: "" },
		]);
		assert.equal(models[0].id, "vendor-thinking-model");
		assert.equal(models[1].input.includes("image"), true);
		assert.deepEqual(models[0].cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
	});

	it("prefers served metadata over the name estimate", () => {
		const models = rawModelsFromSdk([
			{
				id: "step-5-preview",
				name: "Step-5-Preview",
				maxInputTokens: 1_000_000,
				maxOutputTokens: 64_000,
				description: "",
			},
			{
				id: "hy4-preview",
				name: "Hy4",
				contextWindow: { defaultLength: 960_000, supportedLengths: [200_000, 960_000] },
				description: "",
			},
			{
				id: "custom-long",
				name: "Custom",
				contextWindow: { supportedLengths: [128_000, 512_000] },
				description: "",
			},
		]);
		assert.equal(models[0].contextWindow, 1_000_000);
		assert.equal(models[0].maxTokens, 64_000);
		assert.equal(models[1].contextWindow, 960_000);
		assert.equal(models[2].contextWindow, 512_000);
	});

	it("ignores non-positive metadata and falls back to the name estimate", () => {
		const models = rawModelsFromSdk([
			{ id: "step-5-preview", name: "Step", maxInputTokens: 0, maxOutputTokens: -1, description: "" },
			{ id: "gemini-pro", name: "Gemini", description: "" },
			{ id: "claude-sonnet", name: "Sonnet", description: "" },
			{ id: "gpt-5", name: "GPT", description: "" },
		]);
		assert.equal(models[0].contextWindow, 131_072);
		assert.equal(models[0].maxTokens, 8192);
		assert.equal(models[1].contextWindow, 1_048_576);
		assert.equal(models[2].contextWindow, 200_000);
		assert.equal(models[3].contextWindow, 200_000);
		assert.equal(models[3].maxTokens, 16_384);
	});

	it("lets buildModels overrides beat metadata", () => {
		const models = buildModels(
			rawModelsFromSdk([{ id: "step-5-preview", name: "Step", maxInputTokens: 1_000_000, description: "" }]),
			{ contextWindow: 200_000 },
		);
		assert.equal(models[0].contextWindow, 200_000);
	});
});

describe("buildModels", () => {
	it("preserves order from SDK", () => {
		const models = buildModels(rawModelsFromSdk([
			{ value: "model-b", displayName: "B", description: "" },
			{ value: "model-a", displayName: "A", description: "" },
		]));
		assert.deepEqual(models.map((m) => m.id), ["model-b", "model-a"]);
	});

	it("applies global contextWindow/maxTokens overrides", () => {
		const models = buildModels(
			rawModelsFromSdk([{ value: "vendor-text-model", displayName: "H", description: "" }]),
			{ contextWindow: 300_000, maxTokens: 32_768 },
		);
		assert.equal(models[0].contextWindow, 300_000);
		assert.equal(models[0].maxTokens, 32_768);
	});

	it("applies per-model overrides and lets them beat globals", () => {
		const models = buildModels(
			rawModelsFromSdk([
				{ value: "claude-sonnet", displayName: "Sonnet", description: "" },
				{ value: "gpt-5", displayName: "GPT-5", description: "" },
			]),
			{ contextWindow: 200_000 },
			{ "gpt-5": { contextWindow: 1_048_576, maxTokens: 64_000, reasoning: true, images: false } },
		);
		assert.equal(models[0].contextWindow, 200_000); // global applies
		assert.equal(models[1].contextWindow, 1_048_576); // per-model wins
		assert.equal(models[1].maxTokens, 64_000);
		assert.equal(models[1].reasoning, true);
		assert.deepEqual(models[1].input, ["text"]); // images=false
	});

	it("matches per-model override by substring (longest key wins)", () => {
		const models = buildModels(
			rawModelsFromSdk([{ value: "gpt-5-max", displayName: "M", description: "" }]),
			undefined,
			{ gpt: { maxTokens: 8_192 }, "gpt-5-max": { maxTokens: 128_000 } },
		);
		assert.equal(models[0].maxTokens, 128_000);
	});
});

describe("codebuddyModelId", () => {
	it("returns model id unchanged", () => {
		assert.equal(codebuddyModelId({ id: "vendor-text-model" }), "vendor-text-model");
	});
});

describe("resolveModel", () => {
	const models = buildModels(FALLBACK_MODELS);

	it("resolves by partial id", () => {
		assert.equal(resolveModel(models, "deepseek")?.id, "deepseek-v4.1-flash");
	});

	it("returns undefined when no match", () => {
		assert.equal(resolveModel(models, "gpt-9"), undefined);
	});
});

describe("capability hints", () => {
	// Every id the CodeBuddy backend serves. All of them are reasoning-only, and
	// all but glm-5.1 / glm-5.2 accept image input (verified with a 1x1 PNG probe
	// against the live backend).
	const SERVED_IDS = [
		"hy4-preview", "hy3", "hy3-x", "step-5-preview", "space-bunny",
		"deepseek-v4.1-flash", "glm-5.3", "glm-5.3-flash", "glm-5.3-flashx",
		"glm-5.2", "glm-5.1", "glm-5v-turbo", "minimax-m3-pay", "minimax-m2.7",
		"kimi-k3-2", "kimi-k2.8-preview", "kimi-k2.7", "kimi-k2.6", "deepseek-v4-pro",
	];
	const TEXT_ONLY = new Set(["glm-5.1", "glm-5.2"]);

	it("marks the served fleet as reasoning and image-capable", () => {
		const models = rawModelsFromSdk(SERVED_IDS.map((id) => ({ id, name: id })));
		for (const model of models) {
			assert.equal(model.reasoning, true, `${model.id} is a reasoning model`);
			assert.equal(model.input.includes("image"), !TEXT_ONLY.has(model.id), `${model.id} image capability`);
		}
	});

	it("keeps unverified models on the conservative defaults", () => {
		const models = rawModelsFromSdk([
			{ id: "vendor-chat", name: "Vendor Chat" },
			{ id: "deepseek-v3-2-volc", name: "DeepSeek V3" },
			{ id: "hunyuan-chat", name: "Hunyuan Chat" },
		]);
		assert.equal(models[0].reasoning, false);
		assert.deepEqual(models[0].input, ["text"]);
		// Reasoning stays family-wide, image support is version-scoped.
		assert.equal(models[1].reasoning, true);
		assert.deepEqual(models[1].input, ["text"]);
		assert.equal(models[2].reasoning, false);
		assert.deepEqual(models[2].input, ["text"]);
	});

	it("still lets modelOverrides win", () => {
		const models = buildModels(rawModelsFromSdk([{ id: "glm-5.2", name: "GLM-5.2" }]), undefined, {
			"glm-5.2": { images: true, reasoning: false },
		});
		assert.equal(models[0].input.includes("image"), true);
		assert.equal(models[0].reasoning, false);
	});
});
