# Wuppy — Proje Klasör Yapısı

Bu dosya, `wuppy/` altında oluşturulan iskeletin neyden oluştuğunu ve her
klasörün ne işe yaradığını açıklar. Yapı, `emdash-main` deposunun monorepo
yaklaşımı, paket sınırları, test katmanları ve bileşen organizasyonu örnek
alınarak **Wuppy'nin dosya tabanlı CMS hedefine uyarlanmıştır**.

> **Durum (güncel):** Çalışan dikey dilim var — `packages/{core,admin,visual-editor,auth,git,plugin-types,create-wuppy}`,
> `templates/starter` ve `e2e` gerçek kod içerir. Henüz yazılmamış klasörlerde yalnızca `.gitkeep` durur.
> Plan değişiklikleri: Markdown doğrudan kaynaktır, `packages/markdown` ve `packages/blocks` ertelendi (KARARLAR.md ADR-006);
> SEO, sitemap, yönlendirme, i18n, medya, webhook ve eklenti sandbox'ı şimdilik `packages/core` içindedir
> (`packages/plugins/*` birinci taraf eklentilere ayrılacak). İlerleme: `yapılacaklar.md`.

> EmDash'in kullandığı tüm teknolojiler, sürümleri ve katmanları için:
> [EMDASH-TEKNOLOJILERI.md](EMDASH-TEKNOLOJILERI.md).
> Wuppy'nin güncel teknoloji kararları (Better Auth, shadcn/ui, Bejamas UI, Nanostores,
> Lexical, opsiyonel Cloudflare) için: [KARARLAR.md](KARARLAR.md).

---

## 1. Genel ağaç

```
wuppy/
├── acceptance/          Ürün kabul yolculukları ve test siteleri
├── assets/templates/    Şablon ekran görüntüleri / tanıtım görselleri
├── .changeset/          Sürüm ve CHANGELOG kayıtları
├── .github/             CI, issue/PR şablonları
├── .vscode/             Editör ayarları
├── demos/               Geliştirme ve doğrulama uygulamaları
├── docs/                Starlight dokümantasyon sitesi + teknik şartnameler
├── e2e/                 Playwright uçtan uca test altyapısı
├── fixtures/            Performans ve yük testi fixture'ları
├── i18n/                Çeviri durumu panosu (Lunaria)
├── infra/               Yardımcı servisler / operasyon altyapısı
├── packages/            Yayınlanabilir çalışma alanı paketleri
├── patches/             pnpm patch dosyaları
├── proposals/           Özellik planları (kod öncesi)
├── rfcs/                Mimari karar ve RFC kayıtları
├── scripts/             Depo otomasyonu (tek seferlik değil, kalıcı araçlar)
├── skills/              Ajan becerileri
├── templates/           Başlangıç şablonları (+ Cloudflare varyantları)
├── AGENTS.md            (sonra eklenecek) ajan kodlama kuralları
├── CONTRIBUTING.md      (sonra eklenecek) katkı süreci
├── EMDASH-TEKNOLOJILERI.md  EmDash teknoloji envanteri ve Wuppy eşlemesi
├── KARARLAR.md          ADR kayıtları (Better Auth, shadcn/ui, Bejamas, Nanostores, Lexical)
├── PROJE-YAPISI.md      Bu dosya: klasör yapısı ve sorumluluklar
├── README.md            (sonra eklenecek) ürün tanıtımı
└── ROADMAP.md           (sonra eklenecek) P0/P1/P2 planı
```

---

## 2. Kök dizinler

| Klasör | Ne işe yarar | Neden ayrı |
| --- | --- | --- |
| `acceptance/` | Ürünün "gerçekten çalışıyor" tanımını senaryolaştırır: yazı yayınla, meslektaş taslağını incele, çeviri yayınla, kazara düzenlemeyi geri al. | Test kodundan önce ürün davranışını yazmak, "yeşil test ama yanlış ürün" riskini azaltır. |
| `assets/templates/` | Şablonların tanıtım ekran görüntüleri ve pazar yeri görselleri. | Uygulama koduna karışmayan statik üretim çıktıları. |
| `.changeset/` | Hangi paketin hangi sürümle, hangi kullanıcıya görünen açıklamayla yayınlanacağı. | Sürüm notu PR'dan değil, yayınlanan davranıştan üretilir. |
| `.github/` | CI iş akışları, issue/PR şablonları, bağımlılık güncelleme ayarları. | İnceleme ve otomasyon sözleşmeleri kodla birlikte versiyonlanır. |
| `.vscode/` | Ortak editör ayarları (biçimlendirme, arama hariç tutmaları). | Yeni geliştiricinin ortamı ilk günden aynı olsun. |
| `demos/` | `simple`, `cloudflare`, `preview`, `plugins-demo`: çalışan örnek uygulamalar. | Şablonlardan farkı, son kullanıcıya dağıtılmaz; geliştirme sırasında çekirdeği canlı test eder. |
| `docs/` | Kullanıcı dokümantasyonu (Starlight) ve `technical-specs/`. | Ürün dokümanı ile iç mimari şartname ayrı hızlarda evrilir. |
| `e2e/` | İzole fixture site + Playwright senaryoları + yardımcılar. | Demo uygulamalarının verisine bağlı kalmadan, her koşuda temiz ortam. |
| `fixtures/` | `perf-site` gibi büyük/özel veri setleri. | Performans regresyonunu normal test süresinden ayırır. |
| `i18n/` | Çeviri kapsamı ve eksik çeviri panosu. | Çeviri durumu, admin kataloglarından bağımsız raporlanır. |
| `infra/` | Dağıtım/operasyon yardımcıları (izleme, bot, demo altyapısı). | Ürün paketlerine sızmaması gereken operasyon kodu. |
| `packages/` | Yayınlanabilir paketler. Asıl ürün burada. | Tek repo, çok paket; her paket kendi sınırı, testi ve sürümüyle. |
| `patches/` | Üçüncü taraf bağımlılıklara geçici yamalar. | Yamayı görünür ve gerekçeli tutar. |
| `proposals/` | Kod yazılmadan önce özellik planı. | Büyük özelliklerde yönü erken sabitler. |
| `rfcs/` | Geri döndürülmesi zor mimari kararlar. | "Neden böyle yaptık?" sorusunun kalıcı kaydı. |
| `scripts/` | Şablon senkronizasyonu, ekran görüntüsü, ortam tipi üretimi, bin relink. | Tekrarlanan depo işleri elle yapılmaz. |
| `skills/` | Ajanların projeye özgü iş akışları. | Ajan rehberi kod tabanıyla birlikte yaşar. |
| `templates/` | Kullanıcıya dağıtılan başlangıç siteleri. | `create-wuppy` buradan kopyalar; demo değildir. |

---

## 3. `packages/` — paket haritası

```
packages/
├── core/               wuppy        Astro entegrasyonu + Hono API + içerik motoru
├── admin/              @wuppy/admin React yönetim SPA'sı + visual editor UI
├── visual-editor/      @wuppy/visual-editor NodeTree, CSS/framework/selector şemaları
├── auth/               @wuppy/auth  Better Auth yapılandırması + RBAC
├── blocks/             @wuppy/blocks Editör blokları ve renderer'lar
├── git/                @wuppy/git   Commit, diff, geçmiş, geri alma
├── markdown/           @wuppy/markdown MDX ↔ taşınabilir içerik
├── plugin-types/       @wuppy/plugin-types Eklenti sözleşmeleri
├── plugin-cli/         @wuppy/plugin-cli Eklenti iskeleti/paketleme
├── plugin-test/        @wuppy/plugin-test Eklenti test yardımcıları
├── test-utils/         Paylaşılan test altyapısı
├── create-wuppy/       create-wuppy Yeni proje oluşturucu
├── cloudflare/         @wuppy/cloudflare Opsiyonel Workers adaptörü
└── plugins/            Birinci taraf eklentiler
    ├── seo/
    ├── sitemap/
    ├── redirects/
    └── webhooks/
```

### Paket sınırları

| Paket | Bağımlı olduğu | ASLA bağımlı olmadığı |
| --- | --- | --- |
| `core` | `admin`, `auth`, `blocks`, `git`, `markdown`, `plugin-types` | Uygulama şablonları, demolar |
| `admin` | HTTP API + paylaşılan tipler; shadcn/ui, Nanostores, Lexical, `@wuppy/visual-editor` | `core`'un iç modülleri, Node API'leri |
| `visual-editor` | zod ve saf TypeScript | `admin`, `core`, tarayıcı DOM'u |
| `auth` | `better-auth`, Kysely adaptörü | `admin`, `core` |
| `git` | Node `fs`, Git kütüphanesi | `core`, `admin` |
| `markdown` | remark/rehype/MDX araçları | `core`, `admin` |
| `blocks` | Taşınabilir içerik tipleri | `admin`, `core` |
| `cloudflare` | `core`, Workers tipleri | Node-only modüller |

> `core` ile `admin` arasındaki tek köprü HTTP API'dir. Bu, admin'in ayrı
> dağıtılabilmesini ve sunucu kodunun tarayıcı paketine sızmamasını sağlar.

---

## 4. `packages/core/` — çekirdek

```
core/
├── src/
│   ├── api/            Hono uygulaması
│   ├── astro/          Astro entegrasyonu ve middleware
│   ├── auth/           Better Auth mount noktası ve oturum yardımcıları
│   ├── bylines/        Yazar profilleri, krediler, byline şeması
│   ├── cache/          Önbellek anahtarları ve invalidation
│   ├── cli/            `wuppy` komut satırı
│   ├── client/         Programatik içerik istemcisi
│   ├── comments/       Yorumlar, moderasyon, sayaçlar
│   ├── components/     Astro'ya sunulan UI parçaları
│   ├── config/         `wuppy.config.ts` yükleme/doğrulama
│   ├── content/        Dosya tabanlı içerik motoru
│   ├── content-types/  Koleksiyon/şema tanımları
│   ├── dashboard/      Panel özeti: sayaçlar, son etkinlik
│   ├── data/           JSON site verisi (menü, widget, ayar, taksonomi, byline)
│   ├── database/       Opsiyonel DB adaptörleri (indeks/arama)
│   ├── email/          E-posta gönderimi (davet, magic link, bildirim)
│   ├── fields/         Alan tipleri ve doğrulama
│   ├── git/            İçerik yazımıyla birleşik Git akışı
│   ├── i18n/           Çok dilli içerik yardımcıları
│   ├── import/         Dış kaynaklardan içe aktarma (WordPress, JSON)
│   ├── mcp/            Model Context Protocol uçları
│   ├── media/          Medya işleme, klasör, varyant, kullanım izleme
│   ├── menus/          Menü yönetimi
│   ├── migrations/     Sürüm geçişleri
│   ├── notifications/  Panel içi bildirimler
│   ├── plugins/        Eklenti yükleyici
│   ├── preview/        Yayın öncesi önizleme
│   ├── redirects/      Yönlendirme motoru + 404 kaydı
│   ├── references/     İçerik referansları
│   ├── schema/         Şema kayıt defteri
│   ├── search/         Arama indeksi
│   ├── sections/       Sayfa bölümleri (P1)
│   ├── security/       CSRF, sanitize, yol güvenliği, SSRF
│   ├── seed/           Başlangıç içeriği
│   ├── seo/            Meta/OG/canonical üretimi
│   ├── settings/       Site ayarları
│   ├── storage/        Depolama adaptörleri
│   ├── taxonomies/     Kategori/etiket
│   ├── themes/         Tema/şablon kayıt defteri
│   ├── transfer/       İçerik içe/dışa aktarma
│   ├── utils/          Saf yardımcılar
│   ├── visual-editing/ Sayfa üzerinde düzenleme
│   └── widgets/        Kenar çubuğu/alan widget'ları
└── tests/              Test katmanları
```

### `src/api/` — Hono API

```
api/
├── routes/        URL → handler eşlemesi (ince)
├── handlers/      İş mantığı; ApiResult<T> döner
├── schemas/       Zod istek/yanıt şemaları
├── middleware/    CSRF, auth, request context, hata yakalama
└── openapi/       OpenAPI üretimi ve sözleşme testleri
```

**Katman kuralı:** `routes` doğrular ve handler'ı çağırır; `handlers` iş kuralını
uygular; domain/adaptörler dosya, Git ve depolamayla konuşur. Route içinde iş
mantığı yazılmaz.

### `src/astro/` — entegrasyon

```
astro/
├── integration/   Astro `integration()` kurulumu, sanal modüller, Vite eklentisi
├── middleware/    setup, auth, request-context, redirect, admin mount
└── routes/admin/  Admin SPA kabuğunu servis eden Astro sayfaları
```

Sanal modüller burada üretilir: `virtual:wuppy/config`, `virtual:wuppy/content`,
`virtual:wuppy/git`, `virtual:wuppy/env`. Testler bunları stub'lar.

### `src/content/` — dosya tabanlı motor

```
content/
├── adapters/     filesystem | memory | (opsiyonel) db-index
├── parsers/      Markdown/MDX okuyucu, frontmatter ayrıştırma
├── renderers/    Astro/HTML çıktısı
├── converters/   MDX ↔ taşınabilir içerik dönüşümü
└── validation/   Zod şeması, yol güvenliği, bilinmeyen alan koruma
```

Bu klasör ürünün kalbidir: içerik **her zaman** dosyadır. Veritabanı adaptörü
eklense bile kaynak dosya kalır.

### `src/git/` — Git iş akışı

```
git/
├── adapters/     real-git (isomorphic-git/CLI) | noop-git
├── diff/         İçerik ve metadata diff'i
└── history/      Commit listesi, revert, blame
```

Her yazma işlemi commit üretir; geri alma geçmişi silmez, yeni revert commit'i
yaratır. Testler gerçek geçici Git deposu kullanır, Git mock'lanmaz.

### `src/storage/` — depolama

```
storage/
├── local/   Yerel dosya sistemi (varsayılan)
└── s3/      S3 uyumlu servisler (R2 dahil)
```

Ortak `StorageAdapter` arayüzü: `upload`, `download`, `delete`, `exists`,
`list`, `getPublicUrl`. Anahtar üretimi tek yardımcıdan geçer.

### Diğer önemli core klasörleri

| Klasör | Sorumluluk |
| --- | --- |
| `content-types/` | Koleksiyon tanımı, alan listesi, URL ve şablon eşlemesi. |
| `fields/` | Alan tipi kayıt defteri: metin, zengin metin, görsel, referans, tarih. |
| `schema/` | Koleksiyon şemalarının çalışma zamanı kaydı ve tip üretimi. |
| `media/` | Yükleme, MIME/imza doğrulama, türetilmiş görseller, kullanım izleme. |
| `security/` | Yol aşımı engeli, HTML sanitize, CSRF, güvenli yönlendirme. |
| `transfer/` | İçerik dışa/içe aktarma: analiz, format, staging, uygulama. |
| `preview/` | Taslağı gerçek site şablonuyla, yayınlamadan gösterme. |
| `plugins/` | Eklenti manifesti, yetenek (capability) kontrolü, sandbox. |
| `search/` | Dosya tabanlı içerikte arama; opsiyonel DB indeksiyle hızlandırma. |
| `i18n/` | Çeviri grupları, eksik çeviri tespiti, dil bazlı yollar. |

### `packages/core/tests/` — test katmanları

```
tests/
├── unit/          Saf fonksiyonlar: parser, diff, yol güvenliği, şema
├── integration/   Gerçek geçici dizin + gerçek Git + gerçek SQLite
│   └── fixtures/  Paylaşılan entegrasyon fixture'ları
├── workerd/       Cloudflare workerd davranışı (yalnızca adaptör testleri)
├── types/         `*.test-d.ts` genel tip sözleşmeleri
├── repro/         Hata tekrar üretimi; render gerektiren özel testler
├── fixtures/      Ortak test verileri
└── utils/         Test DB'si, geçici depo, Git kurulumu
```

**Test dosyası kaynağı aynalar:** `src/content/parsers/frontmatter.ts` →
`tests/unit/content-parsers-frontmatter.test.ts` (veya aynı alt yol).
Her veritabanı testi taze şema alır; dosya testi her seferinde `mkdtemp` açar.

---

## 5. `packages/admin/` — yönetim paneli

```
admin/
├── src/
│   ├── components/
│   │   ├── auth/         Giriş, davet kabul, sihirli bağlantı (Better Auth)
│   │   ├── bylines/      Yazar profilleri, krediler, byline şeması
│   │   ├── calendar/     Yayın takvimi, tarih seçici
│   │   ├── comments/     Yorum kutusu, moderasyon, toplu işlem
│   │   ├── content/      İçerik listesi, editör, yayınlama, çeviri durumu
│   │   ├── content-types/ Koleksiyon/alan şeması, ilişkiler
│   │   ├── dashboard/    Sayaçlar, içerik özeti, son etkinlik, hızlı eylemler
│   │   ├── editor/       Lexical düğümleri, alan ve blok editörleri
│   │   ├── git/          Değişiklik önizlemesi, commit geçmişi, geri alma
│   │   ├── import/       WordPress/JSON içe aktarma sihirbazı
│   │   ├── media/        Medya kütüphanesi, klasörler, seçici, kırpma
│   │   ├── menus/        Menü listesi, öğeler, sıralama, çeviri
│   │   ├── plugins/      Yüklü eklentiler, yetenek onayı, registry/marketplace
│   │   ├── redirects/    Yönlendirmeler ve 404 kayıtları
│   │   ├── revisions/    Revizyon geçmişi ve diff görünümü
│   │   ├── sections/     Yeniden kullanılabilir sayfa bölümleri
│   │   ├── seo/          Meta, OG, canonical, yönlendirme formları
│   │   ├── settings/     Genel, SEO, sosyal, e-posta, güvenlik, medya, yedekleme
│   │   ├── shared/       ConfirmDialog, PageHeader, EmptyState, ErrorState
│   │   ├── taxonomies/   Kategori/etiket listesi, terim düzenleme
│   │   ├── users/        Kullanıcı, davet, rol, izin, oturum, API token
│   │   └── widgets/      Widget alanları ve örnekleri
│   ├── lib/
│   │   ├── api/          Tipli fetch istemcisi, yeniden deneme, hata eşlemesi
│   │   ├── git/          Diff görünümü yardımcıları
│   │   ├── revision-diff/Revizyon karşılaştırma
│   │   ├── seo/          SEO form yardımcıları
│   │   └── validation/   Form → Zod hata eşlemesi
│   ├── locales/en/       Lingui kaynak kataloğu
│   ├── routes/           Sayfa bileşenleri (TanStack Router)
│   ├── stores/           Nanostores: session, content, editor, media, git, comments, plugins, ui
│   └── ui/               shadcn/ui primitives + uygulama bileşenleri (global tema)
└── tests/
    ├── components/       Bileşen davranış testleri
    ├── editor/           Lexical etkileşimleri (autosave, çakışma, görsel)
    ├── lib/              Saf yardımcı testleri
    ├── routes/           Rota/URL ve guard testleri
    ├── locales/          Çeviri kapsamı testleri
    └── utils/            render, mockFetch, testStore
```

### Neden bu bileşen ayrımı?

- **Alan bazlı gruplama:** Bir ekranı değiştiren geliştirici tek klasöre bakar.
- **`ui/`:** shadcn/ui primitives; tek global tema token'larıyla çalışan, kopyalanmış
  ve sahiplenilmiş primitives'ler. İş kuralı içermez.
- **`shared/`:** İki'den fazla alanda kullanılan iş bileşenleri; `ui/`
  primitives'lerini birleştirir.
- **`stores/`:** Tüm istemci durumu Nanostores atomlarında. Bileşen içinde
  global state tutulmaz.
- **`lib/`:** Bileşen içinde fetch/diff/doğrulama mantığı yazılmaz; test
  edilebilir saf yardımcılara taşınır.
- **`routes/`:** Yalnızca veri çekme + düzen kurma. İş mantığı bileşen veya
  `lib/` içinde.

### Test yaklaşımı (emdash'ten alınan yaklaşım)

| Katman | Nerede | Özellik |
| --- | --- | --- |
| Bileşen | `tests/components/` | Vitest browser mode + Playwright, gerçek DOM |
| Editör | `tests/editor/` | Lexical autosave, çakışma, görsel yükleme, odak |
| Rota | `tests/routes/` | URL, arama parametresi, yetki guard'ı |
| Yardımcı | `tests/lib/` | Saf fonksiyon, node ortamı |
| Yerelleştirme | `tests/locales/` | Katalogda eksik anahtar / RTL metni |

Test yardımcıları `tests/utils/` altında toplanır:
`createMockFetch()` (API yanıtlarını eşler), `createTestStore()` (izole
Nanostores), `render()` (tema + i18n + router sağlayıcılarıyla). API mock'u
yalnızca istemci davranışını test etmek içindir; sunucu testleri gerçek
dosya/Git kullanır.

Kurallar:

- Test, kullanıcının gördüğü davranışı doğrular (dialogs, buton adı, metin).
- CSS sınıfı veya implementasyon detayı doğrulayan totolojik test yazılmaz.
- Her test kendi verisini kurar; testler arası durum paylaşılmaz.
- RTL ve klavye erişilebilirliği ayrı test edilir.

---

## 6. Diğer paketler

### `packages/auth/`

```
auth/
├── src/config/           createAuth(): Better Auth yapılandırması
├── src/adapters/         Kysely / SQLite / D1 adaptör seçimi
├── src/plugins/          admin, organization/access, magic-link, passkey, 2FA
├── src/permissions/      Wuppy izin haritası (content:edit_own, schema:manage…)
├── src/hooks/            audit log, ilk kullanıcı, davet sonrası işler
└── tests/                RBAC, oturum, plugin, izin testleri
```

Kimlik doğrulama **Better Auth** ile yapılır; Wuppy kendi passkey/OAuth/token
implementasyonunu yazmaz. `packages/auth` ince bir yapılandırma ve izin
eşleme katmanıdır. İzinler `src/permissions/` içinde tek kaynaktan tanımlanır;
route'lar izin string'i icat etmez.

### `packages/blocks/`

```
blocks/
├── src/blocks/    Blok tanımları: şema + renderer + editör meta verisi
├── src/elements/  Satır içi öğeler (bağlantı, görsel, kod)
├── src/lexical/   Lexical node sınıfları ve plugin'leri
└── tests/         Render, dönüşüm ve doğrulama testleri
```

Yeni blok = **Lexical node + şema + renderer**. Üçü tamamlanmadan blok
yayınlanamaz.

### `packages/git/`

```
git/
├── src/adapters/   real-git | noop-git
├── src/diff/       Metin ve frontmatter diff'i
├── src/history/    Commit listesi, revert, blame
└── tests/
    ├── unit/       Diff/parse birimleri
    ├── integration/Gerçek geçici Git deposu
    └── fixtures/   Örnek commit geçmişleri
```

### `packages/markdown/`

```
markdown/
├── src/mdx/            MDX ayrıştırma ve güvenli bileşen eşlemesi
├── src/lexical/        Lexical JSON ↔ taşınabilir içerik
├── src/portable-text/  Taşınabilir içerik ağacı tipleri
├── src/remark/         remark/rehype eklentileri
├── src/serialize/      İçerik ağacı → MDX
└── tests/              Gidiş-dönüş (round-trip) testleri
```

En kritik test: **MDX → Lexical JSON → MDX** ve **MDX → portable text → MDX**
çıktıları anlamlı biçimde kayıpsız olmalı.

### `packages/plugin-*` ve `packages/test-utils/`

| Klasör | Amaç |
| --- | --- |
| `plugin-types/src/` | Manifest, hook, capability ve admin API tipleri. |
| `plugin-cli/src/commands/` | `plugin init`, `plugin build`, `plugin validate`. |
| `plugin-cli/src/schemas/` | Manifest JSON şeması. |
| `plugin-test/src/` | Eklenti host'u, sahte storage, test runtime. |
| `test-utils/src/` | Geçici içerik dizini, Git fixture'ı, DB kurulumu. |

### `packages/cloudflare/`

```
cloudflare/
├── src/adapter/         Workers runtime adaptörü
├── src/plugin-sandbox/  Workers sandbox eklenti çalıştırıcısı
└── tests/               workerd davranış testleri
```

Node.js yolu bundan **bağımsız** çalışmalıdır; Cloudflare yalnızca opsiyonel
hızlandırıcı/dağıtım hedefidir. `packages/core` içinde `cloudflare:*`,
`@cloudflare/*`, `wrangler` veya `kysely-d1` import edilemez; bu sınır CI'da
mimari test ile korunur. Ayrıntı: [KARARLAR.md](KARARLAR.md#adr-001--cloudflare-opsiyonel-adaptördür).

### `packages/plugins/` — birinci taraf eklentiler

| Eklenti | Sorumluluk |
| --- | --- |
| `seo/` | Meta, canonical, OG, JSON-LD üretimi. |
| `sitemap/` | `sitemap.xml` ve `robots.txt`. |
| `redirects/` | Yönlendirme kuralları, 404 kaydı, döngü tespiti. |
| `webhooks/` | Commit/yayın olaylarında dış sistemlere bildirim. |

Her eklenti `src/` + `tests/` ile kendi kendine yeterlidir; çekirdeğe özel
bağımlılık eklemez.

---

## 7. `templates/` — kullanıcıya dağıtılan siteler

Her şablonda aynı iskelet:

```
templates/<ad>/
├── src/pages/       Astro sayfaları (index, [slug], 404, rss)
├── src/layouts/     Base layout, SEO head
├── src/components/  PostCard, Pagination, Byline + Bejamas UI bileşenleri
├── src/styles/      Bejamas/Tailwind v4 token'ları, tema, prose
├── src/utils/       yerelleştirme, okuma süresi, site kimliği
├── seed/            İlk kurulumda uygulanacak içerik
├── public/          Statik varlıklar
└── (sonra) astro.config.mjs, package.json, tsconfig.json
```

Şablonlarda UI katmanı **Bejamas UI**'dır: bileşenler `npx bejamas add` ile
depoya kopyalanır, kara kutu bağımlılık olarak eklenmez. `src/styles/`
Tailwind v4 token'larını taşır; admin ile site aynı görsel dili paylaşır.

| Şablon | Hedef kullanıcı |
| --- | --- |
| `blank/` | Kendi tasarımını sıfırdan kuracak geliştirici. |
| `starter/` | 15 dakikada yayına çıkmak isteyen genel kullanıcı. |
| `blog/` | Yazar/blog: yazı, kategori, etiket, RSS, arama. |
| `marketing/` | Tanıtım sitesi: sayfalar, CTA, SEO. |
| `portfolio/` | Portfolyo: proje vitrini, görsel ağırlıklı. |
| `*-cloudflare/` | Aynı şablonun Workers varyantı (opsiyonel dağıtım). |

`blank` dışındaki her şablonun `-cloudflare` eşi vardır; içerik ve tasarım
paylaşılır, yalnızca adaptör değişir.

---

## 8. `demos/`

| Demo | Amaç |
| --- | --- |
| `simple/` | Birincil geliştirme hedefi: Node.js + yerel dosya + yerel Git. |
| `cloudflare/` | Workers/D1/R2 adaptörünü gerçek çalışma zamanında doğrular. |
| `preview/` | Önizleme ve visual editing akışını test eder. |
| `plugins-demo/` | Eklenti API'sini ve admin uzantılarını dener. |

Demolar dağıtılmaz; `workspace:*` ile çekirdeği canlı kullanır.

---

## 9. `e2e/` — uçtan uca test altyapısı

```
e2e/
├── fixture/              Node.js izole test sitesi
│   ├── src/pages/        Test sayfaları
│   ├── src/layouts/
│   ├── src/components/
│   └── seed/             Test içeriği
├── fixture-cloudflare/   Workers varyantı
├── tests/                Playwright senaryoları
│   └── fixtures/         Senaryo verileri
└── utils/                Giriş, seed, temizlik yardımcıları
```

`global-setup` geçici dizin + taze sunucu + seed kurar; `global-teardown`
temizler. Testler demo uygulamasına değil fixture'a koşar. Böylece demo
değişiklikleri E2E'yi kırmaz.

Örnek senaryo grupları (sonra eklenecek): `content-crud`, `git-history`,
`preview`, `media-library`, `auth`, `i18n`, `redirects`, `accessibility`,
`visual-regression`.

---

## 10. `acceptance/`

```
acceptance/
├── journeys/   İnsan diliyle ürün yolculukları
├── sites/      Yolculukların çalıştığı içerik/konfigürasyon profilleri
├── tester/     Yolculukları yürüten ajan/insan talimatı
└── runs/       Çalıştırma kayıtları (git'e girmez)
```

`journeys/` test kodundan önce yazılır: "İlk yazımı yayınla", "Meslektaşımın
taslağını incele", "Kazara düzenlemeyi geri al". Her yolculuk bir kabul
ölçütüdür; E2E bu yolculukların otomasyonudur.

---

## 11. `docs/`

```
docs/
├── src/content/docs/
│   ├── tr/             Her sayfanın Türkçe eşi (ana dil İngilizce, ADR-014)
│   ├── getting-started.md
│   ├── concepts/       Mimari, içerik modeli, roller
│   ├── guides/         Panel: yazı, medya, menü, SEO, çeviri, kullanıcı, ayar
│   ├── sites/          Çoklu site yönetimi
│   ├── ai/             Asistan, site bakımı, OpenAI API ve MCP
│   ├── reference/      API, CLI, config referansı
│   ├── deployment/     Node, Cloudflare, depolama, yedekleme
│   ├── plugins/        Eklenti yazma ve yayınlama
│   ├── contributing/   Katkı ve dokümantasyon stili
│   └── coming-from/    WordPress/Astro geçiş rehberleri
├── src/components/     Dokümantasyona özel Astro bileşenleri
├── src/pages/          Özel sayfalar
├── src/styles/         Dokümantasyon teması
├── public/             Statik varlıklar
└── technical-specs/    İç mimari şartnameler (kullanıcı dokümanı değil)
```

Kullanıcı dokümanı ile teknik şartname ayrıdır: ilki ürünü kullanmayı, ikincisi
neden böyle inşa edildiğini anlatır.

---

## 12. `.github/`, `.changeset/`, `scripts/` ve diğerleri

| Klasör | İçerik |
| --- | --- |
| `.github/workflows/` | `ci.yml` (lint, typecheck, test, build), `release.yml`, `visual.yml`, `lunaria.yml`. |
| `.github/ISSUE_TEMPLATE/` | Hata bildirimi ve özellik isteği şablonları. |
| `.github/PULL_REQUEST_TEMPLATE/` | Uygulama ve tasarım PR şablonları. |
| `.changeset/` | `config.json` + sürüm notu dosyaları. |
| `scripts/` | Şablon senkronizasyonu, ekran görüntüsü, ortam tipi, bin relink. |
| `patches/` | pnpm patch dosyaları. |
| `infra/` | Operasyon yardımcıları (izleme, bot, demo altyapısı). |
| `i18n/` | Lunaria çeviri durumu panosu. |
| `skills/` | Ajan becerileri (ör. `building-wuppy-site`, `creating-plugins`). |
| `proposals/`, `rfcs/` | Özellik planı ve mimari karar kayıtları. |

---

## 13. İsimlendirme ve dosya koyma kuralları

Bu iskelet oluşturulurken `emdash-main`'den alınan yerleşik yaklaşım:

1. **Test, kaynağı aynalar.** `src/x/y.ts` → `tests/<katman>/x-y.test.ts`.
2. **Göreli importlar açık uzantı kullanır.** `./foo.ts` / `./Component.tsx`; `.js` yazılmaz (`allowImportingTsExtensions`).
3. **Test katmanı klasörle belirtilir.** `unit/`, `integration/`, `workerd/`,
   `types/`, `repro/` ayrı çalıştırma profillerine sahiptir.
4. **Admin testleri tür bazlıdır.** `components/`, `editor/`, `routes/`,
   `lib/`, `locales/`, `utils/`.
5. **Yardımcılar sahiplenilir.** Test yardımcısı test klasöründe; üretim
   yardımcısı `lib/` veya `utils/` içinde.
6. **Dosya adı = URL yolu.** API'de `content/[collection]/[id].ts` yapısı
   route'u birebir yansıtır (sonra eklenecek).
7. **Platform farkı klasörle ayrılır.** `storage/local`, `storage/s3`,
   `database/dialects`, `cloudflare/` gibi.
8. **Ürün kararı kodun yanında.** `technical-specs/`, `proposals/`, `rfcs/`
   ilgili paketle aynı repoda yaşar.
9. **Dağıtılan ile geliştirilen ayrıdır.** `templates/` kullanıcıya gider;
   `demos/` yalnızca geliştirme içindir.

---

## 14. Teknoloji kararları (özet)

Tam ADR kayıtları: [KARARLAR.md](KARARLAR.md).

| Katman | Seçim | Klasör karşılığı |
| --- | --- | --- |
| Runtime | Node.js birincil; Cloudflare **opsiyonel** | `packages/cloudflare/` |
| Auth | **Better Auth** | `packages/auth/src/{config,plugins,permissions}` |
| UI | **Bejamas UI** (Astro) + **shadcn/ui** + Zero UI icon sprite → `design-system.md` | `templates/*/src/components`, `admin/src/components/ui` |
| State | **Nanostores** | `packages/admin/src/stores/` |
| Editör | **Lexical** | `packages/blocks/src/lexical`, `markdown/src/lexical` |
| İçerik | MD/MDX + Git | `packages/core/src/{content,git}` |

---

## 15. Sonraki adım

Bu iskelet tamamlandığında sırayla:

1. Kök araç zinciri: `package.json`, `pnpm-workspace.yaml`, `tsconfig`,
   `.prettierrc`, `.oxlintrc.json`.
2. `packages/core`: `content` + `markdown` + `git` dikey dilimi.
3. `packages/admin`: içerik listesi → Lexical editör → kaydet (Git commit);
   durum Nanostores, UI shadcn/ui token'ları.
4. `packages/auth`: Better Auth + Kysely/SQLite kurulumu, ilk kullanıcı.
5. `templates/starter` + `create-wuppy`: 15 dakikalık kurulum.
6. Playwright fixture + ilk kabul yolculuğu.

Ayrıntılı ürün kapsamı için `../emdashcms-wuppy.md`, hedef sıralama için
`ROADMAP.md` (sonra eklenecek) kullanılacak.
