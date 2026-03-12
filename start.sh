#!/usr/bin/env bash
# =============================================================================
# start.sh — Virtual Factory Dev Server Launcher
#
# Kills any lingering Vite / CWF / tsx processes that hold ports 5173 and 3001,
# then starts both servers cleanly in the background.
#
# Usage:
#   chmod +x start.sh   (first time only)
#   ./start.sh
# =============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "🧹 Killing any leftover processes on ports 5173 and 3001..."

# Kill only by port — avoids accidentally killing unrelated tsx/node processes
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "  ✓ Cleared port 5173" || echo "  ✓ Port 5173 already free"
lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "  ✓ Cleared port 3001" || echo "  ✓ Port 3001 already free"

# Brief pause to let the OS release the ports
sleep 1

# ─── Start CWF dev server (API on 127.0.0.1:3001, IPv4 only) ─────────────────
echo ""
echo "🏭 Starting CWF server on http://127.0.0.1:3001 ..."
npm run dev:cwf > /tmp/cwf.log 2>&1 &
CWF_PID=$!

# Wait for CWF to be ready
sleep 4
if lsof -ti:3001 &>/dev/null; then
    echo "  ✓ CWF server running (PID $CWF_PID)"
else
    echo "  ✗ CWF server FAILED — check /tmp/cwf.log"
    cat /tmp/cwf.log
    exit 1
fi

# ─── Start Vite dev server (all-interface 0.0.0.0:5173) ──────────────────────
echo ""
echo "⚡ Starting Vite on http://localhost:5173 ..."
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to be ready
sleep 4
if lsof -ti:5173 &>/dev/null; then
    echo "  ✓ Vite running (PID $VITE_PID)"
else
    echo "  ✗ Vite server FAILED — check /tmp/vite.log"
    cat /tmp/vite.log
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Both servers are running!"
echo ""
echo "  🌐 App  →  http://localhost:5173"
echo "  🔧 CWF  →  http://127.0.0.1:3001/api/cwf/chat"
echo ""
echo "  Logs:  /tmp/vite.log   /tmp/cwf.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
