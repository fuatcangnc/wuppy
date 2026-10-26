---
title: OpenAI API ve MCP
description: Sitelerinizi kendi uygulamalarınızdan ve Claude Code, Cursor, Codex, opencode gibi yapay zekâ araçlarından kullanın.
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

`POST /api/mcp` bir [Model Context Protocol](https://modelcontextprotocol.io) **Streamable HTTP** sunucusudur.
2026-07-28 protokolünü konuşur ve aynı uçtan 2025 sürümü istemcileri de yanıtlar. MCP yalnızca Bearer token kabul
eder, tarayıcı çerezlerini asla kabul etmez.

Token'ı **Users → API tokens** altında, ajanın kullanacağı izinlerle oluşturun. Bir token sahibinin haklarından
fazlasına sahip olamaz.

### Claude Code

```sh
claude mcp add --transport http wuppy https://hub.example.com/api/mcp \
  --header "Authorization: Bearer wuppy_..."
```

### Cursor

Bunu `~/.cursor/mcp.json` dosyasına veya projedeki `.cursor/mcp.json` dosyasına ekleyin:

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

`WUPPY_TOKEN` değişkenini shell'inizde tanımlayın veya değeri doğrudan token ile değiştirin.

### Codex

Bunu `~/.codex/config.toml` dosyasına veya güvenilen bir projedeki `.codex/config.toml` dosyasına ekleyin:

```toml
[mcp_servers.wuppy]
url = "https://hub.example.com/api/mcp"
bearer_token_env_var = "WUPPY_TOKEN"
```

Codex, `WUPPY_TOKEN` değerini Bearer token olarak gönderir.

### opencode

Bunu `opencode.json` (veya `opencode.jsonc`) dosyasına ekleyin:

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

`oauth: false`, opencode'un OAuth akışı başlatması yerine Bearer token'da kalmasını sağlar.

### Yerel stdio

`wuppycms mcp`, aynı araçları yerel bir MCP sunucusu olarak çalıştırır. Özel `Authorization` başlığı gönderemeyen
bir istemcide veya yerel bir süreç tercih ettiğinizde kullanın. `WUPPY_URL` ve `WUPPY_TOKEN` değerlerini ortamdan
veya sitenin `.env` dosyasından okur:

```sh
WUPPY_URL=https://hub.example.com WUPPY_TOKEN=wuppy_... npx -y wuppycms mcp
```

`mcp` komutunu içeren bir WuppyCMS sürümü gerekir. Süreç günlükleri stderr'e yazar, MCP'yi stdout üzerinden konuşur.

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

Araçlar HTTP ve stdio üzerinde aynıdır. Tek bir sitede (hub değil) içerik araçlarına `"site": "local"` verin;
`list_sites`, `site_report`, `security_scan` ve `email_site_member` bir hub gerektirir.

| Araç | Ne yapar |
| --- | --- |
| `list_sites`, `check_site`, `site_overview` | Erişebildiğiniz siteler, bağlantıları ve özetleri |
| `get_context` | Ajans kuralları ve müşteri özeti |
| `list_collections`, `list_content`, `read_content` | İçerik okuma |
| `site_activity` | Son değişiklikler |
| `site_report`, `security_scan` | Aylık rapor verisi ve güvenlik taraması |
| `create_draft`, `update_content` | İçerik yazma (yeni kayıtlar yalnızca taslak) |
| `email_site_member` | Bir site üyesine e-posta (denetim kaydına yazılır) |
