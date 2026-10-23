---
title: OpenAI API ve MCP
description: Sitelerinizi kendi uygulamalarınızdan ve Claude Code gibi yapay zekâ araçlarından kullanın.
sidebar:
  order: 3
---

İkisi de `Authorization: Bearer wuppy_…` olarak gönderilen bir **API token'ı** (Users → API tokens) kullanır ve
token'ın izinleriyle çalışır.

## OpenAI uyumlu API

Hub, OpenAI biçiminde ve akış destekli `/api/v1/models` ve `/api/v1/chat/completions` uçlarını sunar. *Model*
ajandır: `assistant`, `site-care`, `reporter` veya `editor`. Bu API salt okunurdur: yazma araçları kullanılamaz.

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://hub.example.com/api/v1", apiKey: "wuppy_..." });
const reply = await client.chat.completions.create({
	model: "site-care",
	messages: [{ role: "user", content: "Sitelerim nasıl?" }],
});
```

System mesajları ajana ek bağlam olarak iletilir.

## MCP sunucusu

`POST /api/mcp` bir [Model Context Protocol](https://modelcontextprotocol.io) sunucusudur. Örneğin Claude Code
ile:

```sh
claude mcp add --transport http wuppy https://hub.example.com/api/mcp \
  --header "Authorization: Bearer wuppy_..."
```

| Araç | Ne yapar |
| --- | --- |
| `list_sites`, `check_site`, `site_overview` | Erişebildiğiniz siteler, bağlantıları ve özetleri |
| `get_context` | Ajans kuralları ve müşteri özeti |
| `list_collections`, `list_content`, `read_content` | İçerik okuma |
| `site_activity` | Son değişiklikler |
| `site_report`, `security_scan` | Aylık rapor verisi ve güvenlik taraması |
| `create_draft`, `update_content` | İçerik yazma (yeni kayıtlar yalnızca taslak) |
| `email_site_member` | Bir site üyesine e-posta (denetim kaydına yazılır) |

MCP yalnızca Bearer token kabul eder, tarayıcı çerezlerini asla kabul etmez.
