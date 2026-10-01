/**
 * Simple fuzzy matching — no external dependencies.
 *
 * Returns a score and the matched character indices for highlight rendering.
 * Higher score = better match.
 */

export interface FuzzyResult {
	score: number;
	indices: number[];
}

/**
 * Match `query` against `target` (case-insensitive).
 * Returns `null` if no match, otherwise a score and matched indices.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
	if (!query) return { score: 1, indices: [] };

	const q = query.toLowerCase();
	const t = target.toLowerCase();

	// Exact substring match — highest priority
	const substringIdx = t.indexOf(q);
	if (substringIdx !== -1) {
		const indices = Array.from({ length: q.length }, (_, i) => substringIdx + i);
		let score = 1000 + q.length;
		if (substringIdx === 0) {
			score += 100; // starts at beginning
		} else if (/[\s_\-/]/.test(target[substringIdx - 1])) {
			score += 50; // starts at word boundary
		}
		return { score, indices };
	}

	// Fuzzy character match — characters in order, not necessarily contiguous
	const indices: number[] = [];
	let qi = 0;
	let lastMatchIdx = -1;
	let consecutiveBonus = 0;
	let score = 0;

	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) {
			indices.push(ti);

			// Position bonus (earlier = better)
			score += Math.max(0, 10 - ti);

			// Consecutive match bonus
			if (lastMatchIdx === ti - 1) {
				consecutiveBonus += 5;
			} else {
				consecutiveBonus = 0;
			}

			// Word boundary bonus (after space, dash, underscore, slash)
			if (ti === 0 || /[ _\-/]/.test(target[ti - 1])) {
				score += 15;
			}

			lastMatchIdx = ti;
			qi++;
		}
	}

	// Not all query characters matched
	if (qi < q.length) return null;

	score += consecutiveBonus + q.length * 2;

	return { score, indices };
}

/**
 * Sort and filter items by fuzzy match against query.
 * Returns items in descending score order.
 */
export function fuzzySearch<T>(
	query: string,
	items: T[],
	getText: (item: T) => string,
	limit = 50,
): Array<{ item: T; result: FuzzyResult }> {
	if (!query) {
		return items.slice(0, limit).map((item) => ({
			item,
			result: { score: 1, indices: [] },
		}));
	}

	const scored: Array<{ item: T; result: FuzzyResult }> = [];

	for (const item of items) {
		const result = fuzzyMatch(query, getText(item));
		if (result) {
			scored.push({ item, result });
		}
	}

	scored.sort((a, b) => b.result.score - a.result.score);
	return scored.slice(0, limit);
}
