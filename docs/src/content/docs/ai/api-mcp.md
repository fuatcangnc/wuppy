---
title: OpenAI API and MCP
description: Use your sites from your own apps and from AI tools such as Claude Code, Cursor, Codex and opencode.
sidebar:
  order: 3
---

Both use an **API token** (Users → API tokens) sent as `Authorization: Bearer wuppy_…`. They run with the token's
permissions.

## OpenAI-compatible API

The hub serves `/api/v1/models` and `/api/v1/chat/completions` in the OpenAI format, with streaming. The *model* is
the agent: `assistant`, `site-care`, `reporter` or `editor`. This API is read-only: writing tools are not available.

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://hub.example.com/api/v1", apiKey: "wuppy_..." });
const reply = await client.chat.completions.create({
	model: "site-care",
	messages: [{ role: "user", content: "How are my sites doing?" }],
});
```

System messages are passed to the agent as extra context.

## MCP server

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) **Streamable HTTP** server. It speaks
the 2026-07-28 protocol and serves 2025-era clients from the same endpoint. MCP accepts only Bearer tokens, never
browser cookies.

Create the token under **Users → API tokens** with the permissions the agent may use. A token never has more rights
than its owner. The same screen then shows copy-ready configs for the clients below.

### Claude Code

```sh
claude mcp add --transport http wuppy https://hub.example.com/api/mcp \
  --header "Authorization: Bearer wuppy_..."
```

### Cursor

Add this to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` in the project:

```json
{
	"mcpServers": {
		"wuppy": {
			"url": "https://hub.example.com/api/mcp",
			"headers": {
				"Authorization": "Bearer ${env:WUPPY_TOKEN}"
			}
		}
	}
}
```

Set `WUPPY_TOKEN` in your shell, or replace the value with the token.

### Codex

Add this to `~/.codex/config.toml`, or to `.codex/config.toml` in a trusted project:

```toml
[mcp_servers.wuppy]
url = "https://hub.example.com/api/mcp"
bearer_token_env_var = "WUPPY_TOKEN"
```

Codex sends the value of `WUPPY_TOKEN` as the Bearer token.

### opencode

Add this to `opencode.json` (or `opencode.jsonc`):

```json
{
	"$schema": "https://opencode.ai/config.json",
	"mcp": {
		"wuppy": {
			"type": "remote",
			"url": "https://hub.example.com/api/mcp",
			"oauth": false,
			"headers": {
				"Authorization": "Bearer {env:WUPPY_TOKEN}"
			}
		}
	}
}
```

`oauth: false` keeps opencode on the Bearer token instead of starting an OAuth flow.

### Local stdio

`wuppycms mcp` runs the same tools as a local MCP server. Use it in a client that cannot send a custom Authorization
header, or when you prefer a local process. It reads `WUPPY_URL` and `WUPPY_TOKEN` from the environment, or from the
site's `.env`:

```sh
WUPPY_URL=https://hub.example.com WUPPY_TOKEN=wuppy_... npx -y wuppycms mcp
```

It needs a WuppyCMS version with the `mcp` command. The process writes logs to stderr and speaks MCP on stdout.

**Claude Code**

```sh
claude mcp add --env WUPPY_URL=https://hub.example.com --env WUPPY_TOKEN=wuppy_... \
  --transport stdio wuppy -- npx -y wuppycms mcp
```

**Cursor**

```json
{
	"mcpServers": {
		"wuppy": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "wuppycms", "mcp"],
			"env": {
				"WUPPY_URL": "https://hub.example.com",
				"WUPPY_TOKEN": "${env:WUPPY_TOKEN}"
			}
		}
	}
}
```

**Codex**

```toml
[mcp_servers.wuppy]
command = "npx"
args = ["-y", "wuppycms", "mcp"]
env_vars = ["WUPPY_URL", "WUPPY_TOKEN"]
```

**opencode**

```json
{
	"$schema": "https://opencode.ai/config.json",
	"mcp": {
		"wuppy": {
			"type": "local",
			"command": ["npx", "-y", "wuppycms", "mcp"],
			"environment": {
				"WUPPY_URL": "https://hub.example.com",
				"WUPPY_TOKEN": "wuppy_..."
			}
		}
	}
}
```

The tools are the same over HTTP and stdio. On a single site (not a hub), pass `"site": "local"` to the content
tools; `list_sites`, `site_report`, `security_scan` and `email_site_member` need a hub.

| Tool | Does |
| --- | --- |
| `list_sites`, `check_site`, `site_overview` | Sites you can reach, their connection and a summary |
| `get_context` | The agency playbook and client brief |
| `list_collections`, `list_content`, `read_content` | Read content |
| `site_activity` | Recent changes |
| `site_report`, `security_scan` | Monthly report data and the security scan |
| `create_draft`, `update_content` | Write content (drafts only for new entries) |
| `email_site_member` | Email a member of a site (recorded in the audit log) |
