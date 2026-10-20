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
| Admin kabuğu | ✅ Çalışıyor | Sidebar grupları, topbar, tema, arama, tüm modül rotaları |
| İçerik yönetimi | 🟡 Kısmi | Liste/arama/durum filtresi/otomatik slug, editör/SEO/zamanlama, çöp + geri yükleme, toplu publish/delete, Git revizyon paneli; cursor sayfalama, autosave ve çakışma çözümü yok |
| Medya | 🟡 Kısmi | Kütüphane, klasör, alt metin, silme; kırpma/odak/kullanım/optimizasyon yok |
| Manage modülleri | 🟡 Kısmi | Comments, Menus, Redirects, Widgets, Sections, Taxonomies, Bylines CRUD |
| Admin modülleri | 🟡 Kısmi | Content Types, Byline Schema, Users+token, Plugins, Import, Settings, Themes |
| SEO / i18n / önizleme | 🟡 Kısmi | SEO çekirdek + panel, i18n tablo, dev preview; visual editing yok |
| Eklenti sistemi | 🟡 Kısmi | WASM sandbox + capability + yüklü/hata UI; SDK/registry/marketplace yok |
| Test / kabul | 🟡 Kısmi | 10 E2E, modül smoke, 151 core + 59 admin + 37 auth testi; görsel regresyon/a11y yok |
| Yayın / operasyon | 🟡 Kısmi | Build + dist smoke; CI, Docker, npm publish, docs sitesi yok |

**Öncelik dalgaları**

1. **Dalga 1 (P0):** Admin kabuğu + Dashboard, Pages/Posts, Settings, Users/davet, medya kütüphanesi.
2. **Dalga 2 (P1):** Comments, Menus, Redirects UI, Categories/Tags, Bylines, Content Types, Plugins UI, Import.
3. **Dalga 3 (P2):** Widgets, Sections, temalar, görsel düzenleme, çoklu site, AI.

### 0.0 Son güncelleme — 20 Ekim 2026

**Bu turda tamamlananlar**

- [x] Başlıktan otomatik slug: yeni içerikte başlık yazılırken güvenli slug üretilir (Türkçe karakter ve aksan normalizasyonu); kullanıcı slug'ı elle düzenlerse otomatik üretim durur; var olan slug `409 SLUG_TAKEN` ile korunur.
- [x] Güvenilir istemci IP'si: Astro `clientAddress` iç `x-wuppy-client-ip` başlığına yazılır; `WUPPY_TRUSTED_PROXIES` (IP/CIDR) ile ters proxy zinciri güvenilir sayılır; doğrudan bağlantıda spoof edilebilir `X-Forwarded-For` kullanılmaz. Better Auth'un "client IP belirlenemedi" uyarısı kalktı ve hız sınırı istemci bazlı çalışıyor.
- [x] 2FA politikası: parola girişi TOTP ister; magic link yeni hesap açamaz ve 2FA açık hesaplara gönderilmez; 2FA açılınca o hesabın bekleyen magic-link token'ları geçersiz olur; passkey ve bağlı OAuth sağlayıcıları güçlü alternatif olarak ek kod istemez.

**Doğrulama:** `pnpm check` → 151 core + 59 admin + 37 auth testi; `pnpm build` temiz; `pnpm test:e2e` → 10/10.

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
- [ ] Sol menü: **Dashboard, Calendar / Content: Pages, Posts + diğer koleksiyonlar / Media / Manage / Admin** grupları
- [ ] Üst çubuk: site adı/logo, **View Site**, **Edit/Preview** anahtarı, kullanıcı menüsü
- [ ] Kullanıcı menüsü: profil, hesap güvenliği, tema, çıkış
- [ ] Aktif rota vurgusu, klavye ile gezinme, mobil açılır menü
- [ ] Sayfa başlığı + eylem düzeni (`PageHeader`: başlık, açıklama, sağ eylemler)
- [ ] Boş durum, yükleniyor, hata ve yetkisiz durum bileşenleri
- [ ] Bildirim/toast katmanı (`ui` store)
- [ ] Tema: light/dark/system, `light-dark()` token'ları
- [ ] Lingui ile tüm metinler + RTL (`dir`, mantıksal sınıflar)
- [ ] Komut paleti (Cmd/Ctrl+K): sayfalar, içerik arama, hızlı eylemler
- [ ] Genel arama: başlık/gövde, koleksiyon ve durum filtresi

### 1.2 Dashboard (ekran görüntüsündeki ekran)

- [ ] `/api/dashboard` ucu: sayaçlar + son etkinlik + koleksiyon özeti (yetkiye göre filtreli)
- [ ] **Draft** kartı: yayınlanmamış/taslak içerik sayısı
- [ ] **Media files** kartı: medya dosyası sayısı
- [ ] **User** kartı: kullanıcı sayısı
- [ ] **Content** kartı: her koleksiyon için yayında/taslak rozetleri (`7`, `1` gibi) ve tıklanınca filtreli liste
- [ ] **Recent Activity**: son değişen içerikler; durum ikonu, başlık, koleksiyon, göreli zaman, profile bağlantı
- [ ] Hızlı eylemler: **+ Page**, **+ Post**, **Upload Media** (koleksiyona göre)
- [ ] Dashboard boş durumu: ilk sayfa/yazı oluşturma yönlendirmesi
- [ ] Dashboard testleri: sayaç doğruluğu, yetkiye göre gizleme, boş durum

### 1.3 Calendar

- [ ] `/api/calendar?from&to` ucu: `publishAt` ve `date` alanlarına göre içerikler
- [ ] Aylık/haftalık görünüm, gün hücresinde içerik kartları
- [ ] Taslak/zamanlanmış/yayında renk kodu
- [ ] Sürükle-bırak ile tarih değiştirme (yetki + Git commit)
- [ ] Gün detayı: içerik listesi, hızlı düzenleme, yeni içerik
- [ ] Saat dilimi ve locale biçimlendirmesi
- [ ] Klavye erişilebilirliği ve boş ay durumu

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
- [x] Şemaya göre alan formu (`string|text|date|image|boolean|number|list`)
- [x] Starter'da **Pages** ve **Posts** koleksiyonları varsayılan gelsin
- [ ] (kısmi) Liste: başlık/slug arama ve durum filtresi var; yazar/dil/tarih filtresi ve sıralama yok
- [ ] Sayfalama (cursor), sayfa boyutu seçimi ve URL'de filtre durumu
- [x] Satır eylemleri: düzenle, çoğalt, çöpe taşı, geri al (Trash), kalıcı sil
- [x] Toplu işlem: seç, yayınla, taslağa al, sil; etiketleme yok
- [x] Durum rozetleri: taslak, zamanlanmış, yayında; arşiv yok
- [ ] (kısmi) Yazar/byline, dil, son güncelleme ve durum kolonları: başlık/slug/durum/değişim zamanı var; yazar/dil yok
- [x] Yayınlama: yayınla, yayından al, zamanla; zamanlamayı iptal publishAt temizliğiyle
- [ ] İçerik kilidi: aynı girdiyi iki kişi açarsa uyarı + salt-okunur
- [x] Silme güvenliği: çöp kutusu, geri alma, kalıcı silmede onay
- [ ] (kısmi) Liste boş/hata/yükleniyor durumları var; erişilebilirlik/klavye testi yok

### 2.2 Editör

- [x] Lexical tabanlı Markdown editörü, MDX/JSX koruma
- [x] Kaydet = Git commit
- [x] Slug çakışma kontrolü: yeni içerik `POST` ile oluşturulur, var olan slug `409 SLUG_TAKEN` döner; başlıktan otomatik slug ve manuel düzenleme
- [x] Başlıktan otomatik slug: yeni içerikte başlık yazılırken slug üretilir; kullanıcı slug’ı düzenlerse otomatik üretim durur, çakışma `409`/`SLUG_TAKEN` ile korunur
- [ ] (kısmi) Kaydet + Draft/Publish at var; ayrı Publish butonu ve taslak otomatik kaydetme yok
- [ ] (kısmi) Tarayıcı `beforeunload` uyarısı var; uygulama içi onay ve otomatik kurtarma yok
- [ ] Çakışma: `409 CONFLICT`, sunucu sürümünü göster, birleştirme/üzerine yazma seçenekleri
- [ ] (kısmi) Sağ panelde yayın durumu, tarih, yazar ve SEO var; dil/taksonomi özeti yok
- [ ] (kısmi) "View on site" var; canlı taslak önizleme yok
- [x] Revizyon geçmişi: commit listesi, diff ve geri yükleme (Git commit'lerinden)
- [ ] (kısmi) Çeviri tablosu var; editör içi "Translate to …" paneli yok
- [ ] İçerik bileşenleri: izinli bileşen ekleme (Callout, Embed vb.)
- [ ] Medya: gövdeye görsel/ dosya ekleme, alt metin, caption
- [ ] Tablo, listeler, kod bloğu, bağlantı, alıntı, başlık seviyeleri
- [ ] Klavye kısayolları, geri al/yinele, odak yönetimi
- [ ] Erişilebilirlik: etiketler, aria-live kaydetme bildirimi, klavye ile tam kullanım
- [ ] Editör testleri: autosave, çakışma, görsel, bağlantı, MDX koruma

### 2.3 Alan tipleri ve içerik modeli

- [x] `string, text, date, image, boolean, number, list`
- [ ] `select`, `reference`, `repeater`, `blocks`, `richText`, `json`
- [ ] İlişki (reference) alanı: hedef koleksiyon, tekli/çoklu, ters ilişki
- [ ] Repeater: alt alan şeması, sıralama, min/max
- [ ] Blok alanı: blok tipleri, Lexical node, renderer
- [ ] Koşullu alan görünürlüğü (ör. `draft` ise `publishAt` gizle)
- [ ] Alan doğrulama mesajları ve sunucu-istemci aynı Zod şeması
- [ ] Bilinmeyen frontmatter alanlarını koruma testi (var)
- [ ] İçerik şeması değişince tip üretimi (`wuppy-env.d.ts` / `ContentEntry` tipleri)

### 2.4 Revizyonlar ve geri alma

- [x] Git commit geçmişi, diff, revert
- [x] Editör içinde revizyon listesi ve "bu sürümü geri yükle" (HistoryPanel)
- [ ] İki revizyonu yan yana karşılaştırma (frontmatter + gövde)
- [ ] (kısmi) Satır bazlı diff var; alan bazlı değişiklik özeti yok
- [ ] Otomatik kaydetme revizyonlarını kullanıcı revizyonlarından ayırma
- [ ] Revizyon saklama politikası (config)

---

## 3. Medya

- [x] Güvenli yükleme: magic-byte, SVG reddi, 5 MB sınır, sunucu dosya adı
- [x] Görsel alanı yükleme + önizleme
- [x] Gövdeye görsel ekleme (alt metin sorarak)
- [x] Medya listesi API'si ve Git commit
- [ ] (kısmi) Medya kütüphanesi: grid + arama + klasör filtresi var; tür/tarih filtresi ve sayfalama yok
- [ ] (kısmi) Klasör oluşturma ve klasör atama var; yeniden adlandırma, silme, taşıma ve iç içe klasör yok
- [ ] Seçici modal: tekli/çoklu seçim, yeni yükleme, arama
- [ ] (kısmi) Alt metin ve caption var; kredi alanı ve toplu düzenleme yok
- [ ] (kısmi) Odak noktası var; kırpma ve en-boy oranı ön ayarları yok
- [ ] Dosya değiştirme (replace) ve eski sürümü koruma
- [ ] Kullanım takibi: "nerelerde kullanılıyor", silmeden önce uyarı
- [ ] Görsel optimizasyonu: responsive boyutlar, WebP/AVIF, blurhash/LQIP
- [ ] Karanlık tema görsel varyantı (opsiyonel)
- [ ] Depolama adaptörü seçimi: local / S3 (R2 opsiyonel adaptörde)
- [ ] İmzalı yükleme URL'i ve doğrudan S3 yükleme
- [ ] Sürükle-bırak, panodan yapıştırma, çoklu yükleme, ilerleme/iptal
- [ ] Yetim medya taraması ve temizleme aracı
- [ ] (kısmi) Tür sahteciliği, boyut ve yol aşımı testleri var; kullanım kontrolü testi yok

---

## 4. Manage modülleri

### 4.1 Comments (Yorumlar)

- [x] Yorum veri modeli (SQLite): içerik, yazar, gövde, durum, zaman, IP hash
- [x] Genel ayar: yorumlar açık/kapalı, moderasyon, kapalı içerik
- [x] Genel yorum kutusu: bekleyen/onaylı/spam/çöp sekmeleri, sayaçlar
- [ ] (kısmi) Tek yorum: onayla, spam, çöp, sil var; yanıtla yok
- [ ] (kısmi) Toplu işlem var; sayfalama yok
- [ ] İçerik bazlı yorum sayısı ve hızlı erişim
- [ ] E-posta bildirimi (yeni yorum, yanıt) — e-posta adaptörüne bağlı
- [x] Basit anti-spam: honeypot + hız sınırı
- [x] Public yorum API'si + CSRF/hız sınırı
- [x] Yorum testleri: moderasyon, yetki, spam

### 4.2 Menus (Menüler)

- [ ] Menü modeli: ad, konum (header/footer/sidebar), öğeler, dil
- [ ] Menü listesi: oluştur, yeniden adlandır, sil, varsayılan
- [ ] Menü düzenleyici: içerik bağlantısı, özel URL, etiket, hedef
- [ ] Sürükle-bırak sıralama ve iç içe alt menü
- [ ] Konum ataması ve şablon tarafında `getMenu(name)` yardımcısı
- [ ] Çeviri: aynı menünün dil varyantları
- [ ] Bağlantı doğrulama: iç bağlantı, dış URL, `javascript:` reddi
- [ ] Menü testleri: sıralama, iç içe yapı, render, çeviri

### 4.3 Redirects (Yönlendirmeler)

- [x] Config'ten yönlendirme, döngü/yinelenen/açık yönlendirme reddi
- [x] Astro middleware ile 301/302 (e2e doğrulandı)
- [ ] Admin CRUD: kaynak, hedef, kalıcı/geçici, not, aktif/pasif
- [ ] 404 kayıtları: istenen yol, sayaç, son görülme, "yönlendirme oluştur"
- [ ] Toplu içe/dışa aktarma (CSV/JSON)
- [ ] Regex/joker kaynak desteği ve öncelik sırası
- [ ] Test: döngü, zincir, sorgu parametresi koruma, 404 kaydı

### 4.4 Widgets (Widget alanları)

- [ ] Widget alanı modeli: ad, konum, açıklama
- [ ] Widget tipleri: metin, HTML (sanitize), menü, son içerikler, taksonomi, özel bileşen
- [ ] Alan içinde widget ekleme, sıralama, düzenleme, silme
- [ ] Görünürlük: dil, içerik türü, sayfa koşulu
- [ ] Şablon yardımcısı: `getWidgetArea(name)`
- [ ] Widget testleri: sıralama, sanitize, render, dil

### 4.5 Sections (Bölümler)

- [ ] Yeniden kullanılabilir bölüm modeli: ad, slug, blok içeriği
- [ ] Bölüm listesi + oluştur/düzenle/sil/çoğalt
- [ ] Lexical/blok editörü ile bölüm içeriği
- [ ] Sayfada bölüm referansı ve sıralama
- [ ] Kullanım takibi: hangi sayfalarda kullanılıyor
- [ ] Önizleme ve yayın durumu
- [ ] Bölüm testleri: referans, render, silme uyarısı

### 4.6 Categories / Tags (Taksonomiler)

- [x] `list` alan tipi (temel etiket desteği)
- [ ] Taksonomi tanımı: ad, slug, hiyerarşik mi, koleksiyonlar
- [ ] Kategori: ağaç yapısı, üst kategori, sıralama
- [ ] Etiket: düz liste, birleştirme, yeniden adlandırma
- [ ] Terim CRUD, açıklama, slug, sayaç
- [ ] İçerik editöründe atama (arama + yeni oluşturma)
- [ ] Taksonomi arşiv rotaları ve şablon yardımcısı
- [ ] Çeviri desteği
- [ ] Taksonomi testleri: sayaç, hiyerarşi, atama, arşiv

### 4.7 Bylines (Yazar profilleri)

- [ ] Byline modeli: ad, slug, avatar, bio, e-posta (gizli), sosyal bağlantılar
- [ ] Byline listesi + oluştur/düzenle/sil
- [ ] İçerikte tekli/çoklu byline ataması ve kredi rolü (yazar, editör, fotoğraf)
- [ ] Byline şeması: özel alanlar (ADR gerekli: config dosyası mı DB mi)
- [ ] Public yazar sayfası ve `getByline()` yardımcısı
- [ ] Çeviri/çok dilli byline
- [ ] Byline testleri: atama, kredi, public render

---

## 5. Admin modülleri

### 5.1 Content Types (İçerik tipleri)

- [x] Koleksiyon şeması (config, Zod) ve alan tipleri
- [ ] Admin UI: koleksiyon listesi, oluştur/düzenle/sil
- [ ] Alan editörü: tip seçimi, zorunlu, varsayılan, yardım metni, sıralama
- [ ] URL şablonu, dosya dizini, format (md/mdx), şablon eşlemesi
- [ ] İlişki tanımı: hedef koleksiyon, tekli/çoklu, ters alan
- [ ] Şema önizleme ve tip üretimi
- [ ] Değişiklik etkisi: mevcut içerik doğrulaması, alan silme uyarısı
- [ ] Kaynak kararı: config dosyasına yazma vs ayrı `content-types/*.json` (ADR)
- [ ] Content Types testleri: CRUD, doğrulama, mevcut içerik uyumu

### 5.2 Byline Schema

- [ ] Byline alan şeması CRUD (metin, görsel, URL, sosyal)
- [ ] Alan sıralama ve zorunluluk
- [ ] Mevcut byline'ların doğrulanması
- [ ] Public profil şablonunda kullanım

### 5.3 Users (Kullanıcılar)

- [x] Kullanıcı listesi, rol atama, ilk kullanıcı admin
- [x] 2FA (TOTP + yedek kod) ve hesap güvenliği sayfası
- [x] Davet akışı: e-posta daveti, kabul sayfası, tek kullanımlık 7 günlük token, admin listeleme/yeniden gönderme/iptal
- [ ] Rol/izin matrisi: admin, editor, author, viewer + özel roller
- [x] Kullanıcı oluştur/düzenle/disable/sil
- [x] Son admin koruması: son aktif admin'in rolü düşürülemez, banlanamaz veya silinemez
- [x] Oturum listesi ve "tüm oturumları kapat"
- [x] 2FA sıfırlama (admin) ve admin geçici parola; oturumları kapatır
- [x] Self-service parola sıfırlama (e-posta, 30 dk token, oturumları kapatır)
- [ ] API token'ları: oluştur, kapsam, son kullanma, iptal
- [ ] Allowed domains / e-posta alan adı kısıtı
- [ ] Denetim: kullanıcı olayları (var), giriş/çıkış (var), token olayları
- [x] Kullanıcı testleri: yetki yükseltme engeli, son admin (davet/oturum/parola/2FA testleri var)

### 5.4 Plugins (Eklentiler)

- [x] Manifest (Zod), kesin host eşleşmesi, capability hash onayı
- [x] WASM/QuickJS sandbox, fail-closed, zaman/bellek sınırı
- [x] Egress proxy + log, olay köprüsü (content/media)
- [x] `wuppy plugin hash <dir>`
- [ ] Admin: yüklü eklenti listesi, durum, sürüm, yetenekler, son hata
- [ ] Etkinleştir/devre dışı bırak, ayarlar sayfası, kaldır
- [ ] Yetenek onay ekranı ve yetki genişlerse yeniden onay
- [ ] Eklenti logları ve kullanım/kota görünürlüğü
- [ ] Registry/marketplace: arama, detay, kurulum, güncelleme
- [ ] SDK: `definePlugin`, build-time manifest, beyan dışı yetenekte build hatası
- [ ] Eklenti route'ları (`/plugins/:id`) ve admin yüzeyleri
- [ ] Yazma yetenekleri, e-posta, secret referansı, CPU/çağrı kotası
- [ ] İmzalı paket (Sigstore), kilit dosyası, çoklu güven kökü
- [ ] İkinci sürücü (workerd/süreç) + conformance testleri
- [ ] Eklenti testleri: sandbox kaçışı, yetki reddi, bozuk eklenti izolasyonu

### 5.5 Import (İçe aktarma)

- [x] JSON yedek paketi içe/dışa aktarma, girdi bazlı hata raporu
- [ ] WordPress WXR: yazı, sayfa, medya, kategori/etiket, yazar, menü
- [ ] İçerik analizi: sayılar, çakışmalar, eksik alanlar, önizleme
- [ ] URL yeniden yazma ve yönlendirme üretimi
- [ ] Medya indirme + yeniden adlandırma + hata raporu
- [ ] Aşamalı ilerleme, duraklat/devam, geri alma
- [ ] Büyük dosya streaming ve bellek sınırı (SSRF korumalı)
- [ ] Import testleri: fixture WXR, çakışma, kısmi hata, rollback

### 5.6 Settings (Ayarlar)

- [ ] Genel: site adı, URL, logo/favicon, saat dilimi, varsayılan dil
- [ ] SEO: varsayılan başlık/description, OG görseli, canonical, noindex
- [ ] Sosyal: hesaplar, paylaşım görselleri
- [ ] (kısmi) E-posta: console/Resend sağlayıcı + gönderen; SMTP, test e-postası ve şablon yönetimi eksik
- [ ] Medya: boyut limiti, izinli türler, klasörleme, optimizasyon
- [x] Güvenlik: oturum süresi, CSRF/hız limitleri; istemci IP’si Astro `clientAddress` ve isteğe bağlı güvenilir ters proxy zincirinden çözülüyor
- [x] Güvenlik: 2FA politikası (parola TOTP ister; magic-link 2FA açıkken gönderilmez ve yeni hesap açamaz; passkey ve bağlı OAuth sağlayıcıları güçlü alternatif)
- [ ] Güvenlik: allowed domains
- [ ] API token'ları ve erişim kapsamları
- [ ] Yedekleme: manuel yedek, zamanlama, saklama, indirme
- [ ] Transfer: site dışa/içe aktarma, ortamlar arası taşıma
- [ ] Tema: aktif tema, özelleştirme, marketplace
- [ ] Gelişmiş: Git dalı, commit mesajı biçimi, webhook'lar, scheduler
- [ ] Ayar değişiklikleri Git commit + audit kaydı
- [ ] Ayar testleri: doğrulama, yetki, sır maskeleme

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
- [ ] İçerik editöründe SEO paneli ve önizleme
- [ ] Site geneli SEO varsayılanları ve şablonları
- [ ] Sosyal paylaşım önizlemesi
- [ ] Sitemap ayarları: koleksiyon dahil/hariç, öncelik
- [ ] Yapılandırılmış veri (JSON-LD) yardımcıları
- [ ] SEO testleri: canonical, hreflang, sitemap, noindex

### 6.2 i18n

- [x] `locales`, `<dil>/<slug>` kuralı, eksik çeviri API'si ve admin tablosu
- [x] Çeviri tablosu ("Translate to …")
- [ ] Dil eşleştirme grubu (`translationOf`) ve editörde bağlantı
- [ ] Eksik/güncel olmayan çeviri göstergesi (kaynak değişti mi?)
- [ ] Dil değiştirici ve fallback
- [ ] Menü/widget/section/byline çevirileri
- [ ] Lingui katalogları: eksik anahtar testi, RTL kontrolü
- [ ] Çok dilli URL ve hreflang testleri

### 6.3 Önizleme ve görsel düzenleme

- [x] `astro dev` taslakları gösterir, yayında gizli + noindex
- [x] "View on site" bağlantısı (temel)
- [ ] Yayınlanmış sitede oturumlu taslak önizleme (token)
- [ ] Cihaz önizlemesi (masaüstü/tablet/mobil)
- [ ] **Edit/Preview** anahtarı ve sayfa üzerinde düzenleme (visual editing)
- [ ] Düzenleme modunda alan vurgulama, tıklayınca panele gitme
- [ ] Önizleme testleri: taslak görünürlüğü, yetki, noindex

### 6.4 Public site özellikleri (şablonlar)

- [ ] RSS/Atom akışı
- [ ] Arama sayfası ve sonuç bileşeni
- [ ] Kategori/etiket arşiv rotaları
- [ ] Yazar/byline profil sayfası
- [ ] Sayfalama, okuma süresi, ilgili içerikler
- [ ] 404 sayfası ve yönlendirme önerisi
- [ ] Dark mode ve tema token'ları
- [ ] Erişilebilir skip-link, odak stilleri, semantik başlıklar
- [ ] Sosyal paylaşım meta etiketleri (SEO ile ortak)

---

## 7. API ve platform

### 7.1 API

- [x] İçerik CRUD, medya, Git geçmiş/diff/revert, export/import, audit
- [x] Tek hata biçimi, Zod doğrulama, CSRF, izin kontrolü
- [ ] Sayfalama/`nextCursor`, filtre, sıralama tüm listelerde
- [ ] `/api/dashboard`, `/api/calendar`, `/api/search` uçları
- [ ] Comments, menus, widgets, sections, taxonomies, bylines, settings API'leri
- [ ] Revisions API'si (liste, detay, geri yükle)
- [ ] Relations/references API'si
- [ ] API token kimlik doğrulaması (Bearer) ve kapsamlar
- [ ] OpenAPI 3.1 şeması + typed client (`hc`/generated)
- [ ] Idempotency-Key, ETag/If-None-Match, rate limit
- [ ] Hata kodu kataloğu ve i18n eşlemesi
- [ ] API sözleşme testleri (OpenAPI doğrulama)

### 7.2 Arama

- [ ] Dosya tabanlı arama: başlık + gövde + frontmatter
- [ ] SQLite FTS5 indeksi (opsiyonel DB adaptörü) ve fallback tarama
- [ ] Commit sonrası indeks güncelleme / tam yeniden indeksleme
- [ ] Admin arama, filtreler, sonuç vurgulama
- [ ] Public site arama bileşeni (opsiyonel)

### 7.3 Önbellek ve performans

- [ ] Public sayfa ETag/route cache ve commit'te invalidation
- [ ] Sorgu sayısı bütçesi ve performans testi
- [ ] Büyük koleksiyon (10k+) liste/sayfalama testi
- [ ] Medya optimizasyonu ve CDN-friendly URL'ler

### 7.4 E-posta ve bildirim

- [ ] (kısmi) E-posta adaptörü: console + Resend; SMTP yok
- [ ] (kısmi) Şablonlar: magic link Resend template; parola sıfırlama/davet inline e-posta; yorum bildirimi yok
- [x] Magic-link güvenliği: yeni hesap açmaz, 2FA açık hesaplara gönderilmez, 2FA açılınca bekleyen token'lar iptal edilir
- [ ] Panel içi bildirim merkezi
- [ ] E-posta testleri: şablon değişkenleri, hata yolları, domain doğrulama

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
- [ ] SDK + build-time manifest + yerel geliştirme ortamı
- [ ] İmzalı paketler (Sigstore) + kilit dosyası + statik indeks registry
- [ ] Çoklu registry + küratör/güvenlik taraması
- [ ] İkinci sürücü (workerd/süreç) + conformance test paketi
- [ ] Ücretli eklentiler ve lisanslama (opsiyon)
- [ ] Admin eklenti yönetimi (5.4) ve registry/marketplace UI
- [ ] Eklenti dokümantasyonu ve örnek şablon deposu

---

## 9. Şablonlar ve kurulum

- [x] `templates/starter` iskeleti + `create-wuppy`
- [x] Astro Content Collections uyumu (`glob` loader)
- [ ] Starter'da Pages + Posts + menü + SEO + sitemap + 404 tam örnek
- [ ] `blog`, `marketing`, `portfolio`, `blank` şablonları
- [ ] `-cloudflare` varyantları (opsiyonel)
- [ ] 15 dakikalık kurulum doğrulaması (ölçüm + doküman)
- [ ] `create-wuppy`: ortam doğrulama, `.env` sırrı, monorepo sürüm çözümü (var), boş olmayan hedef reddi (var)
- [ ] `wuppy doctor`: config, sır, içerik dizini, Git, izin kontrolü
- [ ] `wuppy upgrade`: sürüm yükseltme ve migration rehberi
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
- [ ] Performans: 10k içerik, medya kütüphanesi, dashboard
- [ ] Tip testleri (`*.test-d.ts`) ve şema sözleşmeleri
- [ ] Kapsam eşiği ve değişen satır kapsamı

### 10.2 Güvenlik

- [x] CSRF başlığı, yol aşımı, magic-byte, SVG reddi, 2FA, hız sınırı
- [x] İçerik bileşen allowlist, script/iframe/javascript reddi
- [x] Eklenti sandbox + egress + capability onayı
- [x] Mimari sınır testi (core Cloudflare import edemez)
- [ ] SSRF koruması (import/medya/webhook) ve testleri
- [ ] XSS/HTML sanitize testleri (tüm zengin metin alanları)
- [ ] Yetki matrisi testleri (her rol × her uç)
- [ ] Rate limit tüm hassas uçlarda, oturum sabitleme/rotasyon
- [ ] Ters proxy arkasında güvenilir istemci IP'si (Better Auth `trustedProxies`/`ipAddressHeaders`)
- [ ] Sırların loglarda maskelenmesi, audit kapsamı
- [ ] Bağımlılık güvenlik taraması (`pnpm audit`) CI'da
- [ ] Yedek/geri yükleme tatbikatı

### 10.3 Kalite

- [ ] `pnpm check` tüm modüllerde yeşil
- [ ] `knip` kullanılmayan dosya/bağımlılık yok
- [ ] `publint`/`attw` paket doğrulaması
- [ ] Docs: her modül için kullanıcı rehberi + API referansı
- [ ] Kod yorumları/commit mesajı politikası (CONSTRAINTS)

---

## 11. Yayın ve operasyon

- [x] tsdown build, `smoke:dist`, workspace kaynak kullanımı
- [ ] Resend production domain + DNS doğrulama (domain sonra; bkz. 7.4.1)
- [ ] Auth için elle yazılmış `.d.ts` veya taşınabilir tip stratejisi
- [ ] Admin `dist`'in core paketine dahil edilmesi (prepack)
- [ ] `create-wuppy` şablonunu paketleme
- [ ] `npm publish --dry-run` ve gerçek yayın provası
- [ ] CI: lint + typecheck + test + build + e2e + audit
- [ ] Docker imajı ve compose (Node standalone)
- [ ] Dokümantasyon sitesi (Starlight) ve arama
- [ ] CHANGELOG/Changesets
- [ ] Yükseltme rehberi ve geri alma
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
| Menus | ✅ | JSON CRUD + header render |
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
