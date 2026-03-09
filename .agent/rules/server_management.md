# Server Management Rule

## CRITICAL: I must NEVER ask the user to restart servers. I do it myself, every time.

Anytime servers need to be killed, restarted, or started — I perform these steps autonomously with `run_command` using `SafeToAutoRun: true`.

---

## Kill All Servers

Run this first, wait 2 seconds:

```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null; lsof -ti:3001 | xargs kill -9 2>/dev/null; pkill -f "vite" 2>/dev/null; pkill -f "tsx watch" 2>/dev/null; pkill -f "ts-node" 2>/dev/null; echo "All servers killed"
```

## Start — Correct Order

**Step 1: CWF API server first** (must be up before Vite so the proxy resolves)

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev:cwf
```

Wait ~6 seconds for: `🏭 CWF Dev Server running`

**Step 2: Vite frontend**

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev
```

Wait ~5 seconds for: `Local: http://localhost:5173/`

## Verify

```bash
lsof -i:5173 -i:3001 | grep LISTEN
```

Expected: two LISTEN lines.

---

## When to Auto-Restart (without asking)

- After ANY change to `api/cwf/*.ts`
- After ANY change to `src/lib/params/*.ts` imported by the API
- After ANY change to `scripts/cwf-dev-server.ts`
- Whenever the user says anything is unresponsive / not working
- After applying Supabase migrations that affect runtime behaviour

## Ports Reference

| Service       | Port | URL                                |
| ------------- | ---- | ---------------------------------- |
| Vite frontend | 5173 | http://localhost:5173              |
| CWF API       | 3001 | http://localhost:3001/api/cwf/chat |
