/**
 * Atuin-style history search component for pi.
 *
 * Layout: newest entries at the bottom, up-arrow goes to older entries.
 * Data is preloaded before the component renders.
 */

import type { Component, Focusable } from "@earendil-works/pi-tui";
import { CURSOR_MARKER, matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	buildDetailPreview,
	needsDetailPreview,
	normalizeHistoryText,
	ELLIPSIS as PREVIEW_ELLIPSIS,
} from "./history-preview.js";
import { searchHistory, listRecent, type HistoryEntry } from "./history-store.js";

interface SearchResult {
	item: HistoryEntry;
	score: number;
	indices: number[];
}

function fmtTime(ts: number): string {
	const d = Date.now() - ts;
	const s = Math.floor(d / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h`;
	return `${Math.floor(h / 24)}d`;
}

const PREVIEW_MAX_LINES = 2;
const vw: (s: string) => number = (s) => visibleWidth(s);

export class HistorySearchComponent implements Component, Focusable {
	private query = "";
	private results: SearchResult[];
	private sel: number;
	private scroll = 0;
	private cachedW?: number;
	private cachedSel?: number;
	private cachedLines?: string[];
	private _focused = false;
	private visCount = 15;

	private TS_COL = 5;

	constructor(
		private done: (r: string | null) => void,
		private theme: any,
		entries: HistoryEntry[],
	) {
		this.results = [...entries].reverse().map((item) => ({ item, score: 0, indices: [] }));
		this.sel = Math.max(0, this.results.length - 1);
		this.scroll = Math.max(0, this.results.length - this.visCount);
	}

	private async doSearch(): Promise<void> {
		if (!this.query) {
			const e = await listRecent(100);
			this.results = [...e].reverse().map((item) => ({ item, score: 0, indices: [] }));
		} else {
			const raw = await searchHistory(this.query, 50);
			this.results = [...raw].reverse().map((r) => ({
				item: r.item,
				score: r.score,
				indices: r.indices,
			}));
		}
		this.sel = Math.max(0, this.results.length - 1);
		this.scroll = Math.max(0, this.results.length - this.visCount);
		this.invalidate();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.done(null);
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const r = this.results[this.sel];
			this.done(r ? r.item.text : null);
			return;
		}
		if (matchesKey(data, Key.up)) {
			if (this.sel > 0) { this.sel--; this.fixScroll(); this.invalidate(); }
			return;
		}
		if (matchesKey(data, Key.down)) {
			if (this.sel < this.results.length - 1) { this.sel++; this.fixScroll(); this.invalidate(); }
			return;
		}
		if (matchesKey(data, Key.backspace)) {
			this.query = this.query.slice(0, -1);
			this.doSearch();
			return;
		}
		if (data.length === 1 && data >= " ") {
			this.query += data;
			this.doSearch();
			return;
		}
	}

	private fixScroll(): void {
		if (this.sel < this.scroll) this.scroll = this.sel;
		else if (this.sel >= this.scroll + this.visCount) this.scroll = this.sel - this.visCount + 1;
	}

	/**
	 * Build a line that is exactly `w` visible characters wide.
	 * All content goes through this to guarantee no overflow.
	 */
	private line(content: string, w: number): string {
		return truncateToWidth(content, w);
	}

	private B(ch: string): string {
		return this.theme.fg("border", ch);
	}

	private D(s: string): string {
		return this.theme.fg("dim", s);
	}

	render(width: number, height?: number): string[] {
		const W = width;
		const iw = W - 2;

		const cmdAvail = iw - 3 - this.TS_COL - 3;
		const previewWidth = iw - 2;
		const selected = this.results[this.sel];
		const detailPreview =
			selected && needsDetailPreview(selected.item.text, cmdAvail, vw)
				? buildDetailPreview(selected.item.text, previewWidth, PREVIEW_MAX_LINES, vw)
				: [];
		const previewOverhead = detailPreview.length > 0 ? detailPreview.length + 1 : 0;

		this.visCount = Math.max(3, (height ?? 20) - 5 - previewOverhead);

		if (this.cachedW === width && this.cachedSel === this.sel && this.cachedLines) {
			return this.cachedLines;
		}

		const lines: string[] = [];

		const wrap = (inner: string) => {
			// Total: │(1) + ' '(1) + inner + ' '(1) + │(1) = inner_vw + 4
			// Want exactly W = iw + 2, so inner_vw must be iw - 2
			const vw = visibleWidth(inner);
			const innerW = iw - 2;
			if (vw > innerW) {
				inner = truncateToWidth(inner, innerW);
			}
			const pad = Math.max(0, innerW - visibleWidth(inner));
			return this.B("\u2502") + " " + inner + " ".repeat(pad) + " " + this.B("\u2502");
		};

		// ── Top border ──
		const title = " Search History ";
		const tw = title.length;
		const rb = Math.max(0, iw - tw);
		const lrb = Math.floor(rb / 2);
		const rrb = rb - lrb;
		lines.push(this.line(
			this.B("\u250C") + this.D("\u2500".repeat(lrb)) + this.theme.fg("accent", title) + this.D("\u2500".repeat(rrb)) + this.B("\u2510"),
			W,
		));

		// ── Search input ──
		const marker = this._focused ? CURSOR_MARKER : "";
		const q = this.query;
		const promptW = 2; // "> "
		const innerW = iw - promptW - 1; // -1 for cursor space
		const dq = truncateToWidth(q || "", innerW);
		const cp = dq.length;
		const inputStr =
			"> " +
			dq.slice(0, cp) +
			marker +
			`\x1b[7m${dq.slice(cp, cp + 1) || " "}\x1b[27m` +
			dq.slice(cp + 1);
		lines.push(wrap(inputStr));

		// ── Separator ──
		lines.push(this.line(this.B("\u251C") + this.D("\u2500".repeat(iw)) + this.B("\u2524"), W));

		// ── Results ──
		const vis = this.visCount;

		if (this.results.length === 0) {
			const msg = this.query ? " No matches " : " No history yet ";
			lines.push(wrap(this.D(msg)));
		} else {
			const maxOff = Math.max(0, this.results.length - vis);
			this.scroll = Math.min(this.scroll, maxOff);
			this.scroll = Math.max(0, this.scroll);
			const end = Math.min(this.results.length, this.scroll + vis);

			for (let i = this.scroll; i < end; i++) {
				const r = this.results[i];
				const isSel = i === this.sel;
				const pfx = isSel ? this.theme.fg("accent", " > ") : "   ";

				const ts = fmtTime(r.item.timestamp);
				const tsPadded = ts.padStart(this.TS_COL);
				const tsCol = this.theme.fg("dim", tsPadded);
				const sep = this.theme.fg("border", " \u2502 ");

				const cmd = normalizeHistoryText(r.item.text);
				let cmdStr: string;
				if (this.query && r.indices.length > 0) {
					cmdStr = this.hlText(cmd, r.indices, isSel, cmdAvail);
				} else {
					cmdStr = this.theme.fg(
						isSel ? "accent" : "text",
						truncateToWidth(cmd, cmdAvail, PREVIEW_ELLIPSIS),
					);
				}

				lines.push(wrap(pfx + tsCol + sep + cmdStr));
			}

			// empty fill
			for (let i = end - this.scroll; i < vis; i++) {
				lines.push(wrap(""));
			}
		}

		// ── Separator ──
		if (detailPreview.length > 0) {
			lines.push(this.line(this.B("\u251C") + this.D("\u2500".repeat(iw)) + this.B("\u2524"), W));
			for (const pl of detailPreview) {
				lines.push(wrap(this.D(pl)));
			}
		}

		lines.push(this.line(this.B("\u251C") + this.D("\u2500".repeat(iw)) + this.B("\u2524"), W));

		// ── Footer ──
		const total = this.results.length;
		const pos = total > 0 ? ` ${this.sel + 1}/${total} ` : " 0/0 ";
		const hints = " type to search  \u2191\u2193 nav  Enter ok  Esc cancel";
		lines.push(wrap(this.theme.fg("text", pos) + this.D(hints)));

		// ── Bottom border ──
		lines.push(this.line(this.B("\u2514") + this.D("\u2500".repeat(iw)) + this.B("\u2518"), W));

		this.cachedW = W;
		this.cachedSel = this.sel;
		this.cachedLines = lines;
		return lines;
	}

	private hlText(text: string, indices: number[], sel: boolean, maxW: number): string {
		const set = new Set(indices);
		let plain = "";
		let styled = "";
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			const nextLen = visibleWidth(plain + ch);
			if (nextLen > maxW) break;
			plain += ch;
			if (set.has(i)) {
				styled += this.theme.fg("accent", this.theme.bold(ch));
			} else {
				styled += this.theme.fg(sel ? "accent" : "muted", ch);
			}
		}
		if (plain.length < text.length) {
			return truncateToWidth(styled, maxW, PREVIEW_ELLIPSIS);
		}
		return styled;
	}

	invalidate(): void {
		this.cachedW = undefined;
		this.cachedSel = undefined;
		this.cachedLines = undefined;
	}

	get focused(): boolean { return this._focused; }
	set focused(v: boolean) {
		if (this._focused !== v) {
			this._focused = v;
			this.invalidate();
		}
	}
}
