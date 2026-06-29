/**
 * pi-atuin — Atuin-style interactive history search for pi.
 *
 * Replaces the default up-arrow behavior with a fuzzy search overlay.
 * Stores history in ~/.pi/agent/pi-history.jsonl and optionally reads
 * from atuin's database if installed.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key } from "@earendil-works/pi-tui";
import { addEntry, invalidateCache, listRecent, writeToAtuin, isRecentWrite, markRecentWrite } from "./history-store.js";
import { HistorySearchComponent } from "./search-ui.js";

export default function piAtuin(pi: ExtensionAPI) {
	// ---- 1. Record user inputs to history ----
	pi.on("input", async (event, ctx) => {
		if (event.source === "interactive" && event.text.trim()) {
			const text = event.text.trim();
			// Guard against duplicate input events (pi may fire input twice)
			if (isRecentWrite(text)) return { action: "continue" as const };
			markRecentWrite(text);
			await addEntry(text, ctx.cwd);
			// Also write to atuin DB so shell atuin can search pi prompts
			writeToAtuin(text, ctx.cwd);
		}
		return { action: "continue" as const };
	});

	// ---- 2. Install custom editor with up-arrow search ----
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = new CustomEditor(tui, theme, keybindings);

			editor.onExtensionShortcut = (data: string) => {
				if (matchesKey(data, Key.up)) {
					const cursor = editor.getCursor();
					if (cursor.line === 0) {
						openSearch(ctx, editor);
						return true;
					}
				}
				return false;
			};

			return editor;
		});
	});
}

async function openSearch(
	ctx: ExtensionContext,
	editor: CustomEditor,
): Promise<void> {
	const savedText = editor.getText();
	invalidateCache();

	// Preload entries so the first render already has data
	const entries = await listRecent(100);

	try {
		const result = await ctx.ui.custom<string | null>(
			(_tui, theme, _keybindings, done) =>
				new HistorySearchComponent(done, theme, entries),
		);

		if (result !== null && result !== undefined) {
			editor.setText(result);
		} else {
			editor.setText(savedText);
		}
	} catch {
		editor.setText(savedText);
	}
}
