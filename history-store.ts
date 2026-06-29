/**
 * History storage layer — reads from atuin DB (if installed) and a local JSONL file.
 */

import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fuzzySearch } from "./fuzzy-match.js";

const execFileAsync = promisify(execFile);

const JSONL_PATH = join(homedir(), ".pi", "agent", "pi-history.jsonl");
const ATUIN_TIMEOUT_MS = 5_000;
const MAX_ENTRIES = 1000;

export interface HistoryEntry {
	id: string;
	text: string;
	timestamp: number;
	cwd?: string;
	source: "atuin" | "pi";
}

let writeQueue: Promise<void> = Promise.resolve();

// ponytail: in-memory dedup guard — input event may fire twice per entry.
// prevents duplicate writes to JSONL within 5s window.
const recentWrites = new Map<string, number>();
const WRITE_DEDUP_MS = 5_000;

export function isRecentWrite(text: string): boolean {
	const last = recentWrites.get(text);
	if (last && Date.now() - last < WRITE_DEDUP_MS) return true;
	return false;
}

export function markRecentWrite(text: string): void {
	recentWrites.set(text, Date.now());
	// Cleanup entries older than WRITE_DEDUP_MS
	const cutoff = Date.now() - WRITE_DEDUP_MS;
	for (const [k, ts] of recentWrites) {
		if (ts < cutoff) recentWrites.delete(k);
	}
}

// ---------------------------------------------------------------------------
// JSONL persistence
// ---------------------------------------------------------------------------

async function ensureDir(): Promise<void> {
	const dir = join(homedir(), ".pi", "agent");
	await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function addEntry(
	text: string,
	cwd?: string,
	sessionId?: string,
): Promise<void> {
	const entry: HistoryEntry = {
		id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		text,
		timestamp: Date.now(),
		cwd,
		source: "pi",
	};

	const line = JSON.stringify(entry) + "\n";

	writeQueue = writeQueue.then(async () => {
		await ensureDir();
		await appendFile(JSONL_PATH, line, { encoding: "utf8", mode: 0o600 });
		// Trim old entries if exceeding limit
		await trimOldEntries();
	});

	await writeQueue;
}

async function trimOldEntries(): Promise<void> {
	try {
		const raw = await readFile(JSONL_PATH, "utf8");
		const lines = raw.split("\n").filter((l) => l.trim());
		if (lines.length <= MAX_ENTRIES) return;
		// Keep the most recent MAX_ENTRIES
		const trimmed = lines.slice(lines.length - MAX_ENTRIES);
		await writeFile(JSONL_PATH, trimmed.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
	} catch {
		// Ignore trim errors
	}
}

async function readJsonl(): Promise<HistoryEntry[]> {
	try {
		const raw = await readFile(JSONL_PATH, "utf8");
		const lines = raw.split("\n").filter((l) => l.trim());
		return lines.map((l) => JSON.parse(l) as HistoryEntry);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Atuin CLI integration
// ---------------------------------------------------------------------------

async function readAtuinHistory(): Promise<HistoryEntry[]> {
	try {
		const { stdout } = await execFileAsync(
			"atuin",
			["search", "--format", "{time}\t{command}", "--limit", "200"],
			{ timeout: ATUIN_TIMEOUT_MS },
		);

		const lines = stdout.split("\n").filter((l) => l.trim());
		return lines.map((l) => {
			const tab = l.indexOf("\t");
			if (tab === -1) return null;
			const timeRaw = l.slice(0, tab);
			const command = l.slice(tab + 1);
			if (!command.trim()) return null;
			let timestamp = Date.now();
			if (timeRaw) {
				const d = new Date(timeRaw);
				if (!isNaN(d.getTime())) timestamp = d.getTime();
			}
			return {
				id: `atuin-${timestamp}-${Math.random().toString(36).slice(2, 6)}`,
				text: command.trim(),
				timestamp,
				source: "atuin" as const,
			};
		}).filter(Boolean) as HistoryEntry[];
	} catch {
		// atuin not installed or failed — fall back to JSONL only
		return [];
	}
}

// ---------------------------------------------------------------------------
// Unified search API
// ---------------------------------------------------------------------------

let cachedEntries: HistoryEntry[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5_000;

async function loadAllEntries(): Promise<HistoryEntry[]> {
	const now = Date.now();
	if (cachedEntries && now - cacheTime < CACHE_TTL_MS) {
		return cachedEntries;
	}

	const [jsonl, atuin] = await Promise.all([readJsonl(), readAtuinHistory()]);

	// Deduplicate: same text within 5s window
	const seen = new Map<string, HistoryEntry>();
	const all = [...atuin, ...jsonl];

	for (const entry of all) {
		const key = entry.text.trim();
		const existing = seen.get(key);
		if (!existing || Math.abs(entry.timestamp - existing.timestamp) > 5000) {
			seen.set(key, entry);
		}
	}

	const entries = [...seen.values()].sort(
		(a, b) => b.timestamp - a.timestamp,
	);

	cachedEntries = entries;
	cacheTime = now;

	return entries;
}

export async function searchHistory(
	query: string,
	limit = 30,
): Promise<Array<{ item: HistoryEntry; score: number; indices: number[] }>> {
	const entries = await loadAllEntries();
	const results = fuzzySearch(
		query,
		entries,
		(e) => e.text,
		limit,
	);

	return results.map((r) => ({
		item: r.item,
		score: r.result.score,
		indices: r.result.indices,
	}));
}

export async function listRecent(
	limit = 30,
): Promise<HistoryEntry[]> {
	const entries = await loadAllEntries();
	return entries.slice(0, limit);
}

export function invalidateCache(): void {
	cachedEntries = null;
	cacheTime = 0;
}

// ---------------------------------------------------------------------------
// Write back to atuin (so shell atuin search also sees pi prompts)
// ---------------------------------------------------------------------------

const ATUIN_AUTHOR = "pi";

export async function writeToAtuin(text: string, cwd: string): Promise<void> {
	try {
		const { stdout } = await execFileAsync(
			"atuin",
			["history", "start", "--author", ATUIN_AUTHOR, "--", text],
			{ cwd, timeout: ATUIN_TIMEOUT_MS },
		);
		const id = stdout.trim();
		if (id) {
			await execFileAsync(
				"atuin",
				["history", "end", id, "--exit", "0"],
				{ cwd, timeout: ATUIN_TIMEOUT_MS },
			);
		}
	} catch {
		// atuin not installed or failed — silently ignore
	}
}
