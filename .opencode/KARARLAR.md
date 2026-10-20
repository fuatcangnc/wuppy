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

## Karar özeti

| Katman | EmDash | Wuppy |
| --- | --- | --- |
| Runtime | Node + Cloudflare birinci sınıf | **Node birinci sınıf**, Cloudflare opsiyonel |
| Auth | Özel `@emdash-cms/auth` | **Better Auth 1.7** |
| UI | `@cloudflare/kumo` | **Bejamas UI** (Astro) + **shadcn/ui** (React) |
| State | TanStack Query | **Nanostores** |
| Router | TanStack Router | TanStack Router |
| Editör | Tiptap 3 | **Lexical 0.52** |
| İçerik | DB merkezli | **Dosya merkezli (MD/MDX) + Git** |
| Veri | Kysely + SQLite/PG/D1 | Kysely + SQLite/PG/D1 (opsiyonel) |

## Değişiklik süreci

Yeni bir karar gerektiğinde:

1. `KARARLAR.md` içine yeni bir `ADR-00N` ekle.
2. Bağlam, karar, sonuçlar ve geri alma yolunu yaz.
3. Etkilenen `PROJE-YAPISI.md` ve `EMDASH-TEKNOLOJILERI.md` bölümlerini güncelle.
4. Klasör değişikliği gerekiyorsa `.gitkeep` ile iskeleti güncelle.
5. Eski ADR'yi silme; durumunu `Yerini ADR-00N aldı` olarak işaretle.
