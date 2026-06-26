export default function (pi: any) {
  pi.on("before_agent_start", async () => {
    const all = ["read", "bash", "edit", "write", "grep", "find", "ls"];
    pi.setActiveTools(all);
  });
}
