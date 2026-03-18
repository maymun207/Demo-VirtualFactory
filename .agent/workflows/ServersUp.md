---
description: Start both the Vite frontend server and the CWF API server for local development
---

# ServersUp — Start Both Dev Servers

Starts the Vite frontend (port 5173) and the CWF API server (port 3001) for local development.

// turbo-all

## Steps

1. Start the Vite frontend dev server:
```
npm run dev
```
Run in: `/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo`
Wait ~4 seconds and confirm output contains `Local: http://localhost:5173`.

2. Start the CWF API dev server:
```
npm run dev:cwf
```
Run in: `/Users/tunckahveci/Desktop/Demo VirtualFactory/virtual-factory-demo`
Wait ~5 seconds and confirm output contains `CWF Dev Server running` and `http://127.0.0.1:3001`.

## Expected Result

| Server | URL |
|--------|-----|
| Vite (frontend) | http://localhost:5173 |
| CWF (API) | http://127.0.0.1:3001/api/cwf/chat |
