#!/bin/bash
# SessionStart hook for pi-nocturne-memory
# This runs when a new Pi session starts

# Check if nocturne-memory MCP is available
if command -v pi &> /dev/null; then
  # Trigger the boot protocol by calling the MCP tool
  # This will be picked up by the agent
  echo "NOCTURNE_BOOT_REQUIRED"
fi
