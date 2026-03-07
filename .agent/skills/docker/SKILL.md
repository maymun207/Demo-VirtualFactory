---
name: docker
description: Commands and strategies for managing Docker containers, images, and MCP server integrations.
---

# Docker Management Skill

This skill provides a comprehensive guide for using Docker on macOS, specifically within the context of MCP (Model Context Protocol) servers.

## Core Commands

### Daemon Management

- **Check Status**: `docker info` (verifies daemon is running and responsive)
- **Start Desktop (macOS)**: `open -a Docker`
- **Verify Version**: `docker --version`

### Container Operations

- **List Running**: `docker ps`
- **List All**: `docker ps -a`
- **Stop Container**: `docker stop <container_id>`
- **Remove Container**: `docker rm <container_id>`
- **View Logs**: `docker logs -f <container_id>`

### Image Operations

- **List Images**: `docker images`
- **Remove Image**: `docker rmi <image_id>`
- **Pull Image**: `docker pull <image_name>`

## Docker MCP Integration

Many MCP servers (like GitHub) run within Docker containers.

### Prerequisites

- **Docker Desktop**: Must be running.
- **Docker CLI Plugin**: `docker-mcp` must be installed at `~/.docker/cli-plugins/`.

### Troubleshooting Connection

If you see: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`

1. **Action**: Ensure Docker Desktop is open and the icon in the menu bar is solid (not animated).
2. **Command**: `open -a Docker`

### Health Check Utility

To quickly audit the Docker environment for MCP compatibility:

```bash
docker info && docker mcp --version
```

## Best Practices

- **Resource Allocation**: Ensure Docker has at least 4GB of RAM and 4 CPUs (allocated in Docker Desktop settings) for smooth MCP operation.
- **Pruning**: Periodically run `docker system prune` to clear unused data and free up disk space on macOS.
- **Socket Permissions**: If permission errors occur on `docker.sock`, restart Docker Desktop to reset the symlink.
