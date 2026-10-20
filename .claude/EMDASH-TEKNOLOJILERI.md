# EmDash — Kullanılan Teknolojiler Envanteri

Bu dosya, `../emdash-main/` deposundaki tüm `package.json`, workspace kataloğu
ve config dosyaları taranarak hazırlanmıştır. Amaç, Wuppy geliştirilirken
EmDash'in hangi araçları hangi katmanda kullandığını tek bakışta görmek ve
bilinçli olarak kopyalanacak / değiştirilecek tercihleri ayırmaktır.

> Sürümler `pnpm-workspace.yaml` kataloğu ve paket `package.json` dosyalarından
> alınmıştır. EmDash hızlı hareket ettiği için zamanla değişebilir; bağlayıcı
> olan depodaki katalogdur.

> **Wuppy farkı:** Bu dosya EmDash'in ne kullandığını kaydeder. Wuppy'nin
> seçimleri (Better Auth, Bejamas UI, Nanostores, Lexical, opsiyonel Cloudflare)
> için [KARARLAR.md](KARARLAR.md) ve özet için bölüm 18.

---

## 1. Katman haritası

```
┌──────────────────────────────────────────────────────────────┐
│ Site katmanı      Astro 7 + @astrojs/node / @astrojs/cloudflare
│ Admin katmanı     React 19 + TanStack Router/Query + Kumo
│ Editör            Tiptap 3 / ProseMirror + CodeMirror 6 + Yjs
│ API               Hono + Zod + OpenAPI
│ Kimlik            WebAuthn/passkey + OAuth + magic link + RBAC
│ Veri              Kysely → SQLite | libSQL | PostgreSQL | D1
│ Depolama          Yerel FS | S3/R2 (AWS SDK v3)
│ İçerik            Portable Text + Markdown/MDX dönüştürücüleri
│ Eklenti           Manifest + sandbox (workerd/miniflare) + registry
│ Kalite            Vitest 4 + Playwright + axe + visual regression
│ Dağıtım           Node.js, Docker, Cloudflare Workers/Wrangler
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Dil, runtime ve paket yönetimi

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **TypeScript** | 6.0.0-beta (katalog `^6.0.3`) | Tüm kaynak; strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` |
| **Node.js** | `>=22.16` | Sunucu runtime; yerleşik `node:sqlite`, `node:test`, `fetch` |
| **ESM** | — | Tüm paketler `"type": "module"`; iç importlarda `.js` uzantısı |
| **pnpm** | 11.9.0 (`packageManager`) | Workspace, katalog, katı tedarik zinciri ayarları |
| **pnpm catalog** | — | Tüm paketlerde tek sürüm kaynağı |
| **pnpm workspace** | — | `packages/*`, `packages/plugins/*`, `apps/*`, `demos/*`, `templates/*`, `docs`, `e2e`, `infra` |
| **Corepack** | — | pnpm sürümünü sabitler |
| **@typescript/native-preview (tsgo)** | 7.0.0-dev | Hızlı tip denetimi (`tsgo --noEmit`) |

### Tedarik zinciri sertleştirmesi (`pnpm-workspace.yaml`)

- `minimumReleaseAge: 1440` — yeni yayınlanan paketler 24 saat beklemeden kurulmaz.
- `trustPolicy: no-downgrade` — güven seviyesi düşen sürüm reddedilir.
- `strictDepBuilds`, `dangerouslyAllowAllBuilds: false` — postinstall script'leri
  yalnızca izin listesindekiler için çalışır.
- `blockExoticSubdeps`, `verifyStoreIntegrity`, `strictStorePkgContentCheck`,
  `verifyDepsBeforeRun: error`.
- `patchedDependencies` — `@sigstore/core`, `image-size`, `partysocket` yamaları.
- `overrides` — güvenlik/davranış için sabitlenmiş transitive sürümler.

---

## 3. Site / frontend katmanı

| Teknoloji | Sürüm | Kullanım |
| --- | --- | --- |
| **Astro** | `^7.3.2` | Site framework'ü, SSR, content collections, entegrasyon API'si |
| **@astrojs/node** | `^11.1.5` | Node.js standalone adaptörü (`mode: "standalone"`) |
| **@astrojs/cloudflare** | `^14.3.1` | Workers adaptörü |
| **@astrojs/react** | `^7.0.0` | Admin ve etkileşimli Astro bileşenleri |
| **React** | 19.2.4 | Admin SPA ve React bileşenleri |
| **React DOM** | 19.2.4 | — |
| **Astro Starlight** | `^0.42.0` | Dokümantasyon sitesi |
| **@astrojs/starlight-tailwind** | `^5.0.0` | Starlight + Tailwind entegrasyonu |
| **Tailwind CSS** | `^4.1.10` / `^4.1.18` | Admin ve docs stilleri |
| **@tailwindcss/cli** | `^4.3.3` | Admin `styles.css` derlemesi |
| **@tailwindcss/typography** | `^0.5.20` | Prose stilleri |
| **@tailwindcss/vite** | `^4.3.3` | Vite tabanlı uygulamalarda Tailwind |
| **astro-iconset** | `^0.0.4` | Marketing şablonunda ikon seti |
| **@iconify-json/ph** | `^1.2.2` | Phosphor ikon verisi |
| **astro-embed** | `^0.12.0` | Embed eklentisi (YouTube, vb.) |
| **astro-portabletext** | `^0.11.0` | Portable Text'i Astro bileşenleriyle render etme |
| **@unpic/placeholder** | `^0.1.2` | Görsel placeholder üretimi |
| **Sharp** | `^0.34.5` | Görsel işleme, optimizasyon, docs görselleri |
| **Vite** | `^8.3.0` (bazı uygulamalarda 6/7) | Astro/Vitest/uygulama derleme altyapısı |

Site dağıtımı: `output: "server"`, Node standalone veya Cloudflare Worker.
Şablonlar `blank`, `starter`, `blog`, `marketing`, `portfolio` ve `-cloudflare`
varyantları.

---

## 4. Admin UI katmanı

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **React** | 19.2.4 (peer: 18/19) | Admin SPA |
| **TanStack Router** | 1.163.2 | Tip güvenli istemci yönlendirme |
| **TanStack Query** | 5.90.21 | Sunucu durumu, cache, mutation |
| **@cloudflare/kumo** | 2.6.0 (sabit) | Tasarım sistemi: Button, Dialog, Input, Toast, CommandPalette |
| **Tailwind CSS** | 4.1.10 | Utility stiller |
| **class-variance-authority** | 0.7.1 | Bileşen varyantları |
| **clsx** | 2.1.1 | Koşullu sınıf birleştirme |
| **tailwind-merge** | 3.3.0 | Çakışan Tailwind sınıflarını çözme |
| **@phosphor-icons/react** | 2.1.10 | İkonlar |
| **@floating-ui/react** | 0.27.16 | Popover, tooltip, konumlandırma |
| **@dnd-kit/core** | 6.3.1 | Sürükle-bırak |
| **@dnd-kit/sortable** | 10.0.0 | Sıralanabilir listeler (menü, alanlar) |
| **@dnd-kit/utilities** | 3.2.2 | DnD yardımcıları |
| **date-fns** | 4.1.0 | Tarih biçimlendirme |
| **react-day-picker** | 9.14.0 | Takvim |
| **react-hotkeys-hook** | 5.2.4 | Klavye kısayolları |
| **react-image-crop** | 11.1.2 | Görsel kırpma |
| **modern-tar** | 0.7.5 | Tar arşiv okuma/yazma (içe/dışa aktarma) |
| **echarts** | 6.0.0 | Blok içi grafikler (`@emdash-cms/blocks`) |

Admin `/_emdash/admin/*` altında mount edilir. `tsdown` ile ESM + DTS üretir;
Tailwind CLI ayrı `styles.css` çıkarır.

---

## 5. Editör ve zengin içerik

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **Tiptap Core / React / PM** | 3.20.0 | Blok tabanlı editör |
| **@tiptap/starter-kit** | 3.20.0 | Temel düğümler |
| **Tiptap uzantıları** | 3.20.0 | code, code-block, image, link, list, table, text-align, typography, underline, subscript/superscript, placeholder, focus, dropcursor, drag-handle, character-count, node-range |
| **@tiptap/y-tiptap** | 3.0.5 | Yjs ile collaborative editing köprüsü |
| **Yjs** | 13.6.0 | CRDT tabanlı gerçek zamanlı işbirliği |
| **y-protocols** | 1.0.7 | Yjs senkronizasyon protokolleri |
| **CodeMirror 6** | 6.20–6.43 | HTML/JS/CSS kod blokları ve kaynak görünümü |
| **@lezer/highlight** | 1.2.3 | Sözdizimi vurgulama |
| **highlight.js** | 11.11.2 | Kod vurgulama |
| **lowlight** | 3.3.0 | highlight.js'in AST tabanlı sürümü |
| **marked** | 17.0.3 | Markdown → HTML (admin önizleme) |
| **DOMPurify** | 3.3.2 | İstemci tarafı HTML temizleme |
| **sanitize-html** | 2.17.1 | Sunucu tarafı HTML temizleme |

İçerik modeli **Portable Text** benzeri yapı + Tiptap editörüdür. HTML gömme
özelliği sanitize edilir; MDX/portable text dönüşümleri ayrı paketlerdedir.

---

## 6. Backend / API

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **Hono** | 4.12.27 | HTTP framework; API, marketplace, release servisleri |
| **Zod** | 4.5.4 | Şema doğrulama, tip üretimi |
| **zod-openapi** | 5.4.6 | OpenAPI şeması üretimi |
| **@apidevtools/swagger-parser** | 12.1.0 | OpenAPI doğrulama (test) |
| **@modelcontextprotocol/sdk** | 1.26.0 / 1.29.0 | MCP sunucusu (AI araçları, docs MCP) |
| **jose** | 6.1.3 | JWT/JWK, oturum ve token imzalama |
| **arctic** | 3.7.0 | OAuth sağlayıcı istemcileri (GitHub, Google, Microsoft) |
| **citty** | 0.2.2 | CLI komut tanımları |
| **consola** | 3.4.2 | CLI loglama |
| **picocolors** | 1.1.1 | Terminal renkleri |
| **chokidar** | 5.0.0 | Dosya izleme (plugin CLI, dev) |
| **croner** | 10.0.1 | Zamanlanmış görevler / cron |
| **ulidx** | 2.4.1 | ULID kimlik üretimi |
| **jsonc-parser** | 3.3.1 | Yorumlu JSON/JSONC okuma (config, manifest) |
| **smol-toml** | 1.6.0 | TOML ayrıştırma |
| **sax** | 1.4.1 | Streaming XML (WordPress WXR) |
| **modern-tar** | 0.7.5 | Tar arşivleri (site transfer, plugin paketleme) |
| **mime** | 4.1.0 | MIME tespiti |
| **image-size** | 2.0.2 (yamalı) | Görsel boyut okuma |
| **jpeg-js** | 0.4.4 | JPEG kodlama/çözme |
| **upng-js** | 2.1.0 | PNG kodlama/çözme |
| **blurhash** | 2.0.5 | Görsel placeholder hash'i |
| **@portabletext/toolkit** | 5.0.1 | Portable Text yardımcıları |

---

## 7. Veri katmanı

| Teknoloji | Sürüm | Nerede |
| --- | --- | --- |
| **Kysely** | 0.29.0 | Tip güvenli SQL query builder; tüm dialect'lerde ortak |
| **node:sqlite** | Node 22+ yerleşik | Varsayılan yerel veritabanı |
| **libSQL** | `@libsql/kysely-libsql` 0.4.0 | Uzak/libSQL (Turso) adaptörü |
| **PostgreSQL** | `pg` 8.x | Node.js dağıtımı |
| **Cloudflare D1** | `kysely-d1` 0.4.0 | Workers dağıtımı |
| **Cloudflare Hyperdrive** | — | Workers → PostgreSQL bağlantı havuzu |
| **SQLite FTS5** | — | Tam metin arama sanal tabloları ve trigger'lar |
| **Object cache** | bellek içi adaptör | `virtual:emdash/object-cache` |
| **Migration runner** | kendi implementasyonu | Statik migration kayıt defteri, forward-only |

Şema yaklaşımı: `_emdash_collections` + `_emdash_fields` sistem tabloları;
her koleksiyon için gerçek `ec_*` tablosu ve tipli kolonlar. EAV değil.

---

## 8. Depolama

| Teknoloji | Kullanım |
| --- | --- |
| **Yerel dosya sistemi** | Varsayılan `LocalStorage`; Node.js dağıtımı |
| **S3 uyumlu depolama** | `S3Storage`; AWS S3, Cloudflare R2, MinIO |
| **@aws-sdk/client-s3** | S3 operasyonları (Put/Get/Delete/Head/List) |
| **@aws-sdk/s3-request-presigner** | İmzalı yükleme/indirme URL'leri |
| **Cloudflare R2 binding** | Workers adaptöründe doğrudan R2 |
| **Sharp** | Görsel türetme, boyutlandırma, format dönüşümü |

Ortak `Storage` arayüzü: `upload`, `download`, `delete`, `exists`, `list`,
`getPublicUrl`, `getSignedUploadUrl`.

---

## 9. Kimlik doğrulama ve güvenlik

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **WebAuthn / Passkey** | `@oslojs/webauthn` 1.0.0 | Parolasız giriş |
| **@oslojs/crypto** | 1.0.1 | Kriptografik ilkeller |
| **@oslojs/encoding** | 1.1.0 | Base64/hex kodlama |
| **jose** | 6.1.3 | JWT, JWK, imza doğrulama |
| **arctic** | 3.7.0 | OAuth 2.0 / OIDC |
| **Magic link** | kendi implementasyonu | E-posta bağlantısıyla giriş |
| **RBAC** | kendi `Permissions` haritası | İzin tabanlı yetkilendirme |
| **CSRF** | `X-EmDash-Request: 1` başlığı | Durum değiştiren tüm uçlar |
| **DOMPurify + sanitize-html** | — | XSS savunması |
| **AT Protocol / atproto** | `@atcute/*`, `@atproto/*` | Atmosphere login ve registry |
| **Sigstore** | `@sigstore/*` 4.x/5.x | Eklenti paket imzası doğrulama |

Ek olarak: API token'ları, OAuth device flow, davet akışı, e-posta şablonları,
denetim kaydı eklentisi.

---

## 10. İçerik dönüşümü ve içe aktarma

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **@wordpress/block-serialization-default-parser** | 5.13.0 | Gutenberg bloklarını ayrıştırma |
| **parse5** | 7.2.1 | HTML ayrıştırma (WordPress içeriği) |
| **@contentful/rich-text-types** | 17.2.7 | Contentful Rich Text tipleri |
| **@portabletext/types** | 4.0.2 | Portable Text tipleri |
| **sax** | 1.4.1 | WXR XML streaming |
| **modern-tar** | 0.7.5 | Site transfer arşivi |
| **marked** | 17.0.3 | Markdown önizleme/dönüşüm |

Dönüştürücü paketleri: `gutenberg-to-portable-text`,
`contentful-to-portable-text`. Site transferi analiz → staging → uygulama
aşamalarına ayrılmıştır.

---

## 11. Eklenti sistemi ve registry

| Teknoloji | Kullanım |
| --- | --- |
| **JSONC manifest** (`emdash-plugin.jsonc`) | Eklenti tanımı: hook'lar, yetenekler, admin yüzeyleri |
| **Plugin CLI** (`@emdash-cms/plugin-cli`) | `init`, `build`, `validate`, `publish` |
| **workerd** | Sandbox eklenti runtime'ı |
| **Miniflare** | workerd test/geliştirme ortamı |
| **Cloudflare Worker Loader** | İzole eklenti çalıştırma (paid plan) |
| **AT Protocol (atcute)** | Registry kayıtları, kimlik, Lexicon |
| **Sigstore** | Paket imzası ve doğrulama |
| **modern-tar** | Eklenti paketleme |
| **Zod** | Manifest ve API şeması |
| **x402** (`@x402/core`, `evm`, `svm`) | Eklenti/registry ödeme protokolü |

Birinci taraf eklentiler: `ai-moderation`, `atproto`, `audit-log`, `color`,
`embeds`, `field-kit`, `forms`, `mcp-smoke`, `webhook-notifier`, test eklentileri.

---

## 12. AI, MCP ve ajan altyapısı

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **@modelcontextprotocol/sdk** | 1.26.0 | MCP sunucusu; içerik yönetimi araçları |
| **agents** | 0.12.0 / 0.14.5 | Ajan runtime'ı (docs, review botu) |
| **@flue/runtime** | 1.0.0-beta.9 | AI ajan çalıştırma çatısı |
| **@flue/cli** | 1.0.0-beta.9 | Flue geliştirme CLI'ı |
| **@earendil-works/pi-ai** | 0.80.6 | Model çağrıları |
| **@cloudflare/codemode** | 0.4.1 | Kod çalıştırma modu |
| **@cloudflare/shell** | 0.4.0 | Sandbox shell |
| **valibot** | 1.4.1 | AI çıktısı doğrulama |
| **@cloudflare/ai-search-snippet** | 0.0.40+ | Docs içinde AI arama |

MCP, hem ürün özelliği (içerik API'si) hem de dokümantasyon/ajan entegrasyonu
olarak kullanılır.

---

## 13. Test ve kalite

| Teknoloji | Sürüm | Katman |
| --- | --- | --- |
| **Vitest** | 4.1.10 | Birim + entegrasyon |
| **@vitest/coverage-v8** | 4.1.10 | Kapsam (eşikler %80) |
| **@vitest/ui** | 4.1.10 | Test UI |
| **@vitest/browser-playwright** | 4.1.10 | Tarayıcı modu |
| **vitest-browser-react** | 2.2.0 | React bileşenlerini gerçek tarayıcıda render |
| **Playwright** | 1.61.1 | E2E + görsel regresyon |
| **@testing-library/react** | 16.3.0 | Erişilebilir sorgular |
| **jsdom** | 26.1.0 | Node tarayıcı ortamı |
| **@axe-core/playwright** | 4.12.1 | Erişilebilirlik (a11y) |
| **@cloudflare/vitest-plugin** | 1.0.0 | workerd/D1 testleri |
| **node:test** | Node yerleşik | Script testleri (`scripts/*.test.mjs`) |
| **PostgreSQL servisi** | CI'da `postgres:17` | Gerçek PG entegrasyon testleri |
| **Gerçek SQLite** | `node:sqlite` | Mock yok; her test taze DB |

### Test profilleri

- `vitest.config.ts` — birim, node, sanal modül stub'ları, %80 kapsam eşiği.
- `vitest.integration.config.ts` — gerçek DB/Git/dosya sistemi.
- `vitest.workerd.config.ts` — Cloudflare runtime.
- `vitest.smoke.config.ts` — kurulum/duman testleri.
- `vitest.repro.config.ts` — `.astro` render testleri (Astro Vite plugin).
- `vitest.types.config.ts` — `*.test-d.ts` tip testleri.
- `playwright.config.ts` — Node fixture E2E (port 4444).
- `playwright.table.config.ts` — tablo odaklı E2E.
- Görsel regresyon — `EMDASH_VISUAL=1`, Linux baseline'ları CI'da üretilir.

### Lint / format / analiz

| Araç | Sürüm | Ne için |
| --- | --- | --- |
| **oxlint** | 1.74.0 | Hızlı lint; tip farkında mod |
| **oxlint-tsgolint** | 0.25.0 | Tip tabanlı lint kuralları |
| **@e18e/eslint-plugin** | 0.5.1 | Modern JS performans/bakım kuralları |
| **oxfmt** | 0.59.0 | Birincil biçimlendirici (tab) |
| **Prettier** | 3.9.5 | Astro/Markdown biçimlendirme |
| **prettier-plugin-astro** | 0.14.1 | `.astro` desteği |
| **knip** | 5.84.1 | Kullanılmayan dosya/bağımlılık |
| **publint** | 0.3.17 | Paket yayın doğrulaması |
| **@arethetypeswrong/cli** | 0.18.2 | Tip çözümleme doğrulaması |
| **pkg-pr-new** | 0.0.78 | PR başına paket önizleme yayını |
| **CodeQL** | GitHub | Güvenlik analizi |

---

## 14. Uluslararasılaştırma ve dokümantasyon

| Teknoloji | Sürüm | Ne için |
| --- | --- | --- |
| **Lingui** (`@lingui/core`, `react`, `cli`, `macro`, `conf`, `message-utils`) | 5.9.4 | Admin UI çevirileri, `.po` katalogları |
| **@lingui/babel-plugin-lingui-macro** | 5.9.4 | Derleme sırasında mesaj çıkarma |
| **Lunaria** (`@lunariajs/core`) | 0.2.0 | Çeviri durumu panosu |
| **RTL** | mantıksal Tailwind sınıfları | Arapça/İbranice desteği |
| **Starlight** | 0.42.0 | Dokümantasyon |
| **Tailwind** | 4.1.18 | Docs teması |
| **Sharp** | 0.34.5 | Docs görsel işleme |
| **@modelcontextprotocol/sdk** | 1.29.0 | Docs MCP sunucusu |
| **agents** | 0.12.0 | Docs AI ajanı |
| **starlight-utils** | 1.0.0 | Starlight yardımcıları |

38 dil kataloğu (`ar`, `bn`, `ca`, `cs`, `da`, `de`, `en`, `en-GB`, `es-419`,
`es-ES`, `eu`, `fa`, `fr`, `he`, `hi`, `hr`, `hu`, `id`, `it`, `ja`, `ka`,
`ko`, `nb`, `nl`, `pl`, `pt-BR`, `pt-PT`, `ru`, `sr-Latn`, `sv`, `th`, `tr`,
`uk`, `zh-CN`, `zh-TW`, `pseudo`).

---

## 15. Dağıtım, CI/CD ve operasyon

| Teknoloji | Kullanım |
| --- | --- |
| **Docker** | Çok aşamalı `node:22-slim` imajı; standalone Node çıktısı |
| **Docker Compose** | `emdash` servisi + `emdash-data` / `emdash-uploads` volume'leri |
| **Cloudflare Workers** | `wrangler.jsonc`, `nodejs_compat`, cron trigger |
| **Wrangler** | 4.125.0; deploy, types, dry-run |
| **D1** | `d1_databases` binding |
| **R2** | `r2_buckets` binding |
| **Worker Loader** | Sandbox eklentiler için `worker_loaders` |
| **GitHub Actions** | CI (shard'lı test), release, visual regression, Lunaria, CodeQL, triage |
| **Changesets** | 3.0.2 + `changesets/action`; sabitlenmiş paket grubu |
| **Renovate / Dependabot** | Bağımlılık güncellemeleri |
| **pnpm patchedDependencies** | Üçüncü taraf yamaları |
| **discord-bot** | `infra/` altında topluluk botu |
| **perf-monitor** | `infra/` altında Vite + Workers performans izleme |

CI iş akışları: `ci.yml`, `release.yml`, `visual.yml`, `visual-apply.yml`,
`lunaria.yml`, `security-analysis.yml`, `sync-skills.yml`, `sync-templates.yml`,
`pr-triage.yml`, `pr-sweep.yml`, `auto-format-apply.yml`.

---

## 16. Performans ve gözlemlenebilirlik

| Araç / yaklaşım | Ne yapar |
| --- | --- |
| `scripts/query-counts.mjs` | Sorgu sayısı bütçesi; SQLite ve D1 snapshot'ları |
| `scripts/query-counts-dump.mjs` | Sorgu dökümü ve sınıflandırma |
| `scripts/build-perf-d1.mjs` | D1 build performansı |
| `scripts/screenshot-all-templates.mjs` | Şablon ekran görüntüleri |
| `infra/perf-monitor/` | Workers tabanlı performans izleme |
| `infra/cache-demo/`, `infra/blog-demo/` | Cache ve yük davranışı denemeleri |
| `fixtures/perf-site/` | Büyük içerikli performans fixture'ı |
| Object cache + route caching | Logged-out hot path'i koruma |
| `scheduler-health`, `deferred-tasks` | Zamanlanmış iş sağlığı |

---

## 17. Sürüm özeti (en kritik bağımlılıklar)

| Paket | Sürüm |
| --- | --- |
| Astro | 7.3.2 |
| React / React DOM | 19.2.4 |
| TypeScript | 6.0.0-beta / katalog 6.0.3 |
| Hono | 4.12.27 |
| Kysely | 0.29.0 |
| Zod | 4.5.4 |
| Tiptap | 3.20.0 |
| TanStack Router | 1.163.2 |
| TanStack Query | 5.90.21 |
| Kumo | 2.6.0 |
| Lingui | 5.9.4 |
| Vitest | 4.1.10 |
| Playwright | 1.61.1 |
| Tailwind CSS | 4.1.x |
| Vite | 8.3.0 (uygulamaya göre 6/7/8) |
| tsdown | 0.20.3 |
| oxlint | 1.74.0 |
| pnpm | 11.9.0 |
| Node.js | >=22.16 |

---

## 18. Wuppy için karşılık haritası

> Güncel ve bağlayıcı kararlar [KARARLAR.md](KARARLAR.md) dosyasındadır. Bu
> tablo yalnızca özet niteliğindedir.

| EmDash teknolojisi | Wuppy kararı | Not |
| --- | --- | --- |
| Astro 7 | Astro 7 | Aynı; ürünün temel şartı |
| Hono | Hono | Ürün planında açıkça isteniyor |
| React 19 + TanStack Router | React 19 + TanStack Router | Router kalır; sunucu durumu Nanostores'a taşınır |
| TanStack Query | **Nanostores** (`nanostores` 1.5.5, `@nanostores/react` 2.0.1) | İstemci/sunucu durumu atomik store'larda |
| Kumo | **Bejamas UI** (`bejamas` CLI 0.6.0) | Astro-native; React admin için kopyalanmış primitives + aynı token'lar |
| Tiptap 3 | **Lexical 0.52** (`lexical`, `@lexical/react`, `@lexical/markdown`, …) | Blok = Lexical node + şema + renderer |
| Portable Text + MDX dönüştürücü | `@wuppy/markdown` | Wuppy'de MDX **kaynak format**; Lexical JSON ara model |
| Kysely + SQLite/PG/D1 | Aynı, opsiyonel | Wuppy'de DB zorunlu değil |
| Yerel FS + S3/R2 | `@wuppy/core/storage` | Wuppy'de medya depolama; R2 adaptörde |
| — (EmDash'te yok) | `@wuppy/git` | Wuppy'nin ana farkı: dosya + Git |
| Özel auth (`@emdash-cms/auth`) | **Better Auth 1.7.11** + Kysely adaptörü | Passkey, OAuth, magic link, 2FA, organization/access hazır |
| workerd/Miniflare sandbox | `@wuppy/cloudflare` | Opsiyonel adaptör; core'da import yasak |
| Vitest + Playwright + axe | Aynı | Test yaklaşımı birebir izlenecek |
| Lingui + Lunaria | Aynı | Çok dilli admin |
| Changesets + pnpm workspace | Aynı | Sürüm yönetimi |
| Starlight | Starlight | Dokümantasyon |
| Cloudflare Workers | **Opsiyonel** | Wuppy'de Node.js birincil; core bağımsız |
| AT Protocol / registry / x402 | Kapsam dışı (şimdilik) | Wuppy'nin P0/P1 hedefi değil |

---

## 19. Dikkat edilmesi gereken noktalar

1. **EmDash veritabanı merkezlidir.** İçerik `ec_*` tablolarında yaşar; Wuppy'de
   kaynak dosya, DB yalnızca indeks olacaktır. Teknoloji seçimi aynı olsa bile
   veri akışı terstir.
2. **Cloudflare ağırlığı yüksektir.** Kumo, Workers, D1, R2, workerd, Hyperdrive
   ve Worker Loader birlikte gelir. Wuppy'de yalnızca `@wuppy/cloudflare`
   adaptöründe yaşar; `packages/core` bu importları **edemez**.
3. **AT Protocol / registry / x402 katmanı** EmDash'in pazar yeri vizyonudur;
   Wuppy ilk sürümde buna ihtiyaç duymaz.
4. **Editör yaklaşımı değişiyor.** EmDash'in geniş Tiptap uzantı seti yerine
   Lexical'ın daha küçük çekirdeği kullanılacak. Blok şeması + Lexical node +
   renderer üçlüsü korunmalı, aksi halde bloklar yayınlanamaz hale gelir.
5. **Bejamas UI Astro-native'dir.** React admin doğrudan Astro bileşeni
   tüketemez; `packages/admin/src/ui/` altında aynı token'larla kopyalanmış
   React primitives'leri tutulur.
6. **Test disiplini teknolojiden önemlidir.** Gerçek SQLite/Git/dosya sistemi,
   mock'suz DB, tarayıcı modu, a11y ve görsel regresyon birlikte çalışır.
7. **Sürümler hızlı değişiyor.** Kurulumda EmDash'in `pnpm-workspace.yaml`
   kataloğunu referans al, ancak Wuppy kendi katalogunu sabitlesin.
