---
title: OpenAI API and MCP
description: Use your sites from your own apps and from AI tools such as Claude Code.
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

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server. For example with
Claude Code:

```sh
claude mcp add --transport http wuppy https://hub.example.com/api/mcp \
  --header "Authorization: Bearer wuppy_..."
```

| Tool | Does |
| --- | --- |
| `list_sites`, `check_site`, `site_overview` | Sites you can reach, their connection and a summary |
| `get_context` | The agency playbook and client brief |
| `list_collections`, `list_content`, `read_content` | Read content |
| `site_activity` | Recent changes |
| `site_report`, `security_scan` | Monthly report data and the security scan |
| `create_draft`, `update_content` | Write content (drafts only for new entries) |
| `email_site_member` | Email a member of a site (recorded in the audit log) |

MCP accepts only Bearer tokens, never browser cookies.
