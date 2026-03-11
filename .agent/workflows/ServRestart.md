---
description: Restart both the Vite frontend dev server and the CWF API dev server (port 3001) on the local machine.
---

# ServRestart — Restart Local Dev Servers

This workflow kills any running instances of the Vite frontend (port 5173) and the CWF API dev server (port 3001), then starts both fresh as background processes.

## Steps

### Step 1 — Kill the Vite frontend server (port 5173)

// turbo
Run:

```bash
lsof -ti:5173 | xargs kill -9 2>/dev/null; echo "Vite killed (or was not running)"
```

### Step 2 — Kill the CWF dev server (port 3001)

// turbo
Run:

```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; echo "CWF server killed (or was not running)"
```

### Step 3 — Wait for ports to be released

// turbo
Run:

```bash
sleep 1 && echo "Ports released"
```

### Step 4 — Start the CWF dev server in the background

// turbo
Run from the project root (`/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo`):

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npm run dev:cwf
```

Wait ~5 seconds for the server to print "🏭 CWF Dev Server running" — that confirms startup.

### Step 5 — Start the Vite frontend server in the background

// turbo
Run from the project root:

```bash
cd "/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo" && npx vite &
```

Wait ~5 seconds for Vite to print its "Local: [http://localhost:5173](http://localhost:5173)" banner — that confirms startup.

### Step 6 — Verify both servers are running

// turbo
Run:

```bash
lsof -i:5173 -i:3001 | grep LISTEN
```

Expected: two LISTEN lines, one for port 5173 (Vite) and one for port 3001 (CWF).

Report to the user:

- ✅ Vite frontend → [http://localhost:5173](http://localhost:5173)
- ✅ CWF API server → [http://localhost:3001/api/cwf/chat](http://localhost:3001/api/cwf/chat)
