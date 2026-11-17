/**
 * /codebuddy-models output: credits, context window and thinking levels per
 * model, aligned so the column stays readable (issue #29).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatCredits, formatTokens, renderModelCatalog, renderModelDetail } from "../src/model-catalog-view.js";

const model = (overrides = {}) => ({
	id: "claude-sonnet-5",
	name: "Claude-Sonnet-5",
	reasoning: true,
	input: ["text", "image"],
	contextWindow: 200_000,
	maxTokens: 128_000,
	thinkingLevelMap: { low: "low", high: "high" },
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	credits: 1.33,
	description: "Anthropic · Agentic coding",
	...overrides,
});

describe("formatCredits", () => {
	it("renders the per-turn price the CLI reports", () => {
		assert.equal(formatCredits(1.33), "1.33 credits");
		assert.equal(formatCredits(2), "2 credits");
		assert.equal(formatCredits(0), "free");
		assert.equal(formatCredits(undefined), "-");
	});
});

describe("formatTokens", () => {
	it("compacts windows", () => {
		assert.equal(formatTokens(200_000), "200k");
		assert.equal(formatTokens(1_000_000), "1M");
		assert.equal(formatTokens(176_000), "176k");
		assert.equal(formatTokens(8192), "8.2k");
	});
});

describe("renderModelCatalog", () => {
	it("lists price, window and effort for each model", () => {
		const lines = renderModelCatalog([model()]);
		assert.match(lines[0], /MODEL\s+CREDITS\s+CONTEXT\s+EFFORT/);
		assert.match(lines[1], /claude-sonnet-5/);
		assert.match(lines[1], /1\.33 credits/);
		assert.match(lines[1], /200k/);
		assert.match(lines[1], /low\/high/);
	});

	it("keeps columns aligned across ids of different lengths", () => {
		const lines = renderModelCatalog([
			model(),
			model({ id: "gpt-6-astra", credits: 0.5 }),
			model({ id: "a-much-longer-model-id", credits: 12 }),
		]);
		const contextColumns = lines.slice(1).map((line) => line.indexOf("200k"));
		assert.equal(new Set(contextColumns).size, 1, "the context column must start at the same offset");
		const headerColumn = lines[0].indexOf("CONTEXT");
		assert.equal(contextColumns[0], headerColumn);
	});

	it("says so when nothing was discovered", () => {
		assert.deepEqual(renderModelCatalog([]), ["No CodeBuddy models discovered."]);
	});
});

describe("renderModelDetail", () => {
	it("shows the model's limits and description", () => {
		const lines = renderModelDetail(model());
		const text = lines.join("\n");
		assert.match(text, /Credits per turn: 1\.33 credits/);
		assert.match(text, /Context window: 200k tokens/);
		assert.match(text, /Max output: 128k tokens/);
		assert.match(text, /Input: text, image/);
		assert.match(text, /Anthropic · Agentic coding/);
	});
});
