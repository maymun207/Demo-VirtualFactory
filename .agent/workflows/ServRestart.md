---
description: Restart both the Vite frontend dev server and the CWF API dev server (port 3001) on the local machine.
---

# ServRestart — Restart Local Dev Servers

This workflow kills any running instances of the Vite frontend (port 5173) and the CWF API dev server (port 3001), then starts both fresh.

**IMPORTANT**: Use `npm run dev` for the frontend (NOT `npx vite &`). The `&` background trick creates a zombie process that binds the port but does not actually serve responses. `run_command` with `npm run dev` correctly manages the process as an async background command.

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

### Step 4 — Start the CWF dev server

// turbo
Run from the project root (`/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo`):

```bash
npm run dev:cwf
```

Wait ~5 seconds for the server to print `🏭 CWF Dev Server running` — that confirms startup.

### Step 5 — Start the Vite frontend server

// turbo
Run from the project root:

```bash
npm run dev
```

**DO NOT use `npx vite &`** — it creates an orphaned process that binds port 5173 but cannot serve HTTP requests.

Wait ~5 seconds for Vite to print its `Local: http://localhost:5173` banner — that confirms startup.

### Step 6 — Verify both servers ACTUALLY respond (not just port binding)

// turbo
Run:

```bash
curl -s -o /dev/null -w "Vite: %{http_code}" --max-time 5 http://localhost:5173/ && echo "" && curl -s -o /dev/null -w "CWF:  %{http_code}" --max-time 5 http://127.0.0.1:3001/api/cwf/demo-chat && echo ""
```

**Expected output:**
```
Vite: 200
CWF:  404
```

- Vite should return **200** (serves the index.html).
- CWF demo-chat should return **404** (it's a POST-only endpoint; 404 on GET is correct and proves the server is responding).

**If Vite returns 000 or curl times out**, the process is a zombie. Kill port 5173 and re-run Step 5 with `npm run dev`.

Report to the user:

- ✅ Vite frontend → http://localhost:5173
- ✅ CWF API server → http://127.0.0.1:3001/api/cwf/chat
