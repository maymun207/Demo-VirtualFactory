# CWF Agent — Master Build Instructions

## What You're Building

An AI-powered "Chat With your Factory" (CWF) panel inside your Virtual Factory app. Users ask questions in natural language, the AI queries your Supabase database, and returns insights with root cause analysis — all bilingual (TR/EN).

**Tech Stack:** Gemini 2.5 Flash (runtime AI) · Vercel Serverless (backend) · React + Zustand (frontend) · Supabase PostgreSQL (data)

---

## Prerequisites (Do These ONCE Before Starting)

### 1. Get a Gemini API Key
- Go to https://aistudio.google.com/apikey
- Create a new API key
- Save it somewhere safe

### 2. Get Your Supabase Service Role Key
- Go to Supabase Dashboard → Settings → API
- Copy the `service_role` key (NOT the `anon` key)
- This key has full database access — never expose it to the frontend

### 3. Set Environment Variables in Vercel
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add these three variables (all environments: Production, Preview, Development):

```
GEMINI_API_KEY      = your_gemini_api_key
SUPABASE_URL        = https://ukhattgmidhchanzvevt.supabase.co
SUPABASE_SERVICE_ROLE_KEY = your_service_role_key
```

---

## Build Order (Follow Exactly)

| Order | Document | What It Does | Time |
|-------|----------|-------------|------|
| 1 | `STEP-1_ARCHITECTURE_AND_API.md` | Creates the Vercel serverless function (AI agent backend) | ~60 min |
| 2 | `STEP-2_STORE_AND_SERVICE.md` | Creates Zustand chat store + API client + translations | ~45 min |
| 3 | `STEP-3_CHAT_UI_COMPONENT.md` | Creates the floating chat panel UI | ~60 min |
| 4 | **MANUAL: Run SQL in Supabase** | You must run the SQL from STEP-4 in Supabase SQL Editor | ~5 min |
| 5 | `STEP-4_SUPABASE_MIGRATION.md` | Creates the migration file in the repo (for version control) | ~15 min |
| 6 | `STEP-5_DEPLOYMENT_AND_TESTING.md` | Deploy to Vercel + test scenarios | ~30 min |

---

## How to Feed Each Step to AntiGravity

### For STEP-1:
```
I'm implementing the CWF (Chat With your Factory) AI agent for my Virtual Factory project.

Read and implement the following document. Follow the RULES section exactly.

<paste entire STEP-1 document here>

Before coding, tell me your implementation plan. After coding, run `npx tsc --noEmit`.
```

### For STEP-2:
```
Continuing CWF implementation. Read the existing files first:
- src/store/uiStore.ts
- src/lib/translations.ts  
- src/App.tsx
- src/store/simulationDataStore.ts

Then implement:

<paste entire STEP-2 document here>

Before coding, tell me your implementation plan. After coding, run `npx tsc --noEmit`.
```

### For STEP-3:
```
Continuing CWF implementation. Read these existing files first:
- src/hooks/useDraggablePanel.ts (CRITICAL: check the exact interface)
- src/components/ui/Header.tsx
- src/components/ui/Dashboard.tsx
- src/index.css

Then implement:

<paste entire STEP-3 document here>

IMPORTANT: The useDraggablePanel hook interface in the document may not match 
the actual hook. Adapt the CWFChatPanel to match the REAL hook, not the document.

Before coding, tell me your implementation plan. After coding, run `npx tsc --noEmit`.
```

### Between STEP-3 and STEP-4:
**⚠️ YOU must do this manually:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the SQL from STEP-4 Section 4.2
3. Run it
4. Verify: run `SELECT execute_readonly_query('SELECT 1 as test');` — should return `[{"test": 1}]`

### For STEP-4:
```
Continuing CWF implementation. Create ONLY the migration file described below.
Do not modify any other files.

<paste entire STEP-4 document here>
```

### For STEP-5:
```
Continuing CWF implementation. Apply the final deployment configuration:

<paste entire STEP-5 document here>

After applying, run `npx tsc --noEmit` and `npm run build` to verify everything compiles.
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npx tsc --noEmit` fails on cwfStore.ts | Check that Zustand v5 types match. The store pattern must follow uiStore.ts exactly. |
| API returns 500 on Vercel | Check environment variables are set. Check Vercel function logs. |
| `execute_readonly_query` not found | You forgot to run the SQL in Supabase SQL Editor (Step 4 manual step). |
| CWF panel doesn't appear | Check that `showCWF` was added to uiStore.ts AND `<CWFChatPanel />` was added to Dashboard.tsx |
| Gemini returns empty response | Check GEMINI_API_KEY is valid. Try with a simple query first. |
| CORS error in browser | The serverless function must set CORS headers (already included in STEP-1). |

---

## What Success Looks Like

After all 5 steps:
1. A cyan "CWF" button appears in your Header toolbar
2. Clicking it opens a glassmorphic floating chat panel
3. The welcome screen shows 6 quick-action buttons
4. Clicking "Production Summary" sends a query to Gemini
5. Gemini calls your Supabase database, retrieves data, and responds in natural language
6. The response includes actual numbers from your simulation
7. Switching language (TR/EN) changes all CWF text and response language
