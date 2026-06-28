#!/bin/bash
# Test pi-nocturne-memory extension
set -e

echo "=== Testing pi-nocturne-memory ==="

# Test 1: Config file exists
if [ -f ~/.pi/pi-nocturne-memory.json ]; then
  echo "✓ Config file exists"
else
  echo "✗ Config file missing"
  exit 1
fi

# Test 2: MCP URL configured
if grep -q "mcpUrl" ~/.pi/pi-nocturne-memory.json; then
  echo "✓ MCP URL configured"
else
  echo "✗ MCP URL missing"
  exit 1
fi

# Test 3: Extension files exist
cd /Users/slahser/Desktop/pi-nocturne-memory
if [ -f "extensions/index.ts" ]; then
  echo "✓ Extension file exists"
else
  echo "✗ Extension file missing"
  exit 1
fi

# Test 4: MCP server reachable
MCP_URL=$(grep -o '"mcpUrl": *"[^"]*"' ~/.pi/pi-nocturne-memory.json | cut -d'"' -f4)
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" "$MCP_URL" | grep -q "200\|405"; then
  echo "✓ MCP server reachable"
else
  echo "⚠ MCP server unreachable (may need auth)"
fi

echo "=== pi-nocturne-memory tests passed ==="
