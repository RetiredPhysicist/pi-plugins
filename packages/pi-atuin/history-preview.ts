/**
 * History text normalization and preview helpers for the search TUI.
 *
 * normalizeHistoryText — single-line form for list rows and fuzzy search.
 * buildDetailPreview — multi-line / tail preview for the selected entry.
 */

export const ELLIPSIS = "…";

export type WidthFn = (text: string) => number;

/** Visible width using Unicode code points (ASCII-safe default for tests). */
export const codePointWidth: WidthFn = (s) => Array.from(s).length;

function normalizeLineSegment(line: string): string {
	return line
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Collapse multiline / control chars into one searchable display line. */
export function normalizeHistoryText(text: string): string {
	return text
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map(normalizeLineSegment)
		.filter(Boolean)
		.join(" ");
}

/** Per-line normalization — keeps line breaks for detail preview. */
export function normalizeHistoryLines(text: string): string[] {
	return text.replace(/\r\n?/g, "\n").split("\n").map(normalizeLineSegment);
}

export function isMultilineHistory(text: string): boolean {
	return /[\r\n]/.test(text);
}

/** @deprecated use normalizeHistoryText */
export const flattenHistoryLine = normalizeHistoryText;

export function truncateToWidthPure(
	text: string,
	maxWidth: number,
	ellipsis: string = ELLIPSIS,
	widthOf: WidthFn = codePointWidth,
): string {
	if (maxWidth <= 0) return "";
	if (widthOf(text) <= maxWidth) return text;

	const ellW = widthOf(ellipsis);
	const budget = maxWidth - ellW;
	if (budget <= 0) return Array.from(ellipsis).slice(0, maxWidth).join("");

	const chars = Array.from(text);
	let w = 0;
	let i = 0;
	while (i < chars.length && w + widthOf(chars[i]!) <= budget) {
		w += widthOf(chars[i]!);
		i++;
	}
	return chars.slice(0, i).join("") + ellipsis;
}

export function truncateTailPure(
	text: string,
	maxWidth: number,
	ellipsis: string = ELLIPSIS,
	widthOf: WidthFn = codePointWidth,
): string {
	if (widthOf(text) <= maxWidth) return text;

	const ellW = widthOf(ellipsis);
	const budget = maxWidth - ellW;
	if (budget <= 0) return ellipsis;

	const chars = Array.from(text);
	let w = 0;
	let start = chars.length;
	while (start > 0) {
		const cw = widthOf(chars[start - 1]!);
		if (w + cw > budget) break;
		w += cw;
		start--;
	}
	return ellipsis + chars.slice(start).join("");
}

export function wrapLinePure(
	line: string,
	width: number,
	widthOf: WidthFn = codePointWidth,
): string[] {
	if (width <= 0) return line === "" ? [""] : [line];
	if (line === "") return [""];
	if (widthOf(line) <= width) return [line];

	const chars = Array.from(line);
	const result: string[] = [];
	let i = 0;
	while (i < chars.length) {
		let w = 0;
		let j = i;
		while (j < chars.length) {
			const cw = widthOf(chars[j]!);
			if (w + cw > width) break;
			w += cw;
			j++;
		}
		if (j === i) j = i + 1;
		result.push(chars.slice(i, j).join(""));
		i = j;
	}
	return result;
}

export function needsDetailPreview(
	rawText: string,
	listWidth: number,
	widthOf: WidthFn = codePointWidth,
): boolean {
	if (isMultilineHistory(rawText)) return true;
	return widthOf(normalizeHistoryText(rawText)) > listWidth;
}

const DETAIL_PREVIEW_MAX_LINES = 2;

/**
 * Build 1–2 preview lines for the selected history entry.
 * Multiline: soft-wrap each logical line. Long single line: head + tail.
 */
export function buildDetailPreview(
	rawText: string,
	width: number,
	maxLines: number = DETAIL_PREVIEW_MAX_LINES,
	widthOf: WidthFn = codePointWidth,
): string[] {
	if (maxLines <= 0 || width <= 0) return [];

	if (isMultilineHistory(rawText)) {
		const logical = normalizeHistoryLines(rawText);
		const out: string[] = [];
		for (const line of logical) {
			for (const wrapped of wrapLinePure(line, width, widthOf)) {
				out.push(wrapped);
				if (out.length >= maxLines) return out;
			}
		}
		return out;
	}

	const normalized = normalizeHistoryText(rawText);
	if (widthOf(normalized) <= width) return [];

	if (maxLines >= 2 && widthOf(normalized) > width * 2) {
		const head = truncateToWidthPure(normalized, width, ELLIPSIS, widthOf);
		const tail = truncateTailPure(normalized, width, ELLIPSIS, widthOf);
		if (head !== tail) return [head, tail];
	}

	return [truncateTailPure(normalized, width, ELLIPSIS, widthOf)];
}
