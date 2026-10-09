/**
 * pi-all-tools — keep find, grep and ls available.
 *
 * Pi 1.1 added `+name`/`-name` entries to `defaultTools` and `--tools`, so the
 * tool set can be adjusted in configuration without an extension:
 *
 *   { "defaultTools": ["+find", "+grep", "+ls"] }
 *
 * This package predates that. It still ensures the three tools, but on Pi that
 * reads those increments it defers to what the setting says about each one:
 *
 *   { "defaultTools": ["-find"] }
 *
 * now means find stays off, instead of being re-added on the next agent start.
 * A tool the setting never mentions is added exactly as it always was, so an
 * existing install keeps its 7-tool set with no configuration change.
 *
 * Ponytail: local typed interface keeps zero deps.
 */

/** The tools this package has always ensured are present. */
const WANTED = ["find", "grep", "ls"];

interface PiLike {
  on: (event: string, cb: () => void | Promise<void>) => void;
  getActiveTools?: () => string[] | undefined;
  setActiveTools?: (tools: string[]) => void;
  getSettings?: () => { defaultTools?: string[] } | undefined;
}

/**
 * What `defaultTools` says about one tool, once the `+name`/`-name` grammar is
 * understood:
 *
 * - `added` — named plainly or with `+`; the person wants it on.
 * - `removed` — named with `-`; this extension must not put it back, because a
 *   `-name` removal is documented to stick across reloads.
 * - `unset` — not named; the extension may add it as before.
 *
 * A plain allowlist that simply omits the tool is not read as a removal: that
 * is the older replace-the-defaults form this package never honoured anyway.
 */
export function statedIntent(defaultTools: string[] | undefined, tool: string): "added" | "removed" | "unset" {
  if (!Array.isArray(defaultTools)) return "unset";
  for (const entry of defaultTools) {
    if (typeof entry !== "string") continue;
    if (entry === tool || entry === `+${tool}`) return "added";
    if (entry === `-${tool}`) return "removed";
  }
  return "unset";
}

/**
 * Whether Pi reads `+name`/`-name` increments in `defaultTools`.
 *
 * `getSettings` exposes the resolved settings; only Pi 1.1+ pairs it with the
 * increment grammar. Asking also covers the case where settings exist but carry
 * no `defaultTools` key at all, which reads as `unset` either way.
 */
function supportsIncrements(pi: PiLike): boolean {
  try {
    return typeof pi.getSettings === "function" && pi.getSettings() !== undefined;
  } catch {
    return false;
  }
}

export default function (pi: PiLike) {
  // Resolved once: a session cannot change which Pi grammar it runs.
  const respectsIncrements = supportsIncrements(pi);

  pi.on("before_agent_start", async () => {
    try {
      if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
      const current = pi.getActiveTools() ?? [];

      let defaultTools: string[] | undefined;
      if (respectsIncrements) {
        try {
          defaultTools = pi.getSettings?.()?.defaultTools;
        } catch {
          defaultTools = undefined;
        }
      }

      const missing = WANTED.filter((tool) => {
        if (current.includes(tool)) return false;
        // A natively-removed tool stays removed; anything else is added.
        return statedIntent(defaultTools, tool) !== "removed";
      });
      if (missing.length > 0) pi.setActiveTools([...current, ...missing]);
    } catch {
      // Extension should never crash Pi — silent no-op on failure
    }
  });
}
