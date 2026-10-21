# Wuppy — Yapılacaklar

Biten işler `+ [x]`, bekleyenler `- [ ]`, kısmen bitenler `- [ ] (kısmi)` ile
işaretlenir. Kaynaklar:

- Ürün planı: `.opencode/emdashcms-wuppy.md`
- Mimari ve klasörler: `.opencode/PROJE-YAPISI.md`
- Teknoloji kararları: `.opencode/KARARLAR.md` (ADR-001…006)
- EmDash teknoloji envanteri: `.opencode/EMDASH-TEKNOLOJILERI.md`
- Eklenti sistemi: `.opencode/plugin-registery.md`
- EmDash analizi: `analiz/emdash.md` (kaynak + REA admin graph analizi)
- Kalite çıtası: `CONSTRAINTS.md`

> **Hedef:** EmDash admin panelindeki tüm modüller (Dashboard, Calendar,
> Pages, Posts, Media, Comments, Menus, Redirects, Widgets, Sections,
> Categories, Tags, Bylines, Content Types, Byline Schema, Users, Plugins,
> Import, Settings) Wuppy'de de çalışır olacak. Fark: içerik dosya + Git,
> Node.js birincil, Cloudflare opsiyonel, Better Auth/Bejamas/Nanostores/Lexical.

---

## 0. Durum özeti

| Alan | Durum | Not |
| --- | --- | --- |
| Çekirdek içerik + Git | ✅ Çalışıyor | Dosya, frontmatter, commit, diff, revert |
| API (Hono) | 🟡 Kısmi | İçerik, medya, Git, data, yorum, dashboard, takvim, arama, redirect, token, import |
| Auth | 🟡 Kısmi | Better Auth, roller, 2FA politikası, API token, magic link (yeni hesap açmaz, 2FA'ya gönderilmez) + e-posta parola sıfırlama, oturum yönetimi + admin parola/2FA sıfırlama, davet akışı, son admin koruması, site kimliğiyle ilk kurulum, passkey, bağlı hesap OAuth (GitHub/Google/Microsoft), güvenilir istemci IP'si |
| E-posta | 🟡 Kısmi | Console + Resend, magic-link template, parola sıfırlama ve davet e-postası; production domain/doğrulama sonra |
| Admin kabuğu | ✅ Çalışıyor | Sidebar grupları, topbar, tema, arama, shadcn Select, per-page + numaralı sayfalama; Media/Pages/Posts/Redirects/Widgets/Sections/Categories/Users iki panelli çalışma alanında |
| İçerik yönetimi | 🟡 Kısmi | Pages için iki panelli liste + önizleme/detay ve tablo görünümü, arama/durum filtresi/otomatik slug, editör/SEO/zamanlama, çöp + geri yükleme, toplu publish/delete, Git revizyon paneli, per-page sayfalama; autosave ve çakışma çözümü yok |
| Medya | 🟡 Kısmi | Üç panelli kütüphane, klasör, alt metin, kırpma/odak, kullanım takibi, sayfa bazlı filtre, toplu düzenleme, görsel optimizasyonu, istemci tarafı WebP dönüştürme; S3 adaptörü ve blurhash yok |
| Manage modülleri | 🟡 Kısmi | Comments, Menus, Redirects, Widgets, Sections, Taxonomies, Bylines CRUD |
| Admin modülleri | 🟡 Kısmi | Content Types, Byline Schema, Users+token, Plugins, Import, Settings, Themes |
| SEO / i18n / önizleme | 🟡 Kısmi | SEO çekirdek + panel, i18n tablo, dev preview; visual editing yok |
| Eklenti sistemi | 🟡 Kısmi | WASM sandbox + capability + yüklü/hata UI; SDK/registry/marketplace yok |
| Test / kabul | 🟡 Kısmi | 13 E2E, modül smoke, 356 core + 152 admin + 37 auth testi; görsel regresyon/a11y yok |
| Yayın / operasyon | 🟡 Kısmi | Build + dist smoke; CI, Docker, npm publish, docs sitesi yok |

**Öncelik dalgaları**

1. **Dalga 1 (P0):** Admin kabuğu + Dashboard, Pages/Posts, Settings, Users/davet, medya kütüphanesi.
2. **Dalga 2 (P1):** Comments, Menus, Redirects UI, Categories/Tags, Bylines, Content Types, Plugins UI, Import.
3. **Dalga 3 (P2):** Widgets, Sections, temalar, görsel düzenleme, çoklu site, AI.

### 0.0 Son güncelleme — 21 Ekim 2026

**Bu turda tamamlananlar**

- [x] Başlıktan otomatik slug: yeni içerikte başlık yazılırken `slugify` paketiyle güvenli slug üretilir (Türkçe karakter ve aksan normalizasyonu); kullanıcı slug'ı elle düzenlerse otomatik üretim durur; var olan slug `409 SLUG_TAKEN` ile korunur.
- [x] Güvenilir istemci IP'si: Astro `clientAddress` iç `x-wuppy-client-ip` başlığına yazılır; `WUPPY_TRUSTED_PROXIES` (IP/CIDR) ile ters proxy zinciri güvenilir sayılır; doğrudan bağlantıda spoof edilebilir `X-Forwarded-For` kullanılmaz. Better Auth'un "client IP belirlenemedi" uyarısı kalktı ve hız sınırı istemci bazlı çalışıyor.
- [x] 2FA politikası: parola girişi TOTP ister; magic link yeni hesap açamaz ve 2FA açık hesaplara gönderilmez; 2FA açılınca o hesabın bekleyen magic-link token'ları geçersiz olur; passkey ve bağlı OAuth sağlayıcıları güçlü alternatif olarak ek kod istemez.
- [x] Medya detay popup'ı shadcn sekmelerine taşındı: Details / Edit image / Used in sekmeleri klavye ile gezilebilir, ziyaret edilen paneller durumunu korur, kullanım listesi yükleniyor durumu gösterir ve eksik boyutlar önizleme görselinden tamamlanır. Yükleme sonrası otomatik açılmaz; kullanıcı kütüphanedeki dosyaya tıklayınca açılır.
- [x] Upload to Library yenilendi: dosyalar seçilir seçilmez yükleniyor; satır bazında durum, boyut, ilerleme, retry ve kaldırma; footer'da tamamlanma sayacı ve "Retry failed"; Done yalnızca kuyruğu kapatıp kütüphaneyi yeniliyor. E2E fixture artık starter'daki yerel yüklemeleri kopyalamıyor.
- [x] Admin select'leri Radix tabanlı shadcn Select'e geçirildi; boş değerler sentinel ile korunuyor, portal popup, klavye/ARIA desteği ve mevcut form çağrıları korunuyor.
- [x] Liste sayfalarına ortak alt bilgi eklendi: "Showing x-y of n", per-page seçimi ve numaralı sayfalama. İçerik, medya, yorumlar, kullanıcılar, çöp, güvenlik günlüğü ve redirects tablolarında çalışıyor.
- [x] Medya yüklemesi Git tarafından yok sayılan klasörlerde de tamamlanıyor; `public/uploads` veya `.wuppy/data` ignore edilse bile "Nothing to commit"/ignore kaynaklı Git hatası 500 üretmiyor. Starter'daki yerel yüklemeler kaynak deposuna commit edilmez, E2E fixture onları kopyalamaz.
- [x] Admin icon sprite'ı sürümlendi: `/icons.svg?v=<content-hash>`, `no-cache` + ETag ile sunuluyor; yeni eklenen ikonlar eski immutable cache yüzünden kaybolmuyor.
- [x] Menus ekranı yenilendi: shadcn Accordion tabanlı kaynak seçimi (Pages/Posts/Categories/Custom Links), native HTML5 drag-and-drop sıralama, alt menü yönetimi, klavye/erişilebilir kontroller, menü oluşturma/silme ve Manage Locations sekmesi. Menü yokken ayrı bir boş sayfa gösterilmez; editör kabuğu ve create linki doğrudan gelir.
- [x] Dark tema yüzeyleri standartlaştırıldı: `#09090b` ana zemin, `#101011` kart/paneller, `#171719` yüzen dialog/menü katmanı, `#1d1d20` kontroller; sidebar zemini şeffaf. Dashboard dış kabuğu `rounded-xl`, kartları 10px radius (`rounded-lg`) ile hizalandı.
- [x] Pages ekranı Media ile aynı iki panelli çalışma alanına taşındı: solda arama, All/Published/Drafts sekmeleri, sayfalama ve durum ikonlu liste; sağda başlık/meta, Edit/View/aksiyon menüsü, Status/Author/URL ve imzalı iframe önizleme. Aynı ekran Tablo görünümüne geçebiliyor; tablo ayarları tarih aralığı, per-page, sıralama, yazar/dil filtresi ve kolon seçimlerini içeriyor. Seçili sayfalarda alttaki toplu işlem çubuğu publish/draft, duplicate, delete ve clear sunuyor. Media ve Pages `WorkspaceLayout`, `WorkspaceSidebar` ve `WorkspacePanel` bileşenlerini paylaşıyor.
- [x] Liste/çalışma alanları Media ile hizalandı: **Posts** sayfaları aynı split/table içerik çalışma alanını kullanıyor; **Redirects** solda kural/404 listesi, sağda inline kural editörü ve import/export dialog’u; **Widgets** ve **Sections** solda arama + kayıt listesi, sağda inline alan editörü (`ResourceWorkspacePage`); **Categories & tags** solda terim ağacı, sağda terim editörü ve taxonomy ayarları; **Users** solda arama/durum filtreli hesap listesi, sağda rol/erişim detayı ve mevcut invitations/API token/rol matrisi kartları. Mevcut create, edit, delete, toplu işlem, import/export ve güvenlik akışları korunuyor.
- [x] Media Library tam genişlikte üç panelli görünüme taşındı: arama/filtre listesi, varyantlı büyük önizleme, inline metadata paneli, dosya URL'si, kullanım listesi ve aksiyonlar. **Convert Webp** istemci tarafında Canvas `toBlob()` ile dönüştürüp yeni WebP dosyası yükler. Sol kütüphane ve önizleme/detay alanı (#101011) aralarında boşluk olan iki ayrı rounded karttır. Dosya seçilmediğinde sağ panelde metin yerine ortada dropzone gösterilir; dar ekranlarda paneller alt alta, 1400px üzerinde üç sütun kullanılır. Sol panelde 32px boyutlu, 200px radius ile beyaz dairesel upload butonu ve eşit boyutlu, kenarlıksız, hover’da zemin değiştiren tek ikonlu grid/list geçişi (ikonlar 1em), placeholder’ı `text-sm` olan full-width/search alanı (arama ikonu 1em), seçimde alt ortada preview/edit/download/copy/delete/clear toolbar’ı ve çoklu seçimde ayrı “Bulk Edit Media” dialog’u, tür, sıralama (tarih/ad/boyut/tür), tarih aralığı, sayfa (Pages) bazlı kullanım filtresi ve “Unused Media Only” filtreleri bulunur; ayrıntılı filtre paneli varsayılan olarak kapalıdır ve WebP’nin sağındaki toggle ile açılır. Aktif tab/segment zemini global olarak `#2B2B2E`.
- [x] Admin fontu Inter yerine sistem stack'ine geçirildi: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif`.
- [x] Yuvarlatılmış kabuk için sidebar sağ ve topbar alt border'ları kaldırıldı; paneller kendi radius/kenarlıklarıyla ayrışıyor.
- [x] Scrollbar standardı: tüm scroll alanlarında ince, yuvarlak thumb; light `#a1a1aa4d`, dark `#52525b66`, track şeffaf. `html` ve `.custom-scrollbar` `scrollbar-gutter: stable` kullanır; dialog gövdeleri bu sınıfla kaydırılır. Form etiketleri `text-xs` (`--text-xs: 0.6em`), tamamı büyük harf, `text-zinc-400`; sidebar grup ve medya filtre başlıkları aynı stile hizalandı. Admin input/textarea zeminleri şeffaf; placeholder’lar `text-sm`.

**Doğrulama:** `pnpm check` → 356 core + 152 admin + 37 auth testi; `pnpm build` temiz; `pnpm test:e2e` → 13/13.

**Sıradaki işler (öncelik sırasıyla)**

1. **Resend production domain** — DNS/sender bilgisi bekliyor; domain doğrulanana kadar davet/magic-link/parola sıfırlama yalnız console veya hesap sahibi adresinde test edilebilir.
2. **Canlı OAuth E2E** — GitHub/Google/Microsoft istemci kimlik bilgileri bekliyor; mock callback/linking/yeni kayıt engeli kapsamı mevcut.
3. **İzinli e-posta alan adları (allowed domains)** — kalan güvenlik maddesi; davet ve kayıt akışına domain allowlist.
4. **İçerik listesi sayfalama** — cursor, sayfa boyutu ve URL'de filtre durumu.
5. **Editör taslak otomatik kaydetme ve çakışma yönetimi** — autosave, `409 CONFLICT` için birleştirme/üzerine yazma.
6. **Önizleme ve revizyon derinleştirme** — canlı taslak önizleme, editör içi çeviri paneli.

### 0.1 Bu turda tamamlanan modüller

- [x] EmDash sidebar bilgi mimarisi ve tüm modül rotaları
- [x] Dashboard: Draft/Media/User kartları, içerik sayaçları, Recent Activity, hızlı eylemler
- [x] Calendar: aylık görünüm, tarih aralığı API'si, taslak/zamanlanmış/yayında
- [x] Pages + Posts varsayılan koleksiyonları ve public rotalar
- [x] İçerik listesi: arama, durum filtresi, satır eylemleri, oluşturma
- [x] Editör: alanlar, Lexical gövde, SEO paneli, yayın/zamanlama, Git geçmişi
- [x] Medya kütüphanesi: grid, klasör, arama, alt metin/caption, silme
- [x] Comments: genel kutu, sekmeler, onay/spam/çöp, toplu işlem, public form
- [x] Menus, Widgets, Sections, Taxonomies, Bylines: Git destekli JSON CRUD
- [x] Redirects: kural CRUD + 404 log + admin UI
- [x] Content Types + Byline Schema admin UI
- [x] Users: liste, rol, disable/remove, API token oluşturma/iptal, oturum ve güvenlik yönetimi, son admin koruması
- [x] Plugins: yüklü/hatalı eklenti görünümü (fail-closed)
- [x] Import: JSON yedek + WordPress WXR (temel)
- [x] Settings: site, SEO, e-posta, medya, yorum ayarları
- [x] Themes: tema listesi/aktifleştirme (JSON)
- [x] Global tema: tek tık renk presetleri + light/dark/system
- [x] Global arama (başlık/gövde) ve topbar
- [x] API token (Bearer) kimlik doğrulaması
- [x] Magic link girişi (console/Resend e-posta adaptörü); yeni hesap açamaz, 2FA açık hesaplara gönderilmez
- [x] Oturum yönetimi: kendi cihazları, admin kullanıcı oturumları, tekli/toplu iptal
- [x] Hesap güvenliği: parola değiştirme, e-posta ile parola sıfırlama, admin geçici parola, 2FA sıfırlama
- [x] Davet akışı: e-posta daveti, kabul sayfası, tek kullanımlık 7 günlük token, admin listeleme/yeniden gönderme/iptal
- [x] Son admin koruması: son aktif admin'in rolü düşürülemez, banlanamaz veya silinemez
- [x] Setup: site adı/URL + ilk admin; site kimliği Settings'e kaydediliyor, `WUPPY_SECRET` env'dan doğrulanıyor
- [x] Güvenli içerik oluşturma: `POST` create + slug çakışmasında `409 SLUG_TAKEN`, mevcut içerik korunuyor
- [x] Başlıktan otomatik slug, manuel düzenleme ve çakışma koruması
- [x] Güvenilir istemci IP'si ve hız sınırı: Astro `clientAddress` + `WUPPY_TRUSTED_PROXIES`
- [x] 2FA politikası: parola TOTP ister; magic-link yeni hesap açamaz / 2FA'ya gönderilmez; passkey ve OAuth güçlü alternatif
- [x] Byline / taxonomy / reference alan tipleri ve editör seçicileri
- [x] Public kategori, etiket, yazar sayfaları + RSS + arama
- [x] Medya odak noktası (focal X/Y) ve kapak görseli
- [x] Yorum hız sınırı + honeypot
- [x] Çöp kutusu: sil → trash, geri yükle, kalıcı sil
- [x] Toplu publish / unpublish / delete
- [x] İçerik çoğaltma (duplicate)
- [x] Görsel düzenleme girişi ("Edit this page")
- [x] Plugin CLI: init / hash / validate
- [x] Plugin HTTP route'ları (`/api/plugins/:id/*`, manifest allowlist)
- [x] Plugin admin detayları: hook, capability, route, limit
- [x] Modül smoke E2E + comments public E2E + davet/kabul E2E

### 0.2 Analiz ve envanter (tamamlandı)

- [x] EmDash kaynak analizi → `analiz/emdash.md`
- [x] REA admin graph analizi (router/Shell/App) → `analiz/emdash.md`
- [x] Admin rota envanteri (49 rota) ve sidebar bilgi mimarisi
- [x] EmDash teknoloji envanteri → `.opencode/EMDASH-TEKNOLOJILERI.md`
- [x] Wuppy kararları (ADR-001…006) → `.opencode/KARARLAR.md`
- [x] Eklenti sistemi tasarımı → `.opencode/plugin-registery.md`

---

## 1. Admin kabuğu, dashboard ve bilgi mimarisi

### 1.1 Kabuk

- [x] Better Auth oturumu, giriş ekranı, oturum hatası durumu
- [x] Sol menü: **Dashboard, Calendar / Content: Pages, Posts + diğer koleksiyonlar / Media / Manage / Admin** grupları
- [ ] Üst çubuk: site adı/logo, **View Site**, **Edit/Preview** anahtarı, kullanıcı menüsü
- [ ] Kullanıcı menüsü: profil, hesap güvenliği, tema, çıkış
- [x] Aktif rota vurgusu, klavye ile gezinme, mobil açılır menü
- [x] Tüm select alanları Radix tabanlı shadcn Select; boş değer, klavye, ARIA ve portal popup desteği
- [x] Ortak liste alt bilgisi: Showing, Per page, sayfa numaraları, ilk/önceki/sonraki/son; ana liste sayfalarında etkin
- [ ] Sayfa başlığı + eylem düzeni (`PageHeader`: başlık, açıklama, sağ eylemler)
- [ ] Boş durum, yükleniyor, hata ve yetkisiz durum bileşenleri
- [x] Bildirim/toast katmanı (`ui` store)
- [x] Tema: light/dark/system, `light-dark()` token'ları
- [ ] Lingui ile tüm metinler + RTL (`dir`, mantıksal sınıflar)
- [ ] (kısmi) Ctrl/Cmd+K arama kutusuna odaklanır; sayfa/eylem komutları yok
- [ ] (kısmi) Başlık/gövde/frontmatter araması API'de (koleksiyon+durum filtreli); admin arayüzünde filtre yok

### 1.2 Dashboard (ekran görüntüsündeki ekran)

- [x] `/api/dashboard` ucu: sayaçlar + son etkinlik + koleksiyon özeti (yetkiye göre filtreli)
- [x] **Draft** kartı: yayınlanmamış/taslak içerik sayısı
- [x] **Media files** kartı: medya dosyası sayısı
- [x] **User** kartı: kullanıcı sayısı
- [x] **Content** kartı: her koleksiyon için yayında/taslak rozetleri (`7`, `1` gibi) ve tıklanınca filtreli liste
- [x] **Recent Activity**: son değişen içerikler; durum ikonu, başlık, koleksiyon, göreli zaman, profile bağlantı
- [x] Hızlı eylemler: **+ Page**, **+ Post**, **Upload Media** (koleksiyona göre)
- [x] Dashboard boş durumu: ilk sayfa/yazı oluşturma yönlendirmesi
- [ ] (kısmi) Sayaç doğruluğu testli; yetkiye göre gizleme ve boş durum testi yok

### 1.3 Calendar

- [x] `/api/calendar?from&to` ucu: `publishAt` ve `date` alanlarına göre içerikler
- [x] Aylık ve haftalık görünüm
- [x] Taslak/zamanlanmış/yayında renk kodu
- [x] Sürükle-bırak ile tarih değiştirme (yetki + Git commit)
- [x] Gün detayı: içerik listesi, hızlı düzenleme, yeni içerik
- [x] Saat dilimi ve locale biçimlendirmesi
- [x] Klavye erişilebilirliği ve boş ay durumu

### 1.4 Auth, onboarding ve oturum

- [x] İlk kullanıcı admin olur, sonrakiler viewer
- [x] Better Auth + `node:sqlite`, oturum, çıkış
- [x] Giriş denemesi hız sınırı (5/dk/istemci)
- [x] TOTP 2FA + yedek kodlar, hesap güvenliği sayfası; 2FA politikası: parola TOTP ister, magic-link 2FA açıkken kapalı, passkey/OAuth güçlü alternatif
- [x] Setup: site adı/URL + ilk admin, site kimliğini Settings'e kaydetme; `WUPPY_SECRET` env'dan doğrulanıyor
- [x] Setup demo içerik seçeneği: `posts` varsa `hello-world` örnek yazısı, aynı içerik API’si ve Git commit’i ile
- [x] Passkey (WebAuthn) kayıt/giriş: güvenlik sayfasında ekleme/listeleme/silme, giriş ekranında passkey ile giriş; `localhost` veya alan adı gerekir
- [x] OAuth sağlayıcıları (GitHub/Google/Microsoft): env ile yapılandırma, yalnız hesap güvenliğinden bağlanmış hesaplarla giriş; yeni OAuth kaydı kapalı (canlı sağlayıcı E2E’si kimlik bilgisiyle yapılmalı)
- [x] Davet akışı: e-posta, kabul sayfası, tek kullanımlık 7 günlük token, admin listeleme/yeniden gönderme/iptal
- [ ] Cihaz yetkilendirme akışı (CLI/login)
- [x] İlk kullanıcıdan sonra genel kayıt kapalı; yalnız eşleşen davet token'ı ile kayıt (doğrulandı + test)
- [x] Son admin koruması: son aktif admin'in rolü düşürülemez, banlanamaz veya silinemez
- [x] Oturum listesi, "tüm oturumları kapat" (kendi cihazlar + admin kullanıcı oturumları)
- [x] Oturum süresi politikası: `WUPPY_SESSION_DAYS` / `WUPPY_SESSION_UPDATE_HOURS` (varsayılan 7 gün, günlük yenileme)
- [x] Parola değiştirme + admin geçici parola; admin 2FA sıfırlama
- [x] Self-service "parolamı unuttum" e-posta akışı (30 dk token, oturumları kapatır)
- [x] Auth E2E: setup → giriş → 2FA → çıkış → davet → kabul (built + dev); passkey kayıt/giriş (built, `localhost`); OAuth bağlama/otomatik bağlanmama/yeni kayıt kapalı (mock sağlayıcı)

---

## 2. İçerik yönetimi

### 2.1 Koleksiyonlar ve listeler

- [x] Dosya tabanlı koleksiyon tanımı (Zod) ve `wuppy.config`
- [x] Genel içerik listesi, oluştur/sil
- [x] Pages ve Posts: Media ile ortak iki panelli `WorkspaceLayout`; arama, durum sekmeleri, sayfalama, split/table geçişi, tablo ayarları, imzalı iframe önizleme ve toplu işlemler
- [x] Redirects, Widgets, Sections, Categories & tags ve Users: Media benzeri sol liste + sağ detay/editor düzeni; mevcut CRUD, import/export ve güvenlik akışları korunuyor
- [x] Şemaya göre alan formu (`string|text|date|image|boolean|number|list`)
- [x] Starter'da **Pages** ve **Posts** koleksiyonları varsayılan gelsin
- [x] Liste: sunucu taraflı arama, durum/yazar/dil/tarih filtresi ve sıralama
- [x] Liste arayüzü API'yi kullanıyor (limit/cursor/q/status/sort/author/lang/from/to; "Load more")
- [x] Satır eylemleri: düzenle, çoğalt, çöpe taşı, geri al (Trash), kalıcı sil
- [x] Toplu işlem: seç, yayınla, taslağa al, sil; etiketleme yok
- [x] Durum rozetleri: taslak, zamanlanmış, yayında; arşiv yok
- [x] Yazar, dil, son güncelleme ve durum kolonları
- [x] Yayınlama: yayınla, yayından al, zamanla; zamanlamayı iptal publishAt temizliğiyle
- [x] İçerik kilidi: başka biri düzenliyorsa uyarı + kaydetme kapalı, "Edit anyway" ile devralma (tavsiye niteliğinde, süreç içi)
- [x] Silme güvenliği: çöp kutusu, geri alma, kalıcı silmede onay
- [ ] (kısmi) Liste boş/hata/yükleniyor durumları var; erişilebilirlik/klavye testi yok

### 2.2 Editör

- [x] Lexical tabanlı Markdown editörü, MDX/JSX koruma
- [x] Kaydet = Git commit
- [x] Slug çakışma kontrolü: yeni içerik `POST` ile oluşturulur, var olan slug `409 SLUG_TAKEN` döner; başlıktan otomatik slug ve manuel düzenleme
- [x] Başlıktan otomatik slug: yeni içerikte başlık yazılırken slug üretilir; kullanıcı slug’ı düzenlerse otomatik üretim durur, çakışma `409`/`SLUG_TAKEN` ile korunur
- [x] Kaydet, ayrı Publish/Unpublish düğmesi, Draft ve Publish at; otomatik kaydetme kurtarma kopyası olarak (ADR-007)
- [x] Kaydedilmemiş değişiklik: `beforeunload` + uygulama içi gezinme onayı + otomatik kurtarma
- [x] Çakışma: ETag/If-Match ile `409 CONFLICT` + sunucu sürümü; editörde "benimkini koru" / "onların sürümünü kullan" seçenekleri
- [x] Sağ panelde yayın durumu, tarih, yazar, SEO, dil ve taksonomi özeti
- [x] "View on site" + imzalı önizleme bağlantısı (taslak, 24 saat, noindex)
- [x] Revizyon geçmişi: commit listesi, diff ve geri yükleme (Git commit'lerinden)
- [x] Çeviri tablosu + editör içi "Translate to …" paneli
- [x] İçerik bileşenleri: izinli bileşen ekleme (Callout, Embed vb.)
- [ ] (kısmi) Medya: gövdeye kütüphaneden görsel, alt metin, caption (araç çubuğu); dosya eki yok
- [ ] (kısmi) Araç çubuğu: kalın/italik/kod, H2/H3, alıntı, listeler, kod bloğu, bağlantı; tablo yalnız Markdown metni (tablo düğümü yok)
- [ ] (kısmi) Ctrl/Cmd+S kaydeder, geri al/yinele Lexical varsayılanı; odak yönetimi denetlenmedi
- [ ] (kısmi) Etiketler ve `aria-live` kaydetme durumu var; tam klavye erişimi/axe denetimi yok
- [ ] (kısmi) Autosave, çakışma, kilit, kurtarma ve yayınlama testli (birim + e2e); bağlantı ve MDX koruma testleri önceden var, tablo/kod bloğu yok

### 2.3 Alan tipleri ve içerik modeli

- [x] `string, text, date, image, boolean, number, list`
- [x] `select`, `reference`, `repeater`, `blocks`, `richText`, `json` (repeater/blocks/json panelde JSON olarak düzenlenir)
- [ ] İlişki (reference) alanı: hedef koleksiyon, tekli/çoklu, ters ilişki
- [x] Repeater: alt alan şeması, min/max (sıralama JSON'da)
- [ ] (kısmi) Blok tipleri ve doğrulama var (discriminated union); Lexical node/renderer yok
- [x] Koşullu alan görünürlüğü (ör. `draft` ise `publishAt` gizle)
- [ ] (kısmi) Sunucuda Zod şeması var; istemci aynı şemayı paylaşmıyor, hata sunucudan gelir
- [x] Bilinmeyen frontmatter alanlarını koruma testi (var)
- [x] Tip üretimi: `wuppy types` → `wuppy-env.d.ts`

### 2.4 Revizyonlar ve geri alma

- [x] Git commit geçmişi, diff, revert
- [x] Editör içinde revizyon listesi ve "bu sürümü geri yükle" (HistoryPanel)
- [x] Sürümü şimdikiyle yan yana karşılaştırma (alan alan); iki keyfi revizyon arası yok
- [x] Satır bazlı diff + alan bazlı değişiklik özeti
- [x] Otomatik kaydetme revizyon değil kurtarma kopyası (ADR-007): kullanıcı revizyonlarıyla karışmaz
- [x] Saklama politikası: Git geçmişi budanmaz (ADR-007 kararı)

---

## 3. Medya

- [x] Güvenli yükleme: magic-byte, SVG reddi, 5 MB sınır, sunucu dosya adı
- [x] Görsel alanı yükleme + önizleme
- [x] Gövdeye görsel ekleme (alt metin sorarak)
- [x] Medya listesi API'si ve Git commit
- [x] Medya kütüphanesi: üç panelli görünüm, arama, klasör/tür/tarih/sayfa filtresi, sayfalama, toplu seçim, varyantlı önizleme
- [x] Klasörler: oluşturma, iç içe (3 seviye), yeniden adlandırma, silme (dosyalar klasörsüz kalır), taşıma
- [x] Seçici modal: tekli/çoklu seçim, yeni yükleme, arama
- [x] Alt metin, caption, başlık ve kredi alanı; ayrı “Bulk Edit Media” dialog’u ile toplu düzenleme
- [x] Odak noktası, en-boy oranı ön ayarları ve kırpılmış URL (`ar`/`fx`/`fy`)
- [x] Dosya değiştirme: aynı türde yerinde değiştirir, eski sürüm Git geçmişinde
- [x] Kullanım takibi: "nerelerde kullanılıyor" + silmeden önce uyarı (409 IN_USE, zorla silme onayı)
- [x] Medya detay popup'ı: shadcn sekmeleri (Details / Edit image / Used in), klavye gezinmesi, panel durumu koruma ve kullanım yükleniyor durumu; yalnızca kullanıcı dosyaya tıklayınca açılır
- [x] Görsel optimizasyonu: izinli genişliklerde WebP/AVIF/JPEG/PNG varyantları (`?w=&format=`, diskte önbellekli), LQIP + boyutlar yüklemede kaydedilir (`sharp`, isteğe bağlı bağımlılık); blurhash yok
- [x] **Convert Webp**: istemci tarafında native Canvas `toBlob("image/webp")` ile dönüştürme; GIF/WebP için devre dışı, dönüşen dosya ayrı medya olarak yüklenir
- [ ] Karanlık tema görsel varyantı (opsiyonel)
- [ ] Depolama adaptörü seçimi: local / S3 (R2 opsiyonel adaptörde)
- [ ] İmzalı yükleme URL'i ve doğrudan S3 yükleme
- [x] Upload to Library: sürükle-bırak, panodan yapıştırma, çoklu yükleme, anında başlatma, satır bazında ilerleme/iptal/retry, tamamlanma sayacı ve Done akışı; Git ignore edilen yükleme klasörlerinde de 500 üretmez
- [x] Yetim medya taraması ve temizleme aracı
- [x] Tür sahteciliği, boyut, yol aşımı ve kullanım kontrolü testleri

---

## 4. Manage modülleri

### 4.1 Comments (Yorumlar)

- [x] Yorum veri modeli (SQLite): içerik, yazar, gövde, durum, zaman, IP hash
- [x] Genel ayar: yorumlar açık/kapalı, moderasyon, kapalı içerik
- [x] Genel yorum kutusu: bekleyen/onaylı/spam/çöp sekmeleri, sayaçlar
- [x] Tek yorum: onayla, spam, çöp, sil, yanıtla (personel yanıtı hemen yayınlanır, yorumcuya e-posta gider)
- [x] Toplu işlem + sayfalama ("Load more", `limit`/`offset`)
- [ ] (kısmi) `/api/comments/entries` giriş başına bekleyen/onaylı sayı verir; içerik listesinde rozet yok
- [x] E-posta bildirimi: yeni yorum (`settings.comments.notifyEmail`) ve yanıt (yorumcuya)
- [x] Basit anti-spam: honeypot + hız sınırı
- [x] Public yorum API'si + CSRF/hız sınırı
- [x] Yorum testleri: moderasyon, yetki, spam

### 4.2 Menus (Menüler)

- [x] Menü modeli: ad, konum (header/footer/sidebar), öğeler, dil
- [x] Menü listesi, oluşturma, yeniden adlandırma ve silme; sayfa/post/kategori kaynaklarından seçerek ekleme
- [x] Menü öğeleri görsel düzenleyicide (açılır satır düzenleme, alt menü, taşıma, silme)
- [x] Native HTML5 drag-and-drop sıralama; alt menü/top level kontrolleri
- [x] Native shadcn Select ile konum ataması ve şablon tarafında `getMenu(name)` yardımcısı
- [x] Çeviri: aynı menünün dil varyantları
- [x] Bağlantı doğrulama: iç bağlantı, dış URL, `javascript:` reddi
- [x] Menü testleri: sıralama, drag-and-drop, iç içe yapı, menü oluşturma ve kaynak ekleme

### 4.3 Redirects (Yönlendirmeler)

- [x] Config'ten yönlendirme, döngü/yinelenen/açık yönlendirme reddi
- [x] Astro middleware ile 301/302 (e2e doğrulandı)
- [x] Admin CRUD: kaynak, hedef, kalıcı/geçici, not, aktif/pasif
- [x] 404 kayıtları: istenen yol, sayaç, son görülme, "yönlendirme oluştur"
- [x] Toplu içe/dışa aktarma (CSV/JSON)
- [x] Regex/joker kaynak desteği ve öncelik sırası (exact > en uzun wildcard > regex); güvensiz regex reddedilir
- [x] Test: döngü, zincir, sorgu parametresi koruma, 404 kaydı

### 4.4 Widgets (Widget alanları)

- [x] Widget alanı modeli: ad, konum, açıklama
- [x] Widget tipleri: metin, HTML (sanitize), menü, son içerikler, taksonomi, özel bileşen
- [x] Alan içinde widget ekleme, sıralama, düzenleme, silme
- [x] Dil, koleksiyon ve sayfa yoluna (`paths`, `/blog/*`) göre görünürlük
- [x] Şablon yardımcısı: `getWidgetArea(name)`
- [x] Widget testleri: dil/koleksiyon filtresi, sanitize (sıralama JSON'da)

### 4.5 Sections (Bölümler)

- [x] Yeniden kullanılabilir bölüm modeli: ad, slug, blok içeriği
- [x] Bölüm listesi + oluştur/düzenle/sil/çoğalt
- [ ] Lexical/blok editörü ile bölüm içeriği
- [x] Sayfada bölüm referansı ve sıralama
- [x] Kullanım takibi: hangi sayfalarda kullanılıyor
- [ ] (kısmi) Taslak bölüm `getSection` ile gizlenir; önizleme yok
- [ ] (kısmi) Bölüm testleri: referans, render, silme uyarısı

### 4.6 Categories / Tags (Taksonomiler)

- [x] `list` alan tipi (temel etiket desteği)
- [x] Taksonomi tanımı: ad, slug, hiyerarşik mi, koleksiyonlar
- [x] Kategori: ağaç yapısı, üst kategori, sıralama
- [x] Etiket: düz liste, birleştirme, yeniden adlandırma
- [x] Terim CRUD, açıklama, slug, sayaç
- [ ] (kısmi) İçerik editöründe atama (arama + yeni oluşturma)
- [x] Taksonomi arşiv rotaları (starter: kategori/etiket); `getTaxonomy()` yardımcısı
- [ ] (kısmi) Çeviri desteği
- [ ] (kısmi) Taksonomi testleri: sayaç, hiyerarşi, atama, arşiv

### 4.7 Bylines (Yazar profilleri)

- [x] Byline modeli: ad, slug, avatar, bio, e-posta (gizli), sosyal bağlantılar
- [x] Byline listesi + oluştur/düzenle/sil
- [x] İçerikte tekli/çoklu byline ataması ve kredi rolü (yazar, editör, fotoğraf)
- [x] Byline şeması: özel alanlar (ADR gerekli: config dosyası mı DB mi)
- [x] Public yazar sayfası (starter `/authors/[slug]`) ve `getByline()` yardımcısı
- [x] Çeviri/çok dilli byline
- [ ] (kısmi) Byline testleri: atama, kredi, public render

---

## 5. Admin modülleri

### 5.1 Content Types (İçerik tipleri)

- [x] Koleksiyon şeması (config, Zod) ve alan tipleri
- [x] Admin UI: koleksiyon listesi, oluştur/düzenle/sil
- [x] Alan editörü: tip seçimi, zorunlu, varsayılan, yardım metni, sıralama
- [ ] (kısmi) URL şablonu, dosya dizini, format (md/mdx), şablon eşlemesi
- [ ] (kısmi) İlişki tanımı: hedef koleksiyon, tekli/çoklu, ters alan
- [x] Şema önizleme ve tip üretimi
- [x] Değişiklik etkisi: mevcut içerik doğrulaması, alan silme uyarısı
- [x] Kaynak kararı: config dosyasına yazma vs ayrı `content-types/*.json` (ADR)
- [ ] (kısmi) Content Types testleri: CRUD, doğrulama, mevcut içerik uyumu

### 5.2 Byline Schema

- [x] Byline alan şeması CRUD (metin, görsel, URL, sosyal)
- [x] Alan sıralama ve zorunluluk
- [x] Mevcut byline'ların doğrulanması
- [x] Public profil şablonunda kullanım

### 5.3 Users (Kullanıcılar)

- [x] Kullanıcı listesi, rol atama, ilk kullanıcı admin
- [x] 2FA (TOTP + yedek kod) ve hesap güvenliği sayfası
- [x] Davet akışı: e-posta daveti, kabul sayfası, tek kullanımlık 7 günlük token, admin listeleme/yeniden gönderme/iptal
- [ ] (kısmi) Rol/izin matrisi (admin, editor, author, viewer) Users sayfasında; özel roller yok (Better Auth admin eklentisi rolleri sabit)
- [x] Kullanıcı oluştur/düzenle/disable/sil
- [x] Son admin koruması: son aktif admin'in rolü düşürülemez, banlanamaz veya silinemez
- [x] Oturum listesi ve "tüm oturumları kapat"
- [x] 2FA sıfırlama (admin) ve admin geçici parola; oturumları kapatır
- [x] Self-service parola sıfırlama (e-posta, 30 dk token, oturumları kapatır)
- [x] API token'ları: oluştur, kapsam, son kullanma, iptal
- [x] Allowed domains: davetler yalnızca izinli e-posta alan adlarına (`settings.security.allowedDomains`); kayıt zaten davete bağlı
- [x] Denetim: kullanıcı olayları, giriş/çıkış ve token olayları (`token.create`/`token.revoke`) kayıtlı
- [x] Kullanıcı testleri: yetki yükseltme engeli, son admin (davet/oturum/parola/2FA testleri var)

### 5.4 Plugins (Eklentiler)

- [x] Manifest (Zod), kesin host eşleşmesi, capability hash onayı
- [x] WASM/QuickJS sandbox, fail-closed, zaman/bellek sınırı
- [x] Egress proxy + log, olay köprüsü (content/media)
- [x] `wuppy plugin hash <dir>`
- [x] Admin: eklenti listesi, durum, sürüm, kaynak, yetenekler, son hata
- [x] Etkinleştir/devre dışı bırak, ayarlar formu (manifest `settings`), kaldır (registry'den kurulanlar)
- [x] Yetenek onay ekranı (düz dille izinler) ve yetki genişlerse yeniden onay (hash eşleşmesi, admin onayı `.wuppy/data/plugin-state.json`)
- [x] Eklenti logları, çağrı/hata/süre sayaçları, dakika başına kota görünürlüğü
- [x] Registry: arama, kurulum, güncelleme tespiti; çoklu registry, hatalı registry diğerlerini bozmaz
- [x] SDK: `wuppy-plugin build` beyan dışı yetenek kullanımında build'i düşürür; `pack`/`keygen`/`sign`
- [x] Eklenti route'ları (`/api/plugins/:id/*`) ve admin sayfaları (manifest `adminPages`, sunucuda sanitize edilir)
- [x] Yazma (`content.write`), e-posta (`email`, dakikada 10), secret (`secrets` → `WUPPY_PLUGIN_<ID>_<AD>`), dakika başı çağrı kotası
- [x] İmzalı paket: Ed25519 imza + sha256 sabitleme + kilit (`plugin-state`) + registry başına güven anahtarları (Sigstore yerine; bkz. ADR-008)
- [ ] (kısmi) Karar: yalnızca QuickJS-WASM sürücüsü (ADR-008); süreç tabanlı sürücü eşdeğer yalıtım sağlamadığı için yapılmadı
- [x] Eklenti testleri: yetki reddi, kota, bozuk eklenti izolasyonu, kurcalanmış dosya, imza/digest uyuşmazlığı

### 5.5 Import (İçe aktarma)

- [x] JSON yedek paketi içe/dışa aktarma, girdi bazlı hata raporu
- [x] WordPress WXR içe aktarma: yazı/sayfa, yazar→byline, kategori/etiket→taksonomi, menüler (`/api/import/wordpress/jobs`)
- [x] İçerik analizi: sayılar, çakışmalar, eksik alanlar, önizleme
- [x] URL yeniden yazma ve yönlendirme üretimi
- [x] Medya indirme + yeniden adlandırma + hata raporu
- [x] Aşamalı ilerleme, duraklat/devam, geri alma
- [ ] (kısmi) 50 MB üst sınır ve SSRF korumalı indirme var; dosya bellekte ayrıştırılıyor (akış yok)
- [x] Import testleri: fixture WXR, çakışma, kısmi hata, rollback

### 5.6 Settings (Ayarlar)

- [x] Genel: site adı, URL, logo/favicon, saat dilimi, varsayılan dil
- [x] SEO: varsayılan başlık/description, OG görseli, canonical, noindex
- [x] Sosyal: hesaplar, paylaşım görselleri
- [x] E-posta: console/Resend/SMTP sağlayıcı + gönderen + test e-postası + şablon yönetimi (ayarlar anında geçerli)
- [x] Medya: boyut limiti ve izinli türler ayarlardan uygulanır (yalnızca sıkılaştırır); klasörleme/optimizasyon ayrı maddelerde
- [x] Güvenlik: oturum süresi, CSRF/hız limitleri; istemci IP’si Astro `clientAddress` ve isteğe bağlı güvenilir ters proxy zincirinden çözülüyor
- [x] Güvenlik: 2FA politikası (parola TOTP ister; magic-link 2FA açıkken gönderilmez ve yeni hesap açamaz; passkey ve bağlı OAuth sağlayıcıları güçlü alternatif)
- [x] Güvenlik: allowed domains
- [x] API token'ları ve erişim kapsamları
- [x] Yedekleme: manuel yedek, zamanlama (`settings.backup`, yeniden başlatma gerekir), saklama sayısı, indirme
- [ ] (kısmi) İçerik dışa/içe aktarma ve yedekler var; ortamlar arası taşıma (medya dahil) yok
- [ ] Tema: aktif tema, özelleştirme, marketplace
- [ ] (kısmi) Webhook'lar ayar dosyasında (`/api/data/webhooks`, sırlar maskeli) var; Git dalı/commit mesajı biçimi/zamanlayıcı ayarı yok
- [x] Ayar değişiklikleri Git commit + audit kaydı
- [x] Ayar testleri: doğrulama, yetki, sır maskeleme

### 5.7 Themes (Temalar)

- [ ] Tema kayıt defteri: aktif tema, sürüm, kaynak
- [ ] Tema yükleme (zip/tar), doğrulama, önizleme
- [ ] Tema etkinleştirme ve geri alma (Git commit)
- [ ] Tema ayarları/özelleştirme (renk, tipografi, logo)
- [ ] Marketplace: listeleme, detay, ekran görüntüsü, kurulum
- [ ] Tema güncelleme ve uyumluluk kontrolü
- [ ] Tema güvenliği: yol aşımı, zararlı şablon, izinler

---

## 6. SEO, i18n, önizleme

### 6.1 SEO

- [x] Başlık, canonical, OG, Twitter, noindex, hreflang, HTML kaçışı
- [x] `sitemap.xml` (taslak hariç) ve `robots.txt`
- [x] İçerik editöründe SEO paneli ve önizleme
- [x] Site geneli SEO varsayılanları ve şablonları
- [x] Sosyal paylaşım önizlemesi
- [x] Sitemap ayarları: koleksiyon dahil/hariç, öncelik
- [x] Yapılandırılmış veri (JSON-LD) yardımcıları
- [x] SEO testleri: canonical, hreflang, sitemap, noindex

### 6.2 i18n

- [x] `locales`, `<dil>/<slug>` kuralı, eksik çeviri API'si ve admin tablosu
- [x] Çeviri tablosu ("Translate to …")
- [x] Dil eşleştirme grubu: slug kuralı (ADR-010; açık `translationOf` alanı yok) ve editörde çeviri bağlantıları
- [x] Eksik ve "Out of date" (kaynak dil sonradan değişti) çeviri göstergesi
- [x] Dil değiştirici ve fallback
- [x] Menü, widget, section (`locale`) ve byline (`translations`) için dil varyantı
- [ ] Lingui katalogları: eksik anahtar testi, RTL kontrolü
- [x] Çok dilli URL ve hreflang testleri

### 6.3 Önizleme ve görsel düzenleme

- [x] `astro dev` taslakları gösterir, yayında gizli + noindex
- [x] "View on site" bağlantısı (temel)
- [x] Taslak önizleme: imzalı, süreli, tek içeriğe özel bağlantı (oturum gerekmez); starter'da uygulandı
- [ ] Cihaz önizlemesi (masaüstü/tablet/mobil)
- [ ] **Edit/Preview** anahtarı ve sayfa üzerinde düzenleme (visual editing)
- [ ] Düzenleme modunda alan vurgulama, tıklayınca panele gitme
- [ ] (kısmi) Token imzası/süre/içerik bağı testli; noindex ve sayfa düzeyi testi yok

### 6.4 Public site özellikleri (şablonlar)

- [x] RSS akışı (`/rss.xml`; Atom yok)
- [x] Arama sayfası (`/search`, istemci tarafı, yayınlanmış yazılar)
- [x] Kategori/etiket arşiv rotaları
- [x] Yazar/byline profil sayfası
- [x] Sayfalama, okuma süresi, ilgili yazılar (`wuppy/site`: `paginate`, `readingTime`, `related`)
- [x] 404 sayfası (404 durum kodlu, arama/ana sayfa bağlantılı)
- [ ] (kısmi) `prefers-color-scheme` ile koyu tema var; tema token sistemi yok
- [x] Erişilebilir skip-link, odak stilleri, semantik başlıklar
- [x] Sosyal paylaşım meta etiketleri (SEO ile ortak)

---

## 7. API ve platform

### 7.1 API

- [x] İçerik CRUD, medya, Git geçmiş/diff/revert, export/import, audit
- [x] Tek hata biçimi, Zod doğrulama, CSRF, izin kontrolü
- [ ] (kısmi) İçerik listesi API'sinde cursor/filtre/sıralama var; diğer listelerde yok
- [x] `/api/dashboard`, `/api/calendar`, `/api/search` uçları
- [x] Comments, menus, widgets, sections, taxonomies, bylines, settings API'leri
- [ ] (kısmi) Git geçmişi: `/api/history`, diff ve revert var; ayrı revizyon liste/detay API yok
- [ ] Relations/references API'si
- [x] API token kimlik doğrulaması (Bearer) ve kapsamlar
- [x] OpenAPI 3.1 şeması (`/api/openapi.json`, route'lardan üretilir) + `AppType` ile Hono `hc` istemcisi
- [x] Idempotency-Key, ETag/If-None-Match, rate limit
- [x] Hata kodu kataloğu (`ERROR_CODES`, OpenAPI'de enum); i18n eşlemesi istemcide
- [x] API sözleşme testleri (OpenAPI doğrulama)

### 7.2 Arama

- [x] Dosya tabanlı arama: başlık + gövde + frontmatter
- [x] SQLite FTS5 indeksi (bellekte, dosyalardan kurulur; `SearchIndex`) — kalıcı DB adaptörü gerekmedi
- [x] Yazma sonrası (`version` sayacı) ve 60 sn'de bir yeniden indeksleme
- [ ] (kısmi) Admin kutusu vurgulu sonuç gösteriyor; koleksiyon/durum filtresi yalnızca API'de (`/api/search?collection&status`)
- [x] Public site araması (starter `/search`, istemci tarafı)

### 7.3 Önbellek ve performans

- [x] Public sayfa ETag/route cache ve commit'te invalidation
- [x] Sorgu sayısı bütçesi ve performans testi
- [x] Büyük koleksiyon (10k+) liste/sayfalama testi
- [x] Medya optimizasyonu ve CDN-friendly URL'ler (sabit, `immutable` önbellekli varyant URL'leri; `imageSrcset()` yardımcısı)

### 7.4 E-posta ve bildirim

- [x] E-posta adaptörü: console, Resend ve SMTP (nodemailer; `SMTP_PASSWORD` ortam değişkeni)
- [x] Şablonlar: davet/parola sıfırlama/magic link site ayarlarından düzenlenir (`{{değişken}}`); Resend hosted template yine desteklenir; yorum bildirimi sabit metin
- [x] Magic-link güvenliği: yeni hesap açmaz, 2FA açık hesaplara gönderilmez, 2FA açılınca bekleyen token'lar iptal edilir
- [ ] Panel içi bildirim merkezi
- [ ] (kısmi) Şablon değişkenleri, kaçışlama, SMTP ayarları ve hata yolu testli; domain doğrulama testi yok (Resend DNS bekliyor)

#### 7.4.1 Resend production domain — **sonra yapılacak**

- [ ] Domain seçimi ve Resend'de oluşturma (öneri: `mail.<domain>`)
- [ ] DNS kayıtlarını ekleme (SPF/DKIM/DMARC) ve domain doğrulama
- [ ] Domain kısıtlı `sending_access` API key oluşturup `RESEND_API_KEY` ile değiştirme
- [ ] Settings → Email `from` alanını `Wuppy <noreply@mail.<domain>>` yapma
- [ ] Magic link, parola sıfırlama ve davet e-postalarını gerçek adrese test etme

Mevcut test durumu: `Wuppy <onboarding@resend.dev>` ile admin kullanıcısının adresine magic link gönderildi; Resend durumu `delivered`. Aynı gönderici parola sıfırlama ve davet e-postalarında da kullanılıyor. `onboarding@resend.dev` yalnızca hesap sahibine gönderim yaptığı için production'da kullanılmamalı.

Not: Mevcut `RESEND_API_KEY` sending-only, ancak henüz domain kısıtı yok. Domain doğrulanınca domain kısıtlı anahtarla değiştirilecek. Domain doğrulanana kadar davet e-postaları yalnızca console sağlayıcısında veya hesap sahibinin adresine test edilebilir.

İlgili ayarlar: `RESEND_MAGIC_LINK_TEMPLATE` (`Wuppy Magic Link`, ID `7979a32e-432b-4866-b92f-9c99fd7d46bb`), `templates/starter/.env`, Settings → Email.

### 7.5 MCP ve AI (P2)

- [ ] MCP sunucusu: içerik okuma/yazma, arama, taslak oluşturma
- [ ] AI taslak/SEO/çeviri önerisi (opt-in, sağlayıcı adaptörü)
- [ ] AI çıktısı doğrulama ve kullanıcı onayı
- [ ] Maliyet/kota görünürlüğü

---

## 8. Eklenti sistemi ve registry

`plugin-registery.md` yol haritasına göre:

- [x] Plugin ABI + capability manifest + WASM sürücüsü + fail-closed
- [x] SDK + build-time kontrol + `wuppy-plugin init/build/pack`
- [x] İmzalı paketler (Ed25519) + kilit + statik indeks registry
- [ ] (kısmi) Çoklu registry ve güven anahtarları var; küratör/güvenlik taraması yok
- [ ] İkinci sürücü (workerd/süreç) + conformance test paketi
- [ ] Ücretli eklentiler ve lisanslama (opsiyon)
- [x] Admin eklenti yönetimi ve registry arayüzü
- [ ] Eklenti dokümantasyonu ve örnek şablon deposu

---

## 9. Şablonlar ve kurulum

- [x] `templates/starter` iskeleti + `create-wuppy`
- [x] Astro Content Collections uyumu (`glob` loader)
- [x] Starter'da Pages + Posts + menü + SEO + sitemap + 404 + RSS + arama
- [ ] `blog`, `marketing`, `portfolio`, `blank` şablonları
- [ ] `-cloudflare` varyantları (opsiyonel)
- [ ] 15 dakikalık kurulum doğrulaması (ölçüm + doküman)
- [ ] `create-wuppy`: ortam doğrulama, `.env` sırrı, monorepo sürüm çözümü (var), boş olmayan hedef reddi (var)
- [x] `wuppy doctor`: config, sır, içerik dizini, Git (dosya izin kontrolü yok)
- [x] `wuppy upgrade`: sürüm yükseltme ve migration rehberi
- [ ] Tema oluşturma rehberi ve örnek tema

---

## 10. Test, güvenlik ve kalite

### 10.1 Test

- [x] İlk kabul yolculuğu gerçek Chromium'da
- [x] Playwright fixture (temiz starter kopyası)
- [x] Birim/entegrasyon: gerçek fs, Git, SQLite
- [ ] Dashboard, Calendar, Media, Comments, Menus, Redirects, Widgets, Sections, Taxonomies, Bylines, Content Types, Users, Plugins, Import, Settings için E2E
- [ ] Admin bileşen testleri (Vitest browser mode)
- [ ] Görsel regresyon: LTR + RTL, mobil + masaüstü
- [ ] Erişilebilirlik: axe, klavye, odak tuzağı, renk kontrastı
- [ ] (kısmi) 10k içerik liste/sayfalama/arama/dashboard testli (`tests/perf`); medya kütüphanesi için yok
- [ ] Tip testleri (`*.test-d.ts`) ve şema sözleşmeleri
- [ ] Kapsam eşiği ve değişen satır kapsamı

### 10.2 Güvenlik

- [x] CSRF başlığı, yol aşımı, magic-byte, SVG reddi, 2FA, hız sınırı
- [x] İçerik bileşen allowlist, script/iframe/javascript reddi
- [x] Eklenti sandbox + egress + capability onayı
- [x] Mimari sınır testi (core Cloudflare import edemez)
- [x] SSRF koruması: `assertPublicUrl`/`fetchPublic` (özel adres, şema, kimlik bilgisi, boyut sınırı); webhook'larda uygulanıyor
- [ ] (kısmi) Allowlist sanitizer + 15 saldırı vektörü testi; widget HTML'i render'da uygulanıyor, yorum/diğer alanlarda henüz yok
- [x] Yetki matrisi testi: her uç tek izne bağlı, her rol × her uç (`permission-matrix.test.ts`)
- [x] Tüm yazma isteklerinde kullanıcı başına limit + giriş limiti; ters proxy IP'si `WUPPY_TRUSTED_PROXIES` ile; oturum süresi/yenileme `WUPPY_SESSION_*`
- [x] Ters proxy arkasında güvenilir istemci IP'si (Better Auth `trustedProxies`/`ipAddressHeaders`)
- [ ] (kısmi) `redact()` hata ve webhook loglarına uygulandı; audit kapsamı denetlenmedi
- [x] Bağımlılık güvenlik taraması (`pnpm audit`) CI'da
- [x] Geri yükleme tatbikatı otomatik testte: yedek → boş site → aynı içerik (`backups.test.ts`)

### 10.3 Kalite

- [x] `pnpm check` tüm modüllerde yeşil
- [x] `knip` kullanılmayan dosya/bağımlılık yok
- [x] `publint`/`attw` paket doğrulaması
- [ ] Docs: her modül için kullanıcı rehberi + API referansı
- [x] Kod yorumları/commit mesajı politikası (CONSTRAINTS)

---

## 11. Yayın ve operasyon

- [x] tsdown build, `smoke:dist`, workspace kaynak kullanımı
- [ ] Resend production domain + DNS doğrulama (domain sonra; bkz. 7.4.1)
- [x] Auth için elle yazılmış `.d.ts` veya taşınabilir tip stratejisi
- [x] Admin `dist`'in core paketine dahil edilmesi (prepack)
- [x] `create-wuppy` şablonunu paketleme
- [ ] (kısmi) `npm publish --dry-run` ve gerçek yayın provası
- [x] CI: lint + typecheck + test + build + e2e + audit
- [x] Docker imajı ve compose (Node standalone)
- [ ] Dokümantasyon sitesi (Starlight) ve arama
- [x] CHANGELOG/Changesets
- [x] Yükseltme rehberi ve geri alma
- [ ] Telemetri (opt-in, gizlilik dostu)

---

## 12. P2 ve farklılaşma

- [ ] Birden fazla siteyi tek panelden yönetme
- [ ] AI destekli taslak/SEO/çeviri
- [ ] Görsel diff (yan yana frontmatter + gövde)
- [ ] Tema marketplace
- [ ] Eklenti/registry ticarileşmesi ve lisanslama
- [ ] x402 / ödeme entegrasyonu (opsiyon)
- [ ] AT Protocol / federasyon (opsiyon, kapsam dışı)
- [ ] Gelişmiş analitik/raporlama
- [ ] Yorum anti-spam servisleri
- [ ] Çoklu ortam (staging/production) yönetimi

---

## 13. EmDash admin parity matrisi

| Ekran / özellik | Wuppy durumu | Not |
| --- | --- | --- |
| Dashboard sayaçları (Draft, Media, User) | ✅ | Canlı API |
| Dashboard Content sayaçları + rozetler | ✅ | Koleksiyon bazlı |
| Recent Activity | ✅ | Son 12 değişiklik |
| + Page / + Post / Upload Media | ✅ | Koleksiyon başına |
| View Site / Edit-Preview / kullanıcı | ✅ | Topbar |
| Calendar | ✅ | Aylık görünüm |
| Pages | ✅ | Starter koleksiyonu + public rota |
| Posts | ✅ | Starter koleksiyonu + public rota |
| Media kütüphanesi | ✅ | Grid, klasör, alt metin, silme |
| Comments | ✅ | Moderasyon + public form |
| Menus | ✅ | Görsel builder, native drag-and-drop, kaynak seçimi, konum yönetimi + header render |
| Redirects UI | ✅ | Kural + 404 log |
| Widgets | ✅ | JSON CRUD |
| Sections | ✅ | JSON CRUD |
| Categories | ✅ | JSON CRUD |
| Tags | ✅ | JSON CRUD |
| Bylines | ✅ | JSON CRUD |
| Content Types UI | ✅ | JSON; restart sonrası etkin |
| Byline Schema | ✅ | JSON CRUD |
| Users | ✅ | Rol, disable, remove, API token |
| Plugins UI / registry | 🟡 | Yüklü/hata görünümü var; registry/SDK yok |
| Import (WordPress) | 🟡 | WXR temel; medya/rollback yok |
| Settings | ✅ | Site/SEO/e-posta/medya/yorum |
| Tema marketplace | 🟡 | Tema CRUD var; marketplace yok |
| Arama / komut paleti | 🟡 | Global arama var; Cmd+K paleti yok |
| i18n / RTL | 🟡 | Çeviri tablosu var; RTL testi yok |
| SEO / sitemap / robots | ✅ | Çekirdek + editör paneli |
| Preview / visual editing | 🟡 | Dev preview; görsel düzenleme yok |
| Çoklu site / AI | ❌ | P2 |

---

## 14. Tamamlanma tanımı (her modül için)

Bir modül ancak şunlarla "bitti" sayılır:

1. API + Zod şeması + izin kontrolü + CSRF.
2. Admin ekranı: yükleme/boş/hata durumları, mobil, klavye, RTL.
3. Git commit ve audit kaydı (durum değiştiren işlemlerde).
4. En az bir entegrasyon testi + bir E2E senaryosu.
5. Erişilebilirlik kontrolü (axe/klavye).
6. Dokümantasyon: kullanıcı rehberi + API referansı.
7. `pnpm check` ve `pnpm build` yeşil.
8. `CONSTRAINTS.md` zayıflatılmamış.
