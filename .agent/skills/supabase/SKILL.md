---
name: supabase
description: Commands and strategies for managing Supabase projects, databases, Edge Functions, and branching via MCP tools and CLI.
---

# Supabase Management Skill (MCP + CLI)

This skill provides a comprehensive guide for managing Supabase projects using the **Supabase MCP Server** (`supabase-mcp-server`) as the primary interface and the **Supabase CLI** as a secondary fallback.

> [!IMPORTANT]
> The hosted database is the **source of truth** for migration history. Use CLI to sync changes to the local workspace.

---

## 🔌 MCP Server Configuration

### Connection URL

```
https://mcp.supabase.com/mcp
```

### URL Options (Query Parameters)

| Parameter     | Purpose                                        | Example                             |
| :------------ | :--------------------------------------------- | :---------------------------------- |
| `project_ref` | Scope server to a single project (recommended) | `?project_ref=abcdefghijklmnop`     |
| `read_only`   | Restrict to read-only queries and tools        | `?read_only=true`                   |
| `features`    | Enable/disable specific tool groups            | `?features=database,docs,debugging` |

### Feature Groups

Available: `account`, `docs`, `database`, `debugging`, `development`, `functions`, `storage`, `branching`

Default enabled: all except `storage`.

> [!NOTE]
> When `project_ref` is set, account-level tools (`list_projects`, `list_organizations`, etc.) are unavailable.
> `storage` tools are disabled by default to reduce tool count — enable explicitly with `features=storage`.

---

## 🔌 MCP Toolset (Primary)

### 🔍 Discovery & Inspection

- **`list_projects`**: List all Supabase projects for the authenticated user.
- **`get_project`**: Get details (status, region, version) for a specific project by ID.
- **`list_organizations`** / **`get_organization`**: View orgs and their subscription plans.
- **`get_project_url`**: Retrieve the API URL for a project.
- **`get_publishable_keys`**: Retrieve anon/publishable API keys. Prefer `sb_publishable_*` format for new apps. Only use keys where `disabled` is `false` or `undefined`.

### 🗄️ Database Operations

- **`execute_sql`**: Run raw SQL (SELECT, INSERT, UPDATE, DELETE). **Use for DML only — not tracked.**
- **`apply_migration`**: Apply DDL migrations (CREATE TABLE, ALTER, DROP, etc.). — **These are tracked.**
- **`list_tables`**: List all tables in one or more schemas (defaults to `public`).
- **`list_migrations`**: View all applied migration history and version numbers.
- **`list_extensions`**: List installed Postgres extensions (e.g., `pgvector`, `uuid-ossp`).
- **`generate_typescript_types`**: Auto-generate TypeScript types from the current DB schema.

### ⚡ Edge Functions

- **`list_edge_functions`**: List all deployed edge functions.
- **`get_edge_function`**: Retrieve source code of a specific function.
- **`deploy_edge_function`**: Deploy a new function or update an existing one. Include `deno.json` / `deno.jsonc` if present. Always enable `verify_jwt` unless function implements custom auth.

### 🌿 Branching (Experimental — requires paid plan)

- **`create_branch`**: Create a dev branch (clones production migrations to fresh DB). May take minutes.
- **`list_branches`**: List all branches and their statuses. Use to poll for completion.
- **`merge_branch`**: Merge branch migrations and edge functions into production.
- **`rebase_branch`**: Apply newer production migrations onto a dev branch (fixes migration drift).
- **`reset_branch`**: Reset branch to a prior migration version (destructive). Version `0` = fresh DB.
- **`delete_branch`**: Delete a development branch. Active branches billed at **$0.01344/hour**.

### 📦 Storage (Disabled by default)

Enable with `features=storage`.

- **`list_storage_buckets`**: Lists all storage buckets.
- **`get_storage_config`**: Gets storage config.
- **`update_storage_config`**: Updates storage config (paid plan required).

### 🛡️ Diagnostics & Security

- **`get_logs`**: Fetch logs by service: `api`, `postgres`, `auth`, `storage`, `edge-function`, `realtime`, `branch-action`. Returns last 24hrs.
- **`get_advisors`**: Get security or performance advisory notices. **Run after DDL changes** to catch missing RLS policies.
- **`search_docs`**: Search Supabase documentation via GraphQL. **Always query this before guessing at API usage.**

### 💰 Cost Management

- **`get_cost`**: Check the cost of creating a new project or branch (per org). **Never assume org — costs differ.**
- **`confirm_cost`**: Confirm cost understanding before `create_project` or `create_branch`. Returns a confirmation ID.

### 🏗️ Project Lifecycle

- **`create_project`**: Create a new Supabase project (**always ask for org and region**).
- **`pause_project`** / **`restore_project`**: Pause or restore a project to manage compute costs.

---

## 📋 Schema Management Workflow (Recommended)

The official workflow for schema changes:

1. **Inspect**: Call `list_tables` to view the current schema.
2. **Migrate**: Call `apply_migration` with desired DDL changes.
3. **Audit**: Call `get_advisors` for both `security` and `performance` issues. Fix with further migrations.
4. **Sync locally**: `npx supabase migration fetch --yes` to pull new migration files to `supabase/migrations/`.
5. **Generate types**: `npx supabase gen types --linked > src/types/supabase.ts` to update TypeScript types.
6. **Align code**: Review codebase to ensure usage matches new schema.

> [!IMPORTANT]
>
> - Always specify schemas explicitly: `public.users` instead of `users`.
> - Use `apply_migration` for schema changes (tracked). Use `execute_sql` for data queries (not tracked).

---

## 🌿 Dev-to-Production Branching Workflow

### Creating a Branch

1. Ask the LLM to create a development branch → invokes `create_branch`.
2. Branch clones production by replaying migrations. Does **not** copy live data.
3. Poll `list_branches` to check when branch status is ready.

### Developing on a Branch

1. Apply new migrations on the branch with `apply_migration`.
2. **Never hardcode foreign key references** in data migrations — FK IDs are branch-specific.
3. Test by connecting your app to the branch: fetch URL with `get_project_url` and keys with `get_publishable_keys`.

### Reverting a Migration (on branch only)

- Use `reset_branch` with a specific migration version or reset last `n` migrations.
- Version `0` resets to a fresh database. All untracked data is lost.
- **Never use `reset_branch` on production.** Instead, create a new forward migration that reverts the changes.

### Merging to Production

1. Invoke `merge_branch` to apply branch migrations to production incrementally.
2. If merge fails, production status = `MIGRATIONS_FAILED`. Check `get_logs` for errors.
3. Fix: reset the problematic migration on dev → apply fix → merge again.
4. Only successful migrations are tracked — safe to merge same branch multiple times.

### Handling Migration Drift (Rebase)

- If production is ahead of a dev branch (e.g., due to hotfixes), use `rebase_branch`.
- This incrementally applies newer production migrations onto the dev branch.

### Cleanup

- Delete branch with `delete_branch` after merge to stop billing.

### Summary of Core Branch Tools

| Tool            | Purpose                                        |
| :-------------- | :--------------------------------------------- |
| `rebase_branch` | Sync dev ← production (production is ahead)    |
| `merge_branch`  | Sync production ← dev (dev is ahead)           |
| `reset_branch`  | Escape hatch — reset dev to a specific version |

---

## 💻 CLI Fallback (Secondary)

Use the Supabase CLI for local dev workflows. Prefer as a project dependency to pin CLI version.

> [!NOTE]
> **Package manager prefix required:** Determine from lockfile (`package-lock.json` → `npx`, `pnpm-lock.yaml` → `pnpm`, `bun.lockb` → `bun`). Every bare `supabase` command must be prefixed accordingly.

### Setup & Auth

- **Login**: `npx supabase login`
- **Link Project**: `npx supabase link --project-ref <PROJECT_ID>`
- **Init**: `npx supabase init` (creates `supabase/` directory)
- **List Projects**: `npx supabase projects list` (shows linked project ID)

### Database & Migrations

- **Generate Migration**: `npx supabase migration new <name>`
- **Fetch Remote Migrations**: `npx supabase migration fetch --yes`
- **Push to Remote**: `npx supabase db push`
- **Diff Schema**: `npx supabase db diff --linked`
- **Pull Schema Changes**: `npx supabase db pull <migration_name> --yes` (repairs remote history)
- **Reset Local**: `npx supabase db reset`
- **Dump Remote**: `npx supabase db dump -f dump.sql`

### Edge Functions (CLI)

- **Create**: `npx supabase functions new <name>`
- **Serve Locally**: `npx supabase functions serve`
- **Deploy**: `npx supabase functions deploy <name>`

### Type Generation (CLI)

- **Generate Types**: `npx supabase gen types --linked > src/types/supabase.ts`

---

## 🔀 PostgREST MCP Server

A separate MCP server (`@supabase/mcp-server-postgrest`) for REST API operations:

- **`postgrestRequest`**: Perform HTTP requests (GET, POST, PATCH, DELETE) against `/rest/v1`.
- **`sqlToRest`**: Convert SQL queries to PostgREST syntax (method + path).

Useful for connecting end-user apps to Supabase via REST. Operates under RLS context of the provided API key.

---

## 🛠️ Troubleshooting

| Symptom                                 | Probable Cause              | Corrective Action                                                              |
| :-------------------------------------- | :-------------------------- | :----------------------------------------------------------------------------- |
| `401 Unauthorized` on queries           | RLS enabled, no valid JWT   | Add RLS policies or use `service_role` key for admin access.                   |
| `404 Not Found` on table                | Table doesn't exist yet     | Run `apply_migration` or `execute_sql` to create the table.                    |
| `permission denied for table`           | Missing GRANT or RLS issue  | `GRANT ALL ON table TO anon, authenticated;`                                   |
| `relation does not exist`               | Wrong schema or table name  | Use `list_tables` to verify table names and schemas.                           |
| `Not authenticated`                     | MCP connection stale        | Restart MCP connection and verify org access.                                  |
| `Could not find column in schema cache` | Schema drift                | Update types + implementation to match current schema.                         |
| `Migration conflicts`                   | Duplicate migration version | Check `list_migrations` history before applying new migrations.                |
| `No project ref`                        | CLI not linked              | Run `npx supabase link` to link workspace to hosted project.                   |
| Data not appearing in app               | Schema drift                | Run `npx supabase db diff --linked`. If drift exists, run `db pull` to repair. |
| Edge function 500 error                 | Runtime error               | Check `get_logs` (service: `edge-function`).                                   |
| MCP server not responding               | Server not initialized      | Click **Refresh ↻** in the MCP panel or restart the MCP server process.        |

### Using Logs for Debugging

- **Postgres logs**: Slow queries, errors, connection issues.
- **API logs**: PostgREST endpoint failures, RLS policy issues.
- **Edge Function logs**: Runtime errors, deployment failures.
- **Branch-action logs**: Migration failures during merge/rebase.

---

## 🔒 Security Best Practices

> [!CAUTION]
> Connecting any data source to an LLM carries inherent **prompt injection** risks. User-generated content in the database could contain instructions that trick the LLM into executing malicious queries.

1. **Don't connect to production**: Use MCP with a development project only. Never expose real production data.
2. **Don't give to customers**: MCP operates under developer permissions — internal use only.
3. **Read-only mode**: Use `?read_only=true` when connecting to real data.
4. **Project scoping**: Use `?project_ref=<ID>` to limit access to one project.
5. **Branching**: Use dev branches for risky schema changes; merge only after validation.
6. **Feature groups**: Reduce attack surface by enabling only needed tool groups.
7. **Review tool calls**: Always keep manual approval enabled in your MCP client.

---

## 💡 General Best Practices

1. **Migrations over raw SQL**: Always use `apply_migration` for DDL. Use `execute_sql` only for DML.
2. **Run advisors after DDL**: Call `get_advisors` (security + performance) after creating/altering tables.
3. **Search docs first**: Use `search_docs` before implementing Supabase features — docs are continuously updated.
4. **Type safety**: Run `generate_typescript_types` or CLI `gen types` after schema changes.
5. **Branch for experiments**: Use dev branches for risky schema changes; merge only after validation.
6. **Least-privilege RLS**: Prefer granular RLS policies over blanket disables.
7. **Environment variables**: Store `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` (local) and Vercel env vars (production). Never commit secrets.
8. **Edge Function JWT**: Always enable `verify_jwt` unless the function has custom auth.
9. **No hardcoded FK refs**: In data migrations, never hardcode generated IDs — they differ between branches.
10. **Forward-only on production**: Never reset production migrations. Create new forward migrations to revert changes.

---

## 📚 References

- [Supabase MCP Setup](https://supabase.com/mcp)
- [Supabase CLI Getting Started](https://supabase.com/docs/guides/cli/getting-started)
- [Supabase Branching](https://supabase.com/docs/guides/deployment/branching)
