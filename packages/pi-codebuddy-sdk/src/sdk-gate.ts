// Serialize CodeBuddy SDK query() subprocesses — only one CLI at a time.
// Every gated task also carries a timeout: a task that hangs (CLI never
// answering its control request) must not hold the gate — and with it every
// later query — forever. On timeout the task's promise rejects; callers fall
// back to their cached/error paths.

let chain: Promise<void> = Promise.resolve();

export const DEFAULT_GATE_TIMEOUT_MS = 120_000;

export function withSdkGate<T>(
	fn: () => Promise<T>,
	options?: { timeoutMs?: number },
): Promise<T> {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
	const run = chain.then(() =>
		new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`SDK gate task timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			timer.unref?.();
			Promise.resolve(fn()).then(
				(value) => { clearTimeout(timer); resolve(value); },
				(err) => { clearTimeout(timer); reject(err); },
			);
		}),
	);
	chain = run.then(() => undefined, () => undefined);
	return run;
}


export async function drainQuery(q: AsyncIterable<unknown>): Promise<void> {
	const timer = new Promise<void>((r) => setTimeout(r, 5000));
	await Promise.race([
		(async () => { for await (const _ of q) { /* drain */ } })(),
		timer,
	]);
}
