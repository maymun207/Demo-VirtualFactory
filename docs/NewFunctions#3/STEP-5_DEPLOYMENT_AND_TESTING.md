# STEP 5 — Deployment & Testing

> **Instruction to AI:** Read this document. Apply the vercel.json and tsconfig changes, then run the build verification.

---

## RULES

1. Only modify files explicitly listed.
2. Run the verification commands.
3. Do NOT add features or fix things not mentioned.

---

## 5.1 Verify `vercel.json` (Should Already Be Updated from STEP-1)

Confirm it looks exactly like this:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30
    }
  }
}
```

---

## 5.2 TypeScript Configuration for API Directory

Vercel compiles serverless functions separately from Vite. If `npx tsc --noEmit` fails on `api/cwf/chat.ts` due to Node.js types or module resolution, **that's expected** — Vercel uses its own compiler.

However, if you want clean type checking locally, create `api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts"]
}
```

And update the root `tsconfig.json` to exclude the `api/` directory from Vite's compilation:

Find the `include` or `references` section and ensure `api/` is excluded from the main app's TypeScript scope. If using `tsconfig.app.json`, it should already only include `src/`.

---

## 5.3 Build Verification

Run these commands and confirm they pass:

```bash
# 1. Type check the app (should pass — api/ is excluded)
npx tsc -p tsconfig.app.json --noEmit

# 2. Build the app
npm run build

# 3. Run existing tests (should all still pass)
npm run test
```

---

## 5.4 Local Testing with Vercel Dev

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Link project (first time only)
vercel link

# Pull environment variables
vercel env pull .env.local

# Start local dev (runs Vite + serverless functions)
vercel dev
```

---

## 5.5 Test Scenarios

After deploying (or running locally), run a simulation with a scenario (e.g., SCN-002), produce 50+ tiles, then test:

### Basic Tests

| Query | Expected |
|-------|----------|
| "Give me a production summary" | Returns tile counts, OEE, quality breakdown |
| "How many tiles were produced?" | Returns a count number |
| "What scenario is active?" | Returns scenario name and details |

### Analysis Tests

| Query | Expected |
|-------|----------|
| "Why is the scrap rate high?" | Multi-step: queries scrap → finds defects → traces to parameters → root cause |
| "Which station causes the most defects?" | Aggregation on snapshots grouped by station |
| "Analyze kiln temperature trends" | Queries kiln states, identifies drift/spikes |

### Bilingual Tests

| Query | Expected |
|-------|----------|
| Switch to TR, ask "Üretim özeti ver" | Full response in Turkish with Turkish terms |
| Switch to EN, ask "Production summary" | Full response in English |

### Edge Cases

| Scenario | Expected |
|----------|----------|
| No simulation running | System message: "No simulation running" |
| 0 tiles produced | Agent recognizes no data |
| Very long question | Handles gracefully |

---

## 5.6 Deploy to Production

```bash
# Deploy
vercel --prod

# Test production API
curl -X POST https://virtual-factory.vercel.app/api/cwf/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Production summary",
    "simulationId": "YOUR_SIM_UUID",
    "language": "en"
  }'
```

---

## 5.7 Complete File Summary

### New Files (5)

| File | Created In |
|------|-----------|
| `api/cwf/chat.ts` | STEP-1 |
| `src/store/cwfStore.ts` | STEP-2 |
| `src/lib/cwfService.ts` | STEP-2 |
| `src/components/ui/CWFChatPanel.tsx` | STEP-3 |
| `supabase/migrations/20260225_cwf_agent_rpc.sql` | STEP-4 |

### Modified Files (5)

| File | Changes |
|------|---------|
| `vercel.json` | Added API rewrites + function config |
| `package.json` | Added `@google/generative-ai`, `@vercel/node` |
| `src/lib/translations.ts` | Added `cwf` section |
| `src/store/uiStore.ts` | Added `showCWF`, `toggleCWF`, updated `closeAllPanels` |
| `src/components/ui/Dashboard.tsx` | Added `<CWFChatPanel />` |
| `src/components/ui/Header.tsx` | Added CWF toggle button |
| `src/App.tsx` | Added simulation ID sync effect |

### Supabase Changes (Manual)

| Function | Description |
|----------|-------------|
| `execute_readonly_query(TEXT)` | Safe SQL execution RPC |
| `get_simulation_stats(UUID)` | Quick simulation summary RPC |
| Anon policy on `ai_analysis_results` | Allow agent to save analyses |

---

## 5.8 Known Limitations (v1)

- No streaming (responses arrive all at once)
- No conversation persistence (lost on page refresh)
- No inline charts/visualizations
- Max 8 tool calls per turn
- No authentication on the API endpoint
- Single Gemini model (Flash only)

---

**BUILD COMPLETE.** 🏭
