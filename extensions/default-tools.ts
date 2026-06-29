// Ponytail: local typed interface keeps zero deps
export default function (pi: { on: (event: string, cb: () => void | Promise<void>) => void; getActiveTools: () => string[]; setActiveTools: (tools: string[]) => void }) {
  pi.on("before_agent_start", async () => {
    try {
      const current = pi.getActiveTools() ?? [];
      const missing = ["find", "grep", "ls"].filter(t => !current.includes(t));
      if (missing.length > 0) pi.setActiveTools([...current, ...missing]);
    } catch {
      // Extension should never crash Pi — silent no-op on failure
    }
  });
}
