#!/bin/bash
# SessionStart hook for pi-dejavu-memory
# This runs when a new Pi session starts

# Signal the agent to run the DejaVu boot protocol.
if command -v pi &> /dev/null; then
  echo "DEJAVU_BOOT_REQUIRED"
fi
