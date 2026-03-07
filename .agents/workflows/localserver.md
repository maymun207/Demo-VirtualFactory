---
description: Start the local dev server with CWF support
---

# Start Local Dev Server with CWF

// turbo-all

1. Kill any existing CWF dev server processes:

```bash
pkill -f "cwf-dev-server" 2>/dev/null || true
```

1. Start the CWF API dev server:

```bash
cd "/Users/tunckahveci/Desktop/New VirtualFactory/virtual-factory-demo" && npm run dev:cwf
```

1. Start the Vite frontend dev server (in a separate terminal):

```bash
cd "/Users/tunckahveci/Desktop/New VirtualFactory/virtual-factory-demo" && npx vite
```

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
pkill -f "cwf-dev-server" 2>/dev/null; sleep 1; cd "/Users/tunckahveci/Desktop/New VirtualFactory/virtual-factory-demo" && npm run dev:cwf
```
