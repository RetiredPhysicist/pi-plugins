#!/bin/bash
# Test pi-nocturne-memory extension
set -e

echo "=== Testing pi-nocturne-memory ==="

# Test 1: Config file exists
CONFIG_PATH="$HOME/.pi/agent/extensions/pi-nocturne-memory/config.json"
if [ -f "$CONFIG_PATH" ]; then
  echo "✓ Config file exists"
else
  echo "✗ Config file missing"
  exit 1
fi

# Test 2: MCP URL configured
if grep -q "mcpUrl" "$CONFIG_PATH"; then
  echo "✓ MCP URL configured"
else
  echo "✗ MCP URL missing"
  exit 1
fi

# Test 3: Extension files exist
cd "$(dirname "$0")"
if [ -f "extensions/index.ts" ]; then
  echo "✓ Extension file exists"
else
  echo "✗ Extension file missing"
  exit 1
fi

# Test 4: MCP server reachable
MCP_URL=$(grep -o '"mcpUrl": *"[^"]*"' "$CONFIG_PATH" | cut -d'"' -f4)
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$MCP_URL" | grep -q "200\|405"; then
  echo "✓ MCP server reachable"
else
  echo "⚠ MCP server unreachable (may need auth)"
fi

echo "=== pi-nocturne-memory tests passed ==="
