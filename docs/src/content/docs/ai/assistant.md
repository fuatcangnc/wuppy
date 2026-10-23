---
title: AI assistant
description: Chat with ready-made agents that read and work on your sites.
sidebar:
  order: 1
---

The **Assistant** page on the hub lets you ask questions and give tasks in plain language. The assistant uses tools
to read real data from your sites and, if you allow it, to write drafts.

## Setup

Set an OpenAI-compatible provider on the hub server:

```sh
WUPPY_AI_BASE_URL=https://api.example.com/v1
WUPPY_AI_API_KEY=...
WUPPY_AI_MODELS=deepseek-v4.1-flash   # comma-separated; the first one is the default
```

Any OpenAI-compatible endpoint works (OpenAI, OpenRouter, Ollama, EVREN…). The model must support tool calls.
The key stays on the server and is never sent to the browser.

## Agents

| Agent | What it does |
| --- | --- |
| **Agency assistant** | Any task across the sites you can reach |
| **Site care** | Health checks, connection problems, security scans, recent activity |
| **Client reporter** | Writes client reports from real data and can email them to a site member |
| **Content editor** | Drafts and edits content in the client's voice |

Choose an agent and, optionally, a site. Answers stream in as they are written, and each tool the assistant runs is
shown with its result.

## Changes need your permission

Writing tools are off by default. Turn on **Allow changes** for a message to let the assistant create or edit
content. New content is always saved as a **draft**; the **Changes to review** panel links to each one so a person
can check and publish it.

The assistant acts with **your** permissions: every tool call is a normal API request checked like any other.
Tool output is treated as data, never as instructions.

## Context notes

On **Sites**, each site has two notes that the assistant reads first:

- **Agency playbook**: how your agency works (tone, rules, what to check).
- **Client brief**: the client's brand voice, audience and wishes.

Only users with `sites:manage` can read or edit them.

## Saved chats

Chats are saved per user; only you can list, open or delete yours. Start a new chat or reopen an old one from the
list. Each user keeps up to 200 chats.

## Limits

20 messages per minute per user, at most 8 tool steps per answer, and a provider timeout.
