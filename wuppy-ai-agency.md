# Wuppy — AI ajans katmanı (Managed Sites için)

> Hedef: Dollie'deki "AI that works with your full agency context" fikrini Wuppy
> mimarisine uygun, güvenli ve küçük parçalar halinde getirmek. Yönetilen
> siteler (bkz. `wuppy-multiple-managed-sites.md`, ADR-011) bu katmanın
> temelidir. Karar: ADR-012.

## 1. Ana fikir

Yapay zekâ yeni bir yetki yolu açmaz. Her araç (tool), hub'ın **mevcut REST
API'sine iç istek** olarak gider ve isteği yapan kişinin oturumu veya token'ı
ile çalışır:

```
Claude / Cursor / VS Code ──MCP (Bearer API token)──┐
Admin "Assistant" sohbeti ──oturum çerezi───────────┤
                                                    ▼
                                POST /api/mcp  ·  POST /api/ai/chat
                                                    │  araç çağrısı = iç istek
                                                    ▼
                         /api/sites, /api/sites/:id/proxy/api/content/... (mevcut)
                                                    │  izin, üyelik, SSRF, audit
                                                    ▼
                                         Uzak Wuppy siteleri
```

- Model ne isterse istesin, kullanıcının yapamayacağı bir şeyi yapamaz:
  izinler, site üyelikleri, proxy allowlist'i ve rate limit aynen geçerlidir.
- Bir client yalnızca kendi sitesini görür; ajans notlarını göremez.
- Uzak sitenin AI/MCP uçları proxy'den kapalıdır (`/api/ai`, `/api/mcp`):
  hub, müşterinin AI kotasını harcayamaz.

## 2. Dollie özellikleri → Wuppy karşılığı

| Dollie | Wuppy karşılığı | Durum |
| --- | --- | --- |
| Clients · Sites · Processes | Client = `client` rolündeki kullanıcı + site üyeliği; Site = yönetilen site; Process = **ajans çalışma kuralları** (playbook) | ✅ |
| Client profili / bağlam | Site başına **müşteri notu** (hedefler, marka dili, tercihler) | ✅ |
| MCP Server (Claude, Cursor, VS Code) | `POST /api/mcp` (Streamable HTTP, JSON yanıt, durumsuz), API token ile | ✅ |
| Dollie Chat (dashboard'da sohbet) | Admin → **Assistant** sayfası | ✅ |
| Multi-model AI | OpenAI uyumlu sağlayıcı (OpenRouter, OpenAI, Ollama, Bedrock…), `WUPPY_AI_MODELS` listesinden seçim | ✅ |
| Select Agent (Site Care, Client Reporter, Developer) | Hazır ajanlar: Genel asistan, Site bakımı, Müşteri raporu, İçerik editörü | ✅ |
| Agents that execute | Araçlar taslak oluşturur, içerik düzenler, üyeye e-posta atar; sohbette **"Değişikliğe izin ver"** açıkken | ✅ |
| Uptime / sağlık | `check_site` aracı (mevcut bağlantı kontrolü) | ✅ |
| Activity logs | `site_activity` aracı (uzak `/api/audit`, `audit:read` izni varsa) | ✅ |
| Client report + e-posta | Rapor ajanı + `email_site_member` (yalnız o sitenin üyelerine) | ✅ |
| OpenAI-compatible API (custom app) | `GET /api/v1/models`, `POST /api/v1/chat/completions` (model = ajan id, Bearer token, salt okunur, `stream` destekli) | ✅ |
| Vercel AI SDK stream | Assistant SSE akışı (`stream: true` → `text` / `step` / `done` olayları); OpenAI API'de OpenAI chunk formatı | ✅ |
| Sohbet geçmişi | `wuppy_ai_chats`: kullanıcı başına kayıt (en çok 200), yalnız sahibi görür | ✅ |
| Custom client portal | Kısmen: client aynı Assistant'ı kendi siteleriyle kullanır | 🟡 |
| Connect your own MCP tools | Sonra: hub'a dış MCP sunucusu bağlama | ⏳ |
| Custom agent oluşturma | Sonra: playbook'tan ajan tanımı | ⏳ |
| Bulk updates | Sites → **Plugin updates**: tüm sitelerde registry eklenti güncellemeleri, tek tek ya da hepsi; her güncelleme sitede onay bekler. Çekirdek güncellemesi imaj yenilemesi (uygulama dışı) | ✅ / çekirdek ✖ |
| Vulnerability scanning | `POST /api/sites/:id/scan` + **Scan all**: açık kurulum, dışarı açık özel dosyalar (.env, auth.db, .git), güvenlik başlıkları, token süresi | ✅ |
| Uptime izleme | Hub saatlik kontrol + tarama; yeni sorun çıkınca site yöneticilerine e-posta | ✅ |
| Aylık müşteri raporu | Site başına alıcı (site üyesi); her ayın 1'inde önceki ay raporu e-postayla | ✅ |
| PDF rapor | `GET /api/sites/:id/report?format=html` yazdırılabilir sayfa → tarayıcıda "Save as PDF" | ✅ |
| Scheduled backups | Sitede mevcut yedekleme var; hub'dan zamanlama sonra | ⏳ |
| Workspaces (dev ortamı) | Wuppy karşılığı: siteye bağlı kayıtlı sohbet + "Changes to review" listesi (ajanın taslak/düzenlemeleri, editörde açıp yayınlama). Kod/tema geliştirme ortamı yok | 🟡 |

## 3. Güvenlik kuralları

- [x] Araçlar yalnız iç REST istekleriyle çalışır; doğrudan veritabanı/dosya erişimi yok
- [x] MCP yalnız `Authorization: Bearer` ile (çerezle değil), bu yüzden CSRF başlığı istenmez
- [x] Sohbette yazma araçları varsayılan kapalı; kullanıcı her mesajda açıkça izin verir
- [x] Taslak aracı her zaman `draft: true` yazar
- [x] E-posta yalnız ilgili sitenin üyelerine gider, audit'e yazılır
- [x] Ajans ve müşteri notları yalnız `sites:manage` iznine açık
- [x] Araç çıktısı modele "veri" olarak verilir, talimat olarak değil (sistem mesajı); çıktı 20 KB ile kırpılır
- [x] Sohbet: kullanıcı başına dakikada 20 istek, istek başına en çok 8 araç adımı, sağlayıcı çağrısı 60 sn zaman aşımı
- [x] Sağlayıcı anahtarı yalnız ortam değişkeninde (`WUPPY_AI_API_KEY`), tarayıcıya dönmez
- [x] Uzak sitenin `/api/ai` ve `/api/mcp` uçları proxy'den kapalı

## 4. Yapılacaklar

### Faz 1 — Bağlam + MCP + Assistant (bu sürüm)

- [x] `wuppy_context` tablosu: ajans playbook'u + site başına müşteri notu
- [x] `GET/PUT /api/ai/context`, `GET/PUT /api/sites/:id/context` (`sites:manage`)
- [x] `POST /api/sites/:id/email` — sitenin üyesine e-posta (`sites:manage`)
- [x] Araç seti (`packages/core/src/mcp/tools.ts`): `list_sites`, `get_context`, `check_site`, `site_overview`, `list_collections`, `list_content`, `read_content`, `site_activity`, `create_draft`, `update_content`, `email_site_member`
- [x] MCP sunucusu `POST /api/mcp`: `initialize`, `tools/list`, `tools/call`, `ping`, bildirimler; `GET` → 405
- [x] OpenAI uyumlu sohbet döngüsü (`packages/core/src/ai/chat.ts`), hazır ajanlar
- [x] `GET /api/ai/config`, `POST /api/ai/chat`
- [x] Admin: **Assistant** sayfası (ajan + model seçimi, site odağı, adım listesi, değişiklik izni)
- [x] Admin: Sites sayfasında müşteri notu düzenleme; Assistant'ta ajans playbook'u ve MCP bağlantı bilgisi
- [x] Testler: MCP protokolü, araç izinleri (client başka siteyi göremez), sohbet döngüsü (sahte sağlayıcı), yazma izni kapalıyken yazma aracı yok
- [x] Ortam: `WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS`

### Faz 2 — Dışa açık API

- [x] `/api/v1/chat/completions` + `/api/v1/models` (OpenAI uyumlu) — ajanı özel uygulamalara açar (salt okunur)
- [x] SSE akışı (Assistant: `text` / `step` / `done` / `error`; OpenAI API: chunk + `[DONE]`)
- [x] Sohbet geçmişini saklama (`/api/ai/chats`), Assistant'ta liste/aç/sil
- [x] Çalışma alanı: sohbetteki değişiklikler listesi, editörde açma

### Faz 3 — Operasyonlar

- [x] Zamanlanmış sağlık kontrolü + güvenlik taraması (saatlik), yeni sorunda site yöneticilerine e-posta
- [x] Aylık müşteri raporu (e-posta, HTML) + yazdırılabilir PDF sayfası
- [x] Güvenlik taraması (dıştan; token göndermez) + **Scan all**
- [x] Toplu eklenti güncellemesi (Sites → Plugin updates)
- [x] MCP/Assistant araçları: `site_report`, `security_scan`
- [ ] Hub'dan uzak sitede yedek alma/geri yükleme
- [ ] Bağımlılık taraması (`pnpm audit` sitede çalışmıyor; imaj üretiminde CI'da)
- [ ] Çekirdek (Wuppy sürümü) toplu güncellemesi — imaj/deploy işi
- [ ] Dış MCP sunucusu bağlama, özel ajan tanımı
- [ ] OpenAI API'de yazma izni (açık bir opt-in ile)

## 5. Kurulum

Hub sunucusunda:

```
WUPPY_AI_BASE_URL=https://evren-llmapi.ssyz.org.tr/v1   # şu an: EVREN (OpenCode'daki sağlayıcı)
WUPPY_AI_API_KEY=...
WUPPY_AI_MODELS=deepseek-v4.1-flash                      # virgülle ek model: glm-5.3,qwen3.8-flash-next
```

OpenAI uyumlu herhangi bir uç nokta olur (OpenRouter, OpenAI, Ollama…).

Kendi uygulamanız (OpenAI SDK):

```
const client = new OpenAI({ baseURL: "https://<hub>/api/v1", apiKey: "wuppy_..." });
await client.chat.completions.create({ model: "site-care", messages: [{ role: "user", content: "Sitelerim nasıl?" }] });
```

MCP (Claude Code): Users → API token oluştur, sonra

```
claude mcp add --transport http wuppy https://<hub>/api/mcp --header "Authorization: Bearer wuppy_..."
```
