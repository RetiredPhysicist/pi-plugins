export default function (pi: any) {
  pi.on("before_agent_start", async () => {
    const current = pi.getActiveTools() || [];
    const missing = ["find", "grep", "ls"].filter(t => !current.includes(t));
    if (missing.length > 0) pi.setActiveTools([...current, ...missing]);
  });
}
