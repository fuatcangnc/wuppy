# Wuppy — Mimari Kararlar

Bu dosya, EmDash envanterinden sonra Wuppy için alınan teknoloji kararlarını
ADR (Architecture Decision Record) biçiminde kaydeder. Kararlar değişirse eski
kayıt silinmez; yeni bir ADR ile üzerine yazılır.

| No | Karar | Durum |
| --- | --- | --- |
| ADR-001 | Cloudflare desteklenir, fakat çekirdek bağımlılığı değildir | Kabul |
| ADR-002 | Kimlik doğrulama: Better Auth | Kabul |
| ADR-003 | UI: Astro'da Bejamas UI, React admin'de shadcn/ui | Kabul |
| ADR-004 | İstemci durumu: Nanostores | Kabul |
| ADR-005 | Editör: Tiptap yerine Lexical | Kabul (portable-text ara katmanı ADR-006 ile ertelendi) |
| ADR-006 | P0'da Markdown doğrudan kaynak; portable-text katmanı ertelendi | Kabul |
| ADR-011 | Çoklu site: hub + sunucu tarafı proxy; uzak Git'e dokunulmaz | Kabul |
| ADR-012 | AI ajans katmanı: araçlar hub'ın kendi REST API'sine iç istek; OpenAI uyumlu sağlayıcı | Kabul |
| ADR-013 | Site bakımı: hub içi zamanlayıcı, dıştan tarama, gerçek veriden rapor, PDF = tarayıcı yazdırma | Kabul |

---

## ADR-001 — Cloudflare opsiyonel adaptördür

### Bağlam

EmDash; Cloudflare Workers, D1, R2, Hyperdrive, workerd, Worker Loader ve
`@cloudflare/kumo` üzerine güçlü bir bağ kurmuştur. Wuppy'nin konumlandırması
ise "tek hosting sağlayıcısına bağımlı olmayan, Node.js üzerinde çalışan" bir
CMS olmaktır.

### Karar

1. **Varsayılan çalışma zamanı Node.js'tir.** `node:sqlite`, yerel dosya
   sistemi ve gerçek Git ile sıfır konfigürasyonla çalışır.
2. **Cloudflare bir adaptördür.** `@wuppy/cloudflare` paketi D1, R2 ve Workers
   runtime eşlemelerini sağlar; isteğe bağlı kurulur.
3. **Çekirdek Cloudflare'i bilmez.**
   - `wuppy` (core) paketi `@wuppy/cloudflare`'e bağımlı olamaz.
   - `packages/core/src/**` içinde `cloudflare:*`, `@cloudflare/*`,
     `wrangler`, `kysely-d1` import edilemez.
   - Platform farkları `StorageAdapter`, `DatabaseDialect`, `GitAdapter` ve
     `RuntimeAdapter` arayüzlerinin arkasında kalır.
4. **Cloudflare'e özgü özellikler opsiyoneldir.** Sandbox eklentiler workerd
   gerektiriyorsa bu, `@wuppy/cloudflare` içinde yaşar; Node.js tarafında
   süreç tabanlı veya devre dışı bir sandbox adaptörü kullanılır.
5. **Testler iki profilli olur.** `pnpm test` Node/SQLite ile çalışır;
   `pnpm test:workerd` yalnızca adaptör paketinde koşar.

### Sonuçlar

- `templates/*-cloudflare` ve `demos/cloudflare` opsiyonel doğrulama ortamlarıdır;
  P0 kabul ölçütü değildir.
- CI'da mimari sınır testi bulunur: core bağımlılık grafiğinde Cloudflare paketi
  görünürse iş başarısız olur.
- Cloudflare kullanıcısı aynı içerik dosyalarını ve aynı admin'i kullanır;
  yalnızca adaptör değişir.

---

## ADR-002 — Kimlik doğrulama: Better Auth

### Bağlam

EmDash; passkey, OAuth, magic link, oturum, davet, RBAC ve API token'larını
kendi `@emdash-cms/auth` paketinde `@oslojs/*`, `arctic` ve `jose` üzerine
kurmuştur. Wuppy'de aynı güvenlik seviyesini daha az özel kodla sağlamak
gerekiyor.

### Karar

- **Çekirdek:** [`better-auth`](https://better-auth.com) `1.7.11`.
- **Veri erişimi:** Better Auth'un Kysely adaptörü. Wuppy'nin mevcut Kysely
  katmanıyla aynı bağlantıyı paylaşır.
- **Depolama:** Varsayılan `node:sqlite`; Cloudflare'de D1 adaptörü
  (`@wuppy/cloudflare`).
- **Kullanılacak Better Auth yetenekleri:**
  - E-posta/parola, e-posta doğrulama
  - Passkey (WebAuthn)
  - Magic link
  - OAuth / sosyal sağlayıcılar
  - İki faktörlü doğrulama (2FA)
  - Oturum yönetimi, çoklu oturum
  - Organization + Access plugin'leri (rol/izin)
  - Admin plugin'i (kullanıcı yönetimi)
  - Bearer token (API/CLI)
- **`packages/auth`**, Better Auth'u saran ince bir yapılandırma paketidir;
  kendi kripto/protokol implementasyonunu yazmaz.

```
packages/auth/
├── src/config/        createAuth() ve ortam yapılandırması
├── src/adapters/      Kysely/SQLite/D1 adaptör seçimi
├── src/plugins/       admin, organization/access, magic-link, passkey, 2FA
├── src/permissions/   Wuppy izin haritası (content:edit_own, schema:manage…)
├── src/hooks/         audit log, ilk kullanıcı, davet sonrası işler
└── tests/
```

### Sınırlar

- Admin istemcisi `better-auth/client` (ve React için `better-auth/react`)
  kullanır; oturum durumu Nanostores'a bağlanır.
- İçerik dosyaları ile kimlik veritabanı ayrıdır. Auth tabloları içerik
  dizinine yazılmaz.
- Wuppy'nin kendi izin adları Better Auth rollerine eşlenir; route'lar yine
  `requirePerm()` ile kontrol eder.
- Better Auth'un kendi `nanostores` bağımlılığı vardır; ADR-004 ile çakışmaz,
  aynı yöndedir.

### Sonuçlar

- `@oslojs/crypto`, `@oslojs/webauthn`, `arctic` ve doğrudan `jose` kullanımı
  Wuppy çekirdeğinden çıkar.
- Özel auth kodu ve güvenlik yüzeyi küçülür.
- Better Auth sürüm yükseltmeleri takip edilir; büyük sürümlerde geçiş notu
  yazılır.

---

## ADR-003 — UI: Astro'da Bejamas UI, React admin'de shadcn/ui

### Bağlam

EmDash admin paneli `@cloudflare/kumo` tasarım sistemine bağlıdır. Wuppy'de
Cloudflare bağımlılığı istenmiyor; tasarımın markaya ait, kopyalanabilir ve tek
noktadan değiştirilebilir olması isteniyor.

### Karar

- **Kumo kaldırılır.** `@cloudflare/kumo` hiçbir Wuppy paketinde bulunmaz.
- **Astro yüzeyleri:** [Bejamas UI](https://ui.bejamas.com) bileşenleri
  (`npx bejamas add <component>`) doğrudan kopyalanır.
- **React admin:** [shadcn/ui](https://ui.shadcn.com) bileşen yapısı kullanılır.
  Bileşenler `packages/admin/src/components/ui/` altında kopyalanmış ve
  sahiplenilmiştir; kara kutu paket bağımlılığı yoktur.
- **Tek global tema:** shadcn token sözleşmesi (`--background`, `--foreground`,
  `--primary`, `--primary-foreground`, `--muted`, `--border`, `--radius` …)
  `packages/admin/src/styles.css` içinde tanımlıdır. Renk/radius yalnızca
  `packages/admin/src/stores/theme.ts` üzerinden değişir; hiçbir bileşen kendi
  rengini veya radius'unu tanımlamaz.

| Katman | UI kaynağı |
| --- | --- |
| Astro şablonları (`templates/*`) | Bejamas UI bileşenleri |
| React admin SPA | shadcn/ui primitives (`components/ui/*`) |
| Ortak tasarım | shadcn CSS değişkenleri + Tailwind v4 |
| Editör | Lexical; shadcn token'ları |

### Kurallar

- Renkler, yarıçap, tipografi ve boşluk yalnızca global token'lardan gelir; ham
  renk (`bg-blue-500`, `rounded-[7px]` gibi) kullanılmaz.
- Yeni bir bileşen gerekirse önce shadcn/ui registry'sinde aranır; yoksa
  `components/ui/` altına shadcn sözleşmesine uygun eklenir.
- Tema `light-dark()` ve CSS değişkenleriyle kurulur; `dark:` öneki yazılmaz.
- RTL için mantıksal sınıflar (`ms-*`, `me-*`, `start-*`, `end-*`) zorunludur.
- Tüm sayfalar `packages/admin/src/ui/index.tsx` üzerinden tüketir; sayfa içinde
  tek seferlik buton/input/dialog yazılmaz.

### Sonuçlar

- Cloudflare'e ait tek UI bağımlılığı kalkar.
- Renk/radius tek noktadan değişir; tüm panel aynı anda güncellenir.
- Astro ve React yüzeyleri aynı görsel dili paylaşır.

---

## ADR-004 — İstemci durumu: Nanostores

### Bağlam

EmDash admini sunucu durumu için TanStack Query, yönlendirme için TanStack
Router kullanır. Wuppy'de durum yönetiminin küçük, framework'ten bağımsız ve
Astro adalarıyla paylaşılabilir olması isteniyor.

### Karar

- **Durum:** [`nanostores`](https://github.com/nanostores/nanostores) `1.5.5`,
  React bağlaması `@nanostores/react` `2.0.1`, kalıcı tercihler için
  `@nanostores/persistent` `1.3.5`.
- **TanStack Query kaldırılır.** Sunucu verisi `lib/api` istemcisiyle çekilir ve
  Nanostores store'larına yazılır.
- **TanStack Router kalır.** Yönlendirme bir durum yöneticisi değildir; tip
  güvenli rotalar için kullanılmaya devam eder.
- Store'lar `packages/admin/src/stores/` altında alan bazlı yaşar:

```
stores/
├── session.ts      Better Auth oturumu
├── content.ts      içerik listesi, filtre, seçim
├── editor.ts       açık belge, kirli durum, autosave
├── media.ts        seçim, yükleme kuyruğu
├── git.ts          commit/diff görünümü
├── ui.ts           tema, sidebar, bildirimler
└── index.ts        ortak yardımcılar
```

### Kurallar

- Store'lar atomiktir; tek dev bir store yazılmaz.
- Türetilmiş değerler `computed()` ile yapılır, bileşen içinde tekrar
  hesaplanmaz.
- Sunucu isteği yapan store, yükleme/hata durumunu kendi tutar; bileşen
  `useStore()` ile okur.
- Optimistic güncelleme store'da yapılır, hata durumunda geri alınır.
- Testler store'u doğrudan çağırır; React render'ı gerekmez.

### Sonuçlar

- Daha küçük paket, daha az sağlayıcı katmanı.
- Astro adaları ile admin arasında store paylaşımı mümkün.
- Query cache'in otomatik yeniden deneme/invalidation davranışı elle yazılır;
  bu davranış `lib/api` içinde merkezileştirilir.

---

## ADR-005 — Editör: Tiptap yerine Lexical

### Bağlam

EmDash, Tiptap 3 / ProseMirror üzerine geniş bir uzantı seti kurmuştur.
Wuppy'de editörün daha küçük çekirdekli, React ile doğal çalışan ve MDX
serileştirmesiyle uyumlu olması isteniyor.

### Karar

- **Editör:** [`lexical`](https://lexical.dev) `0.52.0` +
  `@lexical/react` `0.52.0`.
- Kullanılacak Lexical paketleri:
  - `@lexical/rich-text`, `@lexical/plain-text`
  - `@lexical/history` (undo/redo)
  - `@lexical/markdown` (Markdown kısayolları ve serileştirme)
  - `@lexical/list`, `@lexical/table`, `@lexical/link`, `@lexical/code`
  - `@lexical/selection`, `@lexical/utils`, `@lexical/html`
  - `@lexical/yjs` + `yjs` (işbirliği, P2)
- **Tiptap ve tüm `@tiptap/*` bağımlılıkları kaldırılır.**
- **Blok modeli:** Lexical düğümü ↔ taşınabilir içerik ↔ MDX. Her blok üç
  parçadan oluşur:
  1. Lexical node sınıfı (`packages/blocks/src/lexical/`)
  2. taşınabilir içerik şeması (`packages/blocks/src/blocks/`)
  3. Astro renderer'ı (`packages/blocks/src/elements/` veya ilgili bileşen)
- **MDX dönüşümü:** `@wuppy/markdown` içinde
  `mdx ↔ lexical JSON ↔ portable text` gidiş-dönüşü test edilir.
- **Kod blokları:** `@lexical/code` + highlight.js/lowlight veya Shiki;
  render tarafı site temasına bırakılır.

```
packages/markdown/src/
├── mdx/            MDX ayrıştırma
├── lexical/        Lexical JSON ↔ portable text
├── portable-text/  ara model
├── remark/         remark/rehype eklentileri
└── serialize/      portable text → MDX
```

### Kurallar

- Editör belgesi DOM veya HTML değildir; Lexical JSON veya taşınabilir içerik
  ağacıdır.
- Yeni blok eklemek üç parçanın tamamını gerektirir; eksik blok yayınlanamaz.
- MDX'te bilinmeyen düğümler korunur; editör bunları silmez.
- Otomatik kaydetme taslak üretir; yayınlama ayrı eylemdir.
- Editör testleri gerçek tarayıcıda (Vitest browser mode) koşar; klavye ve
  erişilebilirlik ayrıca doğrulanır.

### Sonuçlar

- Tiptap uzantı yığını ve ProseMirror bağımlılığı kalkar.
- Lexical'ın Markdown serileştirmesi Wuppy'nin dosya tabanlı modeliyle doğal
  uyum sağlar.
- Blok ekosistemi Tiptap'a göre daha gençtir; blok bileşenlerini kendimiz
  yazacağız.
- İşbirliği (Yjs) P2'ye ertelenir; mimari buna açık kalır.

---

## ADR-006 — P0'da Markdown doğrudan kaynak, portable-text ertelendi

### Bağlam

ADR-005 `mdx ↔ lexical JSON ↔ portable text` üçlüsünü öngörüyordu. P0 hedefi
"içerik CMS kalksa da okunabilir Markdown/MDX kalsın"dır. Ara katman, round-trip
kaybı riski ve bakım yükü getirir; P0 için gerekmez.

### Karar

- Editör `@lexical/markdown` ile **Markdown metnini** okur/yazar (`packages/admin/src/lib/markdown.ts`).
- Dosya = tek doğruluk kaynağı. Editör yalnızca `body` string'ini üretir.
- MDX `import`/JSX satırları editörde düz paragraf olarak korunur
  (`tests/markdown.test.ts` kanıtlar); görsel blok düzenleme sonraya kalır.
- `packages/markdown` ve `packages/blocks` P1'e ertelendi. Blok/Astro bileşeni
  desteği geldiğinde bu ADR yeniden açılır ve ara model orada kararlaştırılır.

### Sonuçlar

- Daha az kod, kayıpsız dosya.
- Zengin blok (galeri, grafik) P1'e kadar yok; JSX kullanıcıya ham görünür.
- Geri alma yolu: ADR-005'teki üçlü modele geçiş; dosya formatı değişmez.

---

## ADR-007 — Revizyonlar Git'tir; otomatik kaydetme revizyon değil kurtarma kopyasıdır

### Bağlam

Her kayıt zaten bir Git commit'i (ADR-001). "Otomatik kaydetme revizyonları",
"revizyon saklama politikası" ve "çakışma" maddeleri, veritabanı merkezli CMS'lerin
(`revisions` tablosu) varsayımlarından geliyordu.

### Karar

- **Revizyon = Git commit.** Ayrı bir revizyon tablosu yok. Liste: `/api/history`,
  eski sürüm + alan bazlı özet: `/api/revisions/:collection/:sha/:slug`.
- **Otomatik kaydetme commit atmaz.** Düzenleyici duraklayınca `.wuppy/autosave/` altına
  entry başına tek bir kurtarma kopyası yazar; gerçek kayıtta silinir. Böylece
  "otomatik" ve "kullanıcı" revizyonları karışmaz, geçmiş kirlenmez.
- **Saklama politikası yok:** Git geçmişi budanmaz (geçmişi yeniden yazmak ADR-001'in
  "hiçbir şey kaybolmaz" sözüyle çelişir). Depo boyutu sorunu `git gc`/shallow clone
  ile operasyonel olarak çözülür.
- **Çakışma:** `ETag`/`If-Match`; uyuşmazlıkta `409 CONFLICT` + sunucudaki sürüm döner.
  Üstüne, kimin düzenlediğini söyleyen tavsiye niteliğinde bir kilit vardır
  (`/api/locks`, bellekte, 60 sn'de sona erer).

### Sonuçlar

- Daha az kod ve tek doğruluk kaynağı.
- Kilit tek süreçlidir; çoklu örnekte yalnızca etag koruması geçerlidir.
- Geri alma yolu: DB adaptörü gelirse revizyonlar oraya taşınabilir; dosya formatı değişmez.

---

## ADR-008 — Eklenti paketleri: Ed25519 + sha256 sabitleme; tek sürücü (QuickJS-WASM)

### Bağlam

`plugin-registery.md` Sigstore imzası, kilit dosyası, çoklu güven kökü ve ikinci bir
sürücü (workerd/süreç) öngörüyordu.

### Karar

- **İmza:** Sigstore (OIDC + şeffaflık günlüğü) harici hizmetlere bağlıdır; ilk sürümde
  **Ed25519 ayrık imza** kullanılır. İmzalanan mesaj `<id>@<sürüm>:<sha256>`'dır; sha256
  `manifest.json` + `plugin.js` üzerindendir. Her registry kendi `publicKeys` listesini
  taşır (çoklu güven kökü). Anahtarı olan registry'de imzasız paket kurulmaz.
- **Kilit:** kurulumda sha256 `.wuppy/data/plugin-state.json`'a yazılır; dosyalar sonradan
  değişirse eklenti yüklenmez.
- **Onay:** yetenek hash'i (parse edilmiş `capabilities`) değişirse yeniden onay gerekir.
  Sonradan eklenen yetenekler boşken hash'e girmez; eski onaylar geçerli kalır.
- **Sürücü:** yalnızca QuickJS-WASM. `node --permission` + `vm` ile "ikinci sürücü"
  eşdeğer yalıtım vermez (ağ erişimi ve `vm` kaçışları), bu yüzden eklenmedi.
  Gerçek bir ikinci sürücü (workerd) gerektiğinde conformance paketi `host.ts`
  testlerinden çıkarılır.

### Sonuçlar

- Sigstore'a geçiş yalnızca `verifySignature` ve `pack` komutunu değiştirir.
- Geri alma yolu: imza doğrulamasını registry başına kapatmak için `publicKeys: []`.

---

## ADR-009 — Byline şeması ve içerik tipleri `.wuppy/data/*.json` dosyalarında yaşar

### Bağlam

Byline özel alanları ve yönetici arayüzünden eklenen içerik tipleri için bir kaynak gerekiyordu: config dosyası mı, DB mi?

### Karar

İkisi de `.wuppy/data/byline-schema.json` ve `content-types.json` dosyalarında tutulur (`JsonStore`, her yazma bir Git commit'i). Config dosyasındaki koleksiyonlar kodla yönetilir ve aynı adlı arayüz tanımının üzerine yazılır. Byline değerleri `extra` altında saklanır; `PUT /api/data/bylines` şemayı doğrular (422), `GET /api/bylines/issues` mevcut ihlalleri listeler.

### Sonuçlar

Şema değişimi Git geçmişinde görünür ve geri alınabilir. Şema sonradan sıkılaşırsa eski kayıtlar silinmez, yalnızca raporlanır.

## ADR-010 — Çeviri grubu slug kuralıdır; açık `translationOf` alanı yok

### Bağlam

Aynı içeriğin dil sürümlerini eşleştirmek için iki yol vardı: slug kuralı (`en/hello`, `tr/hello`) ya da her çeviride kaynağı gösteren bir `translationOf` alanı.

### Karar

Slug kuralı kullanılır. Eşleştirme dosya adından çıkar, ayrı bir alan tutulmaz; bu yüzden kaynak ile çeviri birbirinden kopamaz ve Git'te yeniden adlandırma tek yerde yapılır. Dil değiştirici (`localeSwitcher`), yedek dil (`resolveLocale`) ve `hreflang` (`hreflangAlternates`) aynı kuraldan beslenir; yalnızca gerçek çeviriler `hreflang` alır.

### Sonuçlar

Dil öneki olmayan eski slug'lar çeviri grubuna girmez. Sonradan açık eşleştirme gerekirse `translationOf` ek bir kaynak olarak eklenebilir; bu karar o zaman güncellenir.

## ADR-011 — Çoklu site: hub + sunucu tarafı proxy, uzak Git'e dokunulmaz

### Bağlam

Bir ajans birden fazla Wuppy sitesini tek panelden yönetmek ve müşterilerine yalnızca kendi sitelerine erişim vermek istiyor (getdollie, uiXpress benzeri). Seçenekler: tarayıcının her siteye doğrudan bağlanması (CORS, her sitede ayrı oturum, token tarayıcıda), merkezi bir veritabanı ya da hub'ın sunucu tarafında proxy yapması.

### Karar

Bu kurulum **hub**'dır (switcher'da "Local"). Uzak siteler kendi Wuppy'sini çalıştırmaya devam eder; hub onlarla yalnızca uzak `/api/*` üzerinden, uzak adminin oluşturduğu `kind=hub` token ile konuşur.

- Tarayıcı yalnızca hub ile konuşur; token hub'da AES-256-GCM ile şifreli durur (anahtar `WUPPY_SECRET`'tan HKDF, AAD = site id) ve tarayıcıya hiç dönmez.
- Uzakta etkin izin = token izinleri ∩ token sahibinin **güncel** rolü ∩ `X-Wuppy-Acting-Role`. Hub, isteği yapan kişinin site rolünü bildirir; uzak site bunu tavan olarak kullanır.
- Proxy yalnızca içerik API'sine açıktır (auth, hub, tokens, sites, users, invitations kapalı; `/uploads/*` salt okunur), başlıklar iki yönde allowlist'tir, yönlendirme izlenmez, her istekte SSRF kontrolü yapılır.
- `client` global rolü Local'de hiçbir izin taşımaz; erişim `wuppy_site_members` üyelikleriyle verilir. Site admini yalnızca hub admini olabilir.
- Uzak sitenin Git'i ve dosyaları hub tarafından doğrudan değişmez; her yazma uzak sitenin kendi API'sinden geçer, commit'i uzak site atar.

### Sonuçlar

Uzak sitede güvenlik sınırı değişmez: hub ele geçirilse bile token'ın izinlerinden fazlasını yapamaz ve token uzaktan iptal edilebilir. Bedeli: uzak siteler hub'dan erişilebilir olmalıdır, hub her istekte bir ağ atlaması ekler, uzak rate limit token sahibine göre tüm hub kullanıcılarınca paylaşılır. `WUPPY_SECRET` değişirse saklı token'lar çözülemez ve siteler yeniden bağlanmalıdır.

## ADR-012 — AI ajans katmanı: araçlar = kullanıcının kendi API istekleri

### Bağlam

Ajans, yönettiği sitelerle Claude/Cursor gibi araçlardan ve admin içinden sohbetle çalışmak istiyor (Dollie benzeri: MCP, ajanlar, müşteri bağlamı). Risk: modelin, kullanıcının yetkisini aşan işlem yapması, istem enjeksiyonu ve sağlayıcı bağımlılığı.

### Karar

- Her araç (`packages/core/src/mcp/tools.ts`) hub'ın **mevcut REST API'sine iç istek**tir ve isteği yapanın çerezi/token'ı ile gider. İzin, site üyeliği, proxy allowlist'i, SSRF, rate limit ve audit yeniden yazılmaz, aynen uygulanır.
- MCP `POST /api/mcp`: Streamable HTTP, durumsuz, düz JSON yanıt; yalnız `Authorization: Bearer` (bu yüzden CSRF başlığı istenmez). SDK bağımlılığı eklenmedi; üç metod yeterli.
- Sohbet sağlayıcısı OpenAI Chat Completions uyumlu herhangi bir uç nokta (`WUPPY_AI_BASE_URL`, `WUPPY_AI_API_KEY`, `WUPPY_AI_MODELS`); yeni bağımlılık yok, `fetch` ile.
- Yazma araçları sohbette yalnız kullanıcı o mesaj için "Allow changes" dediğinde sunulur; taslak aracı her zaman `draft: true`; e-posta yalnız sitenin üyelerine.
- Ajans playbook'u ve müşteri notu `wuppy_context` tablosunda, yalnız `sites:manage` okur/yazar; client görmez.
- Uzak sitenin `/api/ai` ve `/api/mcp` uçları proxy'den kapalı.

### Sonuçlar

- Model, kullanıcının yapamadığı hiçbir şeyi yapamaz; yeni bir yetki modeli yok.
- Sohbet geçmişi saklanmıyor ve yanıt akış (stream) değil; Faz 2.
- MCP token'ı yalnız `users:manage` olan kişiler oluşturabildiği için client'lar MCP kullanamaz (sohbeti kullanabilir).

## ADR-013 — Site bakımı ve AI Faz 2: zamanlayıcı, tarama, rapor, akış, geçmiş

### Bağlam

Dollie'deki uptime izleme, güvenlik taraması, toplu güncelleme, aylık müşteri raporu (PDF), akışlı sohbet, sohbet geçmişi, OpenAI uyumlu API ve çalışma alanlarının Wuppy karşılığı istendi.

### Karar

- **Zamanlayıcı**: hub süreci içinde `setInterval` (saatlik, `.unref()`), yedekleme zamanlayıcısıyla aynı desen. Ayrı kuyruk/cron yok. Uyarı tekrarını önleyen son durum bellekte (yeniden başlatmada bir kez tekrar edebilir).
- **Güvenlik taraması** (`sites/care.ts`): siteye ziyaretçi gibi dıştan bakar, hub token'ını **göndermez**. Açık kurulum (`/api/setup`), dışarı açık özel dosyalar, güvenlik başlıkları, token süresi. Her istek öncesi SSRF kontrolü (`assertSiteAddress`). Bağımlılık açığı taraması sitede yapılamaz (imajda `pnpm` yok); CI'da kalır.
- **Rapor**: yalnız sitenin gerçek verisinden (dashboard, audit, tarama); model yazmaz, sayı uydurulamaz. İsteği yapanın site rolüyle okunur. Aylık e-posta yalnız sitenin **üyesine**; alıcı ayarlandığı ay atlanır, sunucu kapalı kaldıysa ilk fırsatta gönderilir.
- **PDF**: bağımlılık eklenmedi (Türkçe karakterli PDF üretimi font gömmeyi gerektirir). Rapor yazdırılabilir HTML; tarayıcının "Save as PDF"i kullanılır. Aynı HTML e-posta gövdesidir.
- **Toplu güncelleme**: yalnız istemci tarafı döngü, mevcut proxy + registry uçlarıyla. Güncellenen eklenti sitede yeniden onay bekler (yetenek onayı atlanmaz). Çekirdek sürüm güncellemesi imaj/deploy işidir, uygulamanın dışında.
- **Akış**: `POST /api/ai/chat` `stream: true` ile SSE (`text`, `step`, `done`, `error`). Sağlayıcıdan `stream: true` istenir; akış vermeyen sağlayıcının JSON yanıtı da kabul edilir.
- **Geçmiş**: `wuppy_ai_chats`, kullanıcı başına en çok 200, yalnız sahibi okur/siler; başkasının id'si yeni sohbet açar.
- **OpenAI uyumlu API**: `/api/v1/models` (ajanlar) ve `/api/v1/chat/completions`; yalnız Bearer (CSRF başlığı istenmez), **salt okunur** (yazma araçları sunulmaz), sağlayıcı modeli `WUPPY_AI_MODELS`'ın ilki.
- **Çalışma alanı**: kod/tema geliştirme ortamı kurulmadı. Karşılığı: siteye bağlı kayıtlı sohbet + o sohbette ajanın yaptığı taslak/düzenlemelerin listesi; kişi editörde açıp inceler ve yayınlar.

### Sonuçlar

- Yeni bağımlılık yok. Birden çok hub süreci çalışırsa uyarı/rapor işleri her süreçte çalışır (rapor `last_sent` ile tekrarlanmaz, uyarı tekrarlanabilir).
- Uzak sitenin açık kurulumu ve sızan dosyalar hub'dan saatlik izlenir.

## ADR-014 — Dokümantasyon: Starlight, İngilizce ana dil + Türkçe eş, tek adres değişkeni

### Bağlam

Her özelliğin kullanıcı dokümanı olmalı; şimdilik `docs.cigce.com.tr`, sonra wuppy alan adı.

### Karar

- `docs/` bir workspace paketi (`@wuppy/docs`, private): Astro + Starlight, arama Pagefind (Starlight'ın kendi).
- Dil: kök (`/`) İngilizce, `/tr/` Türkçe. Her İngilizce sayfanın `tr/` altında eşi olmak zorunda;
  `scripts/check-locales.mjs` paketin `test` betiği, `pnpm test` eksik çeviride düşer.
- Adres yalnız `DOCS_SITE` ortam değişkeninde (varsayılan `https://docs.cigce.com.tr`). Alan adı değişince:
  `DOCS_SITE` ile derle, Caddy bloğunun adını değiştir, DNS kaydı ekle.
- Yayın: statik `docs/dist` → sunucuda `/opt/wuppy/docs` (rsync), Caddy `file_server` (`./docs:/srv/docs:ro`).
- Yeni özellik = aynı değişiklikte EN + TR doküman sayfası (CLAUDE.md kuralı).

### Sonuçlar

- Yeni bağımlılık: `@astrojs/starlight` (yalnız docs paketinde, ürüne girmez).
- Geri alma: Caddyfile/compose `.bak-docs` yedekleri, Route 53'te `docs` A kaydını sil.

## ADR-015 — Başlangıç teması: astrojs-boilerplate tasarımı, Tailwind CSS 4 + bejamas/ui

### Bağlam

Yeni siteler her zaman aynı tasarımla kurulmalı. Wuppy sitelerinin yığını her zaman **Tailwind 4 + bejamas** olmalı (kullanıcı kararı, 2026-10-21). Kaynak tasarım `templates/astrojs-boilerplate` (bir müşteri sitesi: npm kilidi, müşteri içeriği).

### Karar

- Tasarım `templates/starter`a taşındı (create-wuppy, Docker ve e2e bunu kullanıyor). Görsel dil: koyu üst şerit, kaydırınca koyulaşan yapışkan kutulu başlık, hero, numaralı kartlar, eğik turuncu kenarlı CTA, koyu footer, Space Grotesk, `#dd641e`, keskin köşe (`--radius-*: 0`).
- Yığın: `tailwindcss` + `@tailwindcss/vite`, `tw-animate-css`, `bejamas/tailwind.css`. bejamas bileşenleri `src/ui/` altında: `button`, `navigation-menu`. `cn()` `src/lib/utils.ts` dosyasında (`clsx` + `tailwind-merge`, `cva`). `components.json` ve `@/*` alias'ı var. Bileşenler `npx bejamas add` ile eklenir.
- `bejamas` paketi (CLI; shadcn CLI'yi çeker) yalnız `devDependencies`'te durur, çünkü çalışma anında yalnız CSS'i lazım. `msw` build betiği kapalı (`allowBuilds: msw: false`).
- NavigationMenu, boilerplate'teki `public/scripts` ön-derlemesi yerine Astro'nun paketlediği `<script>` ile `@data-slot/navigation-menu` başlatır.
- Yeni bağımlılıklar pnpm catalog'una ve create-wuppy `VERSIONS`'a eklendi. Scaffold testi her `catalog:` bağımlılığının catalog sürümüyle aynı olmasını denetler; `latest`'e düşmez. create-wuppy artık `devDependencies`'i de çevirir.
- İçerik markadan bağımsız. Ad, açıklama, logo ve dil **Settings**'ten gelir. Menüler `header`/`footer` konumundan, kutular `footer` widget alanından okunur. Fontlar (OFL) `public/fonts/` altında.
- Boilerplate klasörü silinmedi. Workspace'ten (`!templates/astrojs-boilerplate`), oxlint ve prettier'dan dışlandı.

### Sonuçlar

- Wuppy bağlantıları korundu: SEO head, JSON-LD, yorumlar, satır içi başlık, önizleme, "Edit this page", RSS, arama, skip link. E2E 14/14.
- Her yeni site kurulumunda bejamas CLI'nin bağımlılıkları da (dev) iner.
- Geri alma: starter'daki `src/`, `public/fonts/`, `package.json` ve `astro.config.mjs` değişikliklerini, catalog girdilerini ve `VERSIONS`'ı geri al.

## ADR-016 — Mevcut Astro projesini sarmak: `wuppy init` / `wuppy import` ve anında yayın (canlı içerik)

### Bağlam

Mevcut bir Astro sitesi (Git deposunda, içerik md/mdx) Wuppy ile git-CMS gibi yönetilebilmeli; içerik taşınmadan, tasarım değişmeden (kullanıcı isteği, 2026-10-21). Wuppy zaten içeriği dosya + Git commit olarak tutuyor.

### Karar

- `wuppy init` (`packages/core/src/cli/init.ts`): `src/content.config.ts` içindeki `defineCollection` + `glob({ base, pattern })` tanımlarını regex ile okur (Astro'yu çalıştırmaz). md/mdx koleksiyonları alınır; JSON/YAML ve uzak loader'lar atlanır. Alan tipleri frontmatter değerlerinden tahmin edilir, her dosyada olan alan `required`. Rota, `getCollection("<ad>")` çağıran `[slug]`/`[...slug]` sayfasından bulunur.
- `astro.config` metin olarak yamanır (`wuppy()` + adapter yoksa Node adapter). Tanınmayan biçimde dosyaya dokunulmaz, elle adım yazdırılır. Var olan `wuppy.config.mjs` `--force` olmadan ezilmez.
- `wuppy import <url> <dir>`: `git clone -- url dir` (`-` ile başlayan argüman reddedilir), sonra `init`.
- `wuppy import` (adres yok): GitHub'dan seçim. `gh api graphql` ile kullanıcının depoları (sahip/katkıcı/organizasyon) ve kökteki `package.json` tek sorguda (100'lük sayfalar) alınır, Astro bağımlılığı olanlar numaralı listelenir, seçilen `gh repo clone` ile klonlanır. Kimlik doğrulama `gh`'ye bırakıldı: özel depolar çalışır, Wuppy token saklamaz. Monorepo alt klasörleri listelenmez.
- Entegrasyon seçenekleri `wuppy({ sitemap, robots, rss })`: site zaten sunuyorsa Wuppy rotası eklenmez. `init` bunları `@astrojs/sitemap`, `public/robots.txt` ve `src/pages/rss.xml*` varlığından açar/kapatır.
- Sunucu depoya push etmez (kullanıcı 2026-10-21 reddetti: "sunucu depoya push etmesin, anında yayın olmalı"). Commit'ler sunucudaki yerel depoda kalır; ilk sürümdeki `push` ayarı ve `RealGit.push` kaldırıldı.
- Anında yayın (`packages/core/src/astro/live-content.ts` + `live-runtime.ts`, `wuppy({ live })`, varsayılan açık): Vite eklentisi sayfaların `astro:content` importunu bir ara modüle çevirir. Wuppy koleksiyonlarında `getCollection`/`getEntry` dosyaları diskten okur; değişmeyen dosya (digest aynı) derlenmiş girdiyi döndürür, değişen `.md` sitenin şemasıyla doğrulanır ve Astro'nun satteri işleyicisiyle çizilir (native binding yüzünden runtime'da Astro paketinden yüklenir). Şema hatasında son iyi sürüm sunulur.
- `astro:content` okuyan sayfalar `prerender=false` olur. `getStaticPaths` olan `.astro` sayfaları sarmalanır: her istekte çağrılır, eşleşen yolun props'u verilir, yoksa 404 (sitenin 404 sayfası). `paginate` Astro uyumlu yeniden yazıldı. Sayfa önbelleği HEAD'e bağlı olduğu için ek iş değişiklik başına bir kez.
- Astro 7 live collections kullanılmadı: sitenin sayfa kodunu (`getLiveCollection`) değiştirmeyi gerektirir; sarmalamanın amacı siteye dokunmamak.
- Frontmatter `lineWidth: 0` ile yazılır: başkasının deposunda bir alan düzenlemesi diğer satırları katlamasın.
- `@wuppy/auth` önce `reflect-metadata`'yı yükler: Astro 7.4.1 paketlemesinde polyfill tsyringe kontrolünden sonra geliyordu ve sunucu 500 veriyordu.

### Sonuçlar

- Kanıt: `templates/astrojs-boilerplate` kopyası (`output: "static"`) sarıldı, derlendi; admin API ile düzenlenen başlık/gövde ve yeni yazılar yeniden derlemeden public sayfada ve listede göründü, olmayan yol sitenin 404'ünü verdi. Starter'da dosya ekle/düzenle/sil canlı. e2e `first-post` bunu doğrular.
- Sınırlar: MDX gövdesi derleme ister (veri canlı); düzenlenen girdide `image()` alanı string; remark/rehype eklentileri ve göreli görseller canlı çizimde yok; `getStaticPaths`'li endpoint'ler (RSS) prerender kalır; `@astrojs/sitemap` yalnız prerender sayfaları listeler; derlemede zararsız "getStaticPaths() ignored" uyarısı.
- Tip tahmini kaba (select/reference/taxonomy üretmez); config elle iyileştirilir.
- Geri alma: `init.ts`, CLI kaydı, entegrasyon seçenekleri; canlı içerik için `wuppy({ live: false })` ya da iki `live-*` dosyası.

## ADR-017 — GitHub deposunu tema olarak kurmak (Admin → Themes)

### Bağlam

Kullanıcı (2026-10-21): "admin ui'da da seçim olabilmeli, Themes menüsünde GitHub repository gözüküp onu seçebilmeliyiz". Seçilen depo bu sitenin teması olmalı (kullanıcı seçimi); GitHub bağlantısı OAuth ile (kullanıcı seçimi, token girme değil).

### Karar

- GitHub bağlantısı OAuth web akışıyla: "Connect GitHub" → `/api/themes/github/connect` → GitHub izin sayfası (`repo` kapsamı: tüm depolar) → `/api/themes/github/callback` kodu secret ile token'a çevirir. `state` sunucuda, başlatan kullanıcıya bağlı, tek kullanımlık, 10 dk. Uygulama: `GITHUB_CLIENT_ID` sabiti (Wuppy'nin uygulaması, client id public) veya `WUPPY_GITHUB_CLIENT_ID`; secret yalnız `WUPPY_GITHUB_CLIENT_SECRET` ortam değişkeninde, kodda değil. Önce Better Auth `linkSocial` denendi (GitHub ile giriş anahtarlarını ve e-posta eşleşmesini istiyordu), sonra device flow (kullanıcı: "kod ile yapmasın, oauth ile tüm repositorylere izin verenle yapsın"); ikisi de bırakıldı. Bedeli: bir OAuth uygulamasının tek callback alan adı var, her alan adı için ayrı uygulama ya da secret gerekir. Token kullanıcı başına `wuppy_github_tokens` tablosunda, `seal` (AES-GCM, WUPPY_SECRET, aad = kullanıcı id); tarayıcıya gitmez. `encryptOAuthTokens: true` (GitHub ile giriş token'ları için) kaldı.
- Liste: GitHub GraphQL, tek sorguda depo + kök `package.json` (CLI'daki `wuppy import` ile aynı `REPOS_QUERY`/`astroOnly`).
- Kurulum (`packages/core/src/themes/github.ts`): `.wuppy/themes/<sahip>__<ad>/` içine klon (token argv'de değil, `GIT_CONFIG_*` ortamında), `init`, `.env` silinir, `wuppy` bağımlılığı çıkarılıp sunucudaki Wuppy'ye symlink, `npm install --include=dev`, `astro build --config astro.wuppy.config.mjs`. Bu dosya sitenin config'ini Node adapter'ıyla ve `ssr.noExternal: true` ile sarar: Wuppy'nin bağımlılıkları (zod, better-auth) dışarıda kalırsa deponun farklı sürümlerine çözülüyordu (`z.validate is not a function`).
- npm/build ortamı yalnız PATH/HOME/TMPDIR: sunucu sırları deponun betiklerine ve derlemeye gitmez. Yetki `site:settings` (yalnız admin): kurulum deponun kodunu sunucuda çalıştırır.
- Geçiş: `.wuppy/themes/active.json`; `templates/starter/serve.mjs` başlangıçta okur, `chdir` edip temanın `dist/server/entry.mjs`'ini yükler; `WUPPY_AUTH_DB` ile hesaplar ortak, `WUPPY_BASE_ROOT` ile Themes API ana siteyi bilir. Etkinleştirme süreci kapatır (`WUPPY_RESTART=1` yalnız serve.mjs altında); Docker `restart: unless-stopped` yeniden başlatır. Tema başlatılamazsa yerleşik site çalışır. Dockerfile CMD `node serve.mjs`.

### Sonuçlar

- Kanıt: yerelde serve.mjs altında API ile özel `fuatcangnc/astro-boilerplate` (Cloudflare adapter'lı) kuruldu, derlendi, süreç yeniden başladı; tema sayfası, aynı hesapla giriş ve koleksiyon API'si çalıştı; yerleşik siteye geri dönüldü. İlk denemede Cloudflare entry'si yüklenemedi, yedeğe düşme çalıştı.
- Sınırlar: Rebuild GitHub'dan çekmez; tema derlemesi Wuppy sürümünü içine alır (güncellemeden sonra Rebuild); yalnız kök package.json; remote (hub) sitelerde GitHub bağlantısı yok.
- Geri alma: `themes/github.ts`, API rotaları, ThemesPage, serve.mjs + Dockerfile CMD, `encryptOAuthTokens`.

## ADR-018 — MDX her yerde, güvenlik öncelikli

> Durum: Yerini ADR-021 aldı.

### Bağlam

Kullanıcı (2026-10-21): "content types, posts, pages, sections bunlarda mdx özelliği yoksa mutlaka eklemen lazım security öncelikli olarak". Önce starter posts/pages md'ydi (glob yalnız `*.md`, `@astrojs/mdx` yok), bölümler düz metindi, MDX gövdesi yalnız build'de güncelleniyordu.

### Karar

- Denetim (`packages/core/src/mdx/index.ts`): gövde Astro'nun kendi ayrıştırıcısı satteri ile (Astro'nun bağımlılığından, native binding olduğu için çalışma anında) mdast'a çevrilir ve ağaç gezilir. Reddedilenler: import/export, yorum dışı `{ifade}`, listede olmayan PascalCase bileşen ve üye adları, spread, `on*`/`:` içeren yönergeler/`dangerouslySetInnerHTML`/`srcdoc`, JSON olmayan prop değerleri, tehlikeli etiketler, `javascript:`/`vbscript:`/`data:` (resim hariç) URL'ler, ayrıştırılamayan MDX. `.md` gövdelerinde ham HTML aynı etiket/öznitelik/URL kurallarıyla denetlenir. Regex yerine ayrıştırıcı: kod bloklarını yanlış işaretlemez, build'i kıracak MDX'i kayıtta yakalar.
- Koleksiyonlar: dosya adaptörü `.md` ve `.mdx`'i birlikte okur; var olan dosya uzantısını korur, yeni girdi koleksiyon formatını alır, denetim dosyanın formatıyla yapılır. Starter posts/pages `format: "mdx"`, `@astrojs/mdx`, glob `**/*.{md,mdx}`; admin'de yeni içerik tipi varsayılanı `mdx`.
- Bölümler: `PUT /api/data/sections` her gövdeyi MDX olarak denetler (422). `wuppy/mdx` → `mdxContent(source)`: önce aynı denetim, sonra `satteri.evaluate` + `astro/jsx-runtime`, `@astrojs/mdx`'in `Content` sarmalayıcısıyla aynı (Fragment, `components` prop, `mdx-component` işareti, `astro:jsx` renderer).
- Canlı içerik: build'den sonra değişen/yeni `.mdx` girdileri işaretlenir, shim'deki `render()` bunları `mdxContent` ile istek anında derler; değişmeyenler build'in modülünü kullanır. Böylece admin dışında (git) değiştirilen MDX de çalışmadan önce denetlenir.

### Sonuçlar

- Kanıt: starter dev ve production build'de `.mdx` post gösterildi; build sonrası dosya değiştirildi, yeni gövde rebuild olmadan geldi.
- Ek (2026-10-22, kullanıcı: "bunları yap security öncelikli"): `mdxContent` Astro'nun kendi heading-ids ve highlight eklentilerini (`@astrojs/markdown-satteri`) sitenin markdown ayarlarıyla kullanır, `{ Content, headings }` döndürür; istek anında derlenen girdinin başlık id'leri ve `headings` build ile aynı. Widget'lar: custom gövde MDX, HTML gövde md ham-HTML kurallarıyla kayıtta denetlenir (gösterimde sanitize sürer); starter custom widget'ı `mdxContent` ile gösterir. `wuppy init`: `mdx()` + `@astrojs/mdx` ekler, `pattern: "...*.md"` glob'larını `.{md,mdx}` yapar, koleksiyon `mdx` olur, karışık md/mdx koleksiyonların hepsi düzenlenebilir. Bağımlılık güvenliği: hono 4.13.13, vitest 4.1.12, override'lar (postcss-selector-parser, bejamas CLI altındaki hono).
- Sınırlar: `braces` (bejamas CLI > fast-glob, yalnız geliştirme) için yamalı sürüm yayımlanmamış, audit'te 1 high kalır; `wuppy init` daha önce sarılmış projelere MDX eklemez (config'te `wuppy/astro` varsa dokunmaz).
- Geri alma: `mdx/index.ts` + `mdx/render.ts`, adaptör `formatOf`, sections/widgets denetimi, live-content `render`, starter MDX ayarları, `init.ts` MDX yaması.

## ADR-019 — Eklenti hook'ları: önce çalışan (filter) hook'lar, güvenlik öncelikli

### Bağlam

Kullanıcı (2026-10-22): "önce çalışan hook'ları ekle security öncelikli ve emdash'daki hooksları da bizde de olmalı ama review et en mantıklısı ne ise onu yap wordpress'teki action ve filter hook da incele". Wuppy'de yalnız sonra çalışan (action) hook'lar vardı: `onContentUpdated`, `onContentDeleted`, `onMediaUploaded`. EmDash'te `content:beforeSave/Delete/Publish…`, `media:beforeUpload`, `comment:beforeCreate/moderate`, `email:beforeSend/deliver`, `page:metadata/fragments`, `cron`, `plugin:install…` var; öncelik, `errorPolicy` (varsayılan abort), `exclusive` seçenekleri var. WordPress filter'ları her eklentiye tam yetkiyle değeri değiştirme imkânı verir (sandbox yok, öncelik yarışı).

### Karar

- İki tür (`@wuppy/plugin-types`): `ACTIONS` (`on…`, paralel, hiçbir şeyi değiştirmez) ve `FILTERS` (`before…`, sırayla, config sırası). Yeni: `beforeContentSave`, `beforeContentDelete`, `beforeMediaUpload`, `beforeCommentCreate`, `onCommentCreated`.
- Yanıt: hiçbir şey, `{ reject }` (1–500 karakter düz metin, kontrol karakterleri temizlenir) ya da hook'a göre değişiklik. 422 `REJECTED_BY_PLUGIN` / 502 `PLUGIN_ERROR` (ayrıntı yalnız eklenti kaydında).
- Güvenlik: filter'lar capability hash'ine girer (yeni onay; action'lar girmez, eski hash'ler korunur); içerik filter'ı yalnız eklentinin okuyabildiği koleksiyonda çalışır, değiştirmek `content.write` ister; her hata/zaman aşımı/geçersiz yanıt reddeder (fail closed, `errorPolicy` yok — doğrulayıcı hata verdirilerek atlatılamaz); kota filter'ı reddetmez (yorum seli editörü durduramasın), zaman aşımı geçerli; `draft` editörün değerinde kalır (yetkisiz yayın yok); sonuç MDX kuralları + şemadan yeniden geçer; filter içinde `ctx.content.put` yasak (sonsuz döngü); yorum filter'ı e-posta/IP görmez, yalnız sıkılaştırır (approved < pending < spam), hata verirse yorum beklemeye alınır, spam'e bildirim gitmez ve ziyaretçiye "pending" denir. Çöpten geri yükleme artık kayıt denetiminden geçer.
- Bilerek alınmayanlar: e-posta hook'ları (şifre sıfırlama/davet bağlantılarını görürdü), sayfa script/meta hook'ları (public XSS; tema işi), öncelik/exclusive; cron ve yaşam döngüsü hook'ları sonraya.

### Sonuçlar

- Kanıt: `tests/integration/plugin-filters.test.ts` (red, değişiklik, draft koruması, MDX yeniden denetim, fail closed: salt-okur değişiklik/hata/sonsuz döngü/boş neden, görünürlük, kapalı eklenti, içeriden yazma, çöp/geri yükleme, medya, yorum spam/onay engeli/e-posta gizliliği/hata→pending); hash testi.
- Sınırlar: kalıcı çöp silme ve History'de revert filter'dan geçmez; `filtering` sayacı eklenti başına (aynı eklentinin eşzamanlı action yazması da reddedilir).
- Geri alma: `plugin-types` FILTERS/hash, `plugins/host.ts` `filter`, `loader.ts` `filter`, `manager.ts` before* metotları, `ContentService`/`MediaService` seçenekleri, `app.ts` yorum akışı.

## ADR-020 — Görsel editör (wuppy-visual-editor): Instatic uyarlaması, MDX + Git

### Bağlam

Kullanıcı (2026-10-22): "edit with visual dediğinde visual editor moduna geçmeli … Instatic-main incele bunu bizim projeye wuppy-visual-editor olarak entegre et birebir aynısını astro mdx destekli olarak". Instatic (MIT, © David Babinec) Bun/DB/TypeBox/CSS Modules/Yjs üzerine kurulu; Wuppy dosya tabanlı MD/MDX + Git, zod, Better Auth ve Tailwind/shadcn kullanıyor. Birebir altyapı kopyası bu sözleşmeleri bozar; editör deneyimi ve veri modeli uyarlanır.

### Karar

- **Yeni paket `packages/visual-editor` (`@wuppy/visual-editor`)**: CSS değer/selector/query güvenliği, responsive/state override üretimi, Instatic matematiğiyle fluid type/space, renk token'ları, `v-` prefixli utility sınıfları, zod `VisualData` şeması ve `visualCss`/`pageCss` üretimi. Admin ve core aynı paketi kullanır.
- **Admin editörü** (`packages/admin/src/components/visual-editor/`, rota `/admin/v/$collection/$`): Instatic'in `NodeTree` modeli (düz `nodes`, `rootNodeId`, `children` doğruluk kaynağı), insert/delete/move/duplicate/wrap/rename/lock/hide mutasyonları, seçim/hover, sürükle-bırak, inline `contentEditable` metin, snapshot undo/redo (100 adım), clipboard, componentize/detach, component instance/slot, saved layouts, HTML import, favorites/recents ve Spotlight.
- **UI**: sol panel rail (Explorer, Framework, Selectors), Explorer sekmeleri (Layers/Site/Code/Media), katman arama + insert, sağ Properties (class pill'leri, selector modu, context/state, stil grupları, token datalist'leri, component parametreleri, Componentize), Canvas (design/live, breakpoint/condition context selector, zoom/pan, selection toolbar, context menu, iframe portal), Notch, Settings (breakpoint/condition/kısayollar), top toolbar (Add, undo/redo, canlı sayfa, kaydet).
- **Framework**: renk/type/space/font token'ları, fluid clamp üretimi, utility sınıfları; Selectors: ortak CSS selector kütüphanesi; Code: site stylesheet + MDX kaynağı; Media: kitaplıktan ekleme/ görsel değiştirme.
- **Kalıcılık**: sayfa blokları girdinin gövdesine **tek satır** `data-ve="<modül>"` HTML/JSX olarak yazılır; `.md` ve `.mdx` için geçerlidir. Metin karakter referanslarıyla kaçırılır, güvenli olmayan CSS yazılmaz, el yazısı Markdown/komponentler `markdown` düğümü olarak aynen korunur. Kaydetme mevcut içerik API'sinden (yetki, MDX denetimi, before-hook, kilit, ETag, Git) geçer.
- **Site verisi**: framework, selector kütüphanesi, componentler ve layoutlar `.wuppy/data/visual.json` (`dataSchemas.visual`); `GET /api/public/visual.css` ETag/304 ile servis edilir; Astro `visual-middleware` sayfaya CSS linki, fontları ve sayfa başına `<style data-wuppy-visual>` ekler. Kaydetme Git commit'idir.
- **Bilinçli sınırlar (MDX/Git güvenliği)**: form modülleri (sunucu MDX'te `form` yasak), döngü/dinamik binding (MDX ifadesi yok), keyfi script (yasak), Yjs ortak düzenleme (kilit var), AI agent ve npm dependency paneli. Bunlar Wuppy'nin dosya+Git modeliyle çelişir; ileride güvenli Astro komponentleri/veri snapshot'larıyla ayrı ADR olarak ele alınabilir. Template'ler Astro layout'ları olarak kalır.

### Sonuçlar

- Kanıt: `packages/visual-editor/tests/css.test.ts`; `packages/core/tests/integration/visual.test.ts`; `packages/admin/tests/visual-editor.test.ts` (responsive stiller, component/detach, copy/paste, HTML import, Markdown koruma, CSS filtresi); e2e `first-post.spec.ts` (Edit with Visual → Inserter → iframe inline edit → stil → kaydet → canlı sayfa).
- Sınırlar: tuval sayfanın gerçek Astro çıktısını değil aynı HTML ağacını ve sitenin stylesheet'lerini gösterir; bazı Instatic modülleri (form/loop/outlet/SVG) ve eklenti runtime'ı yoktur. MDX gövdesindeki tek satır elle bozulursa blok Markdown olarak korunur.
- Geri alma: `packages/visual-editor`, admin `visual-editor` klasörü, `/v` rotası, core `dataSchemas.visual`/`visual.css`/middleware, Pages/Posts "Edit with Visual" butonu; kaydedilmiş gövdeler düz HTML olduğu için editör kalksa da site render edilir.

## ADR-021 — İçerik yalnız Markdown (`.md`), tasarım `.astro`'da; tema öncelikli geliştirme

> Durum: Yerini ADR-023 aldı (2026-10-23). ADR-018'in yerini almıştı.

### Bağlam

Kullanıcı (2026-10-23): "mdx yerine … .md content dosyalarımız olsa .astro içine zaten content collections ile yazabiliyoruz bu mimari daha mantıklı tüm content özelliklerimiz için bunu yap" ve "themes varsa themes üzerinden olmalı". Code görünümünde sahte `src/pages/*.mdx` + `.wuppy` ağacı ile tema ağacı yan yana çıkıyordu; dev sunucusu (`astro dev` starter'da) aktif temayı yok sayıyordu.

### Karar

- Tüm içerik (post, page, içerik tipleri, sections, custom widget) düz `.md`. Koleksiyon `format` ve config `components` alanları kaldırıldı (eski config'ler zod non-strict olduğu için yüklenmeye devam eder). Dosya adaptörü yalnız `.md` listeler/yazar.
- Denetim `packages/core/src/markdown/index.ts` `findDisallowed(body)`: satteri mdast; tehlikeli etiketler, `on*`/`formaction`/`srcdoc`, kod URL'leri ve PascalCase (bileşen) etiketleri reddedilir.
- `wuppy/markdown` → `markdownContent(source)` `{ html, headings }` (Astro'nun Markdown renderer'ı). `wuppy/mdx`, `mdxContent`, `/api/editor/components`, editör component seçici ve görsel editör "component" modülü kaldırıldı.
- Canlı içerik: `.md` istek anında render edilir; temanın kendi `.mdx` dosyaları yalnız derlemesinden sunulur (değişirse Rebuild).
- `wuppy init` artık `mdx()`/`@astrojs/mdx` eklemez ve glob genişletmez; `.mdx` dosyaları için uyarır. `wuppy mdx-to-md [dir]` bileşensiz `.mdx`'leri `.md`'ye çevirir, bileşen/ifade içerenleri raporlar.
- Tema öncelikli: `templates/starter/dev.mjs` (`pnpm dev`) aktif tema varsa `astro dev`'i tema klasöründe çalıştırır (`WUPPY_BASE_ROOT`, `WUPPY_AUTH_DB`, ana `.env`); `theme.mjs` serve.mjs ile ortak. Code görünümü dosyaları gerçek yollarında gösterir (sayfa `<koleksiyon dir>/<slug>.md`); sayfa tema içindeyse tek ağaç `theme: owner/repo`.

### Sonuçlar

- Editör kaydı derlemeyi bozamaz; tasarım/bileşen geliştiricinin `.astro` dosyalarında.
- Kaybedilen: içerikte bileşen kullanımı. Gerekirse `.astro` sayfasında frontmatter alanıyla seçilir.
- Ek (2026-10-23, kullanıcı: "burada posts page kalmalıydı"): koleksiyonlara isteğe bağlı `kind: "posts" | "pages"`. Tema koleksiyonları Astro adlarıyla kalır (`blog`, `about`; live-content bu adı kullanır), panel Posts/Pages bölümlerini `kind`'a (yoksa ada) göre gösterir: sidebar, StudioBar, Menus, Site. `wuppy init` tarih alanı olan ilk koleksiyonu `posts`, olmayan ilkini `pages` yapar.
- Geri alma: `git revert`; `src/markdown` → `src/mdx`, `@astrojs/mdx` starter'a geri.

## ADR-022 — İçerik sitenin, tema yalnız tasarım

> Durum: Kabul edildi (2026-10-23). ADR-021'in "tema öncelikli" kısmının (içeriğin tema klasöründe tutulması) yerini alır.

### Bağlam

ADR-021 sonrası panel temanın `blog`/`about` koleksiyonlarını gösterdi ve yazılar temanın git klonuna (`.wuppy/themes/<sahip>__<ad>/src/content`) yazıldı. Bu klasör sitenin `.gitignore`'unda; içerik sitenin geçmişine girmiyordu, tema güncellemesi çakışıyor, tema değişince içerik kalıyordu. Kullanıcı: "burada posts page kalmalıydı", ardından önerilen yapı için "tamam bu dediklerini yap".

### Karar

- Sunucu, medya, veri, auth, redirect, sitemap/rss/robots, page cache ve görsel CSS her zaman sitenin klasörünü kullanır: `themes/site.ts` `siteRoot()` = `WUPPY_BASE_ROOT || cwd`. Tema yalnız Astro kodu (cwd) olarak çalışır.
- Temanın `wuppy.config.mjs` koleksiyonları sitenin koleksiyonlarına bağlanır (`linkTheme`): `kind: posts/pages` → sitenin Posts/Pages'i; `kind` yoksa sitenin `content/<ad>` koleksiyonu (yoksa oluşur). `map` tema alan adı → site alan adı (`pubDate` → `date`). Site alan tanımları kazanır; yalnız temanın okuduğu alanlar eklenir; `route` temanınkidir.
- Canlı içerik (live-runtime) tema koleksiyonunu sitenin klasöründen okur ve alanları temanın adlarına çevirir, sonra temanın şemasıyla doğrular.
- Kurulumda (`install`) temanın `.md` ve `.mdx` örnek girdileri bir kez siteye kopyalanır (alan adları çevrilir), var olan dosyanın üzerine yazılmaz; `.mdx` içindeki bileşen importları temizlenir.
- `wuppy init` `kind` ve bilinen adlar için `map` yazar (`pubDate`/`publishDate`… → `date`, `heroImage`/`image`… → `cover`).
- Panel: Posts/Pages adları sabit; tema varken ayrı eşleme gerekmez (`kind` yalnız `wuppy init` ile sarılan sitelerde). Code görünümü iki kök: `site` ve `theme: owner/repo`.

### Sonuçlar

- İçerik tema değişiminde/güncellemesinde korunur ve sitenin Git'ine commit edilir.
- Temanın zorunlu tuttuğu alanı eksik girdiler temada görünmez (konsola şema hatası yazılır) ta ki alan doldurulana kadar.
- Göreli yollu örnek görseller (`../../assets/…`) içe aktarmada kırılır. Yeniden kurulum silinen örnek girdileri geri getirir.
- Symlink kullanılmadı: canlı içerik zaten diskten okuduğu için gerek kalmadı.
- Ek (2026-10-23, kullanıcı "temayı kaldır" seçti): Code görünümü yalnız `site` kökünü gösterir; tema kaynağı panelden düzenlenmez. `/api/themes/files`, `/api/themes/file`, `/api/themes/rebuild` ve `GithubThemes.sourceFiles/writeSource/rebuild` kaldırıldı; tema Themes sayfasından yeniden kurulur/derlenir.
- Ek 2 (2026-10-23, kullanıcı "ayrı theme ağacı" seçti): üstteki ek geri alındı. Code görünümü iki kök: `site` (içerik/veri) ve `theme: owner/repo` (tema kodu, düzenlenebilir, Rebuild). Temanın koleksiyon klasörleri listelenmez (içerik sitede). Uç noktalar ve `sourceFiles/writeSource/rebuild` geri geldi.
- Ek 3 (2026-10-24, kullanıcı "astro ile yapılan her temayı düzenleyebilmemiz lazım"): görsel editör tuvali artık boş iframe'e CSS kopyalamak yerine girdinin canlı sayfasını yükler; `themeComponentsPlugin` derlenmiş her `<Content />` çizimini `<!--wuppy:body-->…<!--/wuppy:body-->` yorumlarıyla sarar, admin bu aralığı boşaltıp blokları oraya çizer. Tema layout/CSS/script'i aynen çalışır; tema tarafında hiçbir sözleşme gerekmez. İşaret yoksa (yayımlanmamış girdi, uzak site, component düzenleme) eski boş çerçeveye düşülür. Bilinen sınır: sayfada birden çok `<Content />` varsa ilki kullanılır; ham kaynak dalı işaret eklemez.
- Ek 4 (2026-10-24, kullanıcı "astro projelerinde pages varsa ... bizim pages'a gelmeli"): temanın statik Markdown sayfaları (`src/pages/**/*.md(x)`, `[param]` ve `_` hariç) etkinleştirmede sitenin Pages koleksiyonuna kopyalanır (`layout` hariç). `themePagesPlugin` bu sayfa modülünü değiştirir: tema dosyasının `layout`'u korunur, gövde her istekte sitedeki girdiden okunur (`themePage`, live-runtime), yoksa temanın kendi metni. wuppy.config Vite eklentisinde okunamadığı için (Astro config loader kapalı) Pages klasörü çalışma anında bulunur. `.astro` sayfaları kod olarak kalır (Code görünümü).
- Ek 5 (2026-10-24, kullanıcı "pages altındaki .astro dosyalarını da bizim pages'e aktarmalı", seçim "Listele + aç"): temanın statik `.astro` sayfaları da (`[param]`, `_` ve `.js/.ts` uç noktaları hariç) Pages'a `<rel>.md` girdisi olarak eklenir: `title` yoldan türetilir (index → Home), `template: src/pages/<rel>.astro`, gövde boş. Kullanıcı eklediği blokların görünmesini isteyince: `themePagesPlugin` tema `.astro` sayfasının kaynağına (Astro derlemeden önce, transform order pre) `virtual:wuppy-theme-body/<rel>` bileşenini ekler ve `<main>` sonuna (yoksa son öğenin içine) `<WuppyThemeBody />` koyar; bu bileşen `themeBody` ile `template`'li girdinin gövdesini işaretçiler arasında çizer, böylece görsel editör yerinde düzenler. Edit ekranında gövde editörü ve "Open in Code view" birlikte durur. Tema modunda `theme-seo-middleware` HTML yanıtında `seoTitle`/`seoDescription`/`noindex`'i uygular; preview-link API'si `template` URL'sini kullanır. Aynı adlı site sayfası varsa dokunulmaz.

- Ek 6 (2026-10-24, kullanıcı "tag.astro … temadaki tüm elementler de düzenlenebilir olmalı visual editor'de"): görsel editör tema `.astro` dosyalarının kendi öğelerini düzenler. Konum, Astro dev sunucusunun her öğeye koyduğu `data-astro-source-file/loc`'tan gelir; dev toolbar bunları sildiği için `visual-middleware` `data-wuppy-file/loc` kopyası ekler. `editAstroElement` dosyayı `@astrojs/compiler-rs` ile ayrıştırır, öğeyi Astro'nun konum kuralıyla (+ etiket adı) bulur ve yalnız onun aralığını değiştirir (metin, class/style, sil, çoğalt, kardeşle yer değiştir); `{...}` ile üretilen metin/öznitelik ve ifade içindeki öğeler reddedilir ("Code view"). `withThemeBody` import'u ön bilginin ilk satırına koyar ki satır numaraları kaymasın. Tema dosyaları düzenlenince sayfa yenilensin diye Vite watch yalnız projenin kendi `.wuppy/` klasörünü yok sayar (tema sitenin `.wuppy/` klasörü içinden çalışır). Yalnız dev; geri alma Git/Code view ile.
- Ek 7 (2026-10-24, kullanıcı "instatic gibi elementin özelliklerinin hepsi bizde de olmalı … tailwind 4 olarak"): tema öğesinin Properties paneli Instatic'in `CLASS_STYLE_SECTIONS` listesini (blokların stil grupları da aynı listeye geçti, `style-props.ts`), etiket değiştirmeyi ve öznitelikleri içerir. Stiller Tailwind 4 class'ı olarak yazılır (`tailwind.ts`: özellik → utility tablosu, karşılığı yoksa `[prop:value]`; class'lar okunurken aynı tabloyla özelliğe eşlenir, tanınmayanlar ve başka variant'takiler korunur). Breakpoint (max-width) `max-[Npx]:`, state Tailwind variant'ı olur. Tema Tailwind 4 kullanmıyorsa (sayfada `tailwindcss v4` başlığı yok) class etkisiz kalacağı için aynı alanlar inline style'a yazılır. `editAstroElement` `attrs` artık her özniteliği alır (`null` siler) ve `tag` eylemi etiketi açılış/kapanışta değiştirir (bileşenler hariç).

## ADR-023 — MDX geri geldi; tema `.astro` bileşenleri içerikte gerçek bileşen olarak kullanılır

> Durum: Kabul edildi (2026-10-23). ADR-021'in "içerik yalnız Markdown" kararının yerini alır; ADR-022'nin tema/site ayrımı korunur.

### Bağlam

Kullanıcı önce Instatic benzeri editörde temanın `src/components/*.astro` dosyalarının Add → Components altında görünmesini, ardından seçildiğinde Code sayfasına yönlenmek yerine tuvale gerçek bileşen olarak eklenmesini istedi. ADR-021 içerikte bileşen kullanımını kaldırmıştı; kullanıcı "1. Gerçek Astro component desteği … bunu yap" diyerek MDX + güvenli allowlist + otomatik registry modelini seçti.

### Karar

- Koleksiyonlarda `format: "md" | "mdx"` yeniden var (varsayılan `md`; starter/content types yeni içerik için `mdx`). Aynı koleksiyonda `.md` ve `.mdx` yan yana yaşar; yeni girdi koleksiyonun formatını alır. Mevcut `.md` girdisi bileşen eklendiğinde aynı commit içinde `.mdx`'e yükseltilir (eski dosya silinir).
- `components` config allowlist'i ve `findDisallowed(body, allowed, format)` yeniden var. MDX'te import/export, keyfi ifade, listede olmayan bileşen, spread, `on*`/direktifler ve tehlikeli URL'ler reddedilir; `.md` gövdeleri Markdown HTML kurallarıyla denetlenir (MDX koleksiyonundaki eski `.md` bileşen kullanmıyorsa `.md` kalır ve `<img>` gibi void HTML kabul eder).
- Aktif temanın `src/components/*.astro` dosyaları otomatik allowlist'e girer. `@wuppy/astro` bir Vite transform'uyla `<Content />` çağrısına `components` haritası ekler; harita bileşenleri doğrudan import eder (sanal modül yok). Böylece tema sayfalarını elle düzenlemeden MDX içindeki `<Callout>` gerçek Astro bileşeni olarak render edilir. Site içi özel bileşenler yalnız `components` config'iyle açılır.
- Canlı içerik: değişen `.mdx` girdileri `mdxContent` ile istek anında derlenir, `render()` built modülü kullanmaz; `.md` Markdown renderer'ıyla çizilir. Import satırları site içeriğinde temizlenir; bileşen haritası import'u sağlar.
- Admin: `/api/editor/components` allowlist'i döndürür; Add → Components temanın `.astro` dosyalarını `ASTRO` rozeti ve kaynak yoluyla listeler, seçim `data-ve="component"` düğümü ekler. Tuval etiketli yer tutucu gösterir; gerçek çıktı site/rebuild sonrası görünür. `.md` sayfası bileşen eklendiğinde `.mdx`'e yükseltilir.
- `wuppy init` yeniden `@astrojs/mdx` ekler, glob'ları genişletir, `.mdx` bileşenlerini allowlist'e alır; `wuppy mdx-to-md` bileşensiz içerik için geri dönüş aracı olarak kalır.

### Sonuçlar

- İçerikte gerçek Astro bileşeni kullanılabilir; bileşenlerin stilleri/scriptleri build'de normal Astro kurallarıyla çalışır.
- Tuval Astro bileşenini çalıştırmaz (React iframe); placeholder gösterir. Bu, "MDX + rebuild" modelinin bilinçli sınırıdır.
- Tema bileşeni eklemek/değiştirmek geliştirme sunucusunda restart, üretimde Rebuild gerektirir (harita kaynak taramasından üretilir).
- Geri alma: ADR-021'deki `format`/`components` kaldırma değişikliklerini geri uygula; `src/mdx` yerine `src/markdown` kalabilir çünkü ayrıştırıcı aynı dosyada iki formatı destekler.

## Karar özeti

| Katman | EmDash | Wuppy |
| --- | --- | --- |
| Runtime | Node + Cloudflare birinci sınıf | **Node birinci sınıf**, Cloudflare opsiyonel |
| Auth | Özel `@emdash-cms/auth` | **Better Auth 1.7** |
| UI | `@cloudflare/kumo` | **Bejamas UI** (Astro) + **shadcn/ui** (React) |
| State | TanStack Query | **Nanostores** |
| Router | TanStack Router | TanStack Router |
| Editör | Tiptap 3 | **Lexical 0.52** |
| İçerik | DB merkezli | **Dosya merkezli (MDX/Markdown) + Git** |
| Veri | Kysely + SQLite/PG/D1 | Kysely + SQLite/PG/D1 (opsiyonel) |

## Değişiklik süreci

Yeni bir karar gerektiğinde:

1. `KARARLAR.md` içine yeni bir `ADR-00N` ekle.
2. Bağlam, karar, sonuçlar ve geri alma yolunu yaz.
3. Etkilenen `PROJE-YAPISI.md` ve `EMDASH-TEKNOLOJILERI.md` bölümlerini güncelle.
4. Klasör değişikliği gerekiyorsa `.gitkeep` ile iskeleti güncelle.
5. Eski ADR'yi silme; durumunu `Yerini ADR-00N aldı` olarak işaretle.
