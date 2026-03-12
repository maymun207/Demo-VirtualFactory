---
description: Start the local dev server with CWF support
---

# Start Local Dev Server with CWF

// turbo-all

1. Kill any existing server processes (aggressive — also kills tsx and orphaned node instances):

```bash
pkill -9 -f "vite" 2>/dev/null; pkill -9 -f "cwf-dev-server" 2>/dev/null; pkill -9 -f "tsx" 2>/dev/null; lsof -ti:5173 | xargs kill -9 2>/dev/null; lsof -ti:3001 | xargs kill -9 2>/dev/null; sleep 1; echo "All servers killed"
```

1. Start the CWF API dev server first (must be up before Vite so the proxy resolves):

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev:cwf > /tmp/cwf.log 2>&1 &
```

Wait ~6 seconds, then confirm with: `cat /tmp/cwf.log` — look for `🏭 CWF Dev Server running`

1. Start the Vite frontend dev server:

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev > /tmp/vite.log 2>&1 &
```

Wait ~5 seconds, then confirm with: `cat /tmp/vite.log` — look for `Local: http://127.0.0.1:5173/`

## MANDATORY RESTART RULE

> [!CAUTION]
> **After ANY commit that modifies files in `api/cwf/` or files imported by the API (e.g. `src/lib/params/parameterRanges.ts`), you MUST restart the local CWF dev server.**
> The local dev server does NOT hot-reload API changes. Failing to restart means the user tests against stale code.

### When to restart

- Any change to `api/cwf/chat.ts`
- Any change to `api/cwf/cwfParameterRanges.ts`
- Any change to `api/cwf/cwfKnowledgeDocs.ts`
- Any change to `src/lib/params/parameterRanges.ts` (imported by API)
- Any change to `scripts/cwf-dev-server.ts`

### How to restart

```bash
pkill -f "cwf-dev-server" 2>/dev/null; sleep 1; cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev:cwf
```
