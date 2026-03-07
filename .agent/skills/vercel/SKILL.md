---
name: vercel
description: Commands and strategies for managing Vercel deployments, environment variables, and troubleshooting.
---

# Vercel Management Skill

This skill provides a set of patterns and commands for interacting with Vercel via the CLI and managing production deployments.

## Core Commands

### Deployment Tools

- **Link Project**: `vercel link` (connects local folder to a Vercel project)
- **Development**: `vercel dev` (runs a local Vercel-like environment)
- **Preview Deploy**: `vercel` (deploys to a unique preview URL)
- **Production Deploy**: `vercel --prod` (promotes current build to production)
- **Build Locally**: `vercel build` (simulates Vercel build process locally)

### Environment Variables

- **Add Variable**: `vercel env add <NAME> [ENVIRONMENT] [VALUE]`
- **List Variables**: `vercel env ls`
- **Remove Variable**: `vercel env rm <NAME> [ENVIRONMENT]`
- **Pull Variables**: `vercel env pull [.env.local]` (fetches remote variables to local file)

### Project Configuration

- **Modify Settings**: `vercel project ...`
- **Aliases**: `vercel alias set <deployment-url> <alias>`

### Troubleshooting

- **Logs**: `vercel logs <DEPLOYMENT_URL>`
- **Inspect**: `vercel inspect <DEPLOYMENT_URL>`

## Deployment Strategies & Workflows

### Standard Vite Workflow

1. **Configure**: Add `vercel.json` for SPA routing.
2. **Build**: Ensure `npm run build` produces a `dist` folder.
3. **Deploy**:
   - For preview/test: `vercel`
   - For live site: `vercel --prod`

### Root Directory Mapping

If your project is in a subdirectory (e.g., `virtual-factory-demo`), you must either:

- Set the **Root Directory** in Vercel Project Settings to the subfolder.
- Or, deploy from the subfolder itself using `vercel --cwd ./subfolder`.

## Common Issues & Fixes

### 404 Not Found (Blank Screen)

**Symptom**: Page loads but console shows 404 for `/src/main.tsx` or similar.
**Fix**:

1. Check "Root Directory" in Vercel Dashboard settings.
2. Ensure `vercel.json` has correct rewrites:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

### Missing Environment Variables

**Symptom**: App loads but features (like Supabase) fail.
**Fix**:

1. Add variables via `vercel env add`.
2. **Critical**: You MUST trigger a new deployment (`vercel --prod`) for variables to take effect.

## Best Practices

- **Atomic Deploys**: Use preview deployments for review before pushing to production.
- **Vercel CLI**: Use `vercel link --yes` for faster automated CI/CD-like workflows.
- **Ignore files**: Ensure `dist`, `node_modules`, and `.env` are in `.gitignore`.
