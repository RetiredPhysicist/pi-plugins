// Identity fingerprints for the shared CodeBuddy session.
//
// `syncSharedSession` may only REUSE a session when pi's history really is the
// one that session was built from. Message *count* is not identity: after
// /compact, a session-tree move, or an edited reply the new history can have
// the same length as the old one, and resuming then feeds the model a
// transcript the user no longer sees.
//
// Two fingerprints close that gap:
//   historyKey      — hash over everything before the cursor (committed history)
//   pendingReplyKey — hash over the assistant reply this provider last streamed
//
// Fingerprints cover text/thinking/tool calls/results and images, and ignore
// timestamps, ids, usage, and stream bookkeeping, so a re-sent identical turn
// hashes the same while any visible edit changes the hash.

import { createHash } from "crypto";
import type { Message } from "@earendil-works/pi-ai";

function canonicalBlock(block: unknown): unknown {
	if (!block || typeof block !== "object") return block;
	const b = block as Record<string, unknown>;
	switch (b.type) {
		case "text":
			return ["text", b.text ?? ""];
		case "thinking":
			return ["thinking", b.thinking ?? "", b.redacted === true];
		case "image":
			return ["image", b.mimeType ?? "", imageDigest(b.data)];
		case "toolCall":
			return ["toolCall", b.name ?? "", stableJson(b.arguments)];
		default:
			return [String(b.type)];
	}
}

function imageDigest(data: unknown): string {
	return typeof data === "string" && data
		? createHash("sha256").update(data).digest("hex").slice(0, 16)
		: "";
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

function canonicalContent(content: unknown): unknown {
	if (typeof content === "string") return ["text", content];
	if (!Array.isArray(content)) return [];
	return content.map(canonicalBlock);
}

function canonicalMessage(message: Message): unknown {
	const m = message as unknown as Record<string, unknown>;
	if (m.role === "toolResult") {
		return ["toolResult", m.toolCallId ?? "", m.isError === true, canonicalContent(m.content)];
	}
	if (m.role === "assistant") {
		return ["assistant", canonicalContent(m.content)];
	}
	return [String(m.role), canonicalContent(m.content)];
}

function digest(parts: unknown): string {
	return createHash("sha256").update(stableJson(parts)).digest("hex");
}

/** Fingerprint of the committed history: everything before the session cursor. */
export function historyKey(messages: readonly Message[]): string {
	return digest(messages.map(canonicalMessage));
}

/** Fingerprint of one assistant reply, used to detect an edited/forked tail. */
export function replyKey(message: Message | undefined): string | undefined {
	if (!message || message.role !== "assistant") return undefined;
	return digest(canonicalMessage(message));
}
