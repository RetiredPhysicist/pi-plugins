/** Derive exit code from a bash tool_result event. */
export function parseBashExitCode(event: {
	isError: boolean;
	content: Array<{ type: string; text?: string }>;
}): number {
	if (!event.isError) return 0;

	const text = event.content
		.filter((part) => part.type === "text")
		.map((part) => part.text ?? "")
		.join("\n");

	const exitMatch = text.match(/Command exited with code (\d+)/);
	if (exitMatch) return Number.parseInt(exitMatch[1]!, 10);

	if (text.includes("Command aborted")) return 130;
	if (text.includes("Command timed out")) return 124;

	return 1;
}
