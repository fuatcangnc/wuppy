---
"wuppycms": minor
"@wuppycms/admin": minor
---

The MCP endpoint now uses the official MCP SDK and speaks the 2026-07-28 Streamable HTTP protocol (older clients still work). `wuppycms mcp` serves the same tools over stdio, so Claude Code, Cursor, Codex and opencode can connect with either transport. After creating an API token, the Users page shows copy-ready configs for all four clients.
