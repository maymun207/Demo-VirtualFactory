---
name: github
description: Commands and strategies for managing GitHub repositories, issues, and PRs using the MCP server as the primary mechanism.
---

# GitHub Management Skill (MCP Integration)

This skill focuses on leveraging the **GitHub MCP Server** (`github-mcp-server`) as the primary interface for repository operations, enabling high-speed, API-driven workflows.

---

## 🚀 Startup: Docker & GitHub MCP Server

The GitHub MCP server (`ghcr.io/github/github-mcp-server`) runs as a Docker container. The IDE starts it **automatically** once Docker Desktop is running.

### Step 1 — Start Docker Desktop

```bash
# Launch Docker Desktop (macOS)
open -a Docker

# Poll until the daemon is ready (every 5s, up to 60s)
for i in {1..12}; do
  docker info &>/dev/null && echo "Docker ready!" && break
  echo "Waiting... ($i/12)" && sleep 5
done
```

> Do not proceed until you see **"Docker ready!"**

### Step 2 — Verify the GitHub MCP Container is Running

The IDE auto-starts the container. Confirm it is up:

```bash
# Look for a container using the github-mcp-server image
docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}" | grep github-mcp-server
```

Expected output example:

```
nervous_swanson   ghcr.io/github/github-mcp-server   Up 7 minutes
```

If no container appears, **click Refresh ↻ in the IDE MCP panel** — the IDE will launch it automatically.

### Step 3 — Confirm MCP Authentication

Use the `get_me` MCP tool to verify the server is authenticated and responding.

---

## 🐙 MCP Toolset (Primary)

The following tools are available via the `github-mcp-server` and should be prioritized over local CLI commands.

### 🔍 Discovery & Search

- **`get_me`**: Verify authentication and profile details.
- **`search_repositories`**: Find projects by query or user.
- **`search_code`**: Find specific snippets or patterns across repositories.
- **`search_issues` / `search_pull_requests`**: Filter and find specific threads.

### 📂 Repository & File Operations

- **`get_repository`**: Get metadata, stars, and default branches.
- **`get_file_contents`**: Read files/directories directly from the API.
- **`push_files`**: Commit multiple files in a single atomic operation.
- **`create_or_update_file`**: Single-file commits via API.
- **`delete_file`**: Remove files from a branch.

### 🌿 Git Flow & Branches

- **`create_branch`**: Initialize new feature branches.
- **`list_branches`**: Audit existing branches.
- **`get_commit` / `list_commits`**: Inspect history and specific changes.
- **`list_tags` / `get_tag`**: Manage release markers.

### 🏗️ Collaboration (Issues & PRs)

- **`create_pull_request` / `update_pull_request`**: Manage code reviews.
- **`pull_request_read`**: Get status, diffs, and comments.
- **`merge_pull_request`**: Finalize and close features.
- **`issue_write`**: Create or update issues (supports labels, assignees).
- **`add_issue_comment`**: Document progress on threads.

## 🛠️ MCP Troubleshooting

| Symptom                                   | Probable Cause              | Corrective Action                                   |
| :---------------------------------------- | :-------------------------- | :-------------------------------------------------- |
| `server name github-mcp-server not found` | Server not yet initialized. | Click **Refresh ↻** in the MCP panel.               |
| `Docker connection error`                 | Daemon stopped.             | Run `open -a Docker` in terminal.                   |
| `401 Unauthorized`                        | Expired PAT.                | Generate new token at `github.com/settings/tokens`. |

## 💻 CLI Fallback (Secondary)

Use `git` CLI only for bulk submodule management or complex interactive rebasing.

- **Push Current State**: `git push origin master`
- **Rebase**: `git pull --rebase origin master`

## 💡 Best Practices

1. **Atomic API Commits**: Use `push_files` to group related changes (e.g., updating a component and its test) to keep the commit history clean.
2. **Read Before Write**: Use `get_file_contents` to verify the state of a file on the remote branch before attempting a `create_or_update_file` to avoid conflicts.
3. **Draft PRs**: When starting complex features, create a draft PR early via the API to provide visibility into the work-in-progress.
4. **No Local Secrets**: Never pull `.env` files into GitHub; manage them via Vercel or GitHub Secrets using the respective MCP/CLI tools.
